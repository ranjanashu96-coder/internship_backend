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
import {
  sendEmail,
} from "../services/emailService.js";

export const loginRules = [
  body("identifier").trim().notEmpty(),
  body("password").isLength({ min: 6 }),
];

const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const hashResetToken = (token) =>
  crypto
    .createHash("sha256")
    .update(String(token))
    .digest("hex");

const findAccountByEmail = async (
  email,
  options = {},
) => {
  let account = await User.findOne({
    where: { email },
    ...options,
  });

  if (account) {
    return {
      account,
      accountType: "user",
    };
  }

  account = await Mentor.findOne({
    where: { email },
    ...options,
  });

  if (account) {
    return {
      account,
      accountType: "mentor",
    };
  }

  account = await Student.findOne({
    where: { email },
    ...options,
  });

  if (account) {
    return {
      account,
      accountType: "student",
    };
  }

  return null;
};

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

export const forgotPassword = asyncHandler(
  async (req, res) => {
    const email = normalizeEmail(
      req.body.email,
    );

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email,
      )
    ) {
      throw new AppError(
        "Valid email address is required",
        422,
      );
    }

    const accountResult =
      await findAccountByEmail(email);

    /*
     * Galat email par bhi same response
     * denge, security ke liye.
     */
    if (!accountResult) {
      return ok(
        res,
        {},
        "If the email exists, reset instructions have been sent",
      );
    }

    /*
     * Purane unused reset links band.
     */
    await PasswordReset.update(
      {
        used_at: new Date(),
      },
      {
        where: {
          email,
          used_at: null,
        },
      },
    );

    const token = crypto
      .randomBytes(32)
      .toString("hex");

    const tokenHash =
      hashResetToken(token);

    const resetRecord =
      await PasswordReset.create({
        email,

        token_hash:
          tokenHash,

        expires_at:
          new Date(
            Date.now() +
              30 * 60 * 1000,
          ),

        used_at:
          null,
      });

    const clientUrl = String(
      process.env.CLIENT_URL ||
        "http://localhost:3000",
    )
      .split(",")[0]
      .trim()
      .replace(/\/$/, "");

    const resetUrl =
      `${clientUrl}/reset-password` +
      `?token=${encodeURIComponent(
        token,
      )}`;

    try {
      await sendEmail({
        to: email,

        subject:
          "Reset your RK Nexora password",

        text:
          `Reset your password using this link:\n\n` +
          `${resetUrl}\n\n` +
          `This link expires in 30 minutes.`,

        html: `
          <div style="background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif">
            <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">

              <div style="background:#0f172a;padding:24px;text-align:center">
                <h1 style="margin:0;color:#ffffff;font-size:24px">
                  RK <span style="color:#60a5fa">Nexora</span>
                </h1>
              </div>

              <div style="padding:32px">
                <h2 style="margin:0 0 14px;color:#0f172a">
                  Reset your password
                </h2>

                <p style="color:#475569;line-height:1.7">
                  We received a request to reset your RK Nexora account password.
                </p>

                <div style="margin:28px 0;text-align:center">
                  <a
                    href="${resetUrl}"
                    style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:bold"
                  >
                    Reset Password
                  </a>
                </div>

                <p style="color:#64748b;font-size:14px">
                  This link will expire in 30 minutes.
                </p>

                <p style="color:#64748b;font-size:14px">
                  You can ignore this email when you did not request a password reset.
                </p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (error) {
      await resetRecord.destroy();

      console.error(
        "FORGOT PASSWORD EMAIL ERROR:",
        error,
      );

      throw new AppError(
        "Unable to send password reset email",
        500,
      );
    }

    return ok(
      res,
      {},
      "If the email exists, reset instructions have been sent",
    );
  },
);

export const resetPassword = asyncHandler(
  async (req, res) => {
    const token = String(
      req.body.token || "",
    ).trim();

    const password = String(
      req.body.password || "",
    );

    if (!token) {
      throw new AppError(
        "Reset token is required",
        422,
      );
    }

    if (password.length < 8) {
      throw new AppError(
        "Password must be at least 8 characters",
        422,
      );
    }

    const tokenHash =
      hashResetToken(token);

    const transaction =
      await PasswordReset.sequelize.transaction();

    let resetRequest;
    let accountResult;

    try {
      resetRequest =
        await PasswordReset.findOne({
          where: {
            token_hash:
              tokenHash,

            used_at:
              null,

            expires_at: {
              [Op.gt]:
                new Date(),
            },
          },

          transaction,

          lock:
            transaction.LOCK.UPDATE,
        });

      if (!resetRequest) {
        throw new AppError(
          "Reset link is invalid or expired",
          400,
        );
      }

      accountResult =
        await findAccountByEmail(
          resetRequest.email,
          {
            transaction,

            lock:
              transaction.LOCK.UPDATE,
          },
        );

      if (!accountResult) {
        throw new AppError(
          "Account not found",
          404,
        );
      }

      const passwordHash =
        await hashPassword(
          password,
        );

      await accountResult.account.update(
        {
          password_hash:
            passwordHash,
        },
        {
          transaction,
        },
      );

      /*
       * Is email ke sab reset links band.
       */
      await PasswordReset.update(
        {
          used_at:
            new Date(),
        },
        {
          where: {
            email:
              resetRequest.email,

            used_at:
              null,
          },

          transaction,
        },
      );

      /*
       * Purane login sessions logout.
       */
      await RefreshToken.update(
        {
          revoked_at:
            new Date(),
        },
        {
          where: {
            account_id:
              accountResult
                .account
                .id,

            account_type:
              accountResult
                .accountType,

            revoked_at:
              null,
          },

          transaction,
        },
      );

      await transaction.commit();
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }

      throw error;
    }

    /*
     * Password change confirmation email.
     */
    try {
      await sendEmail({
        to:
          resetRequest.email,

        subject:
          "Your RK Nexora password was changed",

        text:
          "Your RK Nexora password has been changed successfully. You can now login using your new password.",

        html: `
          <div style="background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif">
            <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0">
              <h2 style="margin-top:0;color:#0f172a">
                Password changed successfully
              </h2>

              <p style="color:#475569;line-height:1.7">
                Your RK Nexora password has been updated successfully.
              </p>

              <p style="color:#64748b;font-size:14px">
                You can now login using your new password.
              </p>
            </div>
          </div>
        `,
      });
    } catch (emailError) {
      /*
       * Confirmation email fail hone par
       * password reset rollback nahi hoga.
       */
      console.error(
        "PASSWORD CHANGED EMAIL ERROR:",
        emailError,
      );
    }

    return ok(
      res,
      {},
      "Password reset successfully. Please login with your new password.",
    );
  },
);

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
