import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { Op } from "sequelize";
import { v4 as uuid } from "uuid";
import {
  College,
  Mentor,
} from "../models/index.js";

import {
  bulkPdfDocumentService,
} from "../services/bulkPdfDocumentService.js";

import {
  BulkJob,
  Student,
  Attendance,
  Module,
  Chapter,
  ChapterCompletion,
  Assessment,
  Result,
  Certificate,
  GeneratedDocument,
  Logbook,
  Submission,
  LiveProject,
  InternshipReport,
  Domain,
} from "../models/index.js";

import { ensureDir } from "../utils/files.js";

export const BULK_JOB_TYPES = Object.freeze([
  "attendance",
  "complete_learning",
  "complete_internship",
  "assessment",
  "publish_results",
  "acceptance_letters",
  "internship_reports",
  "attendance_sheets",
  "log_books",
  "certificates",
  "zip_documents",
  "full_internship_process",
]);

// const GENERATED_ROOT = path.resolve(
//   "uploads",
//   "generated",
// );

// const CERTIFICATE_QR_ROOT = path.resolve(
//   "uploads",
//   "certificates",
// );

const ZIP_ROOT = path.resolve(
  "uploads",
  "zips",
);

const normalizeIds = (values) => {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .map(Number)
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value > 0,
        ),
    ),
  ];
};

const sanitizeName = (value) =>
  String(value || "student")
    .trim()
    .replace(
      /[^a-zA-Z0-9-_]+/g,
      "-",
    )
    .replace(/-+/g, "-");

const toPublicUrl = (absolutePath) => {
  const relative = path
    .relative(
      path.resolve("."),
      absolutePath,
    )
    .replaceAll("\\", "/");

  return `/${relative}`;
};

const calculateHours = (
  loginTime,
  logoutTime,
) => {
  if (!loginTime || !logoutTime) {
    return 0;
  }

  const [loginHour, loginMinute] =
    String(loginTime)
      .split(":")
      .map(Number);

  const [logoutHour, logoutMinute] =
    String(logoutTime)
      .split(":")
      .map(Number);

  if (
    [
      loginHour,
      loginMinute,
      logoutHour,
      logoutMinute,
    ].some(Number.isNaN)
  ) {
    return 0;
  }

  const login =
    loginHour * 60 +
    loginMinute;

  const logout =
    logoutHour * 60 +
    logoutMinute;

  return Number(
    (
      Math.max(
        0,
        logout - login,
      ) / 60
    ).toFixed(2),
  );
};

class BulkJobRunner extends EventEmitter {
  constructor() {
    super();

    this.running = false;
    this.queue = [];

    this.on(
      "enqueue",
      () => {
        this.drain().catch(
          (error) => {
            console.error(
              "Bulk queue error:",
              error,
            );
          },
        );
      },
    );
  }

  async create(
    type,
    payload,
    createdBy,
  ) {
    if (
      !BULK_JOB_TYPES.includes(type)
    ) {
      throw new Error(
        `Invalid bulk job type: ${type}`,
      );
    }

    const job =
      await BulkJob.create({
        job_uuid: uuid(),
        type,
        payload:
          payload || {},
        created_by:
          createdBy || null,
        status: "queued",
        progress: 0,
        processed: 0,
        total: 0,
      });

    this.queue.push(job.id);
    this.emit("enqueue");

    return job;
  }

  async resumePendingJobs() {
    const jobs =
      await BulkJob.findAll({
        where: {
          status: {
            [Op.in]: [
              "queued",
              "running",
            ],
          },
        },
        order: [
          ["id", "ASC"],
        ],
      });

    for (const job of jobs) {
      await job.update({
        status: "queued",
        error_message: null,
      });

      this.queue.push(job.id);
    }

    if (jobs.length > 0) {
      this.emit("enqueue");
    }

    return jobs.length;
  }

