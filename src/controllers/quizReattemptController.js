import { Op } from "sequelize";

import {
  Quiz,
  QuizAttempt,
  QuizReattemptGrant,
  Student,
  Chapter,
  Module,
} from "../models/index.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";

const finalizedStatuses = ["submitted", "expired"];

const positiveId = (value, label) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(`${label} must be a positive integer`, 422);
  }
  return parsed;
};

const getExtraAttempts = async (studentId, quizId, transaction = null) => {
  const value = await QuizReattemptGrant.sum("extra_attempts", {
    where: { student_id: studentId, quiz_id: quizId },
    transaction,
  });
  return Number(value || 0);
};

const getAssignedStudent = async (mentor, studentId) => {
  const student = await Student.findOne({
    where: { id: studentId, mentor_id: mentor.id },
  });
  if (!student) {
    throw new AppError("Student is not assigned to this mentor", 403);
  }
  return student;
};

const ensureMentorQuizAccess = async (mentor, quizId) => {
  const quiz = await Quiz.findByPk(quizId);
  if (!quiz) throw new AppError("Quiz not found", 404);

  const chapter = await Chapter.findByPk(quiz.chapter_id);
  if (!chapter) throw new AppError("Quiz chapter not found", 404);

  const module = await Module.findByPk(chapter.module_id);
  if (!module || Number(module.domain_id) !== Number(mentor.domain_id)) {
    throw new AppError("You are not allowed to manage this quiz", 403);
  }

  return quiz;
};

