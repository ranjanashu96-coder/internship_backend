import {
  Op,
} from "sequelize";

import {
  Mentor,
  Student,
  Submission,
  Assessment,
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
| Resolve logged-in mentor
|--------------------------------------------------------------------------
*/

const getLoggedInMentor = async (
  req,
) => {
  if (!req.user?.email) {
    throw new AppError(
      "Authenticated mentor email not found",
      401,
    );
  }

  const mentor =
    await Mentor.findOne({
      where: {
        email:
          req.user.email,
      },

      attributes: [
        "id",
        "name",
        "employee_id",
        "email",
        "domain_id",
        "college_id",
        "status",
      ],
    });

  if (!mentor) {
    throw new AppError(
      "Mentor profile not found",
      404,
    );
  }

  if (
    mentor.status !==
    "active"
  ) {
    throw new AppError(
      "Mentor account is inactive",
      403,
    );
  }

  return mentor;
};

/*
|--------------------------------------------------------------------------
| Mentor: View only manually assigned students
|--------------------------------------------------------------------------
*/

export const assignedStudents =
  asyncHandler(
    async (req, res) => {
      const mentor =
        await getLoggedInMentor(
          req,
        );

      const where = {
        mentor_id:
          mentor.id,
      };

      if (req.query.status) {
        where.internship_status =
          req.query.status;
      }

      if (req.query.session) {
        where.session =
          req.query.session;
      }

      if (req.query.semester) {
        where.semester =
          req.query.semester;
      }

      if (req.query.search) {
        const search =
          String(
            req.query.search,
          ).trim();

        where[Op.or] = [
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
        ];
      }

      const students =
        await Student.findAll({
          where,

          attributes: {
            exclude: [
              "password_hash",
            ],
          },

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
                "duration_hours",
              ],

              required: false,
            },
          ],

          order: [
            ["id", "DESC"],
          ],
        });

      ok(
        res,
        {
          mentor,

          students,

          total:
            students.length,
        },
        "Assigned students fetched successfully",
      );
    },
  );

/*
|--------------------------------------------------------------------------
| Mentor: Review submission of an assigned student
|--------------------------------------------------------------------------
*/

export const reviewSubmission =
  asyncHandler(
    async (req, res) => {
      const mentor =
        await getLoggedInMentor(
          req,
        );

      const submission =
        await Submission.findByPk(
          req.params.id,
        );

      if (!submission) {
        throw new AppError(
          "Submission not found",
          404,
        );
      }

      const student =
        await Student.findOne({
          where: {
            id:
              submission.student_id,

            mentor_id:
              mentor.id,
          },

          attributes: [
            "id",
            "name",
            "registration_number",
            "mentor_id",
          ],
        });

      if (!student) {
        throw new AppError(
          "You are not allowed to review this student's submission",
          403,
        );
      }

      const allowedStatuses = [
        "approved",
        "rejected",
        "resubmit",
      ];

      if (
        !allowedStatuses.includes(
          req.body.status,
        )
      ) {
        throw new AppError(
          "Invalid review status",
          422,
        );
      }

      const marks =
        req.body.marks ===
          undefined ||
        req.body.marks ===
          null ||
        req.body.marks ===
          ""
          ? null
          : Number(
              req.body.marks,
            );

      if (
        marks !== null &&
        (
          Number.isNaN(
            marks,
          ) ||
          marks < 0
        )
      ) {
        throw new AppError(
          "Marks must be zero or greater",
          422,
        );
      }

      await submission.update({
        status:
          req.body.status,

        marks,

        mentor_comments:
          req.body
            .mentor_comments ||
          null,
      });

      ok(
        res,
        submission,
        "Review saved successfully",
      );
    },
  );

/*
|--------------------------------------------------------------------------
| Mentor: Submit assessment only for assigned student
|--------------------------------------------------------------------------
*/

export const submitAssessment =
  asyncHandler(
    async (req, res) => {
      const mentor =
        await getLoggedInMentor(
          req,
        );

      const studentId =
        Number(
          req.params.studentId,
        );

      if (
        !Number.isInteger(
          studentId,
        ) ||
        studentId <= 0
      ) {
        throw new AppError(
          "Invalid student ID",
          422,
        );
      }

      const student =
        await Student.findOne({
          where: {
            id: studentId,

            mentor_id:
              mentor.id,
          },

          attributes: [
            "id",
            "name",
            "registration_number",
            "mentor_id",
          ],
        });

      if (!student) {
        throw new AppError(
          "Student is not assigned to this mentor",
          403,
        );
      }

      if (
        !req.body
          .criteria_ratings
      ) {
        throw new AppError(
          "Assessment criteria ratings are required",
          422,
        );
      }

      const [
        assessment,
      ] =
        await Assessment.upsert({
          student_id:
            student.id,

          mentor_id:
            mentor.id,

          criteria_ratings_json:
            req.body
              .criteria_ratings,

          overall_performance:
            req.body
              .overall_performance ||
            null,

          supervisor_remarks:
            req.body
              .supervisor_remarks ||
            null,

          status:
            "submitted",
        });

      ok(
        res,
        assessment,
        "Assessment submitted successfully",
      );
    },
  );