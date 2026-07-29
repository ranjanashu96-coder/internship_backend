import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const QuizAnswer = sequelize.define(
  "QuizAnswer",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    attempt_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    question_id: {
      type: DataTypes.STRING(255),
      allowNull: false,

      validate: {
        notEmpty: {
          msg: "Question ID is required",
        },
      },
    },

    selected_option_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },

    is_correct: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    marks_allocated: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    marks_obtained: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "quiz_answers",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",

    indexes: [
      {
        unique: true,
        fields: [
          "attempt_id",
          "question_id",
        ],
        name: "uq_attempt_question",
      },
      {
        fields: ["attempt_id"],
        name: "idx_quiz_answer_attempt",
      },
    ],
  },
);

export default QuizAnswer;