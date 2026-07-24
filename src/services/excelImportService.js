import * as XLSX from "xlsx";
import fs from "fs";
import { Op } from "sequelize";

import {
  Student,
  sequelize,
} from "../models/index.js";

import { AppError } from "../utils/response.js";

const normalizeHeader = (value) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const normalizeRow = (row) => {
  const normalized = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = value;
  }

  return normalized;
};

const cleanText = (value) => {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const cleaned = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
};

const cleanIdentifier = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(Math.trunc(value));
  }

  return String(value)
    .replace(/\u00a0/g, "")
    .replace(/\s+/g, "")
    .trim();
};

const cleanMobile = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  let digits = String(value)
    .replace(/\D/g, "")
    .trim();

  if (
    digits.length === 12 &&
    digits.startsWith("91")
  ) {
    digits = digits.slice(2);
  }

  if (digits.length < 10) {
    return null;
  }

  return digits.slice(-10);
};

const cleanEmail = (value) => {
  const email = cleanText(value)?.toLowerCase();

  if (!email) {
    return null;
  }

  const isValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return isValid ? email : null;
};

const parseDate = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "number") {
    const parsed =
      XLSX.SSF.parse_date_code(value);

    if (!parsed) {
      return null;
    }

    return [
      String(parsed.y).padStart(4, "0"),
      String(parsed.m).padStart(2, "0"),
      String(parsed.d).padStart(2, "0"),
    ].join("-");
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }

  const text = String(value)
    .trim()
    .replace(/[/.]/g, "-");

  const dayFirst = text.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  );

  if (dayFirst) {
    const [, day, month, year] =
      dayFirst;

    return `${year}-${month.padStart(
      2,
      "0",
    )}-${day.padStart(2, "0")}`;
  }

  const yearFirst = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  );

  if (yearFirst) {
    const [, year, month, day] =
      yearFirst;

    return `${year}-${month.padStart(
      2,
      "0",
    )}-${day.padStart(2, "0")}`;
  }

  return null;
};

const extractMajorSubject = (value) => {
  const subjects = cleanText(value);

  if (!subjects) {
    return null;
  }

  const match = subjects.match(
    /major\s*:\s*(.*?)(?=\s+(?:minor|multidisciplinary|mil|skill\s*enhancement|value\s*added)\s*:|$)/i,
  );

  return cleanText(match?.[1]);
};

const getDatabaseError = (error) => {
  if (
    error?.name ===
    "SequelizeUniqueConstraintError"
  ) {
    const field =
      error?.errors?.[0]?.path ??
      "unique field";

    return `Duplicate value found in ${field}`;
  }

  if (
    error?.name ===
    "SequelizeValidationError"
  ) {
    return error.errors
      .map((item) => item.message)
      .join(", ");
  }

  return (
    error?.original?.sqlMessage ??
    error?.message ??
    "Database operation failed"
  );
};