  async drain() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      while (
        this.queue.length > 0
      ) {
        const jobId =
          this.queue.shift();

        await this.execute(
          jobId,
        );
      }
    } finally {
      this.running = false;
    }
  }

  async updateProgress(
    job,
    processed,
    total,
    result,
  ) {
    const progress =
      total > 0
        ? Math.min(
            100,
            Number(
              (
                (
                  processed /
                  total
                ) *
                100
              ).toFixed(2),
            ),
          )
        : 100;

    const updateData = {
      processed,
      total,
      progress,
    };

    if (
      result !== undefined
    ) {
      updateData.result =
        result;
    }

    await job.update(
      updateData,
    );
  }

  async execute(jobId) {
    const job =
      await BulkJob.findByPk(
        jobId,
      );

    if (!job) {
      return;
    }

    try {
      await job.update({
        status: "running",
        progress: 0,
        processed: 0,
        total: 0,
        error_message: null,
      });

      const handlers = {
        attendance: () =>
          this.generateAttendance(
            job,
          ),

        complete_learning: () =>
          this.completeLearning(
            job,
          ),

        complete_internship: () =>
          this.completeInternship(
            job,
          ),

        assessment: () =>
          this.generateAssessment(
            job,
          ),

        publish_results: () =>
          this.publishResults(
            job,
          ),

        acceptance_letters: () =>
          this.generateAcceptanceLetters(
            job,
          ),

        internship_reports: () =>
          this.generateInternshipReports(
            job,
          ),

        attendance_sheets: () =>
          this.generateAttendanceSheets(
            job,
          ),

        log_books: () =>
          this.generateLogBooks(
            job,
          ),

        certificates: () =>
          this.generateCertificates(
            job,
          ),

        zip_documents: () =>
          this.generateZip(
            job,
          ),

        full_internship_process:
          () =>
            this.runFullProcess(
              job,
            ),
      };

      const handler =
        handlers[job.type];

      if (!handler) {
        throw new Error(
          `Handler not found for ${job.type}`,
        );
      }

      const result =
        await handler();

      await job.update({
        status: "completed",
        progress: 100,
        result:
          result ||
          job.result,
      });
    } catch (error) {
      console.error(
        `Bulk job ${job.job_uuid} failed:`,
        error,
      );

      await job.update({
        status: "failed",
        error_message:
          error.message,
      });
    }
  }

  parseDate(
    value,
    fieldName,
  ) {
    if (!value) {
      throw new Error(
        `${fieldName} is required`,
      );
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      throw new Error(
        `${fieldName} is invalid`,
      );
    }

    return date;
  }

  resolveDateTime(
    value,
  ) {
    const date = value
      ? new Date(value)
      : new Date();

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      throw new Error(
        "Invalid date and time",
      );
    }

    return date;
  }

  dateRange(
    startDate,
    endDate,
    payload = {},
  ) {
    const start =
      this.parseDate(
        `${startDate}T00:00:00`,
        "start_date",
      );

    const end =
      this.parseDate(
        `${endDate}T00:00:00`,
        "end_date",
      );

    if (start > end) {
      throw new Error(
        "start_date cannot be after end_date",
      );
    }

    const excludedDays =
      Array.isArray(
        payload.excluded_days,
      )
        ? payload.excluded_days.map(
            Number,
          )
        : [0];

    const holidays =
      new Set(
        Array.isArray(
          payload.holidays,
        )
          ? payload.holidays
          : [],
      );

    const dates = [];

    for (
      let current =
        new Date(start);
      current <= end;
      current.setDate(
        current.getDate() +
          1,
      )
    ) {
      const date =
        current
          .toISOString()
          .slice(0, 10);

      if (
        !excludedDays.includes(
          current.getDay(),
        ) &&
        !holidays.has(date)
      ) {
        dates.push(date);
      }
    }

    return dates;
  }

