import crypto from "crypto";
import { Op } from "sequelize";
import { body } from "express-validator";
import { User, Student, Mentor, PasswordReset,  RefreshToken, } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";
import { comparePassword,
  hashPassword,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken, } from "../utils/security.js";
import { mailer } from "../config/mailer.js";

export const loginRules = [
  body("identifier").trim().notEmpty(),
  body("password").isLength({ min: 6 }),
];

export const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  let account = await User.findOne({
    where: {
      [Op.or]: [
        { email: identifier },
        { username: identifier },
      ],
    },
  });

  let role = account?.role;
  let collegeId = account?.college_id ?? null;
  let accountType = account ? "user" : null;

  if (!account) {
    account = await Mentor.findOne({
      where: {
        [Op.or]: [
          { email: identifier },
          { employee_id: identifier },
        ],
      },
    });

    if (account) {
      role = "mentor";
      accountType = "mentor";
      collegeId = account.college_id ?? null;
    }
  }

  if (!account) {
    account = await Student.findOne({
      where: {
        [Op.or]: [
          { registration_number: identifier },
          { username: identifier },
          { email: identifier },
        ],
      },
    });

    if (account) {
      role = "student";
      accountType = "student";
      collegeId = account.college_id ?? null;
    }
  }

  if (
    !account ||
    !account.password_hash ||
    !(await comparePassword(
      password,
      account.password_hash,
    ))
  ) {
    throw new AppError(
      "Invalid username/email/registration number or password",
      401,
    );
  }

  if (
    role === "mentor" &&
    account.status !== "active"
  ) {
    throw new AppError(
      "Account is not active",
      403,
    );
  }

  if (
    !["student", "mentor"].includes(role) &&
    account.status !== "active"
  ) {
    throw new AppError(
      "Account is not active",
      403,
    );
  }

  if (
    role === "student" &&
    account.internship_status === "blocked"
  ) {
    throw new AppError(
      "Student account is blocked",
      403,
    );
  }

  if (
    role === "student" &&
    account.payment_status !== "paid"
  ) {
    throw new AppError(
      "Payment is pending. Please complete your payment before login.",
      403,
    );
  }

  const accessToken = signAccessToken({
    id: account.id,
    role,
    college_id: collegeId,
  });

  const refreshToken = generateRefreshToken();

  await RefreshToken.create({
    account_id: account.id,
    account_type: accountType,
    role,
    token_hash: hashRefreshToken(refreshToken),
    expires_at: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ),
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:
      7 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });

  return ok(
    res,
    {
      accessToken,

      user: {
        id: account.id,

        username:
          account.username ??
          account.registration_number ??
          account.employee_id,

        email: account.email,
        role,
        college_id: collegeId,
      },
    },
    "Login successful",
  );
});
// Keep general account creation protected in admin routes. Student registration
// is handled through /api/registration after verifying a preloaded record.
export const register = asyncHandler(async (_req, _res) => {
  throw new AppError("Public account registration is disabled", 403);
});

export const refreshAccessToken = asyncHandler(
  async (req, res) => {
    const refreshToken =
      req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new AppError(
        "Refresh token missing",
        401,
      );
    }

    const tokenHash =
      hashRefreshToken(refreshToken);

    const savedToken =
      await RefreshToken.findOne({
        where: {
          token_hash: tokenHash,
          revoked_at: null,
        },
      });

    if (!savedToken) {
      throw new AppError(
        "Invalid refresh token",
        401,
      );
    }

    if (
      new Date(savedToken.expires_at) <
      new Date()
    ) {
      throw new AppError(
        "Refresh token expired",
        401,
      );
    }

    let account = null;

    if (
      savedToken.account_type === "student"
    ) {
      account = await Student.findByPk(
        savedToken.account_id,
      );
    }

    if (
      savedToken.account_type === "mentor"
    ) {
      account = await Mentor.findByPk(
        savedToken.account_id,
      );
    }

    if (
      savedToken.account_type === "user"
    ) {
      account = await User.findByPk(
        savedToken.account_id,
      );
    }

    if (!account) {
      throw new AppError(
        "Account not found",
        401,
      );
    }

    const accessToken =
      signAccessToken({
        id: account.id,
        role: savedToken.role,
        college_id:
          account.college_id ?? null,
      });

    return ok(
      res,
      {
        accessToken,

        user: {
          id: account.id,

          username:
            account.username ??
            account.registration_number ??
            account.employee_id,

          email: account.email,
          role: savedToken.role,
          college_id:
            account.college_id ?? null,
        },
      },
      "Token refreshed successfully",
    );
  },
);

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const token = crypto.randomBytes(32).toString("hex");
  await PasswordReset.create({
    email,
    token_hash: await hashPassword(token),
    expires_at: new Date(Date.now() + 30 * 60 * 1000),
  });
  if (mailer) {
    await mailer.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "RKNexora password reset",
      text: `Reset token: ${token}`,
    });
  }
  ok(res, {}, "If the email exists, reset instructions have been sent");
});

export const logout = asyncHandler(
  async (req, res) => {
    const refreshToken =
      req.cookies?.refreshToken;

    if (refreshToken) {
      await RefreshToken.update(
        {
          revoked_at: new Date(),
        },
        {
          where: {
            token_hash:
              hashRefreshToken(
                refreshToken,
              ),
          },
        },
      );
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        "production",
      sameSite: "lax",
      path: "/api/auth",
    });

    return ok(
      res,
      {},
      "Logout successful",
    );
  },
);
