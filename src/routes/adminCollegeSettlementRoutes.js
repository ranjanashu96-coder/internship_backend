import {
  Router,
} from "express";

import {
  authenticate,
  isAdmin,
} from "../middleware/auth.js";

import {
  uploadCollegeSettlement,
} from "../middleware/uploadCollegeSettlement.js";

import {
  createCollegePayment,
  getAdminCollegePaymentDetail,
  getAdminCollegePayments,
} from "../controllers/collegeSettlementController.js";

const router =
  Router();

router.use(
  authenticate,
  isAdmin,
);

router.get(
  "/",
  getAdminCollegePayments,
);

router.get(
  "/:collegeId",
  getAdminCollegePaymentDetail,
);

router.post(
  "/:collegeId",
  uploadCollegeSettlement.single(
    "receipt",
  ),
  createCollegePayment,
);

export default router;
