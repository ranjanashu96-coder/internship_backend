import { Op } from "sequelize";

import {
  LiveClass,
  Domain,
  Module,
  Chapter,
  Student,
} from "../models/index.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";

const ALLOWED_STATUSES = [
  "scheduled",
  "completed",
  "cancelled",
];

const asPositiveInt = (
  value,
  field,
  {
    required = false,
    defaultValue = null,
  } = {},
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    if (required) {
      throw new AppError(
        `${field} is required`,
        422,
      );
    }

    return defaultValue;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw new AppError(
      `${field} must be a positive integer`,
      422,
    );
  }

  return parsed;
};

const validateHttpUrl = (value) => {
  const raw = String(value || "").trim();

  if (!raw) {
    throw new AppError(
      "Meeting link is required",
      422,
    );
  }

  try {
    const url = new URL(raw);

    if (
      !["http:", "https:"].includes(
        url.protocol,
      )
    ) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw new AppError(
      "Please enter a valid HTTP/HTTPS meeting link",
      422,
    );
  }
};

const validateScheduleDate = (value) => {
  const date = new Date(value);

  if (
    !value ||
    Number.isNaN(date.getTime())
  ) {
    throw new AppError(
      "Valid class date and time is required",
      422,
    );
  }

  return date;
};

const validateRelations = async ({
  domainId,
  moduleId,
  chapterId,
}) => {
  const domain =
    await Domain.findByPk(domainId);

  if (!domain) {
    throw new AppError(
      "Selected domain not found",
      404,
    );
  }

  let module = null;
  let chapter = null;

  if (moduleId) {
    module = await Module.findByPk(
      moduleId,
    );

    if (!module) {
      throw new AppError(
        "Selected module not found",
        404,
      );
    }

    if (
      Number(module.domain_id) !==
      Number(domainId)
    ) {
      throw new AppError(
        "Selected module does not belong to selected domain",
        422,
      );
    }
  }

  if (chapterId) {
    chapter =
      await Chapter.findByPk(
        chapterId,
      );

    if (!chapter) {
      throw new AppError(
        "Selected chapter not found",
        404,
      );
    }

    const chapterModule =
      module ||
      (await Module.findByPk(
        chapter.module_id,
      ));

    if (!chapterModule) {
      throw new AppError(
        "Chapter module not found",
        404,
      );
    }

    if (
      Number(
        chapterModule.domain_id,
      ) !== Number(domainId)
    ) {
      throw new AppError(
        "Selected chapter does not belong to selected domain",
        422,
      );
    }

    if (
      moduleId &&
      Number(chapter.module_id) !==
        Number(moduleId)
    ) {
      throw new AppError(
        "Selected chapter does not belong to selected module",
        422,
      );
    }

    if (!moduleId) {
      moduleId =
        Number(chapter.module_id);
      module = chapterModule;
    }
  }

  return {
    domain,
    module,
    chapter,
    moduleId,
  };
};

const includeRelations = [
  {
    model: Domain,
    as: "domain",
    attributes: [
      "id",
      "domain_name",
    ],
    required: false,
  },
  {
    model: Module,
    as: "module",
    attributes: [
      "id",
      "module_number",
      "module_name",
      "domain_id",
    ],
    required: false,
  },
  {
    model: Chapter,
    as: "chapter",
    attributes: [
      "id",
      "module_id",
      "chapter_number",
      "chapter_name",
    ],
    required: false,
  },
];

/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

export const listLiveClasses =
  asyncHandler(
    async (req, res) => {
      const page =
        Math.max(
          1,
          Number(
            req.query.page || 1,
          ),
        );

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number(
              req.query.limit || 20,
            ),
          ),
        );

      const where = {};

      if (req.query.domain_id) {
        where.domain_id =
          asPositiveInt(
            req.query.domain_id,
            "Domain ID",
            { required: true },
          );
      }

      if (req.query.module_id) {
        where.module_id =
          asPositiveInt(
            req.query.module_id,
            "Module ID",
            { required: true },
          );
      }

      if (req.query.chapter_id) {
        where.chapter_id =
          asPositiveInt(
            req.query.chapter_id,
            "Chapter ID",
            { required: true },
          );
      }

      if (req.query.status) {
        if (
          !ALLOWED_STATUSES.includes(
            req.query.status,
          )
        ) {
          throw new AppError(
            "Invalid live class status",
            422,
          );
        }

        where.status =
          req.query.status;
      }

      if (req.query.search) {
        const search =
          String(
            req.query.search,
          ).trim();

        if (search) {
          where[Op.or] = [
            {
              title: {
                [Op.like]:
                  `%${search}%`,
              },
            },
            {
              instructor_name: {
                [Op.like]:
                  `%${search}%`,
              },
            },
          ];
        }
      }

      const result =
        await LiveClass
          .findAndCountAll({
            where,

            include:
              includeRelations,

            order: [
              [
                "scheduled_at",
                "DESC",
              ],
              ["id", "DESC"],
            ],

            limit,
            offset:
              (page - 1) * limit,

            distinct: true,
          });

      return ok(
        res,
        {
          items: result.rows,
          total: result.count,
          page,
          limit,
          totalPages:
            Math.ceil(
              result.count /
                limit,
            ),
        },
        "Live classes fetched successfully",
      );
    },
  );

