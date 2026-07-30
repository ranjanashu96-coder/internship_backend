import { Op } from "sequelize";
import fs from "fs";
import path from "path";

import {
   Student,
  College,
  Domain,
  Module,
  Chapter,
  ChapterResource,
  Quiz,
  QuizAttempt,
  ChapterCompletion,
  Assignment,
  Submission,
  Attendance,
  Logbook,
  LiveProject,
  InternshipReport,
  Certificate,
  Payment,
  GeneratedDocument,
} from "../models/index.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  AppError,
  ok,
} from "../utils/response.js";

import {
  hashPassword,
} from "../utils/security.js";

/**
 * Returns the authenticated student.
 *
 * req.user.id directly contains students.id.
 */
const getCurrentStudent = async (
  req,
  options = {},
) => {
  const student = await Student.findByPk(
    req.user.id,
    options,
  );

  if (!student) {
    throw new AppError(
      "Student profile not found",
      404,
    );
  }

  if (
    student.internship_status ===
    "blocked"
  ) {
    throw new AppError(
      "Student account is blocked",
      403,
    );
  }

  return student;
};

/*
|--------------------------------------------------------------------------
| Internship Start Access Control
|--------------------------------------------------------------------------
*/

const getIndiaToday = () => {
  const formatter =
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
    );

  const parts =
    formatter.formatToParts(
      new Date(),
    );

  const values =
    Object.fromEntries(
      parts
        .filter(
          (part) =>
            part.type !==
            "literal",
        )
        .map(
          (part) => [
            part.type,
            part.value,
          ],
        ),
    );

  return `${values.year}-${values.month}-${values.day}`;
};


