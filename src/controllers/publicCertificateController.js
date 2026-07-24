import {
  Certificate,
  Student,
  College,
  Domain,
} from "../models/index.js";

import {
  asyncHandler,
} from "../utils/asyncHandler.js";

import {
  AppError,
  ok,
} from "../utils/response.js";

export const verifyCertificate = asyncHandler(
  async (req, res) => {
    const certificate =
      await Certificate.findOne({
        where: {
          certificate_number:
            req.params.certificateNumber,
        },
      });

    if (!certificate) {
      throw new AppError(
        "Certificate not found",
        404,
      );
    }

    const student =
      await Student.findByPk(
        certificate.student_id,
        {
          attributes: [
            "id",
            "name",
            "registration_number",
            "student_id",
            "programme",
            "semester",
            "session",
            "college_id",
            "domain_id",
          ],
        },
      );

    const [college, domain] =
      await Promise.all([
        student?.college_id
          ? College.findByPk(
              student.college_id,
              {
                attributes: [
                  "id",
                  "name",
                  "code",
                  "university",
                ],
              },
            )
          : null,

        student?.domain_id
          ? Domain.findByPk(
              student.domain_id,
              {
                attributes: [
                  "id",
                  "domain_name",
                  "duration_hours",
                ],
              },
            )
          : null,
      ]);

    ok(
      res,
      {
        valid: true,
        certificate: {
          certificate_number:
            certificate.certificate_number,
          issued_date:
            certificate.issued_date,
          certificate_url:
            certificate.certificate_url,
          qr_code_url:
            certificate.qr_code_url,
        },
        student,
        college,
        domain,
      },
      "Certificate verified successfully",
    );
  },
);
