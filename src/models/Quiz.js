import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Quiz = sequelize.define(
  "Quiz",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

   chapter_id: {
  type: DataTypes.INTEGER,
  allowNull: false,
},

    title: {
      type: DataTypes.STRING(255),
      allowNull: false,

      validate: {
        notEmpty: {
          msg: "Quiz title is required",
        },
      },
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },

    questions_json: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },

    passing_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 60,

      validate: {
        min: {
          args: [0],
          msg: "Passing score cannot be less than 0",
        },

        max: {
          args: [100],
          msg: "Passing score cannot be greater than 100",
        },
      },
    },

    total_marks: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,

      validate: {
        min: {
          args: [0],
          msg: "Total marks cannot be negative",
        },
      },
    },

    attempts_allowed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,

      validate: {
        min: {
          args: [1],
          msg: "Attempts allowed must be at least 1",
        },
      },
    },

    time_limit_minutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,

      validate: {
        min: {
          args: [1],
          msg: "Time limit must be at least 1 minute",
        },
      },
    },

    randomize_questions: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    show_result_immediately: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    status: {
      type: DataTypes.ENUM(
        "draft",
        "active",
        "inactive",
      ),

      allowNull: false,
      defaultValue: "draft",
    },
  },
  {
    tableName: "quizzes",

    timestamps: true,

    createdAt: "created_at",
    updatedAt: "updated_at",

    indexes: [
      {
        unique: true,
        fields: ["chapter_id"],
        name: "uq_quizzes_chapter_id",
      },

      {
        fields: ["status"],
        name: "idx_quizzes_status",
      },
    ],
  },
);

export default Quiz;