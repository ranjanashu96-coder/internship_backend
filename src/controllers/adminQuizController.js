import { Op } from "sequelize";

import {
  Quiz,
  Chapter,
  Module,
  Domain,
} from "../models/index.js";

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const VALID_STATUSES = [
  "draft",
  "active",
  "inactive",
];

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/*
|--------------------------------------------------------------------------
| Utility Functions
|--------------------------------------------------------------------------
*/

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

const createError = (
  message,
  statusCode = 500,
) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parsePositiveInteger = (
  value,
  fieldName,
  options = {},
) => {
  const {
    allowNull = false,
  } = options;

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    if (allowNull) {
      return null;
    }

    throw createError(
      `${fieldName} is required`,
      422,
    );
  }

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

const parseBoolean = (
  value,
  defaultValue = false,
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalizedValue = String(value)
    .trim()
    .toLowerCase();

  if (
    normalizedValue === "true" ||
    normalizedValue === "1"
  ) {
    return true;
  }

  if (
    normalizedValue === "false" ||
    normalizedValue === "0"
  ) {
    return false;
  }

  return defaultValue;
};

const parseDecimal = (
  value,
  fieldName,
  options = {},
) => {
  const {
    min = null,
    max = null,
    defaultValue = null,
  } = options;

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    if (defaultValue !== null) {
      return defaultValue;
    }

    throw createError(
      `${fieldName} is required`,
      422,
    );
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw createError(
      `${fieldName} must be a valid number`,
      422,
    );
  }

  if (
    min !== null &&
    parsedValue < min
  ) {
    throw createError(
      `${fieldName} cannot be less than ${min}`,
      422,
    );
  }

  if (
    max !== null &&
    parsedValue > max
  ) {
    throw createError(
      `${fieldName} cannot be greater than ${max}`,
      422,
    );
  }

  return parsedValue;
};

const createQuestionId = (
  index,
) => {
  return `question-${index + 1}`;
};

const createOptionId = (
  questionIndex,
  optionIndex,
) => {
  return `question-${questionIndex + 1}-option-${optionIndex + 1}`;
};

/*
|--------------------------------------------------------------------------
| Question Validation
|--------------------------------------------------------------------------
*/

const normalizeQuestionOptions = (
  rawOptions,
  questionIndex,
) => {
  if (!Array.isArray(rawOptions)) {
    throw createError(
      `Options for question ${questionIndex + 1} must be an array`,
      422,
    );
  }

  if (rawOptions.length < 2) {
    throw createError(
      `Question ${questionIndex + 1} must have at least two options`,
      422,
    );
  }

  const normalizedOptions = rawOptions.map(
    (
      rawOption,
      optionIndex,
    ) => {
      let optionId;
      let optionText;

      if (
        typeof rawOption === "string" ||
        typeof rawOption === "number"
      ) {
        optionId = createOptionId(
          questionIndex,
          optionIndex,
        );

        optionText = String(
          rawOption,
        ).trim();
      } else if (
        rawOption &&
        typeof rawOption === "object"
      ) {
        optionId = String(
          rawOption.id ||
            createOptionId(
              questionIndex,
              optionIndex,
            ),
        ).trim();

        optionText = String(
          rawOption.text || "",
        ).trim();
      } else {
        throw createError(
          `Option ${optionIndex + 1} of question ${questionIndex + 1} is invalid`,
          422,
        );
      }

      if (!optionText) {
        throw createError(
          `Option ${optionIndex + 1} of question ${questionIndex + 1} cannot be empty`,
          422,
        );
      }

      return {
        id: optionId,
        text: optionText,
      };
    },
  );

  const uniqueTexts = new Set(
    normalizedOptions.map(
      (option) =>
        option.text
          .toLowerCase()
          .trim(),
    ),
  );

  if (
    uniqueTexts.size !==
    normalizedOptions.length
  ) {
    throw createError(
      `Question ${questionIndex + 1} contains duplicate options`,
      422,
    );
  }

  const uniqueIds = new Set(
    normalizedOptions.map(
      (option) => option.id,
    ),
  );

  if (
    uniqueIds.size !==
    normalizedOptions.length
  ) {
    throw createError(
      `Question ${questionIndex + 1} contains duplicate option IDs`,
      422,
    );
  }

  return normalizedOptions;
};

