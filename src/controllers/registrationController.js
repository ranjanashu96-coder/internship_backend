import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import axios from "axios";
import crypto from "crypto";
import { Op } from "sequelize";
import {
  Domain,
  CollegeDomainFee,
  Payment,
  Student,
  College,
} from "../models/index.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import {
  AppError,
  ok,
} from "../utils/response.js";

import {
  hashPassword,
} from "../utils/security.js";

import {
  notify,
} from "../services/notificationService.js";

import {
  getCashfreeBaseUrl,
  getCashfreeHeaders,
  verifyCashfreeWebhookSignature,
} from "../config/cashfree.js";

const normalizeMobileNumber = (
  value,
) => {
  const digits = String(
    value || "",
  ).replace(/\D/g, "");

  if (digits.length >= 10) {
    return digits.slice(-10);
  }

  return "";
};

const createCashfreeOrderId = (
  studentId,
) => {
  const randomValue =
    crypto
      .randomBytes(4)
      .toString("hex");

  return `RKN_${studentId}_${Date.now()}_${randomValue}`;
};


const getActivePaymentGateway = () => {
  const gateway = String(
    process.env.PAYMENT_GATEWAY ||
      "cashfree",
  )
    .trim()
    .toLowerCase();

  if (
    ![
      "cashfree",
      "razorpay",
    ].includes(gateway)
  ) {
    throw new AppError(
      `Unsupported payment gateway: ${gateway}`,
      500,
    );
  }

  return gateway;
};

const getRazorpayCredentials = () => {
  const keyId = String(
    process.env.RAZORPAY_KEY_ID ||
      "",
  ).trim();

  const keySecret = String(
    process.env
      .RAZORPAY_KEY_SECRET ||
      "",
  ).trim();

  if (!keyId || !keySecret) {
    throw new AppError(
      "Razorpay credentials are not configured",
      500,
    );
  }

  return {
    keyId,
    keySecret,
  };
};

const getRazorpayAuth = () => {
  const {
    keyId,
    keySecret,
  } =
    getRazorpayCredentials();

  return {
    username: keyId,
    password: keySecret,
  };
};

const createRazorpayReceiptId = (
  studentId,
) =>
  `RKN_${studentId}_${Date.now()}`;

const createPortalRegistrationNumber = (
  student,
) => {
  let year =
    new Date().getFullYear();

  if (student.registration_date) {
    const registrationDate =
      new Date(
        `${student.registration_date}T00:00:00`,
      );

    if (
      !Number.isNaN(
        registrationDate.getTime(),
      )
    ) {
      year =
        registrationDate.getFullYear();
    }
  }

  const serial =
    String(
      student.id,
    ).padStart(
      6,
      "0",
    );

  return `RKN-${year}-${serial}`;
};

const parseJsonObject = (value) => {
  if (!value) {
    return {};
  }

  if (
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed;
    }

    return {};
  } catch {
    return {};
  }
};

const queuePaymentSuccessNotification =
  async (paymentId) => {
    const notificationTransaction =
      await Payment.sequelize.transaction();

    try {
      const payment =
        await Payment.findByPk(
          paymentId,
          {
            transaction:
              notificationTransaction,

            lock:
              notificationTransaction
                .LOCK
                .UPDATE,
          },
        );

      if (
        !payment ||
        payment.status !==
          "success"
      ) {
        await notificationTransaction
          .commit();

        return;
      }

      const gatewayPayload =
        parseJsonObject(
          payment.gateway_payload,
        );

      /*
       * Verify API aur webhook dono payment
       * process kar sakte hain. Ye flag duplicate
       * notification aur email ko rokega.
       */
      if (
        gatewayPayload
          .payment_success_notification_queued_at
      ) {
        await notificationTransaction
          .commit();

        return;
      }

      const student =
        await Student.findByPk(
          payment.student_id,
          {
            transaction:
              notificationTransaction,
          },
        );

      if (!student) {
        throw new Error(
          "Student not found for payment notification",
        );
      }

      const amount =
        Number(
          payment.amount ||
            0,
        );

      const formattedAmount =
        new Intl.NumberFormat(
          "en-IN",
          {
            style:
              "currency",

            currency:
              payment.currency ||
              "INR",
          },
        ).format(amount);

      await notify({
        recipientType:
          "student",

        recipientId:
          student.id,

        type:
          "payment_success",

        title:
          "Payment Successful",

        message:
          `Your internship registration payment of ${formattedAmount} has been received successfully. Your transaction ID is ${payment.transaction_id}.`,

        actionUrl:
          "/student/downloads",

        metadata: {
          payment_id:
            payment.id,

          transaction_id:
            payment.transaction_id,

          gateway:
            payment.gateway ||
            "cashfree",

          order_id:
            payment.razorpay_order_id ||
            payment.cashfree_order_id ||
            payment.order_id ||
            null,

          payment_id:
            payment.razorpay_payment_id ||
            payment.cf_payment_id ||
            null,

          cashfree_order_id:
            payment.cashfree_order_id ||
            null,

          razorpay_order_id:
            payment.razorpay_order_id ||
            null,

          amount,

          currency:
            payment.currency ||
            "INR",
        },

        email:
          student.email,

        recipientName:
          student.name,

        sendEmail:
          Boolean(
            student.email,
          ),

        emailSubject:
          "RK Nexora Payment Successful",

        transaction:
          notificationTransaction,
      });

      await payment.update(
        {
          gateway_payload: {
            ...gatewayPayload,

            payment_success_notification_queued_at:
              new Date()
                .toISOString(),
          },
        },
        {
          transaction:
            notificationTransaction,
        },
      );

      await notificationTransaction
        .commit();

      console.log(
        `✅ Payment notification queued for student ${student.id}`,
      );
    } catch (error) {
      if (
        !notificationTransaction
          .finished
      ) {
        await notificationTransaction
          .rollback();
      }

      /*
       * Notification fail hone par payment
       * success response fail nahi hoga.
       */
      console.error(
        "PAYMENT SUCCESS NOTIFICATION ERROR:",
        error,
      );
    }
  };

const getStudentDocuments = (student) => {
  const academics = parseJsonObject(
    student.academics_json,
  );

  const savedDocuments =
    academics.documents &&
    typeof academics.documents === "object" &&
    !Array.isArray(academics.documents)
      ? academics.documents
      : {};

  return {
    photo:
      savedDocuments.photo ||
      student.photo ||
      null,

    identity_document:
      savedDocuments.identity_document ||
      null,

  };
};

const areDocumentsComplete = (documents) =>
  Boolean(
    documents.photo &&
      documents.identity_document 
  );

const getStudentResponseData = (
  student,
  documents,
) => ({
  id: student.id,
  student_id: student.id,

  registration_number:
    student.registration_number,

  portal_registration_number:
  student.portal_registration_number ||
  createPortalRegistrationNumber(
    student,
  ),

  name:
    student.name,

  father_name:
    student.father_name,

  gender:
    student.gender,

  dob:
    student.dob,

  email:
    student.email,

  mobile:
    student.mobile,

  college_id:
    student.college_id,

  programme:
    student.programme,

  major_subject:
    student.major_subject,

  session:
    student.session,

  semester:
    student.semester,

  domain_id:
    student.domain_id,

  username:
    student.username ||
    student.registration_number,

  photo:
    documents.photo,

  documents,

  internship_status:
    student.internship_status,

  payment_status:
    student.payment_status,

  registration_locked:
    Boolean(
      student.registration_locked,
    ),
});

export const verifyRegistration =
  asyncHandler(async (req, res) => {
    const registrationNumber = String(
      req.body.registration_number || "",
    ).trim();

    if (!registrationNumber) {
      throw new AppError(
        "Registration number is required",
        422,
      );
    }

    const student =
      await Student.findOne({
        where: {
          registration_number:
            registrationNumber,
        },
      });

    if (!student) {
      throw new AppError(
        "Registration number not found. Contact your college.",
        404,
      );
    }

    const documents =
      getStudentDocuments(student);

    const documentsCompleted =
      areDocumentsComplete(documents);

    const responseData =
      getStudentResponseData(
        student,
        documents,
      );

    if (
      student.internship_status ===
      "blocked"
    ) {
      throw new AppError(
        "This registration is blocked. Contact your college.",
        403,
      );
    }

    if (
      student.payment_status === "paid"
    ) {
      return ok(
        res,
        {
          ...responseData,
          registration_locked: true,
          next_step: "login",
        },
        "Registration and payment are already completed. Please login.",
      );
    }

    if (
      student.registration_locked &&
      student.payment_status ===
        "pending"
    ) {
      return ok(
        res,
        {
          ...responseData,
          registration_locked: true,
          next_step: "payment",
        },
        "Registration is locked. Continue to payment.",
      );
    }

    if (
      student.internship_status ===
        "registered" &&
      !documentsCompleted
    ) {
      return ok(
        res,
        {
          ...responseData,
          registration_locked: false,
          next_step: "documents",
        },
        "Registration details are saved. Complete the document upload.",
      );
    }

    if (
      student.internship_status ===
        "registered" &&
      documentsCompleted
    ) {
      return ok(
        res,
        {
          ...responseData,
          registration_locked: false,
          next_step: "review",
        },
        "Review your registration before proceeding to payment.",
      );
    }

    return ok(
      res,
      {
        ...responseData,
        registration_locked: false,
        next_step: "details",
      },
      "Registration verified. Complete your details.",
    );
  });

