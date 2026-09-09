import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const LiveClassAttendanceSession =
  sequelize.define(
    "LiveClassAttendanceSession",
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

      live_class_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },

      session_token: {
        type: DataTypes.STRING(80),
        allowNull: false,
        unique: true,
      },

      joined_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },

      last_heartbeat_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      left_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      attended_seconds: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName:
        "live_class_attendance_sessions",

      timestamps: true,

      createdAt:
        "created_at",

      updatedAt:
        "updated_at",

      indexes: [
        {
          fields: [
            "student_id",
            "live_class_id",
          ],
        },
        {
          fields: [
            "student_id",
            "live_class_id",
            "is_active",
          ],
        },
      ],
    },
  );

export default LiveClassAttendanceSession;