const normalizeQuestions = (
  rawQuestions,
) => {
  let questions = rawQuestions;

  if (typeof questions === "string") {
    try {
      questions = JSON.parse(
        questions,
      );
    } catch {
      throw createError(
        "Questions JSON is invalid",
        422,
      );
    }
  }

  if (!Array.isArray(questions)) {
    throw createError(
      "Questions must be an array",
      422,
    );
  }

  if (questions.length === 0) {
    throw createError(
      "At least one question is required",
      422,
    );
  }

  return questions.map(
    (
      rawQuestion,
      questionIndex,
    ) => {
      if (
        !rawQuestion ||
        typeof rawQuestion !==
          "object"
      ) {
        throw createError(
          `Question ${questionIndex + 1} is invalid`,
          422,
        );
      }

      const questionText = String(
        rawQuestion.question ||
          rawQuestion.question_text ||
          "",
      ).trim();

      if (!questionText) {
        throw createError(
          `Question ${questionIndex + 1} text is required`,
          422,
        );
      }

      const options =
        normalizeQuestionOptions(
          rawQuestion.options,
          questionIndex,
        );

      let correctOptionId = String(
        rawQuestion.correct_option_id ||
          "",
      ).trim();

      /*
       * Backward compatibility:
       * correct_option: 0, 1, 2...
       */
      if (
        !correctOptionId &&
        rawQuestion.correct_option !==
          undefined
      ) {
        const correctOptionIndex =
          Number(
            rawQuestion.correct_option,
          );

        if (
          Number.isInteger(
            correctOptionIndex,
          ) &&
          correctOptionIndex >= 0 &&
          correctOptionIndex <
            options.length
        ) {
          correctOptionId =
            options[
              correctOptionIndex
            ].id;
        }
      }

      if (!correctOptionId) {
        throw createError(
          `Correct option for question ${questionIndex + 1} is required`,
          422,
        );
      }

      const correctOptionExists =
        options.some(
          (option) =>
            option.id ===
            correctOptionId,
        );

      if (
        !correctOptionExists
      ) {
        throw createError(
          `Correct option for question ${questionIndex + 1} is invalid`,
          422,
        );
      }

      const marks = parseDecimal(
        rawQuestion.marks ?? 1,
        `Marks for question ${questionIndex + 1}`,
        {
          min: 0.01,
        },
      );

      const questionId = String(
        rawQuestion.id ||
          createQuestionId(
            questionIndex,
          ),
      ).trim();

      const explanation =
        rawQuestion.explanation !==
          undefined &&
        rawQuestion.explanation !==
          null
          ? String(
              rawQuestion.explanation,
            ).trim()
          : null;

      return {
        id: questionId,
        question: questionText,
        options,
        correct_option_id:
          correctOptionId,
        marks,
        explanation:
          explanation || null,
      };
    },
  );
};

const calculateTotalMarks = (
  questions,
) => {
  return questions.reduce(
    (total, question) => {
      return (
        total +
        Number(
          question.marks || 0,
        )
      );
    },
    0,
  );
};

/*
|--------------------------------------------------------------------------
| Include Configuration
|--------------------------------------------------------------------------
*/

const quizChapterInclude = [
  {
    model: Chapter,
    as: "chapter",

    attributes: [
      "id",
      "module_id",
      "chapter_number",
      "chapter_name",
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

        include: [
          {
            model: Domain,

            attributes: [
              "id",
              "sector_id",
              "domain_name",
            ],
          },
        ],
      },
    ],
  },
];

/*
|--------------------------------------------------------------------------
| List Quizzes
|--------------------------------------------------------------------------
*/

