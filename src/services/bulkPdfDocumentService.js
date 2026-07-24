import {
  documentAutomationService,
} from "./documentAutomationService.js";

const toIsoDateTime = (value) => {
  if (!value) {
    return new Date().toISOString();
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return new Date().toISOString();
  }

  return date.toISOString();
};

const toDateOnly = (value) => {
  return toIsoDateTime(value).slice(
    0,
    10,
  );
};

const getFirstDate = (
  records = [],
) => {
  if (
    !Array.isArray(records) ||
    records.length === 0
  ) {
    return null;
  }

  return (
    records[0]?.date ||
    null
  );
};

const getLastDate = (
  records = [],
) => {
  if (
    !Array.isArray(records) ||
    records.length === 0
  ) {
    return null;
  }

  return (
    records[
      records.length - 1
    ]?.date ||
    null
  );
};

const normalizeResult = (
  result,
) => {
  const normalized =
    result || {};

  return {
    ...normalized,

    file_url:
      normalized.file_url ||
      normalized.publicUrl ||
      normalized.url ||
      null,

    qr_code_url:
      normalized.qr_code_url ||
      normalized.qrPublicUrl ||
      null,

    letter_reference:
      normalized.letter_reference ||
      normalized.letterReference ||
      null,
  };
};

const validateStudent = (
  student,
) => {
  if (!student?.id) {
    throw new Error(
      "Student ID is required for PDF generation",
    );
  }
};

class BulkPdfDocumentService {
  async generateOfferLetter({
    student,
    generatedAt,
    letterReference,
    internshipStartDate,
    internshipEndDate,
    totalHours = 120,
    createdBy = null,
  }) {
    validateStudent(student);

    const result =
      await documentAutomationService
        .generateOfferLetter(
          student.id,
          {
            generated_at:
              toIsoDateTime(
                generatedAt,
              ),

            issue_date:
              toDateOnly(
                generatedAt,
              ),

            letter_reference:
              letterReference ||
              null,

            start_date:
              internshipStartDate ||
              student
                .internship_start_date ||
              null,

            end_date:
              internshipEndDate ||
              student
                .internship_end_date ||
              null,

            duration_hours:
              Number(
                totalHours ||
                120,
              ),

            total_hours:
              Number(
                totalHours ||
                120,
              ),
          },
          createdBy,
        );

    const normalized =
      normalizeResult(result);

    if (
      !normalized.file_url
    ) {
      throw new Error(
        "Offer letter PDF URL was not returned",
      );
    }

    return normalized;
  }

  async generateAttendanceLog({
    student,
    attendance = [],
    generatedAt,
    totalRequiredHours = 120,
    completedHours = 0,
    supervisorName,
    organizationName,
    officeAddress,
    organizationPhone,
    createdBy = null,
  }) {
    validateStudent(student);

    const startDate =
      getFirstDate(
        attendance,
      );

    const endDate =
      getLastDate(
        attendance,
      );

    const result =
      await documentAutomationService
        .generateAttendanceLog(
          student.id,
          {
            generated_at:
              toIsoDateTime(
                generatedAt,
              ),

            start_date:
              startDate,

            end_date:
              endDate,

            total_hours:
              Number(
                totalRequiredHours ||
                120,
              ),

            duration_hours:
              Number(
                totalRequiredHours ||
                120,
              ),

            completed_hours:
              Number(
                completedHours ||
                0,
              ),

            supervisor_name:
              supervisorName ||
              student.mentor
                ?.name ||
              "Rahul Kumar",

            organization_name:
              organizationName ||
              "OPTIMARK VENTURES PRIVATE LIMITED",

            office_address:
              officeAddress ||
              "Biscuit Factory Road, Mithila Colony, Patna, Bihar 801503",

            organization_phone:
              organizationPhone ||
              "7544090878",
          },
          createdBy,
        );

    const normalized =
      normalizeResult(result);

    if (
      !normalized.file_url
    ) {
      throw new Error(
        "Attendance PDF URL was not returned",
      );
    }

    return normalized;
  }

