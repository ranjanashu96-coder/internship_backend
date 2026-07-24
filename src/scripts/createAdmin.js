import dotenv from "dotenv";
dotenv.config();

import sequelize from "../config/database.js";
import { User } from "../models/index.js";
import { hashPassword } from "../utils/security.js";

const username = process.env.ADMIN_USERNAME || "admin";
const email = process.env.ADMIN_EMAIL || "admin@rknexora.com";
const password = process.env.ADMIN_PASSWORD || "Admin@12345";

try {
  await sequelize.authenticate();

  const existing = await User.findOne({ where: { email } });

  if (existing) {
    existing.username = username;
    existing.password_hash = await hashPassword(password);
    existing.role = "super_admin";
    existing.status = "active";
    await existing.save();
    console.log(`Admin updated: ${email}`);
  } else {
    await User.create({
      username,
      email,
      password_hash: await hashPassword(password),
      role: "super_admin",
      status: "active",
      college_id: null,
    });
    console.log(`Admin created: ${email}`);
  }

  console.log(`Username: ${username}`);
  console.log("Password comes from ADMIN_PASSWORD in .env");
  process.exit(0);
} catch (error) {
  console.error("Admin creation failed:", error);
  process.exit(1);
}
