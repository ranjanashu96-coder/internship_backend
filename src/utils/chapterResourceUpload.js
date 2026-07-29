import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const uploadPath =
  path.resolve(
    "uploads",
    "chapter-resources",
  );

if (
  !fs.existsSync(
    uploadPath,
  )
) {
  fs.mkdirSync(
    uploadPath,
    {
      recursive: true,
    },
  );
}

const storage =
  multer.diskStorage({
    destination: (
      req,
      file,
      callback,
    ) => {
      callback(
        null,
        uploadPath,
      );
    },

    filename: (
      req,
      file,
      callback,
    ) => {
      const extension =
        path.extname(
          file.originalname,
        );

      const fileName =
        `${Date.now()}-${crypto.randomUUID()}${extension}`;

      callback(
        null,
        fileName,
      );
    },
  });

export const chapterResourceUpload =
  multer({
    storage,

    limits: {
      files: 20,

      fileSize:
        500 *
        1024 *
        1024,
    },
  });