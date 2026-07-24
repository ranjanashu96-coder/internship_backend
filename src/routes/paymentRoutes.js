import { Router } from "express";import { webhook } from "../controllers/paymentController.js";const r=Router();r.post("/webhook",webhook);export default r;
