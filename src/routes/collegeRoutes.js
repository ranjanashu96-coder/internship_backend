import { Router } from "express";

import {
  authenticate,
  isCollege,
} from "../middleware/auth.js";

import { upload } from "../utils/files.js";

import {
 
  getProfile,
  updateProfile,
  uploadExcel,
  registrations,
  certificates,
  certificateById,
  downloadCertificate,
  downloadAllCertificates,
   studentsWithCertificates,
  downloadStudentCertificate,
} from "../controllers/collegeController.js";

const router = Router();

router.use(authenticate, isCollege);

router.get(
  "/profile",
  getProfile,
);

router.put(
  "/profile",
  updateProfile,
);

router.post(
  "/upload",
  upload(
    "excel",
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
  ).single("file"),
  uploadExcel,
);

router.get(
  "/registrations",
  registrations,
);

router.get(
  "/certificates",
  certificates,
);

router.get(
  "/certificates/download-all",
  downloadAllCertificates,
);

router.get(
  "/certificates/:id",
  certificateById,
);

router.get(
  "/certificates/:id/download",
  downloadCertificate,
);
router.get(
  "/students",
  studentsWithCertificates,
);

router.get(
  "/students/:studentId/certificate/download",
  downloadStudentCertificate,
);

export default router;