const ensureInternshipStarted =
  async (
    student,
  ) => {
    /*
    |--------------------------------------------------------------------------
    | Payment must be completed
    |--------------------------------------------------------------------------
    */

    if (
      student.payment_status !==
      "paid"
    ) {
      throw new AppError(
        "Complete payment before accessing internship activities",
        403,
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Blocked student
    |--------------------------------------------------------------------------
    */

    if (
      student.internship_status ===
      "blocked"
    ) {
      throw new AppError(
        "Your internship access is blocked",
        403,
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Admin has not assigned start date
    |--------------------------------------------------------------------------
    */

    if (
      !student.internship_start_date
    ) {
      throw new AppError(
        "Your internship has not been started by the administrator yet",
        403,
      );
    }

    const today =
      getIndiaToday();

    const startDate =
      String(
        student
          .internship_start_date,
      ).slice(
        0,
        10,
      );

    /*
    |--------------------------------------------------------------------------
    | Start date is still in future
    |--------------------------------------------------------------------------
    */

    if (
      today <
      startDate
    ) {
      throw new AppError(
        `Your internship will start on ${startDate}`,
        403,
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Start date reached
    |--------------------------------------------------------------------------
    */

    if (
      student.internship_status ===
      "registered"
    ) {
      await student.update({
        internship_status:
          "active",
      });
    }

    return true;
  };

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

  const totalValue = toNumber(total);

  if (totalValue <= 0) {
    return 0;
  }

  return Number(
    (
      (completedValue / totalValue) *
      100
    ).toFixed(2),
  );
};

const limitPercentage = (value) => {
  return Math.min(
    100,
    Math.max(0, toNumber(value)),
  );
};

const getStudentEligibility = async (
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
        student_id: studentId,

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

      attributes: [
        "id",
      ],
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

      attributes: [
        "id",
      ],
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
  | Student + Required Hours
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
  | Attendance + Learning Hours
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

  /*
  |--------------------------------------------------------------------------
  | Minimum Attendance
  |--------------------------------------------------------------------------
  |
  | Change this value later if required.
  |
  */

  const minimumAttendance = 75;

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

        attributes: [
          "id",
        ],
      }),
    );

  /*
  |--------------------------------------------------------------------------
  | Internship Report
  |--------------------------------------------------------------------------
  */

  const reportApproved =
    Boolean(
      await InternshipReport.findOne({
        where: {
          student_id:
            studentId,

          status:
            "approved",
        },

        attributes: [
          "id",
        ],
      }),
    );

  /*
  |--------------------------------------------------------------------------
  | Eligibility Checks
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

  /*
  |--------------------------------------------------------------------------
  | Final Eligibility
  |--------------------------------------------------------------------------
  */

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

const getStudentChapterIds = async (
  domainId,
) => {
  if (!domainId) {
    return [];
  }

  const modules = await Module.findAll({
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

  return modules.flatMap((module) =>
    (module.Chapters || []).map(
      (chapter) => Number(chapter.id),
    ),
  );
};

const buildRecentActivities = async (
  studentId,
  chapterIds,
) => {
  const validChapterIds =
    chapterIds.length > 0
      ? chapterIds
      : [0];

  const [
    recentCompletions,
    recentLogbooks,
    recentSubmissions,
  ] = await Promise.all([
    ChapterCompletion.findAll({
      where: {
        student_id: studentId,
        chapter_id: {
          [Op.in]: validChapterIds,
        },
        status: "completed",
      },

      attributes: [
        "id",
        "chapter_id",
        "completed_at",
        "created_at",
      ],

      order: [
        ["completed_at", "DESC"],
        ["created_at", "DESC"],
      ],

      limit: 3,
    }),

    Logbook.findAll({
      where: {
        student_id: studentId,
      },

      attributes: [
        "id",
        "date",
        "activity",
        "hours_worked",
        "created_at",
      ],

      order: [
        ["date", "DESC"],
        ["created_at", "DESC"],
      ],

      limit: 3,
    }),

    Submission.findAll({
      where: {
        student_id: studentId,
      },

      attributes: [
        "id",
        "assignment_id",
        "status",
        "marks",
        "created_at",
      ],

      order: [["created_at", "DESC"]],

      limit: 3,
    }),
  ]);

  const completionChapterIds =
    recentCompletions.map(
      (item) => Number(item.chapter_id),
    );

  const chapters =
    completionChapterIds.length > 0
      ? await Chapter.findAll({
          where: {
            id: {
              [Op.in]:
                completionChapterIds,
            },
          },

          attributes: [
            "id",
            "chapter_name",
          ],
        })
      : [];

  const chapterMap = new Map(
    chapters.map((chapter) => [
      Number(chapter.id),
      chapter.chapter_name,
    ]),
  );

  const activities = [
    ...recentCompletions.map(
      (completion) => ({
        id: `chapter-${completion.id}`,
        type: "chapter_completed",
        title: "Chapter completed",
        description:
          chapterMap.get(
            Number(
              completion.chapter_id,
            ),
          ) ||
          `Chapter ${completion.chapter_id}`,
        date:
          completion.completed_at ||
          completion.created_at,
      }),
    ),

    ...recentLogbooks.map(
      (logbook) => ({
        id: `logbook-${logbook.id}`,
        type: "logbook_submitted",
        title: "Logbook submitted",
        description:
          logbook.activity,
        date:
          logbook.created_at ||
          logbook.date,
        hours: toNumber(
          logbook.hours_worked,
        ),
      }),
    ),

    ...recentSubmissions.map(
      (submission) => ({
        id: `assignment-${submission.id}`,
        type:
          "assignment_submitted",
        title:
          "Assignment submitted",
        description: `Assignment ${submission.assignment_id}`,
        status: submission.status,
        marks:
          submission.marks !== null
            ? toNumber(
                submission.marks,
              )
            : null,
        date: submission.created_at,
      }),
    ),
  ];

  return activities
    .sort(
      (first, second) =>
        new Date(second.date).getTime() -
        new Date(first.date).getTime(),
    )
    .slice(0, 6);
};

/**
 * GET /student/dashboard
 */
export const dashboard = asyncHandler(
  async (req, res) => {
    const student =
      await getCurrentStudent(req, {
        include: [
          {
            model: College,
            as: "college",
            attributes: [
              "id",
              "name",
              "code",
              "university",
              "logo",
            ],
          },
          {
            model: Domain,
            as: "domain",
            attributes: [
              "id",
              "domain_name",
              "duration_hours",
              "fee",
            ],
          },
        ],
      });

    /*
    |--------------------------------------------------------------------------
    | Student Domain Chapters
    |--------------------------------------------------------------------------
    */

    const chapterIds =
      await getStudentChapterIds(
        student.domain_id,
      );

    const validChapterIds =
      chapterIds.length > 0
        ? chapterIds
        : [0];

    /*
    |--------------------------------------------------------------------------
    | Active Domain Quizzes
    |--------------------------------------------------------------------------
    */

    const domainQuizzes =
      await Quiz.findAll({
        where: {
          chapter_id: {
            [Op.in]:
              validChapterIds,
          },

          status: "active",
        },

        attributes: [
          "id",
          "chapter_id",
        ],
      });

    const quizIds =
      domainQuizzes.map(
        (quiz) =>
          Number(quiz.id),
      );

    /*
    |--------------------------------------------------------------------------
    | Dashboard Data
    |--------------------------------------------------------------------------
    */

    const [
      completedChapterCount,
      totalAssignmentCount,
      approvedSubmissionCount,
      submittedAssignmentCount,
      attendanceRecords,
      logbookEntries,
      liveProject,
      internshipReport,
      certificate,
      latestPayment,
      recentActivities,
      quizAttempts,
    ] = await Promise.all([
      ChapterCompletion.count({
        where: {
          student_id:
            student.id,

          chapter_id: {
            [Op.in]:
              validChapterIds,
          },

          status: "completed",
        },

        distinct: true,
        col: "chapter_id",
      }),

      Assignment.count({
        where: {
          chapter_id: {
            [Op.in]:
              validChapterIds,
          },
        },
      }),

      Submission.count({
        where: {
          student_id:
            student.id,

          status: "approved",
        },

        distinct: true,
        col: "assignment_id",
      }),

      Submission.count({
        where: {
          student_id:
            student.id,
        },

        distinct: true,
        col: "assignment_id",
      }),

      Attendance.findAll({
        where: {
          student_id:
            student.id,
        },

        attributes: [
          "id",
          "date",
          "status",
          "learning_hours",
        ],

        order: [
          ["date", "DESC"],
        ],
      }),

      Logbook.findAll({
        where: {
          student_id:
            student.id,
        },

        attributes: [
          "id",
          "date",
          "hours_worked",
        ],

        order: [
          ["date", "DESC"],
        ],
      }),

      LiveProject.findOne({
        where: {
          student_id:
            student.id,
        },

        attributes: [
          "id",
          "title",
          "report_url",
          "status",
          "mentor_feedback",
          "created_at",
          "updated_at",
        ],

        order: [
          ["created_at", "DESC"],
        ],
      }),

      InternshipReport.findOne({
        where: {
          student_id:
            student.id,
        },

        attributes: [
          "id",
          "report_url",
          "status",
          "mentor_remarks",
          "created_at",
          "updated_at",
        ],

        order: [
          ["created_at", "DESC"],
        ],
      }),

      Certificate.findOne({
        where: {
          student_id:
            student.id,
        },

        attributes: [
          "id",
          "certificate_number",
          "qr_code_url",
          "issued_date",
          "created_at",
        ],
      }),

      Payment.findOne({
        where: {
          student_id:
            student.id,
        },

        attributes: [
          "id",
          "amount",
          "transaction_id",
          "status",
          "created_at",
        ],

        order: [
          ["created_at", "DESC"],
        ],
      }),

      buildRecentActivities(
        student.id,
        chapterIds,
      ),

      /*
      |--------------------------------------------------------------------------
      | Quiz Attempts
      |--------------------------------------------------------------------------
      */

      quizIds.length > 0
        ? QuizAttempt.findAll({
            where: {
              student_id:
                student.id,

              quiz_id: {
                [Op.in]:
                  quizIds,
              },

              status:
                "submitted",
            },

            attributes: [
              "id",
              "quiz_id",
              "percentage",
              "passed",
              "attempt_number",
            ],
          })
        : Promise.resolve([]),
    ]);

    /*
    |--------------------------------------------------------------------------
    | Group Quiz Attempts
    |--------------------------------------------------------------------------
    */

    const attemptsByQuiz =
      new Map();

    for (
      const attempt of
      quizAttempts
    ) {
      const currentQuizId =
        Number(
          attempt.quiz_id,
        );

      if (
        !attemptsByQuiz.has(
          currentQuizId,
        )
      ) {
        attemptsByQuiz.set(
          currentQuizId,
          [],
        );
      }

      attemptsByQuiz
        .get(currentQuizId)
        .push(attempt);
    }

    /*
    |--------------------------------------------------------------------------
    | Quiz Statistics
    |--------------------------------------------------------------------------
    */

    let quizzesPassed = 0;
    let totalBestScore = 0;
    let scoredQuizzes = 0;

    for (
      const currentQuizId of
      quizIds
    ) {
      const attempts =
        attemptsByQuiz.get(
          currentQuizId,
        ) || [];

      if (
        attempts.length === 0
      ) {
        continue;
      }

      const bestScore =
        Math.max(
          ...attempts.map(
            (attempt) =>
              toNumber(
                attempt.percentage,
              ),
          ),
        );

      totalBestScore +=
        bestScore;

      scoredQuizzes += 1;

      const passed =
        attempts.some(
          (attempt) =>
            Boolean(
              attempt.passed,
            ),
        );

      if (passed) {
        quizzesPassed += 1;
      }
    }

    const totalQuizzes =
      quizIds.length;

    const quizProgress =
      calculatePercentage(
        quizzesPassed,
        totalQuizzes,
      );

    const quizAverage =
      scoredQuizzes > 0
        ? Number(
            (
              totalBestScore /
              scoredQuizzes
            ).toFixed(2),
          )
        : 0;

    const totalQuizAttempts =
      quizAttempts.length;

    /*
    |--------------------------------------------------------------------------
    | Chapter Progress
    |--------------------------------------------------------------------------
    */

    const totalChapters =
      chapterIds.length;

    const courseProgress =
      calculatePercentage(
        completedChapterCount,
        totalChapters,
      );

    /*
    |--------------------------------------------------------------------------
    | Attendance
    |--------------------------------------------------------------------------
    */

    const totalAttendanceDays =
      attendanceRecords.length;

    const presentDays =
      attendanceRecords.filter(
        (record) =>
          record.status ===
          "present",
      ).length;

    const absentDays =
      attendanceRecords.filter(
        (record) =>
          record.status ===
          "absent",
      ).length;

    const leaveDays =
      attendanceRecords.filter(
        (record) =>
          record.status ===
          "leave",
      ).length;

    const halfDays =
      attendanceRecords.filter(
        (record) =>
          record.status ===
          "half_day",
      ).length;

    const attendancePercentage =
      calculatePercentage(
        presentDays +
          halfDays * 0.5,
        totalAttendanceDays,
      );

    const learningHours =
      attendanceRecords.reduce(
        (total, record) =>
          total +
          toNumber(
            record.learning_hours,
          ),
        0,
      );

    /*
    |--------------------------------------------------------------------------
    | Logbook
    |--------------------------------------------------------------------------
    */

    const logbookHours =
      logbookEntries.reduce(
        (total, logbook) =>
          total +
          toNumber(
            logbook.hours_worked,
          ),
        0,
      );

    /*
    |--------------------------------------------------------------------------
    | Required Learning Hours
    |--------------------------------------------------------------------------
    */

    const requiredHours =
      toNumber(
        student.domain
          ?.duration_hours,
      );

    const hoursRemaining =
      Math.max(
        requiredHours -
          learningHours,
        0,
      );

    /*
    |--------------------------------------------------------------------------
    | Assignment Progress
    |--------------------------------------------------------------------------
    */

    const assignmentProgress =
      calculatePercentage(
        approvedSubmissionCount,
        totalAssignmentCount,
      );

    /*
    |--------------------------------------------------------------------------
    | Project / Report Progress
    |--------------------------------------------------------------------------
    */

    const projectProgress =
      liveProject?.status ===
      "approved"
        ? 100
        : liveProject
          ? 50
          : 0;

    const reportProgress =
      internshipReport?.status ===
      "approved"
        ? 100
        : internshipReport
          ? 50
          : 0;

    /*
    |--------------------------------------------------------------------------
    | Overall Progress
    |--------------------------------------------------------------------------
    */

    const overallProgress =
      limitPercentage(
        Number(
          (
            courseProgress *
              0.5 +
            attendancePercentage *
              0.2 +
            assignmentProgress *
              0.2 +
            projectProgress *
              0.05 +
            reportProgress *
              0.05
          ).toFixed(2),
        ),
      );

    /*
    |--------------------------------------------------------------------------
    | Internship Eligibility
    |--------------------------------------------------------------------------
    */

    const eligibility =
      await getStudentEligibility(
        student.id,
        student.domain_id,
      );

      if (
  eligibility.eligible &&
  student.internship_status !== "completed"
) {
  await student.update({
    internship_status: "completed",
    internship_end_date:  new Date()
        .toISOString()
        .slice(0, 10),
  });
}

    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return ok(res, {
      student: {
        id:
          student.id,

        registration_number:
          student.registration_number,

        student_id:
          student.student_id,

        name:
          student.name,

        father_name:
          student.father_name,

        email:
          student.email,

        mobile:
          student.mobile,

        photo:
          student.photo,

        programme:
          student.programme,

        major_subject:
          student.major_subject,

        session:
          student.session,

        semester:
          student.semester,

        internship_status:
          student.internship_status,

        payment_status:
          student.payment_status,
        
          internship_start_date:
  student.internship_start_date,

internship_end_date:
  student.internship_end_date,

        college:
          student.college
            ? {
                id:
                  student
                    .college.id,

                name:
                  student
                    .college.name,

                code:
                  student
                    .college.code,

                university:
                  student
                    .college
                    .university,

                logo:
                  student
                    .college.logo,
              }
            : null,

        domain:
          student.domain
            ? {
                id:
                  student
                    .domain.id,

                domain_name:
                  student
                    .domain
                    .domain_name,

                duration_hours:
                  toNumber(
                    student
                      .domain
                      .duration_hours,
                  ),

                fee:
                  toNumber(
                    student
                      .domain.fee,
                  ),
              }
            : null,
      },

      stats: {
        course_progress:
          courseProgress,

        attendance:
          attendancePercentage,

        overall_progress:
          overallProgress,

        completed_chapters:
          completedChapterCount,

        total_chapters:
          totalChapters,

        remaining_chapters:
          Math.max(
            totalChapters -
              completedChapterCount,
            0,
          ),

        learning_hours:
          Number(
            learningHours.toFixed(
              2,
            ),
          ),

        required_hours:
          requiredHours,

        hours_remaining:
          Number(
            hoursRemaining.toFixed(
              2,
            ),
          ),

        logbook_hours:
          Number(
            logbookHours.toFixed(
              2,
            ),
          ),

        logbook_entries:
          logbookEntries.length,

        assignments_total:
          totalAssignmentCount,

        assignments_submitted:
          submittedAssignmentCount,

        assignments_completed:
          approvedSubmissionCount,

        assignment_progress:
          assignmentProgress,

        /*
        |--------------------------------------------------------------------------
        | Quiz Stats
        |--------------------------------------------------------------------------
        */

        total_quizzes:
          totalQuizzes,

        quizzes_passed:
          quizzesPassed,

        quizzes_remaining:
          Math.max(
            totalQuizzes -
              quizzesPassed,
            0,
          ),

        quiz_progress:
          quizProgress,

        quiz_average:
          quizAverage,

        total_quiz_attempts:
          totalQuizAttempts,
      },

      attendance_summary: {
        total_days:
          totalAttendanceDays,

        present_days:
          presentDays,

        absent_days:
          absentDays,

        leave_days:
          leaveDays,

        half_days:
          halfDays,

        percentage:
          attendancePercentage,
      },

      status: {
        project:
          liveProject
            ? {
                id:
                  liveProject.id,

                title:
                  liveProject.title,

                status:
                  liveProject.status,

                report_url:
                  liveProject
                    .report_url,

                mentor_feedback:
                  liveProject
                    .mentor_feedback,

                submitted_at:
                  liveProject
                    .created_at,
              }
            : null,

        report:
          internshipReport
            ? {
                id:
                  internshipReport.id,

                status:
                  internshipReport
                    .status,

                report_url:
                  internshipReport
                    .report_url,

                mentor_remarks:
                  internshipReport
                    .mentor_remarks,

                submitted_at:
                  internshipReport
                    .created_at,
              }
            : null,

        certificate:
          certificate
            ? {
                available:
                  true,

                certificate_number:
                  certificate
                    .certificate_number,

                qr_code_url:
                  certificate
                    .qr_code_url,

                issued_date:
                  certificate
                    .issued_date,
              }
            : {
                available:
                  false,

                certificate_number:
                  null,

                qr_code_url:
                  null,

                issued_date:
                  null,
              },

        payment:
          latestPayment
            ? {
                amount:
                  toNumber(
                    latestPayment
                      .amount,
                  ),

                transaction_id:
                  latestPayment
                    .transaction_id,

                status:
                  latestPayment
                    .status,

                date:
                  latestPayment
                    .created_at,
              }
            : null,
      },

      eligibility,

      recent_activities:
        recentActivities,
    });
  },
);

/**
 * GET /student/profile
 */
export const getProfile = asyncHandler(
  async (req, res) => {
    const student =
      await getCurrentStudent(req, {
        include: [
          {
            model: College,
            as : "college",
            attributes: [
              "id",
              "name",
              "code",
              "university",
              "principal_name",
              "coordinator_name",
              "email",
              "mobile",
              "address",
              "state",
              "district",
              "pincode",
              "logo",
            ],
          },

          {
            model: Domain,
            as: "domain",
            attributes: [
              "id",
              "domain_name",
              "duration_hours",
              "fee",
            ],
          },
        ],
      });

    return ok(res, {
      id: student.id,

      registration_number:
        student.registration_number,

      student_id:
        student.student_id,

      name: student.name,

      father_name:
        student.father_name,

      gender: student.gender,

      dob: student.dob,

      programme:
        student.programme,

      major_subject:
        student.major_subject,

      session: student.session,

      semester: student.semester,

      mobile: student.mobile,

      email: student.email,

      photo: student.photo,

      registration_date:
        student.registration_date,

      internship_status:
        student.internship_status,

      payment_status:
        student.payment_status,

      username: student.username,

      academics:
        student.academics_json || {},

      college: student.College
        ? {
            id: student.College.id,
            name: student.College.name,
            code: student.College.code,
            university:
              student.College
                .university,
            principal_name:
              student.College
                .principal_name,
            coordinator_name:
              student.College
                .coordinator_name,
            email:
              student.College.email,
            mobile:
              student.College.mobile,
            address:
              student.College.address,
            state:
              student.College.state,
            district:
              student.College
                .district,
            pincode:
              student.College.pincode,
            logo: student.College.logo,
          }
        : null,

      domain: student.domain
        ? {
            id: student.domain.id,
            domain_name:
              student.domain
                .domain_name,
            duration_hours:
              toNumber(
                student.domain
                  .duration_hours,
              ),
            fee: toNumber(
              student.domain.fee,
            ),
          }
        : null,
    });
  },
);

export const getDocuments =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const documents =
      await GeneratedDocument.findAll({
        where: {
          student_id:
            student.id,
        },

        attributes: [
          "id",
          "student_id",
          "type",
          "file_url",
          "generated_at",
          "metadata_json",
        ],

        order: [
          [
            "generated_at",
            "DESC",
          ],
          ["id", "DESC"],
        ],
      });

    return ok(
      res,
      {
        documents:
          documents.map(
            (document) => ({
              id:
                document.id,

              type:
                document.type,

              file_url:
                document.file_url,

              generated_at:
                document.generated_at,

              metadata:
                document.metadata_json,

              download_url:
                `/student/documents/${document.id}/download`,
            }),
          ),

        total:
          documents.length,
      },
      "Student documents fetched successfully",
    );
  });

  /**
 * GET /student/documents/:documentId/download
 */
export const downloadDocument =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const documentId =
      Number(
        req.params.documentId,
      );

    if (
      !Number.isInteger(
        documentId,
      ) ||
      documentId <= 0
    ) {
      throw new AppError(
        "Invalid document id",
        422,
      );
    }

    const document =
      await GeneratedDocument.findOne({
        where: {
          id:
            documentId,

          student_id:
            student.id,
        },
      });

    if (!document) {
      throw new AppError(
        "Document not found",
        404,
      );
    }

    const relativePath =
      String(
        document.file_url ||
          "",
      )
        .replace(
          /^https?:\/\/[^/]+/i,
          "",
        )
        .replace(
          /^\/+/,
          "",
        );

    if (!relativePath) {
      throw new AppError(
        "Document file is not available",
        404,
      );
    }

    const absolutePath =
      path.resolve(
        process.cwd(),
        relativePath,
      );

    const uploadsRoot =
      path.resolve(
        process.cwd(),
        "uploads",
      );

    const validPath =
      absolutePath ===
        uploadsRoot ||
      absolutePath.startsWith(
        `${uploadsRoot}${path.sep}`,
      );

    if (!validPath) {
      throw new AppError(
        "Invalid document file path",
        400,
      );
    }

    if (
      !fs.existsSync(
        absolutePath,
      )
    ) {
      throw new AppError(
        "Document file does not exist on server",
        404,
      );
    }

    const label =
      String(document.type)
        .replaceAll(
          "_",
          "-",
        );

    const filename =
      `${label}-${student.registration_number}.pdf`;

    return res.download(
      absolutePath,
      filename,
    );
  });

/**
 * PUT /student/profile
 *
 * Editable fields:
 * mobile
 * email
 * photo
 */
export const updateProfile =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const {
      mobile,
      email,
      photo,
    } = req.body;

    const updatePayload = {};

    if (mobile !== undefined) {
      const normalizedMobile =
        String(mobile).trim();

      if (
        normalizedMobile &&
        !/^[0-9]{10,15}$/.test(
          normalizedMobile,
        )
      ) {
        throw new AppError(
          "Mobile number must contain 10 to 15 digits",
          422,
        );
      }

      updatePayload.mobile =
        normalizedMobile || null;
    }

    if (email !== undefined) {
      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (
        normalizedEmail &&
        !emailPattern.test(
          normalizedEmail,
        )
      ) {
        throw new AppError(
          "Please provide a valid email address",
          422,
        );
      }

      if (normalizedEmail) {
        const existingStudent =
          await Student.findOne({
            where: {
              email: normalizedEmail,

              id: {
                [Op.ne]: student.id,
              },
            },

            attributes: ["id"],
          });

        if (existingStudent) {
          throw new AppError(
            "Email address is already registered",
            409,
          );
        }
      }

      updatePayload.email =
        normalizedEmail || null;
    }

    if (photo !== undefined) {
      updatePayload.photo =
        photo
          ? String(photo).trim()
          : null;
    }

    if (
      Object.keys(updatePayload)
        .length === 0
    ) {
      throw new AppError(
        "No valid profile fields were provided",
        422,
      );
    }

    await student.update(
      updatePayload,
    );

    return ok(
      res,
      {
        id: student.id,
        mobile: student.mobile,
        email: student.email,
        photo: student.photo,
      },
      "Profile updated successfully",
    );
  });

  export const checkRegistration = asyncHandler(
  async (req, res) => {
    const registrationNumber = String(
      req.body.registration_number || "",
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
        "Registration number not found",
        404,
      );
    }

    return ok(res, {
      id: student.id,
      name: student.name,
      college_id: student.college_id,
      registration_number:
        student.registration_number,
      internship_status:
        student.internship_status,
      payment_status:
        student.payment_status,
      registration_locked:
        student.registration_locked,
      domain_id: student.domain_id,
    });
  },
);

