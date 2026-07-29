import { Op } from "sequelize";

import sequelize from "../config/database.js";

import {
  Quiz,
  QuizAttempt,
  QuizAnswer,
  Chapter,
  Module,
  Student,
  ChapterCompletion,
} from "../models/index.js";

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const ACTIVE_QUIZ_STATUS = "active";

const ATTEMPT_STATUS = {
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  EXPIRED: "expired",
};

/*
|--------------------------------------------------------------------------
| Error and Response Helpers
|--------------------------------------------------------------------------
*/

const createError = (
  message,
  statusCode = 500,
) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sendSuccess = (
  res,
  statusCode,
  message,
  data = null,
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const parsePositiveInteger = (
  value,
  fieldName,
) => {
  const parsedValue = Number(value);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue <= 0
  ) {
    throw createError(
      `${fieldName} must be a positive integer`,
      422,
    );
  }

  return parsedValue;
};

/*
|--------------------------------------------------------------------------
| Student Resolution
|--------------------------------------------------------------------------
|
| Adjust this helper only if req.user uses a different property.
|
| Recommended authenticated student object:
|
| req.user = {
|   id: students.id,
|   role: "student"
| }
|
|--------------------------------------------------------------------------
*/

const resolveStudentId = async (
  req,
  transaction = null,
) => {
  if (!req.user) {
    throw createError(
      "Authentication is required",
      401,
    );
  }

  if (
    req.user.role &&
    req.user.role !== "student"
  ) {
    throw createError(
      "Student access is required",
      403,
    );
  }

  const possibleStudentId =
    req.user.student_id ??
    req.user.studentId ??
    req.user.id;

  if (!possibleStudentId) {
    throw createError(
      "Authenticated student ID was not found",
      401,
    );
  }

  const parsedId = Number(
    possibleStudentId,
  );

  /*
   * First try students.id.
   */
  let student = await Student.findByPk(
    parsedId,
    {
      transaction,
    },
  );

  /*
   * Optional fallback:
   * If the authentication token contains users.id
   * and Student has a user_id column.
   */
  if (
    !student &&
    Student.rawAttributes?.user_id
  ) {
    student = await Student.findOne({
      where: {
        user_id: parsedId,
      },
      transaction,
    });
  }

  if (!student) {
    throw createError(
      "Student record not found",
      404,
    );
  }

  if (
    student.internship_status ===
    "blocked"
  ) {
    throw createError(
      "Student account is blocked",
      403,
    );
  }

  return Number(student.id);
};

/*
|--------------------------------------------------------------------------
| Quiz Data Helpers
|--------------------------------------------------------------------------
*/

const parseQuestions = (
  questionsJson,
) => {
  let questions = questionsJson;

  if (typeof questions === "string") {
    try {
      questions = JSON.parse(
        questions,
      );
    } catch {
      throw createError(
        "Quiz questions are invalid",
        500,
      );
    }
  }

  if (!Array.isArray(questions)) {
    throw createError(
      "Quiz questions are invalid",
      500,
    );
  }

  return questions;
};

const getQuestionId = (
  question,
  index,
) => {
  return String(
    question.id ||
      `question-${index + 1}`,
  );
};

const calculateTotalMarks = (
  questions,
) => {
  return questions.reduce(
    (total, question) =>
      total +
      Number(question.marks || 0),
    0,
  );
};

const sanitizeQuestionsForStudent = (
  questions,
) => {
  return questions.map(
    (question, index) => ({
      id: getQuestionId(
        question,
        index,
      ),

      question:
        question.question ||
        question.question_text ||
        "",

      options: Array.isArray(
        question.options,
      )
        ? question.options.map(
            (option) => ({
              id: String(
                option.id,
              ),
              text: String(
                option.text ?? "",
              ),
            }),
          )
        : [],

      marks: Number(
        question.marks || 0,
      ),
    }),
  );
};

const shuffleArray = (
  values,
) => {
  const result = [...values];

  for (
    let index =
      result.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex =
      Math.floor(
        Math.random() *
          (index + 1),
      );

    [
      result[index],
      result[randomIndex],
    ] = [
      result[randomIndex],
      result[index],
    ];
  }

  return result;
};

const prepareStudentQuestions = (
  quiz,
  questions,
) => {
  const safeQuestions =
    sanitizeQuestionsForStudent(
      questions,
    );

  if (quiz.randomize_questions) {
    return shuffleArray(
      safeQuestions,
    );
  }

  return safeQuestions;
};

