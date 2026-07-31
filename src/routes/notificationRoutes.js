import {
  Router,
} from "express";

import {
  authenticate,
} from "../middleware/auth.js";

import {
  listNotifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
} from "../controllers/notificationController.js";


const router =
  Router();


router.use(
  authenticate,
);


router.get(
  "/",
  listNotifications,
);


router.get(
  "/unread-count",
  unreadCount,
);


router.patch(
  "/read-all",
  markAllAsRead,
);


router.patch(
  "/:id/read",
  markAsRead,
);


export default router;