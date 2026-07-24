import express from "express";

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
  authMiddleware,
} from "../middlewares/authMiddleware.js";

import {
  roleMiddleware,
} from "../middlewares/roleMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

router.use(
  roleMiddleware([
    "super_admin",
    "admin",
  ]),
);

/*
|--------------------------------------------------------------------------
| Sectors
|--------------------------------------------------------------------------
*/

router.get(
  "/sectors",
  listSectors,
);

router.get(
  "/sectors/:id",
  getSectorById,
);

router.post(
  "/sectors",
  createSector,
);

router.put(
  "/sectors/:id",
  updateSector,
);

router.delete(
  "/sectors/:id",
  deleteSector,
);

/*
|--------------------------------------------------------------------------
| Domains
|--------------------------------------------------------------------------
*/

router.get(
  "/domains",
  listDomains,
);

router.get(
  "/domains/:id",
  getDomainById,
);

router.post(
  "/domains",
  createDomain,
);

router.put(
  "/domains/:id",
  updateDomain,
);

router.delete(
  "/domains/:id",
  deleteDomain,
);

/*
|--------------------------------------------------------------------------
| Modules
|--------------------------------------------------------------------------
*/

router.get(
  "/modules",
  listModules,
);

router.get(
  "/modules/:id",
  getModuleById,
);

router.post(
  "/modules",
  createModule,
);

router.put(
  "/modules/:id",
  updateModule,
);

router.delete(
  "/modules/:id",
  deleteModule,
);

/*
|--------------------------------------------------------------------------
| Chapters
|--------------------------------------------------------------------------
*/

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
  createChapter,
);

router.put(
  "/chapters/:id",
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

router.get(
  "/assignments",
  listAssignments,
);

router.get(
  "/assignments/:id",
  getAssignmentById,
);

router.post(
  "/assignments",
  createAssignment,
);

router.put(
  "/assignments/:id",
  updateAssignment,
);

router.delete(
  "/assignments/:id",
  deleteAssignment,
);

export default router;