export const listRegistrationDomains =
  asyncHandler(async (req, res) => {
    const registrationNumber = String(
      req.query.registration_number ||
        "",
    ).trim();

    const studentId = Number(
      req.query.student_id ||
        req.user?.student_id ||
        req.user?.id ||
        0,
    );

    let student = null;

    if (registrationNumber) {
      student = await Student.findOne({
        where: {
          registration_number:
            registrationNumber,
        },
        attributes: [
          "id",
          "college_id",
        ],
      });
    } else if (studentId) {
      student = await Student.findByPk(
        studentId,
        {
          attributes: [
            "id",
            "college_id",
          ],
        },
      );
    }

    if (
      (registrationNumber ||
        studentId) &&
      !student
    ) {
      throw new AppError(
        "Student not found",
        404,
      );
    }

    const domains =
      await Domain.findAll({
        order: [
          ["domain_name", "ASC"],
        ],
      });

    const collegeId =
      student?.college_id
        ? Number(
            student.college_id,
          )
        : null;

    const customFees =
      collegeId
        ? await CollegeDomainFee.findAll({
            where: {
              college_id:
                collegeId,

              status:
                "active",
            },

            attributes: [
              "domain_id",
              "fee",
            ],

            raw: true,
          })
        : [];

    const feeMap =
      new Map(
        customFees.map(
          (item) => [
            Number(
              item.domain_id,
            ),

            Number(
              item.fee,
            ),
          ],
        ),
      );

    const items =
      domains.map(
        (domain) => {
          const domainData =
            domain.toJSON();

          const customFee =
            feeMap.get(
              Number(
                domain.id,
              ),
            );

          const defaultFee =
            Number(
              domain.fee ||
                0,
            );

          return {
            ...domainData,

            default_fee:
              defaultFee,

            custom_fee:
              customFee ??
              null,

            fee:
              customFee ??
              defaultFee,

            fee_source:
              customFee !==
              undefined
                ? "college"
                : "default",
          };
        },
      );

    return ok(
      res,
      items,
      "Registration domains retrieved",
    );
  });

export const saveRegistration = asyncHandler(
  async (req, res) => {
    const {
      registration_number,
      father_name,
      gender,
      dob,
      programme,
      major_subject,
      session,
      semester,
      mobile,
      email,
      domain_id,
      username,
      password,
    } = req.body;

    const registrationNumber = String(
      registration_number || "",
    ).trim();

    if (!registrationNumber) {
      throw new AppError(
        "Registration number is required",
        422,
      );
    }

    const student = await Student.findOne({
      where: {
        registration_number:
          registrationNumber,
      },
    });

    if (!student) {
      throw new AppError(
        "Student not found",
        404,
      );
    }

    if (student.registration_locked) {
      throw new AppError(
        "Registration is locked and cannot be modified",
        409,
      );
    }

    if (student.payment_status === "paid") {
      throw new AppError(
        "Registration is already completed",
        409,
      );
    }

    if (
      student.internship_status ===
      "blocked"
    ) {
      throw new AppError(
        "This registration is blocked",
        403,
      );
    }

   if (
  password &&
  String(password).length < 8
) {
  throw new AppError(
    "Password must be at least 8 characters",
    422,
  );
}

if (
  !student.password_hash &&
  !password
) {
  throw new AppError(
    "Password is required",
    422,
  );
}

    const normalizedUsername = String(
      username || registrationNumber,
    ).trim();

    const normalizedEmail = String(
      email || "",
    )
      .trim()
      .toLowerCase();

    const domain = await Domain.findByPk(
      Number(domain_id),
    );

    if (!domain) {
      throw new AppError(
        "Selected domain was not found",
        404,
      );
    }

    const duplicateUsername =
      await Student.findOne({
        where: {
          username: normalizedUsername,
        },
      });

    if (
      duplicateUsername &&
      duplicateUsername.id !== student.id
    ) {
      throw new AppError(
        "Username already exists",
        409,
      );
    }

    const duplicateEmail =
      await Student.findOne({
        where: {
          email: normalizedEmail,
        },
      });

    if (
      duplicateEmail &&
      duplicateEmail.id !== student.id
    ) {
      throw new AppError(
        "Email already exists",
        409,
      );
    }

    const updatePayload = {
  father_name: String(
    father_name || "",
  ).trim(),

  gender,
  dob,

  programme: String(
    programme || "",
  ).trim(),

  major_subject: String(
    major_subject || "",
  ).trim(),

  session: String(
    session || "",
  ).trim(),

  semester: String(
    semester || "",
  ).trim(),

  mobile: String(
    mobile || "",
  ).trim(),

  email: normalizedEmail,

  domain_id: Number(domain_id),

  username: normalizedUsername,

  registration_date:
    student.registration_date ||
    new Date(),

  internship_status:
    "registered",

  registration_locked:
    false,
};

if (password) {
  updatePayload.password_hash =
    await hashPassword(
      String(password),
    );
}

await student.update(
  updatePayload,
);

    return ok(
  res,
  {
    student_id:
      student.id,

    registration_number:
      student.registration_number,

    portal_registration_number:
      student.portal_registration_number ||
      createPortalRegistrationNumber(
        student,
      ),

    internship_status:
      student.internship_status,

    registration_locked:
      false,

    next_step:
      "documents",
  },

  "Registration details saved",
);
  },
);

export const uploadRegistrationDocuments =
  asyncHandler(async (req, res) => {
    const registrationNumber = String(
      req.body.registration_number || "",
    ).trim();

    const student = await Student.findOne({
      where: {
        registration_number:
          registrationNumber,
      },
    });

    if (!student) {
      throw new AppError(
        "Student not found",
        404,
      );
    }

    if (student.registration_locked) {
      throw new AppError(
        "Registration is locked. Documents cannot be modified",
        409,
      );
    }

    if (student.payment_status === "paid") {
      throw new AppError(
        "Registration is already completed",
        409,
      );
    }

    if (
      student.internship_status !==
      "registered"
    ) {
      throw new AppError(
        "Complete registration details first",
        409,
      );
    }

    const existingDocuments =
      getStudentDocuments(student);

    const files = req.files || {};

    const documents = {
      photo:
        files.photo?.[0]
          ? `/uploads/registration/${files.photo[0].filename}`
          : existingDocuments.photo,

      identity_document:
        files.identity_document?.[0]
          ? `/uploads/registration/${files.identity_document[0].filename}`
          : existingDocuments.identity_document,
    };

    if (!areDocumentsComplete(documents)) {
      throw new AppError(
        "Photo, identity document  are required",
        422,
      );
    }

    const academics = parseJsonObject(
      student.academics_json,
    );

    await student.update({
      photo: documents.photo,

      academics_json: {
        ...academics,
        documents,
      },
    });

    return ok(
      res,
      {
        ...documents,
        documents_complete: true,
        next_step: "review",
      },
      "Documents uploaded successfully",
    );
  });

