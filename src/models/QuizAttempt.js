import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const QuizAttempt = sequelize.define(
  "QuizAttempt",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    quiz_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    student_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    attempt_number: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,

      validate: {
        min: {
          args: [1],
          msg: "Attempt number must be at least 1",
        },
      },
    },

    total_marks: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    obtained_marks: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },

    passed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    status: {
      type: DataTypes.ENUM(
        "in_progress",
        "submitted",
        "expired",
      ),
      allowNull: false,
      defaultValue: "in_progress",
    },

    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    submitted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },

    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },

    time_taken_seconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: "quiz_attempts",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",

    indexes: [
      {
        unique: true,
        fields: [
          "quiz_id",
          "student_id",
          "attempt_number",
        ],
        name: "uq_quiz_attempt_number",
      },
      {
        fields: ["student_id"],
        name: "idx_quiz_attempt_student",
      },
      {
        fields: ["quiz_id"],
        name: "idx_quiz_attempt_quiz",
      },
      {
        fields: ["status"],
        name: "idx_quiz_attempt_status",
      },
    ],
  },
);

export default QuizAttempt;