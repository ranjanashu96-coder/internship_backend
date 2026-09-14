import { Op } from "sequelize";

import {
  Quiz,
  Chapter,
  Module,
} from "../models/index.js";

import {
  getQuizById as adminGetQuizById,
  createQuiz as adminCreateQuiz,
  updateQuiz as adminUpdateQuiz,
  deleteQuiz as adminDeleteQuiz,
} from "./adminQuizController.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";

const getMentor = (req) => {
  if (!req.mentor) throw new AppError("Mentor profile not found", 404);
  if (req.mentor.status !== "active") throw new AppError("Mentor account is inactive", 403);
  if (!req.mentor.domain_id) throw new AppError("Mentor domain is not configured", 422);
  return req.mentor;
};

const ensureChapterAccess = async (mentor, chapterId) => {
  const chapter = await Chapter.findByPk(chapterId);
  if (!chapter) throw new AppError("Chapter not found", 404);

  const module = await Module.findByPk(chapter.module_id);
  if (!module || Number(module.domain_id) !== Number(mentor.domain_id)) {
    throw new AppError("You are not allowed to manage quizzes for this chapter", 403);
  }

  return { chapter, module };
};

const ensureQuizAccess = async (mentor, quizId) => {
  const quiz = await Quiz.findByPk(quizId);
  if (!quiz) throw new AppError("Quiz not found", 404);
  await ensureChapterAccess(mentor, quiz.chapter_id);
  return quiz;
};

export const mentorQuizList =
  asyncHandler(
    async (req, res) => {
      const mentor = getMentor(req);

      const modules = await Module.findAll({
        where: { domain_id: mentor.domain_id },
        attributes: ["id"],
      });

      const moduleIds = modules.map((module) => Number(module.id));

      if (moduleIds.length === 0) {
        return ok(
          res,
          { items: [], total: 0 },
          "Mentor quizzes fetched successfully",
        );
      }

      const chapters = await Chapter.findAll({
        where: { module_id: { [Op.in]: moduleIds } },
        attributes: ["id"],
      });

      const chapterIds = chapters.map((chapter) => Number(chapter.id));

      if (chapterIds.length === 0) {
        return ok(
          res,
          { items: [], total: 0 },
          "Mentor quizzes fetched successfully",
        );
      }

      const quizzes = await Quiz.findAll({
        where: { chapter_id: { [Op.in]: chapterIds } },
        include: [
          {
            model: Chapter,
            as: "chapter",
            attributes: [
              "id",
              "chapter_number",
              "chapter_name",
              "module_id",
            ],
            include: [
              {
                model: Module,
                attributes: [
                  "id",
                  "module_number",
                  "module_name",
                  "domain_id",
                ],
              },
            ],
          },
        ],
        order: [["id", "DESC"]],
      });

      return ok(
        res,
        { items: quizzes, total: quizzes.length },
        "Mentor quizzes fetched successfully",
      );
    },
  );

export const mentorQuizById = async (req, res, next) => {
  try {
    const mentor = getMentor(req);
    await ensureQuizAccess(mentor, Number(req.params.id));
    return adminGetQuizById(req, res, next);
  } catch (error) {
    next(error);
  }
};

export const mentorCreateQuiz = async (req, res, next) => {
  try {
    const mentor = getMentor(req);
    await ensureChapterAccess(mentor, Number(req.body?.chapter_id));
    return adminCreateQuiz(req, res, next);
  } catch (error) {
    next(error);
  }
};

export const mentorUpdateQuiz = async (req, res, next) => {
  try {
    const mentor = getMentor(req);
    const quiz = await ensureQuizAccess(mentor, Number(req.params.id));
    if (req.body?.chapter_id !== undefined) {
      await ensureChapterAccess(mentor, Number(req.body.chapter_id));
    } else {
      req.body = { ...req.body, chapter_id: quiz.chapter_id };
    }
    return adminUpdateQuiz(req, res, next);
  } catch (error) {
    next(error);
  }
};

export const mentorDeleteQuiz = async (req, res, next) => {
  try {
    const mentor = getMentor(req);
    await ensureQuizAccess(mentor, Number(req.params.id));
    return adminDeleteQuiz(req, res, next);
  } catch (error) {
    next(error);
  }
};

export const mentorQuizChapters = asyncHandler(async (req, res) => {
  const mentor = getMentor(req);
  const modules = await Module.findAll({
    where: { domain_id: mentor.domain_id },
    attributes: ["id", "domain_id", "module_number", "module_name"],
    order: [["module_number", "ASC"], ["id", "ASC"]],
  });

  if (modules.length === 0) {
    return ok(res, { items: [] }, "Quiz chapters fetched successfully");
  }

  const moduleIds = modules.map((row) => Number(row.id));
  const chapters = await Chapter.findAll({
    where: { module_id: { [Op.in]: moduleIds } },
    attributes: ["id", "module_id", "chapter_number", "chapter_name", "status"],
    order: [["module_id", "ASC"], ["chapter_number", "ASC"], ["id", "ASC"]],
  });

  const quizRows = await Quiz.findAll({
    where: { chapter_id: { [Op.in]: chapters.map((row) => Number(row.id)) } },
    attributes: ["id", "chapter_id", "title", "status"],
  });
  const quizMap = new Map(quizRows.map((row) => [Number(row.chapter_id), row]));
  const moduleMap = new Map(modules.map((row) => [Number(row.id), row]));

  const items = chapters.map((chapter) => ({
    id: chapter.id,
    module_id: chapter.module_id,
    chapter_number: chapter.chapter_number,
    chapter_name: chapter.chapter_name,
    status: chapter.status,
    module: moduleMap.get(Number(chapter.module_id)) || null,
    quiz: quizMap.get(Number(chapter.id)) || null,
  }));

  ok(res, { items }, "Quiz chapters fetched successfully");
});
