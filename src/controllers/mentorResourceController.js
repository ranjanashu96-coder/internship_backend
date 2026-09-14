import fs from "fs";
import { Op } from "sequelize";

import {
  Chapter,
  ChapterResource,
  Module,
} from "../models/index.js";

import {
  listChapterResources as adminListChapterResources,
  createChapterResource as adminCreateChapterResource,
  updateChapterResource as adminUpdateChapterResource,
  deleteChapterResource as adminDeleteChapterResource,
  reorderChapterResources as adminReorderChapterResources,
} from "./adminChapterResourceController.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";

const getMentor = (req) => {
  if (!req.mentor) {
    throw new AppError("Mentor profile not found", 404);
  }

  if (req.mentor.status !== "active") {
    throw new AppError("Mentor account is inactive", 403);
  }

  if (!req.mentor.domain_id) {
    throw new AppError("Mentor domain is not configured", 422);
  }

  return req.mentor;
};


const cleanupUploadedFile = (file) => {
  if (!file?.path) return;
  fs.unlink(file.path, () => {});
};

const parsePositiveId = (value, label) => {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(`Invalid ${label}`, 422);
  }

  return id;
};

const ensureChapterAccess = async (mentor, chapterId) => {
  const id = parsePositiveId(chapterId, "chapter id");

  const chapter = await Chapter.findByPk(id, {
    attributes: [
      "id",
      "module_id",
      "chapter_number",
      "chapter_name",
      "status",
    ],
  });

  if (!chapter) {
    throw new AppError("Chapter not found", 404);
  }

  const module = await Module.findByPk(chapter.module_id, {
    attributes: [
      "id",
      "domain_id",
      "module_number",
      "module_name",
    ],
  });

  if (
    !module ||
    Number(module.domain_id) !== Number(mentor.domain_id)
  ) {
    throw new AppError(
      "You are not allowed to manage resources for this chapter",
      403,
    );
  }

  return { chapter, module };
};

const ensureResourceAccess = async (mentor, resourceId) => {
  const id = parsePositiveId(resourceId, "resource id");

  const resource = await ChapterResource.findByPk(id);

  if (!resource) {
    throw new AppError("Resource not found", 404);
  }

  await ensureChapterAccess(mentor, resource.chapter_id);

  return resource;
};

export const mentorResourceChapters = asyncHandler(async (req, res) => {
  const mentor = getMentor(req);

  const modules = await Module.findAll({
    where: {
      domain_id: mentor.domain_id,
    },
    attributes: [
      "id",
      "domain_id",
      "module_number",
      "module_name",
    ],
    order: [
      ["module_number", "ASC"],
      ["id", "ASC"],
    ],
  });

  if (modules.length === 0) {
    return ok(
      res,
      { items: [] },
      "Resource chapters fetched successfully",
    );
  }

  const moduleIds = modules.map((module) => Number(module.id));

  const chapters = await Chapter.findAll({
    where: {
      module_id: {
        [Op.in]: moduleIds,
      },
    },
    attributes: [
      "id",
      "module_id",
      "chapter_number",
      "chapter_name",
      "status",
    ],
    order: [
      ["module_id", "ASC"],
      ["chapter_number", "ASC"],
      ["id", "ASC"],
    ],
  });

  const moduleMap = new Map(
    modules.map((module) => [
      Number(module.id),
      module.toJSON(),
    ]),
  );

  const items = chapters.map((chapter) => ({
    ...chapter.toJSON(),
    module:
      moduleMap.get(Number(chapter.module_id)) || null,
  }));

  return ok(
    res,
    { items },
    "Resource chapters fetched successfully",
  );
});

export const mentorChapterResources = async (req, res, next) => {
  try {
    const mentor = getMentor(req);
    await ensureChapterAccess(mentor, req.params.chapterId);
    return adminListChapterResources(req, res, next);
  } catch (error) {
    next(error);
  }
};

export const mentorCreateResource = async (req, res, next) => {
  try {
    const mentor = getMentor(req);
    await ensureChapterAccess(mentor, req.params.chapterId);
    return adminCreateChapterResource(req, res, next);
  } catch (error) {
    cleanupUploadedFile(req.file);
    next(error);
  }
};

export const mentorUpdateResource = async (req, res, next) => {
  try {
    const mentor = getMentor(req);
    await ensureResourceAccess(mentor, req.params.id);
    return adminUpdateChapterResource(req, res, next);
  } catch (error) {
    cleanupUploadedFile(req.file);
    next(error);
  }
};

export const mentorDeleteResource = async (req, res, next) => {
  try {
    const mentor = getMentor(req);
    await ensureResourceAccess(mentor, req.params.id);
    return adminDeleteChapterResource(req, res, next);
  } catch (error) {
    next(error);
  }
};

export const mentorReorderResources = async (req, res, next) => {
  try {
    const mentor = getMentor(req);
    await ensureChapterAccess(mentor, req.params.chapterId);
    return adminReorderChapterResources(req, res, next);
  } catch (error) {
    next(error);
  }
};