export const listQuizzes = async (
  req,
  res,
  next,
) => {
  try {
    const page = Math.max(
      DEFAULT_PAGE,
      Number.parseInt(
        req.query.page,
        10,
      ) || DEFAULT_PAGE,
    );

    const limit = Math.min(
      MAX_LIMIT,
      Math.max(
        1,
        Number.parseInt(
          req.query.limit,
          10,
        ) || DEFAULT_LIMIT,
      ),
    );

    const offset =
      (page - 1) * limit;

    const where = {};
    const chapterWhere = {};
    const moduleWhere = {};
    const domainWhere = {};

    const search = String(
      req.query.search || "",
    ).trim();

    if (search) {
      where[Op.or] = [
        {
          title: {
            [Op.like]:
              `%${search}%`,
          },
        },
        {
          description: {
            [Op.like]:
              `%${search}%`,
          },
        },
      ];
    }

    if (req.query.status) {
      const status = String(
        req.query.status,
      ).trim();

      if (
        !VALID_STATUSES.includes(
          status,
        )
      ) {
        throw createError(
          "Invalid quiz status",
          422,
        );
      }

      where.status = status;
    }

    if (req.query.chapter_id) {
      where.chapter_id =
        parsePositiveInteger(
          req.query.chapter_id,
          "Chapter ID",
        );
    }

    if (req.query.module_id) {
      chapterWhere.module_id =
        parsePositiveInteger(
          req.query.module_id,
          "Module ID",
        );
    }

    if (req.query.domain_id) {
      moduleWhere.domain_id =
        parsePositiveInteger(
          req.query.domain_id,
          "Domain ID",
        );
    }

    if (req.query.sector_id) {
      domainWhere.sector_id =
        parsePositiveInteger(
          req.query.sector_id,
          "Sector ID",
        );
    }

    const include = [
      {
        model: Chapter,
        as: "chapter",

        required:
          Object.keys(
            chapterWhere,
          ).length > 0 ||
          Object.keys(
            moduleWhere,
          ).length > 0 ||
          Object.keys(
            domainWhere,
          ).length > 0,

        where:
          Object.keys(
            chapterWhere,
          ).length > 0
            ? chapterWhere
            : undefined,

        attributes: [
          "id",
          "module_id",
          "chapter_number",
          "chapter_name",
          "status",
        ],

        include: [
          {
            model: Module,

            required:
              Object.keys(
                moduleWhere,
              ).length > 0 ||
              Object.keys(
                domainWhere,
              ).length > 0,

            where:
              Object.keys(
                moduleWhere,
              ).length > 0
                ? moduleWhere
                : undefined,

            attributes: [
              "id",
              "domain_id",
              "module_number",
              "module_name",
            ],

            include: [
              {
                model: Domain,

                required:
                  Object.keys(
                    domainWhere,
                  ).length > 0,

                where:
                  Object.keys(
                    domainWhere,
                  ).length > 0
                    ? domainWhere
                    : undefined,

                attributes: [
                  "id",
                  "sector_id",
                  "domain_name",
                ],
              },
            ],
          },
        ],
      },
    ];

    const {
      count,
      rows,
    } =
      await Quiz.findAndCountAll({
        where,
        include,
        distinct: true,
        limit,
        offset,

        order: [
          ["created_at", "DESC"],
          ["id", "DESC"],
        ],
      });

    return sendSuccess(
      res,
      200,
      "Quizzes fetched successfully",
      {
        items: rows,
        total: count,
        page,
        limit,
        totalPages:
          Math.ceil(
            count / limit,
          ),
      },
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| Get Quiz By ID
|--------------------------------------------------------------------------
*/

export const getQuizById = async (
  req,
  res,
  next,
) => {
  try {
    const quizId =
      parsePositiveInteger(
        req.params.id,
        "Quiz ID",
      );

    const quiz =
      await Quiz.findByPk(
        quizId,
        {
          include:
            quizChapterInclude,
        },
      );

    if (!quiz) {
      throw createError(
        "Quiz not found",
        404,
      );
    }

    return sendSuccess(
      res,
      200,
      "Quiz fetched successfully",
      quiz,
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| Create Quiz
|--------------------------------------------------------------------------
*/

export const createQuiz = async (
  req,
  res,
  next,
) => {
  try {
    const body = req.body || {};

    const chapterId =
      parsePositiveInteger(
        body.chapter_id,
        "Chapter ID",
      );

    const title = String(
      body.title || "",
    ).trim();

    if (!title) {
      throw createError(
        "Quiz title is required",
        422,
      );
    }

    const chapter =
      await Chapter.findByPk(
        chapterId,
      );

    if (!chapter) {
      throw createError(
        "Chapter not found",
        404,
      );
    }

    const existingQuiz =
      await Quiz.findOne({
        where: {
          chapter_id:
            chapterId,
        },
      });

    if (existingQuiz) {
      throw createError(
        "A quiz already exists for this chapter",
        409,
      );
    }

    const questions =
      normalizeQuestions(
        body.questions ??
          body.questions_json,
      );

    const passingScore =
      parseDecimal(
        body.passing_score,
        "Passing score",
        {
          min: 0,
          max: 100,
          defaultValue: 60,
        },
      );

    const attemptsAllowed =
      parsePositiveInteger(
        body.attempts_allowed ??
          3,
        "Attempts allowed",
      );

    const timeLimitMinutes =
      body.time_limit_minutes ===
        undefined ||
      body.time_limit_minutes ===
        null ||
      body.time_limit_minutes ===
        ""
        ? null
        : parsePositiveInteger(
            body.time_limit_minutes,
            "Time limit",
          );

    const status =
      body.status
        ? String(
            body.status,
          ).trim()
        : "draft";

    if (
      !VALID_STATUSES.includes(
        status,
      )
    ) {
      throw createError(
        "Invalid quiz status",
        422,
      );
    }

    const totalMarks =
      calculateTotalMarks(
        questions,
      );

    const quiz =
      await Quiz.create({
        chapter_id:
          chapterId,

        title,

        description:
          body.description
            ? String(
                body.description,
              ).trim()
            : null,

        questions_json:
          questions,

        passing_score:
          passingScore,

        total_marks:
          totalMarks,

        attempts_allowed:
          attemptsAllowed,

        time_limit_minutes:
          timeLimitMinutes,

        randomize_questions:
          parseBoolean(
            body.randomize_questions,
            false,
          ),

        show_result_immediately:
          parseBoolean(
            body.show_result_immediately,
            true,
          ),

        status,
      });

    const createdQuiz =
      await Quiz.findByPk(
        quiz.id,
        {
          include:
            quizChapterInclude,
        },
      );

    return sendSuccess(
      res,
      201,
      "Quiz created successfully",
      createdQuiz,
    );
  } catch (error) {
    if (
      error.name ===
        "SequelizeUniqueConstraintError"
    ) {
      return next(
        createError(
          "A quiz already exists for this chapter",
          409,
        ),
      );
    }

    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| Update Quiz
|--------------------------------------------------------------------------
*/

export const updateQuiz = async (
  req,
  res,
  next,
) => {
  try {
    const quizId =
      parsePositiveInteger(
        req.params.id,
        "Quiz ID",
      );

    const quiz =
      await Quiz.findByPk(
        quizId,
      );

    if (!quiz) {
      throw createError(
        "Quiz not found",
        404,
      );
    }

    const body = req.body || {};

    let chapterId =
      Number(
        quiz.chapter_id,
      );

    if (
      body.chapter_id !==
      undefined
    ) {
      chapterId =
        parsePositiveInteger(
          body.chapter_id,
          "Chapter ID",
        );

      const chapter =
        await Chapter.findByPk(
          chapterId,
        );

      if (!chapter) {
        throw createError(
          "Chapter not found",
          404,
        );
      }

      const duplicateQuiz =
        await Quiz.findOne({
          where: {
            chapter_id:
              chapterId,

            id: {
              [Op.ne]:
                quiz.id,
            },
          },
        });

      if (duplicateQuiz) {
        throw createError(
          "A quiz already exists for this chapter",
          409,
        );
      }
    }

    let title = quiz.title;

    if (
      body.title !==
      undefined
    ) {
      title = String(
        body.title || "",
      ).trim();

      if (!title) {
        throw createError(
          "Quiz title is required",
          422,
        );
      }
    }

    let questions =
      quiz.questions_json;

    if (
      body.questions !==
        undefined ||
      body.questions_json !==
        undefined
    ) {
      questions =
        normalizeQuestions(
          body.questions ??
            body.questions_json,
        );
    }

    const passingScore =
      body.passing_score !==
      undefined
        ? parseDecimal(
            body.passing_score,
            "Passing score",
            {
              min: 0,
              max: 100,
            },
          )
        : Number(
            quiz.passing_score,
          );

    const attemptsAllowed =
      body.attempts_allowed !==
      undefined
        ? parsePositiveInteger(
            body.attempts_allowed,
            "Attempts allowed",
          )
        : Number(
            quiz.attempts_allowed,
          );

    let timeLimitMinutes =
      quiz.time_limit_minutes;

    if (
      body.time_limit_minutes !==
      undefined
    ) {
      timeLimitMinutes =
        body.time_limit_minutes ===
          null ||
        body.time_limit_minutes ===
          ""
          ? null
          : parsePositiveInteger(
              body.time_limit_minutes,
              "Time limit",
            );
    }

    let status =
      quiz.status;

    if (
      body.status !==
      undefined
    ) {
      status = String(
        body.status,
      ).trim();

      if (
        !VALID_STATUSES.includes(
          status,
        )
      ) {
        throw createError(
          "Invalid quiz status",
          422,
        );
      }
    }

    const totalMarks =
      calculateTotalMarks(
        questions,
      );

    await quiz.update({
      chapter_id:
        chapterId,

      title,

      description:
        body.description !==
        undefined
          ? body.description
            ? String(
                body.description,
              ).trim()
            : null
          : quiz.description,

      questions_json:
        questions,

      passing_score:
        passingScore,

      total_marks:
        totalMarks,

      attempts_allowed:
        attemptsAllowed,

      time_limit_minutes:
        timeLimitMinutes,

      randomize_questions:
        body.randomize_questions !==
        undefined
          ? parseBoolean(
              body.randomize_questions,
              quiz.randomize_questions,
            )
          : quiz.randomize_questions,

      show_result_immediately:
        body.show_result_immediately !==
        undefined
          ? parseBoolean(
              body.show_result_immediately,
              quiz.show_result_immediately,
            )
          : quiz.show_result_immediately,

      status,
    });

    const updatedQuiz =
      await Quiz.findByPk(
        quiz.id,
        {
          include:
            quizChapterInclude,
        },
      );

    return sendSuccess(
      res,
      200,
      "Quiz updated successfully",
      updatedQuiz,
    );
  } catch (error) {
    if (
      error.name ===
        "SequelizeUniqueConstraintError"
    ) {
      return next(
        createError(
          "A quiz already exists for this chapter",
          409,
        ),
      );
    }

    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| Delete Quiz
|--------------------------------------------------------------------------
*/

export const deleteQuiz = async (
  req,
  res,
  next,
) => {
  try {
    const quizId =
      parsePositiveInteger(
        req.params.id,
        "Quiz ID",
      );

    const quiz =
      await Quiz.findByPk(
        quizId,
      );

    if (!quiz) {
      throw createError(
        "Quiz not found",
        404,
      );
    }

    await quiz.destroy();

    return sendSuccess(
      res,
      200,
      "Quiz deleted successfully",
      {
        id: quizId,
      },
    );
  } catch (error) {
    next(error);
  }
};