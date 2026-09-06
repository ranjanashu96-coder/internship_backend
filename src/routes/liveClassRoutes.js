import express from "express";

import {
  authenticate,
  isAdmin,
  isStudent,
} from "../middleware/auth.js";

import {
  listLiveClasses,
  createLiveClass,
  updateLiveClass,
  deleteLiveClass,
  studentUpcomingLiveClasses,
} from "../controllers/liveClassController.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Admin
|--------------------------------------------------------------------------
*/

router.get(
  "/admin/live-classes",
  authenticate,
  isAdmin,
  listLiveClasses,
);

router.post(
  "/admin/live-classes",
  authenticate,
  isAdmin,
  createLiveClass,
);

router.put(
  "/admin/live-classes/:id",
  authenticate,
  isAdmin,
  updateLiveClass,
);

router.delete(
  "/admin/live-classes/:id",
  authenticate,
  isAdmin,
  deleteLiveClass,
);

/*
|--------------------------------------------------------------------------
| Student
|--------------------------------------------------------------------------
*/

router.get(
  "/student/live-classes/upcoming",
  authenticate,
  isStudent,
  studentUpcomingLiveClasses,
);

export default router;
