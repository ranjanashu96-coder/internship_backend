import fs from "fs";
import path from "path";
import archiver from "archiver";
import { Op } from "sequelize";

import {
  College,
  Student,
  Certificate,
  Domain,
} from "../models/index.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  ok,
  AppError,
} from "../utils/response.js";

import {
  importStudents,
} from "../services/excelImportService.js";

import {
  ensureDir,
} from "../utils/files.js";

const getCollegeId = (req) => {
  const collegeId = req.user?.college_id;

  if (!collegeId) {
    throw new AppError(
      "College is not assigned to this user",
      400,
    );
  }

  return collegeId;
};

const toNumber = (value) => {
  const parsedValue =
    Number(value);

  return Number.isFinite(
    parsedValue,
  )
    ? parsedValue
    : 0;
};

const calculatePercentage = (
  value,
  total,
) => {
  const valueNumber =
    toNumber(value);

  const totalNumber =
    toNumber(total);

  if (totalNumber <= 0) {
    return 0;
  }

  return Number(
    (
      (valueNumber /
        totalNumber) *
      100
    ).toFixed(2),
  );
};

const getMonthKey = (date) => {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(2, "0");

  return `${year}-${month}`;
};

/**
 * GET /college/dashboard
 */
export const dashboard =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        getCollegeId(req);

      const college =
        await College.findByPk(
          collegeId,
          {
            attributes: [
              "id",
              "name",
              "code",
              "university",
              "principal_name",
              "coordinator_name",
              "email",
              "mobile",
              "address",
              "state",
              "district",
              "pincode",
              "logo",
              "college_share",
              "rknexora_share",
              "status",
            ],
          },
        );

      if (!college) {
        throw new AppError(
          "College not found",
          404,
        );
      }

      /*
       * Only fetch students belonging
       * to the authenticated college.
       */
      const studentRows =
        await Student.findAll({
          where: {
            college_id:
              collegeId,
          },

          attributes: [
            "id",
            "registration_number",
            "student_id",
            "name",
            "email",
            "mobile",
            "programme",
            "major_subject",
            "session",
            "semester",
            "domain_id",
            "mentor_id",
            "internship_status",
            "payment_status",
            "total_progress",
            "registration_date",
            "created_at",
          ],

          include: [
            {
              model: Domain,
              as: "domain",

              attributes: [
                "id",
                "domain_name",
                "fee",
                "duration_hours",
              ],

              required: false,
            },
          ],

          order: [
            [
              "created_at",
              "DESC",
            ],
            ["id", "DESC"],
          ],
        });

      const students =
        studentRows.map(
          (student) =>
            student.toJSON(),
        );

      const studentIds =
        students.map(
          (student) =>
            Number(student.id),
        );

      const certificateCount =
        studentIds.length > 0
          ? await Certificate.count({
              where: {
                student_id: {
                  [Op.in]:
                    studentIds,
                },
              },
            })
          : 0;

      /*
       * Student status summary.
       */
      const studentStatus = {
        preloaded: 0,
        registered: 0,
        active: 0,
        completed: 0,
        blocked: 0,
      };

      /*
       * Payment status summary.
       */
      const paymentStatus = {
        pending: 0,
        paid: 0,
        failed: 0,
        refunded: 0,
      };

      let assignedStudents = 0;
      let unassignedStudents = 0;

      let totalProgress = 0;
      let paidRevenue = 0;

      const domainMap =
        new Map();

      const sessionMap =
        new Map();

      const progressDistribution = {
        not_started: 0,
        up_to_25: 0,
        up_to_50: 0,
        up_to_75: 0,
        up_to_99: 0,
        completed: 0,
      };

      for (
        const student of
        students
      ) {
        /*
         * Student status counting.
         */
        if (
          Object.prototype
            .hasOwnProperty.call(
              studentStatus,
              student.internship_status,
            )
        ) {
          studentStatus[
            student.internship_status
          ] += 1;
        }

        /*
         * Payment status counting.
         */
        if (
          Object.prototype
            .hasOwnProperty.call(
              paymentStatus,
              student.payment_status,
            )
        ) {
          paymentStatus[
            student.payment_status
          ] += 1;
        }

        /*
         * Mentor assignment counting.
         */
        if (student.mentor_id) {
          assignedStudents += 1;
        } else {
          unassignedStudents +=
            1;
        }

        /*
         * Progress calculation.
         */
        const progress =
          Math.min(
            100,
            Math.max(
              0,
              toNumber(
                student.total_progress,
              ),
            ),
          );

        totalProgress +=
          progress;

        if (progress <= 0) {
          progressDistribution
            .not_started += 1;
        } else if (
          progress <= 25
        ) {
          progressDistribution
            .up_to_25 += 1;
        } else if (
          progress <= 50
        ) {
          progressDistribution
            .up_to_50 += 1;
        } else if (
          progress <= 75
        ) {
          progressDistribution
            .up_to_75 += 1;
        } else if (
          progress < 100
        ) {
          progressDistribution
            .up_to_99 += 1;
        } else {
          progressDistribution
            .completed += 1;
        }

        /*
         * Revenue is calculated from
         * domain fee for paid students.
         */
        if (
          student.payment_status ===
          "paid"
        ) {
          paidRevenue +=
            toNumber(
              student.domain?.fee,
            );
        }

        /*
         * Domain distribution.
         */
        const domainId =
          student.domain?.id ??
          student.domain_id ??
          0;

        const domainName =
          student.domain
            ?.domain_name ??
          "Domain Not Selected";

        const existingDomain =
          domainMap.get(
            Number(domainId),
          );

        if (existingDomain) {
          existingDomain.student_count +=
            1;
        } else {
          domainMap.set(
            Number(domainId),
            {
              domain_id:
                Number(domainId),

              domain_name:
                domainName,

              student_count:
                1,
            },
          );
        }

        /*
         * Session distribution.
         */
        const session =
          String(
            student.session ||
              "Not Available",
          );

        sessionMap.set(
          session,
          (
            sessionMap.get(
              session,
            ) || 0
          ) + 1,
        );
      }

      const totalStudents =
        students.length;

      const pendingStudents =
        studentStatus.preloaded +
        studentStatus.registered;

      const averageProgress =
        totalStudents > 0
          ? Number(
              (
                totalProgress /
                totalStudents
              ).toFixed(2),
            )
          : 0;

      const completionRate =
        calculatePercentage(
          studentStatus.completed,
          totalStudents,
        );

      const paymentRate =
        calculatePercentage(
          paymentStatus.paid,
          totalStudents,
        );

      const mentorAssignmentRate =
        calculatePercentage(
          assignedStudents,
          totalStudents,
        );

      const certificateRate =
        calculatePercentage(
          certificateCount,
          totalStudents,
        );

      /*
       * Last 12 months registration
       * chart.
       */
      const currentDate =
        new Date();

      const monthMap =
        new Map();

      const monthlyRegistrations =
        Array.from(
          {
            length: 12,
          },
          (_, index) => {
            const date =
              new Date(
                currentDate
                  .getFullYear(),

                currentDate
                  .getMonth() -
                  11 +
                  index,

                1,
              );

            const key =
              getMonthKey(date);

            const monthItem = {
              key,

              month:
                date.toLocaleString(
                  "en-US",
                  {
                    month:
                      "short",
                  },
                ),

              year:
                date.getFullYear(),

              label:
                date.toLocaleString(
                  "en-US",
                  {
                    month:
                      "short",
                    year:
                      "numeric",
                  },
                ),

              registrations: 0,
            };

            monthMap.set(
              key,
              monthItem,
            );

            return monthItem;
          },
        );

      for (
        const student of
        students
      ) {
        const registrationValue =
          student.registration_date ||
          student.created_at;

        if (!registrationValue) {
          continue;
        }

        const registrationDate =
          new Date(
            registrationValue,
          );

        if (
          Number.isNaN(
            registrationDate
              .getTime(),
          )
        ) {
          continue;
        }

        const month =
          monthMap.get(
            getMonthKey(
              registrationDate,
            ),
          );

        if (month) {
          month.registrations +=
            1;
        }
      }

      const domainDistribution =
        Array.from(
          domainMap.values(),
        ).sort(
          (first, second) =>
            second.student_count -
            first.student_count,
        );

      const sessionDistribution =
        Array.from(
          sessionMap.entries(),
        )
          .map(
            ([
              session,
              studentCount,
            ]) => ({
              session,

              student_count:
                studentCount,
            }),
          )
          .sort(
            (first, second) =>
              second.student_count -
              first.student_count,
          );

      const recentStudents =
        students
          .slice(0, 8)
          .map(
            (student) => ({
              id:
                student.id,

              registration_number:
                student.registration_number,

              student_id:
                student.student_id,

              name:
                student.name,

              email:
                student.email,

              mobile:
                student.mobile,

              programme:
                student.programme,

              major_subject:
                student.major_subject,

              session:
                student.session,

              semester:
                student.semester,

              internship_status:
                student.internship_status,

              payment_status:
                student.payment_status,

              total_progress:
                toNumber(
                  student.total_progress,
                ),

              mentor_assigned:
                Boolean(
                  student.mentor_id,
                ),

              registered_at:
                student.registration_date ||
                student.created_at,

              domain:
                student.domain
                  ? {
                      id:
                        student.domain.id,

                      domain_name:
                        student.domain
                          .domain_name,

                      fee:
                        toNumber(
                          student.domain
                            .fee,
                        ),

                      duration_hours:
                        toNumber(
                          student.domain
                            .duration_hours,
                        ),
                    }
                  : null,
            }),
          );

      return ok(
        res,
        {
          college: {
            id:
              college.id,

            name:
              college.name,

            code:
              college.code,

            university:
              college.university,

            principal_name:
              college.principal_name,

            coordinator_name:
              college.coordinator_name,

            email:
              college.email,

            mobile:
              college.mobile,

            address:
              college.address,

            state:
              college.state,

            district:
              college.district,

            pincode:
              college.pincode,

            logo:
              college.logo,

            status:
              college.status,
          },

          summary: {
            total_students:
              totalStudents,

            active_students:
              studentStatus.active,

            completed_students:
              studentStatus.completed,

            pending_students:
              pendingStudents,

            preloaded_students:
              studentStatus.preloaded,

            registered_students:
              studentStatus.registered,

            blocked_students:
              studentStatus.blocked,

            paid_students:
              paymentStatus.paid,

            pending_payments:
              paymentStatus.pending,

            failed_payments:
              paymentStatus.failed,

            refunded_payments:
              paymentStatus.refunded,

            assigned_students:
              assignedStudents,

            unassigned_students:
              unassignedStudents,

            certificates_generated:
              certificateCount,

            average_progress:
              averageProgress,

            completion_rate:
              completionRate,

            payment_rate:
              paymentRate,

            mentor_assignment_rate:
              mentorAssignmentRate,

            certificate_rate:
              certificateRate,

            estimated_revenue:
              Number(
                paidRevenue.toFixed(
                  2,
                ),
              ),

            college_share_amount:
              Number(
                (
                  paidRevenue *
                  (
                    toNumber(
                      college.college_share,
                    ) / 100
                  )
                ).toFixed(2),
              ),

            rknexora_share_amount:
              Number(
                (
                  paidRevenue *
                  (
                    toNumber(
                      college.rknexora_share,
                    ) / 100
                  )
                ).toFixed(2),
              ),
          },

          student_status:
            studentStatus,

          payment_status:
            paymentStatus,

          progress_distribution:
            progressDistribution,

          monthly_registrations:
            monthlyRegistrations,

          domain_distribution:
            domainDistribution,

          session_distribution:
            sessionDistribution,

          recent_students:
            recentStudents,
        },
        "College dashboard fetched successfully",
      );
    },
  );

