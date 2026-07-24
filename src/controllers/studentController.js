import { Op } from "sequelize";

import {
  Student,
  College,
  Domain,
  Module,
  Chapter,
  ChapterCompletion,
  Assignment,
  Submission,
  Attendance,
  Logbook,
  LiveProject,
  InternshipReport,
  Certificate,
  Payment,
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

    const chapterIds =
      await getStudentChapterIds(
        student.domain_id,
      );

    const validChapterIds =
      chapterIds.length > 0
        ? chapterIds
        : [0];

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
    ] = await Promise.all([
      ChapterCompletion.count({
        where: {
          student_id: student.id,
          chapter_id: {
            [Op.in]: validChapterIds,
          },
          status: "completed",
        },

        distinct: true,
        col: "chapter_id",
      }),

      Assignment.count({
        where: {
          chapter_id: {
            [Op.in]: validChapterIds,
          },
        },
      }),

      Submission.count({
        where: {
          student_id: student.id,
          status: "approved",
        },

        distinct: true,
        col: "assignment_id",
      }),

      Submission.count({
        where: {
          student_id: student.id,
        },

        distinct: true,
        col: "assignment_id",
      }),

      Attendance.findAll({
        where: {
          student_id: student.id,
        },

        attributes: [
          "id",
          "date",
          "status",
          "learning_hours",
        ],

        order: [["date", "DESC"]],
      }),

      Logbook.findAll({
        where: {
          student_id: student.id,
        },

        attributes: [
          "id",
          "date",
          "hours_worked",
        ],

        order: [["date", "DESC"]],
      }),

      LiveProject.findOne({
        where: {
          student_id: student.id,
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

        order: [["created_at", "DESC"]],
      }),

      InternshipReport.findOne({
        where: {
          student_id: student.id,
        },

        attributes: [
          "id",
          "report_url",
          "status",
          "mentor_remarks",
          "created_at",
          "updated_at",
        ],

        order: [["created_at", "DESC"]],
      }),

      Certificate.findOne({
        where: {
          student_id: student.id,
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
          student_id: student.id,
        },

        attributes: [
          "id",
          "amount",
          "transaction_id",
          "status",
          "created_at",
        ],

        order: [["created_at", "DESC"]],
      }),

      buildRecentActivities(
        student.id,
        chapterIds,
      ),
    ]);

    const totalChapters =
      chapterIds.length;

    const courseProgress =
      calculatePercentage(
        completedChapterCount,
        totalChapters,
      );

    const totalAttendanceDays =
      attendanceRecords.length;

    const presentDays =
      attendanceRecords.filter(
        (record) =>
          record.status === "present",
      ).length;

    const absentDays =
      attendanceRecords.filter(
        (record) =>
          record.status === "absent",
      ).length;

    const leaveDays =
      attendanceRecords.filter(
        (record) =>
          record.status === "leave",
      ).length;

    const attendancePercentage =
      calculatePercentage(
        presentDays,
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

    const logbookHours =
      logbookEntries.reduce(
        (total, logbook) =>
          total +
          toNumber(
            logbook.hours_worked,
          ),
        0,
      );

    const requiredHours = toNumber(
      student.domain?.duration_hours,
    );

    const hoursRemaining = Math.max(
      requiredHours - learningHours,
      0,
    );

    const assignmentProgress =
      calculatePercentage(
        approvedSubmissionCount,
        totalAssignmentCount,
      );

    const projectProgress =
      liveProject?.status === "approved"
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
     * Overall progress calculation:
     * Learning: 50%
     * Attendance: 20%
     * Assignments: 20%
     * Live project: 5%
     * Internship report: 5%
     */
    const overallProgress =
      limitPercentage(
        Number(
          (
            courseProgress * 0.5 +
            attendancePercentage *
              0.2 +
            assignmentProgress *
              0.2 +
            projectProgress * 0.05 +
            reportProgress * 0.05
          ).toFixed(2),
        ),
      );

    return ok(res, {
      student: {
        id: student.id,
        registration_number:
          student.registration_number,
        student_id:
          student.student_id,
        name: student.name,
        father_name:
          student.father_name,
        email: student.email,
        mobile: student.mobile,
        photo: student.photo,
        programme:
          student.programme,
        major_subject:
          student.major_subject,
        session: student.session,
        semester: student.semester,
        internship_status:
          student.internship_status,
        payment_status:
          student.payment_status,

        college: student.College
        
          ? {
              id: student.College.id,
              name: student.College.name,
              code: student.College.code,
              university:
                student.College
                  .university,
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
      },

      stats: {
        course_progress:
          courseProgress,

        attendance:
          attendancePercentage,

        overall_progress:
          overallProgress,

        learning_hours: Number(
          learningHours.toFixed(2),
        ),

        required_hours:
          requiredHours,

        hours_remaining: Number(
          hoursRemaining.toFixed(2),
        ),

        logbook_hours: Number(
          logbookHours.toFixed(2),
        ),

        logbook_entries:
          logbookEntries.length,

        assignments_completed:
          approvedSubmissionCount,

        assignments_submitted:
          submittedAssignmentCount,

        assignments_total:
          totalAssignmentCount,

        assignment_progress:
          assignmentProgress,

        completed_chapters:
          completedChapterCount,

        total_chapters:
          totalChapters,
      },

      attendance_summary: {
        total_days:
          totalAttendanceDays,
        present_days: presentDays,
        absent_days: absentDays,
        leave_days: leaveDays,
        percentage:
          attendancePercentage,
      },

      status: {
        project: liveProject
          ? {
              id: liveProject.id,
              title:
                liveProject.title,
              status:
                liveProject.status,
              report_url:
                liveProject.report_url,
              mentor_feedback:
                liveProject
                  .mentor_feedback,
              submitted_at:
                liveProject.created_at,
            }
          : null,

        report: internshipReport
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

        certificate: certificate
          ? {
              available: true,
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
              available: false,
              certificate_number:
                null,
              qr_code_url: null,
              issued_date: null,
            },

        payment: latestPayment
          ? {
              amount: toNumber(
                latestPayment.amount,
              ),
              transaction_id:
                latestPayment
                  .transaction_id,
              status:
                latestPayment.status,
              date:
                latestPayment
                  .created_at,
            }
          : null,
      },

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
export const learning = asyncHandler(
  async (req, res) => {
    const student = await Student.findByPk(
      req.user.id,
    );

    if (!student) {
      throw new AppError(
        "Student not found",
        404,
      );
    }

    if (!student.domain_id) {
      return ok(res, {
        modules: [],
        summary: {
          total_chapters: 0,
          completed_chapters: 0,
          progress_percentage: 0,
        },
      });
    }

    const modules = await Module.findAll({
      where: {
        domain_id: student.domain_id,
      },

      include: [
        {
          model: Chapter,
          required: false,
        },
      ],

      order: [
        ["module_number", "ASC"],
        [Chapter, "chapter_number", "ASC"],
      ],
    });

    const completions =
      await ChapterCompletion.findAll({
        where: {
          student_id: student.id,
        },
      });

    const completedChapterIds = new Set(
      completions
        .filter(
          (completion) =>
            completion.status === "completed",
        )
        .map((completion) =>
          Number(completion.chapter_id),
        ),
    );

    let previousChapterCompleted = true;
    let totalChapters = 0;
    let completedChapters = 0;

    const formattedModules = modules.map(
      (module) => {
        const chapters = (
          module.Chapters || []
        ).map((chapter) => {
          totalChapters += 1;

          const completed =
            completedChapterIds.has(
              Number(chapter.id),
            );

          if (completed) {
            completedChapters += 1;
          }

          const unlocked =
            previousChapterCompleted ||
            completed;

          previousChapterCompleted =
            completed;

          return {
            ...chapter.toJSON(),
            unlocked,
            completed,
          };
        });

        return {
          ...module.toJSON(),
          Chapters: chapters,
        };
      },
    );

    const progressPercentage =
      calculatePercentage(
        completedChapters,
        totalChapters,
      );

    return ok(res, {
      modules: formattedModules,

      summary: {
        total_chapters: totalChapters,
        completed_chapters:
          completedChapters,
        progress_percentage:
          progressPercentage,
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

  const FULL_DAY_HOURS = 8;
const HALF_DAY_HOURS = 4;

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

const calculateAttendanceStatus = (
  learningHours,
) => {
  if (
    learningHours >= FULL_DAY_HOURS
  ) {
    return "present";
  }

  if (
    learningHours >= HALF_DAY_HOURS
  ) {
    return "half_day";
  }

  return "absent";
};

/**
 * GET /student/attendance/today
 */
export const getTodayAttendance =
  asyncHandler(async (req, res) => {
    const student =
      await getCurrentStudent(req);

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

    const status =
      calculateAttendanceStatus(
        learningHours,
      );

    await attendance.update({
      logout_time: time,
      learning_hours: learningHours,
      status,

      remarks:
        status === "present"
          ? "Full-day attendance completed"
          : status === "half_day"
            ? "Half-day attendance completed"
            : "Minimum attendance hours not completed",
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
      payments,

      summary: {
        total_transactions:
          payments.length,

        successful_transactions:
          successfulPayments.length,

        total_paid: Number(
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