buildStudentQuery(payload = {}) {
  const where = {};

  const studentIds =
    normalizeIds(
      payload.student_ids,
    );

  if (studentIds.length > 0) {
    where.id = {
      [Op.in]: studentIds,
    };
  }

  const directFilters = [
    "college_id",
    "domain_id",
    "session",
    "semester",
    "batch_id",
    "mentor_id",
  ];

  for (const field of directFilters) {
    if (
      payload[field] !== undefined &&
      payload[field] !== null &&
      payload[field] !== ""
    ) {
      where[field] =
        payload[field];
    }
  }

  if (payload.internship_status) {
    where.internship_status =
      payload.internship_status;
  }

  const include = [
    {
      model: College,
      as: "college",
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
      required: false,
    },

    {
      model: Domain,
      as: "domain",
      attributes: [
        "id",
        "sector_id",
        "domain_name",
        "duration_hours",
      ],
      where: payload.sector_id
        ? {
            sector_id:
              payload.sector_id,
          }
        : undefined,
      required:
        Boolean(
          payload.sector_id,
        ),
    },

    {
      model: Mentor,
      as: "mentor",
      attributes: [
        "id",
        "name",
        "employee_id",
        "designation",
        "department",
        "mobile",
        "email",
      ],
      required: false,
    },
  ];

  return {
    where,
    include,
    distinct: true,
    order: [
      ["id", "ASC"],
    ],
  };
}

  async getStudents(
    payload = {},
  ) {
    const students =
      await Student.findAll(
        this.buildStudentQuery(
          payload,
        ),
      );

    if (
      students.length === 0
    ) {
      throw new Error(
        "No students matched the selected filters",
      );
    }

    return students;
  }

  async generateAttendance(
    job,
    options = {},
  ) {
    const payload = {
      ...(job.payload || {}),
      ...(options.payload ||
        {}),
    };

    if (
      !payload.start_date ||
      !payload.end_date
    ) {
      throw new Error(
        "start_date and end_date are required",
      );
    }

    const students =
      await this.getStudents(
        payload,
      );

    const dates =
      this.dateRange(
        payload.start_date,
        payload.end_date,
        payload,
      );

    const loginTime =
      payload.login_time ||
      "09:00:00";

    const logoutTime =
      payload.logout_time ||
      "17:00:00";

    const learningHours =
      payload.learning_hours !==
      undefined
        ? Number(
            payload.learning_hours,
          )
        : calculateHours(
            loginTime,
            logoutTime,
          );

    const rows = [];

    for (
      const student of students
    ) {
      for (const date of dates) {
        rows.push({
          student_id:
            student.id,
          date,
          login_time:
            loginTime,
          logout_time:
            logoutTime,
          learning_hours:
            learningHours,
          status:
            payload.status ||
            "present",
          remarks:
            payload.remarks ||
            null,
        });
      }
    }

    const batchSize = 1000;
    let processed = 0;

    for (
      let index = 0;
      index < rows.length;
      index += batchSize
    ) {
      const batch =
        rows.slice(
          index,
          index +
            batchSize,
        );

      await Attendance.bulkCreate(
        batch,
        {
          updateOnDuplicate: [
            "login_time",
            "logout_time",
            "learning_hours",
            "status",
            "remarks",
            "updated_at",
          ],
        },
      );

      processed +=
        batch.length;

      if (
        !options.silent
      ) {
        await this.updateProgress(
          job,
          processed,
          rows.length,
        );
      }
    }

    const result = {
      students:
        students.length,
      working_days:
        dates.length,
      attendance_records:
        rows.length,
      start_date:
        payload.start_date,
      end_date:
        payload.end_date,
    };

    if (!options.silent) {
      await this.updateProgress(
        job,
        rows.length,
        rows.length,
        result,
      );
    }

    return result;
  }

  async getStudentChapters(
    student,
    payload,
  ) {
    const moduleWhere = {
      domain_id:
        student.domain_id,
    };

    const moduleIds =
      normalizeIds(
        payload.module_ids,
      );

    if (
      moduleIds.length > 0
    ) {
      moduleWhere.id = {
        [Op.in]:
          moduleIds,
      };
    }

    const chapterWhere = {};

    const chapterIds =
      normalizeIds(
        payload.chapter_ids,
      );

    if (
      chapterIds.length > 0
    ) {
      chapterWhere.id = {
        [Op.in]:
          chapterIds,
      };
    }

    return Chapter.findAll({
      where:
        chapterWhere,
      attributes: ["id"],
      include: [
        {
          model: Module,
          attributes: [],
          required: true,
          where:
            moduleWhere,
        },
      ],
      order: [
        ["module_id", "ASC"],
        [
          "chapter_number",
          "ASC",
        ],
      ],
    });
  }

  async completeLearning(
    job,
    options = {},
  ) {
    const payload = {
      ...(job.payload || {}),
      ...(options.payload ||
        {}),
    };

    const students =
      await this.getStudents(
        payload,
      );

    const completedAt =
      this.resolveDateTime(
        payload.completed_at ||
          payload.learning_completed_at ||
          payload.end_date,
      );

    let total = 0;
    const chapterMap =
      new Map();

    for (
      const student of students
    ) {
      if (
        !student.domain_id
      ) {
        chapterMap.set(
          student.id,
          [],
        );

        continue;
      }

      const chapters =
        await this.getStudentChapters(
          student,
          payload,
        );

      chapterMap.set(
        student.id,
        chapters,
      );

      total +=
        chapters.length;
    }

    let processed = 0;

    for (
      const student of students
    ) {
      const chapters =
        chapterMap.get(
          student.id,
        ) || [];

      for (
        const chapter of chapters
      ) {
        const [
          completion,
          created,
        ] =
          await ChapterCompletion.findOrCreate(
            {
              where: {
                student_id:
                  student.id,
                chapter_id:
                  chapter.id,
              },

              defaults: {
                status:
                  "completed",
                completed_at:
                  completedAt,
              },
            },
          );

        if (!created) {
          await completion.update(
            {
              status:
                "completed",
              completed_at:
                completedAt,
            },
          );
        }

        processed += 1;

        if (
          !options.silent &&
          processed % 100 ===
            0
        ) {
          await this.updateProgress(
            job,
            processed,
            total,
          );
        }
      }

      const academics = {
        ...(
          student.academics_json ||
          {}
        ),

        learning_completion: {
          status:
            "completed",
          completed_at:
            completedAt.toISOString(),
          chapter_count:
            chapters.length,
        },
      };

      await student.update({
        total_progress: 100,
        academics_json:
          academics,
      });
    }

    const result = {
      students:
        students.length,
      chapter_completions:
        total,
      completed_at:
        completedAt.toISOString(),
    };

    if (!options.silent) {
      await this.updateProgress(
        job,
        total,
        total,
        result,
      );
    }

    return result;
  }

  async completeInternship(
    job,
    options = {},
  ) {
    const payload = {
      ...(job.payload || {}),
      ...(options.payload ||
        {}),
    };

    const students =
      await this.getStudents(
        payload,
      );

    const completedAt =
      this.resolveDateTime(
        payload.completed_at ||
          payload.end_date,
      );

    let processed = 0;

    for (
      const student of students
    ) {
      const academics = {
        ...(
          student.academics_json ||
          {}
        ),

        internship_completion:
          {
            completed_at:
              completedAt.toISOString(),

            completed_by:
              job.created_by ||
              null,
          },
      };

      await student.update({
        internship_status:
          "completed",

        internship_end_date:
          payload.end_date ||
          completedAt
            .toISOString()
            .slice(0, 10),

        total_progress: 100,

        academics_json:
          academics,
      });

      processed += 1;

      if (
        !options.silent
      ) {
        await this.updateProgress(
          job,
          processed,
          students.length,
        );
      }
    }

    const result = {
      students:
        students.length,
      internship_status:
        "completed",
      completed_at:
        completedAt.toISOString(),
    };

    if (!options.silent) {
      await this.updateProgress(
        job,
        students.length,
        students.length,
        result,
      );
    }

    return result;
  }

  assessmentDetails(
    payload,
  ) {
    const ratings = {
      technical_knowledge:
        Number(
          payload
            .technical_knowledge ??
            payload
              .criteria_ratings_json
              ?.technical_knowledge ??
            5,
        ),

      quality_of_work:
        Number(
          payload
            .quality_of_work ??
            payload
              .criteria_ratings_json
              ?.quality_of_work ??
            5,
        ),

      initiative:
        Number(
          payload.initiative ??
            payload
              .criteria_ratings_json
              ?.initiative ??
            5,
        ),

      communication:
        Number(
          payload.communication ??
            payload
              .criteria_ratings_json
              ?.communication ??
            5,
        ),

      professional_conduct:
        Number(
          payload
            .professional_conduct ??
            payload
              .criteria_ratings_json
              ?.professional_conduct ??
            5,
        ),
    };

    const values =
      Object.values(
        ratings,
      );

    const maximumRating =
      Number(
        payload.max_rating ||
          5,
      );

    const percentage =
      values.length > 0
        ? Number(
            (
              (
                values.reduce(
                  (
                    sum,
                    value,
                  ) =>
                    sum +
                    value,
                  0,
                ) /
                (
                  values.length *
                  maximumRating
                )
              ) *
              100
            ).toFixed(2),
          )
        : 0;

    let performance =
      "Needs Improvement";

    if (
      percentage >= 90
    ) {
      performance =
        "Outstanding";
    } else if (
      percentage >= 80
    ) {
      performance =
        "Excellent";
    } else if (
      percentage >= 70
    ) {
      performance =
        "Very Good";
    } else if (
      percentage >= 60
    ) {
      performance = "Good";
    } else if (
      percentage >= 50
    ) {
      performance =
        "Satisfactory";
    }

    return {
      ratings,
      percentage,
      performance,
    };
  }

  async generateAssessment(
    job,
    options = {},
  ) {
    const payload = {
      ...(job.payload || {}),
      ...(options.payload ||
        {}),
    };

    const students =
      await this.getStudents(
        payload,
      );

    const assessedAt =
      this.resolveDateTime(
        payload.assessed_at ||
          payload.completed_at,
      );

    const details =
      this.assessmentDetails(
        payload,
      );

    const assessmentType =
      payload.assessment_type ||
      "final";

    let processed = 0;

    for (
      const student of students
    ) {
      const mentorId =
        Number(
          payload.mentor_id ||
            student.mentor_id,
        );

      if (!mentorId) {
        throw new Error(
          `Mentor is not assigned for student ${student.registration_number}`,
        );
      }

      const [
        assessment,
        created,
      ] =
        await Assessment.findOrCreate(
          {
            where: {
              student_id:
                student.id,

              assessment_type:
                assessmentType,
            },

            defaults: {
              mentor_id:
                mentorId,

              criteria_ratings_json:
                details.ratings,

              overall_performance:
                details.performance,

              supervisor_remarks:
                payload.supervisor_remarks ||
                "Assessment completed through bulk automation",

              status:
                payload.assessment_status ||
                "approved",

              assessed_at:
                assessedAt,

              approved_at:
                assessedAt,

              approved_by:
                job.created_by ||
                null,
            },
          },
        );

      if (!created) {
        await assessment.update(
          {
            mentor_id:
              mentorId,

            criteria_ratings_json:
              details.ratings,

            overall_performance:
              details.performance,

            supervisor_remarks:
              payload.supervisor_remarks ||
              assessment
                .supervisor_remarks,

            status:
              payload.assessment_status ||
              "approved",

            assessed_at:
              assessedAt,

            approved_at:
              assessedAt,

            approved_by:
              job.created_by ||
              null,
          },
        );
      }

      processed += 1;

      if (
        !options.silent
      ) {
        await this.updateProgress(
          job,
          processed,
          students.length,
        );
      }
    }

    const result = {
      students:
        students.length,
      assessments:
        students.length,
      assessment_type:
        assessmentType,
      percentage:
        details.percentage,
      overall_performance:
        details.performance,
      assessed_at:
        assessedAt.toISOString(),
    };

    if (!options.silent) {
      await this.updateProgress(
        job,
        students.length,
        students.length,
        result,
      );
    }

    return result;
  }

  gradeFromPercentage(
    percentage,
  ) {
    if (
      percentage >= 90
    ) {
      return "A+";
    }

    if (
      percentage >= 80
    ) {
      return "A";
    }

    if (
      percentage >= 70
    ) {
      return "B+";
    }

    if (
      percentage >= 60
    ) {
      return "B";
    }

    if (
      percentage >= 50
    ) {
      return "C";
    }

    if (
      percentage >= 40
    ) {
      return "D";
    }

    return "F";
  }

  percentageFromAssessment(
    assessment,
    payload,
  ) {
    if (
      payload.score_percentage !==
      undefined
    ) {
      return Number(
        payload.score_percentage,
      );
    }

    const criteria =
      assessment
        ?.criteria_ratings_json ||
      {};

    const values =
      Object.values(criteria)
        .map(Number)
        .filter(
          (value) =>
            !Number.isNaN(
              value,
            ),
        );

    if (
      values.length === 0
    ) {
      return 0;
    }

    const maximumRating =
      Number(
        payload.max_rating ||
          5,
      );

    return Number(
      (
        (
          values.reduce(
            (
              sum,
              value,
            ) =>
              sum + value,
            0,
          ) /
          (
            values.length *
            maximumRating
          )
        ) *
        100
      ).toFixed(2),
    );
  }

  async publishResults(
    job,
    options = {},
  ) {
    const payload = {
      ...(job.payload || {}),
      ...(options.payload ||
        {}),
    };

    const students =
      await this.getStudents(
        payload,
      );

    const publishedAt =
      this.resolveDateTime(
        payload.published_at ||
          payload.completed_at,
      );

    let processed = 0;

    for (
      const student of students
    ) {
      const assessment =
        await Assessment.findOne(
          {
            where: {
              student_id:
                student.id,

              assessment_type:
                payload.assessment_type ||
                "final",
            },

            order: [
              ["id", "DESC"],
            ],
          },
        );

      if (!assessment) {
        throw new Error(
          `Assessment not found for student ${student.registration_number}`,
        );
      }

      const percentage =
        this.percentageFromAssessment(
          assessment,
          payload,
        );

      const passed =
        percentage >=
        Number(
          payload.pass_percentage ||
            40,
        );

      const [
        result,
        created,
      ] =
        await Result.findOrCreate(
          {
            where: {
              student_id:
                student.id,
            },

            defaults: {
              assessment_id:
                assessment.id,

              score_percentage:
                percentage,

              grade:
                payload.grade ||
                this.gradeFromPercentage(
                  percentage,
                ),

              result_status:
                passed
                  ? "passed"
                  : "failed",

              status:
                "published",

              published_at:
                publishedAt,

              published_by:
                job.created_by ||
                null,

              remarks:
                payload.result_remarks ||
                "Result published through bulk automation",
            },
          },
        );

      if (!created) {
        await result.update(
          {
            assessment_id:
              assessment.id,

            score_percentage:
              percentage,

            grade:
              payload.grade ||
              this.gradeFromPercentage(
                percentage,
              ),

            result_status:
              passed
                ? "passed"
                : "failed",

            status:
              "published",

            published_at:
              publishedAt,

            published_by:
              job.created_by ||
              null,

            remarks:
              payload.result_remarks ||
              result.remarks,
          },
        );
      }
      const marksheetResult =
  await bulkPdfDocumentService
    .generateAssessmentMarksheet({
      student,
      assessment,
      result,
      generatedAt:
        publishedAt,

      percentage,
      grade:
        result.grade,

      resultStatus:
        result.result_status,

      performance:
        assessment
          .overall_performance,
    });

await this.saveGeneratedDocument(
  student.id,
  "assessment_marksheet",
  marksheetResult.file_url,
  job,
  {
    generated_at:
      publishedAt,

    assessment_id:
      assessment.id,

    result_id:
      result.id,

    percentage,

    grade:
      result.grade,
  },
);

      processed += 1;

      if (
        !options.silent
      ) {
        await this.updateProgress(
          job,
          processed,
          students.length,
        );
      }
    }

    const result = {
      students:
        students.length,
      results_published:
        students.length,
      published_at:
        publishedAt.toISOString(),
    };

    if (!options.silent) {
      await this.updateProgress(
        job,
        students.length,
        students.length,
        result,
      );
    }

    return result;
  }

  studentFolder(
    student,
  ) {
    return sanitizeName(
      student.registration_number ||
        student.student_id ||
        `student-${student.id}`,
    );
  }

  
  async saveGeneratedDocument(
    studentId,
    type,
    fileUrl,
    job,
    metadata = {},
  ) {
    const [
      document,
      created,
    ] =
      await GeneratedDocument.findOrCreate(
        {
          where: {
            student_id:
              studentId,
            type,
          },

          defaults: {
            file_url:
              fileUrl,

            generated_at:
              metadata.generated_at ||
              new Date(),

            generated_by:
              job.created_by ||
              null,

            metadata_json:
              metadata,
          },
        },
      );

    if (!created) {
      await document.update({
        file_url:
          fileUrl,

        generated_at:
          metadata.generated_at ||
          new Date(),

        generated_by:
          job.created_by ||
          null,

        metadata_json:
          metadata,
      });
    }

    return document;
  }

