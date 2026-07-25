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
  getMentorAssignableStudents,
  assignStudentsToMentor,
  removeStudentsFromMentor,
} from "../controllers/mentorAssignmentController.js";

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
} from "../controllers/adminController.js";



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

/*
|--------------------------------------------------------------------------
| Colleges
|--------------------------------------------------------------------------
*/

router.get("/colleges", list("colleges"));
router.get("/colleges/:id", getById("colleges"));
router.post("/colleges", createCollege);
router.put("/colleges/:id", updateCollege);
router.patch("/colleges/:id/approve", approveCollege);
router.delete("/colleges/:id", removeCollege);

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
  "/mentors/:mentorId/students",
  getMentorAssignableStudents,
);

router.post(
  "/mentors/:mentorId/assign-students",
  assignStudentsToMentor,
);

router.post(
  "/mentors/:mentorId/remove-students",
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
  chapterUpload.single("file"),
  createChapter,
);

router.put(
  "/chapters/:id",
  chapterUpload.single("file"),
  updateChapter,
);

router.delete(
  "/chapters/:id",
  deleteChapter,
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
| Bulk automation
|--------------------------------------------------------------------------
*/

router.post(
  "/bulk/process",
  processBulk,
);

router.get(
  "/bulk/status/:jobUuid",
  bulkStatus,
);

export default router;