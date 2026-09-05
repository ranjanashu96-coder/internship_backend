import {
  Op,
} from "sequelize";

import {
  College,
  Student,
  Payment,
  CollegeSettlement,
} from "../models/index.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  AppError,
  ok,
} from "../utils/response.js";

const toNumber = (value) => {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
};

const money = (value) =>
  Number(
    toNumber(value).toFixed(2),
  );

const getCollegeId = (req) => {
  const collegeId =
    Number(
      req.user?.college_id,
    );

  if (!collegeId) {
    throw new AppError(
      "College is not assigned to this user",
      400,
    );
  }

  return collegeId;
};

const getCollegeFinancialSummary =
  async (
    collegeId,
    options = {},
  ) => {
    const transaction =
      options.transaction;

    const college =
      await College.findByPk(
        collegeId,
        {
          attributes: [
            "id",
            "name",
            "code",
            "university",
            "college_share",
            "rknexora_share",
            "status",
          ],

          transaction,

          ...(options.lock
            ? {
                lock:
                  transaction
                    ?.LOCK?.UPDATE,
              }
            : {}),
        },
      );

    if (!college) {
      throw new AppError(
        "College not found",
        404,
      );
    }

    const studentRows =
      await Student.findAll({
        where: {
          college_id:
            college.id,
        },

        attributes: [
          "id",
        ],

        raw: true,
        transaction,
      });

    const studentIds =
      studentRows.map(
        (student) =>
          Number(student.id),
      );

    let grossRevenue = 0;
    let successfulPayments = 0;

    if (
      studentIds.length >
      0
    ) {
      const paymentRows =
        await Payment.findAll({
          where: {
            student_id: {
              [Op.in]:
                studentIds,
            },

            status:
              "success",
          },

          attributes: [
            "amount",
          ],

          raw: true,
          transaction,
        });

      successfulPayments =
        paymentRows.length;

      grossRevenue =
        paymentRows.reduce(
          (
            total,
            payment,
          ) =>
            total +
            toNumber(
              payment.amount,
            ),
          0,
        );
    }

    const sharePercentage =
      toNumber(
        college.college_share,
      );

    const earnedShare =
      grossRevenue *
      (sharePercentage /
        100);

    const totalPaid =
      toNumber(
        await CollegeSettlement.sum(
          "amount",
          {
            where: {
              college_id:
                college.id,
            },

            transaction,
          },
        ),
      );

    const remaining =
      Math.max(
        0,
        earnedShare -
          totalPaid,
      );

    return {
      college: {
        id:
          Number(college.id),

        name:
          college.name,

        code:
          college.code,

        university:
          college.university,

        status:
          college.status,

        college_share:
          money(
            college.college_share,
          ),

        rknexora_share:
          money(
            college.rknexora_share,
          ),
      },

      summary: {
        gross_revenue:
          money(
            grossRevenue,
          ),

        successful_payments:
          successfulPayments,

        college_share_percentage:
          money(
            sharePercentage,
          ),

        earned_share:
          money(
            earnedShare,
          ),

        total_paid:
          money(
            totalPaid,
          ),

        remaining_payable:
          money(
            remaining,
          ),

        settlement_percentage:
          earnedShare > 0
            ? money(
                Math.min(
                  100,
                  (totalPaid /
                    earnedShare) *
                    100,
                ),
              )
            : 0,
      },
    };
  };

/**
 * GET /api/admin/college-payments
 */
export const getAdminCollegePayments =
  asyncHandler(
    async (req, res) => {
      const search =
        String(
          req.query.search ||
            "",
        ).trim();

      const status =
        String(
          req.query.status ||
            "",
        ).trim();

      const where = {};

      if (search) {
        where[Op.or] = [
          {
            name: {
              [Op.like]:
                `%${search}%`,
            },
          },
          {
            code: {
              [Op.like]:
                `%${search}%`,
            },
          },
          {
            university: {
              [Op.like]:
                `%${search}%`,
            },
          },
        ];
      }

      if (status) {
        where.status =
          status;
      }

      const colleges =
        await College.findAll({
          where,

          attributes: [
            "id",
          ],

          order: [
            ["name", "ASC"],
          ],

          raw: true,
        });

      const items = [];

      for (
        const college of
        colleges
      ) {
        const data =
          await getCollegeFinancialSummary(
            college.id,
          );

        items.push({
          ...data.college,
          ...data.summary,
        });
      }

      const summary =
        items.reduce(
          (
            result,
            item,
          ) => {
            result.gross_revenue +=
              toNumber(
                item.gross_revenue,
              );

            result.total_college_share +=
              toNumber(
                item.earned_share,
              );

            result.total_paid +=
              toNumber(
                item.total_paid,
              );

            result.remaining_payable +=
              toNumber(
                item.remaining_payable,
              );

            if (
              toNumber(
                item.remaining_payable,
              ) > 0
            ) {
              result.pending_colleges +=
                1;
            }

            return result;
          },
          {
            total_colleges:
              items.length,

            gross_revenue: 0,
            total_college_share: 0,
            total_paid: 0,
            remaining_payable: 0,
            pending_colleges: 0,
          },
        );

      return ok(
        res,
        {
          items,

          summary: {
            ...summary,

            gross_revenue:
              money(
                summary.gross_revenue,
              ),

            total_college_share:
              money(
                summary.total_college_share,
              ),

            total_paid:
              money(
                summary.total_paid,
              ),

            remaining_payable:
              money(
                summary.remaining_payable,
              ),
          },
        },
      );
    },
  );

