import { Router } from "express";import { verifyCertificate } from "../controllers/publicController.js";const r=Router();r.get("/certificates/:number",verifyCertificate);export default r;
