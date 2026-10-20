import { escapeHtml, formatDateNumeric } from "../helpers.js";

export const departmentCertificateTemplate = ({
  logoDataUri,
  signatureDataUri,
  stampDataUri,
  company,
  student,
  college,
  domain,
  internship,
}) => {
  const collegeRegistrationNumber =
    student.registration_number ||
    student.college_registration_number ||
    "-";

  const programme = student.programme || "-";
  const session = student.session || "-";
  const durationHours =
    internship?.duration_hours ||
    domain?.duration_hours ||
    120;

  const gender = String(student.gender || "").toLowerCase();
  const pronoun = gender === "female" ? "her" : "his";
  const studentPronoun = gender === "female" ? "She" : "He";

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page {
          size: A4 portrait;
          margin: 20mm 20mm 20mm;
        }

        * { box-sizing: border-box; }

        html, body {
          margin: 0;
          padding: 0;
          font-family: "Times New Roman", Times, serif;
          color: #000;
          font-size: 13px;
          line-height: 1.8;
        }

        /* ✅ College header */
        .college-header {
          text-align: center;
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 2px solid #000;
        }

        .college-header .college-name {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin: 0;
        }

        .college-header .college-address {
          font-size: 11px;
          margin: 4px 0 0;
        }

        .college-header .college-university {
          font-size: 11px;
          margin: 4px 0 0;
        }

        /* Ref + Date */
        .ref-date {
          display: flex;
          justify-content: space-between;
          margin: 20px 0 10px;
          font-size: 13px;
        }

        /* Title */
        .title {
          text-align: center;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin: 20px 0 30px;
          text-decoration: underline;
        }

        /* Body */
        .content {
          text-align: justify;
        }

        .content p {
          margin: 0 0 20px;
          text-align: justify;
        }

        /* Signature */
        .signature-area {
          margin-top: 100px;
          text-align: right;
        }

        .signature-area .sig-name {
          font-weight: bold;
          font-size: 13px;
        }
      </style>
    </head>
    <body>

      <!-- ✅ COLLEGE HEADER -->
      <div class="college-header">
        <h1 class="college-name">${escapeHtml(college.name || "College Name")}</h1>
        ${
          college.university
            ? `<div class="college-university">${escapeHtml(college.university)}</div>`
            : ""
        }
        ${
          college.address
            ? `<div class="college-address">${escapeHtml(college.address)}</div>`
            : ""
        }
      </div>

      <!-- Ref + Date -->
      <div class="ref-date">
        <div>Ref. No.: ___________</div>
        <div>Date: ___________</div>
      </div>

      <!-- Title -->
      <div class="title">CERTIFICATE ISSUED BY THE DEPARTMENT</div>

      <!-- Body -->
      <div class="content">
        <p>
          This is to certify that
          <strong>${escapeHtml(student.name || "-")}</strong>,
          University Registration No.
          <strong>${escapeHtml(collegeRegistrationNumber)}</strong>,
          of <strong>${escapeHtml(college.name || "-")}</strong>,
          of programme <strong>${escapeHtml(programme)}</strong>,
          session <strong>${escapeHtml(session)}</strong>,
          has successfully completed ${pronoun} internship for a duration of
          <strong>${escapeHtml(String(durationHours))} Hours</strong>
          from
          <strong>${escapeHtml(company.name || "RKNEXORA PRIVATE LIMITED")}</strong>.
        </p>

        <p>
          ${studentPronoun} has also submitted the report of the internship after
          successful completion of the internship.
        </p>
      </div>

      <!-- Signature -->
      <div class="signature-area">
        <div class="sig-name">Head of the Department of the College</div>
      </div>

    </body>
  </html>`;
};