export const saveAcademics = asyncHandler(
  async (req, res) => {
    const {
      registration_number,
      academics,
      username,
      password,
      domain_id,
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
        "Registration is locked. Continue to payment.",
        409,
      );
    }

    if (!domain_id) {
      throw new AppError(
        "Domain is required",
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

    if (
      password &&
      String(password).length < 8
    ) {
      throw new AppError(
        "Password must be at least 8 characters",
        422,
      );
    }

    const updatePayload = {
      academics_json:
        academics || {},
      username:
        String(
          username ||
            student.username ||
            student.registration_number,
        ).trim(),
      domain_id,
      internship_status:
        "registered",
      registration_date:
        student.registration_date ||
        new Date(),
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
      },
      "Registration details saved",
    );
  },
);
/**
 * GET /student/learning
 */
/**
 * GET /student/learning
 */
/**
 * GET /student/learning
 */
export const learning = asyncHandler(
  async (req, res) => {
    const student =
      await getCurrentStudent(req);

    await ensureInternshipStarted(
      student,
    );


    if (!student.domain_id) {
      return ok(res, {
        modules: [],
        summary: {
          total_modules: 0,
          total_chapters: 0,
          completed_chapters: 0,
          remaining_chapters: 0,
          progress_percentage: 0,

          total_quizzes: 0,
          quizzes_passed: 0,
          quiz_progress_percentage: 0,
          average_quiz_score: 0,
        },
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Fetch learning structure
    |--------------------------------------------------------------------------
    */

    const modules = await Module.findAll({
      where: {
        domain_id: student.domain_id,
      },

      include: [
        {
          model: Chapter,
          required: false,

          include: [
            {
              model: ChapterResource,
              as: "resources",
              required: false,

              where: {
                status: "active",
              },
            },

            {
              model: Quiz,
              as: "quiz",
              required: false,

              where: {
                status: "active",
              },
            },
          ],
        },
      ],

      order: [
        ["module_number", "ASC"],

        [
          Chapter,
          "chapter_number",
          "ASC",
        ],

        [
          Chapter,
          {
            model: ChapterResource,
            as: "resources",
          },
          "sort_order",
          "ASC",
        ],
      ],
    });

    /*
    |--------------------------------------------------------------------------
    | Collect chapter + quiz IDs
    |--------------------------------------------------------------------------
    */

    const allChapters =
      modules.flatMap(
        (module) =>
          module.Chapters || [],
      );

    const chapterIds =
      allChapters.map(
        (chapter) =>
          Number(chapter.id),
      );

    const quizIds =
      allChapters
        .map((chapter) =>
          chapter.quiz
            ? Number(
                chapter.quiz.id,
              )
            : null,
        )
        .filter(Boolean);

    /*
    |--------------------------------------------------------------------------
    | Load chapter completions
    |--------------------------------------------------------------------------
    */

    const completions =
      chapterIds.length > 0
        ? await ChapterCompletion.findAll({
            where: {
              student_id:
                student.id,

              chapter_id: {
                [Op.in]:
                  chapterIds,
              },
            },

            attributes: [
              "chapter_id",
              "status",
              "completed_at",
            ],
          })
        : [];

    const completedChapterIds =
      new Set(
        completions
          .filter(
            (completion) =>
              completion.status ===
              "completed",
          )
          .map((completion) =>
            Number(
              completion.chapter_id,
            ),
          ),
      );

    /*
    |--------------------------------------------------------------------------
    | Load all quiz attempts
    |--------------------------------------------------------------------------
    */

    const quizAttempts =
      quizIds.length > 0
        ? await QuizAttempt.findAll({
            where: {
              student_id:
                student.id,

              quiz_id: {
                [Op.in]:
                  quizIds,
              },
            },

            attributes: [
              "id",
              "quiz_id",
              "attempt_number",
              "obtained_marks",
              "total_marks",
              "percentage",
              "passed",
              "status",
              "started_at",
              "submitted_at",
              "expires_at",
              "time_taken_seconds",
            ],

            order: [
              [
                "attempt_number",
                "DESC",
              ],
            ],
          })
        : [];

    /*
    |--------------------------------------------------------------------------
    | Group quiz attempts
    |--------------------------------------------------------------------------
    */

    const attemptsByQuiz =
      new Map();

    for (
      const attempt of
      quizAttempts
    ) {
      const quizId =
        Number(attempt.quiz_id);

      if (
        !attemptsByQuiz.has(
          quizId,
        )
      ) {
        attemptsByQuiz.set(
          quizId,
          [],
        );
      }

      attemptsByQuiz
        .get(quizId)
        .push(attempt);
    }

    /*
    |--------------------------------------------------------------------------
    | Format modules
    |--------------------------------------------------------------------------
    */

    let previousChapterCompleted =
      true;

    let totalChapters = 0;
    let completedChapters = 0;

    let totalQuizzes = 0;
    let quizzesPassed = 0;

    let quizScoreTotal = 0;
    let scoredQuizCount = 0;

    const formattedModules =
      modules.map((module) => {
        const moduleJson =
          module.toJSON();

        const chapters = (
          moduleJson.Chapters ||
          []
        ).map((chapter) => {
          totalChapters += 1;

          const chapterId =
            Number(chapter.id);

          const completed =
            completedChapterIds.has(
              chapterId,
            );

          if (completed) {
            completedChapters +=
              1;
          }

          /*
           * Chapter unlock logic
           */

          const unlocked =
            previousChapterCompleted ||
            completed;

          previousChapterCompleted =
            completed;

          /*
           * Resources
           */

          const resources = (
            chapter.resources ||
            []
          )
            .filter(
              (resource) =>
                resource.status ===
                "active",
            )
            .sort(
              (
                first,
                second,
              ) =>
                Number(
                  first.sort_order ||
                    0,
                ) -
                Number(
                  second.sort_order ||
                    0,
                ),
            );

          /*
           * Quiz
           */

          let formattedQuiz =
            null;

          if (
            chapter.quiz &&
            chapter.quiz.status ===
              "active"
          ) {
            totalQuizzes += 1;

            const quizId =
              Number(
                chapter.quiz.id,
              );

            const attempts =
              attemptsByQuiz.get(
                quizId,
              ) || [];

            const finalizedAttempts =
              attempts.filter(
                (attempt) =>
                  [
                    "submitted",
                    "expired",
                  ].includes(
                    attempt.status,
                  ),
              );

            const submittedAttempts =
              attempts.filter(
                (attempt) =>
                  attempt.status ===
                  "submitted",
              );

            const activeAttempt =
              attempts.find(
                (attempt) =>
                  attempt.status ===
                  "in_progress",
              );

            const passedAttempt =
              submittedAttempts.find(
                (attempt) =>
                  Boolean(
                    attempt.passed,
                  ),
              );

            const bestAttempt =
              submittedAttempts.length >
              0
                ? submittedAttempts.reduce(
                    (
                      best,
                      current,
                    ) =>
                      Number(
                        current.percentage,
                      ) >
                      Number(
                        best.percentage,
                      )
                        ? current
                        : best,
                  )
                : null;

            const passed =
              Boolean(
                passedAttempt,
              );

            if (passed) {
              quizzesPassed += 1;
            }

            if (bestAttempt) {
              quizScoreTotal +=
                Number(
                  bestAttempt.percentage ||
                    0,
                );

              scoredQuizCount +=
                1;
            }

            const attemptsAllowed =
              Number(
                chapter.quiz
                  .attempts_allowed ||
                  1,
              );

            const attemptsUsed =
              finalizedAttempts.length;

            const attemptsRemaining =
              Math.max(
                attemptsAllowed -
                  attemptsUsed,
                0,
              );

            formattedQuiz = {
              id:
                chapter.quiz.id,

              chapter_id:
                chapter.quiz
                  .chapter_id,

              title:
                chapter.quiz.title,

              description:
                chapter.quiz
                  .description ||
                null,

              passing_score:
                toNumber(
                  chapter.quiz
                    .passing_score,
                ),

              total_marks:
                toNumber(
                  chapter.quiz
                    .total_marks,
                ),

              attempts_allowed:
                attemptsAllowed,

              attempts_used:
                attemptsUsed,

              attempts_remaining:
                attemptsRemaining,

              time_limit_minutes:
                chapter.quiz
                  .time_limit_minutes,

              randomize_questions:
                Boolean(
                  chapter.quiz
                    .randomize_questions,
                ),

              show_result_immediately:
                Boolean(
                  chapter.quiz
                    .show_result_immediately,
                ),

              status:
                chapter.quiz.status,

              passed,

              can_start:
                Boolean(
                  activeAttempt ||
                    attemptsRemaining >
                      0,
                ),

              active_attempt_id:
                activeAttempt?.id ||
                null,

              best_score:
                bestAttempt
                  ? toNumber(
                      bestAttempt.percentage,
                    )
                  : null,

              best_attempt_id:
                bestAttempt?.id ||
                null,

              latest_attempt:
                attempts.length >
                0
                  ? {
                      id:
                        attempts[0]
                          .id,

                      attempt_number:
                        attempts[0]
                          .attempt_number,

                      percentage:
                        toNumber(
                          attempts[0]
                            .percentage,
                        ),

                      passed:
                        Boolean(
                          attempts[0]
                            .passed,
                        ),

                      status:
                        attempts[0]
                          .status,
                    }
                  : null,
            };
          }

          return {
            id: chapter.id,

            module_id:
              chapter.module_id,

            chapter_number:
              chapter.chapter_number,

            chapter_name:
              chapter.chapter_name,

            description:
              chapter.description ||
              null,

            duration_minutes:
              Number(
                chapter.duration_minutes ||
                  0,
              ),

            is_preview:
              Boolean(
                chapter.is_preview,
              ),

            status:
              chapter.status,

            unlocked,
            completed,

            resources,

            resource_count:
              resources.length,

            quiz:
              formattedQuiz,

            has_quiz:
              Boolean(
                formattedQuiz,
              ),
          };
        });

        const moduleCompletedCount =
          chapters.filter(
            (chapter) =>
              chapter.completed,
          ).length;

        return {
          id: moduleJson.id,

          domain_id:
            moduleJson.domain_id,

          module_number:
            moduleJson.module_number,

          module_name:
            moduleJson.module_name,

          Chapters: chapters,

          progress:
            calculatePercentage(
              moduleCompletedCount,
              chapters.length,
            ),

          completed:
            chapters.length > 0 &&
            moduleCompletedCount ===
              chapters.length,
        };
      });

    /*
    |--------------------------------------------------------------------------
    | Summary
    |--------------------------------------------------------------------------
    */

    const learningProgress =
      calculatePercentage(
        completedChapters,
        totalChapters,
      );

    const quizProgress =
      calculatePercentage(
        quizzesPassed,
        totalQuizzes,
      );

    const averageQuizScore =
      scoredQuizCount > 0
        ? Number(
            (
              quizScoreTotal /
              scoredQuizCount
            ).toFixed(2),
          )
        : 0;

    return ok(res, {
      modules:
        formattedModules,

      summary: {
        total_modules:
          formattedModules.length,

        total_chapters:
          totalChapters,

        completed_chapters:
          completedChapters,

        remaining_chapters:
          Math.max(
            totalChapters -
              completedChapters,
            0,
          ),

        progress_percentage:
          learningProgress,

        total_quizzes:
          totalQuizzes,

        quizzes_passed:
          quizzesPassed,

        quizzes_remaining:
          Math.max(
            totalQuizzes -
              quizzesPassed,
            0,
          ),

        quiz_progress_percentage:
          quizProgress,

        average_quiz_score:
          averageQuizScore,
      },
    });
  },
);

/**
 * POST /student/chapters/:chapterId/complete
 */
export const completeChapter =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

      await ensureInternshipStarted(
  student,
);

    const chapterId = Number(
      req.params.chapterId,
    );

    if (
      !Number.isInteger(chapterId) ||
      chapterId <= 0
    ) {
      throw new AppError(
        "Invalid chapter id",
        422,
      );
    }

    const chapter = await Chapter.findOne({
      where: {
        id: chapterId,
      },

      include: [
        {
          model: Module,
          required: true,
          where: {
            domain_id:
              student.domain_id,
          },
          attributes: ["id"],
        },
      ],
    });

    if (!chapter) {
      throw new AppError(
        "Chapter not found for your domain",
        404,
      );
    }

    const [completion, created] =
      await ChapterCompletion.findOrCreate({
        where: {
          student_id: student.id,
          chapter_id: chapterId,
        },

        defaults: {
          status: "completed",
          completed_at: new Date(),
        },
      });

    if (!created) {
      await completion.update({
        status: "completed",
        completed_at:
          completion.completed_at ||
          new Date(),
      });
    }

    return ok(
      res,
      {
        chapter_id: chapterId,
        status: "completed",
      },
      "Chapter completed successfully",
    );
  });

/**
 * POST /student/logbook
 */
export const submitLogbook =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const {
      date,
      activity,
      skills,
      hours_worked,
    } = req.body;

    if (!date) {
      throw new AppError(
        "Logbook date is required",
        422,
      );
    }

    if (!String(activity || "").trim()) {
      throw new AppError(
        "Activity is required",
        422,
      );
    }

    const hours = Number(hours_worked);

    if (
      !Number.isFinite(hours) ||
      hours <= 0 ||
      hours > 24
    ) {
      throw new AppError(
        "Hours worked must be between 0 and 24",
        422,
      );
    }

    const logbook = await Logbook.create({
      student_id: student.id,
      date,
      activity: String(activity).trim(),
      skills: skills
        ? String(skills).trim()
        : null,
      hours_worked: hours,
    });

    return ok(
      res,
      logbook,
      "Logbook submitted successfully",
      201,
    );
  });