export const lockRegistration =
  asyncHandler(async (req, res) => {
    const studentId = Number(
      req.body.student_id,
    );

    if (!studentId) {
      throw new AppError(
        "Student ID is required",
        422,
      );
    }

    const student = await Student.findByPk(
      studentId,
    );

    if (!student) {
      throw new AppError(
        "Student not found",
        404,
      );
    }

    if (
      student.internship_status ===
      "blocked"
    ) {
      throw new AppError(
        "This registration is blocked",
        403,
      );
    }

    if (student.payment_status === "paid") {
      return ok(
        res,
        {
          student_id: student.id,
          registration_locked: true,
          next_step: "login",
        },
        "Registration is already completed",
      );
    }

    if (student.registration_locked) {
      return ok(
        res,
        {
          student_id: student.id,
          registration_locked: true,
          next_step: "payment",
        },
        "Registration is already locked",
      );
    }

    if (
      student.internship_status !==
      "registered"
    ) {
      throw new AppError(
        "Complete registration details first",
        409,
      );
    }

    if (
      !student.domain_id ||
      !student.username ||
      !student.password_hash
    ) {
      throw new AppError(
        "Registration details are incomplete",
        409,
      );
    }

    const documents =
      getStudentDocuments(student);

    if (!areDocumentsComplete(documents)) {
      throw new AppError(
        "Upload all required documents first",
        409,
      );
    }

    await student.update({
      registration_locked: true,
    });

   return ok(
  res,
  {
    student_id:
      student.id,

    registration_number:
      student.registration_number,

    portal_registration_number:
      student.portal_registration_number ||
      createPortalRegistrationNumber(
        student,
      ),

    registration_locked:
      true,

    payment_status:
      student.payment_status,

    next_step:
      "payment",
  },

  "Registration confirmed and locked",
);
  });

export const createPaymentOrder = asyncHandler(
  async (req, res) => {
    const studentId = Number(
      req.body.student_id ||
        req.user?.student_id ||
        req.user?.id,
    );

    if (!studentId) {
      throw new AppError(
        "Student is required",
        422,
      );
    }

    const student =
      await Student.findByPk(
        studentId,
        {
          include: [
            {
              model: Domain,
              as: "domain",
              attributes: [
                "id",
                "domain_name",
                "fee",
              ],
            },
          ],
        },
      );

    if (!student) {
      throw new AppError(
        "Student not found",
        404,
      );
    }

    if (
      student.internship_status ===
      "blocked"
    ) {
      throw new AppError(
        "This registration is blocked",
        403,
      );
    }

    if (
      !student.registration_locked
    ) {
      throw new AppError(
        "Confirm and lock registration before payment",
        409,
      );
    }

    if (
      student.payment_status ===
      "paid"
    ) {
      throw new AppError(
        "Payment has already been completed",
        409,
      );
    }

    if (!student.domain) {
      throw new AppError(
        "Student domain is not assigned",
        422,
      );
    }

    /*
     * IMPORTANT:
     * Amount is always resolved on the server.
     * Active college-specific fee wins; otherwise
     * the global domain fee is used.
     */
    const collegeDomainFee =
      await CollegeDomainFee.findOne({
        where: {
          college_id:
            student.college_id,

          domain_id:
            student.domain.id,

          status:
            "active",
        },

        attributes: [
          "fee",
        ],

        raw: true,
      });

    const amount = Number(
      collegeDomainFee?.fee ??
        student.domain.fee,
    );

    const feeSource =
      collegeDomainFee
        ? "college"
        : "default";

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new AppError(
        "Invalid domain fee",
        422,
      );
    }

    const customerPhone =
      normalizeMobileNumber(
        student.mobile,
      );

    if (!customerPhone) {
      throw new AppError(
        "Valid 10-digit mobile number is required",
        422,
      );
    }

    const customerEmail =
      String(
        student.email || "",
      )
        .trim()
        .toLowerCase();

    if (!customerEmail) {
      throw new AppError(
        "Student email is required",
        422,
      );
    }

    const portalRegistrationNumber =
      student
        .portal_registration_number ||
      createPortalRegistrationNumber(
        student,
      );

    const gateway =
      getActivePaymentGateway();

    /*
     * -------------------------------------------------
     * RAZORPAY
     * -------------------------------------------------
     */
    if (gateway === "razorpay") {
      const {
        keyId,
      } =
        getRazorpayCredentials();

      const amountInPaise =
        Math.round(
          amount * 100,
        );

      const receipt =
        createRazorpayReceiptId(
          student.id,
        );

      let razorpayOrder;

      try {
        const response =
          await axios.post(
            "https://api.razorpay.com/v1/orders",
            {
              amount:
                amountInPaise,

              currency:
                "INR",

              receipt,

              notes: {
                student_id:
                  String(
                    student.id,
                  ),

                registration_number:
                  String(
                    student
                      .registration_number ||
                      "",
                  ),

                portal_registration_number:
                  String(
                    portalRegistrationNumber ||
                      "",
                  ),

                domain_id:
                  String(
                    student.domain.id,
                  ),

                fee_source:
                  feeSource,
              },
            },
            {
              auth:
                getRazorpayAuth(),

              headers: {
                "Content-Type":
                  "application/json",
              },

              timeout:
                20000,
            },
          );

        razorpayOrder =
          response.data;
      } catch (error) {
        console.error(
          "Razorpay order error:",
          error.response?.data ||
            error.message,
        );

        throw new AppError(
          error.response?.data
            ?.error?.description ||
            error.response?.data
              ?.message ||
            "Unable to create Razorpay payment order",
          error.response?.status ||
            500,
        );
      }

      if (
        !razorpayOrder?.id
      ) {
        throw new AppError(
          "Razorpay order ID was not generated",
          500,
        );
      }

      const transactionId =
        `RZP_${student.id}_${Date.now()}`;

      await Payment.create({
        student_id:
          student.id,

        amount,

        currency:
          "INR",

        transaction_id:
          transactionId,

        gateway:
          "razorpay",

        order_id:
          razorpayOrder.id,

        razorpay_order_id:
          razorpayOrder.id,

        status:
          "created",

        gateway_payload: {
          razorpay_order:
            razorpayOrder,

          fee_source:
            feeSource,

          default_domain_fee:
            Number(
              student.domain.fee ||
                0,
            ),

          college_domain_fee:
            collegeDomainFee
              ? Number(
                  collegeDomainFee
                    .fee,
                )
              : null,
        },
      });

      return ok(
        res,
        {
          gateway:
            "razorpay",

          key_id:
            keyId,

          order_id:
            razorpayOrder.id,

          razorpay_order_id:
            razorpayOrder.id,

          /*
           * Razorpay Checkout expects the
           * amount in currency subunits (paise).
           */
          amount:
            amountInPaise,

          amount_rupees:
            amount,

          currency:
            "INR",

          transaction_id:
            transactionId,

          student: {
            id:
              student.id,

            name:
              student.name,

            email:
              student.email,

            mobile:
              customerPhone,

            registration_number:
              student
                .registration_number,

            portal_registration_number:
              portalRegistrationNumber,
          },

          domain: {
            id:
              student.domain.id,

            domain_name:
              student.domain
                .domain_name,
          },
        },
        "Razorpay payment order created successfully",
        201,
      );
    }

    /*
     * -------------------------------------------------
     * CASHFREE
     * -------------------------------------------------
     */
    const frontendUrl =
      process.env.CLIENT_URL;

    const backendUrl =
      process.env.BACKEND_URL;

    if (
      !frontendUrl ||
      !backendUrl
    ) {
      throw new AppError(
        "CLIENT_URL or BACKEND_URL is not configured",
        500,
      );
    }

    const orderId =
      createCashfreeOrderId(
        student.id,
      );

    const payload = {
      order_id:
        orderId,

      order_amount:
        Number(
          amount.toFixed(2),
        ),

      order_currency:
        "INR",

      customer_details: {
        customer_id:
          `STUDENT_${student.id}`,

        customer_name:
          student.name ||
          "Student",

        customer_email:
          customerEmail,

        customer_phone:
          customerPhone,
      },

      order_meta: {
        return_url:
          `${frontendUrl}/register/payment/status` +
          `?order_id=${encodeURIComponent(orderId)}` +
          `&student_id=${student.id}`,

        notify_url:
          `${backendUrl}/api/registration/payment/cashfree/webhook`,
      },

      order_note:
        `Internship payment for ${student.domain.domain_name}`,

      order_tags: {
        student_id:
          String(
            student.id,
          ),

        registration_number:
          String(
            student
              .registration_number ||
              "",
          ),

        portal_registration_number:
          portalRegistrationNumber,

        domain_id:
          String(
            student.domain.id,
          ),

        fee_source:
          feeSource,
      },
    };

    let cashfreeOrder;

    try {
      const response =
        await axios.post(
          `${getCashfreeBaseUrl()}/orders`,
          payload,
          {
            headers:
              getCashfreeHeaders({
                "x-idempotency-key":
                  crypto.randomUUID(),

                "x-request-id":
                  crypto.randomUUID(),
              }),

            timeout:
              20000,
          },
        );

      cashfreeOrder =
        response.data;
    } catch (error) {
      console.error(
        "Cashfree order error:",
        error.response?.data ||
          error.message,
      );

      throw new AppError(
        error.response?.data
          ?.message ||
          "Unable to create payment order",
        error.response?.status ||
          500,
      );
    }

    if (
      !cashfreeOrder
        ?.payment_session_id
    ) {
      throw new AppError(
        "Cashfree payment session was not generated",
        500,
      );
    }

    const transactionId =
      `CF_${student.id}_${Date.now()}`;

    await Payment.create({
      student_id:
        student.id,

      amount,

      currency:
        "INR",

      transaction_id:
        transactionId,

      gateway:
        "cashfree",

      order_id:
        orderId,

      cashfree_order_id:
        orderId,

      cf_order_id:
        cashfreeOrder.cf_order_id
          ? String(
              cashfreeOrder
                .cf_order_id,
            )
          : null,

      status:
        "created",

      gateway_payload: {
        ...cashfreeOrder,

        fee_source:
          feeSource,

        default_domain_fee:
          Number(
            student.domain.fee ||
              0,
          ),

        college_domain_fee:
          collegeDomainFee
            ? Number(
                collegeDomainFee
                  .fee,
              )
            : null,
      },
    });

    return ok(
      res,
      {
        gateway:
          "cashfree",

        order_id:
          orderId,

        cf_order_id:
          cashfreeOrder
            .cf_order_id,

        payment_session_id:
          cashfreeOrder
            .payment_session_id,

        amount,
        currency:
          "INR",

        transaction_id:
          transactionId,

        student: {
          id:
            student.id,

          name:
            student.name,

          email:
            student.email,

          mobile:
            customerPhone,

          registration_number:
            student
              .registration_number,

          portal_registration_number:
            portalRegistrationNumber,
        },

        domain: {
          id:
            student.domain.id,

          domain_name:
            student.domain
              .domain_name,
        },
      },
      "Cashfree payment order created successfully",
      201,
    );
  },
);

  const safeSignatureCompare = (
  generatedSignature,
  receivedSignature,
) => {
  const generatedBuffer =
    Buffer.from(
      generatedSignature,
      "utf8",
    );

  const receivedBuffer =
    Buffer.from(
      receivedSignature,
      "utf8",
    );

  if (
    generatedBuffer.length !==
    receivedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    generatedBuffer,
    receivedBuffer,
  );
};

