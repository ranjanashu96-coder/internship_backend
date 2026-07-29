import {
  Op,
} from "sequelize";

import fs from "fs";
import path from "path";

import {
  Chapter,
  ChapterResource,
  Module,
  Domain,
} from "../models/index.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  AppError,
  ok,
} from "../utils/response.js";

const RESOURCE_TYPES = [
  "video",
  "pdf",
  "ppt",
  "document",
  "image",
  "audio",
  "text",
  "link",
  "zip",
  "source_code",
  "other",
];

const uploadRoot =
  path.resolve(
    "uploads",
    "chapter-resources",
  );

const removeUploadedFile = (
  file,
) => {
  if (!file?.path) {
    return;
  }

  fs.unlink(
    file.path,
    () => {},
  );
};

const removeStoredFile = (
  fileUrl,
) => {
  if (!fileUrl) {
    return;
  }

  const relativePath =
    String(fileUrl)
      .replace(
        /^https?:\/\/[^/]+/i,
        "",
      )
      .replace(
        /^\/+/,
        "",
      );

  const absolutePath =
    path.resolve(
      relativePath,
    );

  if (
    absolutePath.startsWith(
      uploadRoot,
    )
  ) {
    fs.unlink(
      absolutePath,
      () => {},
    );
  }
};

const parseBoolean = (
  value,
  defaultValue = false,
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return defaultValue;
  }

  return [
    true,
    "true",
    "1",
    1,
  ].includes(value);
};

const validateUrl = (
  value,
) => {
  const url =
    String(
      value || "",
    ).trim();

  if (!url) {
    throw new AppError(
      "लिंक आवश्यक है",
      422,
    );
  }

  try {
    const parsed =
      new URL(url);

    if (
      ![
        "http:",
        "https:",
      ].includes(
        parsed.protocol,
      )
    ) {
      throw new Error();
    }

    return parsed.toString();
  } catch {
    throw new AppError(
      "सही HTTP या HTTPS लिंक दर्ज करें",
      422,
    );
  }
};

const validateResource = ({
  resourceType,
  file,
  externalUrl,
  textContent,
}) => {
  if (
    !RESOURCE_TYPES.includes(
      resourceType,
    )
  ) {
    throw new AppError(
      "संसाधन का प्रकार सही नहीं है",
      422,
    );
  }

  if (
    resourceType === "link"
  ) {
    validateUrl(
      externalUrl,
    );

    if (file) {
      throw new AppError(
        "लिंक संसाधन के साथ फाइल अपलोड नहीं की जा सकती",
        422,
      );
    }

    return;
  }

  if (
    resourceType === "text"
  ) {
    if (
      !String(
        textContent || "",
      ).trim() &&
      !file
    ) {
      throw new AppError(
        "लिखित नोट्स या टेक्स्ट फाइल आवश्यक है",
        422,
      );
    }

    return;
  }

  if (!file) {
    throw new AppError(
      "संसाधन की फाइल आवश्यक है",
      422,
    );
  }
};

export const listChapterResources =
  asyncHandler(
    async (req, res) => {
      const chapterId =
        Number(
          req.params.chapterId,
        );

      if (
        !Number.isInteger(
          chapterId,
        ) ||
        chapterId <= 0
      ) {
        throw new AppError(
          "अध्याय आईडी सही नहीं है",
          422,
        );
      }

      const chapter =
        await Chapter.findByPk(
          chapterId,
          {
            attributes: [
              "id",
              "module_id",
              "chapter_number",
              "chapter_name",
              "description",
              "duration_minutes",
              "status",
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

                include: [
                  {
                    model: Domain,

                    attributes: [
                      "id",
                      "domain_name",
                    ],
                  },
                ],
              },
            ],
          },
        );

      if (!chapter) {
        throw new AppError(
          "अध्याय नहीं मिला",
          404,
        );
      }

      const resources =
        await ChapterResource.findAll({
          where: {
            chapter_id:
              chapterId,
          },

          order: [
            [
              "sort_order",
              "ASC",
            ],
            [
              "id",
              "ASC",
            ],
          ],
        });

      ok(
        res,
        {
          chapter,
          resources,
        },
        "अध्याय के संसाधन सफलतापूर्वक प्राप्त हुए",
      );
    },
  );