/**
 * POST /student/projects
 */
export const submitProject =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    if (!req.file) {
      throw new AppError(
        "Project report PDF is required",
        422,
      );
    }

    const title = String(
      req.body.title || "",
    ).trim();

    if (!title) {
      throw new AppError(
        "Project title is required",
        422,
      );
    }

    const existingProject =
      await LiveProject.findOne({
        where: {
          student_id: student.id,
        },

        order: [["created_at", "DESC"]],
      });

    const payload = {
      student_id: student.id,
      domain_id: student.domain_id,
      title,
      report_url: `/uploads/projects/${req.file.filename}`,
      status: "submitted",
      mentor_feedback: null,
    };

    let project;

    if (
      existingProject &&
      existingProject.status !== "approved"
    ) {
      await existingProject.update(payload);
      project = existingProject;
    } else {
      project =
        await LiveProject.create(payload);
    }

    return ok(
      res,
      project,
      "Project submitted successfully",
      201,
    );
  });

/**
 * POST /student/reports
 */
export const submitReport =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    if (!req.file) {
      throw new AppError(
        "Internship report PDF is required",
        422,
      );
    }

    const existingReport =
      await InternshipReport.findOne({
        where: {
          student_id: student.id,
        },

        order: [["created_at", "DESC"]],
      });

    const payload = {
      student_id: student.id,
      report_url: `/uploads/reports/${req.file.filename}`,
      status: "submitted",
      mentor_remarks: null,
    };

    let report;

    if (
      existingReport &&
      existingReport.status !== "approved"
    ) {
      await existingReport.update(payload);
      report = existingReport;
    } else {
      report =
        await InternshipReport.create(
          payload,
        );
    }

    return ok(
      res,
      report,
      "Internship report submitted successfully",
      201,
    );
  });

