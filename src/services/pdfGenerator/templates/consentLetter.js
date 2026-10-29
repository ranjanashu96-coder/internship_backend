import { escapeHtml, formatDateNumeric } from "../helpers.js";

export const consentLetterTemplate = ({
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
          line-height: 1.6;
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
        .header-row {
          display: flex;
          justify-content: space-between;
          margin: 20px 0 30px;
          font-size: 13px;
        }

        /* Title */
        .title {
          text-align: center;
          font-size: 16px;
          font-weight: bold;
          letter-spacing: 2px;
          margin: 30px 0;
          text-transform: uppercase;
          text-decoration: underline;
        }

        .to-whom {
          text-align: center;
          font-size: 14px;
          font-weight: bold;
          letter-spacing: 1.5px;
          margin: 10px 0 30px;
          text-transform: uppercase;
        }

        .body-text {
          text-align: justify;
          font-size: 13px;
          line-height: 1.8;
          margin: 15px 0;
        }

        .student-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          font-size: 13px;
        }

        .student-table td {
          border: 1px solid #000;
          padding: 8px 12px;
          vertical-align: top;
        }

        .student-table td:first-child {
          width: 35%;
        }

        .closing {
          text-align: justify;
          font-size: 13px;
          line-height: 1.8;
          margin: 20px 0;
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
      <div class="header-row">
        <div>Letter No: ___________</div>
        <div>Date: ___________</div>
      </div>

      <!-- Title -->
      <div class="title">CONSENT LETTER</div>

      <!-- To Whom It May Concern -->
      <div class="to-whom">TO WHOM IT MAY CONCERN</div>

      <!-- Body -->
      <div class="body-text">
        As part of the curriculum of
        <strong>${escapeHtml(programme)}</strong> (CBCS UG) (name of programme/course),
        the students are required to undertake internship of minimum
        <strong>04 credits (${escapeHtml(String(durationHours))} hours)</strong>
        in an organization. In this regard, I am introducing the above-mentioned student
        with the following details for the purpose of the internship: -
      </div>

      <!-- Student Table -->
      <table class="student-table">
        <tr>
          <td>Name of the Student</td>
          <td>${escapeHtml(student.name || "-")}</td>
        </tr>
        <tr>
          <td>Gender</td>
          <td>${escapeHtml(student.gender || "-")}</td>
        </tr>
        <tr>
          <td>Father's Name</td>
          <td>${escapeHtml(student.father_name || "-")}</td>
        </tr>
        <tr>
          <td>University Registration Number</td>
          <td>${escapeHtml(collegeRegistrationNumber)}</td>
        </tr>
        <tr>
          <td>University Form Number /Roll No.</td>
          <td>${escapeHtml(student.student_id || student.registration_number || "-")}</td>
        </tr>
        <tr>
          <td>Class with Semester</td>
          <td>${escapeHtml(student.semester || "-")}</td>
        </tr>
        <tr>
          <td>Mobile Number</td>
          <td>${escapeHtml(student.mobile || "-")}</td>
        </tr>
        <tr>
          <td>Email Id.</td>
          <td>${escapeHtml(student.email || "-")}</td>
        </tr>
      </table>

      <!-- Closing -->
       <div class="closing">
        The organization satisfying the requirement of the Internship as provided in the guidelines of the University are requested to consider the candidature of the above-mentioned student for internship in your organization.
      </div>

      <!-- ✅ NEW: Signature Line -->
      <div style="margin-top: 80px;">
        <p style="font-weight: bold; font-size: 13px;">
          Signature of the Head of the Department of College/Internship Nodal Officer/Principal with Seal
        </p>
      </div>

    </body>
  </html>`;
};