export const createChapterResource =
  asyncHandler(
    async (req, res) => {
      const file =
        req.file ||
        null;

      try {
        const chapterId =
          Number(
            req.params.chapterId,
          );

        const title =
          String(
            req.body.title ||
            "",
          ).trim();

        const resourceType =
          String(
            req.body.resource_type ||
            "",
          ).trim();

        if (
          !Number.isInteger(
            chapterId,
          ) ||
          chapterId <= 0
        ) {
          throw new AppError(
            "अध्याय आईडी सही नहीं है",
            422,
          );
        }

        if (!title) {
          throw new AppError(
            "संसाधन का शीर्षक आवश्यक है",
            422,
          );
        }

        const chapter =
          await Chapter.findByPk(
            chapterId,
          );

        if (!chapter) {
          throw new AppError(
            "अध्याय नहीं मिला",
            404,
          );
        }

        const externalUrl =
          req.body.external_url;

        const textContent =
          req.body.text_content;

        validateResource({
          resourceType,
          file,
          externalUrl,
          textContent,
        });

        const isPrimary =
          parseBoolean(
            req.body.is_primary,
            false,
          );

        if (isPrimary) {
          await ChapterResource.update(
            {
              is_primary: false,
            },
            {
              where: {
                chapter_id:
                  chapterId,
              },
            },
          );
        }

        const resource =
          await ChapterResource.create({
            chapter_id:
              chapterId,

            title,

            resource_type:
              resourceType,

            file_url:
              file
                ? `/uploads/chapter-resources/${file.filename}`
                : null,

            external_url:
              resourceType === "link"
                ? validateUrl(
                    externalUrl,
                  )
                : null,

            text_content:
              resourceType === "text"
                ? String(
                    textContent ||
                    "",
                  ).trim() ||
                  null
                : null,

            file_name:
              file?.originalname ||
              null,

            mime_type:
              file?.mimetype ||
              null,

            file_size:
              file?.size ||
              null,

            duration_seconds:
              Math.max(
                0,
                Number(
                  req.body.duration_seconds ||
                  0,
                ),
              ),

            sort_order:
              Math.max(
                1,
                Number(
                  req.body.sort_order ||
                  1,
                ),
              ),

            is_downloadable:
              parseBoolean(
                req.body.is_downloadable,
                true,
              ),

            is_primary:
              isPrimary,

            status:
              req.body.status ===
              "inactive"
                ? "inactive"
                : "active",
          });

        ok(
          res,
          resource,
          "संसाधन सफलतापूर्वक जोड़ा गया",
          201,
        );
      } catch (error) {
        removeUploadedFile(
          file,
        );

        throw error;
      }
    },
  );

