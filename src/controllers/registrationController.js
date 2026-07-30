import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import axios from "axios";
import crypto from "crypto";
import { Op } from "sequelize";
import {
  Domain,
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
  asyncHandler(async (_req, res) => {
    const domains =
      await Domain.findAll({
        order: [
          ["domain_name", "ASC"],
        ],
      });

    return ok(
      res,
      domains,
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

    const student = await Student.findByPk(
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

    if (!student.registration_locked) {
      throw new AppError(
        "Confirm and lock registration before payment",
        409,
      );
    }

    if (
      student.payment_status === "paid"
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

    const amount = Number(
      student.domain.fee,
    );

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

    const customerEmail = String(
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

    const frontendUrl =
      process.env.CLIENT_URL;

    const backendUrl =
      process.env.BACKEND_URL;

    if (!frontendUrl || !backendUrl) {
      throw new AppError(
        "CLIENT_URL or BACKEND_URL is not configured",
        500,
      );
    }

    const orderId =
      createCashfreeOrderId(
        student.id,
      );

      const portalRegistrationNumber =
  student.portal_registration_number ||
  createPortalRegistrationNumber(
    student,
  );

    const payload = {
      order_id: orderId,
      order_amount: Number(
        amount.toFixed(2),
      ),
      order_currency: "INR",

      customer_details: {
        customer_id:
          `STUDENT_${student.id}`,

        customer_name:
          student.name || "Student",

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
    String(student.id),

  registration_number:
    String(
      student.registration_number ||
        "",
    ),

  portal_registration_number:
    portalRegistrationNumber,

  domain_id:
    String(
      student.domain.id,
    ),
},
    };

    let cashfreeOrder;

    try {
      const response =
        await axios.post(
          `${getCashfreeBaseUrl()}/orders`,
          payload,
          {
            headers: getCashfreeHeaders({
              "x-idempotency-key": crypto.randomUUID(),
              "x-request-id": crypto.randomUUID(),
            }),

            timeout: 20000,
          },
        );

      cashfreeOrder = response.data;
    } catch (error) {
      console.error(
        "Cashfree order error:",
        error.response?.data ||
          error.message,
      );

      throw new AppError(
        error.response?.data?.message ||
          "Unable to create payment order",
        error.response?.status || 500,
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
      student_id: student.id,
      amount,
      currency: "INR",
      transaction_id:
        transactionId,
      gateway: "cashfree",
      cashfree_order_id:
        orderId,
      cf_order_id:
        cashfreeOrder.cf_order_id
          ? String(
              cashfreeOrder.cf_order_id,
            )
          : null,
      status: "created",
      gateway_payload:
        cashfreeOrder,
    });

    return ok(
      res,
      {
        order_id: orderId,

        cf_order_id:
          cashfreeOrder.cf_order_id,

        payment_session_id:
          cashfreeOrder
            .payment_session_id,

        amount,
        currency: "INR",

        student: {
          id: student.id,
          name: student.name,
          email: student.email,
          mobile: student.mobile,
          registration_number:
            student.registration_number,
            portal_registration_number:
          portalRegistrationNumber,
        },

        domain: {
          id: student.domain.id,
          domain_name:
            student.domain
              .domain_name,
        },
      },
      "Payment order created successfully",
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

  if (
    !student.portal_registration_number
  ) {

    await student.update(
  {
    portal_registration_number:
      portalRegistrationNumber,

    registration_locked:
      true,

    payment_status:
      "paid",
  },
  {
    transaction,
  },
);

  }

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
      "registered",

    registration_locked:
      true,

    portal_registration_number:
      portalRegistrationNumber,

    internship_start_date:
      null,

    internship_end_date:
      null,
  },
  {
    transaction,
  },
);
    await transaction.commit();

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
    "registered",

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

  if (
    !student.portal_registration_number
  ) {
    await student.update(
  {
    payment_status:
      "paid",

    internship_status:
      "registered",

    registration_locked:
      true,

    portal_registration_number:
      portalRegistrationNumber,

    internship_start_date:
      null,

    internship_end_date:
      null,
  },
  {
    transaction,
  },
);
  }

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

  addReceiptRow(
    doc,
    "Cashfree Order ID",
    payment.cashfree_order_id ||
      "-",
  );

  addReceiptRow(
    doc,
    "Cashfree Payment ID",
    payment.cf_payment_id ||
      "-",
  );

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