import { Router } from "express";

import {
  authenticate,
  isAdmin,
} from "../middleware/auth.js";

import { upload } from "../utils/files.js";
import {
  listSectors,
  getSectorById,
  createSector,
  updateSector,
  deleteSector,

  listDomains,
  getDomainById,
  createDomain,
  updateDomain,
  deleteDomain,

  listModules,
  getModuleById,
  createModule,
  updateModule,
  deleteModule,

  listChapters,
  getChapterById,
  createChapter,
  updateChapter,
  deleteChapter,

  listAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} from "../controllers/adminMasterController.js";

import {
  listQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
} from "../controllers/adminQuizController.js";

import {
  getMentorAssignableStudents,
  assignStudentsToMentor,
  removeStudentsFromMentor,
} from "../controllers/mentorAssignmentController.js";

import {
  listChapterResources,
  createChapterResource,
  updateChapterResource,
  deleteChapterResource,
  reorderChapterResources,
} from "../controllers/adminChapterResourceController.js";

import {
  chapterResourceUpload,
} from "../utils/chapterResourceUpload.js";

import {
 list,
  getById,
  create,
  update,
  remove,

  getAdminDashboard,

  createCollege,
  updateCollege,
  approveCollege,
  removeCollege,

  importStudents,

  createMentor,
  updateMentor,

  processBulk,
  bulkStatus,
  previewBulk,
  listBulkJobs,
  cancelBulkJob,
  retryBulkJob,
  startStudentInternship,
} from "../controllers/adminController.js";

import {
  getAdminReport,
  exportAdminReport,
} from "../controllers/adminReportController.js";



const router = Router();

router.use(authenticate, isAdmin);

/*
|--------------------------------------------------------------------------
| Dashboard
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  getAdminDashboard,
);

// router.get("/dashboard", adminDashboard);

router.get(
  "/reports",
  getAdminReport,
);

router.get(
  "/reports/export",
  exportAdminReport,
);

/*
|--------------------------------------------------------------------------
| Colleges
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Colleges
|--------------------------------------------------------------------------
*/

const collegeLogoUpload = upload(
  "colleges",
  [
    "image/jpeg",
    "image/png",
    "image/webp",
  ],
);

router.get(
  "/colleges",
  list("colleges"),
);

router.get(
  "/colleges/:id",
  getById("colleges"),
);

router.post(
  "/colleges",
  collegeLogoUpload.single("logo"),
  createCollege,
);

router.put(
  "/colleges/:id",
  collegeLogoUpload.single("logo"),
  updateCollege,
);

router.patch(
  "/colleges/:id/approve",
  approveCollege,
);

router.delete(
  "/colleges/:id",
  removeCollege,
);

/*
|--------------------------------------------------------------------------
| Mentors
|--------------------------------------------------------------------------
*/

router.get("/mentors", list("mentors"));
router.get("/mentors/:id", getById("mentors"));
router.post("/mentors", createMentor);
router.put("/mentors/:id", updateMentor);
router.delete("/mentors/:id", remove("mentors"));

router.get(
  "/mentors/:id/students",
  getMentorAssignableStudents,
);

router.post(
  "/mentors/:id/assign-students",
  assignStudentsToMentor,
);

router.post(
  "/mentors/:id/remove-students",
  removeStudentsFromMentor,
);

/*
|--------------------------------------------------------------------------
| Students
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Students
|--------------------------------------------------------------------------
*/

router.get("/students", list("students"));
router.patch(
  "/students/:id/start-internship",
  startStudentInternship,
);


router.post(
  "/students/import",
  upload(
    "excel",
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
  ).single("file"),
  importStudents,
);

router.get("/students/:id", getById("students"));
router.post("/students", create("students"));
router.put("/students/:id", update("students"));
router.delete("/students/:id", remove("students"));

/*
|--------------------------------------------------------------------------
| Master Management
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Sectors
|--------------------------------------------------------------------------
*/

