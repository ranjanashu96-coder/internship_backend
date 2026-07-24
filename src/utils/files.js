import fs from "fs";
import path from "path";
import multer from "multer";
import { v4 as uuid } from "uuid";

export const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
export const uniqueName = (original) => `${Date.now()}-${uuid()}${path.extname(original).toLowerCase()}`;
export const upload = (folder, allowed, maxSize = 10 * 1024 * 1024) => {
  const dir = path.resolve("uploads", folder); ensureDir(dir);
  return multer({
    storage: multer.diskStorage({ destination: (_, __, cb) => cb(null, dir), filename: (_, file, cb) => cb(null, uniqueName(file.originalname)) }),
    limits: { fileSize: maxSize },
    fileFilter: (_, file, cb) => allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error(`Unsupported file type: ${file.mimetype}`))
  });
};