export const verifyRazorpayPayment =
  async (
    req,
    res,
    next,
  ) => {
    const transaction =
      await Payment.sequelize
        .transaction();

    try {
      const razorpayOrderId =
        String(
          req.body
            .razorpay_order_id ||
            req.body.order_id ||
            "",
        ).trim();

      const razorpayPaymentId =
        String(
          req.body
            .razorpay_payment_id ||
            "",
        ).trim();

      const razorpaySignature =
        String(
          req.body
            .razorpay_signature ||
            "",
        ).trim();

      if (
        !razorpayOrderId ||
        !razorpayPaymentId ||
        !razorpaySignature
      ) {
        throw new AppError(
          "Razorpay order ID, payment ID and signature are required",
          422,
        );
      }

     const payment =
  await Payment.findOne({
    where: {
      [Op.or]: [
        {
          razorpay_order_id:
            razorpayOrderId,
        },
        {
          order_id:
            razorpayOrderId,
        },
      ],
    },

    transaction,

    lock:
      transaction.LOCK.UPDATE,
  });

if (!payment) {
  throw new AppError(
    "Razorpay payment order not found",
    404,
  );
}

if (
  !payment.razorpay_order_id
) {
  await payment.update(
    {
      razorpay_order_id:
        razorpayOrderId,
    },
    {
      transaction,
    },
  );
}

if (
  String(
    payment.gateway || "",
  ).toLowerCase() !==
  "razorpay"
) {
  throw new AppError(
    "Payment gateway mismatch",
    409,
  );
}
      /*
       * Idempotency:
       * Do not process an already successful
       * Razorpay payment twice.
       */
      if (
        [
          "success",
          "paid",
        ].includes(
          payment.status,
        )
      ) {
        const student =
          await Student.findByPk(
            payment.student_id,
            {
              transaction,

              lock:
                transaction.LOCK
                  .UPDATE,
            },
          );

        if (!student) {
          throw new AppError(
            "Student record not found",
            404,
          );
        }

        const portalRegistrationNumber =
          student
            .portal_registration_number ||
          createPortalRegistrationNumber(
            student,
          );

        await student.update(
          {
            portal_registration_number:
              portalRegistrationNumber,

            registration_locked:
              true,

            payment_status:
              "paid",

            internship_status:
              "active",
          },
          {
            transaction,
          },
        );

        await transaction.commit();

        try {
          await ensurePaymentReceipt(
            payment.id,
          );
        } catch (
          receiptError
        ) {
          console.error(
            "EXISTING RAZORPAY RECEIPT ERROR:",
            receiptError,
          );
        }

        await queuePaymentSuccessNotification(
          payment.id,
        );

        return res.json({
          success: true,

          data: {
            gateway:
              "razorpay",

            order_id:
              payment
                .razorpay_order_id,

            razorpay_order_id:
              payment
                .razorpay_order_id,

            razorpay_payment_id:
              payment
                .razorpay_payment_id,

            transaction_id:
              payment
                .transaction_id,

            portal_registration_number:
              portalRegistrationNumber,

            payment_status:
              "paid",

            internship_status:
              "active",
          },

          message:
            "Payment already verified",
        });
      }

      const {
        keySecret,
      } =
        getRazorpayCredentials();

      /*
       * Razorpay requires the ORIGINAL order ID
       * stored on our server for signature
       * generation.
       */
      const generatedSignature =
        crypto
          .createHmac(
            "sha256",
            keySecret,
          )
          .update(
            `${payment.razorpay_order_id}|${razorpayPaymentId}`,
          )
          .digest(
            "hex",
          );

      if (
        !safeSignatureCompare(
          generatedSignature,
          razorpaySignature,
        )
      ) {
        throw new AppError(
          "Invalid Razorpay payment signature",
          401,
        );
      }

      let razorpayPayment;

      try {
        const response =
          await axios.get(
            `https://api.razorpay.com/v1/payments/${encodeURIComponent(
              razorpayPaymentId,
            )}`,
            {
              auth:
                getRazorpayAuth(),

              timeout:
                15000,
            },
          );

        razorpayPayment =
          response.data;
      } catch (error) {
        console.error(
          "Razorpay payment fetch error:",
          error.response?.data ||
            error.message,
        );

        throw new AppError(
          error.response?.data
            ?.error?.description ||
            "Unable to verify Razorpay payment",
          error.response?.status ||
            500,
        );
      }

      const expectedAmountPaise =
        Math.round(
          Number(
            payment.amount,
          ) * 100,
        );

      const verifiedAmountPaise =
        Number(
          razorpayPayment.amount,
        );

      const verifiedCurrency =
        String(
          razorpayPayment.currency ||
            "",
        ).toUpperCase();

      if (
        razorpayPayment.order_id !==
          payment
            .razorpay_order_id ||
        !Number.isFinite(
          verifiedAmountPaise,
        ) ||
        verifiedAmountPaise !==
          expectedAmountPaise ||
        verifiedCurrency !==
          "INR"
      ) {
        throw new AppError(
          "Razorpay payment order, amount or currency mismatch",
          409,
        );
      }

      /*
       * Fulfil registration only after the
       * payment has reached captured state.
       */
      if (
        razorpayPayment.status !==
        "captured"
      ) {
        const waitingStatus =
          razorpayPayment.status ===
          "authorized"
            ? "processing"
            : "pending";

        await payment.update(
          {
            status:
              waitingStatus,

            razorpay_payment_id:
              razorpayPaymentId,

            razorpay_signature:
              razorpaySignature,

            payment_method:
              razorpayPayment
                .method ||
              null,

            payment_message:
              `Razorpay status: ${razorpayPayment.status}`,

            failure_reason:
              null,

            gateway_payload: {
              ...parseJsonObject(
                payment
                  .gateway_payload,
              ),

              razorpay_payment:
                razorpayPayment,
            },
          },
          {
            transaction,
          },
        );

        await transaction.commit();

        return res
          .status(202)
          .json({
            success:
              true,

            data: {
              gateway:
                "razorpay",

              order_id:
                payment
                  .razorpay_order_id,

              razorpay_order_id:
                payment
                  .razorpay_order_id,

              razorpay_payment_id:
                razorpayPaymentId,

              order_status:
                razorpayPayment
                  .status,

              payment_status:
                "pending",
            },

            message:
              "Payment is authorised but not captured yet",
          });
      }

      await payment.update(
        {
          status:
            "success",

          order_id:
            payment
              .razorpay_order_id,

          razorpay_order_id:
            payment
              .razorpay_order_id,

          razorpay_payment_id:
            razorpayPaymentId,

          razorpay_signature:
            razorpaySignature,

          amount:
            Number(
              (
                verifiedAmountPaise /
                100
              ).toFixed(2),
            ),

          currency:
            verifiedCurrency,

          paid_at:
            razorpayPayment
              .created_at
              ? new Date(
                  Number(
                    razorpayPayment
                      .created_at,
                  ) *
                    1000,
                )
              : new Date(),

          payment_method:
            razorpayPayment.method ||
            null,

          payment_message:
            "Payment captured successfully",

          failure_reason:
            null,

          gateway_payload: {
            ...parseJsonObject(
              payment.gateway_payload,
            ),

            razorpay_payment:
              razorpayPayment,
          },
        },
        {
          transaction,
        },
      );

      const student =
        await Student.findByPk(
          payment.student_id,
          {
            transaction,

            lock:
              transaction.LOCK
                .UPDATE,
          },
        );

      if (!student) {
        throw new AppError(
          "Student record not found",
          404,
        );
      }

      const portalRegistrationNumber =
        student
          .portal_registration_number ||
        createPortalRegistrationNumber(
          student,
        );

      await student.update(
        {
          payment_status:
            "paid",

          internship_status:
            "active",

          registration_locked:
            true,

          portal_registration_number:
            portalRegistrationNumber,
        },
        {
          transaction,
        },
      );

      await transaction.commit();

      try {
        await ensurePaymentReceipt(
          payment.id,
        );
      } catch (
        receiptError
      ) {
        console.error(
          "RAZORPAY RECEIPT GENERATION ERROR:",
          receiptError,
        );
      }

      await queuePaymentSuccessNotification(
        payment.id,
      );

      return res.json({
        success: true,

        data: {
          gateway:
            "razorpay",

          order_id:
            payment
              .razorpay_order_id,

          razorpay_order_id:
            payment
              .razorpay_order_id,

          razorpay_payment_id:
            razorpayPaymentId,

          transaction_id:
            payment
              .transaction_id,

          portal_registration_number:
            portalRegistrationNumber,

          payment_status:
            "paid",

          internship_status:
            "active",

          amount:
            Number(
              payment.amount,
            ),

          currency:
            verifiedCurrency,
        },

        message:
          "Razorpay payment verified and account activated successfully",
      });
    } catch (error) {
      if (
        !transaction.finished
      ) {
        await transaction.rollback();
      }

      console.error(
        "RAZORPAY PAYMENT VERIFICATION ERROR:",
        error.response?.data ||
          error,
      );

      next(error);
    }
  };

