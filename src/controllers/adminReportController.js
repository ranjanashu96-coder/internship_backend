import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { Op } from "sequelize";

import {
  Attendance,
  College,
  Domain,
  Payment,
  Student,
} from "../models/index.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";

const REPORT_TYPES = new Set([
  "student_registration",
  "attendance",
  "completion",
  "payment",
]);

const REPORT_COLUMNS = {
  student_registration: [
    { key: "registration_number", label: "College Registration No." },
    { key: "portal_registration_number", label: "RK Nexora Registration No." },
    { key: "student_id", label: "Student ID" },
    { key: "name", label: "Student Name" },
    { key: "college", label: "College" },
    { key: "domain", label: "Domain" },
    { key: "programme", label: "Programme" },
    { key: "session", label: "Session" },
    { key: "semester", label: "Semester" },
    { key: "registration_date", label: "Registration Date" },
    { key: "internship_status", label: "Internship Status" },
    { key: "payment_status", label: "Payment Status" },
  ],
  attendance: [
    { key: "registration_number", label: "Registration No." },
    { key: "name", label: "Student Name" },
    { key: "college", label: "College" },
    { key: "domain", label: "Domain" },
    { key: "session", label: "Session" },
    { key: "semester", label: "Semester" },
    { key: "total_days", label: "Total Days" },
    { key: "present_days", label: "Present" },
    { key: "half_days", label: "Half Days" },
    { key: "absent_days", label: "Absent" },
    { key: "leave_days", label: "Leave" },
    { key: "learning_hours", label: "Learning Hours" },
    { key: "attendance_percentage", label: "Attendance %" },
  ],
  completion: [
    { key: "registration_number", label: "Registration No." },
    { key: "name", label: "Student Name" },
    { key: "college", label: "College" },
    { key: "domain", label: "Domain" },
    { key: "session", label: "Session" },
    { key: "semester", label: "Semester" },
    { key: "internship_status", label: "Internship Status" },
    { key: "total_progress", label: "Progress %" },
    { key: "internship_start_date", label: "Start Date" },
    { key: "internship_end_date", label: "End Date" },
    { key: "certificate_generated", label: "Certificate Generated" },
  ],
  payment: [
    { key: "transaction_id", label: "Transaction ID" },
    { key: "cashfree_order_id", label: "Cashfree Order ID" },
    { key: "registration_number", label: "Registration No." },
    { key: "student_name", label: "Student Name" },
    { key: "college", label: "College" },
    { key: "domain", label: "Domain" },
    { key: "amount", label: "Amount" },
    { key: "currency", label: "Currency" },
    { key: "payment_status", label: "Payment Status" },
    { key: "payment_date", label: "Payment Date" },
  ],
};

const clean = (value) => String(value || "").trim();

const positiveInt = (value, fallback, max) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(date);
};

const getParams = (query) => {
  const reportType = clean(query.report_type) || "student_registration";

  if (!REPORT_TYPES.has(reportType)) {
    throw new AppError("Invalid report type", 422);
  }

  const fromDate = clean(query.from_date);
  const toDate = clean(query.to_date);

  if (fromDate && toDate && fromDate > toDate) {
    throw new AppError("From date cannot be after to date", 422);
  }

  return {
    reportType,
    page: positiveInt(query.page, 1, 100000),
    limit: positiveInt(query.limit, 20, 100),
    search: clean(query.search),
    collegeId: Number(query.college_id) || null,
    domainId: Number(query.domain_id) || null,
    session: clean(query.session),
    semester: clean(query.semester),
    internshipStatus: clean(query.internship_status),
    paymentStatus: clean(query.payment_status),
    fromDate,
    toDate,
  };
};

