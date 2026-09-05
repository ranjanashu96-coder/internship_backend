import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";

import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import collegeRoutes from "./routes/collegeRoutes.js";
import mentorRoutes from "./routes/mentorRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import registrationRoutes from "./routes/registrationRoutes.js";
import publicCertificateRoutes from "./routes/publicCertificateRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

/*
|--------------------------------------------------------------------------
| College Settlement Routes
|--------------------------------------------------------------------------
*/

import adminCollegeSettlementRoutes from "./routes/adminCollegeSettlementRoutes.js";
import collegeSettlementRoutes from "./routes/collegeSettlementRoutes.js";

import {
  notFound,
  errorHandler,
} from "./middleware/errorHandler.js";

const app = express();

app.set("trust proxy", 1);

app.use(cookieParser());

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : true;

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: "draft-7",
  legacyHeaders: false,

  skip: (req) =>
    req.originalUrl.startsWith(
      "/api/registration/payment/cashfree/webhook",
    ) ||
    req.originalUrl.startsWith(
      "/api/registration/payment/razorpay/webhook",
    ),

  message: {
    success: false,
    message:
      "Too many requests. Please try again later.",
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,

  message: {
    success: false,
    message:
      "Too many login attempts. Please try again after 15 minutes.",
  },
});

app.use(
  express.json({
    limit: "2mb",

    verify: (req, _res, buffer) => {
      req.rawBody = Buffer.from(buffer);
    },
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb",
  }),
);

app.use(
  "/uploads",
  express.static(
    path.resolve("uploads"),
  ),
);

app.get(
  "/health",
  (_req, res) => {
    return res.status(200).json({
      success: true,

      data: {
        status: "ok",
      },

      message:
        "RKNexora API is healthy",
    });
  },
);

app.use(
  "/api/public/certificates",
  publicCertificateRoutes,
);

app.use(
  "/api/auth/login",
  loginLimiter,
);

app.use(
  "/api/auth",
  authRoutes,
);

app.use(
  "/api/registration",
  generalLimiter,
  registrationRoutes,
);

/*
|--------------------------------------------------------------------------
| College Settlement APIs
|--------------------------------------------------------------------------
|
| Admin:
| GET  /api/admin/college-payments
| GET  /api/admin/college-payments/:collegeId
| POST /api/admin/college-payments/:collegeId
|
| College:
| GET  /api/college/payments
|
*/

app.use(
  "/api/admin/college-payments",
  generalLimiter,
  adminCollegeSettlementRoutes,
);

app.use(
  "/api/college/payments",
  generalLimiter,
  collegeSettlementRoutes,
);

app.use(
  "/api/admin",
  generalLimiter,
  adminRoutes,
);

app.use(
  "/api/college",
  generalLimiter,
  collegeRoutes,
);

app.use(
  "/api/mentor",
  generalLimiter,
  mentorRoutes,
);

app.use(
  "/api/student",
  generalLimiter,
  studentRoutes,
);

app.use(
  "/api/notifications",
  generalLimiter,
  notificationRoutes,
);

app.use(
  "/api/payments",
  generalLimiter,
  paymentRoutes,
);

app.use(
  "/api/public",
  generalLimiter,
  publicRoutes,
);

app.use(notFound);

app.use(errorHandler);

export default app;
