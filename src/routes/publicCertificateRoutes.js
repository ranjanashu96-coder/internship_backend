import { Router } from "express";

import {
  verifyCertificate,
} from "../controllers/publicCertificateController.js";

const router = Router();

router.get(
  "/certificates/:certificateNumber",
  verifyCertificate,
);

export default router;
