import { Op } from "sequelize";

import {
  Student,
  College,
  Domain,
  Mentor,
  Attendance,
  Logbook,
  Assessment,
  Result,
  Certificate,
  GeneratedDocument,
} from "../models/index.js";

import { pdfGenerator } from "./pdfGenerator/index.js";
import {
  calculateTotalHours,
  gradeFromPercentage,
  numberValue,
} from "./pdfGenerator/helpers.js";

const DOCUMENT_TYPES = Object.freeze({
  OFFER_LETTER: "acceptance_letter",
  ATTENDANCE_LOG: "attendance_sheet",
  ASSESSMENT_MARKSHEET: "assessment_marksheet",
  LOGBOOK: "logbook",
  INTERNSHIP_REPORT: "internship_report",
  CERTIFICATE: "certificate",
});

const getDateRangeWhere = (payload = {}) => {
  if (!payload.start_date || !payload.end_date) {
    return undefined;
  }

  return {
    [Op.between]: [
      payload.start_date,
      payload.end_date,
    ],
  };
};

const getPercentageFromAssessment = (assessment) => {
  const criteria =
    assessment?.criteria_ratings_json || {};

  const values = Object.values(criteria)
    .map(Number)
    .filter(Number.isFinite);

  if (values.length === 0) {
    return 0;
  }

  return Number(
    (
      (values.reduce((sum, value) => sum + value, 0) /
        (values.length * 5)) *
      100
    ).toFixed(2),
  );
};

const getPublishedResult = async (
  studentId,
  assessment,
) => {
  const existing = await Result.findOne({
    where: {
      student_id: studentId,
    },
  });

  if (existing) {
    return existing;
  }

  const percentage =
    getPercentageFromAssessment(assessment);

  const grade = gradeFromPercentage(percentage);

  return {
    assessment_id: assessment?.id || null,
    score_percentage: percentage,
    grade: grade.code,
    grade_label: grade.label,
    result_status:
      percentage >= 40 ? "passed" : "failed",
    pass_percentage: 40,
  };
};

const requireRecord = (record, message) => {
  if (!record) {
    throw new Error(message);
  }

  return record;
};

const buildInternshipData = (
  student,
  domain,
  payload = {},
) => ({
  start_date:
    payload.start_date ||
    student.internship_start_date ||
    student.registration_date,

  end_date:
    payload.end_date ||
    student.internship_end_date ||
    new Date().toISOString().slice(0, 10),

  issue_date:
    payload.issue_date ||
    payload.generated_at ||
    new Date(),

  duration_hours:
    numberValue(
      payload.duration_hours ||
        domain?.duration_hours,
      120,
    ),

  registration_number:
    payload.internship_registration_number ||
    student.registration_number,

  letter_reference:
    payload.letter_reference,

  annexure:
    payload.annexure || "ANNEXURE VII",
});

const buildAttendanceSummary = (
  attendanceRecords,
  internship,
) => {
  const totalHours =
    calculateTotalHours(attendanceRecords);

  const requiredHours = numberValue(
    internship.duration_hours,
    120,
  );

  return {
    total_days: attendanceRecords.length,
    present_days: attendanceRecords.filter(
      (record) => record.status === "present",
    ).length,
    total_hours: totalHours,
    required_hours: requiredHours,
    percentage:
      requiredHours > 0
        ? Number(
            Math.min(
              100,
              (totalHours / requiredHours) * 100,
            ).toFixed(2),
          )
        : 0,
  };
};

const persistGeneratedDocument = async ({
  studentId,
  type,
  generated,
  createdBy,
  metadata = {},
}) => {
  const values = {
    file_url: generated.publicUrl,
    generated_at: new Date(),
    generated_by: createdBy || null,
    metadata_json: metadata,
  };

  const [row, created] =
    await GeneratedDocument.findOrCreate({
      where: {
        student_id: studentId,
        type,
      },
      defaults: {
        student_id: studentId,
        type,
        ...values,
      },
    });

  if (!created) {
    await row.update(values);
  }

  return row;
};

