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
  Quiz,
  QuizAttempt,
  QuizReattemptGrant,
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
  const mentor =
    req.mentor;

  if (!mentor) {
    throw new AppError(
      "Mentor profile not found",
      404,
    );
  }

  if (
    mentor.status !== "active"
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

          assessment_type:
            ["midterm", "final"].includes(
              req.body.assessment_type,
            )
              ? req.body.assessment_type
              : "final",

          overall_performance:
            req.body
              .overall_performance ||
            "Satisfactory",

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

/*
|--------------------------------------------------------------------------
| Mentor: Real dashboard
|--------------------------------------------------------------------------
*/

export const mentorDashboard =
  asyncHandler(
    async (req, res) => {
      const mentor =
        await getLoggedInMentor(
          req,
        );

      const students =
        await Student.findAll({
          where: {
            mentor_id: mentor.id,
          },

          attributes: [
            "id",
            "name",
            "registration_number",
            "internship_status",
            "total_progress",
            "domain_id",
            "college_id",
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
            ["id", "DESC"],
          ],
        });

      const studentIds =
        students.map(
          (student) =>
            Number(student.id),
        );

      const totalStudents =
        students.length;

      const activeStudents =
        students.filter(
          (student) =>
            student.internship_status ===
            "active",
        ).length;

      const completedStudents =
        students.filter(
          (student) =>
            student.internship_status ===
            "completed",
        ).length;

      const averageProgress =
        totalStudents > 0
          ? Number(
              (
                students.reduce(
                  (sum, student) =>
                    sum +
                    Number(
                      student.total_progress ||
                        0,
                    ),
                  0,
                ) / totalStudents
              ).toFixed(2),
            )
          : 0;

      let pendingReviews = 0;
      let assessmentsSubmitted = 0;
      let failedExhausted = 0;

      if (studentIds.length > 0) {
        pendingReviews =
          await Submission.count({
            where: {
              student_id: {
                [Op.in]: studentIds,
              },
              status: "submitted",
            },
          });

        assessmentsSubmitted =
          await Assessment.count({
            where: {
              mentor_id: mentor.id,
              student_id: {
                [Op.in]: studentIds,
              },
              status: {
                [Op.in]: [
                  "submitted",
                  "approved",
                ],
              },
            },
          });

        const attempts =
          await QuizAttempt.findAll({
            where: {
              student_id: {
                [Op.in]: studentIds,
              },
              status: {
                [Op.in]: [
                  "submitted",
                  "expired",
                ],
              },
            },
          });

        const quizIds =
          [
            ...new Set(
              attempts.map(
                (attempt) =>
                  Number(
                    attempt.quiz_id,
                  ),
              ),
            ),
          ];

        const quizzes =
          quizIds.length > 0
            ? await Quiz.findAll({
                where: {
                  id: {
                    [Op.in]: quizIds,
                  },
                },
              })
            : [];

        const quizMap =
          new Map(
            quizzes.map(
              (quiz) => [
                Number(quiz.id),
                quiz,
              ],
            ),
          );

        const grants =
          quizIds.length > 0
            ? await QuizReattemptGrant.findAll({
                where: {
                  student_id: {
                    [Op.in]: studentIds,
                  },
                  quiz_id: {
                    [Op.in]: quizIds,
                  },
                },
              })
            : [];

        const grantMap =
          new Map();

        for (const grant of grants) {
          const key =
            `${grant.student_id}:${grant.quiz_id}`;

          grantMap.set(
            key,
            Number(
              grantMap.get(key) ||
                0,
            ) +
              Number(
                grant.extra_attempts ||
                  0,
              ),
          );
        }

        const grouped =
          new Map();

        for (const attempt of attempts) {
          const key =
            `${attempt.student_id}:${attempt.quiz_id}`;

          if (!grouped.has(key)) {
            grouped.set(
              key,
              [],
            );
          }

          grouped.get(key).push(
            attempt,
          );
        }

        for (const [key, rows] of grouped.entries()) {
          if (rows.some((row) => Boolean(row.passed))) {
            continue;
          }

          const quizId =
            Number(
              key.split(":")[1],
            );

          const quiz =
            quizMap.get(quizId);

          if (!quiz) {
            continue;
          }

          const totalAllowed =
            Number(
              quiz.attempts_allowed ||
                1,
            ) +
            Number(
              grantMap.get(key) ||
                0,
            );

          if (rows.length >= totalAllowed) {
            failedExhausted += 1;
          }
        }
      }

      const assessmentsPending =
        Math.max(
          totalStudents -
            assessmentsSubmitted,
          0,
        );

      ok(
        res,
        {
          mentor: {
            id: mentor.id,
            name: mentor.name,
            employee_id:
              mentor.employee_id,
            designation:
              mentor.designation,
            department:
              mentor.department,
            domain_id:
              mentor.domain_id,
            college_id:
              mentor.college_id,
          },

          summary: {
            total_students:
              totalStudents,
            active_students:
              activeStudents,
            completed_students:
              completedStudents,
            average_progress:
              averageProgress,
            pending_reviews:
              pendingReviews,
            assessments_submitted:
              assessmentsSubmitted,
            assessments_pending:
              assessmentsPending,
            failed_quiz_exhausted:
              failedExhausted,
          },

          recent_students:
            students.slice(0, 6),
        },
        "Mentor dashboard fetched successfully",
      );
    },
  );
