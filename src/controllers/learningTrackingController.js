import crypto from "crypto";
import {
  Student,
  Module,
  Chapter,
  ChapterResource,
  LiveClass,
  StudentResourceProgress,
  LiveClassAttendanceSession,
  StudentLiveClassProgress,
  StudentChapterEngagement,
} from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";
import {
  VIDEO_COMPLETION_PERCENT,
  LIVE_ATTENDANCE_PERCENT,
  getChapterLearningRequirements,
} from "../services/learningTrackingService.js";

const VIDEO_MAX_GAP = 20;
const LIVE_MAX_CREDIT = 45;
const CHAPTER_MAX_CREDIT = 15;
const NON_VIDEO_REQUIRED_SECONDS =
  10 * 60;

  export const chapterEngagementHeartbeat =
  asyncHandler(async (req, res) => {
    const student =
      await getStudent(req);

    const chapterId =
      Number(req.params.chapterId);

    const chapter =
      await Chapter.findOne({
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

    /*
     * IMPORTANT:
     * 10 minute timer only applies
     * when chapter has NO video.
     */
    const videoCount =
      await ChapterResource.count({
        where: {
          chapter_id: chapterId,
          resource_type: "video",
          status: "active",
        },
      });

    if (videoCount > 0) {
      return ok(res, {
        required: false,
        reason:
          "Video tracking applies to this chapter",
      });
    }

    const visible =
      req.body.visible !== false;

    const now = new Date();

    let row =
      await StudentChapterEngagement.findOne({
        where: {
          student_id:
            student.id,

          chapter_id:
            chapterId,
        },
      });

    if (!row) {
      row =
        await StudentChapterEngagement.create(
          {
            student_id:
              student.id,

            chapter_id:
              chapterId,

            engaged_seconds: 0,

            last_heartbeat_at:
              now,

            is_completed:
              false,
          },
        );

      return ok(res, {
        chapter_id:
          chapterId,

        engaged_seconds: 0,

        required_seconds:
          NON_VIDEO_REQUIRED_SECONDS,

        remaining_seconds:
          NON_VIDEO_REQUIRED_SECONDS,

        is_completed: false,
      });
    }

    let engaged =
      Number(
        row.engaged_seconds || 0,
      );

    if (
      !row.is_completed &&
      visible &&
      row.last_heartbeat_at
    ) {
      const delta =
        (
          now.getTime() -
          new Date(
            row.last_heartbeat_at,
          ).getTime()
        ) / 1000;

      if (
        delta > 0 &&
        delta <=
          CHAPTER_MAX_CREDIT
      ) {
        engaged +=
          Math.floor(delta);
      }
    }

    engaged =
      Math.min(
        NON_VIDEO_REQUIRED_SECONDS,
        engaged,
      );

    const completed =
      engaged >=
      NON_VIDEO_REQUIRED_SECONDS;

    await row.update({
      engaged_seconds:
        engaged,

      last_heartbeat_at:
        now,

      is_completed:
        completed,

      completed_at:
        completed
          ? row.completed_at ||
            now
          : null,
    });

    return ok(res, {
      chapter_id:
        chapterId,

      engaged_seconds:
        engaged,

      required_seconds:
        NON_VIDEO_REQUIRED_SECONDS,

      remaining_seconds:
        Math.max(
          NON_VIDEO_REQUIRED_SECONDS -
            engaged,
          0,
        ),

      is_completed:
        completed,
    });
  });

const getStudent = async (req) => {
  const student = await Student.findByPk(req.user?.id);
  if (!student) throw new AppError("Student profile not found", 404);
  if (student.internship_status === "blocked") throw new AppError("Student account is blocked", 403);
  return student;
};

const pct = (done, total) => {
  const d = Number(done || 0), t = Number(total || 0);
  if (t <= 0) return 0;
  return Number(Math.min(100, Math.max(0, (d / t) * 100)).toFixed(2));
};

const getVideo = async (student, resourceId) => {
  const resource = await ChapterResource.findOne({
    where: { id: resourceId, resource_type: "video", status: "active" },
  });
  if (!resource) throw new AppError("Video resource not found", 404);
  const chapter = await Chapter.findOne({
    where: { id: resource.chapter_id },
    include: [{ model: Module, required: true, where: { domain_id: student.domain_id }, attributes: ["id"] }],
  });
  if (!chapter) throw new AppError("Video is not available for your domain", 403);
  return { resource, chapter };
};

export const resourceProgress = asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  const resourceId = Number(req.params.resourceId);
  const { resource } = await getVideo(student, resourceId);
  const row = await StudentResourceProgress.findOne({ where: { student_id: student.id, resource_id: resourceId } });
  const duration = Number(row?.duration_seconds || resource.duration_seconds || 0);
  const watched = Number(row?.watched_seconds || 0);
  const progress = pct(watched, duration);
  return ok(res, {
    resource_id: resourceId,
    chapter_id: Number(resource.chapter_id),
    duration_seconds: duration,
    watched_seconds: watched,
    last_position_seconds: Number(row?.last_position_seconds || 0),
    progress_percentage: progress,
    completion_required_percentage: VIDEO_COMPLETION_PERCENT,
    is_completed: Boolean(row?.is_completed) || (duration > 0 && progress >= VIDEO_COMPLETION_PERCENT),
  });
});