export const getProfile = asyncHandler(
  async (req, res) => {
    const collegeId = getCollegeId(req);

    const college =
      await College.findByPk(collegeId);

    if (!college) {
      throw new AppError(
        "College not found",
        404,
      );
    }

    ok(
      res,
      college,
      "College profile fetched successfully",
    );
  },
);

const UPLOADS_ROOT =
  path.resolve("uploads");

const resolveStoredFilePath = (
  fileUrl,
) => {
  if (!fileUrl) {
    return null;
  }

  const localPath =
    String(fileUrl)
      .replace(
        /^https?:\/\/[^/]+/i,
        "",
      )
      .replace(/^\/+/, "");

  const absolutePath =
    path.resolve(localPath);

  const isInsideUploads =
    absolutePath ===
      UPLOADS_ROOT ||
    absolutePath.startsWith(
      `${UPLOADS_ROOT}${path.sep}`,
    );

  if (!isInsideUploads) {
    return null;
  }

  return absolutePath;
};



const getCollegeStudentIds = async (
  collegeId,
  filters = {},
) => {
  const where = {
    college_id: collegeId,
  };

  if (filters.search) {
    where[Op.or] = [
      {
        name: {
          [Op.like]:
            `%${filters.search}%`,
        },
      },
      {
        registration_number: {
          [Op.like]:
            `%${filters.search}%`,
        },
      },
      {
        student_id: {
          [Op.like]:
            `%${filters.search}%`,
        },
      },
    ];
  }

  if (filters.session) {
    where.session =
      filters.session;
  }

  if (filters.semester) {
    where.semester =
      filters.semester;
  }

  const students =
    await Student.findAll({
      where,
      attributes: [
        "id",
      ],
    });

  return students.map(
    (student) =>
      student.id,
  );
};

