import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const StudentResourceProgress =
  sequelize.define(
    "StudentResourceProgress",
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

      chapter_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },

      resource_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },

      duration_seconds: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },

      watched_seconds: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },

      last_position_seconds: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },

      last_heartbeat_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      is_completed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName:
        "student_resource_progress",

      timestamps: true,

      createdAt:
        "created_at",

      updatedAt:
        "updated_at",

      indexes: [
        {
          unique: true,
          fields: [
            "student_id",
            "resource_id",
          ],
        },
        {
          fields: [
            "student_id",
            "chapter_id",
          ],
        },
      ],
    },
  );

export default StudentResourceProgress;