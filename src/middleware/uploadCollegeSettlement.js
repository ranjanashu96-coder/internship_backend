import fs from "fs";
import path from "path";
import multer from "multer";

import {
  AppError,
} from "../utils/response.js";

const uploadDirectory =
  path.resolve(
    "uploads/college-settlements",
  );

if (
  !fs.existsSync(
    uploadDirectory,
  )
) {
  fs.mkdirSync(
    uploadDirectory,
    {
      recursive: true,
    },
  );
}

const storage =
  multer.diskStorage({
    destination: (
      _req,
      _file,
      callback,
    ) => {
      callback(
        null,
        uploadDirectory,
      );
    },

    filename: (
      _req,
      file,
      callback,
    ) => {
      const extension =
        path.extname(
          file.originalname,
        ).toLowerCase();

      const filename =
        `college-payment-${Date.now()}-${Math.round(
          Math.random() * 1e9,
        )}${extension}`;

      callback(
        null,
        filename,
      );
    },
  });

const fileFilter = (
  _req,
  file,
  callback,
) => {
  const allowedMimeTypes =
    new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);

  const allowedExtensions =
    new Set([
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
    ]);

  const extension =
    path.extname(
      file.originalname,
    ).toLowerCase();

  if (
    !allowedMimeTypes.has(
      file.mimetype,
    ) ||
    !allowedExtensions.has(
      extension,
    )
  ) {
    return callback(
      new AppError(
        "Only PDF, JPG, PNG and WEBP receipt files are allowed",
        422,
      ),
    );
  }

  callback(null, true);
};

export const uploadCollegeSettlement =
  multer({
    storage,
    fileFilter,

    limits: {
      fileSize:
        10 * 1024 * 1024,
    },
  });