export const resourceHeartbeat = asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  const resourceId = Number(req.params.resourceId);
  const { resource, chapter } = await getVideo(student, resourceId);
  const now = new Date();
  let row = await StudentResourceProgress.findOne({ where: { student_id: student.id, resource_id: resourceId } });
  const configured = Math.max(0, Math.round(Number(resource.duration_seconds || 0)));
  const previous = Number(row?.duration_seconds || 0);
  const reported = Math.max(0, Math.round(Number(req.body.duration_seconds || 0)));
  const duration = Math.max(configured, previous, reported);
  if (duration <= 0) throw new AppError("Video duration is missing. Set duration_seconds for this resource.", 409);

  const position = Math.min(duration, Math.max(0, Number(req.body.position_seconds || 0)));
  const playing = req.body.playing === true;
  const visible = req.body.visible !== false;

  if (!row) {
    row = await StudentResourceProgress.create({
      student_id: student.id, chapter_id: Number(chapter.id), resource_id: resourceId,
      duration_seconds: duration, watched_seconds: 0, last_position_seconds: position,
      last_heartbeat_at: now, is_completed: false,
    });
    return ok(res, { resource_id: resourceId, chapter_id: Number(chapter.id), duration_seconds: duration, watched_seconds: 0, last_position_seconds: position, progress_percentage: 0, completion_required_percentage: VIDEO_COMPLETION_PERCENT, is_completed: false });
  }

  let watched = Number(row.watched_seconds || 0);
  if (!row.is_completed && playing && visible && row.last_heartbeat_at) {
    const serverDelta = (now.getTime() - new Date(row.last_heartbeat_at).getTime()) / 1000;
    const positionDelta = position - Number(row.last_position_seconds || 0);
    if (serverDelta > 0 && serverDelta <= VIDEO_MAX_GAP && positionDelta > 0 && positionDelta <= VIDEO_MAX_GAP + 2) {
      watched = Math.min(duration, watched + Math.min(serverDelta, positionDelta));
    }
  }

  const progress = pct(watched, duration);
  const completed = Boolean(row.is_completed) || progress >= VIDEO_COMPLETION_PERCENT;
  await row.update({
    chapter_id: Number(chapter.id), duration_seconds: duration, watched_seconds: watched,
    last_position_seconds: position, last_heartbeat_at: now, is_completed: completed,
    completed_at: completed ? row.completed_at || now : null,
  });
  return ok(res, { resource_id: resourceId, chapter_id: Number(chapter.id), duration_seconds: duration, watched_seconds: Number(watched.toFixed(2)), last_position_seconds: position, progress_percentage: progress, completion_required_percentage: VIDEO_COMPLETION_PERCENT, is_completed: completed });
});

const getLive = async (student, id) => {
  const liveClass = await LiveClass.findByPk(id);
  if (!liveClass) throw new AppError("Live class not found", 404);
  if (Number(liveClass.domain_id) !== Number(student.domain_id)) throw new AppError("This live class is not assigned to your domain", 403);
  if (liveClass.status === "cancelled") throw new AppError("This live class has been cancelled", 409);
  return liveClass;
};

const aggregateLive = async (studentId, liveClass) => {
  const sessions = await LiveClassAttendanceSession.findAll({
    where: { student_id: studentId, live_class_id: liveClass.id }, attributes: ["attended_seconds"],
  });
  const duration = Math.max(1, Number(liveClass.duration_minutes || 60)) * 60;
  const attended = Math.min(duration, sessions.reduce((sum, x) => sum + Number(x.attended_seconds || 0), 0));
  const percentage = pct(attended, duration);
  const completed = percentage >= LIVE_ATTENDANCE_PERCENT;
  const [progress] = await StudentLiveClassProgress.findOrCreate({
    where: { student_id: studentId, live_class_id: liveClass.id },
    defaults: { module_id: liveClass.module_id || null, chapter_id: liveClass.chapter_id || null, duration_seconds: duration, attended_seconds: attended, attendance_percentage: percentage, is_completed: completed, completed_at: completed ? new Date() : null },
  });
  await progress.update({ module_id: liveClass.module_id || null, chapter_id: liveClass.chapter_id || null, duration_seconds: duration, attended_seconds: attended, attendance_percentage: percentage, is_completed: completed, completed_at: completed ? progress.completed_at || new Date() : null });
  return progress;
};