const buildStudentWhere = (params) => {
  const where = {};

  if (params.search) {
    const search = `%${params.search}%`;
    where[Op.or] = [
      { name: { [Op.like]: search } },
      { registration_number: { [Op.like]: search } },
      { portal_registration_number: { [Op.like]: search } },
      { student_id: { [Op.like]: search } },
      { email: { [Op.like]: search } },
      { mobile: { [Op.like]: search } },
    ];
  }

  if (params.collegeId) where.college_id = params.collegeId;
  if (params.domainId) where.domain_id = params.domainId;
  if (params.session) where.session = params.session;
  if (params.semester) where.semester = params.semester;
  if (params.internshipStatus) where.internship_status = params.internshipStatus;
  if (params.paymentStatus) where.payment_status = params.paymentStatus;

  if (
    params.reportType === "student_registration" &&
    (params.fromDate || params.toDate)
  ) {
    where.registration_date = {};
    if (params.fromDate) where.registration_date[Op.gte] = params.fromDate;
    if (params.toDate) where.registration_date[Op.lte] = params.toDate;
  }

  return where;
};

const studentIncludes = [
  {
    model: College,
    as: "college",
    attributes: ["id", "name", "code"],
    required: false,
  },
  {
    model: Domain,
    as: "domain",
    attributes: ["id", "domain_name"],
    required: false,
  },
];

const serializeStudent = (student) => ({
  id: student.id,
  registration_number: student.registration_number,
  portal_registration_number: student.portal_registration_number || null,
  student_id: student.student_id || null,
  name: student.name,
  college: student.college?.name || "-",
  domain: student.domain?.domain_name || "-",
  programme: student.programme || "-",
  major_subject: student.major_subject || "-",
  session: student.session || "-",
  semester: student.semester || "-",
  mobile: student.mobile || "-",
  email: student.email || "-",
  registration_date: formatDate(student.registration_date),
  internship_status: student.internship_status,
  payment_status: student.payment_status,
  total_progress: Number(student.total_progress || 0).toFixed(2),
  internship_start_date: formatDate(student.internship_start_date),
  internship_end_date: formatDate(student.internship_end_date),
  certificate_generated: student.certificate_generated ? "Yes" : "No",
});

const getFilteredStudentIds = async (studentWhere) => {
  const students = await Student.findAll({
    where: studentWhere,
    attributes: ["id"],
    raw: true,
  });

  return students.map((student) => Number(student.id));
};

const buildAttendanceWhere = (params, studentIds) => {
  const where = {
    student_id: { [Op.in]: studentIds },
  };

  if (params.fromDate || params.toDate) {
    where.date = {};
    if (params.fromDate) where.date[Op.gte] = params.fromDate;
    if (params.toDate) where.date[Op.lte] = params.toDate;
  }

  return where;
};

const buildPaymentWhere = (params, studentIds) => {
  const where = {
    student_id: { [Op.in]: studentIds },
  };

  if (params.paymentStatus) {
    if (params.paymentStatus === "paid") {
      where.status = "success";
    } else if (params.paymentStatus === "pending") {
      where.status = { [Op.in]: ["created", "pending"] };
    } else {
      where.status = params.paymentStatus;
    }
  }

  if (params.fromDate || params.toDate) {
    where.created_at = {};
    if (params.fromDate) {
      where.created_at[Op.gte] = new Date(`${params.fromDate}T00:00:00`);
    }
    if (params.toDate) {
      where.created_at[Op.lte] = new Date(`${params.toDate}T23:59:59`);
    }
  }

  return where;
};

const getSummary = async (studentWhere, params) => {
  const students = await Student.findAll({
    where: studentWhere,
    attributes: ["id", "internship_status", "payment_status"],
    raw: true,
  });

  const studentIds = students.map((student) => Number(student.id));
  const activeStudents = students.filter((item) => item.internship_status === "active").length;
  const completedStudents = students.filter((item) => item.internship_status === "completed").length;
  const paidStudents = students.filter((item) => item.payment_status === "paid").length;
  const pendingPayments = students.filter((item) => item.payment_status === "pending").length;

  let totalRevenue = 0;

  if (studentIds.length) {
    totalRevenue = Number(
      await Payment.sum("amount", {
        where: buildPaymentWhere(
          { ...params, paymentStatus: "paid" },
          studentIds,
        ),
      }),
    ) || 0;
  }

  return {
    total_students: students.length,
    active_students: activeStudents,
    completed_students: completedStudents,
    paid_students: paidStudents,
    pending_payments: pendingPayments,
    total_revenue: Number(totalRevenue.toFixed(2)),
  };
};

