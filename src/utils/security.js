// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// export const hashPassword = (value) => bcrypt.hash(value, Number(process.env.BCRYPT_ROUNDS || 12));
// export const comparePassword = (value, hash) => bcrypt.compare(value, hash);
// export const signToken = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "1d" });

import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const hashPassword = (value) =>
  bcrypt.hash(
    value,
    Number(process.env.BCRYPT_ROUNDS || 12),
  );

export const comparePassword = (value, hash) =>
  bcrypt.compare(value, hash);

export const signAccessToken = (payload) =>
  jwt.sign(
    {
      ...payload,
      token_type: "access",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "15m",
    },
  );

export const generateRefreshToken = () =>
  crypto.randomBytes(64).toString("hex");

export const hashRefreshToken = (token) =>
  crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");