export const updateProfile = asyncHandler(
  async (req, res) => {
    const collegeId = getCollegeId(req);

    const college =
      await College.findByPk(collegeId);

    if (!college) {
      throw new AppError(
        "College not found",
        404,
      );
    }

    const allowedFields = [
      "name",
      "university",
      "principal_name",
      "coordinator_name",
      "email",
      "mobile",
      "address",
      "state",
      "district",
      "pincode",
      "logo",
    ];

    const updateData = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] =
          typeof req.body[field] === "string"
            ? req.body[field].trim()
            : req.body[field];
      }
    }

    await college.update(updateData);

    ok(
      res,
      college,
      "College profile updated successfully",
    );
  },
);

export const uploadExcel = asyncHandler(
  async (req, res) => {
    const collegeId = getCollegeId(req);

    if (!req.file) {
      throw new AppError(
        "Excel file is required",
        400,
      );
    }

    try {
      const result = await importStudents(
        req.file.path,
        collegeId,
      );

      ok(
        res,
        result,
        "Student Excel imported successfully",
      );
    } finally {
      fs.unlink(
        req.file.path,
        (error) => {
          if (
            error &&
            error.code !== "ENOENT"
          ) {
            console.error(
              "Failed to delete uploaded Excel file:",
              error.message,
            );
          }
        },
      );
    }
  },
);

