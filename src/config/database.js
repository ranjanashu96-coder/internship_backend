import { Sequelize } from "sequelize";
import dotenv from "dotenv";
dotenv.config();

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  dialect: "mysql",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: { max: 20, min: 2, acquire: 30000, idle: 10000 },
  define: { underscored: true, freezeTableName: true, timestamps: true }
});
export default sequelize;