async generateAcceptanceLetters(
  job,
  options = {},
) {
  const payload = {
    ...(job.payload || {}),
    ...(options.payload || {}),
  };

  const students =
    await this.getStudents(
      payload,
    );

  const generatedAt =
    this.resolveDateTime(
      payload.generated_at,
    );

  const files = [];
  let processed = 0;

  for (const student of students) {
    const documentResult =
      await bulkPdfDocumentService
        .generateOfferLetter({
          student,
          generatedAt,

          letterReference:
            payload.letter_reference ||
            null,

          internshipStartDate:
            payload.start_date ||
            student.internship_start_date,

          internshipEndDate:
            payload.end_date ||
            student.internship_end_date,

          totalHours:
            Number(
              payload.total_hours ||
              student.domain
                ?.duration_hours ||
              120,
            ),
        });

    await this.saveGeneratedDocument(
      student.id,
      "acceptance_letter",
      documentResult.file_url,
      job,
      {
        generated_at:
          generatedAt,

        letter_reference:
          documentResult
            .letter_reference ||
          null,
      },
    );

    files.push({
      student_id:
        student.id,

      file_url:
        documentResult.file_url,
    });

    processed += 1;

    if (!options.silent) {
      await this.updateProgress(
        job,
        processed,
        students.length,
      );
    }
  }

  const result = {
    students:
      students.length,

    acceptance_letters:
      files.length,

    files,
  };

  if (!options.silent) {
    await this.updateProgress(
      job,
      students.length,
      students.length,
      result,
    );
  }

  return result;
}

  async getAttendance(
    studentId,
    payload,
  ) {
    const where = {
      student_id:
        studentId,
    };

    if (
      payload.start_date &&
      payload.end_date
    ) {
      where.date = {
        [Op.between]: [
          payload.start_date,
          payload.end_date,
        ],
      };
    }

    return Attendance.findAll({
      where,
      order: [
        ["date", "ASC"],
      ],
    });
  }

