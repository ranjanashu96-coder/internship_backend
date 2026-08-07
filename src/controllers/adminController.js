import fs from "fs";
import { Op ,fn ,col,} from "sequelize";
import {
  importStudents as importStudentsFromExcel,
} from "../services/excelImportService.js";

import {
  sequelize,
  User,
  College,
  Mentor,
  Student,
  Domain,
  CollegeDomainFee,
  BulkJob,
  
} from "../models/index.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";
import { hashPassword } from "../utils/security.js";
import {
  BULK_JOB_TYPES,
  bulkJobRunner,
} from "../jobs/bulkJobRunner.js";
import {
  notify,
} from "../services/notificationService.js";


const modelMap = {
  colleges: College,
  mentors: Mentor,
  students: Student,
};


const createCountMap = (
  rows,
  fieldName,
) => {
  return rows.reduce(
    (result, row) => {
      const key =
        row[fieldName] ??
        "unknown";

      result[key] =
        Number(row.count || 0);

      return result;
    },
    {},
  );
};

const getMonthKey = (
  date,
) => {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(2, "0");

  return `${year}-${month}`;
};

export const getAdminDashboard =
  asyncHandler(
    async (_req, res) => {
      const now =
        new Date();

      const trendStartDate =
        new Date(
          now.getFullYear(),
          now.getMonth() - 11,
          1,
        );

      const [
        totalColleges,
        totalMentors,
        totalStudents,
        totalDomains,

        unassignedStudents,

        studentStatusRows,
        paymentStatusRows,
        mentorStatusRows,
        collegeStatusRows,

        domainCountRows,
        collegeCountRows,

        recentStudents,
        recentColleges,

        registrationDateRows,
      ] = await Promise.all([
        College.count(),

        Mentor.count(),

        Student.count(),

        Domain.count(),

        Student.count({
          where: {
            mentor_id: null,
          },
        }),

        Student.findAll({
          attributes: [
            "internship_status",
            [
              fn(
                "COUNT",
                col("id"),
              ),
              "count",
            ],
          ],
          group: [
            "internship_status",
          ],
          raw: true,
        }),

        Student.findAll({
          attributes: [
            "payment_status",
            [
              fn(
                "COUNT",
                col("id"),
              ),
              "count",
            ],
          ],
          group: [
            "payment_status",
          ],
          raw: true,
        }),

        Mentor.findAll({
          attributes: [
            "status",
            [
              fn(
                "COUNT",
                col("id"),
              ),
              "count",
            ],
          ],
          group: ["status"],
          raw: true,
        }),

        College.findAll({
          attributes: [
            "status",
            [
              fn(
                "COUNT",
                col("id"),
              ),
              "count",
            ],
          ],
          group: ["status"],
          raw: true,
        }),

        Student.findAll({
          attributes: [
            "domain_id",
            [
              fn(
                "COUNT",
                col("id"),
              ),
              "student_count",
            ],
          ],
          where: {
            domain_id: {
              [Op.ne]: null,
            },
          },
          group: [
            "domain_id",
          ],
          raw: true,
        }),

        Student.findAll({
          attributes: [
            "college_id",
            [
              fn(
                "COUNT",
                col("id"),
              ),
              "student_count",
            ],
          ],
          where: {
            college_id: {
              [Op.ne]: null,
            },
          },
          group: [
            "college_id",
          ],
          raw: true,
        }),

        Student.findAll({
          attributes: [
            "id",
            "registration_number",
            "student_id",
            "name",
            "email",
            "session",
            "semester",
            "internship_status",
            "payment_status",
            "created_at",
          ],

          include: [
            {
              model: College,
              as: "college",
              attributes: [
                "id",
                "name",
                "code",
              ],
              required: false,
            },
            {
              model: Domain,
              as: "domain",
              attributes: [
                "id",
                "domain_name",
              ],
              required: false,
            },
          ],

          order: [
            [
              "id",
              "DESC",
            ],
          ],

          limit: 8,
        }),

        College.findAll({
          attributes: [
            "id",
            "name",
            "code",
            "university",
            "status",
            "created_at",
          ],

          order: [
            [
              "id",
              "DESC",
            ],
          ],

          limit: 5,
        }),

        Student.findAll({
          attributes: [
            "created_at",
          ],

          where: {
            created_at: {
              [Op.gte]:
                trendStartDate,
            },
          },

          raw: true,
        }),
      ]);

      const domainIds =
        domainCountRows
          .map((row) =>
            Number(
              row.domain_id,
            ),
          )
          .filter(Boolean);

      const collegeIds =
        collegeCountRows
          .map((row) =>
            Number(
              row.college_id,
            ),
          )
          .filter(Boolean);

      const [
        domains,
        colleges,
      ] = await Promise.all([
        domainIds.length
          ? Domain.findAll({
              where: {
                id: {
                  [Op.in]:
                    domainIds,
                },
              },
              attributes: [
                "id",
                "domain_name",
              ],
              raw: true,
            })
          : [],

        collegeIds.length
          ? College.findAll({
              where: {
                id: {
                  [Op.in]:
                    collegeIds,
                },
              },
              attributes: [
                "id",
                "name",
                "code",
              ],
              raw: true,
            })
          : [],
      ]);

      const domainMap =
        new Map(
          domains.map(
            (domain) => [
              Number(
                domain.id,
              ),
              domain,
            ],
          ),
        );

      const collegeMap =
        new Map(
          colleges.map(
            (college) => [
              Number(
                college.id,
              ),
              college,
            ],
          ),
        );

      const domainDistribution =
        domainCountRows
          .map((row) => {
            const domain =
              domainMap.get(
                Number(
                  row.domain_id,
                ),
              );

            return {
              domain_id:
                Number(
                  row.domain_id,
                ),

              domain_name:
                domain
                  ?.domain_name ??
                "Unknown domain",

              student_count:
                Number(
                  row.student_count ??
                    0,
                ),
            };
          })
          .sort(
            (first, second) =>
              second.student_count -
              first.student_count,
          );

      const collegeDistribution =
        collegeCountRows
          .map((row) => {
            const college =
              collegeMap.get(
                Number(
                  row.college_id,
                ),
              );

            return {
              college_id:
                Number(
                  row.college_id,
                ),

              college_name:
                college?.name ??
                "Unknown college",

              college_code:
                college?.code ??
                null,

              student_count:
                Number(
                  row.student_count ??
                    0,
                ),
            };
          })
          .sort(
            (first, second) =>
              second.student_count -
              first.student_count,
          );

      const monthlyMap =
        new Map();

      const monthlyRegistrations =
        Array.from(
          {
            length: 12,
          },
          (_, index) => {
            const date =
              new Date(
                now.getFullYear(),
                now.getMonth() -
                  11 +
                  index,
                1,
              );

            const key =
              getMonthKey(date);

            const month = {
              key,

              month:
                date.toLocaleString(
                  "en-US",
                  {
                    month:
                      "short",
                  },
                ),

              year:
                date.getFullYear(),

              label:
                date.toLocaleString(
                  "en-US",
                  {
                    month:
                      "short",
                    year:
                      "numeric",
                  },
                ),

              registrations: 0,
            };

            monthlyMap.set(
              key,
              month,
            );

            return month;
          },
        );

      for (
        const row of
        registrationDateRows
      ) {
        if (!row.created_at) {
          continue;
        }

        const date =
          new Date(
            row.created_at,
          );

        const month =
          monthlyMap.get(
            getMonthKey(date),
          );

        if (month) {
          month.registrations +=
            1;
        }
      }

      const studentStatus =
        createCountMap(
          studentStatusRows,
          "internship_status",
        );

      const paymentStatus =
        createCountMap(
          paymentStatusRows,
          "payment_status",
        );

      const mentorStatus =
        createCountMap(
          mentorStatusRows,
          "status",
        );

      const collegeStatus =
        createCountMap(
          collegeStatusRows,
          "status",
        );

      const activeStudents =
        Number(
          studentStatus.active ||
            0,
        );

      const completedStudents =
        Number(
          studentStatus.completed ||
            0,
        );

      const paidStudents =
        Number(
          paymentStatus.paid ||
            0,
        );

      const completionRate =
        totalStudents > 0
          ? Number(
              (
                (completedStudents /
                  totalStudents) *
                100
              ).toFixed(2),
            )
          : 0;

      const paymentRate =
        totalStudents > 0
          ? Number(
              (
                (paidStudents /
                  totalStudents) *
                100
              ).toFixed(2),
            )
          : 0;

      return ok(
        res,
        {
          summary: {
            total_colleges:
              totalColleges,

            active_colleges:
              Number(
                collegeStatus.active ||
                  0,
              ),

            pending_colleges:
              Number(
                collegeStatus.pending ||
                  0,
              ),

            total_mentors:
              totalMentors,

            active_mentors:
              Number(
                mentorStatus.active ||
                  0,
              ),

            inactive_mentors:
              Number(
                mentorStatus.inactive ||
                  0,
              ),

            total_students:
              totalStudents,

            active_students:
              activeStudents,

            completed_students:
              completedStudents,

            blocked_students:
              Number(
                studentStatus.blocked ||
                  0,
              ),

            paid_students:
              paidStudents,

            pending_payments:
              Number(
                paymentStatus.pending ||
                  0,
              ),

            unassigned_students:
              unassignedStudents,

            total_domains:
              totalDomains,

            completion_rate:
              completionRate,

            payment_rate:
              paymentRate,
          },

          student_status:
            studentStatus,

          payment_status:
            paymentStatus,

          mentor_status:
            mentorStatus,

          college_status:
            collegeStatus,

          monthly_registrations:
            monthlyRegistrations,

          domain_distribution:
            domainDistribution,

          college_distribution:
            collegeDistribution,

          recent_students:
            recentStudents,

          recent_colleges:
            recentColleges,
        },
        "Admin dashboard fetched successfully",
      );
    },
  );