/**
 * POST /student/assignments/:assignmentId
 */
export const submitAssignment =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const assignmentId = Number(
      req.params.assignmentId,
    );

    if (
      !Number.isInteger(assignmentId) ||
      assignmentId <= 0
    ) {
      throw new AppError(
        "Invalid assignment id",
        422,
      );
    }

    if (!req.file) {
      throw new AppError(
        "Assignment file is required",
        422,
      );
    }

    const assignment =
      await Assignment.findOne({
        where: {
          id: assignmentId,
        },

        include: [
          {
            model: Chapter,
            required: true,

            include: [
              {
                model: Module,
                required: true,
                where: {
                  domain_id:
                    student.domain_id,
                },
                attributes: ["id"],
              },
            ],
          },
        ],
      });

    if (!assignment) {
      throw new AppError(
        "Assignment not found for your domain",
        404,
      );
    }

    const existingSubmission =
      await Submission.findOne({
        where: {
          student_id: student.id,
          assignment_id: assignmentId,
        },

        order: [["created_at", "DESC"]],
      });

    if (
      existingSubmission?.status ===
      "approved"
    ) {
      throw new AppError(
        "Approved assignment cannot be submitted again",
        409,
      );
    }

    const payload = {
      student_id: student.id,
      assignment_id: assignmentId,
      file_url: `/uploads/submissions/${req.file.filename}`,
      status: "submitted",
      marks: null,
      mentor_comments: null,
    };

    let submission;

    if (existingSubmission) {
      await existingSubmission.update(
        payload,
      );

      submission = existingSubmission;
    } else {
      submission =
        await Submission.create(payload);
    }

    return ok(
      res,
      submission,
      "Assignment submitted successfully",
      201,
    );
  });

  /**
 * GET /student/assignments
 */
export const getAssignments = asyncHandler(
  async (req, res) => {
    const student =
      await getCurrentStudent(req);

    if (!student.domain_id) {
      return ok(res, {
        assignments: [],
        summary: {
          total: 0,
          pending: 0,
          submitted: 0,
          approved: 0,
          rejected: 0,
        },
      });
    }

    const modules = await Module.findAll({
      where: {
        domain_id: student.domain_id,
      },

      attributes: [
        "id",
        "module_name",
        "module_number",
      ],

      include: [
        {
          model: Chapter,
          required: false,

          attributes: [
            "id",
            "chapter_name",
            "chapter_number",
          ],

          include: [
            {
              model: Assignment,
              required: false,
            },
          ],
        },
      ],

      order: [
        ["module_number", "ASC"],
        [
          Chapter,
          "chapter_number",
          "ASC",
        ],
      ],
    });

    const assignments = modules.flatMap(
      (module) =>
        (module.Chapters || []).flatMap(
          (chapter) =>
            (
              chapter.Assignments || []
            ).map((assignment) => ({
              assignment,
              chapter,
              module,
            })),
        ),
    );

    const assignmentIds =
      assignments.map(({ assignment }) =>
        Number(assignment.id),
      );

    const submissions =
      assignmentIds.length > 0
        ? await Submission.findAll({
            where: {
              student_id: student.id,

              assignment_id: {
                [Op.in]: assignmentIds,
              },
            },

            order: [
              ["created_at", "DESC"],
            ],
          })
        : [];

    const submissionMap = new Map();

    for (const submission of submissions) {
      const assignmentId = Number(
        submission.assignment_id,
      );

      if (
        !submissionMap.has(assignmentId)
      ) {
        submissionMap.set(
          assignmentId,
          submission,
        );
      }
    }

    const formattedAssignments =
      assignments.map(
        ({
          assignment,
          chapter,
          module,
        }) => {
          const submission =
            submissionMap.get(
              Number(assignment.id),
            );

          return {
            id: assignment.id,

            title:
              assignment.title ||
              assignment.assignment_title ||
              assignment.name,

            description:
              assignment.description ||
              null,

            instructions:
              assignment.instructions ||
              null,

            due_date:
              assignment.due_date ||
              null,

            maximum_marks:
              toNumber(
                assignment.maximum_marks ||
                  assignment.max_marks,
              ),

            file_url:
              assignment.file_url ||
              null,

            module: {
              id: module.id,
              name:
                module.module_name,
              number:
                module.module_number,
            },

            chapter: {
              id: chapter.id,
              name:
                chapter.chapter_name,
              number:
                chapter.chapter_number,
            },

            submission: submission
              ? {
                  id: submission.id,
                  status:
                    submission.status,
                  file_url:
                    submission.file_url,
                  marks:
                    submission.marks !==
                    null
                      ? toNumber(
                          submission.marks,
                        )
                      : null,
                  mentor_comments:
                    submission
                      .mentor_comments ||
                    submission.feedback ||
                    null,
                  submitted_at:
                    submission.created_at,
                  updated_at:
                    submission.updated_at,
                }
              : null,

            status:
              submission?.status ||
              "pending",

            can_submit:
              !submission ||
              submission.status ===
                "rejected",
          };
        },
      );

    const summary =
      formattedAssignments.reduce(
        (result, assignment) => {
          result.total += 1;

          if (
            assignment.status ===
            "approved"
          ) {
            result.approved += 1;
          } else if (
            assignment.status ===
            "rejected"
          ) {
            result.rejected += 1;
          } else if (
            assignment.status ===
              "submitted" ||
            assignment.status ===
              "pending_review"
          ) {
            result.submitted += 1;
          } else {
            result.pending += 1;
          }

          return result;
        },
        {
          total: 0,
          pending: 0,
          submitted: 0,
          approved: 0,
          rejected: 0,
        },
      );

    return ok(res, {
      assignments:
        formattedAssignments,
      summary,
    });
  },
);

