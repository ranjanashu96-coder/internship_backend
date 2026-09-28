import { Op } from "sequelize";
import {
  ChapterResource,
  LiveClass,
  Quiz,
  QuizAttempt,
} from "../models/index.js";

import { AppError } from "../utils/response.js";

/*
|--------------------------------------------------------------------------
| SIMPLE RULES
|--------------------------------------------------------------------------
| Chapter complete karne ke liye sirf 2 cheezein:
|
| 1. Chapter me koi bhi active resource ho
|    (video, pdf, link, text, live class — kuch bhi)
|
| 2. Agar chapter me quiz hai, toh student ne pass kiya ho.
|
| Live class JOIN/ATTEND karne ka system chalega (tracking hoga),
| lekin 80% attendance mandatory NAHI hai chapter complete ke liye.
*/

export const getChapterLearningRequirements = async ({
  studentId,
  chapterId,
}) => {
  /*
  |--------------------------------------------------------------------------
  | 1. RESOURCE COUNT
  |--------------------------------------------------------------------------
  */
  const totalResources = await ChapterResource.count({
    where: {
      chapter_id: chapterId,
      status: "active",
    },
  });

  const totalLiveClasses = await LiveClass.count({
    where: {
      chapter_id: chapterId,
      status: { [Op.ne]: "cancelled" },
    },
  });

  const totalItems = totalResources + totalLiveClasses;

  /*
  |--------------------------------------------------------------------------
  | EMPTY CHAPTER -> can_mark_complete = false
  |--------------------------------------------------------------------------
  */
  if (totalItems === 0) {
    return {
      chapter_id: Number(chapterId),

      has_resources: false,
      can_mark_complete: false,
      is_empty_chapter: true,

      reason:
        "Is chapter me koi resource nahi hai, isliye mark complete available nahi hai.",

      quiz: null,

      summary: {
        total_resources: 0,
        total_live_classes: 0,
        quiz_required: false,
        quiz_passed: false,
        learning_requirements_complete: false,
      },
    };
  }

  /*
  |--------------------------------------------------------------------------
  | 2. QUIZ CHECK
  |--------------------------------------------------------------------------
  | Agar chapter me active quiz hai,
  | toh student ne pass kiya hona chahiye.
  */
  const quiz = await Quiz.findOne({
    where: {
      chapter_id: chapterId,
      status: "active",
    },
    attributes: ["id", "title", "passing_score"],
  });

  let quizRequired = false;
  let quizPassed = false;
  let quizTitle = null;
  let quizId = null;

  if (quiz) {
    quizRequired = true;
    quizTitle = quiz.title;
    quizId = quiz.id;

    const passedAttempt = await QuizAttempt.findOne({
      where: {
        student_id: studentId,
        quiz_id: quiz.id,
        status: "submitted",
        passed: true,
      },
      attributes: ["id"],
    });

    quizPassed = Boolean(passedAttempt);
  }

  /*
  |--------------------------------------------------------------------------
  | 3. FINAL STATUS
  |--------------------------------------------------------------------------
  */
  const learningRequirementsComplete =
    totalItems > 0 && (!quizRequired || quizPassed);

  return {
    chapter_id: Number(chapterId),

    has_resources: true,
    can_mark_complete: true,
    is_empty_chapter: false,

    quiz: quiz
      ? {
          id: quizId,
          title: quizTitle,
          passing_score: Number(quiz.passing_score || 0),
          required: quizRequired,
          passed: quizPassed,
        }
      : null,

    summary: {
      total_resources: totalResources,
      total_live_classes: totalLiveClasses,

      quiz_required: quizRequired,
      quiz_passed: quizPassed,

      learning_requirements_complete: learningRequirementsComplete,
    },
  };
};

/*
|--------------------------------------------------------------------------
| FINAL COMPLETION GUARD
|--------------------------------------------------------------------------
*/
export const assertChapterLearningRequirements = async ({
  studentId,
  chapterId,
}) => {
  const requirements = await getChapterLearningRequirements({
    studentId,
    chapterId,
  });

  /*
  |--------------------------------------------------------------------------
  | EMPTY CHAPTER -> BLOCK
  |--------------------------------------------------------------------------
  */
  if (requirements.is_empty_chapter) {
    throw new AppError(
      "Is chapter me koi resource nahi hai, isliye ise complete nahi kiya ja sakta.",
      409,
      { requirements },
    );
  }

  /*
  |--------------------------------------------------------------------------
  | QUIZ NOT PASSED -> BLOCK
  |--------------------------------------------------------------------------
  */
  if (
    requirements.quiz &&
    requirements.quiz.required &&
    !requirements.quiz.passed
  ) {
    throw new AppError(
      `Pehle quiz "${requirements.quiz.title}" pass karo, tabhi chapter complete hoga.`,
      409,
      {
        quiz_required: true,
        quiz_id: requirements.quiz.id,
        quiz_title: requirements.quiz.title,
        requirements,
      },
    );
  }

  return requirements;
};