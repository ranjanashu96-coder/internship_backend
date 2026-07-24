import fs from "fs";
import path from "path";
import multer from "multer";

import {
  AppError,
} from "../utils/response.js";

const uploadDirectory =
  path.resolve(
    "uploads/imports",
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
      req,
      file,
      callback,
    ) => {
      callback(
        null,
        uploadDirectory,
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

      const filename =
        `students-${Date.now()}-${Math.round(
          Math.random() * 1e9,
        )}${extension}`;

      callback(
        null,
        filename,
      );
    },
  });

const fileFilter = (
  req,
  file,
  callback,
) => {
  const extension =
    path.extname(
      file.originalname,
    ).toLowerCase();

  const allowedExtensions = [
    ".xlsx",
    ".xls",
  ];

  if (
    !allowedExtensions.includes(
      extension,
    )
  ) {
    return callback(
      new AppError(
        "Only XLSX and XLS files are allowed",
        422,
      ),
    );
  }

  callback(null, true);
};

export const upload =
  multer({
    storage,
    fileFilter,

    limits: {
      fileSize:
        10 * 1024 * 1024,
    },
  });