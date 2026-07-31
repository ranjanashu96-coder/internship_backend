import {
  Notification,
} from "../models/index.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  AppError,
  ok,
} from "../utils/response.js";


const getRecipient = (
  req,
) => {
  const role =
    req.user?.role;

  const id =
    Number(
      req.user?.id,
    );

  if (!role || !id) {
    throw new AppError(
      "Authenticated user not found",
      401,
    );
  }

  return {
    recipientType:
      role,

    recipientId:
      id,
  };
};


export const listNotifications =
  asyncHandler(
    async (req, res) => {
      const {
        recipientType,
        recipientId,
      } =
        getRecipient(req);

      const page =
        Math.max(
          1,
          Number(
            req.query.page ||
              1,
          ),
        );

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number(
              req.query.limit ||
                20,
            ),
          ),
        );

      const offset =
        (page - 1) *
        limit;

      const {
        rows,
        count,
      } =
        await Notification.findAndCountAll(
          {
            where: {
              recipient_type:
                recipientType,

              recipient_id:
                recipientId,
            },

            order: [
              [
                "created_at",
                "DESC",
              ],
            ],

            limit,
            offset,
          },
        );

      return ok(
        res,
        {
          items:
            rows,

          pagination: {
            page,
            limit,
            total:
              count,

            total_pages:
              Math.max(
                1,
                Math.ceil(
                  count /
                    limit,
                ),
              ),
          },
        },
        "Success",
      );
    },
  );


export const unreadCount =
  asyncHandler(
    async (req, res) => {
      const {
        recipientType,
        recipientId,
      } =
        getRecipient(req);

      const count =
        await Notification.count(
          {
            where: {
              recipient_type:
                recipientType,

              recipient_id:
                recipientId,

              is_read:
                false,
            },
          },
        );

      return ok(
        res,
        {
          unread_count:
            count,
        },
        "Success",
      );
    },
  );


export const markAsRead =
  asyncHandler(
    async (req, res) => {
      const {
        recipientType,
        recipientId,
      } =
        getRecipient(req);

      const notification =
        await Notification.findOne(
          {
            where: {
              id:
                req.params.id,

              recipient_type:
                recipientType,

              recipient_id:
                recipientId,
            },
          },
        );

      if (!notification) {
        throw new AppError(
          "Notification not found",
          404,
        );
      }

      if (
        !notification.is_read
      ) {
        await notification.update(
          {
            is_read:
              true,

            read_at:
              new Date(),
          },
        );
      }

      return ok(
        res,
        notification,
        "Notification marked as read",
      );
    },
  );


export const markAllAsRead =
  asyncHandler(
    async (req, res) => {
      const {
        recipientType,
        recipientId,
      } =
        getRecipient(req);

      await Notification.update(
        {
          is_read:
            true,

          read_at:
            new Date(),
        },
        {
          where: {
            recipient_type:
              recipientType,

            recipient_id:
              recipientId,

            is_read:
              false,
          },
        },
      );

      return ok(
        res,
        {},
        "All notifications marked as read",
      );
    },
  );