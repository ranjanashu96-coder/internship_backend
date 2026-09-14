import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const QuizReattemptGrant = sequelize.define(
  "QuizReattemptGrant",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    student_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    quiz_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    extra_attempts: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1, max: 20 },
    },
    granted_by_type: {
      type: DataTypes.ENUM("admin", "mentor"),
      allowNull: false,
    },
    granted_by_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    tableName: "quiz_reattempt_grants",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["student_id", "quiz_id"], name: "idx_qrg_student_quiz" },
      { fields: ["quiz_id"], name: "idx_qrg_quiz" },
      { fields: ["granted_by_type", "granted_by_id"], name: "idx_qrg_granted_by" },
    ],
  },
);

export default QuizReattemptGrant;