/**
 * GET /api/admin/college-payments/:collegeId
 */
export const getAdminCollegePaymentDetail =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        Number(
          req.params.collegeId,
        );

      if (!collegeId) {
        throw new AppError(
          "Invalid college ID",
          422,
        );
      }

      const data =
        await getCollegeFinancialSummary(
          collegeId,
        );

      const history =
        await CollegeSettlement.findAll(
          {
            where: {
              college_id:
                collegeId,
            },

            order: [
              [
                "payment_date",
                "DESC",
              ],
              [
                "id",
                "DESC",
              ],
            ],
          },
        );

      return ok(
        res,
        {
          ...data,

          history,
        },
      );
    },
  );

/**
 * POST /api/admin/college-payments/:collegeId
 */
export const createCollegePayment =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        Number(
          req.params.collegeId,
        );

      if (!collegeId) {
        throw new AppError(
          "Invalid college ID",
          422,
        );
      }

      const amount =
        money(
          req.body.amount,
        );

      const paymentDate =
        String(
          req.body.payment_date ||
            "",
        ).trim();

      const paymentMode =
        String(
          req.body.payment_mode ||
            "bank_transfer",
        ).trim();

      const allowedModes =
        new Set([
          "bank_transfer",
          "upi",
          "cheque",
          "cash",
          "other",
        ]);

      if (amount <= 0) {
        throw new AppError(
          "Payment amount must be greater than 0",
          422,
        );
      }

      if (!paymentDate) {
        throw new AppError(
          "Payment date is required",
          422,
        );
      }

      if (
        !allowedModes.has(
          paymentMode,
        )
      ) {
        throw new AppError(
          "Invalid payment mode",
          422,
        );
      }

      const transaction =
        await CollegeSettlement.sequelize.transaction();

      try {
        const current =
          await getCollegeFinancialSummary(
            collegeId,
            {
              transaction,
              lock: true,
            },
          );

        const remaining =
          toNumber(
            current.summary
              .remaining_payable,
          );

        if (
          remaining <= 0
        ) {
          throw new AppError(
            "No payable balance is pending for this college",
            422,
          );
        }

        if (
          amount >
          remaining + 0.009
        ) {
          throw new AppError(
            `Payment cannot exceed remaining payable ₹${remaining.toFixed(
              2,
            )}`,
            422,
          );
        }

        const balanceAfter =
          Math.max(
            0,
            remaining -
              amount,
          );

        const receiptFile =
          req.file
            ? `/uploads/college-settlements/${req.file.filename}`
            : null;

        const settlement =
          await CollegeSettlement.create(
            {
              college_id:
                collegeId,

              amount,

              payment_date:
                paymentDate,

              payment_mode:
                paymentMode,

              transaction_reference:
                String(
                  req.body.transaction_reference ||
                    "",
                ).trim() ||
                null,

              remarks:
                String(
                  req.body.remarks ||
                    "",
                ).trim() ||
                null,

              receipt_file:
                receiptFile,

              share_percentage_snapshot:
                current.summary
                  .college_share_percentage,

              earned_share_snapshot:
                current.summary
                  .earned_share,

              balance_before:
                money(
                  remaining,
                ),

              balance_after:
                money(
                  balanceAfter,
                ),

              created_by:
                req.user?.id ||
                null,
            },
            {
              transaction,
            },
          );

        await transaction.commit();

        const updated =
          await getCollegeFinancialSummary(
            collegeId,
          );

        return ok(
          res,
          {
            settlement,

            ...updated,
          },
          "College payment saved successfully",
        );
      } catch (error) {
        await transaction.rollback();

        throw error;
      }
    },
  );

/**
 * GET /api/college/payments
 */
export const getMyCollegePayments =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        getCollegeId(req);

      const data =
        await getCollegeFinancialSummary(
          collegeId,
        );

      const history =
        await CollegeSettlement.findAll(
          {
            where: {
              college_id:
                collegeId,
            },

            order: [
              [
                "payment_date",
                "DESC",
              ],
              [
                "id",
                "DESC",
              ],
            ],
          },
        );

      return ok(
        res,
        {
          ...data,

          history,
        },
      );
    },
  );