async generateAttendanceSheets(
  job,
  options = {},
) {
  const payload = {
    ...(job.payload || {}),
    ...(options.payload || {}),
  };

  const students =
    await this.getStudents(
      payload,
    );

  const generatedAt =
    this.resolveDateTime(
      payload.generated_at,
    );

  const files = [];
  let processed = 0;

  for (const student of students) {
    const attendance =
      await this.getAttendance(
        student.id,
        payload,
      );

    const completedHours =
      attendance.reduce(
        (total, record) =>
          total +
          Number(
            record.learning_hours ||
            0,
          ),
        0,
      );

    const documentResult =
      await bulkPdfDocumentService
        .generateAttendanceLog({
          student,
          attendance,
          generatedAt,

          totalRequiredHours:
            Number(
              payload.total_hours ||
              student.domain
                ?.duration_hours ||
              120,
            ),

          completedHours,

          supervisorName:
            student.mentor?.name ||
            payload.supervisor_name ||
            "Rahul Kumar",

          organizationName:
            payload.organization_name ||
            "OPTIMARK VENTURES PRIVATE LIMITED",

          officeAddress:
            payload.office_address ||
            "Biscuit Factory Road, Mithila Colony, Patna, Bihar 801503",

          organizationPhone:
            payload.organization_phone ||
            "7544090878",
        });

    await this.saveGeneratedDocument(
      student.id,
      "attendance_sheet",
      documentResult.file_url,
      job,
      {
        generated_at:
          generatedAt,

        records:
          attendance.length,

        completed_hours:
          completedHours,
      },
    );

    files.push({
      student_id:
        student.id,

      file_url:
        documentResult.file_url,
    });

    processed += 1;

    if (!options.silent) {
      await this.updateProgress(
        job,
        processed,
        students.length,
      );
    }
  }

  const result = {
    students:
      students.length,

    attendance_sheets:
      files.length,

    files,
  };

  if (!options.silent) {
    await this.updateProgress(
      job,
      students.length,
      students.length,
      result,
    );
  }

  return result;
}

  async generateLogBooks(
    job,
    options = {},
  ) {
    const payload = {
      ...(job.payload || {}),
      ...(options.payload ||
        {}),
    };

    const students =
      await this.getStudents(
        payload,
      );

    const generatedAt =
      this.resolveDateTime(
        payload.generated_at,
      );

    const files = [];
    let processed = 0;

    for (
      const student of students
    ) {
      const attendance =
        await this.getAttendance(
          student.id,
          payload,
        );

      for (
        const record of attendance
      ) {
        const [
          entry,
          created,
        ] =
          await Logbook.findOrCreate(
            {
              where: {
                student_id:
                  student.id,
                date:
                  record.date,
              },

              defaults: {
                activity:
                  payload.daily_activity ||
                  "Completed assigned learning modules and internship activities.",

                skills:
                  payload.skills ||
                  "Technical learning, communication and professional skills",

                hours_worked:
                  record.learning_hours ||
                  0,
              },
            },
          );

        if (!created) {
          await entry.update({
            activity:
              payload.daily_activity ||
              entry.activity,

            skills:
              payload.skills ||
              entry.skills,

            hours_worked:
              record.learning_hours ||
              entry.hours_worked ||
              0,
          });
        }
      }

      const entries =
        await Logbook.findAll({
          where: {
            student_id:
              student.id,

            ...(payload.start_date &&
            payload.end_date
              ? {
                  date: {
                    [Op.between]: [
                      payload.start_date,
                      payload.end_date,
                    ],
                  },
                }
              : {}),
          },

          order: [
            ["date", "ASC"],
          ],
        });

      const documentResult =
  await bulkPdfDocumentService
    .generateLogbook({
      student,
      entries,
      generatedAt,

      supervisorName:
        student.mentor?.name ||
        payload.supervisor_name ||
        "Rahul Kumar",
    });

const fileUrl =
  documentResult.file_url;

      await this.saveGeneratedDocument(
        student.id,
        "logbook",
        fileUrl,
        job,
        {
          generated_at:
            generatedAt,
          entries:
            entries.length,
        },
      );

      files.push({
        student_id:
          student.id,
        file_url:
          fileUrl,
      });

      processed += 1;

      if (
        !options.silent
      ) {
        await this.updateProgress(
          job,
          processed,
          students.length,
        );
      }
    }

    const result = {
      students:
        students.length,
      logbooks:
        files.length,
      files,
    };

    if (!options.silent) {
      await this.updateProgress(
        job,
        students.length,
        students.length,
        result,
      );
    }

    return result;
  }

  async generateInternshipReports(
    job,
    options = {},
  ) {
    const payload = {
      ...(job.payload || {}),
      ...(options.payload ||
        {}),
    };

    const students =
      await this.getStudents(
        payload,
      );

    const generatedAt =
      this.resolveDateTime(
        payload.generated_at,
      );

    const files = [];
    let processed = 0;

    for (
      const student of students
    ) {
      const attendance =
        await this.getAttendance(
          student.id,
          payload,
        );

      const chapterCount =
        await ChapterCompletion.count(
          {
            where: {
              student_id:
                student.id,
              status:
                "completed",
            },
          },
        );

      const assessment =
        await Assessment.findOne(
          {
            where: {
              student_id:
                student.id,

              assessment_type:
                payload.assessment_type ||
                "final",
            },

            order: [
              ["id", "DESC"],
            ],
          },
        );

      const result =
        await Result.findOne({
          where: {
            student_id:
              student.id,
          },
        });

      const documentResult =
  await bulkPdfDocumentService
    .generateInternshipReport({
      student,
      attendance,
      chapterCount,
      assessment,
      result,
      generatedAt,

      reportSummary:
        payload.report_summary ||
        null,

      organizationName:
        payload.organization_name ||
        "Optimark Ventures Private Limited",

      internshipTopic:
        student.domain
          ?.domain_name ||
        student.major_subject ||
        "Internship Programme",

      totalHours:
        Number(
          payload.total_hours ||
          student.domain
            ?.duration_hours ||
          120,
        ),
    });

const fileUrl =
  documentResult.file_url;

      const [
        report,
        created,
      ] =
        await InternshipReport.findOrCreate(
          {
            where: {
              student_id:
                student.id,
            },

            defaults: {
              report_url:
                fileUrl,

              status:
                "approved",

              mentor_remarks:
                payload.report_remarks ||
                "Report generated through bulk automation",
            },
          },
        );

      if (!created) {
        await report.update({
          report_url:
            fileUrl,

          status:
            "approved",

          mentor_remarks:
            payload.report_remarks ||
            report.mentor_remarks,
        });
      }

      await this.saveGeneratedDocument(
        student.id,
        "internship_report",
        fileUrl,
        job,
        {
          generated_at:
            generatedAt,
        },
      );

      files.push({
        student_id:
          student.id,
        file_url:
          fileUrl,
      });

      processed += 1;

      if (
        !options.silent
      ) {
        await this.updateProgress(
          job,
          processed,
          students.length,
        );
      }
    }

    const response = {
      students:
        students.length,
      internship_reports:
        files.length,
      files,
    };

    if (!options.silent) {
      await this.updateProgress(
        job,
        students.length,
        students.length,
        response,
      );
    }

    return response;
  }