const loadStudentBundle = async (
  studentId,
  payload = {},
) => {
  const student = requireRecord(
    await Student.findByPk(studentId),
    `Student ${studentId} not found`,
  );

  const [college, domain, mentor] =
    await Promise.all([
      College.findByPk(student.college_id),
      student.domain_id
        ? Domain.findByPk(student.domain_id)
        : null,
      payload.mentor_id || student.mentor_id
        ? Mentor.findByPk(
            payload.mentor_id || student.mentor_id,
          )
        : null,
    ]);

  requireRecord(
    college,
    `College not found for student ${student.registration_number}`,
  );

  requireRecord(
    domain,
    `Domain not found for student ${student.registration_number}`,
  );

  const dateWhere = getDateRangeWhere(payload);

  const [
    attendanceRecords,
    logbookEntries,
    assessment,
  ] = await Promise.all([
    Attendance.findAll({
      where: {
        student_id: student.id,
        ...(dateWhere
          ? {
              date: dateWhere,
            }
          : {}),
      },
      order: [["date", "ASC"]],
    }),

    Logbook.findAll({
      where: {
        student_id: student.id,
        ...(dateWhere
          ? {
              date: dateWhere,
            }
          : {}),
      },
      order: [["date", "ASC"]],
    }),

    Assessment.findOne({
      where: {
        student_id: student.id,
        assessment_type:
          payload.assessment_type || "final",
      },
      order: [["id", "DESC"]],
    }),
  ]);

  const result = await getPublishedResult(
    student.id,
    assessment,
  );

  const internship = buildInternshipData(
    student,
    domain,
    payload,
  );

  return {
    student,
    college,
    domain,
    mentor,
    internship,
    attendanceRecords,
    logbookEntries,
    attendanceSummary: buildAttendanceSummary(
      attendanceRecords,
      internship,
    ),
    assessment:
      assessment || {
        criteria_ratings_json: {},
        overall_performance: "-",
        percentage: 0,
      },
    result,
  };
};

const ensureCertificate = async (
  bundle,
  payload = {},
) => {
  const issueDate =
    payload.issued_date ||
    new Date().toISOString().slice(0, 10);

  const prefix =
    payload.certificate_prefix || "RKN";

  const certificateNumber =
    payload.certificate_number ||
    `${prefix}-${new Date(issueDate).getFullYear()}-${String(
      bundle.student.id,
    ).padStart(7, "0")}`;

  const verificationUrl =
  `${
    process.env.CLIENT_URL ||
    "http://localhost:3000"
  }/verify-certificate/${encodeURIComponent(
    certificateNumber,
  )}`;

  const [certificate, created] =
    await Certificate.findOrCreate({
      where: {
        student_id: bundle.student.id,
      },
      defaults: {
        student_id: bundle.student.id,
        certificate_number: certificateNumber,
        qr_code_url: "pending",
        certificate_url: null,
        verification_url: verificationUrl,
        issued_date: issueDate,
      },
    });

  if (!created) {
    await certificate.update({
      certificate_number: certificateNumber,
      verification_url: verificationUrl,
      issued_date: issueDate,
    });
  }

  return certificate;
};

