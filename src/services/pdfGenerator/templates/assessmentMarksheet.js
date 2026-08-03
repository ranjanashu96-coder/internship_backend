import { escapeHtml, gradeFromPercentage, numberValue } from "../helpers.js";
import { baseStyles } from "../baseStyles.js";

export const assessmentMarksheetTemplate = ({
  student,
  college,
  domain,
  assessment,
  result,
  company,
}) => {

  const portalRegistrationNumber =
  student.portal_registration_number ||
  student.internship_registration_number ||
  "-";

const collegeRegistrationNumber =
  student.registration_number ||
  student.college_registration_number ||
  "-";

  const percentage = numberValue(
    result?.score_percentage || assessment?.percentage || assessment?.score_percentage,
  );
  const gradeInfo = gradeFromPercentage(percentage);
  const grade = result?.grade || gradeInfo.code;
  const gradeLabel = result?.grade_label || gradeInfo.label;
  const passed =
    String(result?.result_status || "").toLowerCase() === "passed" ||
    percentage >= numberValue(result?.pass_percentage, 40);

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        ${baseStyles}
        @page { size: A4; margin: 16mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #222a35; }
        .header { text-align: center; color: #1f4fa9; margin-top: 18px; }
        .brand { font-size: 24px; font-weight: 700; line-height: 1.25; }
        .unit { font-size: 22px; font-weight: 700; line-height: 1.25; }
        .header h1 { color: #2f3440; font-size: 20px; font-weight: 500; margin: 6px 0 8px; }
        .session { font-size: 14px; color: #3e4652; }
        .blue-line { height: 4px; background: #2f6cd6; margin: 28px 0 30px; }
        .student-table { border: 1px solid #d5dbe4; font-size: 14px; }
        .student-table td { border: 1px solid #d5dbe4; padding: 10px 12px; }
        .student-table td:first-child { width: 30%; font-weight: 700; color: #111827; }
        .result-panel { margin-top: 32px; border-left: 4px solid #2f6cd6; border-radius: 8px 0 0 8px; padding: 20px 24px 18px; min-height: 220px; }
        .result-panel h2 { color: #2857aa; font-size: 18px; margin: 0 0 28px; }
        .result-row { display: grid; grid-template-columns: 1fr 170px; align-items: center; margin-bottom: 24px; font-size: 15px; }
        .result-row strong { text-align: right; font-size: 15px; }
        .passed { color: #14833b; }
        .failed { color: #c62828; }
        .note { margin-top: 44px; padding-top: 20px; border-top: 1px solid #d5dbe4; text-align: center; font-size: 11px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">${escapeHtml(company.brand_name || "Rnexora Internship Program")}</div>
        <div class="unit">A unit of ${escapeHtml(company.name)}</div>
        <h1>ASSESSMENT MARKSHEET</h1>
        <div class="session">Academic Session ${escapeHtml(student.session || "-")}</div>
      </div>
      <div class="blue-line"></div>

     <table class="student-table">
  <tr>
    <td>Student Name</td>
    <td>${escapeHtml(student.name)}</td>
  </tr>

  <tr>
    <td>College Name</td>
    <td>${escapeHtml(college.name)}</td>
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
    <td>${escapeHtml(student.programme || "-")}</td>
  </tr>

  <tr>
    <td>Semester</td>
    <td>${escapeHtml(student.semester || "-")}</td>
  </tr>

  <tr>
    <td>Internship Topic</td>
    <td>${escapeHtml(domain.domain_name || "-")}</td>
  </tr>
</table>
      <div class="result-panel">
        <h2>Assessment Results</h2>
        <div class="result-row"><span>Score Percentage:</span><strong>${escapeHtml(percentage)}%</strong></div>
        <div class="result-row"><span>Grade:</span><strong>${escapeHtml(`${grade} (${gradeLabel})`)}</strong></div>
        <div class="result-row"><span>Status:</span><strong class="${passed ? "passed" : "failed"}">${passed ? "PASSED" : "FAILED"}</strong></div>
      </div>

      <div class="note">This is a computer generated marksheet. No signature required.</div>
    </body>
  </html>`;
};