async generateCertificates(
  job,
  options = {},
) {
  const payload = {
    ...(job.payload || {}),
    ...(options.payload || {}),
  };

  const students =
    await this.getStudents(
      payload,
    );

  const generatedAt =
    this.resolveDateTime(
      payload.generated_at,
    );

  const issuedDate =
    payload.issued_date ||
    generatedAt
      .toISOString()
      .slice(0, 10);

  const files = [];
  let processed = 0;

  for (const student of students) {
    const certificateNumber =
      `${
        payload.certificate_prefix ||
        "RKN"
      }-${
        new Date(
          issuedDate,
        ).getFullYear()
      }-${String(
        student.id,
      ).padStart(
        7,
        "0",
      )}`;

    const verificationUrl =
  `${
    process.env.CLIENT_URL ||
    "http://localhost:3000"
  }/verify-certificate/${encodeURIComponent(
    certificateNumber,
  )}`;
    const documentResult =
      await bulkPdfDocumentService
        .generateCertificate({
          student,
          certificateNumber,
          verificationUrl,
          issuedDate,
          generatedAt,

          totalHours:
            Number(
              payload.total_hours ||
              student.domain
                ?.duration_hours ||
              120,
            ),
        });

    const [
      certificate,
      created,
    ] =
      await Certificate.findOrCreate({
        where: {
          student_id:
            student.id,
        },

        defaults: {
          certificate_number:
            certificateNumber,

          certificate_url:
            documentResult.file_url,

          qr_code_url:
            documentResult
              .qr_code_url,

          verification_url:
            verificationUrl,

          issued_date:
            issuedDate,
        },
      });

    if (!created) {
      await certificate.update({
        certificate_number:
          certificateNumber,

        certificate_url:
          documentResult.file_url,

        qr_code_url:
          documentResult
            .qr_code_url,

        verification_url:
          verificationUrl,

        issued_date:
          issuedDate,
      });
    }

    await student.update({
      certificate_generated:
        true,

      certificate_url:
        documentResult.file_url,
    });

    await this.saveGeneratedDocument(
      student.id,
      "certificate",
      documentResult.file_url,
      job,
      {
        generated_at:
          generatedAt,

        certificate_number:
          certificateNumber,

        qr_code_url:
          documentResult
            .qr_code_url,

        verification_url:
          verificationUrl,
      },
    );

    files.push({
      student_id:
        student.id,

      certificate_number:
        certificateNumber,

      certificate_url:
        documentResult.file_url,

      qr_code_url:
        documentResult
          .qr_code_url,

      verification_url:
        verificationUrl,
    });

    processed += 1;

    if (!options.silent) {
      await this.updateProgress(
        job,
        processed,
        students.length,
      );
    }
  }

  const result = {
    students:
      students.length,

    certificates:
      files.length,

    issued_date:
      issuedDate,

    files,
  };

  if (!options.silent) {
    await this.updateProgress(
      job,
      students.length,
      students.length,
      result,
    );
  }

  return result;
}

  resolveFilePath(url) {
    if (!url) {
      return null;
    }

    const localPath =
      String(url)
        .replace(
          /^https?:\/\/[^/]+/i,
          "",
        )
        .replace(
          /^\/+/,
          "",
        );

    return path.resolve(
      localPath,
    );
  }

  addFileToArchive(
    archive,
    url,
    archiveName,
  ) {
    const absolutePath =
      this.resolveFilePath(
        url,
      );

    if (
      !absolutePath ||
      !fs.existsSync(
        absolutePath,
      )
    ) {
      return false;
    }

    archive.file(
      absolutePath,
      {
        name:
          archiveName,
      },
    );

    return true;
  }

  async generateZip(
    job,
    options = {},
  ) {
    const payload = {
      ...(job.payload || {}),
      ...(options.payload ||
        {}),
    };

    const students =
      await this.getStudents(
        payload,
      );

    ensureDir(ZIP_ROOT);

    const zipPath =
      path.join(
        ZIP_ROOT,
        `${job.job_uuid}.zip`,
      );

    const output =
      fs.createWriteStream(
        zipPath,
      );

    const archive =
      archiver(
        "zip",
        {
          zlib: {
            level: 9,
          },
        },
      );

    archive.pipe(output);

    let fileCount = 0;
    let processed = 0;

    for (
      const student of students
    ) {
      const folder =
        this.studentFolder(
          student,
        );

      const documents =
        await GeneratedDocument.findAll(
          {
            where: {
              student_id:
                student.id,
            },
          },
        );

      for (
        const document of documents
      ) {
        const extension =
          path.extname(
            document.file_url ||
              "",
          ) || ".pdf";

        if (
          this.addFileToArchive(
            archive,
            document.file_url,
            `${folder}/generated/${document.type}${extension}`,
          )
        ) {
          fileCount += 1;
        }

        const metadata =
          document.metadata_json ||
          {};

        if (
          metadata.qr_code_url &&
          this.addFileToArchive(
            archive,
            metadata.qr_code_url,
            `${folder}/generated/certificate-qr.png`,
          )
        ) {
          fileCount += 1;
        }
      }

      if (
        student.photo &&
        this.addFileToArchive(
          archive,
          student.photo,
          `${folder}/photo${path.extname(student.photo)}`,
        )
      ) {
        fileCount += 1;
      }

      const submissions =
        await Submission.findAll(
          {
            where: {
              student_id:
                student.id,
            },
          },
        );

      submissions.forEach(
        (
          submission,
          index,
        ) => {
          if (
            this.addFileToArchive(
              archive,
              submission.file_url,
              `${folder}/submissions/submission-${index + 1}${path.extname(submission.file_url || "")}`,
            )
          ) {
            fileCount += 1;
          }
        },
      );

      const projects =
        await LiveProject.findAll(
          {
            where: {
              student_id:
                student.id,
            },
          },
        );

      projects.forEach(
        (
          project,
          index,
        ) => {
          if (
            this.addFileToArchive(
              archive,
              project.report_url,
              `${folder}/projects/project-${index + 1}${path.extname(project.report_url || "")}`,
            )
          ) {
            fileCount += 1;
          }
        },
      );

      processed += 1;

      if (
        !options.silent
      ) {
        await this.updateProgress(
          job,
          processed,
          students.length,
        );
      }
    }

    await archive.finalize();

    await new Promise(
      (
        resolve,
        reject,
      ) => {
        output.on(
          "close",
          resolve,
        );

        output.on(
          "error",
          reject,
        );

        archive.on(
          "error",
          reject,
        );
      },
    );

    const result = {
      students:
        students.length,
      files:
        fileCount,
      zip_url:
        toPublicUrl(
          zipPath,
        ),
    };

    if (!options.silent) {
      await this.updateProgress(
        job,
        students.length,
        students.length,
        result,
      );
    }

    return result;
  }

  async runFullProcess(
    job,
  ) {
    const payload =
      job.payload || {};

    const steps = [
      {
        name:
          "acceptance_letters",
        run: () =>
          this.generateAcceptanceLetters(
            job,
            {
              payload,
              silent: true,
            },
          ),
      },
      {
        name: "attendance",
        run: () =>
          this.generateAttendance(
            job,
            {
              payload,
              silent: true,
            },
          ),
      },
      {
        name:
          "complete_learning",
        run: () =>
          this.completeLearning(
            job,
            {
              payload,
              silent: true,
            },
          ),
      },
      {
        name: "assessment",
        run: () =>
          this.generateAssessment(
            job,
            {
              payload,
              silent: true,
            },
          ),
      },
      {
        name:
          "publish_results",
        run: () =>
          this.publishResults(
            job,
            {
              payload,
              silent: true,
            },
          ),
      },
      {
        name:
          "complete_internship",
        run: () =>
          this.completeInternship(
            job,
            {
              payload,
              silent: true,
            },
          ),
      },
      {
        name:
          "attendance_sheets",
        run: () =>
          this.generateAttendanceSheets(
            job,
            {
              payload,
              silent: true,
            },
          ),
      },
      {
        name: "log_books",
        run: () =>
          this.generateLogBooks(
            job,
            {
              payload,
              silent: true,
            },
          ),
      },
      {
        name:
          "internship_reports",
        run: () =>
          this.generateInternshipReports(
            job,
            {
              payload,
              silent: true,
            },
          ),
      },
      {
        name:
          "certificates",
        run: () =>
          this.generateCertificates(
            job,
            {
              payload,
              silent: true,
            },
          ),
      },
      {
        name:
          "zip_documents",
        run: () =>
          this.generateZip(
            job,
            {
              payload,
              silent: true,
            },
          ),
      },
    ];

    const completed = [];
    const failed = [];

    for (
      let index = 0;
      index < steps.length;
      index += 1
    ) {
      const step =
        steps[index];

      try {
        const result =
          await step.run();

        completed.push({
          name:
            step.name,
          result,
        });
      } catch (error) {
        failed.push({
          name:
            step.name,
          error:
            error.message,
        });

        if (
          payload.stop_on_error !==
          false
        ) {
          throw error;
        }
      }

      await this.updateProgress(
        job,
        index + 1,
        steps.length,
      );
    }

    const zipStep =
      completed.find(
        (step) =>
          step.name ===
          "zip_documents",
      );

    const result = {
      completed_steps:
        completed.length,

      failed_steps:
        failed.length,

      completed,
      failed,

      zip_url:
        zipStep?.result
          ?.zip_url ||
        null,
    };

    await this.updateProgress(
      job,
      steps.length,
      steps.length,
      result,
    );

    return result;
  }
}

export const bulkJobRunner =
  new BulkJobRunner();
