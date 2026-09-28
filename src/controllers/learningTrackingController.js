import { Op } from "sequelize";
import {
  Student,
  Module,
  Chapter,
  ChapterResource,
  LiveClass,
} from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";
import {
  getChapterLearningRequirements,
} from "../services/learningTrackingService.js";

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

/*
|--------------------------------------------------------------------------
| GET /student/chapters/:chapterId/requirements
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

  /*
  |--------------------------------------------------------------------------
  | EMPTY CHAPTER CHECK
  |--------------------------------------------------------------------------
  */
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

  /*
  |--------------------------------------------------------------------------
  | NORMAL CHAPTER
  |--------------------------------------------------------------------------
  */
  const requirements = await getChapterLearningRequirements({
    studentId: student.id,
    chapterId,
  });

  return ok(res, requirements);
});