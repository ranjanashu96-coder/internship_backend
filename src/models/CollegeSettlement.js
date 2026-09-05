import {
  DataTypes,
} from "sequelize";

import sequelize from "../config/database.js";

const CollegeSettlement =
  sequelize.define(
    "CollegeSettlement",
    {
      id: {
        type:
          DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },

      college_id: {
        type:
          DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },

      amount: {
        type: DataTypes.DECIMAL(
          12,
          2,
        ),
        allowNull: false,
      },

      payment_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },

      payment_mode: {
        type: DataTypes.ENUM(
          "bank_transfer",
          "upi",
          "cheque",
          "cash",
          "other",
        ),
        allowNull: false,
        defaultValue:
          "bank_transfer",
      },

      transaction_reference: {
        type: DataTypes.STRING(
          150,
        ),
        allowNull: true,
      },

      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      receipt_file: {
        type: DataTypes.STRING(
          500,
        ),
        allowNull: true,
      },

      share_percentage_snapshot: {
        type: DataTypes.DECIMAL(
          5,
          2,
        ),
        allowNull: false,
        defaultValue: 0,
      },

      earned_share_snapshot: {
        type: DataTypes.DECIMAL(
          12,
          2,
        ),
        allowNull: false,
        defaultValue: 0,
      },

      balance_before: {
        type: DataTypes.DECIMAL(
          12,
          2,
        ),
        allowNull: false,
        defaultValue: 0,
      },

      balance_after: {
        type: DataTypes.DECIMAL(
          12,
          2,
        ),
        allowNull: false,
        defaultValue: 0,
      },

      created_by: {
        type:
          DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
      },
    },
    {
      sequelize,

      tableName:
        "college_settlements",

      modelName:
        "CollegeSettlement",

      timestamps: true,

      createdAt:
        "created_at",

      updatedAt:
        "updated_at",

      indexes: [
        {
          fields: [
            "college_id",
          ],
        },
        {
          fields: [
            "payment_date",
          ],
        },
        {
          fields: [
            "created_by",
          ],
        },
      ],
    },
  );

export default CollegeSettlement;
