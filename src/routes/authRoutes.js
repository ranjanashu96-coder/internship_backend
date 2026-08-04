import {
  Router,
} from "express";

import {
  body,
} from "express-validator";

import {
  login,
  register,
  forgotPassword,
  resetPassword,
  loginRules,
  refreshAccessToken,
  logout,
} from "../controllers/authController.js";

import {
  validate,
} from "../middleware/validate.js";

const r = Router();

/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/

r.post(
  "/login",
  loginRules,
  validate,
  login,
);

/*
|--------------------------------------------------------------------------
| Register
|--------------------------------------------------------------------------
*/

r.post(
  "/register",
  [
    body("username")
      .trim()
      .notEmpty(),

    body("email")
      .isEmail()
      .normalizeEmail(),

    body("password")
      .isLength({
        min: 8,
      }),
  ],
  validate,
  register,
);

/*
|--------------------------------------------------------------------------
| Forgot Password
|--------------------------------------------------------------------------
*/

r.post(
  "/forgot-password",
  [
    body("email")
      .isEmail()
      .withMessage(
        "Valid email address is required",
      )
      .normalizeEmail(),
  ],
  validate,
  forgotPassword,
);

/*
|--------------------------------------------------------------------------
| Reset Password
|--------------------------------------------------------------------------
*/

r.post(
  "/reset-password",
  [
    body("token")
      .trim()
      .notEmpty()
      .withMessage(
        "Reset token is required",
      ),

    body("password")
      .isLength({
        min: 8,
      })
      .withMessage(
        "Password must be at least 8 characters",
      ),
  ],
  validate,
  resetPassword,
);

/*
|--------------------------------------------------------------------------
| Refresh Token
|--------------------------------------------------------------------------
*/

r.post(
  "/refresh",
  refreshAccessToken,
);

/*
|--------------------------------------------------------------------------
| Logout
|--------------------------------------------------------------------------
*/

r.post(
  "/logout",
  logout,
);

export default r;