import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const LiveClass = sequelize.define(
  "LiveClass",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    domain_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    module_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    chapter_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    instructor_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },

    meeting_url: {
      type: DataTypes.STRING(1000),
      allowNull: false,
    },

    scheduled_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    duration_minutes: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 60,
    },

    popup_minutes_before: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1440,
    },

    status: {
      type: DataTypes.ENUM(
        "scheduled",
        "completed",
        "cancelled",
      ),
      allowNull: false,
      defaultValue: "scheduled",
    },

    created_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: "live_classes",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

export default LiveClass;