export const certificates =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        getCollegeId(req);

      const page = Math.max(
        1,
        Number(
          req.query.page ||
            1,
        ),
      );

      const limit = Math.min(
        100,
        Math.max(
          1,
          Number(
            req.query.limit ||
              20,
          ),
        ),
      );

      const studentIds =
        await getCollegeStudentIds(
          collegeId,
          {
            search:
              req.query.search,
            session:
              req.query.session,
            semester:
              req.query.semester,
          },
        );

      if (
        studentIds.length === 0
      ) {
        return ok(
          res,
          {
            items: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
          "Certificates fetched successfully",
        );
      }

      const certificateResult =
        await Certificate
          .findAndCountAll({
            where: {
              student_id: {
                [Op.in]:
                  studentIds,
              },
            },

            limit,

            offset:
              (page - 1) *
              limit,

            order: [
              [
                "issued_date",
                "DESC",
              ],
              [
                "id",
                "DESC",
              ],
            ],
          });

      const certificateStudentIds =
        [
          ...new Set(
            certificateResult
              .rows
              .map(
                (certificate) =>
                  certificate
                    .student_id,
              ),
          ),
        ];

      const students =
        await Student.findAll({
          where: {
            id: {
              [Op.in]:
                certificateStudentIds,
            },

            college_id:
              collegeId,
          },

          attributes: [
            "id",
            "registration_number",
            "student_id",
            "name",
            "programme",
            "major_subject",
            "session",
            "semester",
            "email",
            "mobile",
          ],
        });

      const studentMap =
        new Map(
          students.map(
            (student) => [
              student.id,
              student,
            ],
          ),
        );

      const items =
        certificateResult
          .rows
          .map(
            (certificate) => {
              const data =
                certificate.toJSON();

              return {
                ...data,

                student:
                  studentMap.get(
                    certificate
                      .student_id,
                  ) || null,

                view_url:
                  certificate
                    .certificate_url,

                download_url:
                  `/api/college/certificates/${certificate.id}/download`,
              };
            },
          );

      ok(
        res,
        {
          items,

          total:
            certificateResult
              .count,

          page,

          limit,

          totalPages:
            Math.ceil(
              certificateResult
                .count /
                limit,
            ),
        },
        "Certificates fetched successfully",
      );
    },
  );

  export const certificateById =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        getCollegeId(req);

      const certificate =
        await Certificate.findByPk(
          req.params.id,
        );

      if (!certificate) {
        throw new AppError(
          "Certificate not found",
          404,
        );
      }

      const student =
        await Student.findOne({
          where: {
            id:
              certificate
                .student_id,

            college_id:
              collegeId,
          },

          attributes: [
            "id",
            "registration_number",
            "student_id",
            "name",
            "programme",
            "major_subject",
            "session",
            "semester",
            "email",
            "mobile",
          ],
        });

      if (!student) {
        throw new AppError(
          "You are not allowed to access this certificate",
          403,
        );
      }

      ok(
        res,
        {
          ...certificate.toJSON(),

          student,

          view_url:
            certificate
              .certificate_url,

          download_url:
            `/api/college/certificates/${certificate.id}/download`,
        },
        "Certificate fetched successfully",
      );
    },
  );

  export const downloadCertificate =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        getCollegeId(req);

      const certificate =
        await Certificate.findByPk(
          req.params.id,
        );

      if (!certificate) {
        throw new AppError(
          "Certificate not found",
          404,
        );
      }

      const student =
        await Student.findOne({
          where: {
            id:
              certificate
                .student_id,

            college_id:
              collegeId,
          },

          attributes: [
            "id",
            "registration_number",
            "student_id",
            "name",
          ],
        });

      if (!student) {
        throw new AppError(
          "You are not allowed to download this certificate",
          403,
        );
      }

      const absolutePath =
        resolveStoredFilePath(
          certificate
            .certificate_url,
        );

      if (
        !absolutePath ||
        !fs.existsSync(
          absolutePath,
        )
      ) {
        throw new AppError(
          "Certificate PDF file not found",
          404,
        );
      }

      const registrationNumber =
        student
          .registration_number ||
        student.student_id ||
        `student-${student.id}`;

      const downloadName =
        `${registrationNumber}-internship-certificate.pdf`;

      res.download(
        absolutePath,
        downloadName,
        (error) => {
          if (
            error &&
            !res.headersSent
          ) {
            res.status(500).json({
              success: false,
              message:
                "Certificate download failed",
            });
          }
        },
      );
    },
  );

  export const downloadAllCertificates =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        getCollegeId(req);

      const college =
        await College.findByPk(
          collegeId,
          {
            attributes: [
              "id",
              "name",
              "code",
            ],
          },
        );

      if (!college) {
        throw new AppError(
          "College not found",
          404,
        );
      }

      const studentIds =
        await getCollegeStudentIds(
          collegeId,
          {
            search:
              req.query.search,
            session:
              req.query.session,
            semester:
              req.query.semester,
          },
        );

      if (
        studentIds.length === 0
      ) {
        throw new AppError(
          "No students found for the selected filters",
          404,
        );
      }

      const certificates =
        await Certificate.findAll({
          where: {
            student_id: {
              [Op.in]:
                studentIds,
            },
          },

          order: [
            [
              "student_id",
              "ASC",
            ],
          ],
        });

      if (
        certificates.length ===
        0
      ) {
        throw new AppError(
          "No certificates found",
          404,
        );
      }

      const students =
        await Student.findAll({
          where: {
            id: {
              [Op.in]:
                certificates.map(
                  (certificate) =>
                    certificate
                      .student_id,
                ),
            },

            college_id:
              collegeId,
          },

          attributes: [
            "id",
            "registration_number",
            "student_id",
            "name",
          ],
        });

      const studentMap =
        new Map(
          students.map(
            (student) => [
              student.id,
              student,
            ],
          ),
        );

      const zipDirectory =
        path.resolve(
          "uploads",
          "zips",
          "college-certificates",
        );

      ensureDir(
        zipDirectory,
      );

      const safeCollegeCode =
        String(
          college.code ||
            college.id,
        ).replace(
          /[^a-zA-Z0-9-_]/g,
          "-",
        );

      const zipFileName =
        `${safeCollegeCode}-certificates-${Date.now()}.zip`;

      const zipPath =
        path.join(
          zipDirectory,
          zipFileName,
        );

      const output =
        fs.createWriteStream(
          zipPath,
        );

      const archive =
        archiver(
          "zip",
          {
            zlib: {
              level: 9,
            },
          },
        );

      let addedFiles = 0;

      archive.pipe(output);

      for (
        const certificate of
        certificates
      ) {
        const student =
          studentMap.get(
            certificate
              .student_id,
          );

        if (!student) {
          continue;
        }

        const absolutePath =
          resolveStoredFilePath(
            certificate
              .certificate_url,
          );

        if (
          !absolutePath ||
          !fs.existsSync(
            absolutePath,
          )
        ) {
          continue;
        }

        const registrationNumber =
          student
            .registration_number ||
          student.student_id ||
          `student-${student.id}`;

        const safeRegistrationNumber =
          String(
            registrationNumber,
          ).replace(
            /[^a-zA-Z0-9-_]/g,
            "-",
          );

        archive.file(
          absolutePath,
          {
            name:
              `${safeRegistrationNumber}/${safeRegistrationNumber}-internship-certificate.pdf`,
          },
        );

        addedFiles += 1;

        const qrPath =
          resolveStoredFilePath(
            certificate
              .qr_code_url,
          );

        if (
          qrPath &&
          fs.existsSync(qrPath)
        ) {
          archive.file(
            qrPath,
            {
              name:
                `${safeRegistrationNumber}/${safeRegistrationNumber}-certificate-qr.png`,
            },
          );
        }
      }

      if (
        addedFiles === 0
      ) {
        archive.abort();

        throw new AppError(
          "Certificate files were not found on the server",
          404,
        );
      }

      await new Promise(
        (
          resolve,
          reject,
        ) => {
          output.on(
            "close",
            resolve,
          );

          output.on(
            "error",
            reject,
          );

          archive.on(
            "error",
            reject,
          );

          archive.finalize();
        },
      );

      res.download(
        zipPath,
        `${safeCollegeCode}-certificates.zip`,
        (error) => {
          fs.unlink(
            zipPath,
            (unlinkError) => {
              if (
                unlinkError &&
                unlinkError.code !==
                  "ENOENT"
              ) {
                console.error(
                  "Failed to delete temporary certificate ZIP:",
                  unlinkError.message,
                );
              }
            },
          );

          if (
            error &&
            !res.headersSent
          ) {
            res.status(500).json({
              success: false,
              message:
                "Certificate ZIP download failed",
            });
          }
        },
      );
    },
  );