export const verifyPayment =
  async (
    req,
    res,
    next,
  ) => {
    const requestedGateway =
      String(
        req.body.gateway ||
          "",
      )
        .trim()
        .toLowerCase();

    const hasRazorpayPayload =
      Boolean(
        req.body
          .razorpay_payment_id ||
          req.body
            .razorpay_signature,
      );

    if (
      requestedGateway ===
        "razorpay" ||
      hasRazorpayPayload
    ) {
      return verifyRazorpayPayment(
        req,
        res,
        next,
      );
    }

    return verifyCashfreePayment(
      req,
      res,
      next,
    );
  };

  export const razorpayWebhook =
  asyncHandler(async (req, res) => {
    const signature = String(
      req.headers[
        "x-razorpay-signature"
      ] || "",
    ).trim();

    const eventId = String(
      req.headers[
        "x-razorpay-event-id"
      ] || "",
    ).trim();

    const webhookSecret =
      String(
        process.env
          .RAZORPAY_WEBHOOK_SECRET ||
          "",
      ).trim();

    if (!webhookSecret) {
      throw new AppError(
        "Razorpay webhook secret is not configured",
        500,
      );
    }

    if (
      !signature ||
      !req.rawBody
    ) {
      throw new AppError(
        "Invalid Razorpay webhook request",
        401,
      );
    }

    const rawBody =
      Buffer.isBuffer(
        req.rawBody,
      )
        ? req.rawBody.toString(
            "utf8",
          )
        : String(
            req.rawBody,
          );

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          webhookSecret,
        )
        .update(rawBody)
        .digest("hex");

    if (
      !safeSignatureCompare(
        expectedSignature,
        signature,
      )
    ) {
      throw new AppError(
        "Invalid Razorpay webhook signature",
        401,
      );
    }

    const event = String(
      req.body?.event || "",
    ).trim();

    /*
     * Abhi sirf in events ko
     * process karna hai.
     */
    if (
      ![
        "payment.captured",
        "payment.failed",
      ].includes(event)
    ) {
      return res
        .status(200)
        .json({
          success: true,
          message:
            "Razorpay webhook acknowledged",
        });
    }

    const razorpayPayment =
      req.body?.payload
        ?.payment?.entity;

    if (!razorpayPayment) {
      throw new AppError(
        "Razorpay payment payload is missing",
        422,
      );
    }

    const razorpayPaymentId =
      String(
        razorpayPayment.id ||
          "",
      ).trim();

    const razorpayOrderId =
      String(
        razorpayPayment
          .order_id ||
          "",
      ).trim();

    if (
      !razorpayPaymentId ||
      !razorpayOrderId
    ) {
      throw new AppError(
        "Razorpay payment ID or order ID is missing",
        422,
      );
    }

    const transaction =
      await Payment.sequelize
        .transaction();

    try {
      const payment =
        await Payment.findOne({
          where: {
            [Op.or]: [
              {
                razorpay_order_id:
                  razorpayOrderId,
              },

              {
                order_id:
                  razorpayOrderId,
              },

              {
                razorpay_payment_id:
                  razorpayPaymentId,
              },
            ],
          },

          transaction,

          lock:
            transaction.LOCK.UPDATE,
        });

      /*
       * Non-2xx response dene par
       * Razorpay retry karega.
       */
      if (!payment) {
        throw new AppError(
          "Razorpay payment record not found",
          404,
        );
      }

      if (
        String(
          payment.gateway || "",
        ).toLowerCase() !==
        "razorpay"
      ) {
        throw new AppError(
          "Payment gateway mismatch",
          409,
        );
      }

      const oldPayload =
        parseJsonObject(
          payment.gateway_payload,
        );

      const processedEventIds =
        Array.isArray(
          oldPayload
            .razorpay_webhook_event_ids,
        )
          ? oldPayload
              .razorpay_webhook_event_ids
          : [];

      /*
       * Same webhook dobara aaye
       * to duplicate processing nahi.
       */
      if (
        eventId &&
        processedEventIds.includes(
          eventId,
        )
      ) {
        await transaction.commit();

        return res
          .status(200)
          .json({
            success: true,
            message:
              "Razorpay webhook already processed",
          });
      }

      const updatedEventIds =
        eventId
          ? [
              ...processedEventIds,
              eventId,
            ].slice(-50)
          : processedEventIds;

      /*
       * --------------------------------
       * PAYMENT FAILED
       * --------------------------------
       */
      if (
        event ===
        "payment.failed"
      ) {
        /*
         * Kabhi failed event ke baad
         * captured event aa sakta hai.
         *
         * Already-successful payment ko
         * failed me downgrade nahi karna.
         */
        if (
          ![
            "success",
            "paid",
          ].includes(
            payment.status,
          )
        ) {
          await payment.update(
            {
              status: "failed",

              order_id:
                razorpayOrderId,

              razorpay_order_id:
                razorpayOrderId,

              razorpay_payment_id:
                razorpayPaymentId,

              payment_method:
                razorpayPayment
                  .method ||
                null,

              payment_message:
                razorpayPayment
                  .error_description ||
                razorpayPayment
                  .error_reason ||
                "Razorpay payment failed",

              failure_reason:
                razorpayPayment
                  .error_description ||
                razorpayPayment
                  .error_reason ||
                razorpayPayment
                  .error_code ||
                "Payment failed",

              gateway_payload: {
                ...oldPayload,

                razorpay_payment:
                  razorpayPayment,

                razorpay_webhook_event:
                  event,

                razorpay_webhook_event_ids:
                  updatedEventIds,

                razorpay_webhook_received_at:
                  new Date()
                    .toISOString(),
              },
            },
            {
              transaction,
            },
          );
        }

        await transaction.commit();

        return res
          .status(200)
          .json({
            success: true,
            message:
              "Razorpay failed payment webhook processed",
          });
      }

      /*
       * --------------------------------
       * PAYMENT CAPTURED
       * --------------------------------
       */

      const expectedAmountPaise =
        Math.round(
          Number(
            payment.amount,
          ) * 100,
        );

      const receivedAmountPaise =
        Number(
          razorpayPayment.amount,
        );

      const receivedCurrency =
        String(
          razorpayPayment
            .currency ||
            "",
        ).toUpperCase();

      if (
        razorpayPayment
          .order_id !==
          razorpayOrderId ||
        razorpayPayment.status !==
          "captured" ||
        !Number.isFinite(
          receivedAmountPaise,
        ) ||
        receivedAmountPaise !==
          expectedAmountPaise ||
        receivedCurrency !==
          "INR"
      ) {
        throw new AppError(
          "Razorpay webhook payment validation failed",
          409,
        );
      }

      const student =
        await Student.findByPk(
          payment.student_id,
          {
            transaction,

            lock:
              transaction.LOCK.UPDATE,
          },
        );

      if (!student) {
        throw new AppError(
          "Student record not found",
          404,
        );
      }

      const portalRegistrationNumber =
        student
          .portal_registration_number ||
        createPortalRegistrationNumber(
          student,
        );

      await payment.update(
        {
          gateway:
            "razorpay",

          status:
            "success",

          order_id:
            razorpayOrderId,

          razorpay_order_id:
            razorpayOrderId,

          razorpay_payment_id:
            razorpayPaymentId,

          amount:
            Number(
              (
                receivedAmountPaise /
                100
              ).toFixed(2),
            ),

          currency:
            receivedCurrency,

          payment_method:
            razorpayPayment.method ||
            null,

          payment_message:
            "Payment captured successfully",

          failure_reason:
            null,

          paid_at:
            razorpayPayment
              .created_at
              ? new Date(
                  Number(
                    razorpayPayment
                      .created_at,
                  ) * 1000,
                )
              : new Date(),

          gateway_payload: {
            ...oldPayload,

            razorpay_payment:
              razorpayPayment,

            razorpay_webhook_event:
              event,

            razorpay_webhook_event_ids:
              updatedEventIds,

            razorpay_webhook_received_at:
              new Date()
                .toISOString(),
          },
        },
        {
          transaction,
        },
      );

      await student.update(
        {
          payment_status:
            "paid",

          internship_status:
            "active",

          registration_locked:
            true,

          portal_registration_number:
            portalRegistrationNumber,
        },
        {
          transaction,
        },
      );

      await transaction.commit();

      /*
       * Receipt/email response ke baad
       * background me process honge.
       */
      void (async () => {
        try {
          await ensurePaymentReceipt(
            payment.id,
          );

          await queuePaymentSuccessNotification(
            payment.id,
          );
        } catch (error) {
          console.error(
            "RAZORPAY WEBHOOK POST PROCESS ERROR:",
            error,
          );
        }
      })();

      return res
        .status(200)
        .json({
          success: true,

          data: {
            gateway:
              "razorpay",

            order_id:
              razorpayOrderId,

            razorpay_order_id:
              razorpayOrderId,

            razorpay_payment_id:
              razorpayPaymentId,

            transaction_id:
              payment
                .transaction_id,

            payment_status:
              "paid",

            internship_status:
              "active",
          },

          message:
            "Razorpay captured payment webhook processed successfully",
        });
    } catch (error) {
      if (
        !transaction.finished
      ) {
        await transaction.rollback();
      }

      console.error(
        "RAZORPAY WEBHOOK ERROR:",
        error,
      );

      throw error;
    }
  });


