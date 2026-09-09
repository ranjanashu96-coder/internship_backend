import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const StudentChapterEngagement =
  sequelize.define(
    "StudentChapterEngagement",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },

      student_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },

      chapter_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },

      engaged_seconds: {
        type: DataTypes.INTEGER,
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
        "student_chapter_engagement",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",

      indexes: [
        {
          unique: true,
          fields: [
            "student_id",
            "chapter_id",
          ],
        },
      ],
    },
  );

export default StudentChapterEngagement;