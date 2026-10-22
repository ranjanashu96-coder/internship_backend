import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { Op } from "sequelize";
import { v4 as uuid } from "uuid";

import { getStudentEligibility } from "../services/studentEligibilityService.js";
import { bulkPdfDocumentService } from "../services/bulkPdfDocumentService.js";
import { getDomainRemarks } from "../config/domainRemarks.js";
import { getDomainLogbookEntry } from "../config/domainLogbookData.js";
import { ensureDir } from "../utils/files.js";

import {
  College,
  Mentor,
  BulkJob,
  Student,
  Attendance,
  Module,
  Chapter,
  ChapterCompletion,
  Quiz,
  QuizAttempt,
  Assignment,
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

/* ============================================================================
 * Constants
 * ========================================================================== */

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
  "quiz_attempts_and_submissions",
  "department_certificates",
  "consent_letters",
]);

const ZIP_ROOT = path.resolve("uploads", "zips");
const STATIC_REPORTS_DIR = path.resolve("src", "assets", "static-reports");

// Safety limits
const STUDENT_FETCH_CHUNK = 500;        // students per DB query
const ATTENDANCE_INSERT_BATCH = 500;    // rows per bulkCreate
const CHAPTER_FIND_OR_CREATE_BATCH = 200;
const PROGRESS_UPDATE_EVERY = 25;       // update job row after N items
const CANCEL_CHECK_EVERY = 25;          // check cancel after N items
const JOB_TIMEOUT_MS = 1000 * 60 * 60;  // 1 hour hard limit per job
const RESULT_JSON_MAX_ITEMS = 500;      // cap arrays in result JSON
const STUCK_JOB_RESET_MS = 1000 * 60 * 30; // 30 min — resume only if stale

/* ============================================================================
 * Helpers
 * ========================================================================== */

const normalizeIds = (values) => {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values.map(Number).filter((v) => Number.isInteger(v) && v > 0)
    ),
  ];
};

const sanitizeName = (value) =>
  String(value || "student")
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-");

const toPublicUrl = (absolutePath) => {
  const relative = path
    .relative(path.resolve("."), absolutePath)
    .replaceAll("\\", "/");
  return `/${relative}`;
};