export const verifyCashfreePayment = async (
  req,
  res,
  next,
) => {
  const transaction =
    await Payment.sequelize.transaction();

  try {
    const orderId = String(
      req.body.order_id || "",
    ).trim();

    if (!orderId) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        data: {},
        message:
          "Cashfree order ID is required",
      });
    }

    const payment = await Payment.findOne({
      where: {
        [Op.or]: [
          {
            cashfree_order_id:
              orderId,
          },
          {
            transaction_id:
              orderId,
          },
        ],
      },
      transaction,
      lock:
        transaction.LOCK.UPDATE,
    });

    if (!payment) {
      await transaction.rollback();

      return res.status(404).json({
        success: false,
        data: {},
        message:
          "Payment order not found",
      });
    }

    /*
     * Idempotency:
     * If already successful, don't process twice.
     */
    if (
  payment.status ===
  "success"
) {
  const student =
    await Student.findByPk(
      payment.student_id,
      {
        transaction,
        lock:
          transaction.LOCK.UPDATE,
      },
    );

  if (!student) {
    throw new AppError(
      "Student record not found",
      404,
    );
  }

  const portalRegistrationNumber =
    student.portal_registration_number ||
    createPortalRegistrationNumber(
      student,
    );

  await student.update(
  {
    portal_registration_number:
      portalRegistrationNumber,

    registration_locked:
      true,

    payment_status:
      "paid",

    internship_status:
      "active",
  },
  {
    transaction,
  },
);

  await transaction.commit();

  try {
    await ensurePaymentReceipt(
      payment.id,
    );
  } catch (
    receiptError
  ) {
    console.error(
      "EXISTING PAYMENT RECEIPT ERROR:",
      receiptError,
    );
  }

  await queuePaymentSuccessNotification(
  payment.id,
);

  return res.json({
    success: true,

    data: {
      order_id:
        orderId,

      transaction_id:
        payment.transaction_id,

      cf_payment_id:
        payment.cf_payment_id ||
        null,

      portal_registration_number:
        portalRegistrationNumber,

      payment_status:
        "paid",

      internship_status:
  student.internship_status,
    },

    message:
      "Payment already verified",
  });
}

    const orderResponse =
      await axios.get(
        `${getCashfreeBaseUrl()}/orders/${encodeURIComponent(
          orderId,
        )}`,
        {
          headers:
            getCashfreeHeaders(),
          timeout: 15000,
        },
      );

    const cashfreeOrder =
      orderResponse.data;

    const expectedAmount = Number(payment.amount);
    const verifiedAmount = Number(cashfreeOrder.order_amount);
    const verifiedCurrency = String(
      cashfreeOrder.order_currency || "",
    ).toUpperCase();

    if (
      !Number.isFinite(verifiedAmount) ||
      Math.abs(expectedAmount - verifiedAmount) > 0.001 ||
      verifiedCurrency !== "INR"
    ) {
      throw new AppError(
        "Payment amount or currency mismatch",
        409,
      );
    }

    /*
     * Cashfree order_status:
     * PAID means successful payment.
     */
    if (
      cashfreeOrder.order_status !==
      "PAID"
    ) {
      await payment.update(
        {
          status:
            cashfreeOrder.order_status ===
            "ACTIVE"
              ? "pending"
              : "failed",

          failure_reason:
            `Cashfree order status: ${cashfreeOrder.order_status}`,
        },
        {
          transaction,
        },
      );

      await transaction.commit();

   
      return res.status(202).json({
        success: true,
        data: {
          order_id: orderId,
          order_status:
            cashfreeOrder.order_status,
          payment_status:
            "pending",
        },
        message:
          "Payment is not completed yet",
      });
    }

    /*
     * Fetch payment attempts to get cf_payment_id.
     */
    const paymentsResponse =
      await axios.get(
        `${getCashfreeBaseUrl()}/orders/${encodeURIComponent(
          orderId,
        )}/payments`,
        {
          headers:
            getCashfreeHeaders(),
          timeout: 15000,
        },
      );

    const paymentAttempts =
      Array.isArray(
        paymentsResponse.data,
      )
        ? paymentsResponse.data
        : [];

    const successfulAttempt =
      paymentAttempts.find(
        (item) =>
          item.payment_status ===
          "SUCCESS",
      );

    await payment.update(
      {
        status: "success",

        cashfree_order_id:
          cashfreeOrder.order_id,

        cf_order_id:
          String(
            cashfreeOrder.cf_order_id ||
              payment.cf_order_id ||
              "",
          ) || null,

        cf_payment_id:
          successfulAttempt
            ?.cf_payment_id
            ? String(
                successfulAttempt.cf_payment_id,
              )
            : payment.cf_payment_id,

        amount:
          Number(
            cashfreeOrder.order_amount,
          ),

        currency:
          cashfreeOrder.order_currency ||
          "INR",

        paid_at:
          successfulAttempt
            ?.payment_time ||
          new Date(),

        failure_reason: null,
      },
      {
        transaction,
      },
    );

    const student =
      await Student.findByPk(
        payment.student_id,
        {
          transaction,
          lock:
            transaction.LOCK.UPDATE,
        },
      );

    if (!student) {
      throw new Error(
        "Student not found for payment",
      );
    }

   const portalRegistrationNumber =
  student.portal_registration_number ||
  createPortalRegistrationNumber(
    student,
  );

