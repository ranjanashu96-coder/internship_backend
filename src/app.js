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
import { notFound,errorHandler } from "./middleware/errorHandler.js";
import publicCertificateRoutes from "./routes/publicCertificateRoutes.js";

const app=express();
app.use(cookieParser());
app.use(helmet({crossOriginResourcePolicy:{policy:"cross-origin"}}));
app.use(cors({origin:process.env.CLIENT_URL?.split(",")||true,credentials:true}));
app.use(rateLimit({windowMs:15*60*1000,limit:1000}));
app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use("/uploads",express.static(path.resolve("uploads")));
app.use(
  "/api/public/certificates",
  publicCertificateRoutes,
);
app.get("/health",(_req,res)=>res.json({success:true,data:{status:"ok"},message:"RKNexora API is healthy"}));
app.use("/api/auth",authRoutes);
app.use("/api/registration",registrationRoutes);
app.use("/api/admin",adminRoutes);
app.use("/api/college",collegeRoutes);
app.use("/api/mentor",mentorRoutes);
app.use("/api/student",studentRoutes);
app.use("/api/payments",paymentRoutes);
app.use("/api/public",publicRoutes);

app.use(notFound);app.use(errorHandler);

export default app;
