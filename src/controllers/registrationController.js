import PDFDocument from "pdfkit";
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

    marksheet:
      savedDocuments.marksheet ||
      null,
  };
};

const areDocumentsComplete = (documents) =>
  Boolean(
    documents.photo &&
      documents.identity_document &&
      documents.marksheet,
  );

const getStudentResponseData = (
  student,
  documents,
) => ({
  id: student.id,
  student_id: student.id,

  registration_number:
    student.registration_number,

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
        student_id: student.id,
        registration_number:
          student.registration_number,
        internship_status:
          student.internship_status,
        registration_locked: false,
        next_step: "documents",
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

      marksheet:
        files.marksheet?.[0]
          ? `/uploads/registration/${files.marksheet[0].filename}`
          : existingDocuments.marksheet,
    };

    if (!areDocumentsComplete(documents)) {
      throw new AppError(
        "Photo, identity document and marksheet are required",
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
        student_id: student.id,
        registration_number:
          student.registration_number,
        registration_locked: true,
        payment_status:
          student.payment_status,
        next_step: "payment",
      },
      "Registration confirmed and locked",
    );
  });

export const createPaymentOrder =
  asyncHandler(async (req, res) => {
    const studentId =
      Number(req.body.student_id);

    if (!studentId) {
      throw new AppError(
        "Student ID is required",
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
              required: false,
              attributes: [
                "id",
                "domain_name",
                "fee",
                "duration_hours",
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
      student.payment_status === "paid"
    ) {
      throw new AppError(
        "Payment is already completed.",
        409,
      );
    }

    if (
      student.internship_status !==
      "registered"
    ) {
      throw new AppError(
        "Complete registration details first.",
        409,
      );
    }

    if (
      !student.registration_locked
    ) {
      throw new AppError(
        "Review and confirm your registration before payment.",
        409,
      );
    }

    if (!student.domain_id) {
      throw new AppError(
        "Internship domain is not selected.",
        409,
      );
    }

    if (!student.domain) {
      throw new AppError(
        "Selected internship domain was not found.",
        404,
      );
    }

    const documents =
      getStudentDocuments(student);

    if (
      !areDocumentsComplete(
        documents,
      )
    ) {
      throw new AppError(
        "Required documents are incomplete.",
        409,
      );
    }

    const amount =
      Number(student.domain.fee);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new AppError(
        "A valid fee is not configured for the selected domain.",
        409,
      );
    }

    const existingPayment =
      await Payment.findOne({
        where: {
          student_id:
            student.id,

          status:
            "created",
        },
        order: [
          ["id", "DESC"],
        ],
      });

    if (existingPayment) {
      return ok(
        res,
        {
          payment_id:
            existingPayment.id,

          transaction_id:
            existingPayment.transaction_id,

          student_id:
            student.id,

          amount:
            Number(
              existingPayment.amount,
            ),

          domain: {
            id:
              student.domain.id,

            domain_name:
              student.domain.domain_name,
          },
        },
        "Existing payment order retrieved",
      );
    }

    const transactionId =
      `RKN-${Date.now()}-${student.id}`;

    const payment =
      await Payment.create({
        student_id:
          student.id,

        amount,

        transaction_id:
          transactionId,

        status:
          "created",
      });

    return ok(
      res,
      {
        payment_id:
          payment.id,

        transaction_id:
          transactionId,

        student_id:
          student.id,

        amount,

        domain: {
          id:
            student.domain.id,

          domain_name:
            student.domain.domain_name,
        },
      },
      "Payment order created",
    );
  });

export const simulatePaymentSuccess =
  asyncHandler(async (req, res) => {
    const transactionId = String(
      req.body.transaction_id || "",
    ).trim();

    if (!transactionId) {
      throw new AppError(
        "Transaction ID is required",
        422,
      );
    }

    const payment = await Payment.findOne({
      where: {
        transaction_id: transactionId,
      },
    });

    if (!payment) {
      throw new AppError(
        "Payment order not found",
        404,
      );
    }

    const student = await Student.findByPk(
      payment.student_id,
    );

    if (!student) {
      throw new AppError(
        "Student not found",
        404,
      );
    }

    if (!student.registration_locked) {
      throw new AppError(
        "Registration must be confirmed before payment",
        409,
      );
    }

    if (
      payment.status === "success" &&
      student.payment_status === "paid"
    ) {
      return ok(
        res,
        {
          student_id: student.id,
          transaction_id:
            payment.transaction_id,
          payment_status: "paid",
          internship_status: "active",
          registration_locked: true,
          next_step: "login",
        },
        "Payment was already completed",
      );
    }

    await payment.update({
      status: "success",

      gateway_payload: {
        ...req.body,
        simulated: true,
        paid_at:
          new Date().toISOString(),
      },
    });

    await student.update({
      payment_status: "paid",
      internship_status: "active",
      registration_locked: true,
    });

    return ok(
      res,
      {
        student_id: student.id,
        transaction_id:
          payment.transaction_id,
        payment_status: "paid",
        internship_status: "active",
        registration_locked: true,
        next_step: "login",
      },
      "Payment successful. Account activated",
    );
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
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(value || 0));
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

export const downloadPaymentReceipt =
  asyncHandler(async (req, res) => {
    const transactionId = String(
      req.params.transaction_id || "",
    ).trim();

    const registrationNumber = String(
      req.query.registration_number || "",
    ).trim();

    if (!transactionId) {
      throw new AppError(
        "Transaction ID is required",
        422,
      );
    }

    if (!registrationNumber) {
      throw new AppError(
        "Registration number is required",
        422,
      );
    }

    const payment = await Payment.findOne({
      where: {
        transaction_id: transactionId,
      },
    });

    if (!payment) {
      throw new AppError(
        "Payment record not found",
        404,
      );
    }

    if (payment.status !== "success") {
      throw new AppError(
        "Receipt is available only after successful payment",
        409,
      );
    }

    const student = await Student.findOne({
      where: {
        id: payment.student_id,
        registration_number: registrationNumber,
      },
    });

    if (!student) {
      throw new AppError(
        "Student registration details do not match",
        404,
      );
    }

    if (
      student.payment_status !== "paid" ||
      student.internship_status !== "active"
    ) {
      throw new AppError(
        "Student account is not active",
        409,
      );
    }

    const domain = student.domain_id
      ? await Domain.findByPk(student.domain_id)
      : null;

    const college = student.college_id
      ? await College.findByPk(student.college_id)
      : null;

    const receiptNumber = `RKN-${String(
      payment.id,
    ).padStart(6, "0")}`;

    const safeRegistrationNumber =
      student.registration_number.replace(
        /[^a-zA-Z0-9-_]/g,
        "_",
      );

    const fileName =
      `receipt-${safeRegistrationNumber}.pdf`;

    res.setHeader(
      "Content-Type",
      "application/pdf",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`,
    );

    res.setHeader(
      "Cache-Control",
      "no-store",
    );

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Payment Receipt - ${student.registration_number}`,
        Author: "RKNexora",
        Subject: "Internship Registration Payment Receipt",
      },
    });

    doc.pipe(res);

    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .fillColor("#1d4ed8")
      .text("RKNexora", {
        align: "center",
      });

    doc
      .moveDown(0.3)
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor("#0f172a")
      .text("Internship Registration Receipt", {
        align: "center",
      });

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
      .text("Payment Details");

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
      "Payment Status",
      "Paid",
    );

    addReceiptRow(
      doc,
      "Payment Date",
      formatReceiptDate(
        payment.updated_at ||
          payment.updatedAt ||
          payment.created_at ||
          payment.createdAt,
      ),
    );

    addReceiptRow(
      doc,
      "Amount Paid",
      formatAmount(payment.amount),
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
      .text("Student Registration Details");

    doc.moveDown(0.8);

    addReceiptRow(
      doc,
      "Registration Number",
      student.registration_number,
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
      student.father_name || "-",
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
      student.programme || "-",
    );

    addReceiptRow(
      doc,
      "Major Subject",
      student.major_subject || "-",
    );

    addReceiptRow(
      doc,
      "Session",
      student.session || "-",
    );

    addReceiptRow(
      doc,
      "Semester",
      student.semester || "-",
    );

    addReceiptRow(
      doc,
      "College",
      college?.name || "-",
    );

    addReceiptRow(
      doc,
      "Internship Domain",
      domain?.domain_name || "-",
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
        `Generated on ${formatReceiptDate(new Date())}`,
        {
          align: "center",
        },
      );

    doc.end();
  });