await student.update(
   {
    payment_status:
      "paid",

    internship_status:
      "active",

    registration_locked:
      true,

    portal_registration_number:
      portalRegistrationNumber,
  },
  {
    transaction,
  },
);
    await transaction.commit();
    
    await queuePaymentSuccessNotification(
  payment.id,
);


    return res.json({
      success: true,
     data: {
  order_id:
    cashfreeOrder.order_id,

  cf_order_id:
    cashfreeOrder.cf_order_id,

  transaction_id:
    payment.transaction_id,

  portal_registration_number:
    portalRegistrationNumber,

  cf_payment_id:
    successfulAttempt?.cf_payment_id
      ? String(
          successfulAttempt.cf_payment_id,
        )
      : null,

  payment_status:
    "paid",

  internship_status:
    "active",

  amount:
    cashfreeOrder.order_amount,

  currency:
    cashfreeOrder.order_currency,
},
      message:
        "Payment verified and account activated successfully",
    });
  } catch (error) {
    if (
      !transaction.finished
    ) {
      await transaction.rollback();
    }

    console.error(
      "CASHFREE PAYMENT VERIFICATION ERROR:",
      error.response?.data ||
        error,
    );

    next(error);
  }
};

export const cashfreeWebhook =
  asyncHandler(async (req, res) => {
    const signature = String(
      req.headers["x-webhook-signature"] || "",
    ).trim();

    const timestamp = String(
      req.headers["x-webhook-timestamp"] || "",
    ).trim();

    if (
      !signature ||
      !timestamp ||
      !req.rawBody
    ) {
      throw new AppError(
        "Invalid Cashfree webhook request",
        401,
      );
    }

    const signatureValid =
      verifyCashfreeWebhookSignature({
        rawBody: req.rawBody,
        timestamp,
        signature,
      });

    if (!signatureValid) {
      throw new AppError(
        "Invalid Cashfree webhook signature",
        401,
      );
    }

    const { data = {}, type = "" } =
      req.body || {};

    const orderData = data.order || {};
    const paymentData =
      data.payment || {};

    const orderId = String(
      orderData.order_id || "",
    ).trim();

    const cfOrderId =
      orderData.cf_order_id != null
        ? String(orderData.cf_order_id)
        : null;

    const cfPaymentId =
      paymentData.cf_payment_id != null
        ? String(paymentData.cf_payment_id)
        : null;

    const paymentStatus = String(
      paymentData.payment_status || "",
    ).toUpperCase();

    if (!orderId) {
      throw new AppError(
        "Cashfree order ID is missing",
        422,
      );
    }

    /*
     * Failed/user-dropped events are acknowledged.
     * Account activation happens only on SUCCESS.
     */
    if (
      type !== "PAYMENT_SUCCESS_WEBHOOK" ||
      paymentStatus !== "SUCCESS"
    ) {
      return res.status(200).json({
        success: true,
        message: "Webhook acknowledged",
      });
    }

    const transaction =
      await Payment.sequelize.transaction();

    try {
      const payment =
        await Payment.findOne({
          where: {
            [Op.or]: [
              {
                cashfree_order_id:
                  orderId,
              },
              ...(cfOrderId
                ? [
                    {
                      cf_order_id:
                        cfOrderId,
                    },
                  ]
                : []),
            ],
          },
          transaction,
          lock:
            transaction.LOCK.UPDATE,
        });

      if (!payment) {
        throw new AppError(
          "Payment record not found",
          404,
        );
      }

      const student =
        await Student.findByPk(
          payment.student_id,
          {
            transaction,
            lock:
              transaction.LOCK.UPDATE,
          },
        );

      if (!student) {
        throw new AppError(
          "Student record not found",
          404,
        );
      }

      if (
  payment.status ===
    "success" &&
  student.payment_status ===
    "paid"
) {
  const portalRegistrationNumber =
    student.portal_registration_number ||
    createPortalRegistrationNumber(
      student,
    );

 await student.update(
  {
    payment_status:
      "paid",

    internship_status:
      "active",

    registration_locked:
      true,

    portal_registration_number:
      portalRegistrationNumber,
  },
  {
    transaction,
  },
);

  await transaction.commit();

  try {
    await ensurePaymentReceipt(
      payment.id,
    );
  } catch (
    receiptError
  ) {
    console.error(
      "EXISTING WEBHOOK RECEIPT ERROR:",
      receiptError,
    );
  }

  return res.status(
    200,
  ).json({
    success: true,

    data: {
      portal_registration_number:
        portalRegistrationNumber,
    },

    message:
      "Webhook already processed",
  });
}

      const expectedAmount = Number(
        payment.amount,
      );

      const receivedAmount = Number(
        paymentData.payment_amount,
      );

      const receivedCurrency = String(
        paymentData.payment_currency ||
          orderData.order_currency ||
          "",
      ).toUpperCase();

      if (
        !Number.isFinite(receivedAmount) ||
        Math.abs(
          expectedAmount - receivedAmount,
        ) > 0.001 ||
        receivedCurrency !== "INR"
      ) {
        throw new AppError(
          "Webhook amount or currency mismatch",
          409,
        );
      }

      await payment.update(
        {
          status: "success",
          cashfree_order_id: orderId,
          cf_order_id:
            cfOrderId ||
            payment.cf_order_id,
          cf_payment_id:
            cfPaymentId ||
            payment.cf_payment_id,
          amount: receivedAmount,
          currency: receivedCurrency,
          paid_at:
            paymentData.payment_time ||
            new Date(),
          failure_reason: null,
          gateway_payload: {
            ...parseJsonObject(
              payment.gateway_payload,
            ),
            success_webhook: req.body,
          },
        },
        { transaction },
      );

      const portalRegistrationNumber =
  student.portal_registration_number ||
  createPortalRegistrationNumber(
    student,
  );

await student.update(
  {
    payment_status:
      "paid",

    internship_status:
      "active",

    registration_locked:
      true,

    portal_registration_number:
      portalRegistrationNumber,
  },
  {
    transaction,
  },
);

      await transaction.commit();
      
      try {
  await ensurePaymentReceipt(
    payment.id,
  );
} catch (receiptError) {
  console.error(
    "WEBHOOK RECEIPT GENERATION ERROR:",
    receiptError,
  );
}

      return res.status(200).json({
        success: true,
        message:
          "Webhook processed successfully",
      });
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }

      throw error;
    }
  });

const formatReceiptDate = (value) => {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
};

