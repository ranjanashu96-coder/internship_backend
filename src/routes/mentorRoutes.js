import { Router } from "express";

import { authenticate, isMentor } from "../middleware/auth.js";
import { chapterResourceUpload } from "../utils/chapterResourceUpload.js";

import {
  assignedStudents,
  reviewSubmission,
  submitAssessment,
  mentorDashboard,
} from "../controllers/mentorController.js";

import {
  mentorQuizList,
  mentorQuizById,
  mentorCreateQuiz,
  mentorUpdateQuiz,
  mentorDeleteQuiz,
  mentorQuizChapters,
} from "../controllers/mentorQuizController.js";

import {
  listMentorQuizReattempts,
  grantMentorQuizReattempt,
} from "../controllers/quizReattemptController.js";

import {
  mentorResourceChapters,
  mentorChapterResources,
  mentorCreateResource,
  mentorUpdateResource,
  mentorDeleteResource,
  mentorReorderResources,
} from "../controllers/mentorResourceController.js";

const r = Router();

r.use(authenticate, isMentor);

r.get("/dashboard", mentorDashboard);
r.get("/students", assignedStudents);
r.patch("/submissions/:id/review", reviewSubmission);
r.post("/students/:studentId/assessment", submitAssessment);

r.get("/quiz-chapters", mentorQuizChapters);
r.get("/quizzes", mentorQuizList);
r.get("/quizzes/:id", mentorQuizById);
r.post("/quizzes", mentorCreateQuiz);
r.put("/quizzes/:id", mentorUpdateQuiz);
r.delete("/quizzes/:id", mentorDeleteQuiz);

r.get("/quiz-reattempts", listMentorQuizReattempts);
r.post(
  "/students/:studentId/quizzes/:quizId/reattempt",
  grantMentorQuizReattempt,
);


// Mentor resource management (restricted to mentor domain)
r.get("/resource-chapters", mentorResourceChapters);
r.get("/chapters/:chapterId/resources", mentorChapterResources);
r.post(
  "/chapters/:chapterId/resources",
  chapterResourceUpload.single("file"),
  mentorCreateResource,
);
r.put(
  "/chapter-resources/:id",
  chapterResourceUpload.single("file"),
  mentorUpdateResource,
);
r.delete("/chapter-resources/:id", mentorDeleteResource);
r.put(
  "/chapters/:chapterId/resources/reorder",
  mentorReorderResources,
);

export default r;
