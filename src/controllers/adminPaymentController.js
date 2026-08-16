import { Op } from "sequelize";
import {
  Payment,
  Student,
} from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";

const parseJsonObject = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

export const listAdminPayments = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "").trim().toLowerCase();

  const allowedStatuses = [
    "created",
    "pending",
    "processing",
    "success",
    "paid",
    "failed",
    "refunded",
  ];

  if (status && !allowedStatuses.includes(status)) {
    throw new AppError("Invalid payment status", 422);
  }

  const where = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    const matchedStudents = await Student.findAll({
      attributes: ["id"],
      where: {
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { registration_number: { [Op.like]: `%${search}%` } },
          { student_id: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          { mobile: { [Op.like]: `%${search}%` } },
        ],
      },
      raw: true,
    });

    const studentIds = matchedStudents.map((student) => Number(student.id));

    where[Op.or] = [
      { transaction_id: { [Op.like]: `%${search}%` } },
      { order_id: { [Op.like]: `%${search}%` } },
      { cashfree_order_id: { [Op.like]: `%${search}%` } },
      { razorpay_order_id: { [Op.like]: `%${search}%` } },
      { cf_payment_id: { [Op.like]: `%${search}%` } },
      { razorpay_payment_id: { [Op.like]: `%${search}%` } },
    ];

    if (studentIds.length) {
      where[Op.or].push({
        student_id: { [Op.in]: studentIds },
      });
    }
  }

  const [result, createdCount, successCount, failedCount] = await Promise.all([
    Payment.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [["id", "DESC"]],
    }),
    Payment.count({ where: { status: "created" } }),
    Payment.count({ where: { status: "success" } }),
    Payment.count({ where: { status: "failed" } }),
  ]);

  const studentIds = [
    ...new Set(result.rows.map((payment) => Number(payment.student_id)).filter(Boolean)),
  ];

  const students = studentIds.length
    ? await Student.findAll({
        where: { id: { [Op.in]: studentIds } },
        attributes: [
          "id",
          "registration_number",
          "student_id",
          "name",
          "email",
          "mobile",
          "payment_status",
          "internship_status",
        ],
      })
    : [];

  const studentMap = new Map(
    students.map((student) => [Number(student.id), student.toJSON()]),
  );

  return ok(
    res,
    {
      items: result.rows.map((payment) => ({
        ...payment.toJSON(),
        student: studentMap.get(Number(payment.student_id)) || null,
        can_mark_success: payment.status === "created",
      })),
      total: result.count,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(result.count / limit)),
      summary: {
        total: await Payment.count(),
        created: createdCount,
        success: successCount,
        failed: failedCount,
      },
    },
    "Payments retrieved successfully",
  );
});

export const markAdminPaymentSuccessful = asyncHandler(async (req, res) => {
  const paymentId = Number(req.params.id);
  const reason = String(req.body.reason || "").trim();

  if (!paymentId) {
    throw new AppError("Payment ID is required", 422);
  }

  if (reason.length < 10) {
    throw new AppError("Update reason must be at least 10 characters", 422);
  }

  const transaction = await Payment.sequelize.transaction();

  try {
    const payment = await Payment.findByPk(paymentId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!payment) {
      throw new AppError("Payment record not found", 404);
    }

    if (payment.status === "success") {
      await transaction.commit();

      return ok(
        res,
        { payment_id: payment.id, payment_status: payment.status },
        "Payment is already successful",
      );
    }

    if (payment.status !== "created") {
      throw new AppError(
        `Only created payment can be updated. Current status: ${payment.status}`,
        409,
      );
    }

    const student = await Student.findByPk(payment.student_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!student) {
      throw new AppError("Student record not found", 404);
    }

    await payment.update(
      {
        status: "success",
        paid_at: payment.paid_at || new Date(),
        failure_reason: null,
        payment_message: "Payment marked successful by admin",
        gateway_payload: {
          ...parseJsonObject(payment.gateway_payload),
          admin_status_update: {
            previous_status: "created",
            new_status: "success",
            reason,
            updated_by: req.user?.id || null,
            updated_at: new Date().toISOString(),
          },
        },
      },
      { transaction },
    );

    await student.update(
      {
        payment_status: "paid",
        internship_status: "active",
      },
      { transaction },
    );

    await transaction.commit();

    return ok(
      res,
      {
        payment_id: payment.id,
        transaction_id: payment.transaction_id,
        payment_status: payment.status,
        student: {
          id: student.id,
          name: student.name,
          registration_number: student.registration_number,
          payment_status: student.payment_status,
          internship_status: student.internship_status,
        },
      },
      "Payment marked successful",
    );
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    throw error;
  }
});

export const updateAdminPayment = asyncHandler(async (req, res) => {
  const paymentId = Number(req.params.id);
  const transaction = await Payment.sequelize.transaction();

  try {
    const payment = await Payment.findByPk(paymentId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!payment) throw new AppError("Payment record not found", 404);

    const allowedStatuses = ["created", "pending", "processing", "success", "paid", "failed", "refunded"];
    const textFields = [
      "transaction_id", "gateway", "razorpay_order_id", "razorpay_payment_id",
      "razorpay_signature", "currency", "failure_reason", "order_id", "cf_order_id",
      "cf_payment_id", "payment_method", "payment_message", "cashfree_order_id",
      "receipt_path", "receipt_number",
    ];
    const updatePayload = {};

    for (const field of textFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        const value = req.body[field];
        updatePayload[field] = value === null || value === "" ? null : String(value).trim();
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "amount")) {
      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new AppError("Invalid payment amount", 422);
      updatePayload.amount = Number(amount.toFixed(2));
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
      const status = String(req.body.status).toLowerCase();
      if (!allowedStatuses.includes(status)) throw new AppError("Invalid payment status", 422);
      updatePayload.status = status;
    }

    for (const field of ["paid_at", "receipt_generated_at"]) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (!req.body[field]) updatePayload[field] = null;
        else {
          const date = new Date(req.body[field]);
          if (Number.isNaN(date.getTime())) throw new AppError(`Invalid ${field}`, 422);
          updatePayload[field] = date;
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "gateway_payload")) {
      let payload = req.body.gateway_payload;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); }
        catch { throw new AppError("Gateway payload must be valid JSON", 422); }
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new AppError("Gateway payload must be a JSON object", 422);
      }
      updatePayload.gateway_payload = payload;
    }

    updatePayload.gateway_payload = {
      ...parseJsonObject(updatePayload.gateway_payload ?? payment.gateway_payload),
      admin_edit: {
        updated_by: req.user?.id || null,
        updated_at: new Date().toISOString(),
      },
    };

    await payment.update(updatePayload, { transaction });

    const student = await Student.findByPk(payment.student_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (student && updatePayload.status) {
      const studentUpdate = {};
      if (["success", "paid"].includes(updatePayload.status)) {
        studentUpdate.payment_status = "paid";
        studentUpdate.internship_status = "active";
      } else if (updatePayload.status === "failed") studentUpdate.payment_status = "failed";
      else if (updatePayload.status === "refunded") studentUpdate.payment_status = "refunded";
      else studentUpdate.payment_status = "pending";
      await student.update(studentUpdate, { transaction });
    }

    await transaction.commit();
    return ok(res, { ...payment.toJSON(), student: student ? student.toJSON() : null }, "Payment updated successfully");
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
});
