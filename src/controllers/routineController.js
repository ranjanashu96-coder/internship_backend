import fs from "fs";
import path from "path";
import { Op } from "sequelize";

import { Routine } from "../models/index.js";
import { AppError, ok } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const normalizeFilePath = (filePath) => {
  const raw = String(filePath || "").trim();
  if (!raw) return "";

  const normalized = raw.replace(/\\/g, "/");
  if (path.isAbsolute(raw)) {
    return path.relative(process.cwd(), raw).replace(/\\/g, "/");
  }

  return normalized.replace(/^\/+/, "");
};

const toRoutineResponse = (routine) => {
  const row = routine?.toJSON ? routine.toJSON() : routine;
  const relativePath = normalizeFilePath(row.file_path);

  return {
    ...row,
    file_path: relativePath,
    file_url: relativePath ? `/${relativePath}` : null,
  };
};

const removeFile = (filePath) => {
  if (!filePath) return;

  const relativePath = normalizeFilePath(filePath);
  const absolutePath = path.resolve(relativePath);
  const uploadsRoot = path.resolve("uploads");

  if (!absolutePath.startsWith(uploadsRoot)) return;

  fs.unlink(absolutePath, (error) => {
    if (error && error.code !== "ENOENT") {
      console.error("Routine file delete failed:", error.message);
    }
  });
};

const parsePublishedAt = (value, status) => {
  if (value === undefined) {
    return status === "active" ? new Date() : null;
  }

  if (value === null || String(value).trim() === "") {
    return status === "active" ? new Date() : null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("Invalid publish date", 422);
  }

  return parsed;
};

export const listAdminRoutines = asyncHandler(async (_req, res) => {
  const rows = await Routine.findAll({
    order: [
      ["published_at", "DESC"],
      ["id", "DESC"],
    ],
  });

  return ok(res, {
    routines: rows.map(toRoutineResponse),
  });
});

export const createRoutine = asyncHandler(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "").trim() || null;
  const status = String(req.body?.status || "active").trim().toLowerCase();

  if (!title) {
    if (req.file?.path) removeFile(req.file.path);
    throw new AppError("Routine title is required", 422);
  }

  if (!req.file) {
    throw new AppError("Routine file is required", 422);
  }

  if (!["active", "inactive"].includes(status)) {
    removeFile(req.file.path);
    throw new AppError("Invalid routine status", 422);
  }

  let publishedAt;
  try {
    publishedAt = parsePublishedAt(req.body?.published_at, status);
  } catch (error) {
    if (req.file?.path) removeFile(req.file.path);
    throw error;
  }

  const row = await Routine.create({
    title,
    description,
    file_path: normalizeFilePath(req.file.path),
    original_name: req.file.originalname,
    mime_type: req.file.mimetype,
    file_size: req.file.size,
    status,
    published_at: publishedAt,
    created_by: req.user?.id || null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return ok(
    res,
    { routine: toRoutineResponse(row) },
    "Routine uploaded successfully",
    201,
  );
});

export const updateRoutine = asyncHandler(async (req, res) => {
  const routineId = Number(req.params.id);
  if (!Number.isInteger(routineId) || routineId <= 0) {
    if (req.file?.path) removeFile(req.file.path);
    throw new AppError("Invalid routine ID", 422);
  }

  const row = await Routine.findByPk(routineId);
  if (!row) {
    if (req.file?.path) removeFile(req.file.path);
    throw new AppError("Routine not found", 404);
  }

  const payload = {
    updated_at: new Date(),
  };

  if (req.body?.title !== undefined) {
    const title = String(req.body.title || "").trim();
    if (!title) {
      if (req.file?.path) removeFile(req.file.path);
      throw new AppError("Routine title is required", 422);
    }
    payload.title = title;
  }

  if (req.body?.description !== undefined) {
    payload.description = String(req.body.description || "").trim() || null;
  }

  let nextStatus = row.status;
  if (req.body?.status !== undefined) {
    nextStatus = String(req.body.status || "").trim().toLowerCase();
    if (!["active", "inactive"].includes(nextStatus)) {
      if (req.file?.path) removeFile(req.file.path);
      throw new AppError("Invalid routine status", 422);
    }
    payload.status = nextStatus;
  }

  if (req.body?.published_at !== undefined) {
    try {
      payload.published_at = parsePublishedAt(req.body.published_at, nextStatus);
    } catch (error) {
      if (req.file?.path) removeFile(req.file.path);
      throw error;
    }
  } else if (nextStatus === "active" && !row.published_at) {
    payload.published_at = new Date();
  }

  const previousFilePath = row.file_path;
  if (req.file) {
    payload.file_path = normalizeFilePath(req.file.path);
    payload.original_name = req.file.originalname;
    payload.mime_type = req.file.mimetype;
    payload.file_size = req.file.size;
  }

  await row.update(payload);

  if (req.file && previousFilePath && previousFilePath !== row.file_path) {
    removeFile(previousFilePath);
  }

  return ok(
    res,
    { routine: toRoutineResponse(row) },
    "Routine updated successfully",
  );
});

export const deleteRoutine = asyncHandler(async (req, res) => {
  const routineId = Number(req.params.id);
  if (!Number.isInteger(routineId) || routineId <= 0) {
    throw new AppError("Invalid routine ID", 422);
  }

  const row = await Routine.findByPk(routineId);
  if (!row) {
    throw new AppError("Routine not found", 404);
  }

  const filePath = row.file_path;
  await row.destroy();
  removeFile(filePath);

  return ok(res, {}, "Routine deleted successfully");
});

export const listStudentRoutines = asyncHandler(async (_req, res) => {
  const now = new Date();

  const rows = await Routine.findAll({
    where: {
      status: "active",
      [Op.or]: [
        { published_at: null },
        { published_at: { [Op.lte]: now } },
      ],
    },
    order: [
      ["published_at", "DESC"],
      ["id", "DESC"],
    ],
  });

  return ok(res, {
    routines: rows.map(toRoutineResponse),
  });
});