const assignMentorToMatchingStudents = async ({
  mentor,
  transaction,
  overwriteExisting = false,
}) => {
  const where = {
    domain_id: mentor.domain_id,
  };

  if (mentor.college_id) {
    where.college_id = mentor.college_id;
  }

  if (!overwriteExisting) {
    where.mentor_id = null;
  }

  const [assignedStudentCount] =
    await Student.update(
      {
        mentor_id: mentor.id,
      },
      {
        where,
        transaction,
      },
    );

  return assignedStudentCount;
};

/**
 * Generic paginated list
 */
export const list = (entity) =>
  asyncHandler(async (req, res) => {
    const Model = modelMap[entity];

    if (!Model) {
      throw new AppError("Invalid entity", 400);
    }

    const page = Math.max(
      1,
      Number(req.query.page || 1),
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number(req.query.limit || 20),
      ),
    );

    const where = {};

    /*
    |--------------------------------------------------------------------------
    | Common status filter
    |--------------------------------------------------------------------------
    */

    if (req.query.status) {
      if (entity === "students") {
        where.internship_status =
          req.query.status;
      } else {
        where.status = req.query.status;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Student filters
    |--------------------------------------------------------------------------
    */

    if (entity === "students") {
      if (req.query.college_id) {
        where.college_id =
          req.query.college_id;
      }

      if (req.query.domain_id) {
  where.domain_id =
    req.query.domain_id;
}

if (req.query.batch_id) {
  where.batch_id =
    req.query.batch_id;
}

if (req.query.mentor_id) {
  where.mentor_id =
    req.query.mentor_id;
}

      if (req.query.session) {
        where.session =
          req.query.session;
      }

      if (req.query.semester) {
        where.semester =
          req.query.semester;
      }

      if (req.query.payment_status) {
  where.payment_status =
    req.query.payment_status;
}

      if (req.query.search) {
        where[Op.or] = [
          {
            registration_number: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
          {
            student_id: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
          {
            name: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
          {
            email: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
        ];
      }
    }

    /*
    |--------------------------------------------------------------------------
    | College search
    |--------------------------------------------------------------------------
    */

    if (
      entity === "colleges" &&
      req.query.search
    ) {
      where[Op.or] = [
        {
          name: {
            [Op.like]:
              `%${req.query.search}%`,
          },
        },
        {
          code: {
            [Op.like]:
              `%${req.query.search}%`,
          },
        },
        {
          university: {
            [Op.like]:
              `%${req.query.search}%`,
          },
        },
      ];
    }

    /*
    |--------------------------------------------------------------------------
    | Mentor filters
    |--------------------------------------------------------------------------
    */

    if (entity === "mentors") {
      if (req.query.domain_id) {
        where.domain_id =
          req.query.domain_id;
      }

      if (req.query.college_id) {
        where.college_id =
          req.query.college_id;
      }

      if (req.query.search) {
        where[Op.or] = [
          {
            employee_id: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
          {
            name: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
          {
            email: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
        ];
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Query options
    |--------------------------------------------------------------------------
    */

    const options = {
      where,
      limit,
      offset: (page - 1) * limit,
      order: [["id", "DESC"]],
      distinct: true,
    };

    /*
    |--------------------------------------------------------------------------
    | Student relations
    |--------------------------------------------------------------------------
    */

    if (entity === "students") {
      options.attributes = {
        exclude: ["password_hash"],
      };

      options.include = [
        {
          model: College,
          as: "college",
          attributes: [
            "id",
            "name",
            "code",
            "university",
          ],
          required: false,
        },
        {
  model: Domain,
  as: "domain",

  attributes: [
    "id",
    "sector_id",
    "domain_name",
  ],

  where:
    req.query.sector_id
      ? {
          sector_id:
            req.query.sector_id,
        }
      : undefined,

  required:
    Boolean(
      req.query.sector_id,
    ),
},
      ];
    }

    /*
    |--------------------------------------------------------------------------
    | Mentor relations
    |--------------------------------------------------------------------------
    */

    if (entity === "mentors") {
      options.attributes = {
        exclude: ["password_hash"],
      };

      options.include = [
        {
          model: Domain,
          as: "domain",
          attributes: [
            "id",
            "domain_name",
          ],
          required: false,
        },
        {
          model: College,
          as: "college",
          attributes: [
            "id",
            "name",
            "code",
          ],
          required: false,
        },
      ];
    }

    /*
    |--------------------------------------------------------------------------
    | College relations
    |--------------------------------------------------------------------------
    */

    if (entity === "colleges") {
      options.include = [
        {
          model: User,
          as: "users",
          attributes: [
            "id",
            "username",
            "email",
            "role",
            "status",
          ],
          where: {
            role: "college_admin",
          },
          required: false,
        },
      ];
    }

    const result =
      await Model.findAndCountAll(
        options,
      );

    ok(res, {
      items: result.rows,
      total: result.count,
      page,
      limit,
      totalPages: Math.ceil(
        result.count / limit,
      ),
    });
  });

/**
 * Get one record
 */
export const getById = (entity) =>
  asyncHandler(async (req, res) => {
    const Model = modelMap[entity];

    if (!Model) {
      throw new AppError("Invalid entity", 400);
    }

    const options = {};
    if (entity === "students") {
  options.attributes = {
    exclude: ["password_hash"],
  };

  options.include = [
    {
      model: College,
      as: "college",
      attributes: [
        "id",
        "name",
        "code",
        "university",
      ],
      required: false,
    },
    {
      model: Domain,
      as: "domain",
      attributes: [
        "id",
        "domain_name",
        "fee",
        "duration_hours",
      ],
      required: false,
    },
  ];
}

    if (entity === "colleges") {
      options.include = [
        {
          model: User,
          as: "users",
          attributes: [
            "id",
            "username",
            "email",
            "role",
            "status",
          ],
          where: {
            role: "college_admin",
          },
          required: false,
        },
      ];
    }

    if (entity === "mentors") {
  options.attributes = {
    exclude: ["password_hash"],
  };

  options.include = [
    {
      model: Domain,
      as: "domain",
      attributes: [
        "id",
        "domain_name",
        "fee",
        "duration_hours",
      ],
    },
    {
      model: College,
      as: "college",
      attributes: [
        "id",
        "name",
        "code",
      ],
      required: false,
    },
  ];
}

    const row = await Model.findByPk(req.params.id, options);

    if (!row) {
      throw new AppError("Record not found", 404);
    }

    ok(res, row);
  });

/**
 * Generic create for Mentor and Student only
 */
export const create = (entity) =>
  asyncHandler(async (req, res) => {
    const Model = modelMap[entity];

    if (!Model) {
      throw new AppError("Invalid entity", 400);
    }

    if (entity === "colleges") {
      throw new AppError(
        "Use dedicated college creation endpoint",
        400,
      );
    }

    const payload = {
      ...req.body,
    };

    if (payload.password) {
      payload.password_hash = await hashPassword(payload.password);
      delete payload.password;
    }

    const row = await Model.create(payload);

    ok(res, row, "Created", 201);
  });

/*
|--------------------------------------------------------------------------
| College-wise Domain Fees
|--------------------------------------------------------------------------
*/

export const getCollegeDomainFees =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        Number(
          req.params.collegeId,
        );

      if (!collegeId) {
        throw new AppError(
          "College is required",
          422,
        );
      }

      const college =
        await College.findByPk(
          collegeId,
          {
            attributes: [
              "id",
              "name",
              "code",
            ],
          },
        );

      if (!college) {
        throw new AppError(
          "College not found",
          404,
        );
      }

      const [
        domains,
        customFees,
      ] = await Promise.all([
        Domain.findAll({
          attributes: [
            "id",
            "sector_id",
            "domain_name",
            "fee",
            "duration_hours",
          ],

          order: [
            [
              "domain_name",
              "ASC",
            ],
          ],
        }),

        CollegeDomainFee.findAll({
          where: {
            college_id:
              collegeId,
          },

          attributes: [
            "id",
            "domain_id",
            "fee",
            "status",
          ],

          raw: true,
        }),
      ]);

      const feeMap =
        new Map(
          customFees.map(
            (item) => [
              Number(
                item.domain_id,
              ),
              item,
            ],
          ),
        );

      const items =
        domains.map(
          (domain) => {
            const custom =
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

            const activeCustomFee =
              custom?.status ===
              "active"
                ? Number(
                    custom.fee,
                  )
                : null;

            return {
              id:
                domain.id,

              sector_id:
                domain.sector_id,

              domain_name:
                domain.domain_name,

              duration_hours:
                domain.duration_hours,

              default_fee:
                defaultFee,

              custom_fee:
                custom
                  ? Number(
                      custom.fee,
                    )
                  : null,

              effective_fee:
                activeCustomFee ??
                defaultFee,

              fee_source:
                activeCustomFee !==
                null
                  ? "college"
                  : "default",

              status:
                custom?.status ||
                "default",
            };
          },
        );

      return ok(
        res,
        {
          college,
          items,
        },
        "College domain fees fetched successfully",
      );
    },
  );

export const saveCollegeDomainFees =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        Number(
          req.params.collegeId,
        );

      if (!collegeId) {
        throw new AppError(
          "College is required",
          422,
        );
      }

      const inputRows =
        Array.isArray(
          req.body.fees,
        )
          ? req.body.fees
          : [
              req.body,
            ];

      if (
        inputRows.length === 0
      ) {
        throw new AppError(
          "At least one domain fee is required",
          422,
        );
      }

      const transaction =
        await sequelize.transaction();

      try {
        const college =
          await College.findByPk(
            collegeId,
            {
              transaction,
            },
          );

        if (!college) {
          throw new AppError(
            "College not found",
            404,
          );
        }

        let savedCount = 0;
        let defaultCount = 0;

        for (
          const input of
          inputRows
        ) {
          const domainId =
            Number(
              input.domain_id,
            );

          if (!domainId) {
            throw new AppError(
              "Domain is required",
              422,
            );
          }

          const domain =
            await Domain.findByPk(
              domainId,
              {
                transaction,
              },
            );

          if (!domain) {
            throw new AppError(
              `Domain ${domainId} not found`,
              404,
            );
          }

          if (
            input.use_default ===
            true
          ) {
            await CollegeDomainFee.destroy({
              where: {
                college_id:
                  collegeId,

                domain_id:
                  domainId,
              },

              transaction,
            });

            defaultCount += 1;
            continue;
          }

          const fee =
            Number(
              input.fee,
            );

          if (
            !Number.isFinite(
              fee,
            ) ||
            fee <= 0
          ) {
            throw new AppError(
              `Valid fee is required for domain ${domainId}`,
              422,
            );
          }

          const status =
            input.status ===
            "inactive"
              ? "inactive"
              : "active";

          const existing =
            await CollegeDomainFee.findOne({
              where: {
                college_id:
                  collegeId,

                domain_id:
                  domainId,
              },

              transaction,
            });

          if (existing) {
            await existing.update(
              {
                fee,
                status,
                updated_at:
                  new Date(),
              },
              {
                transaction,
              },
            );
          } else {
            await CollegeDomainFee.create(
              {
                college_id:
                  collegeId,

                domain_id:
                  domainId,

                fee,
                status,

                created_at:
                  new Date(),

                updated_at:
                  new Date(),
              },
              {
                transaction,
              },
            );
          }

          savedCount += 1;
        }

        await transaction.commit();

        return ok(
          res,
          {
            college_id:
              collegeId,

            saved_count:
              savedCount,

            reset_to_default_count:
              defaultCount,
          },
          "College domain fees saved successfully",
        );
      } catch (error) {
        if (
          !transaction.finished
        ) {
          await transaction.rollback();
        }

        throw error;
      }
    },
  );

/**
 * Dedicated College creation
 *
 * Creates:
 * 1. College
 * 2. College admin user
 */
export const createCollege = asyncHandler(
  async (req, res) => {
    const transaction =
      await sequelize.transaction();

    try {
      const {
        name,
        code,
        university,
        principal_name,
        coordinator_name,
        email,
        mobile,
        address,
        state,
        district,
        pincode,
        college_share,
        rknexora_share,
        status,

        admin_username,
        admin_email,
        admin_password,
      } = req.body;

      if (!name || !code) {
        throw new AppError(
          "College name and code are required",
          422,
        );
      }

      if (
        !admin_username ||
        !admin_email ||
        !admin_password
      ) {
        throw new AppError(
          "College admin username, email and password are required",
          422,
        );
      }

      const totalShare =
        Number(college_share || 0) +
        Number(rknexora_share || 0);

      if (
        Math.abs(totalShare - 100) >
        0.01
      ) {
        throw new AppError(
          "College share and RKNexora share total must be 100",
          422,
        );
      }

      const existingCollege =
        await College.findOne({
          where: {
            code,
          },
          transaction,
        });

      if (existingCollege) {
        throw new AppError(
          "College code already exists",
          409,
        );
      }

      const existingUser =
        await User.findOne({
          where: {
            [Op.or]: [
              {
                username:
                  admin_username,
              },
              {
                email:
                  admin_email,
              },
            ],
          },
          transaction,
        });

      if (existingUser) {
        throw new AppError(
          "Admin username or email already exists",
          409,
        );
      }

      const logoPath = req.file
        ? `/uploads/colleges/${req.file.filename}`
        : null;

      const normalizedStatus =
        status === "inactive"
          ? "inactive"
          : "active";

      const college =
        await College.create(
          {
            name,
            code,
            university:
              university || null,
            principal_name:
              principal_name || null,
            coordinator_name:
              coordinator_name || null,
            email:
              email || null,
            mobile:
              mobile || null,
            address:
              address || null,
            state:
              state || null,
            district:
              district || null,
            pincode:
              pincode || null,
            logo:
              logoPath,
            college_share:
              Number(college_share),
            rknexora_share:
              Number(rknexora_share),
            status:
              normalizedStatus,
          },
          {
            transaction,
          },
        );

      const passwordHash =
        await hashPassword(
          admin_password,
        );

      const collegeAdmin =
        await User.create(
          {
            username:
              admin_username,
            email:
              admin_email,
            password_hash:
              passwordHash,
            role:
              "college_admin",
            college_id:
              college.id,
            status:
              college.status ===
              "active"
                ? "active"
                : "inactive",
          },
          {
            transaction,
          },
        );

      await transaction.commit();

      return ok(
        res,
        {
          college,
          admin: {
            id:
              collegeAdmin.id,
            username:
              collegeAdmin.username,
            email:
              collegeAdmin.email,
            role:
              collegeAdmin.role,
            college_id:
              collegeAdmin.college_id,
            status:
              collegeAdmin.status,
          },
        },
        "College and college admin created successfully",
        201,
      );
    } catch (error) {
      await transaction.rollback();

      if (
        req.file?.path &&
        fs.existsSync(req.file.path)
      ) {
        fs.unlinkSync(
          req.file.path,
        );
      }

      throw error;
    }
  },
);

/**
 * Generic update
 */
export const update = (entity) =>
  asyncHandler(async (req, res) => {
    const Model = modelMap[entity];

    if (!Model) {
      throw new AppError("Invalid entity", 400);
    }

    const row = await Model.findByPk(req.params.id);

    if (!row) {
      throw new AppError("Record not found", 404);
    }

    const payload = {
      ...req.body,
    };

    if (payload.password) {
      payload.password_hash = await hashPassword(
        payload.password,
      );

      delete payload.password;
    }

    await row.update(payload);

    ok(res, row, "Updated");
  });

/**
 * Dedicated College update
 */
export const updateCollege = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const college = await College.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!college) {
      throw new AppError("College not found", 404);
    }

    const {
      admin_username,
      admin_email,
      admin_password,
      ...collegePayload
    } = req.body;

    if (
      collegePayload.college_share !== undefined ||
      collegePayload.rknexora_share !== undefined
    ) {
      const collegeShare = Number(
        collegePayload.college_share ??
          college.college_share,
      );

      const rknexoraShare = Number(
        collegePayload.rknexora_share ??
          college.rknexora_share,
      );

      if (
        Math.abs(
          collegeShare + rknexoraShare - 100,
        ) > 0.01
      ) {
        throw new AppError(
          "College share and RKNexora share total must be 100",
          422,
        );
      }
    }

    delete collegePayload.id;
    delete collegePayload.created_at;
    delete collegePayload.updated_at;

    await college.update(collegePayload, {
      transaction,
    });

    const collegeAdmin = await User.findOne({
      where: {
        college_id: college.id,
        role: "college_admin",
      },
      transaction,
    });

    if (collegeAdmin) {
      const adminPayload = {};

      if (admin_username) {
        const existingUsername = await User.findOne({
          where: {
            username: admin_username,
            id: {
              [Op.ne]: collegeAdmin.id,
            },
          },
          transaction,
        });

        if (existingUsername) {
          throw new AppError(
            "Admin username already exists",
            409,
          );
        }

        adminPayload.username = admin_username;
      }

      if (admin_email) {
        const existingEmail = await User.findOne({
          where: {
            email: admin_email,
            id: {
              [Op.ne]: collegeAdmin.id,
            },
          },
          transaction,
        });

        if (existingEmail) {
          throw new AppError(
            "Admin email already exists",
            409,
          );
        }

        adminPayload.email = admin_email;
      }

      if (admin_password) {
        adminPayload.password_hash =
          await hashPassword(admin_password);
      }

      if (collegePayload.status) {
        adminPayload.status =
          collegePayload.status === "active"
            ? "active"
            : "inactive";
      }

      if (Object.keys(adminPayload).length > 0) {
        await collegeAdmin.update(adminPayload, {
          transaction,
        });
      }
    }

    await transaction.commit();

    ok(
      res,
      {
        college,
        admin: collegeAdmin
          ? {
              id: collegeAdmin.id,
              username: collegeAdmin.username,
              email: collegeAdmin.email,
              role: collegeAdmin.role,
              status: collegeAdmin.status,
            }
          : null,
      },
      "College updated successfully",
    );
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

/**
 * Approve/activate College
 */
export const approveCollege = asyncHandler(
  async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const college = await College.findByPk(
        req.params.id,
        {
          transaction,
        },
      );

      if (!college) {
        throw new AppError(
          "College not found",
          404,
        );
      }

      await college.update(
        {
          status: "active",
        },
        {
          transaction,
        },
      );

      await User.update(
        {
          status: "active",
        },
        {
          where: {
            college_id: college.id,
            role: "college_admin",
          },
          transaction,
        },
      );

      await transaction.commit();

      ok(
        res,
        college,
        "College approved successfully",
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
);

/**
 * Generic delete
 */
export const remove = (entity) =>
  asyncHandler(async (req, res) => {
    const Model = modelMap[entity];

    if (!Model) {
      throw new AppError("Invalid entity", 400);
    }

    const row = await Model.findByPk(req.params.id);

    if (!row) {
      throw new AppError("Record not found", 404);
    }

    await row.destroy();

    ok(res, {}, "Deleted");
  });

/**
 * Dedicated College delete
 */
export const removeCollege = asyncHandler(
  async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const college = await College.findByPk(
        req.params.id,
        {
          transaction,
        },
      );

      if (!college) {
        throw new AppError(
          "College not found",
          404,
        );
      }

      const studentCount = await Student.count({
        where: {
          college_id: college.id,
        },
        transaction,
      });

      if (studentCount > 0) {
        throw new AppError(
          "College cannot be deleted because students are linked to it. Deactivate it instead.",
          409,
        );
      }

      await User.destroy({
        where: {
          college_id: college.id,
          role: "college_admin",
        },
        transaction,
      });

      await college.destroy({
        transaction,
      });

      await transaction.commit();

      ok(
        res,
        {},
        "College deleted successfully",
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
);

export const processBulk = asyncHandler(
  async (req, res) => {
    const {
      type,
      payload = {},
    } = req.body;

    if (
      !BULK_JOB_TYPES.includes(type)
    ) {
      throw new AppError(
        "Invalid bulk operation type",
        422,
      );
    }

    const job =
      await bulkJobRunner.create(
        type,
        payload,
        req.user.id,
      );

    ok(
      res,
      {
        job_uuid:
          job.job_uuid,
        type:
          job.type,
        status:
          job.status,
      },
      "Bulk job queued",
      202,
    );
  },
);

export const bulkStatus = asyncHandler(
  async (req, res) => {
    const job =
      await BulkJob.findOne({
        where: {
          job_uuid:
            req.params.jobUuid,
        },
      });

    if (!job) {
      throw new AppError(
        "Job not found",
        404,
      );
    }

    ok(
      res,
      job,
      "Bulk job status fetched successfully",
    );
  },
);

/*
|--------------------------------------------------------------------------
| Bulk Automation Preview
|--------------------------------------------------------------------------
*/

export const previewBulk =
  asyncHandler(
    async (req, res) => {
      const {
        type,
        payload = {},
      } = req.body;

      if (
        !BULK_JOB_TYPES.includes(
          type,
        )
      ) {
        throw new AppError(
          "Invalid bulk operation type",
          422,
        );
      }

      try {
        const preview =
          await bulkJobRunner.preview(
            type,
            payload,
          );

        return ok(
          res,
          preview,
          "Bulk operation preview generated successfully",
        );
      } catch (error) {
        throw new AppError(
          error?.message ||
            "Unable to generate bulk preview",
          422,
        );
      }
    },
  );


/*
|--------------------------------------------------------------------------
| Bulk Job History
|--------------------------------------------------------------------------
*/

export const listBulkJobs =
  asyncHandler(
    async (req, res) => {
      const page =
        Math.max(
          1,
          Number(
            req.query.page ||
              1,
          ),
        );

      const limit =
        Math.min(
          50,
          Math.max(
            1,
            Number(
              req.query.limit ||
                20,
            ),
          ),
        );

      const where = {};

      const allowedStatuses = [
        "queued",
        "running",
        "completed",
        "failed",
        "cancelled",
      ];

      if (
        req.query.status
      ) {
        if (
          !allowedStatuses.includes(
            req.query.status,
          )
        ) {
          throw new AppError(
            "Invalid bulk job status",
            422,
          );
        }

        where.status =
          req.query.status;
      }

      if (
        req.query.type
      ) {
        if (
          !BULK_JOB_TYPES.includes(
            req.query.type,
          )
        ) {
          throw new AppError(
            "Invalid bulk operation type",
            422,
          );
        }

        where.type =
          req.query.type;
      }

      const result =
        await BulkJob.findAndCountAll({
          where,

          limit,

          offset:
            (page - 1) *
            limit,

          order: [
            [
              "id",
              "DESC",
            ],
          ],
        });

      return ok(
        res,
        {
          items:
            result.rows,

          total:
            result.count,

          page,

          limit,

          totalPages:
            Math.ceil(
              result.count /
                limit,
            ),
        },
        "Bulk jobs fetched successfully",
      );
    },
  );


/*
|--------------------------------------------------------------------------
| Cancel Bulk Job
|--------------------------------------------------------------------------
*/

export const cancelBulkJob =
  asyncHandler(
    async (req, res) => {
      try {
        const job =
          await bulkJobRunner.cancel(
            req.params.jobUuid,
          );

        return ok(
          res,
          job,
          job.status ===
          "cancelled"
            ? "Bulk job cancelled successfully"
            : "Bulk job cancellation requested",
        );
      } catch (error) {
        throw new AppError(
          error?.message ||
            "Unable to cancel bulk job",
          422,
        );
      }
    },
  );


/*
|--------------------------------------------------------------------------
| Retry Bulk Job
|--------------------------------------------------------------------------
*/

export const retryBulkJob =
  asyncHandler(
    async (req, res) => {
      const previousJob =
        await BulkJob.findOne({
          where: {
            job_uuid:
              req.params
                .jobUuid,
          },
        });

      if (!previousJob) {
        throw new AppError(
          "Bulk job not found",
          404,
        );
      }

      if (
        ![
          "failed",
          "cancelled",
        ].includes(
          previousJob.status,
        )
      ) {
        throw new AppError(
          "Only failed or cancelled jobs can be retried",
          409,
        );
      }

      const newJob =
        await bulkJobRunner.create(
          previousJob.type,

          previousJob.payload ||
            {},

          req.user.id,
        );

      return ok(
        res,
        {
          job_uuid:
            newJob.job_uuid,

          type:
            newJob.type,

          status:
            newJob.status,
        },
        "Bulk job queued again",
        202,
      );
    },
  );

export const createMentor = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      name,
      employee_id,
      designation,
      department,
      specialization,
      mobile,
      email,
      qualification,
      profile_photo,
      password,
      username,
      domain_id,
      college_id,
      status = "active",
    } = req.body;

    if (!name) {
      throw new AppError("Mentor name is required", 422);
    }

    if (!employee_id) {
      throw new AppError("Employee ID is required", 422);
    }

    if (!email) {
      throw new AppError("Email is required", 422);
    }

    if (!password) {
      throw new AppError("Password is required", 422);
    }

    if (!domain_id) {
      throw new AppError("Domain is required", 422);
    }

    if (!["active", "inactive"].includes(status)) {
      throw new AppError("Invalid mentor status", 422);
    }

    const domain = await Domain.findByPk(domain_id, {
      transaction,
    });

    if (!domain) {
      throw new AppError("Selected domain not found", 404);
    }

    if (college_id) {
      const college = await College.findByPk(college_id, {
        transaction,
      });

      if (!college) {
        throw new AppError("Selected college not found", 404);
      }
    }

    const existingMentor = await Mentor.findOne({
      where: {
        [Op.or]: [
          { employee_id },
          { email },
        ],
      },
      transaction,
    });

    if (existingMentor) {
      throw new AppError(
        "Mentor employee ID or email already exists",
        409,
      );
    }

    const loginUsername = username || employee_id;

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { username: loginUsername },
          { email },
        ],
      },
      transaction,
    });

    if (existingUser) {
      throw new AppError(
        "Login username or email already exists",
        409,
      );
    }

    const passwordHash = await hashPassword(password);

    const mentor = await Mentor.create(
      {
        name,
        employee_id,
        designation: designation || null,
        department: department || null,
        specialization: specialization || null,
        domain_id,
        college_id: college_id || null,
        mobile: mobile || null,
        email,
        qualification: qualification || null,
        profile_photo: profile_photo || null,
        password_hash: passwordHash,
        status,
      },
      {
        transaction,
      },
    );

   const user = await User.create(
  {
    username: loginUsername,
    email,
    password_hash: passwordHash,
    role: "mentor",
    college_id: college_id || null,
    status,
  },
  {
    transaction,
  },
);

const assignedStudentCount =
  await assignMentorToMatchingStudents({
    mentor,
    transaction,
    overwriteExisting: false,
  });

await transaction.commit();

    ok(
      res,
      {
        mentor: {
          id: mentor.id,
          name: mentor.name,
          employee_id: mentor.employee_id,
          designation: mentor.designation,
          department: mentor.department,
          specialization: mentor.specialization,
          domain_id: mentor.domain_id,
          college_id: mentor.college_id,
          mobile: mentor.mobile,
          email: mentor.email,
          qualification: mentor.qualification,
          profile_photo: mentor.profile_photo,
          status: mentor.status,
        },
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          college_id: user.college_id,
          status: user.status,
        },
        assigned_students:
      assignedStudentCount,
      },
      "Mentor profile and login account created successfully",
      201,
    );
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

export const updateMentor = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const mentor = await Mentor.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!mentor) {
      throw new AppError("Mentor not found", 404);
    }

    const {
      name,
      employee_id,
      designation,
      department,
      specialization,
      mobile,
      email,
      qualification,
      profile_photo,
      password,
      username,
      domain_id,
      college_id,
      status,
    } = req.body;

    if (
      status !== undefined &&
      !["active", "inactive"].includes(status)
    ) {
      throw new AppError("Invalid mentor status", 422);
    }

    if (domain_id !== undefined) {
      const domain = await Domain.findByPk(domain_id, {
        transaction,
      });

      if (!domain) {
        throw new AppError("Selected domain not found", 404);
      }
    }

    if (college_id !== undefined && college_id !== null) {
      const college = await College.findByPk(college_id, {
        transaction,
      });

      if (!college) {
        throw new AppError("Selected college not found", 404);
      }
    }

    if (employee_id || email) {
      const duplicateMentor = await Mentor.findOne({
        where: {
          id: {
            [Op.ne]: mentor.id,
          },
          [Op.or]: [
            ...(employee_id ? [{ employee_id }] : []),
            ...(email ? [{ email }] : []),
          ],
        },
        transaction,
      });

      if (duplicateMentor) {
        throw new AppError(
          "Mentor employee ID or email already exists",
          409,
        );
      }
    }

    const mentorPayload = {};

    if (name !== undefined) mentorPayload.name = name;
    if (employee_id !== undefined) {
      mentorPayload.employee_id = employee_id;
    }
    if (designation !== undefined) {
      mentorPayload.designation = designation || null;
    }
    if (department !== undefined) {
      mentorPayload.department = department || null;
    }
    if (specialization !== undefined) {
      mentorPayload.specialization = specialization || null;
    }
    if (domain_id !== undefined) {
      mentorPayload.domain_id = domain_id;
    }
    if (college_id !== undefined) {
      mentorPayload.college_id = college_id || null;
    }
    if (mobile !== undefined) {
      mentorPayload.mobile = mobile || null;
    }
    if (email !== undefined) {
      mentorPayload.email = email;
    }
    if (qualification !== undefined) {
      mentorPayload.qualification = qualification || null;
    }
    if (profile_photo !== undefined) {
      mentorPayload.profile_photo = profile_photo || null;
    }
    if (status !== undefined) {
      mentorPayload.status = status;
    }

    if (password) {
      mentorPayload.password_hash =
        await hashPassword(password);
    }

    await mentor.update(mentorPayload, {
      transaction,
    });

    const mentorUser = await User.findOne({
      where: {
        email: mentor.email,
        role: "mentor",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!mentorUser) {
      throw new AppError(
        "Mentor login account not found",
        404,
      );
    }

    const userPayload = {};

    if (username !== undefined) {
      const existingUsername = await User.findOne({
        where: {
          username,
          id: {
            [Op.ne]: mentorUser.id,
          },
        },
        transaction,
      });

      if (existingUsername) {
        throw new AppError(
          "Username already exists",
          409,
        );
      }

      userPayload.username = username;
    }

    if (email !== undefined) {
      const existingEmail = await User.findOne({
        where: {
          email,
          id: {
            [Op.ne]: mentorUser.id,
          },
        },
        transaction,
      });

      if (existingEmail) {
        throw new AppError(
          "User email already exists",
          409,
        );
      }

      userPayload.email = email;
    }

    if (college_id !== undefined) {
      userPayload.college_id = college_id || null;
    }

    if (status !== undefined) {
      userPayload.status = status;
    }

    if (password) {
      userPayload.password_hash =
        mentorPayload.password_hash;
    }

    if (Object.keys(userPayload).length > 0) {
      await mentorUser.update(userPayload, {
        transaction,
      });
    }

    await transaction.commit();

    ok(
      res,
      {
        mentor: {
          id: mentor.id,
          name: mentor.name,
          employee_id: mentor.employee_id,
          email: mentor.email,
          domain_id: mentor.domain_id,
          college_id: mentor.college_id,
          status: mentor.status,
        },
        user: {
          id: mentorUser.id,
          username: mentorUser.username,
          email: mentorUser.email,
          role: mentorUser.role,
          college_id: mentorUser.college_id,
          status: mentorUser.status,
        },
      },
      "Mentor profile and login account updated successfully",
    );
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

export const importStudents = asyncHandler(
  async (req, res) => {
    const collegeId = Number(
      req.body.college_id,
    );

    if (!collegeId) {
      throw new AppError(
        "College is required",
        422,
      );
    }

    if (!req.file) {
      throw new AppError(
        "Excel file is required",
        422,
      );
    }

    const college =
      await College.findByPk(
        collegeId,
        {
          attributes: [
            "id",
            "name",
            "code",
          ],
        },
      );

    if (!college) {
      throw new AppError(
        "Selected college not found",
        404,
      );
    }

    try {
      const result =
        await importStudentsFromExcel(
          req.file.path,
          collegeId,
        );

      ok(
        res,
        {
          college: {
            id: college.id,
            name: college.name,
            code: college.code,
          },

          ...result,
        },
        "Student Excel imported successfully",
      );
    } finally {
      fs.unlink(
        req.file.path,
        (error) => {
          if (
            error &&
            error.code !== "ENOENT"
          ) {
            console.error(
              "Failed to delete uploaded Excel file:",
              error.message,
            );
          }
        },
      );
    }
  },
);

/*
|--------------------------------------------------------------------------
| Start Student Internship
|--------------------------------------------------------------------------
*/

export const startStudentInternship =
  asyncHandler(
    async (req, res) => {
      const studentId =
        Number(
          req.params.id,
        );

      const startDate =
        String(
          req.body.start_date ||
            "",
        ).trim();

      if (!studentId) {
        throw new AppError(
          "Student ID is required",
          422,
        );
      }

      if (!startDate) {
        throw new AppError(
          "Internship start date is required",
          422,
        );
      }

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          startDate,
        )
      ) {
        throw new AppError(
          "Invalid start date",
          422,
        );
      }

      const student =
        await Student.findByPk(
          studentId,
        );

      if (!student) {
        throw new AppError(
          "Student not found",
          404,
        );
      }

      if (
        student.payment_status !==
        "paid"
      ) {
        throw new AppError(
          "Student has not completed payment",
          409,
        );
      }

      if (
        student.internship_status ===
        "blocked"
      ) {
        throw new AppError(
          "Blocked student cannot start internship",
          409,
        );
      }

      if (
        student.internship_status ===
        "completed"
      ) {
        throw new AppError(
          "Internship is already completed",
          409,
        );
      }

      const today =
        new Intl.DateTimeFormat(
          "en-CA",
          {
            timeZone:
              "Asia/Kolkata",

            year:
              "numeric",

            month:
              "2-digit",

            day:
              "2-digit",
          },
        ).format(
          new Date(),
        );

     const internshipStarted =
  startDate <= today;

await student.update({
  internship_start_date:
    startDate,

  /*
   * Payment complete hone ke baad
   * student active hi rahega.
   *
   * Future internship date dene par
   * active -> registered nahi hoga.
   */
  internship_status:
    "active",

  /*
   * Learning aur attendance
   * isi date se start honge.
   */
  learning_start_date:
    startDate,

  attendance_start_date:
    startDate,

  /*
   * Today/past date hai:
   * immediately unlock.
   *
   * Future date hai:
   * abhi locked.
   */
  learning_access_enabled:
    internshipStarted,

  attendance_access_enabled:
    internshipStarted,
});

const formattedStartDate =
  new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone:
        "Asia/Kolkata",
    },
  ).format(
    new Date(
      `${startDate}T00:00:00+05:30`,
    ),
  );

try {
  await notify({
    recipientType:
      "student",

    recipientId:
      student.id,

    type:
      "internship",

    title:
      internshipStarted
        ? "Internship Started"
        : "Internship Scheduled",

    message:
      internshipStarted
        ? `Your internship has started from ${formattedStartDate}. Learning and attendance are now available.`
        : `Your internship is scheduled to start on ${formattedStartDate}. Learning and attendance will become available from this date.`,

    actionUrl:
      "/student",

    metadata: {
      student_id:
        student.id,

      start_date:
        startDate,

      internship_status:
        student.internship_status,
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
      internshipStarted
        ? "Your RK Nexora Internship Has Started"
        : "Your RK Nexora Internship Start Date",
  });
} catch (notificationError) {
  console.error(
    "Internship notification failed:",
    notificationError,
  );
}

      return ok(
        res,
        {
          student_id:
            student.id,

          name:
            student.name,

          portal_registration_number:
            student.portal_registration_number,

          payment_status:
            student.payment_status,

          internship_status:
            student.internship_status,

          internship_start_date:
            student.internship_start_date,
        },
        startDate <= today
          ? "Internship started successfully"
          : "Internship scheduled successfully",
      );
    },
  );