export const joinLiveClass = asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  const id = Number(req.params.id);
  const liveClass = await getLive(student, id);
  const now = new Date();
  const start = new Date(liveClass.scheduled_at);
  const end = new Date(start.getTime() + Math.max(1, Number(liveClass.duration_minutes || 60)) * 60000);
  if (now < new Date(start.getTime() - 10 * 60000)) throw new AppError("Join opens 10 minutes before the live class.", 409);
  if (now > end) throw new AppError("This live class has ended.", 409);

  await LiveClassAttendanceSession.update({ is_active: false, left_at: now }, { where: { student_id: student.id, live_class_id: id, is_active: true } });
  const session = await LiveClassAttendanceSession.create({ student_id: student.id, live_class_id: id, session_token: crypto.randomBytes(24).toString("hex"), joined_at: now, last_heartbeat_at: now, attended_seconds: 0, is_active: true });
  const progress = await aggregateLive(student.id, liveClass);
  return ok(res, { session_token: session.session_token, live_class_id: id, meeting_url: liveClass.meeting_url, scheduled_at: liveClass.scheduled_at, ends_at: end, duration_minutes: liveClass.duration_minutes, attended_seconds: Number(progress.attended_seconds || 0), attendance_percentage: Number(progress.attendance_percentage || 0), attendance_required_percentage: LIVE_ATTENDANCE_PERCENT, is_completed: Boolean(progress.is_completed) });
});

export const liveClassHeartbeat = asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  const id = Number(req.params.id);
  const token = String(req.body.session_token || "").trim();
  const liveClass = await getLive(student, id);
  const session = await LiveClassAttendanceSession.findOne({ where: { student_id: student.id, live_class_id: id, session_token: token, is_active: true } });
  if (!session) throw new AppError("Live attendance session is not active", 409);

  const now = new Date();
  const start = new Date(liveClass.scheduled_at);
  const end = new Date(start.getTime() + Math.max(1, Number(liveClass.duration_minutes || 60)) * 60000);
  if (now > end) {
    await session.update({ is_active: false, left_at: end });
    const progress = await aggregateLive(student.id, liveClass);
    return ok(res, { ended: true, attended_seconds: Number(progress.attended_seconds || 0), attendance_percentage: Number(progress.attendance_percentage || 0), attendance_required_percentage: LIVE_ATTENDANCE_PERCENT, is_completed: Boolean(progress.is_completed) });
  }

  let attended = Number(session.attended_seconds || 0);
  if (session.last_heartbeat_at && now >= start) {
    const delta = (now.getTime() - new Date(session.last_heartbeat_at).getTime()) / 1000;
    if (delta > 0 && delta <= LIVE_MAX_CREDIT) attended += Math.floor(delta);
  }
  await session.update({ attended_seconds: attended, last_heartbeat_at: now });
  const progress = await aggregateLive(student.id, liveClass);
  return ok(res, { ended: false, attended_seconds: Number(progress.attended_seconds || 0), attendance_percentage: Number(progress.attendance_percentage || 0), attendance_required_percentage: LIVE_ATTENDANCE_PERCENT, is_completed: Boolean(progress.is_completed) });
});

export const leaveLiveClass = asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  const id = Number(req.params.id);
  const token = String(req.body.session_token || "").trim();
  const liveClass = await getLive(student, id);
  const session = await LiveClassAttendanceSession.findOne({ where: { student_id: student.id, live_class_id: id, session_token: token, is_active: true } });
  if (session) await session.update({ is_active: false, left_at: new Date() });
  const progress = await aggregateLive(student.id, liveClass);
  return ok(res, { attended_seconds: Number(progress.attended_seconds || 0), attendance_percentage: Number(progress.attendance_percentage || 0), attendance_required_percentage: LIVE_ATTENDANCE_PERCENT, is_completed: Boolean(progress.is_completed) });
});

export const chapterRequirements = asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  const chapterId = Number(req.params.chapterId);
  const chapter = await Chapter.findOne({ where: { id: chapterId }, include: [{ model: Module, required: true, where: { domain_id: student.domain_id }, attributes: ["id"] }] });
  if (!chapter) throw new AppError("Chapter not found for your domain", 404);
  return ok(res, await getChapterLearningRequirements({ studentId: student.id, chapterId }));
});
