import crypto from "crypto";
import { Op } from "sequelize";
import {
  Student,
  Module,
  Chapter,
  ChapterResource,
  LiveClass,
  LiveClassAttendanceSession,
  StudentLiveClassProgress,
} from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";
import {
  getChapterLearningRequirements,
} from "../services/learningTrackingService.js";

const LIVE_MAX_CREDIT = 45;

/*
|--------------------------------------------------------------------------
| CHAPTER ENGAGEMENT HEARTBEAT (DISABLED)
|--------------------------------------------------------------------------
*/
export const chapterEngagementHeartbeat = asyncHandler(
  async (req, res) => {
    const chapterId = Number(req.params.chapterId);

    return ok(res, {
      chapter_id: chapterId,
      required: false,
      can_mark_complete: true,
      is_empty_chapter: false,
      is_completed: true,
      reason: "Chapter engagement tracking disabled",
    });
  },
);

const getStudent = async (req) => {
  const student = await Student.findByPk(req.user?.id);
  if (!student) throw new AppError("Student profile not found", 404);
  if (student.internship_status === "blocked")
    throw new AppError("Student account is blocked", 403);
  return student;
};

const pct = (done, total) => {
  const d = Number(done || 0),
    t = Number(total || 0);
  if (t <= 0) return 0;
  return Number(Math.min(100, Math.max(0, (d / t) * 100)).toFixed(2));
};

/*
|--------------------------------------------------------------------------
| LIVE CLASS HELPERS
|--------------------------------------------------------------------------
*/
const getLive = async (student, id) => {
  const liveClass = await LiveClass.findByPk(id);
  if (!liveClass) throw new AppError("Live class not found", 404);
  if (Number(liveClass.domain_id) !== Number(student.domain_id))
    throw new AppError("This live class is not assigned to your domain", 403);
  if (liveClass.status === "cancelled")
    throw new AppError("This live class has been cancelled", 409);
  return liveClass;
};

const aggregateLive = async (studentId, liveClass) => {
  const sessions = await LiveClassAttendanceSession.findAll({
    where: { student_id: studentId, live_class_id: liveClass.id },
    attributes: ["attended_seconds"],
  });
  const duration = Math.max(1, Number(liveClass.duration_minutes || 60)) * 60;
  const attended = Math.min(
    duration,
    sessions.reduce((sum, x) => sum + Number(x.attended_seconds || 0), 0),
  );
  const percentage = pct(attended, duration);
  const completed = percentage >= 80;

  const [progress] = await StudentLiveClassProgress.findOrCreate({
    where: { student_id: studentId, live_class_id: liveClass.id },
    defaults: {
      module_id: liveClass.module_id || null,
      chapter_id: liveClass.chapter_id || null,
      duration_seconds: duration,
      attended_seconds: attended,
      attendance_percentage: percentage,
      is_completed: completed,
      completed_at: completed ? new Date() : null,
    },
  });
  await progress.update({
    module_id: liveClass.module_id || null,
    chapter_id: liveClass.chapter_id || null,
    duration_seconds: duration,
    attended_seconds: attended,
    attendance_percentage: percentage,
    is_completed: completed,
    completed_at: completed ? progress.completed_at || new Date() : null,
  });
  return progress;
};

/*
|--------------------------------------------------------------------------
| LIVE CLASS ROUTES (Rakhe hue hain — sirf tracking ke liye)
|--------------------------------------------------------------------------
*/
export const joinLiveClass = asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  const id = Number(req.params.id);
  const liveClass = await getLive(student, id);
  const now = new Date();
  const start = new Date(liveClass.scheduled_at);
  const end = new Date(
    start.getTime() +
      Math.max(1, Number(liveClass.duration_minutes || 60)) * 60000,
  );
  if (now < new Date(start.getTime() - 10 * 60000))
    throw new AppError("Join opens 10 minutes before the live class.", 409);
  if (now > end) throw new AppError("This live class has ended.", 409);

  await LiveClassAttendanceSession.update(
    { is_active: false, left_at: now },
    { where: { student_id: student.id, live_class_id: id, is_active: true } },
  );
  const session = await LiveClassAttendanceSession.create({
    student_id: student.id,
    live_class_id: id,
    session_token: crypto.randomBytes(24).toString("hex"),
    joined_at: now,
    last_heartbeat_at: now,
    attended_seconds: 0,
    is_active: true,
  });
  const progress = await aggregateLive(student.id, liveClass);
  return ok(res, {
    session_token: session.session_token,
    live_class_id: id,
    meeting_url: liveClass.meeting_url,
    scheduled_at: liveClass.scheduled_at,
    ends_at: end,
    duration_minutes: liveClass.duration_minutes,
    attended_seconds: Number(progress.attended_seconds || 0),
    attendance_percentage: Number(progress.attendance_percentage || 0),
    is_completed: Boolean(progress.is_completed),
  });
});