export const updateChapterResource =
  asyncHandler(
    async (req, res) => {
      const file =
        req.file ||
        null;

      let fileSaved =
        false;

      try {
        const resource =
          await ChapterResource.findByPk(
            req.params.id,
          );

        if (!resource) {
          throw new AppError(
            "संसाधन नहीं मिला",
            404,
          );
        }

        const resourceType =
          req.body.resource_type ||
          resource.resource_type;

        const title =
          req.body.title !==
          undefined
            ? String(
                req.body.title,
              ).trim()
            : resource.title;

        if (!title) {
          throw new AppError(
            "संसाधन का शीर्षक आवश्यक है",
            422,
          );
        }

        const externalUrl =
          req.body.external_url !==
          undefined
            ? req.body.external_url
            : resource.external_url;

        const textContent =
          req.body.text_content !==
          undefined
            ? req.body.text_content
            : resource.text_content;

        if (
          resourceType === "link"
        ) {
          validateUrl(
            externalUrl,
          );
        }

        if (
          resourceType !== "link" &&
          resourceType !== "text" &&
          !file &&
          !resource.file_url
        ) {
          throw new AppError(
            "संसाधन की फाइल आवश्यक है",
            422,
          );
        }

        const oldFileUrl =
          resource.file_url;

        const isPrimary =
          req.body.is_primary !==
          undefined
            ? parseBoolean(
                req.body.is_primary,
                false,
              )
            : resource.is_primary;

        if (isPrimary) {
          await ChapterResource.update(
            {
              is_primary: false,
            },
            {
              where: {
                chapter_id:
                  resource.chapter_id,

                id: {
                  [Op.ne]:
                    resource.id,
                },
              },
            },
          );
        }

        const payload = {
          title,

          resource_type:
            resourceType,

          duration_seconds:
            req.body.duration_seconds !==
            undefined
              ? Math.max(
                  0,
                  Number(
                    req.body.duration_seconds,
                  ),
                )
              : resource.duration_seconds,

          sort_order:
            req.body.sort_order !==
            undefined
              ? Math.max(
                  1,
                  Number(
                    req.body.sort_order,
                  ),
                )
              : resource.sort_order,

          is_downloadable:
            req.body.is_downloadable !==
            undefined
              ? parseBoolean(
                  req.body.is_downloadable,
                )
              : resource.is_downloadable,

          is_primary:
            isPrimary,

          status:
            req.body.status ===
            "inactive"
              ? "inactive"
              : "active",
        };

        if (
          resourceType === "link"
        ) {
          payload.external_url =
            validateUrl(
              externalUrl,
            );

          payload.file_url =
            null;

          payload.file_name =
            null;

          payload.mime_type =
            null;

          payload.file_size =
            null;

          payload.text_content =
            null;
        } else if (
          resourceType === "text"
        ) {
          payload.text_content =
            String(
              textContent ||
              "",
            ).trim() ||
            null;

          payload.external_url =
            null;

          if (file) {
            payload.file_url =
              `/uploads/chapter-resources/${file.filename}`;

            payload.file_name =
              file.originalname;

            payload.mime_type =
              file.mimetype;

            payload.file_size =
              file.size;

            fileSaved = true;
          }
        } else {
          payload.external_url =
            null;

          payload.text_content =
            null;

          if (file) {
            payload.file_url =
              `/uploads/chapter-resources/${file.filename}`;

            payload.file_name =
              file.originalname;

            payload.mime_type =
              file.mimetype;

            payload.file_size =
              file.size;

            fileSaved = true;
          }
        }

        await resource.update(
          payload,
        );

        if (
          fileSaved &&
          oldFileUrl &&
          oldFileUrl !==
            resource.file_url
        ) {
          removeStoredFile(
            oldFileUrl,
          );
        }

        ok(
          res,
          resource,
          "संसाधन सफलतापूर्वक अपडेट किया गया",
        );
      } catch (error) {
        if (
          file &&
          !fileSaved
        ) {
          removeUploadedFile(
            file,
          );
        }

        throw error;
      }
    },
  );

export const deleteChapterResource =
  asyncHandler(
    async (req, res) => {
      const resource =
        await ChapterResource.findByPk(
          req.params.id,
        );

      if (!resource) {
        throw new AppError(
          "संसाधन नहीं मिला",
          404,
        );
      }

      const fileUrl =
        resource.file_url;

      await resource.destroy();

      removeStoredFile(
        fileUrl,
      );

      ok(
        res,
        {},
        "संसाधन सफलतापूर्वक हटाया गया",
      );
    },
  );

export const reorderChapterResources =
  asyncHandler(
    async (req, res) => {
      const chapterId =
        Number(
          req.params.chapterId,
        );

      const items =
        Array.isArray(
          req.body.items,
        )
          ? req.body.items
          : [];

      if (
        !Number.isInteger(
          chapterId,
        ) ||
        chapterId <= 0
      ) {
        throw new AppError(
          "अध्याय आईडी सही नहीं है",
          422,
        );
      }

      for (
        const item of items
      ) {
        const resourceId =
          Number(item.id);

        const sortOrder =
          Number(
            item.sort_order,
          );

        if (
          Number.isInteger(
            resourceId,
          ) &&
          Number.isInteger(
            sortOrder,
          )
        ) {
          await ChapterResource.update(
            {
              sort_order:
                Math.max(
                  1,
                  sortOrder,
                ),
            },
            {
              where: {
                id: resourceId,
                chapter_id:
                  chapterId,
              },
            },
          );
        }
      }

      const resources =
        await ChapterResource.findAll({
          where: {
            chapter_id:
              chapterId,
          },

          order: [
            [
              "sort_order",
              "ASC",
            ],
            [
              "id",
              "ASC",
            ],
          ],
        });

      ok(
        res,
        resources,
        "संसाधनों का क्रम सफलतापूर्वक अपडेट किया गया",
      );
    },
  );