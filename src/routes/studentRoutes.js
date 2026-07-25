import { Router } from "express";
import {
  authenticate,
  isStudent,
} from "../middleware/auth.js";

import { upload } from "../utils/files.js";

import * as c from "../controllers/studentController.js";

const r = Router();

/*
|--------------------------------------------------------------------------
| Registration
|--------------------------------------------------------------------------
*/

r.post(
  "/registration/check",
  c.checkRegistration,
);

r.post(
  "/registration/academics",
  c.saveAcademics,
);

/*
|--------------------------------------------------------------------------
| Student Protected Routes
|--------------------------------------------------------------------------
*/

r.use(authenticate, isStudent);

/*
|--------------------------------------------------------------------------
| Dashboard
|--------------------------------------------------------------------------
*/

r.get(
  "/dashboard",
  c.dashboard,
);

/*
|--------------------------------------------------------------------------
| Profile
|--------------------------------------------------------------------------
*/

r.get(
  "/profile",
  c.getProfile,
);

r.put(
  "/profile",
  c.updateProfile,
);

r.get(
  "/documents",
  c.getDocuments,
);

r.get(
  "/documents/:documentId/download",
  c.downloadDocument,
);

/*
|--------------------------------------------------------------------------
| Learning
|--------------------------------------------------------------------------
*/

r.get(
  "/learning",
  c.learning,
);

r.post(
  "/chapters/:chapterId/complete",
  c.completeChapter,
);

/*
|--------------------------------------------------------------------------
| Logbook
|--------------------------------------------------------------------------
*/

// r.post(
//   "/logbook",
//   c.submitLogbook,
// );

/*
|--------------------------------------------------------------------------
| Live Project
|--------------------------------------------------------------------------
*/

r.post(
  "/projects",
  upload(
    "projects",
    ["application/pdf"],
  ).single("file"),
  c.submitProject,
);

/*
|--------------------------------------------------------------------------
| Internship Report
|--------------------------------------------------------------------------
*/

r.post(
  "/reports",
  upload(
    "reports",
    ["application/pdf"],
  ).single("file"),
  c.submitReport,
);

/*
|--------------------------------------------------------------------------
| Assignment
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Assignment
|--------------------------------------------------------------------------
*/

r.get(
  "/assignments",
  c.getAssignments,
);

r.get(
  "/assignments/:assignmentId",
  c.getAssignmentDetails,
);

r.post(
  "/assignments/:assignmentId",
  upload(
    "submissions",
    [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ],
  ).single("file"),
  c.submitAssignment,
);

/*
|--------------------------------------------------------------------------
| Attendance
|--------------------------------------------------------------------------
*/

r.get(
  "/attendance/today",
  c.getTodayAttendance,
);

r.post(
  "/attendance/check-in",
  c.checkInAttendance,
);

r.post(
  "/attendance/check-out",
  c.checkOutAttendance,
);

r.get(
  "/attendance/calendar",
  c.getAttendanceCalendar,
);

r.get(
  "/attendance",
  c.getAttendance,
);

/*
|--------------------------------------------------------------------------
| Dashboard Analytics
|--------------------------------------------------------------------------
*/

r.get(
  "/analytics",
  c.getAnalytics,
);

/*
|--------------------------------------------------------------------------
| Logbooks
|--------------------------------------------------------------------------
*/

r.get(
  "/logbooks",
  c.getLogbooks,
);

r.get(
  "/logbooks/:logbookId",
  c.getLogbookDetails,
);

r.put(
  "/logbooks/:logbookId",
  c.updateLogbook,
);

r.delete(
  "/logbooks/:logbookId",
  c.deleteLogbook,
);

r.post(
  "/logbook",
  c.submitLogbook,
);

/*
|--------------------------------------------------------------------------
| Live Projects
|--------------------------------------------------------------------------
*/

r.get(
  "/projects",
  c.getProjects,
);

r.get(
  "/projects/:projectId",
  c.getProjectDetails,
);

r.post(
  "/projects",
  upload(
    "projects",
    ["application/pdf"],
  ).single("file"),
  c.submitProject,
);

/*
|--------------------------------------------------------------------------
| Internship Reports
|--------------------------------------------------------------------------
*/

r.get(
  "/reports",
  c.getReports,
);

r.get(
  "/reports/:reportId",
  c.getReportDetails,
);

r.post(
  "/reports",
  upload(
    "reports",
    ["application/pdf"],
  ).single("file"),
  c.submitReport,
);

/*
|--------------------------------------------------------------------------
| Payments
|--------------------------------------------------------------------------
*/

r.get(
  "/payments",
  c.getPayments,
);

r.get(
  "/payments/:paymentId",
  c.getPaymentDetails,
);

/*
|--------------------------------------------------------------------------
| Certificate
|--------------------------------------------------------------------------
*/

r.get(
  "/certificate",
  c.getCertificate,
);
export default r;