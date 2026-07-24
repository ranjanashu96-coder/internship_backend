import jwt from "jsonwebtoken";

import {
  User,
  Student,
  Mentor,
} from "../models/index.js";

import { AppError } from "../utils/response.js";

export const authenticate = async (req, _res, next) => {
  const authorization = req.headers.authorization;

  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  if (!token) {
    return next(
      new AppError("Authentication required", 401),
    );
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET,
    );

    if (payload.role === "student") {
      const student = await Student.findByPk(payload.id);

      if (
        !student ||
        student.internship_status === "blocked"
      ) {
        return next(
          new AppError(
            "Student account is invalid or blocked",
            401,
          ),
        );
      }

      req.user = {
        id: student.id,
        role: "student",
        college_id: student.college_id,
        registration_number:
          student.registration_number,
        name: student.name,
        email: student.email,
      };

      return next();
    }

    if (payload.role === "mentor") {
      const mentor = await Mentor.findByPk(payload.id);

      if (!mentor || mentor.status !== "active") {
        return next(
          new AppError(
            "Mentor account is invalid or inactive",
            401,
          ),
        );
      }

      req.user = {
        id: mentor.id,
        role: "mentor",
        name: mentor.name,
        email: mentor.email,
      };

      return next();
    }

    const user = await User.findByPk(payload.id);

    if (!user || user.status !== "active") {
      return next(
        new AppError(
          "User account is invalid or inactive",
          401,
        ),
      );
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      college_id: user.college_id,
      status: user.status,
    };

    return next();
  } catch (error) {
    if (
      error instanceof jwt.TokenExpiredError
    ) {
      return next(
        new AppError("Token has expired", 401),
      );
    }

    if (
      error instanceof jwt.JsonWebTokenError
    ) {
      return next(
        new AppError("Invalid token", 401),
      );
    }

    return next(error);
  }
};

export const allowRoles =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(
        new AppError("Authentication required", 401),
      );
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          "Forbidden: insufficient permissions",
          403,
        ),
      );
    }

    return next();
  };

export const isAdmin = allowRoles(
  "admin",
  "super_admin",
);

export const isCollege = allowRoles(
  "college_admin",
);

export const isMentor = allowRoles("mentor");

export const isStudent = allowRoles("student");