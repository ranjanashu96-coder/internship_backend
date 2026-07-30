import { Router } from "express";
import {
  body,
  param,
} from "express-validator";

import { validate } from "../middleware/validate.js";
import { upload } from "../utils/files.js";
import * as c from "../controllers/registrationController.js";

const router = Router();

router.post(
  "/verify",
  [
    body("registration_number")
      .trim()
      .notEmpty()
      .withMessage("Registration number is required"),
  ],
  validate,
  c.verifyRegistration,
);

router.get(
  "/domains",
  c.listRegistrationDomains,
);

router.post(
  "/details",
  [
    body("registration_number").trim().notEmpty().withMessage("Registration number is required"),
    body("father_name").trim().notEmpty().withMessage("Father name is required"),
    body("gender").isIn(["male", "female", "other"]).withMessage("Invalid gender"),
    body("dob").isISO8601().withMessage("Valid date of birth is required"),
    body("programme").trim().notEmpty().withMessage("Programme is required"),
    body("major_subject").trim().notEmpty().withMessage("Major subject is required"),
    body("session").trim().notEmpty().withMessage("Session is required"),
    body("semester").trim().notEmpty().withMessage("Semester is required"),
    body("domain_id").isInt({ min: 1 }).withMessage("Valid domain is required"),
    body("email").trim().isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("mobile").trim().matches(/^\d{10,15}$/).withMessage("Valid mobile number is required"),
    body("username").trim().isLength({ min: 4, max: 100 }).withMessage("Username must be between 4 and 100 characters"),
    body("password").optional({ checkFalsy: true }).isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  validate,
  c.saveRegistration,
);

router.post(
  "/documents",
  upload(
    "registration",
    [
      "image/jpeg",
      "image/png",
      "application/pdf",
    ],
  ).fields([
    { name: "photo", maxCount: 1 },
    { name: "identity_document", maxCount: 1 },
   
  ]),
  [
    body("registration_number")
      .trim()
      .notEmpty()
      .withMessage("Registration number is required"),
  ],
  validate,
  c.uploadRegistrationDocuments,
);

router.post(
  "/lock",
  [
    body("student_id")
      .isInt({ min: 1 })
      .withMessage("Valid student ID is required"),
  ],
  validate,
  c.lockRegistration,
);

router.post(
  "/payment/order",
  [
    body("student_id")
      .isInt({ min: 1 })
      .withMessage("Valid student ID is required"),
  ],
  validate,
  c.createPaymentOrder,
);

router.post(
  "/payment/verify",
  [
    body("order_id")
      .trim()
      .notEmpty()
      .withMessage("Cashfree order ID is required"),
  ],
  validate,
  c.verifyCashfreePayment,
);

// Public endpoint; authenticity is verified using Cashfree HMAC signature.
router.post(
  "/payment/cashfree/webhook",
  c.cashfreeWebhook,
);

router.get(
  "/payment/receipt/:transaction_id",
  [
    param("transaction_id")
      .trim()
      .notEmpty()
      .withMessage("Transaction ID is required"),
  ],
  validate,
  c.downloadPaymentReceipt,
);

export default router;