export const importStudents = async (
  filePath,
  collegeId,
) => {
  if (!filePath) {
    throw new AppError(
      "Excel file path is missing",
      400,
    );
  }

  if (!collegeId) {
    throw new AppError(
      "College ID is required",
      400,
    );
  }

const fileBuffer = fs.readFileSync(filePath);

const workbook = XLSX.read(fileBuffer, {
  type: "buffer",
  raw: true,
  cellDates: false,
});
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new AppError(
      "Excel workbook is empty",
      400,
    );
  }

  const worksheet =
    workbook.Sheets[sheetName];

  /*
   * First Excel row contains the title.
   * Second row contains actual headers.
   */
  const rawRows =
    XLSX.utils.sheet_to_json(
      worksheet,
      {
        range: 1,
        defval: "",
        raw: true,
      },
    );

  if (!rawRows.length) {
    throw new AppError(
      "No student records found in Excel",
      400,
    );
  }

  const rows = rawRows
    .map(normalizeRow)
    .filter((row) => {
      const registrationNumber =
        cleanIdentifier(
          row["reg no"] ??
            row["registration no"] ??
            row["registration number"],
        );

      return Boolean(registrationNumber);
    });

  const registrationNumbers = rows
    .map((row) =>
      cleanIdentifier(
        row["reg no"] ??
          row["registration no"] ??
          row["registration number"],
      ),
    )
    .filter(Boolean);

  const studentIdentifiers = rows
    .map((row) =>
      cleanIdentifier(
        row.username ??
          row["student id"],
      ),
    )
    .filter(Boolean);

  const emailCounts = new Map();

  for (const row of rows) {
    const email = cleanEmail(
      row["e-mail"] ?? row.email,
    );

    if (email) {
      emailCounts.set(
        email,
        (emailCounts.get(email) ?? 0) + 1,
      );
    }
  }

  const existingStudents =
    await Student.findAll({
      where: {
        registration_number: {
          [Op.in]: registrationNumbers,
        },
      },
    });

  const existingByRegistration =
    new Map(
      existingStudents.map((student) => [
        String(student.registration_number),
        student,
      ]),
    );

  const existingIdentifiers =
    studentIdentifiers.length
      ? await Student.findAll({
          where: {
            [Op.or]: [
              {
                student_id: {
                  [Op.in]: studentIdentifiers,
                },
              },
              {
                username: {
                  [Op.in]: studentIdentifiers,
                },
              },
            ],
          },
          attributes: [
            "id",
            "registration_number",
            "student_id",
            "username",
          ],
        })
      : [];

  const studentIdMap = new Map();
  const usernameMap = new Map();

  for (const student of existingIdentifiers) {
    if (student.student_id) {
      studentIdMap.set(
        String(student.student_id),
        student,
      );
    }

    if (student.username) {
      usernameMap.set(
        String(student.username),
        student,
      );
    }
  }

  const uniqueEmails = [
    ...emailCounts.keys(),
  ];

  const existingEmailRows =
    uniqueEmails.length
      ? await Student.findAll({
          where: {
            email: {
              [Op.in]: uniqueEmails,
            },
          },
          attributes: [
            "id",
            "registration_number",
            "email",
          ],
        })
      : [];

  const existingEmailMap = new Map();

  for (const student of existingEmailRows) {
    if (student.email) {
      existingEmailMap.set(
        student.email.toLowerCase(),
        student,
      );
    }
  }

  const transaction =
    await sequelize.transaction();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const warnings = [];
  const errors = [];

  const seenRegistrations = new Set();
  const seenIdentifiers = new Set();

  try {
    for (
      let index = 0;
      index < rows.length;
      index += 1
    ) {
      const row = rows[index];
      const excelRowNumber = index + 3;

      const registrationNumber =
        cleanIdentifier(
          row["reg no"] ??
            row["registration no"] ??
            row["registration number"],
        );

      const excelUsername =
        cleanIdentifier(
          row.username ??
            row["student id"],
        );

      const studentName =
        cleanText(
          row["students name"] ??
            row["student name"] ??
            row.name,
        );

      if (!registrationNumber) {
        skipped += 1;

        errors.push({
          row: excelRowNumber,
          message:
            "Registration number is missing",
        });

        continue;
      }

      if (!excelUsername) {
        skipped += 1;

        errors.push({
          row: excelRowNumber,
          registration_number:
            registrationNumber,
          message:
            "Username or student ID is missing",
        });

        continue;
      }

      if (!studentName) {
        skipped += 1;

        errors.push({
          row: excelRowNumber,
          registration_number:
            registrationNumber,
          message:
            "Student name is missing",
        });

        continue;
      }

      if (
        seenRegistrations.has(
          registrationNumber,
        )
      ) {
        skipped += 1;

        errors.push({
          row: excelRowNumber,
          registration_number:
            registrationNumber,
          message:
            "Duplicate registration number found in Excel",
        });

        continue;
      }

      seenRegistrations.add(
        registrationNumber,
      );

      const existingStudent =
        existingByRegistration.get(
          registrationNumber,
        );

      const studentIdOwner =
        studentIdMap.get(excelUsername);

      const usernameOwner =
        usernameMap.get(excelUsername);

      if (
        studentIdOwner &&
        String(
          studentIdOwner.registration_number,
        ) !== registrationNumber
      ) {
        skipped += 1;

        errors.push({
          row: excelRowNumber,
          registration_number:
            registrationNumber,
          message: `Student ID ${excelUsername} is already assigned to another student`,
        });

        continue;
      }

      if (
        usernameOwner &&
        String(
          usernameOwner.registration_number,
        ) !== registrationNumber
      ) {
        skipped += 1;

        errors.push({
          row: excelRowNumber,
          registration_number:
            registrationNumber,
          message: `Username ${excelUsername} is already assigned to another student`,
        });

        continue;
      }

      if (
        seenIdentifiers.has(
          excelUsername,
        ) &&
        !existingStudent
      ) {
        skipped += 1;

        errors.push({
          row: excelRowNumber,
          registration_number:
            registrationNumber,
          message:
            "Duplicate username or student ID found in Excel",
        });

        continue;
      }

      seenIdentifiers.add(
        excelUsername,
      );

      let email = cleanEmail(
        row["e-mail"] ?? row.email,
      );

      if (
        email &&
        (emailCounts.get(email) ?? 0) > 1
      ) {
        warnings.push({
          row: excelRowNumber,
          registration_number:
            registrationNumber,
          field: "email",
          value: email,
          message:
            "Duplicate email found in Excel. Email was saved as null.",
        });

        email = null;
      }

      const emailOwner = email
        ? existingEmailMap.get(email)
        : null;

      if (
        emailOwner &&
        String(
          emailOwner.registration_number,
        ) !== registrationNumber
      ) {
        warnings.push({
          row: excelRowNumber,
          registration_number:
            registrationNumber,
          field: "email",
          value: email,
          message:
            "Email is already used by another student. Email was saved as null.",
        });

        email = null;
      }

      const studentData = {
        college_id: collegeId,

        registration_number:
          registrationNumber,

        student_id: excelUsername,

        username: excelUsername,

        name: studentName,

        father_name: cleanText(
          row["fathers name"] ??
            row["father name"],
        ),

        dob: parseDate(
          row["date of birth"] ??
            row.dob,
        ),

        mobile: cleanMobile(
          row["mobile no"] ??
            row["mobile number"] ??
            row.mobile,
        ),

        email,

        programme: cleanText(
          row.degree ??
            row.programme ??
            row.course,
        ),

        major_subject:
          extractMajorSubject(
            row.subjects ??
              row.subject,
          ),

        /*
         * Imported students are not registered yet.
         */
        payment_status:
          existingStudent?.payment_status ??
          "pending",

        internship_status:
          existingStudent
            ?.internship_status ??
          "preloaded",

        registration_date:
          existingStudent
            ?.registration_date ?? null,

        password_hash:
          existingStudent
            ?.password_hash ?? null,

        session:
          existingStudent?.session ?? null,

        semester:
          existingStudent?.semester ?? null,

        academics_json: {
          ...(existingStudent?.academics_json ??
            {}),

          source:
            "college_excel_upload",

          source_student_type:
            cleanText(
              row["student type"],
            ),

          mother_name:
            cleanText(
              row["mothers name"] ??
                row["mother name"],
            ),

          full_subjects:
            cleanText(
              row.subjects ??
                row.subject,
            ),

          source_status:
            cleanText(row.status),

          source_date:
            parseDate(row.date),

          imported_at:
            new Date().toISOString(),
        },
      };

      try {
        if (existingStudent) {
          await existingStudent.update(
            studentData,
            { transaction },
          );

          updated += 1;
        } else {
          const createdStudent =
            await Student.create(
              studentData,
              { transaction },
            );

          existingByRegistration.set(
            registrationNumber,
            createdStudent,
          );

          studentIdMap.set(
            excelUsername,
            createdStudent,
          );

          usernameMap.set(
            excelUsername,
            createdStudent,
          );

          inserted += 1;
        }
      } catch (error) {
        skipped += 1;

        errors.push({
          row: excelRowNumber,
          registration_number:
            registrationNumber,
          message:
            getDatabaseError(error),
        });
      }
    }

    await transaction.commit();

    return {
      total_rows: rawRows.length,
      valid_rows: rows.length,
      inserted,
      updated,
      skipped,
      warning_count: warnings.length,
      error_count: errors.length,
      warnings: warnings.slice(0, 200),
      errors: errors.slice(0, 200),
    };
  } catch (error) {
    await transaction.rollback();

    if (error instanceof AppError) {
      throw error;
    }

    console.error(
      "Student Excel import failed:",
      error,
    );

    throw new AppError(
      error?.message ??
        "Student Excel import failed",
      500,
    );
  }
};