  async generateAssessmentMarksheet({
    student,
    assessment,
    result,
    generatedAt,
    percentage,
    grade,
    resultStatus,
    performance,
    createdBy = null,
  }) {
    validateStudent(student);

    const generated =
      await documentAutomationService
        .generateAssessmentMarksheet(
          student.id,
          {
            generated_at:
              toIsoDateTime(
                generatedAt,
              ),

            assessment_id:
              assessment?.id ||
              null,

            result_id:
              result?.id ||
              null,

            score_percentage:
              Number(
                percentage ??
                result
                  ?.score_percentage ??
                0,
              ),

            grade:
              grade ||
              result?.grade ||
              "-",

            result_status:
              resultStatus ||
              result
                ?.result_status ||
              "pending",

            overall_performance:
              performance ||
              assessment
                ?.overall_performance ||
              "-",

            assessment_type:
              assessment
                ?.assessment_type ||
              "final",
          },
          createdBy,
        );

    const normalized =
      normalizeResult(
        generated,
      );

    if (
      !normalized.file_url
    ) {
      throw new Error(
        "Assessment marksheet PDF URL was not returned",
      );
    }

    return normalized;
  }

  async generateLogbook({
    student,
    entries = [],
    generatedAt,
    supervisorName,
    createdBy = null,
  }) {
    validateStudent(student);

    const result =
      await documentAutomationService
        .generateLogbook(
          student.id,
          {
            generated_at:
              toIsoDateTime(
                generatedAt,
              ),

            start_date:
              getFirstDate(
                entries,
              ),

            end_date:
              getLastDate(
                entries,
              ),

            supervisor_name:
              supervisorName ||
              student.mentor
                ?.name ||
              "Rahul Kumar",
          },
          createdBy,
        );

    const normalized =
      normalizeResult(result);

    if (
      !normalized.file_url
    ) {
      throw new Error(
        "Logbook PDF URL was not returned",
      );
    }

    return normalized;
  }

  async generateInternshipReport({
    student,
    attendance = [],
    chapterCount = 0,
    assessment,
    result,
    generatedAt,
    reportSummary,
    organizationName,
    internshipTopic,
    totalHours = 120,
    createdBy = null,
  }) {
    validateStudent(student);

    const generated =
      await documentAutomationService
        .generateInternshipReport(
          student.id,
          {
            generated_at:
              toIsoDateTime(
                generatedAt,
              ),

            start_date:
              getFirstDate(
                attendance,
              ) ||
              student
                .internship_start_date ||
              null,

            end_date:
              getLastDate(
                attendance,
              ) ||
              student
                .internship_end_date ||
              null,

            duration_hours:
              Number(
                totalHours ||
                120,
              ),

            total_hours:
              Number(
                totalHours ||
                120,
              ),

            completed_chapters:
              Number(
                chapterCount ||
                0,
              ),

            assessment_id:
              assessment?.id ||
              null,

            result_id:
              result?.id ||
              null,

            report_summary:
              reportSummary ||
              "The student completed all internship requirements successfully.",

            organization_name:
              organizationName ||
              "Optimark Ventures Private Limited",

            internship_topic:
              internshipTopic ||
              student.domain
                ?.domain_name ||
              student.major_subject ||
              "Internship Programme",
          },
          createdBy,
        );

    const normalized =
      normalizeResult(
        generated,
      );

    if (
      !normalized.file_url
    ) {
      throw new Error(
        "Internship report PDF URL was not returned",
      );
    }

    return normalized;
  }

  async generateCertificate({
    student,
    certificateNumber,
    verificationUrl,
    issuedDate,
    generatedAt,
    totalHours = 120,
    createdBy = null,
  }) {
    validateStudent(student);

    const generated =
      await documentAutomationService
        .generateCertificate(
          student.id,
          {
            generated_at:
              toIsoDateTime(
                generatedAt,
              ),

            issued_date:
              issuedDate ||
              toDateOnly(
                generatedAt,
              ),

            certificate_number:
              certificateNumber,

            verification_url:
              verificationUrl,

            duration_hours:
              Number(
                totalHours ||
                120,
              ),

            total_hours:
              Number(
                totalHours ||
                120,
              ),
          },
          createdBy,
        );

    const normalized =
      normalizeResult(
        generated,
      );

    if (
      !normalized.file_url
    ) {
      throw new Error(
        "Certificate PDF URL was not returned",
      );
    }

    return normalized;
  }
}

export const bulkPdfDocumentService =
  new BulkPdfDocumentService();

export default bulkPdfDocumentService;