const buildRows = async ({ mentor = null } = {}) => {
  const studentWhere = mentor ? { mentor_id: mentor.id } : {};
  const students = await Student.findAll({
    where: studentWhere,
    attributes: [
      "id",
      "name",
      "registration_number",
      "mentor_id",
      "domain_id",
      "internship_status",
    ],
    order: [["id", "DESC"]],
  });

  if (students.length === 0) return [];

  const studentIds = students.map((row) => Number(row.id));
  const studentMap = new Map(students.map((row) => [Number(row.id), row]));

  const attempts = await QuizAttempt.findAll({
    where: {
      student_id: { [Op.in]: studentIds },
      status: { [Op.in]: finalizedStatuses },
    },
    order: [["student_id", "ASC"], ["quiz_id", "ASC"], ["attempt_number", "DESC"]],
  });

  if (attempts.length === 0) return [];

  const quizIds = [...new Set(attempts.map((row) => Number(row.quiz_id)))];
  const quizzes = await Quiz.findAll({ where: { id: { [Op.in]: quizIds } } });
  const quizMap = new Map(quizzes.map((row) => [Number(row.id), row]));

  const grants = await QuizReattemptGrant.findAll({
    where: {
      student_id: { [Op.in]: studentIds },
      quiz_id: { [Op.in]: quizIds },
    },
  });

  const grantMap = new Map();
  for (const grant of grants) {
    const key = `${grant.student_id}:${grant.quiz_id}`;
    grantMap.set(key, Number(grantMap.get(key) || 0) + Number(grant.extra_attempts || 0));
  }

  const grouped = new Map();
  for (const attempt of attempts) {
    const key = `${attempt.student_id}:${attempt.quiz_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(attempt);
  }

  const rows = [];
  for (const [key, list] of grouped.entries()) {
    const [studentIdText, quizIdText] = key.split(":");
    const studentId = Number(studentIdText);
    const quizId = Number(quizIdText);
    const student = studentMap.get(studentId);
    const quiz = quizMap.get(quizId);
    if (!student || !quiz) continue;

    if (mentor) {
      try {
        await ensureMentorQuizAccess(mentor, quizId);
      } catch {
        continue;
      }
    }

    const passed = list.some((row) => Boolean(row.passed));
    if (passed) continue;

    const baseAllowed = Number(quiz.attempts_allowed || 1);
    const extraAttempts = Number(grantMap.get(key) || 0);
    const totalAllowed = baseAllowed + extraAttempts;
    const used = list.length;

    if (used < totalAllowed) continue;

    const latest = [...list].sort((a, b) => Number(b.attempt_number) - Number(a.attempt_number))[0];

    rows.push({
      student: {
        id: student.id,
        name: student.name,
        registration_number: student.registration_number,
        internship_status: student.internship_status,
      },
      quiz: {
        id: quiz.id,
        chapter_id: quiz.chapter_id,
        title: quiz.title,
        passing_score: Number(quiz.passing_score || 0),
        attempts_allowed: baseAllowed,
      },
      attempts_used: used,
      extra_attempts: extraAttempts,
      total_attempts_allowed: totalAllowed,
      latest_score: Number(latest?.percentage || 0),
      latest_attempt_id: latest?.id || null,
      latest_attempt_number: latest?.attempt_number || null,
    });
  }

  return rows.sort((a, b) => b.latest_score - a.latest_score);
};

const grantAttempt = async ({ req, res, actorType }) => {
  const studentId = positiveId(req.params.studentId, "Student ID");
  const quizId = positiveId(req.params.quizId, "Quiz ID");
  const extraAttempts = req.body?.extra_attempts === undefined
    ? 1
    : positiveId(req.body.extra_attempts, "Extra attempts");

  if (extraAttempts > 5) {
    throw new AppError("A maximum of 5 attempts can be granted at once", 422);
  }

  let student;
  let actorId;

  if (actorType === "mentor") {
    const mentor = req.mentor;
    if (!mentor) throw new AppError("Mentor profile not found", 404);
    student = await getAssignedStudent(mentor, studentId);
    await ensureMentorQuizAccess(mentor, quizId);
    actorId = mentor.id;
  } else {
    student = await Student.findByPk(studentId);
    if (!student) throw new AppError("Student not found", 404);
    actorId = req.user?.id;
  }

  const quiz = await Quiz.findByPk(quizId);
  if (!quiz) throw new AppError("Quiz not found", 404);

  const attempts = await QuizAttempt.findAll({
    where: {
      student_id: studentId,
      quiz_id: quizId,
      status: { [Op.in]: finalizedStatuses },
    },
  });

  if (attempts.some((row) => Boolean(row.passed))) {
    throw new AppError("Student has already passed this quiz", 422);
  }

  const baseAllowed = Number(quiz.attempts_allowed || 1);
  const currentExtra = await getExtraAttempts(studentId, quizId);
  const currentAllowed = baseAllowed + currentExtra;

  if (attempts.length < currentAllowed) {
    throw new AppError("Student still has quiz attempts remaining", 422);
  }

  const grant = await QuizReattemptGrant.create({
    student_id: studentId,
    quiz_id: quizId,
    extra_attempts: extraAttempts,
    granted_by_type: actorType,
    granted_by_id: actorId,
    reason: String(req.body?.reason || "").trim() || null,
  });

  return ok(
    res,
    {
      grant,
      student: {
        id: student.id,
        name: student.name,
        registration_number: student.registration_number,
      },
      quiz: {
        id: quiz.id,
        title: quiz.title,
      },
      attempts: {
        used: attempts.length,
        base_allowed: baseAllowed,
        previous_extra: currentExtra,
        granted_extra: extraAttempts,
        new_total_allowed: currentAllowed + extraAttempts,
        remaining: currentAllowed + extraAttempts - attempts.length,
      },
    },
    "Quiz reattempt granted successfully",
  );
};

export const listAdminQuizReattempts = asyncHandler(async (_req, res) => {
  const items = await buildRows();
  ok(res, { items, total: items.length }, "Failed quiz students fetched successfully");
});

export const listMentorQuizReattempts = asyncHandler(async (req, res) => {
  if (!req.mentor) throw new AppError("Mentor profile not found", 404);
  const items = await buildRows({ mentor: req.mentor });
  ok(res, { items, total: items.length }, "Failed quiz students fetched successfully");
});

export const grantAdminQuizReattempt = asyncHandler(async (req, res) => {
  await grantAttempt({ req, res, actorType: "admin" });
});

export const grantMentorQuizReattempt = asyncHandler(async (req, res) => {
  await grantAttempt({ req, res, actorType: "mentor" });
});

export { getExtraAttempts };