const getQuizInclude = () => [
  {
    model: Chapter,
    as: "chapter",
    attributes: [
      "id",
      "module_id",
      "chapter_number",
      "chapter_name",
      "description",
      "status",
    ],

    include: [
      {
        model: Module,
        attributes: [
          "id",
          "domain_id",
          "module_number",
          "module_name",
        ],
      },
    ],
  },
];

const getQuizOrFail = async (
  quizId,
  options = {},
) => {
  const quiz = await Quiz.findByPk(
    quizId,
    {
      include: getQuizInclude(),
      transaction:
        options.transaction,
      lock: options.lock,
    },
  );

  if (!quiz) {
    throw createError(
      "Quiz not found",
      404,
    );
  }

  return quiz;
};

const ensureQuizIsAvailable = (
  quiz,
) => {
  if (
    quiz.status &&
    quiz.status !==
      ACTIVE_QUIZ_STATUS
  ) {
    throw createError(
      "This quiz is not currently active",
      403,
    );
  }

  if (
    quiz.chapter &&
    quiz.chapter.status &&
    quiz.chapter.status !==
      "published"
  ) {
    throw createError(
      "This chapter is not currently active",
      403,
    );
  }

  const questions =
    parseQuestions(
      quiz.questions_json,
    );

  if (questions.length === 0) {
    throw createError(
      "This quiz does not contain any questions",
      422,
    );
  }

  return questions;
};

/*
|--------------------------------------------------------------------------
| Timer Helpers
|--------------------------------------------------------------------------
*/

const calculateExpiresAt = (
  quiz,
  startedAt,
) => {
  const timeLimit =
    Number(
      quiz.time_limit_minutes,
    );

  if (
    !Number.isInteger(timeLimit) ||
    timeLimit <= 0
  ) {
    return null;
  }

  return new Date(
    startedAt.getTime() +
      timeLimit * 60 * 1000,
  );
};

const calculateTimeTaken = (
  startedAt,
  submittedAt,
) => {
  const difference =
    submittedAt.getTime() -
    new Date(startedAt).getTime();

  return Math.max(
    0,
    Math.floor(difference / 1000),
  );
};

const isAttemptExpired = (
  attempt,
  currentTime = new Date(),
) => {
  return Boolean(
    attempt.expires_at &&
      currentTime.getTime() >
        new Date(
          attempt.expires_at,
        ).getTime(),
  );
};

const markAttemptExpired = async (
  attempt,
  transaction = null,
) => {
  if (
    attempt.status !==
    ATTEMPT_STATUS.IN_PROGRESS
  ) {
    return;
  }

  await attempt.update(
    {
      status:
        ATTEMPT_STATUS.EXPIRED,
      submitted_at: new Date(),
      passed: false,
      obtained_marks: 0,
      percentage: 0,
      time_taken_seconds:
        calculateTimeTaken(
          attempt.started_at,
          new Date(),
        ),
    },
    {
      transaction,
    },
  );
};

/*
|--------------------------------------------------------------------------
| Chapter Completion
|--------------------------------------------------------------------------
*/

const completeChapter = async ({
  studentId,
  chapterId,
  transaction,
}) => {
  if (!ChapterCompletion) {
    return;
  }

  const defaults = {
    student_id: studentId,
    chapter_id: chapterId,
    status: "completed",
    completed_at: new Date(),
  };

  const [
    completion,
    created,
  ] =
    await ChapterCompletion.findOrCreate({
      where: {
        student_id: studentId,
        chapter_id: chapterId,
      },
      defaults,
      transaction,
    });

  if (!created) {
    await completion.update(
      {
        status: "completed",
        completed_at:
          completion.completed_at ||
          new Date(),
      },
      {
        transaction,
      },
    );
  }
};

/*
|--------------------------------------------------------------------------
| GET /student/quizzes/:quizId
|--------------------------------------------------------------------------
| Returns quiz information without correct answers.
|--------------------------------------------------------------------------
*/