export const registrations = asyncHandler(
  async (req, res) => {
    const collegeId = getCollegeId(req);

    const where = {
      college_id: collegeId,
    };

    if (req.query.session) {
      where.session = req.query.session;
    }

    if (req.query.semester) {
      where.semester =
        req.query.semester;
    }

    if (req.query.payment_status) {
      where.payment_status =
        req.query.payment_status;
    }

    if (req.query.internship_status) {
      where.internship_status =
        req.query.internship_status;
    }

    const students =
      await Student.findAll({
        where,

        attributes: {
          exclude: ["password_hash"],
        },

        order: [["id", "DESC"]],
      });

    ok(
      res,
      students,
      "Registrations fetched successfully",
    );
  },
);

export const studentsWithCertificates =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        getCollegeId(req);

      const page = Math.max(
        1,
        Number(req.query.page || 1),
      );

      const limit = Math.min(
        100,
        Math.max(
          1,
          Number(req.query.limit || 20),
        ),
      );

      const where = {
        college_id: collegeId,
      };

      const status =
        String(
          req.query.status || "",
        ).trim();

      if (
        status &&
        status !== "all"
      ) {
        if (status === "pending") {
          where.internship_status = {
            [Op.in]: [
              "preloaded",
              "registered",
            ],
          };
        } else {
          where.internship_status =
            status;
        }
      }

      if (req.query.session) {
        where.session =
          req.query.session;
      }

      if (req.query.semester) {
        where.semester =
          req.query.semester;
      }

      if (req.query.search) {
        const search =
          String(
            req.query.search,
          ).trim();

        where[Op.or] = [
          {
            registration_number: {
              [Op.like]:
                `%${search}%`,
            },
          },
          {
            student_id: {
              [Op.like]:
                `%${search}%`,
            },
          },
          {
            name: {
              [Op.like]:
                `%${search}%`,
            },
          },
          {
            email: {
              [Op.like]:
                `%${search}%`,
            },
          },
          {
            mobile: {
              [Op.like]:
                `%${search}%`,
            },
          },
        ];
      }

      const result =
        await Student.findAndCountAll({
          where,

          attributes: {
            exclude: [
              "password_hash",
            ],
          },

          include: [
            {
              model: Domain,
              as: "domain",

              attributes: [
                "id",
                "domain_name",
                "duration_hours",
              ],

              required: false,
            },
          ],

          limit,

          offset:
            (page - 1) *
            limit,

          order: [
            ["id", "DESC"],
          ],

          distinct: true,
        });

      const studentIds =
        result.rows.map(
          (student) =>
            student.id,
        );

      const certificateRows =
        studentIds.length > 0
          ? await Certificate.findAll({
              where: {
                student_id: {
                  [Op.in]:
                    studentIds,
                },
              },

              order: [
                [
                  "issued_date",
                  "DESC",
                ],
                [
                  "id",
                  "DESC",
                ],
              ],
            })
          : [];

      const certificateMap =
        new Map();

      for (
        const certificate of
        certificateRows
      ) {
        if (
          !certificateMap.has(
            certificate.student_id,
          )
        ) {
          certificateMap.set(
            certificate.student_id,
            certificate,
          );
        }
      }

      const items =
        result.rows.map(
          (student) => {
            const studentData =
              student.toJSON();

            const certificate =
              certificateMap.get(
                student.id,
              ) || null;

            const isCompleted =
              student.internship_status ===
              "completed";

            const certificateAvailable =
              Boolean(
                certificate
                  ?.certificate_url,
              );

            return {
              ...studentData,

              certificate:
                certificate
                  ? {
                      id:
                        certificate.id,

                      certificate_number:
                        certificate
                          .certificate_number,

                      certificate_url:
                        certificate
                          .certificate_url,

                      qr_code_url:
                        certificate
                          .qr_code_url,

                      verification_url:
                        certificate
                          .verification_url,

                      issued_date:
                        certificate
                          .issued_date,
                    }
                  : null,

              can_download_certificate:
                isCompleted &&
                certificateAvailable,

              certificate_message:
                !isCompleted
                  ? "Certificate available after internship completion"
                  : !certificateAvailable
                    ? "Certificate has not been generated"
                    : "Certificate available",
            };
          },
        );

      const [
        totalStudents,
        activeStudents,
        completedStudents,
        preloadedStudents,
        registeredStudents,
        blockedStudents,
      ] =
        await Promise.all([
          Student.count({
            where: {
              college_id:
                collegeId,
            },
          }),

          Student.count({
            where: {
              college_id:
                collegeId,

              internship_status:
                "active",
            },
          }),

          Student.count({
            where: {
              college_id:
                collegeId,

              internship_status:
                "completed",
            },
          }),

          Student.count({
            where: {
              college_id:
                collegeId,

              internship_status:
                "preloaded",
            },
          }),

          Student.count({
            where: {
              college_id:
                collegeId,

              internship_status:
                "registered",
            },
          }),

          Student.count({
            where: {
              college_id:
                collegeId,

              internship_status:
                "blocked",
            },
          }),
        ]);

      ok(
        res,
        {
          items,

          total:
            result.count,

          page,

          limit,

          totalPages:
            Math.ceil(
              result.count /
                limit,
            ),

          summary: {
            total:
              totalStudents,

            active:
              activeStudents,

            completed:
              completedStudents,

            pending:
              preloadedStudents +
              registeredStudents,

            blocked:
              blockedStudents,
          },
        },
        "College students fetched successfully",
      );
    },
  );