/**
 * GET /student/assignments/:assignmentId
 */
export const getAssignmentDetails =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const assignmentId = Number(
      req.params.assignmentId,
    );

    if (
      !Number.isInteger(assignmentId) ||
      assignmentId <= 0
    ) {
      throw new AppError(
        "Invalid assignment id",
        422,
      );
    }

    const assignment =
      await Assignment.findOne({
        where: {
          id: assignmentId,
        },

        include: [
          {
            model: Chapter,
            required: true,

            include: [
              {
                model: Module,
                required: true,

                where: {
                  domain_id:
                    student.domain_id,
                },
              },
            ],
          },
        ],
      });

    if (!assignment) {
      throw new AppError(
        "Assignment not found",
        404,
      );
    }

    const submission =
      await Submission.findOne({
        where: {
          student_id: student.id,
          assignment_id: assignmentId,
        },

        order: [
          ["created_at", "DESC"],
        ],
      });

    return ok(res, {
      assignment: {
        ...assignment.toJSON(),

        submission: submission
          ? submission.toJSON()
          : null,

        can_submit:
          !submission ||
          submission.status ===
            "rejected",
      },
    });
  });

  /**
 * GET /student/attendance
 */
export const getAttendance =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

      await ensureInternshipStarted(
  student,
);

    const {
      from_date,
      to_date,
      status,
      page = 1,
      limit = 30,
    } = req.query;

    const pageNumber = Math.max(
      Number(page) || 1,
      1,
    );

    const limitNumber = Math.min(
      Math.max(Number(limit) || 30, 1),
      100,
    );

    const where = {
      student_id: student.id,
    };

    if (status) {
      where.status = String(status);
    }

    if (from_date || to_date) {
      where.date = {};

      if (from_date) {
        where.date[Op.gte] =
          from_date;
      }

      if (to_date) {
        where.date[Op.lte] = to_date;
      }
    }

    const {
      rows,
      count,
    } = await Attendance.findAndCountAll({
      where,

      order: [["date", "DESC"]],

      limit: limitNumber,

      offset:
        (pageNumber - 1) *
        limitNumber,
    });

    const allAttendance =
      await Attendance.findAll({
        where: {
          student_id: student.id,
        },

        attributes: [
          "status",
          "learning_hours",
        ],
      });

    const totalDays =
      allAttendance.length;

    const presentDays =
      allAttendance.filter(
        (record) =>
          record.status === "present",
      ).length;

    const absentDays =
      allAttendance.filter(
        (record) =>
          record.status === "absent",
      ).length;

    const leaveDays =
      allAttendance.filter(
        (record) =>
          record.status === "leave",
      ).length;

    const halfDays =
      allAttendance.filter(
        (record) =>
          record.status === "half_day",
      ).length;

    const totalLearningHours =
      allAttendance.reduce(
        (total, record) =>
          total +
          toNumber(
            record.learning_hours,
          ),
        0,
      );

    const attendancePercentage =
      calculatePercentage(
        presentDays +
          halfDays * 0.5,
        totalDays,
      );

    return ok(res, {
      records: rows,

      summary: {
        total_days: totalDays,
        present_days: presentDays,
        absent_days: absentDays,
        leave_days: leaveDays,
        half_days: halfDays,

        attendance_percentage:
          attendancePercentage,

        total_learning_hours:
          Number(
            totalLearningHours.toFixed(
              2,
            ),
          ),
      },

      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total_records: count,

        total_pages: Math.ceil(
          count / limitNumber,
        ),
      },
    });
  });

  /**
 * GET /student/attendance/calendar
 */
export const getAttendanceCalendar =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

      await ensureInternshipStarted(
      student,
    );

    const currentDate = new Date();

    const month = Math.min(
      Math.max(
        Number(req.query.month) ||
          currentDate.getMonth() + 1,
        1,
      ),
      12,
    );

    const year =
      Number(req.query.year) ||
      currentDate.getFullYear();

    const startDate = new Date(
      year,
      month - 1,
      1,
    );

    const endDate = new Date(
      year,
      month,
      0,
    );

    const records =
      await Attendance.findAll({
        where: {
          student_id: student.id,

          date: {
            [Op.between]: [
              startDate,
              endDate,
            ],
          },
        },

        order: [["date", "ASC"]],
      });

    return ok(res, {
      month,
      year,

      records: records.map(
        (record) => ({
          id: record.id,
          date: record.date,
          status: record.status,
          learning_hours:
            toNumber(
              record.learning_hours,
            ),
          remarks:
            record.remarks || null,
        }),
      ),
    });
  });

  