export const getQuizDetails = async (
  req,
  res,
  next,
) => {
  try {
    const quizId =
      parsePositiveInteger(
        req.params.quizId,
        "Quiz ID",
      );

    const studentId =
      await resolveStudentId(req);

    const quiz =
      await getQuizOrFail(
        quizId,
      );

    const questions =
      ensureQuizIsAvailable(
        quiz,
      );

    const attemptCount =
      await QuizAttempt.count({
        where: {
          quiz_id: quizId,
          student_id: studentId,
        },
      });

    const submittedAttempts =
      await QuizAttempt.count({
        where: {
          quiz_id: quizId,
          student_id: studentId,
          status: {
            [Op.in]: [
              ATTEMPT_STATUS.SUBMITTED,
              ATTEMPT_STATUS.EXPIRED,
            ],
          },
        },
      });

    let activeAttempt =
      await QuizAttempt.findOne({
        where: {
          quiz_id: quizId,
          student_id: studentId,
          status:
            ATTEMPT_STATUS.IN_PROGRESS,
        },
        order: [
          ["id", "DESC"],
        ],
      });

    if (
      activeAttempt &&
      isAttemptExpired(
        activeAttempt,
      )
    ) {
      await markAttemptExpired(
        activeAttempt,
      );

      activeAttempt = null;
    }

    const attemptsAllowed =
      Number(
        quiz.attempts_allowed || 1,
      );

    return sendSuccess(
      res,
      200,
      "Quiz details fetched successfully",
      {
        quiz: {
          id: quiz.id,
          chapter_id:
            quiz.chapter_id,
          title: quiz.title,
          description:
            quiz.description,
          passing_score:
            Number(
              quiz.passing_score,
            ),
          total_marks:
            Number(
              quiz.total_marks ||
                calculateTotalMarks(
                  questions,
                ),
            ),
          attempts_allowed:
            attemptsAllowed,
          time_limit_minutes:
            quiz.time_limit_minutes,
          randomize_questions:
            Boolean(
              quiz.randomize_questions,
            ),
          show_result_immediately:
            Boolean(
              quiz.show_result_immediately,
            ),
          chapter:
            quiz.chapter,
          question_count:
            questions.length,
        },

        attempt_summary: {
          total_attempt_records:
            attemptCount,
          attempts_used:
            submittedAttempts,
          attempts_remaining:
            Math.max(
              0,
              attemptsAllowed -
                submittedAttempts,
            ),
          can_start:
            Boolean(
              activeAttempt ||
                submittedAttempts <
                  attemptsAllowed,
            ),
          active_attempt_id:
            activeAttempt?.id ||
            null,
        },
      },
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| POST /student/quizzes/:quizId/start
|--------------------------------------------------------------------------
*/

export const startQuiz = async (
  req,
  res,
  next,
) => {
  const transaction =
    await sequelize.transaction();

  try {
    const quizId =
      parsePositiveInteger(
        req.params.quizId,
        "Quiz ID",
      );

    const studentId =
      await resolveStudentId(
        req,
        transaction,
      );

    const quiz =
      await getQuizOrFail(
        quizId,
        {
          transaction,
        },
      );

    const questions =
      ensureQuizIsAvailable(
        quiz,
      );

    /*
     * Reuse an existing active attempt.
     */
    let activeAttempt =
      await QuizAttempt.findOne({
        where: {
          quiz_id: quizId,
          student_id: studentId,
          status:
            ATTEMPT_STATUS.IN_PROGRESS,
        },
        order: [
          ["id", "DESC"],
        ],
        transaction,
        lock:
          transaction.LOCK.UPDATE,
      });

    if (activeAttempt) {
      if (
        isAttemptExpired(
          activeAttempt,
        )
      ) {
        await markAttemptExpired(
          activeAttempt,
          transaction,
        );

        activeAttempt = null;
      } else {
        await transaction.commit();

        return sendSuccess(
          res,
          200,
          "Existing quiz attempt resumed successfully",
          {
            attempt: {
              id:
                activeAttempt.id,
              attempt_number:
                activeAttempt.attempt_number,
              started_at:
                activeAttempt.started_at,
              expires_at:
                activeAttempt.expires_at,
              status:
                activeAttempt.status,
            },

            quiz: {
              id: quiz.id,
              title: quiz.title,
              description:
                quiz.description,
              passing_score:
                Number(
                  quiz.passing_score,
                ),
              total_marks:
                Number(
                  quiz.total_marks ||
                    calculateTotalMarks(
                      questions,
                    ),
                ),
              time_limit_minutes:
                quiz.time_limit_minutes,
              question_count:
                questions.length,
            },

            questions:
              prepareStudentQuestions(
                quiz,
                questions,
              ),
          },
        );
      }
    }

    /*
     * Count all finalized attempts.
     * Expired attempts also consume an attempt.
     */
    const usedAttempts =
      await QuizAttempt.count({
        where: {
          quiz_id: quizId,
          student_id: studentId,
          status: {
            [Op.in]: [
              ATTEMPT_STATUS.SUBMITTED,
              ATTEMPT_STATUS.EXPIRED,
            ],
          },
        },
        transaction,
      });

    const attemptsAllowed =
      Number(
        quiz.attempts_allowed || 1,
      );

    if (
      usedAttempts >=
      attemptsAllowed
    ) {
      throw createError(
        "No quiz attempts are remaining",
        403,
      );
    }

    const latestAttempt =
      await QuizAttempt.max(
        "attempt_number",
        {
          where: {
            quiz_id: quizId,
            student_id: studentId,
          },
          transaction,
        },
      );

    const attemptNumber =
      Number(latestAttempt || 0) +
      1;

    const startedAt =
      new Date();

    const expiresAt =
      calculateExpiresAt(
        quiz,
        startedAt,
      );

    const totalMarks =
      Number(
        quiz.total_marks ||
          calculateTotalMarks(
            questions,
          ),
      );

    const attempt =
      await QuizAttempt.create(
        {
          quiz_id: quizId,
          student_id: studentId,
          attempt_number:
            attemptNumber,
          total_marks:
            totalMarks,
          obtained_marks: 0,
          percentage: 0,
          passed: false,
          status:
            ATTEMPT_STATUS.IN_PROGRESS,
          started_at:
            startedAt,
          expires_at:
            expiresAt,
          submitted_at: null,
          time_taken_seconds:
            null,
        },
        {
          transaction,
        },
      );

    await transaction.commit();

    return sendSuccess(
      res,
      201,
      "Quiz attempt started successfully",
      {
        attempt: {
          id: attempt.id,
          attempt_number:
            attempt.attempt_number,
          started_at:
            attempt.started_at,
          expires_at:
            attempt.expires_at,
          status:
            attempt.status,
        },

        quiz: {
          id: quiz.id,
          chapter_id:
            quiz.chapter_id,
          title: quiz.title,
          description:
            quiz.description,
          passing_score:
            Number(
              quiz.passing_score,
            ),
          total_marks:
            totalMarks,
          time_limit_minutes:
            quiz.time_limit_minutes,
          attempts_allowed:
            attemptsAllowed,
          question_count:
            questions.length,
        },

        questions:
          prepareStudentQuestions(
            quiz,
            questions,
          ),
      },
    );
  } catch (error) {
  if (!transaction.finished) {
    await transaction.rollback();
  }

  if (
    error.name ===
    "SequelizeUniqueConstraintError"
  ) {
    return next(
      createError(
        "A quiz attempt is already being created. Please try again",
        409,
      ),
    );
  }

  next(error);
}
};

/*
|--------------------------------------------------------------------------
| POST /student/quiz-attempts/:attemptId/submit
|--------------------------------------------------------------------------
|
| Request:
|
| {
|   "answers": [
|     {
|       "question_id": "question-1",
|       "selected_option_id": "option-2"
|     }
|   ]
| }
|--------------------------------------------------------------------------
*/

export const submitQuiz = async (
  req,
  res,
  next,
) => {
  const transaction =
    await sequelize.transaction();

  try {
    const attemptId =
      parsePositiveInteger(
        req.params.attemptId,
        "Attempt ID",
      );

    const studentId =
      await resolveStudentId(
        req,
        transaction,
      );

    const attempt =
      await QuizAttempt.findOne({
        where: {
          id: attemptId,
          student_id: studentId,
        },
        transaction,
        lock:
          transaction.LOCK.UPDATE,
      });

    if (!attempt) {
      throw createError(
        "Quiz attempt not found",
        404,
      );
    }

    if (
      attempt.status ===
      ATTEMPT_STATUS.SUBMITTED
    ) {
      throw createError(
        "This quiz attempt has already been submitted",
        409,
      );
    }

    if (
      attempt.status ===
      ATTEMPT_STATUS.EXPIRED
    ) {
      throw createError(
        "This quiz attempt has expired",
        410,
      );
    }

    const submittedAt =
      new Date();

    if (
      isAttemptExpired(
        attempt,
        submittedAt,
      )
    ) {
      await markAttemptExpired(
        attempt,
        transaction,
      );

      await transaction.commit();

      return next(
        createError(
          "The quiz time limit has expired",
          410,
        ),
      );
    }

    const quiz =
      await Quiz.findByPk(
        attempt.quiz_id,
        {
          transaction,
        },
      );

    if (!quiz) {
      throw createError(
        "Quiz not found",
        404,
      );
    }

    const questions =
      parseQuestions(
        quiz.questions_json,
      );

    if (questions.length === 0) {
      throw createError(
        "Quiz questions are unavailable",
        422,
      );
    }

    const submittedAnswers =
      req.body?.answers;

    if (
      !Array.isArray(
        submittedAnswers,
      )
    ) {
      throw createError(
        "Answers must be an array",
        422,
      );
    }

    /*
     * Convert answers into a lookup map.
     * Duplicate question IDs are rejected.
     */
    const answerMap =
      new Map();

    for (
      const submittedAnswer of
      submittedAnswers
    ) {
      if (
        !submittedAnswer ||
        typeof submittedAnswer !==
          "object"
      ) {
        throw createError(
          "An answer entry is invalid",
          422,
        );
      }

      const questionId =
        String(
          submittedAnswer.question_id ||
            "",
        ).trim();

      if (!questionId) {
        throw createError(
          "Question ID is required for every answer",
          422,
        );
      }

      if (
        answerMap.has(
          questionId,
        )
      ) {
        throw createError(
          `Duplicate answer was submitted for question ${questionId}`,
          422,
        );
      }

      const selectedOptionId =
        submittedAnswer.selected_option_id ===
          null ||
        submittedAnswer.selected_option_id ===
          undefined ||
        submittedAnswer.selected_option_id ===
          ""
          ? null
          : String(
              submittedAnswer.selected_option_id,
            ).trim();

      answerMap.set(
        questionId,
        selectedOptionId,
      );
    }

    const validQuestionIds =
      new Set(
        questions.map(
          (question, index) =>
            getQuestionId(
              question,
              index,
            ),
        ),
      );

    for (const questionId of answerMap.keys()) {
      if (
        !validQuestionIds.has(
          questionId,
        )
      ) {
        throw createError(
          `Question ${questionId} does not belong to this quiz`,
          422,
        );
      }
    }

    let obtainedMarks = 0;
    let correctAnswers = 0;
    let wrongAnswers = 0;
    let unansweredQuestions = 0;

    const answerRows =
      questions.map(
        (question, index) => {
          const questionId =
            getQuestionId(
              question,
              index,
            );

          const selectedOptionId =
            answerMap.get(
              questionId,
            ) ?? null;

          const validOptions =
            Array.isArray(
              question.options,
            )
              ? question.options
              : [];

          if (
            selectedOptionId &&
            !validOptions.some(
              (option) =>
                String(
                  option.id,
                ) ===
                selectedOptionId,
            )
          ) {
            throw createError(
              `Selected option for question ${questionId} is invalid`,
              422,
            );
          }

          const correctOptionId =
            String(
              question.correct_option_id ||
                "",
            );

          const marksAllocated =
            Number(
              question.marks || 0,
            );

          const isCorrect =
            Boolean(
              selectedOptionId &&
                selectedOptionId ===
                  correctOptionId,
            );

          const marksObtained =
            isCorrect
              ? marksAllocated
              : 0;

          if (!selectedOptionId) {
            unansweredQuestions += 1;
          } else if (isCorrect) {
            correctAnswers += 1;
          } else {
            wrongAnswers += 1;
          }

          obtainedMarks +=
            marksObtained;

          return {
            attempt_id:
              attempt.id,
            question_id:
              questionId,
            selected_option_id:
              selectedOptionId,
            is_correct:
              isCorrect,
            marks_allocated:
              marksAllocated,
            marks_obtained:
              marksObtained,
          };
        },
      );

    const totalMarks =
      Number(
        attempt.total_marks ||
          quiz.total_marks ||
          calculateTotalMarks(
            questions,
          ),
      );

    const percentage =
      totalMarks > 0
        ? Number(
            (
              (obtainedMarks /
                totalMarks) *
              100
            ).toFixed(2),
          )
        : 0;

    const passingScore =
      Number(
        quiz.passing_score || 0,
      );

    const passed =
      percentage >= passingScore;

    /*
     * Protect against duplicate answers if submission is retried.
     */
    await QuizAnswer.destroy({
      where: {
        attempt_id:
          attempt.id,
      },
      transaction,
    });

    await QuizAnswer.bulkCreate(
      answerRows,
      {
        transaction,
      },
    );

    const timeTakenSeconds =
      calculateTimeTaken(
        attempt.started_at,
        submittedAt,
      );

    await attempt.update(
      {
        total_marks:
          totalMarks,
        obtained_marks:
          Number(
            obtainedMarks.toFixed(
              2,
            ),
          ),
        percentage,
        passed,
        status:
          ATTEMPT_STATUS.SUBMITTED,
        submitted_at:
          submittedAt,
        time_taken_seconds:
          timeTakenSeconds,
      },
      {
        transaction,
      },
    );

    if (passed) {
      await completeChapter({
        studentId,
        chapterId:
          quiz.chapter_id,
        transaction,
      });
    }

    await transaction.commit();

    const basicResult = {
      attempt_id:
        attempt.id,
      attempt_number:
        attempt.attempt_number,
      total_questions:
        questions.length,
      answered_questions:
        questions.length -
        unansweredQuestions,
      correct_answers:
        correctAnswers,
      wrong_answers:
        wrongAnswers,
      unanswered_questions:
        unansweredQuestions,
      total_marks:
        totalMarks,
      obtained_marks:
        Number(
          obtainedMarks.toFixed(
            2,
          ),
        ),
      percentage,
      passing_score:
        passingScore,
      passed,
      status:
        ATTEMPT_STATUS.SUBMITTED,
      started_at:
        attempt.started_at,
      submitted_at:
        submittedAt,
      time_taken_seconds:
        timeTakenSeconds,
      chapter_completed:
        passed,
    };

    /*
     * Do not expose correct answers when immediate results are disabled.
     */
    if (
      quiz.show_result_immediately ===
      false
    ) {
      return sendSuccess(
        res,
        200,
        "Quiz submitted successfully",
        basicResult,
      );
    }

    const detailedAnswers =
      questions.map(
        (question, index) => {
          const questionId =
            getQuestionId(
              question,
              index,
            );

          const selectedOptionId =
            answerMap.get(
              questionId,
            ) ?? null;

          const correctOptionId =
            String(
              question.correct_option_id ||
                "",
            );

          return {
            question_id:
              questionId,
            question:
              question.question ||
              question.question_text ||
              "",
            options:
              question.options || [],
            selected_option_id:
              selectedOptionId,
            correct_option_id:
              correctOptionId,
            is_correct:
              Boolean(
                selectedOptionId &&
                  selectedOptionId ===
                    correctOptionId,
              ),
            marks_allocated:
              Number(
                question.marks ||
                  0,
              ),
            marks_obtained:
              selectedOptionId ===
              correctOptionId
                ? Number(
                    question.marks ||
                      0,
                  )
                : 0,
            explanation:
              question.explanation ||
              null,
          };
        },
      );

    return sendSuccess(
      res,
      200,
      "Quiz submitted successfully",
      {
        ...basicResult,
        answers:
          detailedAnswers,
      },
    );
  } catch (error) {
    if (
      !transaction.finished
    ) {
      await transaction.rollback();
    }

    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| GET /student/quiz-attempts/:attemptId/result
|--------------------------------------------------------------------------
*/

export const getQuizAttemptResult = async (
  req,
  res,
  next,
) => {
  try {
    const attemptId =
      parsePositiveInteger(
        req.params.attemptId,
        "Attempt ID",
      );

    const studentId =
      await resolveStudentId(req);

    const attempt =
      await QuizAttempt.findOne({
        where: {
          id: attemptId,
          student_id: studentId,
        },

        include: [
          {
            model: Quiz,
            as: "quiz",

            include:
              getQuizInclude(),
          },

          {
            model: QuizAnswer,
            as: "answers",
          },
        ],
      });

    if (!attempt) {
      throw createError(
        "Quiz attempt not found",
        404,
      );
    }

    if (
      attempt.status ===
        ATTEMPT_STATUS.IN_PROGRESS &&
      isAttemptExpired(attempt)
    ) {
      await markAttemptExpired(
        attempt,
      );

      throw createError(
        "This quiz attempt has expired",
        410,
      );
    }

    if (
      attempt.status ===
      ATTEMPT_STATUS.IN_PROGRESS
    ) {
      throw createError(
        "This quiz attempt has not been submitted",
        409,
      );
    }

    const quiz =
      attempt.quiz;

    if (!quiz) {
      throw createError(
        "Quiz information was not found",
        404,
      );
    }

    const questions =
      parseQuestions(
        quiz.questions_json,
      );

    const savedAnswerMap =
      new Map(
        (attempt.answers || []).map(
          (answer) => [
            String(
              answer.question_id,
            ),
            answer,
          ],
        ),
      );

    const result = {
      attempt: {
        id: attempt.id,
        attempt_number:
          attempt.attempt_number,
        total_marks:
          Number(
            attempt.total_marks,
          ),
        obtained_marks:
          Number(
            attempt.obtained_marks,
          ),
        percentage:
          Number(
            attempt.percentage,
          ),
        passing_score:
          Number(
            quiz.passing_score,
          ),
        passed:
          Boolean(
            attempt.passed,
          ),
        status:
          attempt.status,
        started_at:
          attempt.started_at,
        submitted_at:
          attempt.submitted_at,
        expires_at:
          attempt.expires_at,
        time_taken_seconds:
          attempt.time_taken_seconds,
      },

      quiz: {
        id: quiz.id,
        title: quiz.title,
        description:
          quiz.description,
        chapter_id:
          quiz.chapter_id,
        chapter:
          quiz.chapter,
      },
    };

    if (
      quiz.show_result_immediately ===
      false
    ) {
      return sendSuccess(
        res,
        200,
        "Quiz result fetched successfully",
        result,
      );
    }

    result.answers =
      questions.map(
        (question, index) => {
          const questionId =
            getQuestionId(
              question,
              index,
            );

          const savedAnswer =
            savedAnswerMap.get(
              questionId,
            );

          return {
            question_id:
              questionId,
            question:
              question.question ||
              question.question_text ||
              "",
            options:
              question.options || [],
            selected_option_id:
              savedAnswer?.selected_option_id ||
              null,
            correct_option_id:
              question.correct_option_id,
            is_correct:
              Boolean(
                savedAnswer?.is_correct,
              ),
            marks_allocated:
              Number(
                savedAnswer?.marks_allocated ??
                  question.marks ??
                  0,
              ),
            marks_obtained:
              Number(
                savedAnswer?.marks_obtained ??
                  0,
              ),
            explanation:
              question.explanation ||
              null,
          };
        },
      );

    return sendSuccess(
      res,
      200,
      "Quiz result fetched successfully",
      result,
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| GET /student/quizzes/:quizId/attempts
|--------------------------------------------------------------------------
*/

export const listMyQuizAttempts = async (
  req,
  res,
  next,
) => {
  try {
    const quizId =
      parsePositiveInteger(
        req.params.quizId,
        "Quiz ID",
      );

    const studentId =
      await resolveStudentId(req);

    const quiz =
      await Quiz.findByPk(
        quizId,
        {
          attributes: [
            "id",
            "chapter_id",
            "title",
            "passing_score",
            "attempts_allowed",
          ],
        },
      );

    if (!quiz) {
      throw createError(
        "Quiz not found",
        404,
      );
    }

    const attempts =
      await QuizAttempt.findAll({
        where: {
          quiz_id: quizId,
          student_id: studentId,
        },

        attributes: [
          "id",
          "attempt_number",
          "total_marks",
          "obtained_marks",
          "percentage",
          "passed",
          "status",
          "started_at",
          "submitted_at",
          "expires_at",
          "time_taken_seconds",
        ],

        order: [
          [
            "attempt_number",
            "DESC",
          ],
        ],
      });

    return sendSuccess(
      res,
      200,
      "Quiz attempts fetched successfully",
      {
        quiz: {
          id: quiz.id,
          title: quiz.title,
          passing_score:
            Number(
              quiz.passing_score,
            ),
          attempts_allowed:
            Number(
              quiz.attempts_allowed ||
                1,
            ),
        },

        attempts:
          attempts.map(
            (attempt) => ({
              ...attempt.toJSON(),
              total_marks:
                Number(
                  attempt.total_marks,
                ),
              obtained_marks:
                Number(
                  attempt.obtained_marks,
                ),
              percentage:
                Number(
                  attempt.percentage,
                ),
              passed:
                Boolean(
                  attempt.passed,
                ),
            }),
          ),
      },
    );
  } catch (error) {
    next(error);
  }
};