export const documentAutomationService = {
  async generateOfferLetter(
    studentId,
    payload = {},
    createdBy = null,
  ) {
    const bundle = await loadStudentBundle(
      studentId,
      payload,
    );

    const generated =
      await pdfGenerator.generateOfferLetter(bundle);

    await persistGeneratedDocument({
      studentId,
      type: DOCUMENT_TYPES.OFFER_LETTER,
      generated,
      createdBy,
      metadata: {
        letter_reference:
          bundle.internship.letter_reference || null,
        issue_date: bundle.internship.issue_date,
      },
    });

    return generated;
  },

  async generateAttendanceLog(
    studentId,
    payload = {},
    createdBy = null,
  ) {
    const bundle = await loadStudentBundle(
      studentId,
      payload,
    );

    const generated =
      await pdfGenerator.generateAttendanceLog(bundle);

    await persistGeneratedDocument({
      studentId,
      type: DOCUMENT_TYPES.ATTENDANCE_LOG,
      generated,
      createdBy,
      metadata: bundle.attendanceSummary,
    });

    return generated;
  },

  async generateAssessmentMarksheet(
    studentId,
    payload = {},
    createdBy = null,
  ) {
    const bundle = await loadStudentBundle(
      studentId,
      payload,
    );

    const generated =
      await pdfGenerator.generateAssessmentMarksheet(bundle);

    await persistGeneratedDocument({
      studentId,
      type: DOCUMENT_TYPES.ASSESSMENT_MARKSHEET,
      generated,
      createdBy,
      metadata: {
        score_percentage:
          bundle.result.score_percentage,
        grade: bundle.result.grade,
        result_status:
          bundle.result.result_status,
      },
    });

    return generated;
  },

  async generateLogbook(
    studentId,
    payload = {},
    createdBy = null,
  ) {
    const bundle = await loadStudentBundle(
      studentId,
      payload,
    );

    const generated =
      await pdfGenerator.generateLogbook(bundle);

    await persistGeneratedDocument({
      studentId,
      type: DOCUMENT_TYPES.LOGBOOK,
      generated,
      createdBy,
      metadata: {
        entries: bundle.logbookEntries.length,
      },
    });

    return generated;
  },

  async generateInternshipReport(
    studentId,
    payload = {},
    createdBy = null,
  ) {
    const bundle = await loadStudentBundle(
      studentId,
      payload,
    );

    const generated =
      await pdfGenerator.generateInternshipReport({
        ...bundle,
        reportContent: payload.report_content || {},
      });

    await persistGeneratedDocument({
      studentId,
      type: DOCUMENT_TYPES.INTERNSHIP_REPORT,
      generated,
      createdBy,
      metadata: {
        domain: bundle.domain.domain_name,
        duration_hours:
          bundle.internship.duration_hours,
      },
    });

    return generated;
  },

  async generateCertificate(
    studentId,
    payload = {},
    createdBy = null,
  ) {
    const bundle = await loadStudentBundle(
      studentId,
      payload,
    );

    const certificate =
      await ensureCertificate(bundle, payload);

    const generated =
      await pdfGenerator.generateCertificate({
        ...bundle,
        certificate,
      });

    await certificate.update({
      certificate_url: generated.publicUrl,
      qr_code_url:
        generated.qrPublicUrl,
    });

    await bundle.student.update({
      certificate_generated: true,
      certificate_url: generated.publicUrl,
    });

    await persistGeneratedDocument({
      studentId,
      type: DOCUMENT_TYPES.CERTIFICATE,
      generated,
      createdBy,
      metadata: {
        certificate_number:
          certificate.certificate_number,
        verification_url:
          certificate.verification_url,
        qr_code_url:
          generated.qrPublicUrl,
      },
    });

    return generated;
  },

  async generateAll(
    studentId,
    payload = {},
    createdBy = null,
  ) {
    const offerLetter =
      await this.generateOfferLetter(
        studentId,
        payload,
        createdBy,
      );

    const attendanceLog =
      await this.generateAttendanceLog(
        studentId,
        payload,
        createdBy,
      );

    const assessmentMarksheet =
      await this.generateAssessmentMarksheet(
        studentId,
        payload,
        createdBy,
      );

    const logbook = await this.generateLogbook(
      studentId,
      payload,
      createdBy,
    );

    const internshipReport =
      await this.generateInternshipReport(
        studentId,
        payload,
        createdBy,
      );

    const certificate =
      await this.generateCertificate(
        studentId,
        payload,
        createdBy,
      );

    return {
      offerLetter,
      attendanceLog,
      assessmentMarksheet,
      logbook,
      internshipReport,
      certificate,
    };
  },
};

export { DOCUMENT_TYPES };