export const downloadStudentCertificate =
  asyncHandler(
    async (req, res) => {
      const collegeId =
        getCollegeId(req);

      const studentId =
        Number(
          req.params.studentId,
        );

      if (
        !Number.isInteger(
          studentId,
        ) ||
        studentId <= 0
      ) {
        throw new AppError(
          "Invalid student ID",
          422,
        );
      }

      const student =
        await Student.findOne({
          where: {
            id: studentId,
            college_id:
              collegeId,
          },

          attributes: [
            "id",
            "registration_number",
            "student_id",
            "name",
            "internship_status",
          ],
        });

      if (!student) {
        throw new AppError(
          "Student not found",
          404,
        );
      }

      if (
        student.internship_status !==
        "completed"
      ) {
        throw new AppError(
          "Certificate can be downloaded only after internship completion",
          422,
        );
      }

      const certificate =
        await Certificate.findOne({
          where: {
            student_id:
              student.id,
          },

          order: [
            [
              "issued_date",
              "DESC",
            ],
            ["id", "DESC"],
          ],
        });

      if (!certificate) {
        throw new AppError(
          "Certificate has not been generated",
          404,
        );
      }

      const absolutePath =
        resolveStoredFilePath(
          certificate
            .certificate_url,
        );

      if (
        !absolutePath ||
        !fs.existsSync(
          absolutePath,
        )
      ) {
        throw new AppError(
          "Certificate PDF file not found",
          404,
        );
      }

      const registrationNumber =
        student
          .registration_number ||
        student.student_id ||
        `student-${student.id}`;

      const safeRegistrationNumber =
        String(
          registrationNumber,
        ).replace(
          /[^a-zA-Z0-9-_]/g,
          "-",
        );

      return res.download(
        absolutePath,
        `${safeRegistrationNumber}-internship-certificate.pdf`,
      );
    },
  );