const getStudentReport = async (params, studentWhere, exportMode = false) => {
  const commonQuery = {
    where: studentWhere,
    include: studentIncludes,
    order: [["created_at", "DESC"]],
    distinct: true,
  };

  if (exportMode) {
    const students = await Student.findAll({
      ...commonQuery,
      limit: 50000,
    });

    return {
      count: students.length,
      rows: students.map(serializeStudent),
    };
  }

  const result = await Student.findAndCountAll({
    ...commonQuery,
    limit: params.limit,
    offset: (params.page - 1) * params.limit,
  });

  return {
    count: Number(result.count),
    rows: result.rows.map(serializeStudent),
  };
};

const getAttendanceReport = async (params, studentWhere, exportMode = false) => {
  const studentResult = await getStudentReport(params, studentWhere, exportMode);
  const studentIds = studentResult.rows.map((student) => Number(student.id));

  const attendanceRows = studentIds.length
    ? await Attendance.findAll({
        where: buildAttendanceWhere(params, studentIds),
        attributes: ["student_id", "date", "status", "learning_hours"],
        raw: true,
      })
    : [];

  const attendanceMap = new Map();

  attendanceRows.forEach((attendance) => {
    const studentId = Number(attendance.student_id);
    const current = attendanceMap.get(studentId) || {
      total_days: 0,
      present_days: 0,
      half_days: 0,
      absent_days: 0,
      leave_days: 0,
      learning_hours: 0,
    };

    current.total_days += 1;
    const status = clean(attendance.status).toLowerCase();

    if (status === "present") current.present_days += 1;
    else if (status === "half_day") current.half_days += 1;
    else if (status === "leave") current.leave_days += 1;
    else current.absent_days += 1;

    current.learning_hours += Number(attendance.learning_hours || 0);
    attendanceMap.set(studentId, current);
  });

  const rows = studentResult.rows.map((student) => {
    const attendance = attendanceMap.get(Number(student.id)) || {
      total_days: 0,
      present_days: 0,
      half_days: 0,
      absent_days: 0,
      leave_days: 0,
      learning_hours: 0,
    };

    const attendancePercentage = attendance.total_days
      ? ((attendance.present_days + attendance.half_days * 0.5) /
          attendance.total_days) *
        100
      : 0;

    return {
      id: student.id,
      registration_number: student.registration_number,
      name: student.name,
      college: student.college,
      domain: student.domain,
      session: student.session,
      semester: student.semester,
      total_days: attendance.total_days,
      present_days: attendance.present_days,
      half_days: attendance.half_days,
      absent_days: attendance.absent_days,
      leave_days: attendance.leave_days,
      learning_hours: Number(attendance.learning_hours.toFixed(2)),
      attendance_percentage: Number(attendancePercentage.toFixed(2)),
    };
  });

  return {
    count: studentResult.count,
    rows,
  };
};

const getPaymentReport = async (params, studentWhere, exportMode = false) => {
  const studentIds = await getFilteredStudentIds(studentWhere);

  if (!studentIds.length) {
    return { count: 0, rows: [] };
  }

  const paymentWhere = buildPaymentWhere(params, studentIds);
  let payments;
  let count;

  if (exportMode) {
    payments = await Payment.findAll({
      where: paymentWhere,
      order: [["created_at", "DESC"]],
      limit: 50000,
    });
    count = payments.length;
  } else {
    const result = await Payment.findAndCountAll({
      where: paymentWhere,
      order: [["created_at", "DESC"]],
      limit: params.limit,
      offset: (params.page - 1) * params.limit,
    });
    payments = result.rows;
    count = Number(result.count);
  }

  const paymentStudentIds = [
    ...new Set(payments.map((payment) => Number(payment.student_id))),
  ];

  const students = await Student.findAll({
    where: { id: { [Op.in]: paymentStudentIds } },
    include: studentIncludes,
  });

  const studentMap = new Map(
    students.map((student) => [Number(student.id), serializeStudent(student)]),
  );

  const rows = payments.map((payment) => {
    const student = studentMap.get(Number(payment.student_id));

    return {
      id: payment.id,
      transaction_id: payment.transaction_id,
      cashfree_order_id: payment.cashfree_order_id || "-",
      registration_number: student?.registration_number || "-",
      student_name: student?.name || "-",
      college: student?.college || "-",
      domain: student?.domain || "-",
      amount: Number(payment.amount || 0).toFixed(2),
      currency: payment.currency || "INR",
      payment_status: payment.status === "success" ? "paid" : payment.status,
      payment_date: formatDate(
        payment.paid_at || payment.created_at || payment.createdAt,
      ),
    };
  });

  return { count, rows };
};

