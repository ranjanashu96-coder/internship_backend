import {
  Op,
} from "sequelize";

import {
  sequelize,
  Mentor,
  Student,
  College,
  Domain,
} from "../models/index.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  AppError,
  ok,
} from "../utils/response.js";

/*
|--------------------------------------------------------------------------
| Admin: Get students eligible for a mentor
|--------------------------------------------------------------------------
*/

export const getMentorAssignableStudents =
  asyncHandler(
    async (req, res) => {
      const mentorId =
        Number(
         req.params.id
        );

      if (
        !Number.isInteger(
          mentorId,
        ) ||
        mentorId <= 0
      ) {
        throw new AppError(
          "Invalid mentor ID",
          422,
        );
      }

      const mentor =
        await Mentor.findByPk(
          mentorId,
          {
            attributes: [
              "id",
              "name",
              "employee_id",
              "domain_id",
              "college_id",
              "status",
            ],

            include: [
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
            ],
          },
        );

      if (!mentor) {
        throw new AppError(
          "Mentor not found",
          404,
        );
      }

      if (!mentor.domain_id) {
        throw new AppError(
          "Mentor does not have a domain",
          422,
        );
      }

      const page = Math.max(
        1,
        Number(
          req.query.page || 1,
        ),
      );

      const limit = Math.min(
        100,
        Math.max(
          1,
          Number(
            req.query.limit || 20,
          ),
        ),
      );

      const where = {
        domain_id:
          mentor.domain_id,
      };

      /*
       * When the mentor belongs to a college,
       * show students from the same college only.
       */
      if (mentor.college_id) {
        where.college_id =
          mentor.college_id;
      }

      const assignmentStatus =
        String(
          req.query.assignment_status ||
            "available",
        );

      if (
        assignmentStatus ===
        "assigned"
      ) {
        where.mentor_id =
          mentor.id;
      } else if (
        assignmentStatus ===
        "unassigned"
      ) {
        where.mentor_id =
          null;
      } else if (
        assignmentStatus ===
        "available"
      ) {
        where[Op.or] = [
          {
            mentor_id: null,
          },
          {
            mentor_id:
              mentor.id,
          },
        ];
      }

      if (req.query.search) {
        const search =
          String(
            req.query.search,
          ).trim();

        where[Op.and] = [
          ...(where[Op.and] ||
            []),

          {
            [Op.or]: [
              {
                registration_number: {
                  [Op.like]:
                    `%${search}%`,
                },
              },
              {
                student_id: {
                  [Op.like]:
                    `%${search}%`,
                },
              },
              {
                name: {
                  [Op.like]:
                    `%${search}%`,
                },
              },
              {
                email: {
                  [Op.like]:
                    `%${search}%`,
                },
              },
              {
                mobile: {
                  [Op.like]:
                    `%${search}%`,
                },
              },
            ],
          },
        ];
      }

      if (req.query.session) {
        where.session =
          req.query.session;
      }

      if (req.query.semester) {
        where.semester =
          req.query.semester;
      }

      const result =
        await Student.findAndCountAll({
          where,

          attributes: [
            "id",
            "registration_number",
            "student_id",
            "name",
            "email",
            "mobile",
            "college_id",
            "domain_id",
            "mentor_id",
            "session",
            "semester",
            "internship_status",
            "payment_status",
            "total_progress",
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

          limit,

          offset:
            (page - 1) *
            limit,

          order: [
            ["id", "DESC"],
          ],

          distinct: true,
        });

      const items =
        result.rows.map(
          (student) => ({
            ...student.toJSON(),

            is_assigned_to_mentor:
              Number(
                student.mentor_id,
              ) ===
              Number(
                mentor.id,
              ),

            is_assigned_to_other_mentor:
              Boolean(
                student.mentor_id,
              ) &&
              Number(
                student.mentor_id,
              ) !==
                Number(
                  mentor.id,
                ),
          }),
        );

      ok(
        res,
        {
          mentor,

          items,

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
        "Assignable students fetched successfully",
      );
    },
  );

/*
|--------------------------------------------------------------------------
| Admin: Assign selected students to mentor
|--------------------------------------------------------------------------
*/

export const assignStudentsToMentor =
  asyncHandler(
    async (req, res) => {
      const mentorId =
        Number(
          req.params.id
        );

      const studentIds = [
        ...new Set(
          (
            req.body.student_ids ||
            []
          )
            .map(Number)
            .filter(
              (id) =>
                Number.isInteger(
                  id,
                ) &&
                id > 0,
            ),
        ),
      ];

      const replaceExisting =
        req.body
          .replace_existing ===
        true;

      if (
        !Number.isInteger(
          mentorId,
        ) ||
        mentorId <= 0
      ) {
        throw new AppError(
          "Invalid mentor ID",
          422,
        );
      }

      if (
        studentIds.length === 0
      ) {
        throw new AppError(
          "Select at least one student",
          422,
        );
      }

      const transaction =
        await sequelize.transaction();

      try {
        const mentor =
          await Mentor.findByPk(
            mentorId,
            {
              transaction,
              lock:
                transaction.LOCK
                  .UPDATE,
            },
          );

        if (!mentor) {
          throw new AppError(
            "Mentor not found",
            404,
          );
        }

        if (
          mentor.status !==
          "active"
        ) {
          throw new AppError(
            "Students cannot be assigned to an inactive mentor",
            422,
          );
        }

        if (!mentor.domain_id) {
          throw new AppError(
            "Mentor domain is not configured",
            422,
          );
        }

        const studentWhere = {
          id: {
            [Op.in]:
              studentIds,
          },

          domain_id:
            mentor.domain_id,
        };

        if (mentor.college_id) {
          studentWhere.college_id =
            mentor.college_id;
        }

        const students =
          await Student.findAll({
            where:
              studentWhere,

            attributes: [
              "id",
              "name",
              "registration_number",
              "domain_id",
              "college_id",
              "mentor_id",
            ],

            transaction,

            lock:
              transaction.LOCK
                .UPDATE,
          });

        const validStudentIds =
          students.map(
            (student) =>
              student.id,
          );

        const invalidStudentIds =
          studentIds.filter(
            (id) =>
              !validStudentIds.includes(
                id,
              ),
          );

        if (
          invalidStudentIds.length >
          0
        ) {
          throw new AppError(
            `Some students do not belong to the mentor domain or college: ${invalidStudentIds.join(
              ", ",
            )}`,
            422,
          );
        }

        const studentsAssignedElsewhere =
          students.filter(
            (student) =>
              student.mentor_id &&
              Number(
                student.mentor_id,
              ) !==
                mentor.id,
          );

        if (
          studentsAssignedElsewhere
            .length > 0 &&
          !replaceExisting
        ) {
          const registrations =
            studentsAssignedElsewhere.map(
              (student) =>
                student.registration_number ||
                student.id,
            );

          throw new AppError(
            `Some students are already assigned to another mentor: ${registrations.join(
              ", ",
            )}`,
            409,
          );
        }

        const [
          assignedCount,
        ] =
          await Student.update(
            {
              mentor_id:
                mentor.id,
            },
            {
              where: {
                id: {
                  [Op.in]:
                    validStudentIds,
                },
              },

              transaction,
            },
          );

        await transaction.commit();

        ok(
          res,
          {
            mentor_id:
              mentor.id,

            domain_id:
              mentor.domain_id,

            college_id:
              mentor.college_id,

            assigned_count:
              assignedCount,

            student_ids:
              validStudentIds,
          },
          `${assignedCount} students assigned successfully`,
        );
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },
  );

/*
|--------------------------------------------------------------------------
| Admin: Remove students from mentor
|--------------------------------------------------------------------------
*/

export const removeStudentsFromMentor =
  asyncHandler(
    async (req, res) => {
      const mentorId =
        Number(
        req.params.id
        );

      const studentIds = [
        ...new Set(
          (
            req.body.student_ids ||
            []
          )
            .map(Number)
            .filter(
              (id) =>
                Number.isInteger(
                  id,
                ) &&
                id > 0,
            ),
        ),
      ];

      if (
        studentIds.length === 0
      ) {
        throw new AppError(
          "Select at least one student",
          422,
        );
      }

      const [
        removedCount,
      ] =
        await Student.update(
          {
            mentor_id: null,
          },
          {
            where: {
              id: {
                [Op.in]:
                  studentIds,
              },

              mentor_id:
                mentorId,
            },
          },
        );

      ok(
        res,
        {
          removed_count:
            removedCount,

          student_ids:
            studentIds,
        },
        `${removedCount} students removed successfully`,
      );
    },
  );