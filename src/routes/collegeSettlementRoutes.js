import {
  Router,
} from "express";

import {
  authenticate,
  isCollege,
} from "../middleware/auth.js";

import {
  getMyCollegePayments,
} from "../controllers/collegeSettlementController.js";

const router =
  Router();

router.use(
  authenticate,
  isCollege,
);

router.get(
  "/",
  getMyCollegePayments,
);

export default router;