const getRows = async (params, exportMode = false) => {
  const studentWhere = buildStudentWhere(params);

  if (params.reportType === "attendance") {
    return getAttendanceReport(params, studentWhere, exportMode);
  }

  if (params.reportType === "payment") {
    return getPaymentReport(params, studentWhere, exportMode);
  }

  return getStudentReport(params, studentWhere, exportMode);
};

export const getAdminReport = asyncHandler(async (req, res) => {
  const params = getParams(req.query);
  const studentWhere = buildStudentWhere(params);

  const [reportResult, summary] = await Promise.all([
    getRows(params),
    getSummary(studentWhere, params),
  ]);

  return ok(
    res,
    {
      report_type: params.reportType,
      columns: REPORT_COLUMNS[params.reportType],
      rows: reportResult.rows,
      summary,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: reportResult.count,
        total_pages: Math.ceil(reportResult.count / params.limit),
      },
    },
    "Admin report fetched successfully",
  );
});

const setDownloadHeaders = (res, contentType, fileName) => {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Cache-Control", "private, no-store");
};

const exportExcel = (res, params, rows) => {
  const columns = REPORT_COLUMNS[params.reportType];
  const worksheetRows = rows.map((row) => {
    const output = {};
    columns.forEach((column) => {
      output[column.label] = row[column.key] ?? "-";
    });
    return output;
  });

  const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
  worksheet["!cols"] = columns.map(() => ({ wch: 24 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  const fileName = `rknexora-${params.reportType}-report.xlsx`;

  setDownloadHeaders(
    res,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName,
  );

  return res.end(buffer);
};

const exportPdf = (res, params, rows) => {
  const columns = REPORT_COLUMNS[params.reportType];
  const fileName = `rknexora-${params.reportType}-report.pdf`;

  setDownloadHeaders(res, "application/pdf", fileName);

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 36, bottom: 36, left: 36, right: 36 },
    info: {
      Title: "RK Nexora Admin Report",
      Author: "RK Nexora",
    },
  });

  doc.pipe(res);

  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#071a2f")
    .text("RK Nexora Admin Report");

  doc
    .moveDown(0.3)
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#64748b")
    .text(`Report type: ${params.reportType.replaceAll("_", " ")}`)
    .moveDown(0.2)
    .text(
      `Generated: ${new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date())}`,
    )
    .moveDown(1);

  if (!rows.length) {
    doc.fontSize(12).fillColor("#475569").text("No matching records found.");
    doc.end();
    return;
  }

  rows.forEach((row, index) => {
    const rowText = columns
      .map((column) => `${column.label}: ${row[column.key] ?? "-"}`)
      .join("   |   ");

    const textHeight = doc.heightOfString(rowText, { width: pageWidth });

    if (
      doc.y + textHeight + 18 >
      doc.page.height - doc.page.margins.bottom
    ) {
      doc.addPage();
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#0f172a")
      .text(`${index + 1}.`, { continued: true });

    doc
      .font("Helvetica")
      .fillColor("#334155")
      .text(` ${rowText}`, { width: pageWidth });

    doc
      .moveDown(0.35)
      .strokeColor("#e2e8f0")
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke()
      .moveDown(0.35);
  });

  doc.end();
};

export const exportAdminReport = asyncHandler(async (req, res) => {
  const params = getParams(req.query);
  const format = clean(req.query.format).toLowerCase();

  if (!["excel", "pdf"].includes(format)) {
    throw new AppError("Export format must be excel or pdf", 422);
  }

  const reportResult = await getRows(params, true);

  if (format === "excel") {
    return exportExcel(res, params, reportResult.rows);
  }

  return exportPdf(res, params, reportResult.rows);
});
