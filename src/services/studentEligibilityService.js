import { Op } from "sequelize";

import {
  Student,
  Domain,
  Module,
  Chapter,
  Quiz,
  QuizAttempt,
  ChapterCompletion,
  Assignment,
  Submission,
  Attendance,
  LiveProject,
  InternshipReport,
} from "../models/index.js";

const toNumber = (value) => {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue)
    ? parsedValue
    : 0;
};

const calculatePercentage = (
  completed,
  total,
) => {
  const completedValue =
    toNumber(completed);

  const totalValue =
    toNumber(total);

  if (totalValue <= 0) {
    return 0;
  }

  return Number(
    (
      (completedValue /
        totalValue) *
      100
    ).toFixed(2),
  );
};

const getStudentChapterIds = async (
  domainId,
) => {
  if (!domainId) {
    return [];
  }

  const modules =
    await Module.findAll({
      where: {
        domain_id: domainId,
      },

      attributes: ["id"],

      include: [
        {
          model: Chapter,
          attributes: ["id"],
          required: false,
        },
      ],
    });

  return modules.flatMap(
    (module) =>
      (
        module.Chapters || []
      ).map(
        (chapter) =>
          Number(chapter.id),
      ),
  );
};

export const getStudentEligibility =
  async (
    studentId,
    domainId,
  ) => {
    /*
    |--------------------------------------------------------------------------
    | Chapters
    |--------------------------------------------------------------------------
    */

    const chapterIds =
      await getStudentChapterIds(
        domainId,
      );

    const validChapterIds =
      chapterIds.length > 0
        ? chapterIds
        : [0];

    const totalChapters =
      chapterIds.length;

    const completedChapters =
      await ChapterCompletion.count({
        where: {
          student_id:
            studentId,

          chapter_id: {
            [Op.in]:
              validChapterIds,
          },

          status: "completed",
        },

        distinct: true,
        col: "chapter_id",
      });

    /*
    |--------------------------------------------------------------------------
    | Quizzes
    |--------------------------------------------------------------------------
    */

    const quizzes =
      await Quiz.findAll({
        where: {
          chapter_id: {
            [Op.in]:
              validChapterIds,
          },

          status: "active",
        },

        attributes: ["id"],
      });

    const quizIds =
      quizzes.map(
        (quiz) =>
          Number(quiz.id),
      );

    const passedQuizIds =
      quizIds.length > 0
        ? await QuizAttempt.findAll({
            where: {
              student_id:
                studentId,

              quiz_id: {
                [Op.in]:
                  quizIds,
              },

              status:
                "submitted",

              passed: true,
            },

            attributes: [
              "quiz_id",
            ],

            group: [
              "quiz_id",
            ],
          })
        : [];

    const totalQuizzes =
      quizIds.length;

    const quizzesPassed =
      passedQuizIds.length;

    /*
    |--------------------------------------------------------------------------
    | Assignments
    |--------------------------------------------------------------------------
    */

    const assignments =
      await Assignment.findAll({
        where: {
          chapter_id: {
            [Op.in]:
              validChapterIds,
          },
        },

        attributes: ["id"],
      });

    const assignmentIds =
      assignments.map(
        (assignment) =>
          Number(
            assignment.id,
          ),
      );

    const totalAssignments =
      assignmentIds.length;

    const approvedAssignments =
      assignmentIds.length > 0
        ? await Submission.count({
            where: {
              student_id:
                studentId,

              assignment_id: {
                [Op.in]:
                  assignmentIds,
              },

              status:
                "approved",
            },

            distinct: true,
            col: "assignment_id",
          })
        : 0;

    /*
    |--------------------------------------------------------------------------
    | Required Learning Hours
    |--------------------------------------------------------------------------
    */

    const student =
      await Student.findByPk(
        studentId,
        {
          attributes: [
            "id",
            "domain_id",
          ],

          include: [
            {
              model: Domain,
              as: "domain",

              attributes: [
                "id",
                "duration_hours",
              ],
            },
          ],
        },
      );

    const requiredHours =
      toNumber(
        student?.domain
          ?.duration_hours,
      );

    /*
    |--------------------------------------------------------------------------
    | Attendance
    |--------------------------------------------------------------------------
    */

    const attendanceRecords =
      await Attendance.findAll({
        where: {
          student_id:
            studentId,
        },

        attributes: [
          "status",
          "learning_hours",
        ],
      });

    const totalAttendanceDays =
      attendanceRecords.length;

    const presentDays =
      attendanceRecords.filter(
        (record) =>
          record.status ===
          "present",
      ).length;

    const halfDays =
      attendanceRecords.filter(
        (record) =>
          record.status ===
          "half_day",
      ).length;

    const effectivePresentDays =
      presentDays +
      halfDays * 0.5;

    const attendancePercentage =
      calculatePercentage(
        effectivePresentDays,
        totalAttendanceDays,
      );

    const completedHours =
      attendanceRecords.reduce(
        (total, record) =>
          total +
          toNumber(
            record.learning_hours,
          ),
        0,
      );

    const minimumAttendance =
      75;

    /*
    |--------------------------------------------------------------------------
    | Live Project
    |--------------------------------------------------------------------------
    */

    const projectApproved =
      Boolean(
        await LiveProject.findOne({
          where: {
            student_id:
              studentId,

            status:
              "approved",
          },

          attributes: ["id"],
        }),
      );

    /*
    |--------------------------------------------------------------------------
    | Internship Report
    |--------------------------------------------------------------------------
    */

    const reportApproved =
      Boolean(
        await InternshipReport.findOne(
          {
            where: {
              student_id:
                studentId,

              status:
                "approved",
            },

            attributes: ["id"],
          },
        ),
      );

    /*
    |--------------------------------------------------------------------------
    | Final Checks
    |--------------------------------------------------------------------------
    */

    const checks = {
      chapters_completed:
        totalChapters === 0 ||
        completedChapters >=
          totalChapters,

      quizzes_passed:
        totalQuizzes === 0 ||
        quizzesPassed >=
          totalQuizzes,

      assignments_completed:
        totalAssignments === 0 ||
        approvedAssignments >=
          totalAssignments,

      required_hours_completed:
        requiredHours <= 0 ||
        completedHours >=
          requiredHours,

      attendance_completed:
        totalAttendanceDays > 0 &&
        attendancePercentage >=
          minimumAttendance,

      project_approved:
        projectApproved,

      report_approved:
        reportApproved,
    };

    const eligible =
      Object.values(
        checks,
      ).every(Boolean);

    return {
      eligible,

      checks,

      progress: {
        chapters: {
          total:
            totalChapters,

          completed:
            completedChapters,

          percentage:
            calculatePercentage(
              completedChapters,
              totalChapters,
            ),
        },

        quizzes: {
          total:
            totalQuizzes,

          passed:
            quizzesPassed,

          percentage:
            calculatePercentage(
              quizzesPassed,
              totalQuizzes,
            ),
        },

        assignments: {
          total:
            totalAssignments,

          approved:
            approvedAssignments,

          percentage:
            calculatePercentage(
              approvedAssignments,
              totalAssignments,
            ),
        },

        learning_hours: {
          required:
            requiredHours,

          completed:
            Number(
              completedHours.toFixed(
                2,
              ),
            ),

          remaining:
            Number(
              Math.max(
                requiredHours -
                  completedHours,
                0,
              ).toFixed(2),
            ),

          percentage:
            calculatePercentage(
              completedHours,
              requiredHours,
            ),
        },

        attendance: {
          total_days:
            totalAttendanceDays,

          effective_present_days:
            effectivePresentDays,

          percentage:
            attendancePercentage,

          minimum_required:
            minimumAttendance,
        },
      },
    };
  };