const getIndiaDateParts = () => {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      },
    );

  const parts = formatter.formatToParts(
    new Date(),
  );

  const values = Object.fromEntries(
    parts.map((part) => [
      part.type,
      part.value,
    ]),
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}:${values.second}`,
  };
};

const timeToSeconds = (time) => {
  if (!time) {
    return 0;
  }

  const [
    hours = 0,
    minutes = 0,
    seconds = 0,
  ] = String(time)
    .split(":")
    .map(Number);

  return (
    hours * 3600 +
    minutes * 60 +
    seconds
  );
};



/**
 * GET /student/attendance/today
 */
export const getTodayAttendance =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

       await ensureInternshipStarted(
      student,
    );

    const { date } =
      getIndiaDateParts();

    const attendance =
      await Attendance.findOne({
        where: {
          student_id: student.id,
          date,
        },
      });

    if (!attendance) {
      return ok(res, {
        date,
        checked_in: false,
        checked_out: false,
        attendance: null,
      });
    }

    return ok(res, {
      date,

      checked_in:
        Boolean(
          attendance.login_time,
        ),

      checked_out:
        Boolean(
          attendance.logout_time,
        ),

      attendance: {
        id: attendance.id,
        date: attendance.date,

        login_time:
          attendance.login_time,

        logout_time:
          attendance.logout_time,

        learning_hours:
          toNumber(
            attendance.learning_hours,
          ),

        status: attendance.status,

        remarks:
          attendance.remarks || null,
      },
    });
  });

/**
 * POST /student/attendance/check-in
 */
export const checkInAttendance =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);
      await ensureInternshipStarted(
      student,
    );

    const { date, time } =
      getIndiaDateParts();

    const existingAttendance =
      await Attendance.findOne({
        where: {
          student_id: student.id,
          date,
        },
      });

    if (
      existingAttendance?.login_time
    ) {
      throw new AppError(
        "You have already checked in today",
        409,
      );
    }

    let attendance;

    if (existingAttendance) {
      await existingAttendance.update({
        login_time: time,
        logout_time: null,
        learning_hours: 0,
        status: "present",
        remarks:
          "Attendance check-in completed",
      });

      attendance =
        existingAttendance;
    } else {
      attendance =
        await Attendance.create({
          student_id: student.id,
          date,
          login_time: time,
          logout_time: null,
          learning_hours: 0,
          status: "present",
          remarks:
            "Attendance check-in completed",
        });
    }

    return ok(
      res,
      {
        id: attendance.id,
        date: attendance.date,

        login_time:
          attendance.login_time,

        logout_time:
          attendance.logout_time,

        learning_hours:
          toNumber(
            attendance.learning_hours,
          ),

        status: attendance.status,

        checked_in: true,
        checked_out: false,
      },
      "Check-in completed successfully",
      201,
    );
  });

/**
 * POST /student/attendance/check-out
 */
export const checkOutAttendance =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

      await ensureInternshipStarted(
      student,
    );

    const { date, time } =
      getIndiaDateParts();

    const attendance =
      await Attendance.findOne({
        where: {
          student_id: student.id,
          date,
        },
      });

    if (
      !attendance ||
      !attendance.login_time
    ) {
      throw new AppError(
        "Please check in before checking out",
        409,
      );
    }

    if (attendance.logout_time) {
      throw new AppError(
        "You have already checked out today",
        409,
      );
    }

    const loginSeconds =
      timeToSeconds(
        attendance.login_time,
      );

    const logoutSeconds =
      timeToSeconds(time);

    if (
      logoutSeconds <= loginSeconds
    ) {
      throw new AppError(
        "Checkout time must be after check-in time",
        409,
      );
    }

    const differenceInSeconds =
      logoutSeconds - loginSeconds;

    const learningHours = Number(
      (
        differenceInSeconds / 3600
      ).toFixed(2),
    );

    

   await attendance.update({
  logout_time: time,
  learning_hours: learningHours,
  status: "present",
  remarks: "Attendance completed",
});

    return ok(
      res,
      {
        id: attendance.id,
        date: attendance.date,

        login_time:
          attendance.login_time,

        logout_time:
          attendance.logout_time,

        learning_hours:
          toNumber(
            attendance.learning_hours,
          ),

        status:
          attendance.status,

        checked_in: true,
        checked_out: true,
      },
      "Check-out completed successfully",
    );
  });
  /**
 * GET /student/logbooks
 */
export const getLogbooks = asyncHandler(
  async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const {
      from_date,
      to_date,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNumber = Math.max(
      Number(page) || 1,
      1,
    );

    const limitNumber = Math.min(
      Math.max(Number(limit) || 20, 1),
      100,
    );

    const where = {
      student_id: student.id,
    };

    if (status) {
      where.status = String(status);
    }

    if (from_date || to_date) {
      where.date = {};

      if (from_date) {
        where.date[Op.gte] =
          from_date;
      }

      if (to_date) {
        where.date[Op.lte] =
          to_date;
      }
    }

    const {
      rows,
      count,
    } = await Logbook.findAndCountAll({
      where,

      order: [
        ["date", "DESC"],
        ["created_at", "DESC"],
      ],

      limit: limitNumber,

      offset:
        (pageNumber - 1) *
        limitNumber,
    });

    const summaryRows =
      await Logbook.findAll({
        where: {
          student_id: student.id,
        },

        attributes: [
          "status",
          "hours_worked",
        ],
      });

    const totalHours =
      summaryRows.reduce(
        (total, row) =>
          total +
          toNumber(row.hours_worked),
        0,
      );

    const summary =
      summaryRows.reduce(
        (result, row) => {
          const rowStatus =
            row.status || "submitted";

          if (
            Object.prototype.hasOwnProperty.call(
              result,
              rowStatus,
            )
          ) {
            result[rowStatus] += 1;
          }

          return result;
        },
        {
          submitted: 0,
          approved: 0,
          rejected: 0,
        },
      );

    return ok(res, {
      logbooks: rows,

      summary: {
        total_entries:
          summaryRows.length,

        total_hours: Number(
          totalHours.toFixed(2),
        ),

        submitted:
          summary.submitted,

        approved:
          summary.approved,

        rejected:
          summary.rejected,
      },

      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total_records: count,

        total_pages: Math.ceil(
          count / limitNumber,
        ),
      },
    });
  },
);
/**
 * GET /student/logbooks/:logbookId
 */
export const getLogbookDetails =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const logbookId = Number(
      req.params.logbookId,
    );

    if (
      !Number.isInteger(logbookId) ||
      logbookId <= 0
    ) {
      throw new AppError(
        "Invalid logbook id",
        422,
      );
    }

    const logbook =
      await Logbook.findOne({
        where: {
          id: logbookId,
          student_id: student.id,
        },
      });

    if (!logbook) {
      throw new AppError(
        "Logbook entry not found",
        404,
      );
    }

    return ok(res, {
      logbook,
    });
  });
  /**
 * PUT /student/logbooks/:logbookId
 */
export const updateLogbook =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const logbookId = Number(
      req.params.logbookId,
    );

    if (
      !Number.isInteger(logbookId) ||
      logbookId <= 0
    ) {
      throw new AppError(
        "Invalid logbook id",
        422,
      );
    }

    const logbook =
      await Logbook.findOne({
        where: {
          id: logbookId,
          student_id: student.id,
        },
      });

    if (!logbook) {
      throw new AppError(
        "Logbook entry not found",
        404,
      );
    }

    if (
      logbook.status === "approved"
    ) {
      throw new AppError(
        "Approved logbook cannot be edited",
        409,
      );
    }

    const {
      date,
      activity,
      skills,
      hours_worked,
    } = req.body;

    const updatePayload = {};

    if (date !== undefined) {
      if (!date) {
        throw new AppError(
          "Logbook date is required",
          422,
        );
      }

      updatePayload.date = date;
    }

    if (activity !== undefined) {
      const normalizedActivity =
        String(activity).trim();

      if (!normalizedActivity) {
        throw new AppError(
          "Activity is required",
          422,
        );
      }

      updatePayload.activity =
        normalizedActivity;
    }

    if (skills !== undefined) {
      updatePayload.skills =
        skills
          ? String(skills).trim()
          : null;
    }

    if (hours_worked !== undefined) {
      const hours = Number(
        hours_worked,
      );

      if (
        !Number.isFinite(hours) ||
        hours <= 0 ||
        hours > 24
      ) {
        throw new AppError(
          "Hours worked must be between 0 and 24",
          422,
        );
      }

      updatePayload.hours_worked =
        hours;
    }

    if (
      Object.keys(updatePayload)
        .length === 0
    ) {
      throw new AppError(
        "No valid fields were provided",
        422,
      );
    }

    updatePayload.status =
      "submitted";

    if (
      Object.prototype.hasOwnProperty.call(
        logbook.dataValues,
        "mentor_feedback",
      )
    ) {
      updatePayload.mentor_feedback =
        null;
    }

    await logbook.update(
      updatePayload,
    );

    return ok(
      res,
      {
        logbook,
      },
      "Logbook updated successfully",
    );
  });

  /**
 * DELETE /student/logbooks/:logbookId
 */
export const deleteLogbook =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const logbookId = Number(
      req.params.logbookId,
    );

    if (
      !Number.isInteger(logbookId) ||
      logbookId <= 0
    ) {
      throw new AppError(
        "Invalid logbook id",
        422,
      );
    }

    const logbook =
      await Logbook.findOne({
        where: {
          id: logbookId,
          student_id: student.id,
        },
      });

    if (!logbook) {
      throw new AppError(
        "Logbook entry not found",
        404,
      );
    }

    if (
      logbook.status === "approved"
    ) {
      throw new AppError(
        "Approved logbook cannot be deleted",
        409,
      );
    }

    await logbook.destroy();

    return ok(
      res,
      {
        id: logbookId,
      },
      "Logbook deleted successfully",
    );
  });
  /**
 * GET /student/projects
 */
export const getProjects = asyncHandler(
  async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const projects =
      await LiveProject.findAll({
        where: {
          student_id: student.id,
        },

        order: [
          ["created_at", "DESC"],
        ],
      });

    const summary = projects.reduce(
      (result, project) => {
        result.total += 1;

        const status =
          project.status ||
          "submitted";

        if (
          Object.prototype.hasOwnProperty.call(
            result,
            status,
          )
        ) {
          result[status] += 1;
        }

        return result;
      },
      {
        total: 0,
        submitted: 0,
        approved: 0,
        rejected: 0,
      },
    );

    return ok(res, {
      projects,
      summary,
    });
  },
);
/**
 * GET /student/projects/:projectId
 */
export const getProjectDetails =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const projectId = Number(
      req.params.projectId,
    );

    if (
      !Number.isInteger(projectId) ||
      projectId <= 0
    ) {
      throw new AppError(
        "Invalid project id",
        422,
      );
    }

    const project =
      await LiveProject.findOne({
        where: {
          id: projectId,
          student_id: student.id,
        },
      });

    if (!project) {
      throw new AppError(
        "Project not found",
        404,
      );
    }

    return ok(res, {
      project,

      can_resubmit:
        project.status !==
        "approved",
    });
  });
  /**
 * GET /student/reports
 */
export const getReports = asyncHandler(
  async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const reports =
      await InternshipReport.findAll({
        where: {
          student_id: student.id,
        },

        order: [
          ["created_at", "DESC"],
        ],
      });

    const summary = reports.reduce(
      (result, report) => {
        result.total += 1;

        const status =
          report.status ||
          "submitted";

        if (
          Object.prototype.hasOwnProperty.call(
            result,
            status,
          )
        ) {
          result[status] += 1;
        }

        return result;
      },
      {
        total: 0,
        submitted: 0,
        approved: 0,
        rejected: 0,
      },
    );

    return ok(res, {
      reports,
      summary,
    });
  },
);
/**
 * GET /student/reports/:reportId
 */
export const getReportDetails =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const reportId = Number(
      req.params.reportId,
    );

    if (
      !Number.isInteger(reportId) ||
      reportId <= 0
    ) {
      throw new AppError(
        "Invalid report id",
        422,
      );
    }

    const report =
      await InternshipReport.findOne({
        where: {
          id: reportId,
          student_id: student.id,
        },
      });

    if (!report) {
      throw new AppError(
        "Internship report not found",
        404,
      );
    }

    return ok(res, {
      report,

      can_resubmit:
        report.status !==
        "approved",
    });
  });
  /**
 * GET /student/payments
 */
export const getPayments = asyncHandler(
  async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const payments =
      await Payment.findAll({
        where: {
          student_id: student.id,
        },

        order: [
          ["created_at", "DESC"],
        ],
      });

    const successfulPayments =
      payments.filter(
        (payment) =>
          payment.status ===
          "success",
      );

    const totalPaid =
      successfulPayments.reduce(
        (total, payment) =>
          total +
          toNumber(payment.amount),
        0,
      );

   return ok(res, {
  payments:
    payments.map(
      (payment) => ({
        id: payment.id,

        amount:
          toNumber(
            payment.amount,
          ),

        currency:
          payment.currency ||
          "INR",

        transaction_id:
          payment.transaction_id,

        cashfree_order_id:
          payment.cashfree_order_id,

        cf_payment_id:
          payment.cf_payment_id,

        gateway:
          payment.gateway,

        status:
          payment.status,

        paid_at:
          payment.paid_at,

        created_at:
          payment.created_at,

        receipt_number:
          payment.receipt_number ||
          null,

        receipt_generated_at:
          payment.receipt_generated_at ||
          null,

        receipt_available:
          Boolean(
            payment.receipt_path,
          ),

        receipt_download_url:
          payment.receipt_path
            ? `/student/payments/${payment.id}/receipt`
            : null,
      }),
    ),

  summary: {
    total_transactions:
      payments.length,

    successful_transactions:
      successfulPayments.length,

    total_paid:
      Number(
        totalPaid.toFixed(2),
      ),

    payment_status:
      student.payment_status,
  },
});
  },
);
/**
 * GET /student/payments/:paymentId
 */
export const getPaymentDetails =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const paymentId = Number(
      req.params.paymentId,
    );

    if (
      !Number.isInteger(paymentId) ||
      paymentId <= 0
    ) {
      throw new AppError(
        "Invalid payment id",
        422,
      );
    }

    const payment =
      await Payment.findOne({
        where: {
          id: paymentId,
          student_id: student.id,
        },
      });

    if (!payment) {
      throw new AppError(
        "Payment not found",
        404,
      );
    }

    return ok(res, {
      payment,
    });
  });
  /**
 * GET /student/certificate
 */
export const getCertificate =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const certificate =
      await Certificate.findOne({
        where: {
          student_id: student.id,
        },

        order: [
          ["created_at", "DESC"],
        ],
      });

    if (!certificate) {
      return ok(res, {
        available: false,

        message:
          "Certificate has not been issued yet",
      });
    }

    return ok(res, {
      available: true,

      certificate: {
        id: certificate.id,

        certificate_number:
          certificate.certificate_number,

        certificate_url:
          certificate.certificate_url ||
          null,

        qr_code_url:
          certificate.qr_code_url ||
          null,

        issued_date:
          certificate.issued_date,

        created_at:
          certificate.created_at,
      },
      download_url:
  certificate.certificate_url
    ? `/student/documents/certificate/download`
    : null,
    });
  });
  /**
 * GET /student/analytics
 */
export const getAnalytics =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const chapterIds =
      await getStudentChapterIds(
        student.domain_id,
      );

    const validChapterIds =
      chapterIds.length > 0
        ? chapterIds
        : [0];

    const [
      chapterCompletions,
      attendanceRecords,
      logbookEntries,
      assignments,
      submissions,
    ] = await Promise.all([
      ChapterCompletion.findAll({
        where: {
          student_id: student.id,

          chapter_id: {
            [Op.in]: validChapterIds,
          },

          status: "completed",
        },

        attributes: [
          "chapter_id",
          "completed_at",
          "created_at",
        ],

        order: [
          ["completed_at", "ASC"],
        ],
      }),

      Attendance.findAll({
        where: {
          student_id: student.id,
        },

        attributes: [
          "date",
          "status",
          "learning_hours",
        ],

        order: [["date", "ASC"]],
      }),

      Logbook.findAll({
        where: {
          student_id: student.id,
        },

        attributes: [
          "date",
          "hours_worked",
          "status",
        ],

        order: [["date", "ASC"]],
      }),

      Assignment.findAll({
        where: {
          chapter_id: {
            [Op.in]: validChapterIds,
          },
        },

        attributes: ["id"],
      }),

      Submission.findAll({
        where: {
          student_id: student.id,
        },

        attributes: [
          "assignment_id",
          "status",
          "marks",
          "created_at",
        ],
      }),
    ]);

    const monthlyMap = new Map();

    const getMonthKey = (value) => {
      const date = new Date(value);

      if (
        Number.isNaN(date.getTime())
      ) {
        return null;
      }

      return `${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, "0")}`;
    };

    const ensureMonth = (key) => {
      if (!key) {
        return null;
      }

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, {
          month: key,
          chapters_completed: 0,
          attendance_days: 0,
          present_days: 0,
          learning_hours: 0,
          logbook_hours: 0,
          assignments_submitted: 0,
        });
      }

      return monthlyMap.get(key);
    };

    for (
      const completion of
      chapterCompletions
    ) {
      const key = getMonthKey(
        completion.completed_at ||
          completion.created_at,
      );

      const row = ensureMonth(key);

      if (row) {
        row.chapters_completed += 1;
      }
    }

    for (
      const attendance of
      attendanceRecords
    ) {
      const key = getMonthKey(
        attendance.date,
      );

      const row = ensureMonth(key);

      if (row) {
        row.attendance_days += 1;

        if (
          attendance.status ===
          "present"
        ) {
          row.present_days += 1;
        }

        row.learning_hours +=
          toNumber(
            attendance.learning_hours,
          );
      }
    }

    for (
      const logbook of
      logbookEntries
    ) {
      const key = getMonthKey(
        logbook.date,
      );

      const row = ensureMonth(key);

      if (row) {
        row.logbook_hours +=
          toNumber(
            logbook.hours_worked,
          );
      }
    }

    for (
      const submission of
      submissions
    ) {
      const key = getMonthKey(
        submission.created_at,
      );

      const row = ensureMonth(key);

      if (row) {
        row.assignments_submitted +=
          1;
      }
    }

    const monthlyProgress = Array.from(
      monthlyMap.values(),
    )
      .sort((first, second) =>
        first.month.localeCompare(
          second.month,
        ),
      )
      .map((row) => ({
        ...row,

        learning_hours: Number(
          row.learning_hours.toFixed(2),
        ),

        logbook_hours: Number(
          row.logbook_hours.toFixed(2),
        ),

        attendance_percentage:
          calculatePercentage(
            row.present_days,
            row.attendance_days,
          ),
      }));

    const totalAssignments =
      assignments.length;

    const submittedAssignmentIds =
      new Set(
        submissions.map((submission) =>
          Number(
            submission.assignment_id,
          ),
        ),
      );

    const approvedAssignmentIds =
      new Set(
        submissions
          .filter(
            (submission) =>
              submission.status ===
              "approved",
          )
          .map((submission) =>
            Number(
              submission.assignment_id,
            ),
          ),
      );

    const totalAttendanceDays =
      attendanceRecords.length;

    const presentDays =
      attendanceRecords.filter(
        (record) =>
          record.status === "present",
      ).length;

    const totalLearningHours =
      attendanceRecords.reduce(
        (total, record) =>
          total +
          toNumber(
            record.learning_hours,
          ),
        0,
      );

    const totalLogbookHours =
      logbookEntries.reduce(
        (total, record) =>
          total +
          toNumber(
            record.hours_worked,
          ),
        0,
      );

    return ok(res, {
      overview: {
        chapters: {
          completed:
            chapterCompletions.length,

          total:
            chapterIds.length,

          percentage:
            calculatePercentage(
              chapterCompletions.length,
              chapterIds.length,
            ),
        },

        assignments: {
          total: totalAssignments,

          submitted:
            submittedAssignmentIds.size,

          approved:
            approvedAssignmentIds.size,

          percentage:
            calculatePercentage(
              approvedAssignmentIds.size,
              totalAssignments,
            ),
        },

        attendance: {
          total_days:
            totalAttendanceDays,

          present_days:
            presentDays,

          percentage:
            calculatePercentage(
              presentDays,
              totalAttendanceDays,
            ),

          learning_hours: Number(
            totalLearningHours.toFixed(
              2,
            ),
          ),
        },

        logbook: {
          total_entries:
            logbookEntries.length,

          total_hours: Number(
            totalLogbookHours.toFixed(
              2,
            ),
          ),
        },
      },

      monthly_progress:
        monthlyProgress,
    });
  });

  export const downloadPaymentReceipt =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

    const paymentId =
      Number(
        req.params.paymentId,
      );

    if (
      !Number.isInteger(paymentId) ||
      paymentId <= 0
    ) {
      throw new AppError(
        "Invalid payment id",
        422,
      );
    }

    const payment =
      await Payment.findOne({
        where: {
          id: paymentId,
          student_id: student.id,
        },
      });

    if (!payment) {
      throw new AppError(
        "Payment not found",
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

    if (!payment.receipt_path) {
      throw new AppError(
        "Payment receipt has not been generated yet",
        404,
      );
    }

    const absolutePath =
      path.resolve(
        process.cwd(),
        String(
          payment.receipt_path,
        ),
      );

    const receiptRoot =
      path.resolve(
        process.cwd(),
        "storage",
        "payment-receipts",
      );

    const validPath =
      absolutePath ===
        receiptRoot ||
      absolutePath.startsWith(
        `${receiptRoot}${path.sep}`,
      );

    if (!validPath) {
      throw new AppError(
        "Invalid receipt file path",
        400,
      );
    }

    if (
      !fs.existsSync(
        absolutePath,
      )
    ) {
      throw new AppError(
        "Payment receipt file does not exist",
        404,
      );
    }

    const fileName =
      `payment-receipt-${student.registration_number}.pdf`;

    res.setHeader(
      "Cache-Control",
      "private, no-store",
    );

    return res.download(
      absolutePath,
      fileName,
    );
  });