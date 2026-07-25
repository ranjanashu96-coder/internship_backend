import { Router } from "express";import { authenticate,isMentor } from "../middleware/auth.js";
import { assignedStudents,reviewSubmission,submitAssessment } from "../controllers/mentorController.js";
const r=Router();r.use(authenticate,isMentor);r.get("/students",assignedStudents);r.patch("/submissions/:id/review",reviewSubmission);r.post("/students/:studentId/assessment",submitAssessment);export default r;