const calculateHours = (loginTime, logoutTime) => {
  if (!loginTime || !logoutTime) return 0;
  const [lh, lm] = String(loginTime).split(":").map(Number);
  const [oh, om] = String(logoutTime).split(":").map(Number);
  if ([lh, lm, oh, om].some(Number.isNaN)) return 0;
  return Number((Math.max(0, oh * 60 + om - (lh * 60 + lm)) / 60).toFixed(2));
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const capArray = (arr, max = RESULT_JSON_MAX_ITEMS) =>
  Array.isArray(arr) && arr.length > max
    ? arr.slice(0, max).concat([{ truncated: true, total: arr.length }])
    : arr;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class BulkJobCancelledError extends Error {
  constructor(message = "Bulk job cancelled") {
    super(message);
    this.name = "BulkJobCancelledError";
  }
}

/* ============================================================================
 * Runner
 * ========================================================================== */

class BulkJobRunner extends EventEmitter {
  constructor() {
    super();

    this.running = false;
    this.queue = [];
    this.activeJobId = null;
    this.enqueuedSet = new Set(); // dedupe queue entries
    this.shuttingDown = false;

    this.on("enqueue", () => {
      this.drain().catch((error) => {
        console.error("[bulkJobRunner] Queue drain error:", error);
      });
    });
  }

  /* -------------------- Job creation -------------------- */

  async create(type, payload, createdBy) {
    if (!BULK_JOB_TYPES.includes(type)) {
      throw new Error(`Invalid bulk job type: ${type}`);
    }

    const job = await BulkJob.create({
      job_uuid: uuid(),
      type,
      payload: payload || {},
      created_by: createdBy || null,
      status: "queued",
      current_step: "queued",
      progress: 0,
      processed: 0,
      total: 0,
      success_count: 0,
      failed_count: 0,
      cancel_requested: false,
      started_at: null,
      finished_at: null,
      error_message: null,
    });

    this._enqueue(job.id);
    return job;
  }

  _enqueue(jobId) {
    const id = Number(jobId);
    if (this.enqueuedSet.has(id)) return;
    this.enqueuedSet.add(id);
    this.queue.push(id);
    this.emit("enqueue");
  }

  /* -------------------- Resume on startup -------------------- */

  async resumePendingJobs() {
    /*
     * IMPORTANT: Only resume jobs that were "queued" OR "running" but
     * whose last update was STUCK_JOB_RESET_MS ago. This prevents
     * crash-restart loops where a job that keeps failing is retried
     * infinitely at every restart.
     */
    const cutoff = new Date(Date.now() - STUCK_JOB_RESET_MS);

    const jobs = await BulkJob.findAll({
      where: {
        status: { [Op.in]: ["queued", "running"] },
        cancel_requested: false,
        [Op.or]: [
          { started_at: null },
          { started_at: { [Op.lt]: cutoff } },
        ],
      },
      order: [["id", "ASC"]],
      limit: 50,
    });

    for (const job of jobs) {
      await job.update({
        status: "queued",
        current_step: "resuming",
        error_message: null,
        finished_at: null,
        started_at: null,
      });
      this._enqueue(job.id);
    }

    return jobs.length;
  }

  /* -------------------- Preview -------------------- */

  async preview(type, payload = {}) {
    if (!BULK_JOB_TYPES.includes(type)) {
      throw new Error(`Invalid bulk job type: ${type}`);
    }

    const total = await this.countStudents(payload);

    let workingDays = null;
    let estimatedRecords = total;

    if (
      ["attendance", "full_internship_process"].includes(type) &&
      payload.start_date &&
      payload.end_date
    ) {
      const dates = this.dateRange(payload.start_date, payload.end_date, payload);
      workingDays = dates.length;
      estimatedRecords = total * dates.length;
    }

    // Sample 10 students only
    const sampleStudents = await Student.findAll({
      ...this.buildStudentQuery(payload),
      limit: 10,
    });

    return {
      type,
      matched_students: total,
      working_days: workingDays,
      estimated_records: estimatedRecords,
      sample: sampleStudents.map((s) => ({
        id: s.id,
        registration_number: s.registration_number,
        student_id: s.student_id || null,
        name: s.name,
        college_id: s.college_id,
        domain_id: s.domain_id,
        batch_id: s.batch_id,
        mentor_id: s.mentor_id,
        internship_status: s.internship_status,
        payment_status: s.payment_status,
        college: s.college
          ? { id: s.college.id, name: s.college.name }
          : null,
        domain: s.domain
          ? { id: s.domain.id, name: s.domain.domain_name }
          : null,
      })),
    };
  }

  /* -------------------- Step / cancel -------------------- */

  async setCurrentStep(job, step) {
    await job.update({ current_step: step });
  }

  async assertNotCancelled(job) {
    await job.reload();
    if (job.cancel_requested || job.status === "cancelled") {
      throw new BulkJobCancelledError();
    }
  }

  async cancel(jobUuid) {
    const job = await BulkJob.findOne({ where: { job_uuid: jobUuid } });
    if (!job) throw new Error("Bulk job not found");

    if (["completed", "failed", "cancelled"].includes(job.status)) {
      throw new Error(`Cannot cancel ${job.status} job`);
    }

    if (job.status === "queued") {
      this.queue = this.queue.filter((id) => Number(id) !== Number(job.id));
      this.enqueuedSet.delete(Number(job.id));

      await job.update({
        status: "cancelled",
        current_step: "cancelled",
        cancel_requested: true,
        finished_at: new Date(),
      });
      return job;
    }

    await job.update({
      cancel_requested: true,
      current_step: "cancellation_requested",
    });
    return job;
  }

  getJobStepLabel(type) {
    const labels = {
      attendance: "Generating Attendance",
      quiz_attempts_and_submissions: "Generating Quiz Attempts & Submissions",
      complete_learning: "Completing Learning",
      complete_internship: "Completing Internship",
      assessment: "Generating Assessments",
      publish_results: "Publishing Results",
      acceptance_letters: "Generating Offer Letters",
      internship_reports: "Generating Internship Reports",
      attendance_sheets: "Generating Attendance Sheets",
      log_books: "Generating Logbooks",
      certificates: "Generating Certificates",
      department_certificates: "Generating Department Certificates",
      consent_letters: "Generating Consent Letters",
      zip_documents: "Creating ZIP File",
      full_internship_process: "Running Full Internship Process",
    };
    return labels[type] || type;
  }

  /* -------------------- Queue drain -------------------- */

  async drain() {
    if (this.running || this.shuttingDown) return;
    this.running = true;

    try {
      while (this.queue.length > 0) {
        if (this.shuttingDown) break;
        const jobId = this.queue.shift();
        this.enqueuedSet.delete(Number(jobId));
        this.activeJobId = jobId;
        try {
          await this.execute(jobId);
        } catch (err) {
          // Never let one job kill the drain loop
          console.error(`[bulkJobRunner] Job ${jobId} crashed drain:`, err);
        }
        this.activeJobId = null;
      }
    } finally {
      this.running = false;
    }
  }

  async stop() {
    this.shuttingDown = true;
    const start = Date.now();
    while (this.running && Date.now() - start < 30000) {
      await sleep(300);
    }
  }

  /* -------------------- Progress -------------------- */

  async updateProgress(job, processed, total, result, metrics = {}) {
    const progress =
      total > 0
        ? Math.min(100, Number(((processed / total) * 100).toFixed(2)))
        : 100;

    const updateData = { processed, total, progress };

    if (result !== undefined) {
      updateData.result = this._sanitizeResult(result);
    }
    if (metrics.success_count !== undefined) {
      updateData.success_count = metrics.success_count;
    }
    if (metrics.failed_count !== undefined) {
      updateData.failed_count = metrics.failed_count;
    }

    await job.update(updateData);
  }

  _sanitizeResult(result) {
    if (!result || typeof result !== "object") return result;
    const sanitized = {};
    for (const [key, value] of Object.entries(result)) {
      sanitized[key] = Array.isArray(value) ? capArray(value) : value;
    }
    return sanitized;
  }

  /* -------------------- Execute -------------------- */

  async execute(jobId) {
    const job = await BulkJob.findByPk(jobId);
    if (!job) return;
    if (job.status === "cancelled" || job.cancel_requested) return;

    // Hard timeout protection
    let timeoutHandle = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Job ${job.job_uuid} exceeded ${JOB_TIMEOUT_MS}ms`)),
        JOB_TIMEOUT_MS
      );
    });

    try {
      await job.update({
        status: "running",
        current_step: this.getJobStepLabel(job.type),
        progress: 0,
        processed: 0,
        total: 0,
        success_count: 0,
        failed_count: 0,
        cancel_requested: false,
        started_at: new Date(),
        finished_at: null,
        error_message: null,
      });

      const handlers = {
        attendance: () => this.generateAttendance(job),
        quiz_attempts_and_submissions: () => this.generateQuizAttemptsAndSubmissions(job),
        complete_learning: () => this.completeLearning(job),
        complete_internship: () => this.completeInternship(job),
        assessment: () => this.generateAssessment(job),
        publish_results: () => this.publishResults(job),
        acceptance_letters: () => this.generateAcceptanceLetters(job),
        internship_reports: () => this.generateInternshipReports(job),
        attendance_sheets: () => this.generateAttendanceSheets(job),
        log_books: () => this.generateLogBooks(job),
        certificates: () => this.generateCertificates(job),
        department_certificates: () => this.generateDepartmentCertificates(job),
        consent_letters: () => this.generateConsentLetters(job),
        zip_documents: () => this.generateZip(job),
        full_internship_process: () => this.runFullProcess(job),
      };

      const handler = handlers[job.type];
      if (!handler) throw new Error(`Handler not found for ${job.type}`);

      await this.assertNotCancelled(job);

      const result = await Promise.race([handler(), timeoutPromise]);

      await this.assertNotCancelled(job);

      await job.update({
        status: "completed",
        current_step: "completed",
        progress: 100,
        finished_at: new Date(),
        result: this._sanitizeResult(result || job.result),
        success_count:
          job.type === "full_internship_process"
            ? Number(job.success_count || 0)
            : Number(job.processed || job.total || 0),
        error_message: null,
      });
    } catch (error) {
      if (error instanceof BulkJobCancelledError) {
        await job.update({
          status: "cancelled",
          current_step: "cancelled",
          cancel_requested: true,
          finished_at: new Date(),
        });
        return;
      }

      console.error(`[bulkJobRunner] Job ${job.job_uuid} failed:`, error);

      try {
        await job.update({
          status: "failed",
          current_step: "failed",
          failed_count: Math.max(Number(job.failed_count || 0), 1),
          error_message: String(error?.message || "Bulk job failed").slice(0, 2000),
          finished_at: new Date(),
        });
      } catch (updateErr) {
        console.error("[bulkJobRunner] Failed to mark job as failed:", updateErr);
      }
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  /* -------------------- Dates -------------------- */

  parseDate(value, fieldName) {
    if (!value) throw new Error(`${fieldName} is required`);
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) throw new Error(`${fieldName} is invalid`);
    return date;
  }

  resolveDateTime(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) throw new Error("Invalid date and time");
    return date;
  }

  dateRange(startDate, endDate, payload = {}) {
    if (!startDate || !endDate) {
      throw new Error("start_date and end_date are required");
    }

    const [sy, sm, sd] = startDate.split("-").map(Number);
    const [ey, em, ed] = endDate.split("-").map(Number);
    if (!sy || !sm || !sd || !ey || !em || !ed) {
      throw new Error("Invalid date format. Use YYYY-MM-DD");
    }

    let current = new Date(Date.UTC(sy, sm - 1, sd));
    const end = new Date(Date.UTC(ey, em - 1, ed));
    if (current > end) throw new Error("start_date cannot be after end_date");

    const excludedDays = [0]; // Sunday
    const holidays = new Set(
      Array.isArray(payload.holidays)
        ? payload.holidays.map((h) => String(h).trim())
        : []
    );

    const dates = [];
    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      const dayOfWeek = current.getUTCDay();
      if (!excludedDays.includes(dayOfWeek) && !holidays.has(dateStr)) {
        dates.push(dateStr);
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  }

  /* -------------------- Student query -------------------- */

  buildStudentQuery(payload = {}) {
    const where = {};

    const studentIds = normalizeIds(payload.student_ids);
    if (studentIds.length > 0) {
      where.id = { [Op.in]: studentIds };
    }

    for (const field of [
      "college_id", "domain_id", "session", "semester", "batch_id", "mentor_id",
    ]) {
      if (
        payload[field] !== undefined &&
        payload[field] !== null &&
        payload[field] !== ""
      ) {
        where[field] = payload[field];
      }
    }

    if (payload.internship_status) {
      where.internship_status = payload.internship_status;
    }

    const sFrom = String(payload.student_from_date || "").trim();
    const sTo = String(payload.student_to_date || "").trim();
    if (sFrom && sTo && sFrom > sTo) {
      throw new Error("Student from date cannot be after student to date");
    }
    if (sFrom || sTo) {
      where.registration_date = {};
      if (sFrom) where.registration_date[Op.gte] = new Date(`${sFrom}T00:00:00`);
      if (sTo) where.registration_date[Op.lte] = new Date(`${sTo}T23:59:59`);
    }

    const include = [
      {
        model: College,
        as: "college",
        attributes: [
          "id", "name", "code", "university", "principal_name",
          "coordinator_name", "email", "mobile", "address",
          "state", "district", "pincode", "logo",
        ],
        required: false,
      },
      {
        model: Domain,
        as: "domain",
        attributes: ["id", "sector_id", "domain_name", "duration_hours"],
        where: payload.sector_id ? { sector_id: payload.sector_id } : undefined,
        required: Boolean(payload.sector_id),
      },
      {
        model: Mentor,
        as: "mentor",
        attributes: [
          "id", "name", "employee_id", "designation",
          "department", "mobile", "email", "signature",
        ],
        required: false,
      },
    ];

    return {
      where,
      include,
      distinct: true,
      order: [["id", "ASC"]],
    };
  }

  async countStudents(payload = {}) {
    const query = this.buildStudentQuery(payload);
    return Student.count({
      where: query.where,
      include: query.include,
      distinct: true,
    });
  }

  /**
   * ✅ PRODUCTION FIX: Stream students in chunks via id cursor.
   * Never loads all students in memory.
   */
  async *iterateStudents(payload = {}) {
    const baseQuery = this.buildStudentQuery(payload);
    let lastId = 0;
    let fetched = 0;

    while (true) {
      const where = { ...baseQuery.where };
      if (lastId > 0) {
        where.id = {
          ...(where.id || {}),
          [Op.gt]: lastId,
        };
      }

      const batch = await Student.findAll({
        ...baseQuery,
        where,
        limit: STUDENT_FETCH_CHUNK,
      });

      if (batch.length === 0) break;

      for (const student of batch) {
        yield student;
        fetched += 1;
      }

      lastId = batch[batch.length - 1].id;
      if (batch.length < STUDENT_FETCH_CHUNK) break;
    }

    if (fetched === 0) {
      throw new Error("No students matched the selected filters");
    }
  }

  /**
   * Legacy: getStudents — kept for backward compat.
   * Prefer iterateStudents() for large datasets.
   * WARNING: This loads all matched students in memory.
   */
  async getStudents(payload = {}) {
    const students = await Student.findAll(this.buildStudentQuery(payload));
    if (students.length === 0) {
      throw new Error("No students matched the selected filters");
    }
    return students;
  }

  /* ==========================================================================
   * HANDLERS
   * ======================================================================== */

  /* -------------------- Attendance -------------------- */

  async generateAttendance(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };

    if (!payload.start_date || !payload.end_date) {
      throw new Error("start_date and end_date are required");
    }

    const dates = this.dateRange(payload.start_date, payload.end_date, payload);
    const loginTime = payload.login_time || "09:00:00";
    const logoutTime = payload.logout_time || "13:30:00";

    let learningHours;
    if (
      payload.learning_hours !== undefined &&
      payload.learning_hours !== null &&
      payload.learning_hours !== ""
    ) {
      learningHours = Number(payload.learning_hours);
    } else {
      learningHours = calculateHours(loginTime, logoutTime);
    }
    if (!Number.isFinite(learningHours) || learningHours <= 0) {
      learningHours = 4.5;
    }

    const holidays = new Set(
      Array.isArray(payload.holidays)
        ? payload.holidays.map((h) => String(h).trim())
        : []
    );

    let totalStudents = 0;
    let totalRows = 0;
    let processed = 0;

    // Collect student IDs first for holiday cleanup
    const studentIds = [];
    const rows = [];

    for await (const student of this.iterateStudents(payload)) {
      totalStudents += 1;
      studentIds.push(student.id);

      const domainName = student.domain?.domain_name || "";
      const domainRemarks = getDomainRemarks(domainName);

      for (let dayIndex = 0; dayIndex < dates.length; dayIndex += 1) {
        const date = dates[dayIndex];
        const dateStr = String(date).slice(0, 10);
        if (holidays.has(dateStr)) continue;

        const remarks =
          domainRemarks[dayIndex % domainRemarks.length] ||
          payload.daily_activity ||
          payload.remarks ||
          "Completed assigned learning modules and internship activities.";

        rows.push({
          student_id: student.id,
          date: dateStr,
          login_time: loginTime,
          logout_time: logoutTime,
          learning_hours: learningHours,
          status: payload.status || "present",
          remarks,
        });
      }
    }

    totalRows = rows.length;

    if (holidays.size > 0 && studentIds.length > 0) {
      for (const idChunk of chunk(studentIds, STUDENT_FETCH_CHUNK)) {
        await Attendance.destroy({
          where: {
            student_id: { [Op.in]: idChunk },
            date: { [Op.in]: Array.from(holidays) },
          },
        });
      }
    }

    for (const batch of chunk(rows, ATTENDANCE_INSERT_BATCH)) {
      await this.assertNotCancelled(job);
      await Attendance.bulkCreate(batch, {
        updateOnDuplicate: [
          "login_time", "logout_time", "learning_hours",
          "status", "remarks", "updated_at",
        ],
      });
      processed += batch.length;
      if (!options.silent) {
        await this.updateProgress(job, processed, totalRows);
      }
    }

    const result = {
      students: totalStudents,
      working_days: dates.length,
      attendance_records: totalRows,
      start_date: payload.start_date,
      end_date: payload.end_date,
    };

    if (!options.silent) {
      await this.updateProgress(job, totalRows, totalRows, result);
    }
    return result;
  }

  /* -------------------- Learning -------------------- */

  async getStudentChapters(student, payload) {
    const moduleWhere = { domain_id: student.domain_id };
    const moduleIds = normalizeIds(payload.module_ids);
    if (moduleIds.length > 0) moduleWhere.id = { [Op.in]: moduleIds };

    const chapterWhere = {};
    const chapterIds = normalizeIds(payload.chapter_ids);
    if (chapterIds.length > 0) chapterWhere.id = { [Op.in]: chapterIds };

    return Chapter.findAll({
      where: chapterWhere,
      attributes: ["id"],
      include: [{
        model: Module,
        attributes: [],
        required: true,
        where: moduleWhere,
      }],
      order: [["module_id", "ASC"], ["chapter_number", "ASC"]],
    });
  }

  async completeLearning(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const completedAt = this.resolveDateTime(
      payload.completed_at || payload.learning_completed_at || payload.end_date
    );

    // Phase 1: Fetch chapters per student (chunked)
    let total = 0;
    const studentChapters = []; // [{id, chapters: [{id}]}]
    let processedStudents = 0;

    for await (const student of this.iterateStudents(payload)) {
      processedStudents += 1;
      if (processedStudents % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      if (!student.domain_id) {
        studentChapters.push({ id: student.id, chapters: [] });
        continue;
      }

      const chapters = await this.getStudentChapters(student, payload);
      studentChapters.push({ id: student.id, chapters });
      total += chapters.length;
    }

    // Phase 2: Insert completions in bulk batches
    let processed = 0;
    let flatRows = [];
    for (const { id, chapters } of studentChapters) {
      for (const c of chapters) {
        flatRows.push({ student_id: id, chapter_id: c.id });
      }
    }

    for (const batch of chunk(flatRows, CHAPTER_FIND_OR_CREATE_BATCH)) {
      await this.assertNotCancelled(job);

      // Bulk lookup existing
      const existing = await ChapterCompletion.findAll({
        where: {
          [Op.or]: batch.map((r) => ({
            student_id: r.student_id,
            chapter_id: r.chapter_id,
          })),
        },
        attributes: ["id", "student_id", "chapter_id"],
      });
      const existingKeys = new Set(
        existing.map((e) => `${e.student_id}:${e.chapter_id}`)
      );

      const toCreate = batch.filter(
        (r) => !existingKeys.has(`${r.student_id}:${r.chapter_id}`)
      );

      if (toCreate.length) {
        await ChapterCompletion.bulkCreate(
          toCreate.map((r) => ({
            student_id: r.student_id,
            chapter_id: r.chapter_id,
            status: "completed",
            completed_at: completedAt,
          }))
        );
      }

      if (existing.length) {
        await ChapterCompletion.update(
          { status: "completed", completed_at: completedAt },
          { where: { id: { [Op.in]: existing.map((e) => e.id) } } }
        );
      }

      processed += batch.length;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, total);
      }
    }

    // Phase 3: Update students' academics in bulk
    for (const { id, chapters } of studentChapters) {
      await this.assertNotCancelled(job);
      const student = await Student.findByPk(id, { attributes: ["id", "academics_json"] });
      if (!student) continue;
      const academics = {
        ...(student.academics_json || {}),
        learning_completion: {
          status: "completed",
          completed_at: completedAt.toISOString(),
          chapter_count: chapters.length,
        },
      };
      await student.update({ total_progress: 100, academics_json: academics });
    }

    const result = {
      students: studentChapters.length,
      chapter_completions: total,
      completed_at: completedAt.toISOString(),
    };

    if (!options.silent) {
      await this.updateProgress(job, total, total, result);
    }
    return result;
  }

  /* -------------------- Quiz + Assignment -------------------- */

  async generateQuizAttemptsAndSubmissions(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const completedAt = this.resolveDateTime(payload.completed_at || payload.end_date);

    let totalQuizzes = 0;
    let totalAssignments = 0;
    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      if (!student.domain_id) continue;

      const chapters = await this.getStudentChapters(student, payload);
      const chapterIds = chapters.map((c) => Number(c.id));
      if (chapterIds.length === 0) continue;

      // ---- Quizzes: batch lookup then bulk create ----
      const quizzes = await Quiz.findAll({
        where: { chapter_id: { [Op.in]: chapterIds }, status: "active" },
        attributes: ["id"],
      });
      totalQuizzes += quizzes.length;

      if (quizzes.length) {
        const existing = await QuizAttempt.findAll({
          where: {
            student_id: student.id,
            quiz_id: { [Op.in]: quizzes.map((q) => q.id) },
          },
          attributes: ["id", "quiz_id", "score"],
        });
        const existingMap = new Map(existing.map((e) => [e.quiz_id, e]));

        const toCreate = quizzes
          .filter((q) => !existingMap.has(q.id))
          .map((q) => ({
            student_id: student.id,
            quiz_id: q.id,
            attempt_number: 1,
            started_at: completedAt,
            submitted_at: completedAt,
            status: "submitted",
            passed: true,
            score: 100,
          }));

        if (toCreate.length) {
          await QuizAttempt.bulkCreate(toCreate);
        }

        const existingIds = existing.map((e) => e.id);
        if (existingIds.length) {
          await QuizAttempt.update(
            {
              status: "submitted",
              passed: true,
              submitted_at: completedAt,
            },
            { where: { id: { [Op.in]: existingIds } } }
          );
        }
        processed += quizzes.length;
      }

      // ---- Assignments: batch ----
      const assignments = await Assignment.findAll({
        where: { chapter_id: { [Op.in]: chapterIds } },
        attributes: ["id"],
      });
      totalAssignments += assignments.length;

      if (assignments.length) {
        const existing = await Submission.findAll({
          where: {
            student_id: student.id,
            assignment_id: { [Op.in]: assignments.map((a) => a.id) },
          },
          attributes: ["id", "assignment_id"],
        });
        const existingSet = new Set(existing.map((e) => e.assignment_id));

        const toCreate = assignments
          .filter((a) => !existingSet.has(a.id))
          .map((a) => ({
            student_id: student.id,
            assignment_id: a.id,
            status: "approved",
            file_url: "-",
            marks: 100,
            mentor_comments: "Auto-approved through bulk automation",
          }));

        if (toCreate.length) {
          await Submission.bulkCreate(toCreate);
        }

        const existingIds = existing.map((e) => e.id);
        if (existingIds.length) {
          await Submission.update(
            { status: "approved" },
            { where: { id: { [Op.in]: existingIds } } }
          );
        }
        processed += assignments.length;
      }

      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, processed);
      }
    }

    const result = {
      students: studentCount,
      quizzes_attempted: totalQuizzes,
      assignments_submitted: totalAssignments,
      completed_at: completedAt.toISOString(),
    };

    if (!options.silent) {
      await this.updateProgress(job, processed, processed, result);
    }
    return result;
  }

  /* -------------------- Complete Internship -------------------- */

  async completeInternship(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const completedAt = this.resolveDateTime(
      payload.completed_at || payload.end_date
    );

    let endDate = payload.end_date || completedAt.toISOString().slice(0, 10);
    if (endDate === "" || endDate === undefined) endDate = null;

    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      const academics = {
        ...(student.academics_json || {}),
        internship_completion: {
          completed_at: completedAt.toISOString(),
          completed_by: job.created_by || null,
        },
      };

      await student.update({
        internship_status: "completed",
        internship_end_date: endDate,
        total_progress: 100,
        academics_json: academics,
      });

      processed += 1;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, studentCount);
      }
    }

    const result = {
      students: studentCount,
      internship_status: "completed",
      completed_at: completedAt.toISOString(),
    };

    if (!options.silent) {
      await this.updateProgress(job, studentCount, studentCount, result);
    }
    return result;
  }

  /* -------------------- Assessment -------------------- */

  assessmentDetails(payload) {
    const ratings = {
      technical_knowledge: Number(
        payload.technical_knowledge ??
          payload.criteria_ratings_json?.technical_knowledge ?? 5
      ),
      quality_of_work: Number(
        payload.quality_of_work ??
          payload.criteria_ratings_json?.quality_of_work ?? 5
      ),
      initiative: Number(
        payload.initiative ?? payload.criteria_ratings_json?.initiative ?? 5
      ),
      communication: Number(
        payload.communication ??
          payload.criteria_ratings_json?.communication ?? 5
      ),
      professional_conduct: Number(
        payload.professional_conduct ??
          payload.criteria_ratings_json?.professional_conduct ?? 5
      ),
    };

    const values = Object.values(ratings);
    const maximumRating = Number(payload.max_rating || 5);
    const percentage =
      values.length > 0
        ? Number(
            (
              (values.reduce((sum, v) => sum + v, 0) /
                (values.length * maximumRating)) *
              100
            ).toFixed(2)
          )
        : 0;

    let performance = "Needs Improvement";
    if (percentage >= 90) performance = "Outstanding";
    else if (percentage >= 80) performance = "Excellent";
    else if (percentage >= 70) performance = "Very Good";
    else if (percentage >= 60) performance = "Good";
    else if (percentage >= 50) performance = "Satisfactory";

    return { ratings, percentage, performance };
  }

  async generateAssessment(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const assessedAt = this.resolveDateTime(
      payload.assessed_at || payload.completed_at
    );
    const details = this.assessmentDetails(payload);
    const assessmentType = payload.assessment_type || "final";

    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      const mentorId = Number(payload.mentor_id || student.mentor_id);
      if (!mentorId) {
        throw new Error(
          `Mentor is not assigned for student ${student.registration_number}`
        );
      }

      const [assessment, created] = await Assessment.findOrCreate({
        where: {
          student_id: student.id,
          assessment_type: assessmentType,
        },
        defaults: {
          mentor_id: mentorId,
          criteria_ratings_json: details.ratings,
          overall_performance: details.performance,
          supervisor_remarks:
            payload.supervisor_remarks ||
            "Assessment completed through bulk automation",
          status: payload.assessment_status || "approved",
          assessed_at: assessedAt,
          approved_at: assessedAt,
          approved_by: job.created_by || null,
        },
      });

      if (!created) {
        await assessment.update({
          mentor_id: mentorId,
          criteria_ratings_json: details.ratings,
          overall_performance: details.performance,
          supervisor_remarks:
            payload.supervisor_remarks || assessment.supervisor_remarks,
          status: payload.assessment_status || "approved",
          assessed_at: assessedAt,
          approved_at: assessedAt,
          approved_by: job.created_by || null,
        });
      }

      processed += 1;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, studentCount);
      }
    }

    const result = {
      students: studentCount,
      assessments: studentCount,
      assessment_type: assessmentType,
      percentage: details.percentage,
      overall_performance: details.performance,
      assessed_at: assessedAt.toISOString(),
    };

    if (!options.silent) {
      await this.updateProgress(job, studentCount, studentCount, result);
    }
    return result;
  }

  /* -------------------- Publish Results -------------------- */

  gradeFromPercentage(percentage) {
    if (percentage >= 90) return "A+";
    if (percentage >= 80) return "A";
    if (percentage >= 70) return "B+";
    if (percentage >= 60) return "B";
    if (percentage >= 50) return "C";
    if (percentage >= 40) return "D";
    return "F";
  }

  percentageFromAssessment(assessment, payload) {
    if (payload.score_percentage !== undefined) {
      return Number(payload.score_percentage);
    }
    const criteria = assessment?.criteria_ratings_json || {};
    const values = Object.values(criteria)
      .map(Number)
      .filter((v) => !Number.isNaN(v));
    if (values.length === 0) return 0;
    const maximumRating = Number(payload.max_rating || 5);
    return Number(
      (
        (values.reduce((sum, v) => sum + v, 0) /
          (values.length * maximumRating)) *
        100
      ).toFixed(2)
    );
  }

  async publishResults(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const publishedAt = this.resolveDateTime(
      payload.published_at || payload.completed_at
    );

    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      const assessment = await Assessment.findOne({
        where: {
          student_id: student.id,
          assessment_type: payload.assessment_type || "final",
        },
        order: [["id", "DESC"]],
      });

      if (!assessment) {
        throw new Error(
          `Assessment not found for student ${student.registration_number}`
        );
      }

      // ✅ PRODUCTION FIX: Deterministic score (no Math.random)
      const score =
        payload.score_percentage !== undefined
          ? Number(payload.score_percentage)
          : this.percentageFromAssessment(assessment, payload);

      const finalScore = score > 0 ? score : 90; // fallback if no ratings
      const grade = this.gradeFromPercentage(finalScore);
      const passed = finalScore >= Number(payload.pass_percentage || 40);

      const [result, created] = await Result.findOrCreate({
        where: { student_id: student.id },
        defaults: {
          assessment_id: assessment.id,
          score_percentage: finalScore,
          grade,
          result_status: passed ? "passed" : "failed",
          status: "published",
          published_at: publishedAt,
          published_by: job.created_by || null,
          remarks:
            payload.result_remarks ||
            "Result published through bulk automation",
        },
      });

      if (!created) {
        await result.update({
          assessment_id: assessment.id,
          score_percentage: finalScore,
          grade,
          result_status: passed ? "passed" : "failed",
          status: "published",
          published_at: publishedAt,
          published_by: job.created_by || null,
          remarks: payload.result_remarks || result.remarks,
        });
      }

      const marksheetResult =
        await bulkPdfDocumentService.generateAssessmentMarksheet({
          student,
          assessment,
          result,
          generatedAt: publishedAt,
          percentage: finalScore,
          grade,
          resultStatus: result.result_status,
          performance: assessment.overall_performance,
        });

      await this.saveGeneratedDocument(
        student.id,
        "assessment_marksheet",
        marksheetResult.file_url,
        job,
        {
          generated_at: publishedAt,
          assessment_id: assessment.id,
          result_id: result.id,
          percentage: finalScore,
          grade,
        }
      );

      processed += 1;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, studentCount);
      }
    }

    const result = {
      students: studentCount,
      results_published: studentCount,
      published_at: publishedAt.toISOString(),
    };

    if (!options.silent) {
      await this.updateProgress(job, studentCount, studentCount, result);
    }
    return result;
  }

  /* -------------------- Document helper -------------------- */

  studentFolder(student) {
    return sanitizeName(
      student.registration_number ||
        student.student_id ||
        `student-${student.id}`
    );
  }

  async saveGeneratedDocument(studentId, type, fileUrl, job, metadata = {}) {
    const [document, created] = await GeneratedDocument.findOrCreate({
      where: { student_id: studentId, type },
      defaults: {
        file_url: fileUrl,
        generated_at: metadata.generated_at || new Date(),
        generated_by: job.created_by || null,
        metadata_json: metadata,
      },
    });

    if (!created) {
      await document.update({
        file_url: fileUrl,
        generated_at: metadata.generated_at || new Date(),
        generated_by: job.created_by || null,
        metadata_json: metadata,
      });
    }

    return document;
  }

  /* -------------------- Acceptance Letters -------------------- */

  async generateAcceptanceLetters(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const generatedAt = this.resolveDateTime(payload.generated_at);

    const files = [];
    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      const documentResult =
        await bulkPdfDocumentService.generateOfferLetter({
          student,
          generatedAt,
          letterReference: payload.letter_reference || null,
          internshipStartDate:
            payload.start_date || student.internship_start_date,
          internshipEndDate:
            payload.end_date || student.internship_end_date,
          totalHours: Number(
            payload.total_hours || student.domain?.duration_hours || 120
          ),
        });

      await this.saveGeneratedDocument(
        student.id,
        "acceptance_letter",
        documentResult.file_url,
        job,
        {
          generated_at: generatedAt,
          letter_reference: documentResult.letter_reference || null,
        }
      );

      files.push({
        student_id: student.id,
        file_url: documentResult.file_url,
      });

      processed += 1;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, studentCount);
      }
    }

    const result = {
      students: studentCount,
      acceptance_letters: files.length,
      files: capArray(files),
    };

    if (!options.silent) {
      await this.updateProgress(job, studentCount, studentCount, result);
    }
    return result;
  }

  /* -------------------- Attendance fetch helper -------------------- */

  async getAttendance(studentId, payload) {
    const where = { student_id: studentId };
    if (payload.start_date && payload.end_date) {
      where.date = { [Op.between]: [payload.start_date, payload.end_date] };
    }
    return Attendance.findAll({ where, order: [["date", "ASC"]] });
  }

  /* -------------------- Attendance Sheets -------------------- */

  async generateAttendanceSheets(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const generatedAt = this.resolveDateTime(payload.generated_at);

    const holidays = new Set(
      Array.isArray(payload.holidays)
        ? payload.holidays.map((h) => String(h).trim())
        : []
    );

    const files = [];
    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      const attendance = await this.getAttendance(student.id, payload);

      const validAttendance = attendance.filter((record) => {
        const dateStr = String(record.date).slice(0, 10);
        const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
        return dayOfWeek !== 0 && !holidays.has(dateStr);
      });

      const completedHours = validAttendance.reduce(
        (total, r) => total + Number(r.learning_hours || 0),
        0
      );

      const documentResult =
        await bulkPdfDocumentService.generateAttendanceLog({
          student,
          attendance: validAttendance,
          generatedAt,
          totalRequiredHours: Number(
            payload.total_hours || student.domain?.duration_hours || 120
          ),
          completedHours,
          supervisorName:
            student.mentor?.name || payload.supervisor_name || "Rahul Kumar",
          organizationName:
            payload.organization_name || "RKNEXORA PRIVATE LIMITED",
          officeAddress:
            payload.office_address ||
            "Biscuit Factory Road, Mithila Colony, Patna, Bihar 801503",
          organizationPhone: payload.organization_phone || "7544090878",
        });

      await this.saveGeneratedDocument(
        student.id,
        "attendance_sheet",
        documentResult.file_url,
        job,
        {
          generated_at: generatedAt,
          records: validAttendance.length,
          completed_hours: completedHours,
        }
      );

      files.push({ student_id: student.id, file_url: documentResult.file_url });
      processed += 1;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, studentCount);
      }
    }

    const result = {
      students: studentCount,
      attendance_sheets: files.length,
      files: capArray(files),
    };
    if (!options.silent) {
      await this.updateProgress(job, studentCount, studentCount, result);
    }
    return result;
  }

  /* -------------------- Logbooks -------------------- */

  async generateLogBooks(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const generatedAt = this.resolveDateTime(payload.generated_at);

    const holidays = new Set(
      Array.isArray(payload.holidays)
        ? payload.holidays.map((h) => String(h).trim())
        : []
    );

    const files = [];
    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      const attendance = await this.getAttendance(student.id, payload);

      const validAttendance = attendance.filter((record) => {
        const dateStr = String(record.date).slice(0, 10);
        const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
        return dayOfWeek !== 0 && !holidays.has(dateStr);
      });

      // Batch insert logbook entries
      const entriesToUpsert = validAttendance.map((record, index) => {
        const domainName = student.domain?.domain_name || "";
        const domainEntry = getDomainLogbookEntry(domainName, index);
        return {
          student_id: student.id,
          date: record.date,
          activity:
            domainEntry.activity ||
            record.remarks ||
            payload.daily_activity ||
            "Completed assigned learning modules and internship activities.",
          skills:
            domainEntry.skills ||
            payload.skills ||
            "Technical learning, communication and professional skills",
          hours_worked: record.learning_hours || 0,
        };
      });

      if (entriesToUpsert.length) {
        await Logbook.bulkCreate(entriesToUpsert, {
          updateOnDuplicate: ["activity", "skills", "hours_worked", "updated_at"],
        });
      }

      if (holidays.size > 0) {
        await Logbook.destroy({
          where: {
            student_id: student.id,
            date: { [Op.in]: Array.from(holidays) },
          },
        });
      }

      const entries = await Logbook.findAll({
        where: {
          student_id: student.id,
          ...(payload.start_date && payload.end_date
            ? { date: { [Op.between]: [payload.start_date, payload.end_date] } }
            : {}),
        },
        order: [["date", "ASC"]],
      });

      const documentResult = await bulkPdfDocumentService.generateLogbook({
        student,
        entries,
        generatedAt,
        supervisorName:
          student.mentor?.name || payload.supervisor_name || "Rahul Kumar",
      });

      await this.saveGeneratedDocument(
        student.id,
        "logbook",
        documentResult.file_url,
        job,
        { generated_at: generatedAt, entries: entries.length }
      );

      files.push({ student_id: student.id, file_url: documentResult.file_url });
      processed += 1;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, studentCount);
      }
    }

    const result = {
      students: studentCount,
      logbooks: files.length,
      files: capArray(files),
    };
    if (!options.silent) {
      await this.updateProgress(job, studentCount, studentCount, result);
    }
    return result;
  }

  /* -------------------- Internship Reports -------------------- */

  async generateInternshipReports(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const files = [];
    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      const domainName = student.domain?.domain_name || "";

      let sourcePdfPath = path.join(STATIC_REPORTS_DIR, `${domainName}.pdf`);

      if (!fs.existsSync(sourcePdfPath)) {
        try {
          const filesInDir = fs.readdirSync(STATIC_REPORTS_DIR);
          const matchedFile = filesInDir.find((file) => {
            const fileBase = file.replace(/\.pdf$/i, "").toLowerCase();
            const domainBase = domainName.toLowerCase();
            return (
              fileBase === domainBase ||
              fileBase.includes(domainBase) ||
              domainBase.includes(fileBase)
            );
          });
          if (matchedFile) {
            sourcePdfPath = path.join(STATIC_REPORTS_DIR, matchedFile);
          }
        } catch (err) {
          console.warn("[bulkJobRunner] Could not read static reports dir:", err.message);
        }
      }

      if (!fs.existsSync(sourcePdfPath)) {
        console.warn(
          `⚠️ [bulkJobRunner] Static PDF not found for domain: "${domainName}" (student ${student.id})`
        );
        processed += 1;
        if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
          await this.updateProgress(job, processed, studentCount);
        }
        continue;
      }

      const folder = this.studentFolder(student);
      const destinationDir = path.resolve("uploads", "generated", folder);
      ensureDir(destinationDir);

      const destinationPath = path.join(destinationDir, "internship-report.pdf");
      fs.copyFileSync(sourcePdfPath, destinationPath);
      const fileUrl = toPublicUrl(destinationPath);

      const [report, created] = await InternshipReport.findOrCreate({
        where: { student_id: student.id },
        defaults: {
          report_url: fileUrl,
          status: "approved",
          mentor_remarks:
            payload.report_remarks ||
            "Report generated through bulk automation",
        },
      });

      if (!created) {
        await report.update({
          report_url: fileUrl,
          status: "approved",
          mentor_remarks: payload.report_remarks || report.mentor_remarks,
        });
      }

      await this.saveGeneratedDocument(
        student.id,
        "internship_report",
        fileUrl,
        job,
        { generated_at: new Date() }
      );

      files.push({ student_id: student.id, file_url: fileUrl });
      processed += 1;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, studentCount);
      }
    }

    const response = {
      students: studentCount,
      internship_reports: files.length,
      files: capArray(files),
    };
    if (!options.silent) {
      await this.updateProgress(job, studentCount, studentCount, response);
    }
    return response;
  }

  /* -------------------- Certificates -------------------- */

  async generateCertificates(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const generatedAt = this.resolveDateTime(payload.generated_at);
    const issuedDate = payload.issued_date || generatedAt.toISOString().slice(0, 10);

    const files = [];
    const skipped = [];
    const failed = [];
    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      try {
        const eligibility = await getStudentEligibility(
          student.id,
          student.domain_id
        );

        if (!eligibility.eligible) {
          const reason =
            eligibility.reasons?.join(", ") ||
            eligibility.message ||
            "Student is not eligible for certificate";

          skipped.push({
            student_id: student.id,
            registration_number: student.registration_number,
            reason,
          });

          processed += 1;
          if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
            await this.updateProgress(job, processed, studentCount, undefined, {
              success_count: files.length,
              failed_count: skipped.length + failed.length,
            });
          }
          continue;
        }

        const certificateNumber = `${
          payload.certificate_prefix || "RKN"
        }-${new Date(issuedDate).getFullYear()}-${String(student.id).padStart(7, "0")}`;

        const verificationUrl = `${
          process.env.CLIENT_URL || "http://localhost:3000"
        }/verify-certificate/${encodeURIComponent(certificateNumber)}`;

        const documentResult =
          await bulkPdfDocumentService.generateCertificate({
            student,
            certificateNumber,
            verificationUrl,
            issuedDate,
            generatedAt,
            totalHours: Number(
              payload.total_hours || student.domain?.duration_hours || 120
            ),
          });

        if (!documentResult?.file_url) {
          throw new Error("Certificate PDF service did not return file_url");
        }

        const [certificate, created] = await Certificate.findOrCreate({
          where: { student_id: student.id },
          defaults: {
            certificate_number: certificateNumber,
            certificate_url: documentResult.file_url,
            qr_code_url: documentResult.qr_code_url,
            verification_url: verificationUrl,
            issued_date: issuedDate,
          },
        });

        if (!created) {
          await certificate.update({
            certificate_number: certificateNumber,
            certificate_url: documentResult.file_url,
            qr_code_url: documentResult.qr_code_url,
            verification_url: verificationUrl,
            issued_date: issuedDate,
          });
        }

        await student.update({
          certificate_generated: true,
          certificate_url: documentResult.file_url,
        });

        await this.saveGeneratedDocument(
          student.id,
          "certificate",
          documentResult.file_url,
          job,
          {
            generated_at: generatedAt,
            certificate_number: certificateNumber,
            qr_code_url: documentResult.qr_code_url,
            verification_url: verificationUrl,
          }
        );

        files.push({
          student_id: student.id,
          certificate_number: certificateNumber,
          certificate_url: documentResult.file_url,
          qr_code_url: documentResult.qr_code_url,
          verification_url: verificationUrl,
        });
      } catch (error) {
        console.error(
          `[bulkJobRunner] Certificate failed for student ${student.registration_number}:`,
          error
        );

        failed.push({
          student_id: student.id,
          registration_number: student.registration_number,
          error: error?.message || "Certificate generation failed",
        });
      }

      processed += 1;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, studentCount, undefined, {
          success_count: files.length,
          failed_count: skipped.length + failed.length,
        });
      }
    }

    const result = {
      students: studentCount,
      certificates: files.length,
      skipped_count: skipped.length,
      failed_count: failed.length,
      issued_date: issuedDate,
      files: capArray(files),
      skipped: capArray(skipped, 100),
      failed: capArray(failed, 100),
    };

    if (!options.silent) {
      await this.updateProgress(job, studentCount, studentCount, result, {
        success_count: files.length,
        failed_count: skipped.length + failed.length,
      });
    }
    return result;
  }

  /* -------------------- Department Certificates -------------------- */

  async generateDepartmentCertificates(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const generatedAt = this.resolveDateTime(payload.generated_at);

    const files = [];
    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      const documentResult =
        await bulkPdfDocumentService.generateDepartmentCertificate({
          student,
          generatedAt,
          totalHours: Number(
            payload.total_hours || student.domain?.duration_hours || 120
          ),
        });

      await this.saveGeneratedDocument(
        student.id,
        "department_certificate",
        documentResult.file_url,
        job,
        { generated_at: generatedAt }
      );

      files.push({ student_id: student.id, file_url: documentResult.file_url });
      processed += 1;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, studentCount);
      }
    }

    const result = {
      students: studentCount,
      department_certificates: files.length,
      files: capArray(files),
    };
    if (!options.silent) {
      await this.updateProgress(job, studentCount, studentCount, result);
    }
    return result;
  }

  /* -------------------- Consent Letters -------------------- */

  async generateConsentLetters(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };
    const generatedAt = this.resolveDateTime(payload.generated_at);

    const files = [];
    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      const documentResult =
        await bulkPdfDocumentService.generateConsentLetter({
          student,
          generatedAt,
          totalHours: Number(
            payload.total_hours || student.domain?.duration_hours || 120
          ),
        });

      await this.saveGeneratedDocument(
        student.id,
        "consent_letter",
        documentResult.file_url,
        job,
        { generated_at: generatedAt }
      );

      files.push({ student_id: student.id, file_url: documentResult.file_url });
      processed += 1;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, studentCount);
      }
    }

    const result = {
      students: studentCount,
      consent_letters: files.length,
      files: capArray(files),
    };
    if (!options.silent) {
      await this.updateProgress(job, studentCount, studentCount, result);
    }
    return result;
  }

  /* -------------------- ZIP -------------------- */

  resolveFilePath(url) {
    if (!url) return null;
    const localPath = String(url)
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/+/, "");
    return path.resolve(localPath);
  }

  addFileToArchive(archive, url, archiveName) {
    const absolutePath = this.resolveFilePath(url);
    if (!absolutePath || !fs.existsSync(absolutePath)) return false;
    archive.file(absolutePath, { name: archiveName });
    return true;
  }

  async generateZip(job, options = {}) {
    const payload = { ...(job.payload || {}), ...(options.payload || {}) };

    ensureDir(ZIP_ROOT);

    const zipPath = path.join(ZIP_ROOT, `${job.job_uuid}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    /*
     * ✅ PRODUCTION FIX: Attach listeners BEFORE piping/finalize.
     * Original code attached 'close' AFTER finalize -> hangs forever.
     */
    const closePromise = new Promise((resolve, reject) => {
      output.on("close", () => {
        resolve({ size: archive.pointer() });
      });
      output.on("error", reject);
      archive.on("error", reject);
      archive.on("warning", (err) => {
        if (err.code === "ENOENT") {
          console.warn("[bulkJobRunner] Archive warning:", err.message);
        } else {
          reject(err);
        }
      });
    });

    archive.pipe(output);

    let fileCount = 0;
    let processed = 0;
    let studentCount = 0;

    for await (const student of this.iterateStudents(payload)) {
      studentCount += 1;
      if (studentCount % CANCEL_CHECK_EVERY === 0) {
        await this.assertNotCancelled(job);
      }

      const folder = this.studentFolder(student);

      const documents = await GeneratedDocument.findAll({
        where: { student_id: student.id },
      });

      for (const document of documents) {
        const extension = path.extname(document.file_url || "") || ".pdf";

        if (
          this.addFileToArchive(
            archive,
            document.file_url,
            `${folder}/generated/${document.type}${extension}`
          )
        ) {
          fileCount += 1;
        }

        const metadata = document.metadata_json || {};
        if (
          metadata.qr_code_url &&
          this.addFileToArchive(
            archive,
            metadata.qr_code_url,
            `${folder}/generated/certificate-qr.png`
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
          `${folder}/photo${path.extname(student.photo)}`
        )
      ) {
        fileCount += 1;
      }

      const submissions = await Submission.findAll({
        where: { student_id: student.id },
      });
      submissions.forEach((submission, index) => {
        if (
          this.addFileToArchive(
            archive,
            submission.file_url,
            `${folder}/submissions/submission-${index + 1}${path.extname(
              submission.file_url || ""
            )}`
          )
        ) {
          fileCount += 1;
        }
      });

      const projects = await LiveProject.findAll({
        where: { student_id: student.id },
      });
      projects.forEach((project, index) => {
        if (
          this.addFileToArchive(
            archive,
            project.report_url,
            `${folder}/projects/project-${index + 1}${path.extname(
              project.report_url || ""
            )}`
          )
        ) {
          fileCount += 1;
        }
      });

      processed += 1;
      if (!options.silent && processed % PROGRESS_UPDATE_EVERY === 0) {
        await this.updateProgress(job, processed, studentCount);
      }
    }

    // ✅ finalize ke baad hi wait
    await archive.finalize();
    await closePromise;

    const result = {
      students: studentCount,
      files: fileCount,
      zip_url: toPublicUrl(zipPath),
      zip_size_bytes: fs.existsSync(zipPath) ? fs.statSync(zipPath).size : 0,
    };

    if (!options.silent) {
      await this.updateProgress(job, studentCount, studentCount, result);
    }
    return result;
  }

  /* -------------------- Full process -------------------- */

  async runFullProcess(job) {
    const payload = job.payload || {};

    const steps = [
      { name: "consent_letters", run: () => this.generateConsentLetters(job, { payload, silent: true }) },
      { name: "acceptance_letters", run: () => this.generateAcceptanceLetters(job, { payload, silent: true }) },
      { name: "attendance", run: () => this.generateAttendance(job, { payload, silent: true }) },
      { name: "complete_learning", run: () => this.completeLearning(job, { payload, silent: true }) },
      { name: "quiz_attempts_and_submissions", run: () => this.generateQuizAttemptsAndSubmissions(job, { payload, silent: true }) },
      { name: "assessment", run: () => this.generateAssessment(job, { payload, silent: true }) },
      { name: "publish_results", run: () => this.publishResults(job, { payload, silent: true }) },
      { name: "attendance_sheets", run: () => this.generateAttendanceSheets(job, { payload, silent: true }) },
      { name: "log_books", run: () => this.generateLogBooks(job, { payload, silent: true }) },
      { name: "internship_reports", run: () => this.generateInternshipReports(job, { payload, silent: true }) },
      { name: "complete_internship", run: () => this.completeInternship(job, { payload, silent: true }) },
      { name: "department_certificates", run: () => this.generateDepartmentCertificates(job, { payload, silent: true }) },
      { name: "certificates", run: () => this.generateCertificates(job, { payload, silent: true }) },
      { name: "zip_documents", run: () => this.generateZip(job, { payload, silent: true }) },
    ];

    const completed = [];
    const failed = [];

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      await this.assertNotCancelled(job);
      await this.setCurrentStep(job, this.getJobStepLabel(step.name));

      try {
        const result = await step.run();
        completed.push({ name: step.name, result: this._sanitizeResult(result) });
      } catch (error) {
        if (error instanceof BulkJobCancelledError) throw error;

        failed.push({
          name: step.name,
          error: String(error?.message || "Step failed").slice(0, 500),
        });

        if (payload.stop_on_error !== false) throw error;
      }

      await this.updateProgress(job, index + 1, steps.length, undefined, {
        success_count: completed.length,
        failed_count: failed.length,
      });
    }

    const zipStep = completed.find((s) => s.name === "zip_documents");
    const result = {
      completed_steps: completed.length,
      failed_steps: failed.length,
      completed,
      failed: capArray(failed, 100),
      zip_url: zipStep?.result?.zip_url || null,
    };

    await this.updateProgress(job, steps.length, steps.length, result);
    return result;
  }
}

export const bulkJobRunner = new BulkJobRunner();