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

import {
  notFound,
  errorHandler,
} from "./middleware/errorHandler.js";

const app = express();

/*
|--------------------------------------------------------------------------
| Reverse Proxy
|--------------------------------------------------------------------------
|
| Production me Nginx ke peeche backend chal raha hai.
| Isse Express real client IP identify karega.
|
*/

app.set("trust proxy", 1);

/*
|--------------------------------------------------------------------------
| Cookie Parser
|--------------------------------------------------------------------------
*/

app.use(cookieParser());

/*
|--------------------------------------------------------------------------
| Security Headers
|--------------------------------------------------------------------------
*/

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| Rate Limiters
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| General API Limiter
|--------------------------------------------------------------------------
|
| Normal APIs ke liye:
| 15 minutes me ek IP se maximum 3000 requests.
|
*/

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 3000,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  /*
  |--------------------------------------------------------------------------
  | Payment Webhooks ko rate limit se bahar rakhen
  |--------------------------------------------------------------------------
  */

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

/*
|--------------------------------------------------------------------------
| Login Limiter
|--------------------------------------------------------------------------
|
| Failed login attempts ko control karega.
|
| 15 minutes me maximum 20 failed attempts.
| Successful login count nahi hoga.
|
*/

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

/*
|--------------------------------------------------------------------------
| JSON Body Parser
|--------------------------------------------------------------------------
|
| rawBody Cashfree/Razorpay webhook signature verification ke liye bhi
| preserve ki ja rahi hai.
|
*/

app.use(
  express.json({
    limit: "2mb",

    verify: (req, _res, buffer) => {
      req.rawBody = Buffer.from(buffer);
    },
  }),
);

/*
|--------------------------------------------------------------------------
| URL Encoded Body Parser
|--------------------------------------------------------------------------
*/

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb",
  }),
);

/*
|--------------------------------------------------------------------------
| Static Uploads
|--------------------------------------------------------------------------
*/

app.use(
  "/uploads",
  express.static(
    path.resolve("uploads"),
  ),
);

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| Public Certificate Routes
|--------------------------------------------------------------------------
|
| Public certificate verify/download ko general limiter me nahi rakha hai.
|
*/

app.use(
  "/api/public/certificates",
  publicCertificateRoutes,
);

/*
|--------------------------------------------------------------------------
| Login Rate Limit
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| POST /api/auth/login
|
| par sirf loginLimiter lagega.
|
*/

app.use(
  "/api/auth/login",
  loginLimiter,
);

/*
|--------------------------------------------------------------------------
| Authentication Routes
|--------------------------------------------------------------------------
|
| /login
| /refresh
| /logout
| /forgot-password
| /reset-password
|
*/

app.use(
  "/api/auth",
  authRoutes,
);

/*
|--------------------------------------------------------------------------
| Registration Routes
|--------------------------------------------------------------------------
*/

app.use(
  "/api/registration",
  generalLimiter,
  registrationRoutes,
);

/*
|--------------------------------------------------------------------------
| Admin Routes
|--------------------------------------------------------------------------
*/

app.use(
  "/api/admin",
  generalLimiter,
  adminRoutes,
);

/*
|--------------------------------------------------------------------------
| College Routes
|--------------------------------------------------------------------------
*/

app.use(
  "/api/college",
  generalLimiter,
  collegeRoutes,
);

/*
|--------------------------------------------------------------------------
| Mentor Routes
|--------------------------------------------------------------------------
*/

app.use(
  "/api/mentor",
  generalLimiter,
  mentorRoutes,
);

/*
|--------------------------------------------------------------------------
| Student Routes
|--------------------------------------------------------------------------
*/

app.use(
  "/api/student",
  generalLimiter,
  studentRoutes,
);

/*
|--------------------------------------------------------------------------
| Notification Routes
|--------------------------------------------------------------------------
*/

app.use(
  "/api/notifications",
  generalLimiter,
  notificationRoutes,
);

/*
|--------------------------------------------------------------------------
| Payment Routes
|--------------------------------------------------------------------------
*/

app.use(
  "/api/payments",
  generalLimiter,
  paymentRoutes,
);

/*
|--------------------------------------------------------------------------
| Public Routes
|--------------------------------------------------------------------------
*/

app.use(
  "/api/public",
  generalLimiter,
  publicRoutes,
);

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use(notFound);

/*
|--------------------------------------------------------------------------
| Global Error Handler
|--------------------------------------------------------------------------
*/

app.use(errorHandler);

export default app;