export const createLiveClass =
  asyncHandler(
    async (req, res) => {
      const domainId =
        asPositiveInt(
          req.body.domain_id,
          "Domain",
          { required: true },
        );

      let moduleId =
        asPositiveInt(
          req.body.module_id,
          "Module",
        );

      const chapterId =
        asPositiveInt(
          req.body.chapter_id,
          "Chapter",
        );

      const title =
        String(
          req.body.title || "",
        ).trim();

      if (!title) {
        throw new AppError(
          "Class title is required",
          422,
        );
      }

      const relation =
        await validateRelations({
          domainId,
          moduleId,
          chapterId,
        });

      moduleId =
        relation.moduleId;

      const scheduledAt =
        validateScheduleDate(
          req.body.scheduled_at,
        );

      const durationMinutes =
        asPositiveInt(
          req.body
            .duration_minutes,
          "Duration",
          {
            defaultValue: 60,
          },
        );

      const popupMinutesBefore =
        asPositiveInt(
          req.body
            .popup_minutes_before,
          "Popup minutes",
          {
            defaultValue: 1440,
          },
        );

      const meetingUrl =
        validateHttpUrl(
          req.body.meeting_url,
        );

      const liveClass =
        await LiveClass.create({
          domain_id: domainId,

          module_id:
            moduleId || null,

          chapter_id:
            chapterId || null,

          title,

          description:
            String(
              req.body
                .description || "",
            ).trim() || null,

          instructor_name:
            String(
              req.body
                .instructor_name ||
                "",
            ).trim() || null,

          meeting_url:
            meetingUrl,

          scheduled_at:
            scheduledAt,

          duration_minutes:
            durationMinutes,

          popup_minutes_before:
            popupMinutesBefore,

          status: "scheduled",

          created_by:
            req.user?.id || null,
        });

      const created =
        await LiveClass.findByPk(
          liveClass.id,
          {
            include:
              includeRelations,
          },
        );

      return ok(
        res,
        created,
        "Live class scheduled successfully",
        201,
      );
    },
  );

export const updateLiveClass =
  asyncHandler(
    async (req, res) => {
      const liveClass =
        await LiveClass.findByPk(
          req.params.id,
        );

      if (!liveClass) {
        throw new AppError(
          "Live class not found",
          404,
        );
      }

      const domainId =
        asPositiveInt(
          req.body.domain_id ??
            liveClass.domain_id,
          "Domain",
          { required: true },
        );

      let moduleId =
        asPositiveInt(
          req.body.module_id ??
            liveClass.module_id,
          "Module",
        );

      const chapterId =
        asPositiveInt(
          req.body.chapter_id ??
            liveClass.chapter_id,
          "Chapter",
        );

      const relation =
        await validateRelations({
          domainId,
          moduleId,
          chapterId,
        });

      moduleId =
        relation.moduleId;

      const title =
        req.body.title !==
        undefined
          ? String(
              req.body.title,
            ).trim()
          : liveClass.title;

      if (!title) {
        throw new AppError(
          "Class title is required",
          422,
        );
      }

      const status =
        req.body.status ??
        liveClass.status;

      if (
        !ALLOWED_STATUSES.includes(
          status,
        )
      ) {
        throw new AppError(
          "Invalid live class status",
          422,
        );
      }

      await liveClass.update({
        domain_id: domainId,

        module_id:
          moduleId || null,

        chapter_id:
          chapterId || null,

        title,

        description:
          req.body.description !==
          undefined
            ? String(
                req.body
                  .description || "",
              ).trim() || null
            : liveClass.description,

        instructor_name:
          req.body
            .instructor_name !==
          undefined
            ? String(
                req.body
                  .instructor_name ||
                  "",
              ).trim() || null
            : liveClass
                .instructor_name,

        meeting_url:
          req.body.meeting_url !==
          undefined
            ? validateHttpUrl(
                req.body
                  .meeting_url,
              )
            : liveClass
                .meeting_url,

        scheduled_at:
          req.body.scheduled_at !==
          undefined
            ? validateScheduleDate(
                req.body
                  .scheduled_at,
              )
            : liveClass
                .scheduled_at,

        duration_minutes:
          req.body
            .duration_minutes !==
          undefined
            ? asPositiveInt(
                req.body
                  .duration_minutes,
                "Duration",
                {
                  required: true,
                },
              )
            : liveClass
                .duration_minutes,

        popup_minutes_before:
          req.body
            .popup_minutes_before !==
          undefined
            ? asPositiveInt(
                req.body
                  .popup_minutes_before,
                "Popup minutes",
                {
                  required: true,
                },
              )
            : liveClass
                .popup_minutes_before,

        status,
      });

      const updated =
        await LiveClass.findByPk(
          liveClass.id,
          {
            include:
              includeRelations,
          },
        );

      return ok(
        res,
        updated,
        "Live class updated successfully",
      );
    },
  );

