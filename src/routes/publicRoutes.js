import { Router } from "express";
import { verifyCertificate,getPublicLateFineInfo } from "../controllers/publicController.js";
const r=Router();
r.get("/certificates/:number",verifyCertificate);
r.get("/late-fine-info", getPublicLateFineInfo);
export default r;
