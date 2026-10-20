import { escapeHtml, formatDateNumeric } from "../helpers.js";

export const assessmentMarksheetTemplate = ({
  logoDataUri,
  signatureDataUri,
  stampDataUri,
  company,
  student,
  college,
  domain,
  internship,
  assessment,
  result,
  percentage,
  grade,
  resultStatus,
}) => {
  const collegeRegistrationNumber =
    student.registration_number ||
    student.college_registration_number ||
    "-";

  const portalRegistrationNumber =
    student.portal_registration_number ||
    student.internship_registration_number ||
    "-";

  const programme = student.programme || "-";
  const semester = student.semester || "-";
  const session = student.session || "-";

  const scorePercentage = Number(percentage || result?.score_percentage || 0);
  const finalGrade = grade || result?.grade || "A+";
  const finalStatus = 
    resultStatus || result?.result_status === "passed" 
      ? "PASSED" 
      : "FAILED";

  const gradeLabel =
    finalGrade === "A+" ? "Outstanding" :
    finalGrade === "A" ? "Excellent" :
    finalGrade === "B+" ? "Very Good" :
    finalGrade === "B" ? "Good" :
    finalGrade === "C" ? "Satisfactory" :
    finalGrade === "D" ? "Pass" : "Needs Improvement";

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page {
          size: A4 portrait;
          margin: 10mm 12mm 16mm;
        }

        * { box-sizing: border-box; }

        html, body {
          margin: 0;
          padding: 0;
          font-family: Arial, Helvetica, sans-serif;
          color: #152238;
          font-size: 10px;
        }

        /* HEADER */
        .header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 8px;
          border-bottom: 3px solid #1d4fa3;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo {
          width: 80px;
          max-height: 80px;
          object-fit: contain;
        }

        .fallback-logo {
          color: #1d4fa3;
          font-size: 22px;
          font-weight: 800;
        }

        .company-block .company-name {
          color: #1d4fa3;
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 1.2px;
          line-height: 1.1;
        }

        .company-block .company-tagline {
          color: #d4af37;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 1.4px;
          margin-top: 2px;
        }

        .company-block .company-sub {
          color: #516073;
          font-size: 8.5px;
          margin-top: 2px;
        }

        .header-right {
          text-align: right;
          font-size: 9px;
          line-height: 1.5;
          color: #152238;
          min-width: 210px;
        }

        .header-right .company-legal {
          color: #1d4fa3;
          font-weight: 800;
          font-size: 10px;
          letter-spacing: 0.4px;
        }

        .header-right .label {
          color: #516073;
          font-weight: 600;
          margin-right: 3px;
        }

        /* Title */
        .title-section {
          margin: 14px 0 10px;
          text-align: center;
        }

        .title-section h1 {
          margin: 0;
          color: #1d4fa3;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 20px;
          letter-spacing: 4px;
          text-transform: uppercase;
          font-weight: 800;
        }

        .title-section .gold-line {
          display: block;
          margin: 6px auto 0;
          width: 120px;
          height: 3px;
          background: linear-gradient(90deg, transparent, #d4af37, transparent);
        }

        .title-section .subtitle {
          margin-top: 6px;
          font-size: 11px;
          color: #516073;
          font-weight: 600;
        }

        /* Student Table */
        .student-table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
          border: 1px solid #1d4fa3;
        }

        .student-table td {
          border: 1px solid #1d4fa3;
          padding: 8px 12px;
          vertical-align: top;
          font-size: 10px;
        }

        .student-table td:first-child {
          width: 35%;
          font-weight: bold;
          color: #1d4fa3;
          background: #f9fbfe;
        }

        /* Assessment */
        .assessment-title {
          text-align: center;
          font-size: 13px;
          font-weight: 800;
          margin: 20px 0 10px;
          text-transform: uppercase;
          color: #1d4fa3;
        }

        .score-table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
          border: 1px solid #1d4fa3;
        }

        .score-table td {
          border: 1px solid #1d4fa3;
          padding: 10px 14px;
          font-size: 12px;
        }

        .score-table td:first-child {
          width: 40%;
          font-weight: bold;
          color: #1d4fa3;
          background: #f9fbfe;
        }

        .score-table td:last-child {
          text-align: center;
        }

        .score-value {
          font-size: 18px;
          font-weight: bold;
          color: #1d4fa3;
        }

        .grade-value {
          font-size: 18px;
          font-weight: bold;
          color: #1d4fa3;
        }

        .status-value {
          font-size: 14px;
          font-weight: bold;
          color: #0a7c3f;
        }

        /* Footer */
        .footer-section {
          margin-top: 60px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
          break-inside: avoid;
        }

        .signature-note {
          font-size: 8.5px;
          color: #64748b;
          font-style: italic;
          line-height: 1.5;
          max-width: 55%;
        }

        .signatory-block {
          text-align: center;
          position: relative;
          min-width: 220px;
          padding-top: 90px;
        }

        .signatory-block .signature-img {
          position: absolute;
          top: 35px;
          left: 50%;
          transform: translateX(-50%);
          width: 80px;
          max-height: 50px;
          object-fit: contain;
          z-index: 2;
        }

        .signatory-block .stamp-img {
          position: absolute;
          top: 5px;
          left: 50%;
          transform: translateX(-50%);
          width: 80px;
          max-height: 80px;
          object-fit: contain;
          z-index: 1;
        }

        .signatory-block .sig-line {
          border-top: 1.5px solid #1d4fa3;
          padding-top: 4px;
          margin-top: 6px;
        }

        .signatory-block .sig-name {
          font-weight: 800;
          color: #1d4fa3;
          font-size: 11px;
        }

        .signatory-block .sig-role {
          font-size: 9px;
          color: #152238;
        }
      </style>
    </head>
    <body>

      <!-- HEADER -->
      <div class="header">
        <div class="header-left">
          ${
            logoDataUri
              ? `<img class="logo" src="${logoDataUri}" alt="RK Nexora" />`
              : `<div class="fallback-logo">RK NEXORA</div>`
          }
          <div class="company-block">
            <div class="company-name">${escapeHtml(company?.brand_name || "RK NEXORA")}</div>
            <div class="company-tagline">CAMPUS TO CAREER</div>
            <div class="company-sub">A Unit of ${escapeHtml(company?.name || "RKNexora Private Limited")}.</div>
          </div>
        </div>

        <div class="header-right">
          <div class="company-legal">${escapeHtml(company?.name || "RKNEXORA PRIVATE LIMITED")}</div>
          <div>${escapeHtml(company?.address || "-")}</div>
          <div><span class="label">Email:</span>${escapeHtml(company?.email || "-")}</div>
          <div><span class="label">Web:</span>${escapeHtml(company?.website || "-")}</div>
          <div><span class="label">CIN:</span>${escapeHtml(company?.cin || "-")}</div>
        </div>
      </div>

      <!-- Title -->
      <div class="title-section">
        <h1>Assessment Marksheet</h1>
        <span class="gold-line"></span>
        <div class="subtitle">Academic Session ${escapeHtml(session)}</div>
      </div>

      <!-- Student Info -->
      <table class="student-table">
        <tr>
          <td>Student Name</td>
          <td>${escapeHtml(student.name || "-")}</td>
        </tr>
        <tr>
          <td>College Name</td>
          <td>${escapeHtml(college.name || "-")}</td>
        </tr>
        <tr>
          <td>Internship Portal Registration Number</td>
          <td>${escapeHtml(portalRegistrationNumber)}</td>
        </tr>
        <tr>
          <td>College Registration Number</td>
          <td>${escapeHtml(collegeRegistrationNumber)}</td>
        </tr>
        <tr>
          <td>Department</td>
          <td>${escapeHtml(programme)}</td>
        </tr>
        <tr>
          <td>Semester</td>
          <td>${escapeHtml(semester)}</td>
        </tr>
        <tr>
          <td>Internship Topic</td>
          <td>${escapeHtml(domain.domain_name || "-")}</td>
        </tr>
      </table>

      <!-- Assessment Results -->
      <div class="assessment-title">Assessment Results</div>

      <table class="score-table">
        <tr>
          <td>Score Percentage</td>
          <td>
            <span class="score-value">${escapeHtml(scorePercentage.toFixed(2))}%</span>
          </td>
        </tr>
        <tr>
          <td>Grade</td>
          <td>
            <span class="grade-value">${escapeHtml(finalGrade)}</span>
            <span> (${escapeHtml(gradeLabel)})</span>
          </td>
        </tr>
        <tr>
          <td>Status</td>
          <td>
            <span class="status-value">${escapeHtml(finalStatus)}</span>
          </td>
        </tr>
      </table>

      <!-- Footer with Signature + Stamp -->
      <div class="footer-section">
        <div class="signature-note">
          This is a computer-generated marksheet.
        </div>

        <div class="signatory-block">
          ${signatureDataUri ? `<img class="signature-img" src="${signatureDataUri}" alt="Signature" />` : ""}
          ${stampDataUri ? `<img class="stamp-img" src="${stampDataUri}" alt="Stamp" />` : ""}
          <div class="sig-line"></div>
          <div class="sig-name">${escapeHtml(company.signatory_name || "Authorized Signatory")}</div>
          <div class="sig-role">${escapeHtml(company.signatory_designation || "Managing Director")}</div>
        </div>
      </div>

    </body>
  </html>`;
};