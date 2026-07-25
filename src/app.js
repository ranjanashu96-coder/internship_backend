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

import {
  notFound,
  errorHandler,
} from "./middleware/errorHandler.js";

const app = express();

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
| Rate Limiting
|--------------------------------------------------------------------------
*/

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

/*
|--------------------------------------------------------------------------
| JSON Body Parser
|--------------------------------------------------------------------------
|
| Cashfree webhook signature verification ke liye exact raw request body
| preserve ki ja rahi hai.
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit: "2mb",

    verify: (req, _res, buffer) => {
      if (
        req.originalUrl.startsWith(
          "/api/registration/payment/cashfree/webhook",
        )
      ) {
        req.rawBody = Buffer.from(buffer);
      }
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
*/

app.use(
  "/api/public/certificates",
  publicCertificateRoutes,
);

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

app.use(
  "/api/auth",
  authRoutes,
);

app.use(
  "/api/registration",
  registrationRoutes,
);

app.use(
  "/api/admin",
  adminRoutes,
);

app.use(
  "/api/college",
  collegeRoutes,
);

app.use(
  "/api/mentor",
  mentorRoutes,
);

app.use(
  "/api/student",
  studentRoutes,
);

app.use(
  "/api/payments",
  paymentRoutes,
);

app.use(
  "/api/public",
  publicRoutes,
);

/*
|--------------------------------------------------------------------------
| Error Handlers
|--------------------------------------------------------------------------
*/

app.use(notFound);
app.use(errorHandler);

export default app;