export const deleteLiveClass =
  asyncHandler(
    async (req, res) => {
      const liveClass =
        await LiveClass.findByPk(
          req.params.id,
        );

      if (!liveClass) {
        throw new AppError(
          "Live class not found",
          404,
        );
      }

      await liveClass.destroy();

      return ok(
        res,
        {},
        "Live class deleted successfully",
      );
    },
  );

/*
|--------------------------------------------------------------------------
| STUDENT
|--------------------------------------------------------------------------
|
| Student login user ka email auth token me already available hota hai.
| Isliye first preference email mapping hai.
| Agar aapke auth middleware me req.user.student_id add hai to wo bhi
| automatically use ho jayega.
|
*/

const getLoggedInStudent =
  async (req) => {
    const directStudentId =
      Number(
        req.user?.student_id ||
          0,
      );

    if (directStudentId) {
      const byId =
        await Student.findByPk(
          directStudentId,
        );

      if (byId) {
        return byId;
      }
    }

    const email =
      String(
        req.user?.email || "",
      ).trim();

    if (email) {
      const byEmail =
        await Student.findOne({
          where: { email },
        });

      if (byEmail) {
        return byEmail;
      }
    }

    throw new AppError(
      "Student profile is not linked with logged in account",
      404,
    );
  };

export const studentUpcomingLiveClasses =
  asyncHandler(
    async (req, res) => {
      const student =
        await getLoggedInStudent(
          req,
        );

      if (!student.domain_id) {
        return ok(
          res,
          {
            next_class: null,
            items: [],
          },
          "Student domain is not assigned",
        );
      }

      const now = new Date();

      /*
       * Recently started class ko bhi show rakho
       * taki class start ke baad join button gayab na ho.
       */
      const startedWindow =
        new Date(
          now.getTime() -
            6 * 60 * 60 * 1000,
        );

      const candidates =
        await LiveClass.findAll({
          where: {
            domain_id:
              student.domain_id,

            status: "scheduled",

            scheduled_at: {
              [Op.gte]:
                startedWindow,
            },
          },

          include:
            includeRelations,

          order: [
            [
              "scheduled_at",
              "ASC",
            ],
          ],

          limit: 10,
        });

      const items =
        candidates
          .map((row) => {
            const data =
              row.toJSON();

            const start =
              new Date(
                data.scheduled_at,
              );

            const end =
              new Date(
                start.getTime() +
                  Number(
                    data.duration_minutes ||
                      60,
                  ) *
                    60 *
                    1000,
              );

            const joinOpens =
              new Date(
                start.getTime() -
                  10 *
                    60 *
                    1000,
              );

            const popupStarts =
              new Date(
                start.getTime() -
                  Number(
                    data.popup_minutes_before ||
                      1440,
                  ) *
                    60 *
                    1000,
              );

            return {
              ...data,

              can_join:
                now >=
                  joinOpens &&
                now <= end,

              is_live:
                now >= start &&
                now <= end,

              is_upcoming:
                now < start,

              popup_visible:
                now >=
                  popupStarts &&
                now <= end,

              join_opens_at:
                joinOpens,

              ends_at: end,

              seconds_until_start:
                Math.max(
                  0,
                  Math.floor(
                    (start.getTime() -
                      now.getTime()) /
                      1000,
                  ),
                ),
            };
          })
          .filter(
            (item) =>
              new Date(
                item.ends_at,
              ) >= now,
          );

      const nextClass =
        items.find(
          (item) =>
            item.is_live ||
            item.is_upcoming,
        ) || null;

      return ok(
        res,
        {
          next_class:
            nextClass,
          items,
        },
        "Upcoming live classes fetched successfully",
      );
    },
  );