export const liveClassHeartbeat = asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  const id = Number(req.params.id);
  const token = String(req.body.session_token || "").trim();
  const liveClass = await getLive(student, id);
  const session = await LiveClassAttendanceSession.findOne({
    where: {
      student_id: student.id,
      live_class_id: id,
      session_token: token,
      is_active: true,
    },
  });
  if (!session)
    throw new AppError("Live attendance session is not active", 409);

  const now = new Date();
  const start = new Date(liveClass.scheduled_at);
  const end = new Date(
    start.getTime() +
      Math.max(1, Number(liveClass.duration_minutes || 60)) * 60000,
  );
  if (now > end) {
    await session.update({ is_active: false, left_at: end });
    const progress = await aggregateLive(student.id, liveClass);
    return ok(res, {
      ended: true,
      attended_seconds: Number(progress.attended_seconds || 0),
      attendance_percentage: Number(progress.attendance_percentage || 0),
      is_completed: Boolean(progress.is_completed),
    });
  }

  let attended = Number(session.attended_seconds || 0);
  if (session.last_heartbeat_at && now >= start) {
    const delta =
      (now.getTime() - new Date(session.last_heartbeat_at).getTime()) / 1000;
    if (delta > 0 && delta <= LIVE_MAX_CREDIT) attended += Math.floor(delta);
  }
  await session.update({ attended_seconds: attended, last_heartbeat_at: now });
  const progress = await aggregateLive(student.id, liveClass);
  return ok(res, {
    ended: false,
    attended_seconds: Number(progress.attended_seconds || 0),
    attendance_percentage: Number(progress.attendance_percentage || 0),
    is_completed: Boolean(progress.is_completed),
  });
});

export const leaveLiveClass = asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  const id = Number(req.params.id);
  const token = String(req.body.session_token || "").trim();
  const liveClass = await getLive(student, id);
  const session = await LiveClassAttendanceSession.findOne({
    where: {
      student_id: student.id,
      live_class_id: id,
      session_token: token,
      is_active: true,
    },
  });
  if (session) await session.update({ is_active: false, left_at: new Date() });
  const progress = await aggregateLive(student.id, liveClass);
  return ok(res, {
    attended_seconds: Number(progress.attended_seconds || 0),
    attendance_percentage: Number(progress.attendance_percentage || 0),
    is_completed: Boolean(progress.is_completed),
  });
});

/*
|--------------------------------------------------------------------------
| CHAPTER REQUIREMENTS
|--------------------------------------------------------------------------
*/
export const chapterRequirements = asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  const chapterId = Number(req.params.chapterId);

  const chapter = await Chapter.findOne({
    where: { id: chapterId },
    include: [
      {
        model: Module,
        required: true,
        where: { domain_id: student.domain_id },
        attributes: ["id"],
      },
    ],
  });

  if (!chapter) {
    throw new AppError("Chapter not found for your domain", 404);
  }

  const totalResources = await ChapterResource.count({
    where: {
      chapter_id: chapterId,
      status: "active",
    },
  });

  const totalLiveClasses = await LiveClass.count({
    where: {
      chapter_id: chapterId,
      status: { [Op.ne]: "cancelled" },
    },
  });

  if (totalResources + totalLiveClasses === 0) {
    return ok(res, {
      chapter_id: chapterId,
      has_resources: false,
      can_mark_complete: false,
      is_empty_chapter: true,
      reason:
        "Is chapter me abhi koi resource nahi hai, isliye mark complete available nahi hai.",
      quiz: null,
      summary: {
        total_resources: 0,
        total_live_classes: 0,
        quiz_required: false,
        quiz_passed: false,
        learning_requirements_complete: false,
      },
    });
  }

  const requirements = await getChapterLearningRequirements({
    studentId: student.id,
    chapterId,
  });

  return ok(res, requirements);
});