router.get("/sectors", listSectors);
router.get("/sectors/:id", getSectorById);
router.post("/sectors", createSector);
router.put("/sectors/:id", updateSector);
router.delete("/sectors/:id", deleteSector);

/*
|--------------------------------------------------------------------------
| Domains
|--------------------------------------------------------------------------
*/

router.get("/domains", listDomains);
router.get("/domains/:id", getDomainById);
router.post("/domains", createDomain);
router.put("/domains/:id", updateDomain);
router.delete("/domains/:id", deleteDomain);

/*
|--------------------------------------------------------------------------
| Modules
|--------------------------------------------------------------------------
*/

router.get("/modules", listModules);
router.get("/modules/:id", getModuleById);
router.post("/modules", createModule);
router.put("/modules/:id", updateModule);
router.delete("/modules/:id", deleteModule);

/*
|--------------------------------------------------------------------------
| Chapters
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Chapters
|--------------------------------------------------------------------------
*/

const chapterUpload =
  upload(
    "chapters",
    [
      "application/pdf",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "text/plain",
    ],
  );

router.get(
  "/chapters",
  listChapters,
);

router.get(
  "/chapters/:id",
  getChapterById,
);

router.post(
  "/chapters",
  chapterUpload.none(),
  createChapter,
);

router.put(
  "/chapters/:id",
  chapterUpload.none(),
  updateChapter,
);

router.delete(
  "/chapters/:id",
  deleteChapter,
);

/*
|--------------------------------------------------------------------------
| Chapter Resources
|--------------------------------------------------------------------------
*/

router.get(
  "/chapters/:chapterId/resources",
  listChapterResources,
);

router.post(
  "/chapters/:chapterId/resources",

  chapterResourceUpload.single(
    "file",
  ),

  createChapterResource,
);

router.put(
  "/chapter-resources/:id",

  chapterResourceUpload.single(
    "file",
  ),

  updateChapterResource,
);

router.delete(
  "/chapter-resources/:id",
  deleteChapterResource,
);

router.put(
  "/chapters/:chapterId/resources/reorder",
  reorderChapterResources,
);
/*
|--------------------------------------------------------------------------
| Assignments
|--------------------------------------------------------------------------
*/

router.get("/assignments", listAssignments);
router.get("/assignments/:id", getAssignmentById);
router.post("/assignments", createAssignment);
router.put("/assignments/:id", updateAssignment);
router.delete("/assignments/:id", deleteAssignment);


/*
|--------------------------------------------------------------------------
| Quiz Management
|--------------------------------------------------------------------------
*/

router.get(
  "/quizzes",
  listQuizzes,
);

router.get(
  "/quizzes/:id",
  getQuizById,
);

router.post(
  "/quizzes",
  createQuiz,
);

router.put(
  "/quizzes/:id",
  updateQuiz,
);

router.delete(
  "/quizzes/:id",
  deleteQuiz,
);

/*
|--------------------------------------------------------------------------
| Bulk automation
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Bulk Automation
|--------------------------------------------------------------------------
*/

/*
 * Run se pehle affected students
 * aur estimated records dekho.
 */
router.post(
  "/bulk/preview",
  previewBulk,
);

/*
 * Naya bulk job queue karega.
 */
router.post(
  "/bulk/process",
  processBulk,
);

/*
 * Purane / current jobs ki history.
 *
 * Filters:
 * ?page=1
 * ?limit=20
 * ?status=running
 * ?type=certificates
 */
router.get(
  "/bulk/jobs",
  listBulkJobs,
);

/*
 * Single job ka live status.
 */
router.get(
  "/bulk/status/:jobUuid",
  bulkStatus,
);

/*
 * Queued ya running job cancel.
 */
router.post(
  "/bulk/:jobUuid/cancel",
  cancelBulkJob,
);

/*
 * Failed ya cancelled job
 * same payload ke saath dobara run.
 */
router.post(
  "/bulk/:jobUuid/retry",
  retryBulkJob,
);

export default router;