const formatAmount = (value) => {
  const amount = Number(value || 0);

  return `Rs. ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
};

const addReceiptRow = (
  doc,
  label,
  value,
  options = {},
) => {
  const startX = 55;
  const labelWidth = 170;
  const valueX = startX + labelWidth;
  const currentY = doc.y;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#334155")
    .text(label, startX, currentY, {
      width: labelWidth,
    });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#0f172a")
    .text(String(value ?? "-"), valueX, currentY, {
      width: 320,
      ...options,
    });

  doc.moveDown(0.7);
};

const RECEIPT_STORAGE_DIR =
  path.resolve(
    process.cwd(),
    "storage",
    "payment-receipts",
  );

const ensureReceiptStorageDirectory =
  async () => {
    await fs.promises.mkdir(
      RECEIPT_STORAGE_DIR,
      {
        recursive: true,
      },
    );
  };

const resolveStoredReceiptPath = (
  receiptPath,
) => {
  if (!receiptPath) {
    return null;
  }

  const absolutePath =
    path.resolve(
      process.cwd(),
      String(receiptPath),
    );

  const validPath =
    absolutePath ===
      RECEIPT_STORAGE_DIR ||
    absolutePath.startsWith(
      `${RECEIPT_STORAGE_DIR}${path.sep}`,
    );

  if (!validPath) {
    return null;
  }

  return absolutePath;
};

const receiptFileExists =
  async (filePath) => {
    try {
      await fs.promises.access(
        filePath,
        fs.constants.F_OK,
      );

      return true;
    } catch {
      return false;
    }
  };

const getReceiptNumber = (
  payment,
) => {
  return (
    payment.receipt_number ||
    `RKN-${String(
      payment.id,
    ).padStart(6, "0")}`
  );
};

const writePaymentReceiptContent = (
  doc,
  {
    payment,
    student,
    domain,
    college,
  },
) => {
  const receiptNumber =
    getReceiptNumber(payment);

  doc
    .font("Helvetica-Bold")
    .fontSize(24)
    .fillColor("#1d4ed8")
    .text(
      "RKNexora",
      {
        align: "center",
      },
    );

  doc
    .moveDown(0.3)
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#0f172a")
    .text(
      "Internship Registration Receipt",
      {
        align: "center",
      },
    );

  doc
    .moveDown(0.4)
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#64748b")
    .text(
      "This receipt confirms successful registration and payment.",
      {
        align: "center",
      },
    );

  doc.moveDown(1.5);

  doc
    .strokeColor("#cbd5e1")
    .lineWidth(1)
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .stroke();

  doc.moveDown(1);

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#0f172a")
    .text(
      "Payment Details",
    );

  doc.moveDown(0.8);

  addReceiptRow(
    doc,
    "Receipt Number",
    receiptNumber,
  );

  addReceiptRow(
    doc,
    "Transaction ID",
    payment.transaction_id,
  );

  const paymentGateway =
    String(
      payment.gateway ||
        "cashfree",
    )
      .trim()
      .toLowerCase();

  addReceiptRow(
    doc,
    "Payment Gateway",
    paymentGateway ===
      "razorpay"
      ? "Razorpay"
      : "Cashfree",
  );

  if (
    paymentGateway ===
    "razorpay"
  ) {
    addReceiptRow(
      doc,
      "Razorpay Order ID",
      payment.razorpay_order_id ||
        payment.order_id ||
        "-",
    );

    addReceiptRow(
      doc,
      "Razorpay Payment ID",
      payment.razorpay_payment_id ||
        "-",
    );
  } else {
    addReceiptRow(
      doc,
      "Cashfree Order ID",
      payment.cashfree_order_id ||
        payment.order_id ||
        "-",
    );

    addReceiptRow(
      doc,
      "Cashfree Payment ID",
      payment.cf_payment_id ||
        "-",
    );
  }

  addReceiptRow(
    doc,
    "Payment Status",
    "Paid",
  );

  addReceiptRow(
    doc,
    "Payment Date",
    formatReceiptDate(
      payment.paid_at ||
        payment.updated_at ||
        payment.updatedAt ||
        payment.created_at ||
        payment.createdAt,
    ),
  );

  addReceiptRow(
    doc,
    "Amount Paid",
    formatAmount(
      payment.amount,
    ),
  );

  doc.moveDown(0.7);

  doc
    .strokeColor("#cbd5e1")
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .stroke();

  doc.moveDown(1);

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#0f172a")
    .text(
      "Student Registration Details",
    );

  doc.moveDown(0.8);

  addReceiptRow(
  doc,
  "RK Nexora Registration No.",
  student.portal_registration_number ||
    "-",
);

addReceiptRow(
  doc,
  "College Registration No.",
  student.registration_number ||
    "-",
);
  addReceiptRow(
    doc,
    "Student Name",
    student.full_name ||
      student.name ||
      "-",
  );

  addReceiptRow(
    doc,
    "Father Name",
    student.father_name ||
      "-",
  );

  addReceiptRow(
    doc,
    "Email",
    student.email || "-",
  );

  addReceiptRow(
    doc,
    "Mobile",
    student.mobile || "-",
  );

  addReceiptRow(
    doc,
    "Programme",
    student.programme ||
      "-",
  );

  addReceiptRow(
    doc,
    "Major Subject",
    student.major_subject ||
      "-",
  );

  addReceiptRow(
    doc,
    "Session",
    student.session ||
      "-",
  );

  addReceiptRow(
    doc,
    "Semester",
    student.semester ||
      "-",
  );

  addReceiptRow(
    doc,
    "College",
    college?.name ||
      "-",
  );

  addReceiptRow(
    doc,
    "Internship Domain",
    domain?.domain_name ||
      "-",
  );

  addReceiptRow(
    doc,
    "Registration Status",
    student.internship_status,
  );

  doc.moveDown(1.5);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#64748b")
    .text(
      "This is a computer-generated receipt and does not require a physical signature.",
      {
        align: "center",
      },
    );

  doc
    .moveDown(0.5)
    .text(
      `Generated on ${formatReceiptDate(
        new Date(),
      )}`,
      {
        align: "center",
      },
    );
};

const ensurePaymentReceipt =
  async (paymentId) => {
    const payment =
      await Payment.findByPk(
        paymentId,
      );

    if (!payment) {
      throw new AppError(
        "Payment record not found",
        404,
      );
    }

    if (
      ![
        "success",
        "paid",
      ].includes(
        payment.status,
      )
    ) {
      throw new AppError(
        "Receipt is available only after successful payment",
        409,
      );
    }

    const existingReceiptPath =
      resolveStoredReceiptPath(
        payment.receipt_path,
      );

    if (
      existingReceiptPath &&
      await receiptFileExists(
        existingReceiptPath,
      )
    ) {
      return {
        absolutePath:
          existingReceiptPath,

        fileName:
          path.basename(
            existingReceiptPath,
          ),

        receiptNumber:
          getReceiptNumber(
            payment,
          ),
      };
    }

    const student =
      await Student.findByPk(
        payment.student_id,
      );

    if (!student) {
      throw new AppError(
        "Student record not found",
        404,
      );
    }

    if (
      student.payment_status !==
      "paid"
    ) {
      throw new AppError(
        "Student payment is not completed",
        409,
      );
    }

    const domain =
      student.domain_id
        ? await Domain.findByPk(
            student.domain_id,
          )
        : null;

    const college =
      student.college_id
        ? await College.findByPk(
            student.college_id,
          )
        : null;

    await ensureReceiptStorageDirectory();

    const receiptNumber =
      getReceiptNumber(
        payment,
      );

    const safeRegistrationNumber =
      String(
        student.registration_number ||
          `student-${student.id}`,
      ).replace(
        /[^a-zA-Z0-9-_]/g,
        "_",
      );

    const fileName =
      `receipt-${safeRegistrationNumber}-${payment.id}.pdf`;

    const absolutePath =
      path.join(
        RECEIPT_STORAGE_DIR,
        fileName,
      );

    const relativePath =
      path
        .relative(
          process.cwd(),
          absolutePath,
        )
        .split(path.sep)
        .join("/");

    await new Promise(
      (
        resolve,
        reject,
      ) => {
        const output =
          fs.createWriteStream(
            absolutePath,
          );

        const doc =
          new PDFDocument({
            size: "A4",
            margin: 50,

            info: {
              Title:
                `Payment Receipt - ${student.registration_number}`,

              Author:
                "RKNexora",

              Subject:
                "Internship Registration Payment Receipt",
            },
          });

        let settled = false;

        const handleError = (
          error,
        ) => {
          if (settled) {
            return;
          }

          settled = true;
          reject(error);
        };

        output.on(
          "finish",
          () => {
            if (settled) {
              return;
            }

            settled = true;
            resolve();
          },
        );

        output.on(
          "error",
          handleError,
        );

        doc.on(
          "error",
          handleError,
        );

        doc.pipe(output);

        writePaymentReceiptContent(
          doc,
          {
            payment,
            student,
            domain,
            college,
          },
        );

        doc.end();
      },
    );

    await payment.update({
      receipt_path:
        relativePath,

      receipt_generated_at:
        new Date(),

      receipt_number:
        receiptNumber,
    });

    return {
      absolutePath,
      fileName,
      receiptNumber,
    };
  };

export const downloadPaymentReceipt =
  asyncHandler(async (req, res) => {
    const transactionId =
      String(
        req.params.transaction_id ||
          "",
      ).trim();

    if (!transactionId) {
      throw new AppError(
        "Transaction ID is required",
        422,
      );
    }

    const payment =
      await Payment.findOne({
        where: {
          [Op.or]: [
            {
              transaction_id:
                transactionId,
            },
            {
              cashfree_order_id:
                transactionId,
            },
            {
              cf_payment_id:
                transactionId,
            },
            {
              razorpay_order_id:
                transactionId,
            },
            {
              razorpay_payment_id:
                transactionId,
            },
          ],
        },
      });

    if (!payment) {
      throw new AppError(
        "Payment record not found",
        404,
      );
    }

    const receipt =
      await ensurePaymentReceipt(
        payment.id,
      );

    res.setHeader(
      "Cache-Control",
      "private, no-store",
    );

    return res.download(
      receipt.absolutePath,
      receipt.fileName,
    );
  });