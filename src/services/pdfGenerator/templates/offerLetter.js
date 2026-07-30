import { escapeHtml, formatDate } from "../helpers.js";
import { baseStyles } from "../baseStyles.js";

export const offerLetterTemplate = ({
  logoDataUri,
  signatureDataUri,
  stampDataUri,
  company,
  student,
  college,
  domain,
  mentor,
  internship,
}) => {
  const registrationNumber =
     student.id || "-";
  const issueYear = new Date(
    internship.issue_date || Date.now(),
  ).getFullYear();
  const letterReference =
    internship.letter_reference ||
    `RKN/${issueYear}/INT/${String(student.id || registrationNumber).padStart(6, "0")}`;

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        ${baseStyles}
        @page { size: A4; margin: 12mm 13mm; }
        body {
          font-family: Georgia, "Times New Roman", serif;
          color: #202634;
          font-size: 12.5px;
          line-height: 1.42;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
        }
        .logo { width: 205px; height: auto; margin-top: 4px; }
        .company { width: 390px; text-align: right; font-size: 10.5px; line-height: 1.4; }
        .company-name { font-size: 12px; font-weight: 700; }
        h1 {
          margin: 34px 0 26px;
          text-align: center;
          font-size: 21px;
          letter-spacing: 0.4px;
          color: #1e293b;
        }
        .reference-row {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 24px;
        }
        .recipient { margin-bottom: 20px; line-height: 1.55; }
        .recipient strong { display: block; }
        p { margin: 0 0 12px; text-align: justify; }
        .details-title { margin-top: 17px; margin-bottom: 11px; font-weight: 700; }
        .details { width: 73%; margin-bottom: 16px; }
        .details td { padding: 4px 0; vertical-align: top; }
        .details td:first-child { width: 42%; font-weight: 700; color: #3b4455; }
        .details td:nth-child(2) { width: 4%; }
        .details td:last-child { font-weight: 700; }
        .signature-block { position: relative; margin-top: 26px; width: 330px; min-height: 185px; }
        .signature { position: absolute; top: 42px; left: 8px; width: 78px; max-height: 55px; object-fit: contain; }
        .stamp { position: absolute; top: 0; left: 65px; width: 112px; max-height: 108px; object-fit: contain; }
        .signatory-text { position: absolute; top: 118px; left: 0; line-height: 1.35; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          ${
            logoDataUri
              ? `<img class="logo" src="${logoDataUri}" alt="RKnexora" />`
              : `<div class="text-bold blue" style="font-size: 26px;">Rknexora</div>`
          }
        </div>
        <div class="company">
          <div class="company-name">${escapeHtml(company.name)}</div>
          <div>CIN: ${escapeHtml(company.cin || "-")}</div>
          <div>${escapeHtml(company.address || "-")}</div>
          <div>${escapeHtml(company.email || "-")} | ${escapeHtml(company.phone || "-")}</div>
          <div>${escapeHtml(company.website || "-")}</div>
        </div>
      </div>

      <h1>INTERNSHIP ACCEPTANCE LETTER</h1>

      <div class="reference-row">
        <div><strong>Letter Ref. No.:</strong> ${escapeHtml(letterReference)}</div>
        <div><strong>Date:</strong> ${escapeHtml(formatDate(internship.issue_date))}</div>
      </div>

      <div class="recipient">
        <div><strong>To,</strong></div>
        <strong>${escapeHtml(student.name)}</strong>
        <strong>Roll No. : ${escapeHtml(student.student_id || student.registration_number || "-")}</strong>
        <strong>College: ${escapeHtml(college.name)}</strong>
      </div>

      <p>Dear Candidate,</p>
      <p>
        We are pleased to accept your application and offer you an internship with
        <strong>${escapeHtml(company.brand_name || "Rknexora")}</strong>, an initiative of
        <strong>${escapeHtml(company.name)}</strong>. Our organization satisfies the applicable internship
        guidelines of <strong>${escapeHtml(college.university || "the affiliated university")}</strong>
        for undergraduate programmes.
      </p>

      <div class="details-title">Your internship details are as follows:</div>
      <table class="details">
        <tr><td>Name of the Student</td><td>:</td><td>${escapeHtml(student.name)}</td></tr>
        <tr><td>Internship Registration No.</td><td>:</td><td>${escapeHtml(registrationNumber)}</td></tr>
        <tr><td>College / Institution</td><td>:</td><td>${escapeHtml(college.name)}</td></tr>
   
        <tr><td>Department & Semester</td><td>:</td><td>${escapeHtml(`${student.programme || "-"} - ${student.semester || "-"}`)}</td></tr>
        <tr><td>Internship Domain</td><td>:</td><td>${escapeHtml(domain.domain_name || "-")}</td></tr>
        <tr><td>Internship Duration</td><td>:</td><td>${escapeHtml(`${internship.duration_hours || domain.duration_hours || 120} Hours`)}</td></tr>
        <tr><td>Assigned Mentor</td><td>:</td><td>${escapeHtml(mentor?.name || "-")}</td></tr>
      </table>

      <p>During the internship, you are required to complete all assigned tasks, assessments, and activities under the guidance of your mentor.</p>
      <p>We appreciate your interest in our organization and look forward to your valuable contribution during the internship period.</p>

      <div class="signature-block">
        ${signatureDataUri ? `<img class="signature" src="${signatureDataUri}" alt="Signature" />` : ""}
        ${stampDataUri ? `<img class="stamp" src="${stampDataUri}" alt="Company stamp" />` : ""}
        <div class="signatory-text">
          <strong>${escapeHtml(company.signatory_name || "Authorized Signatory")}</strong><br />
          ${escapeHtml(company.signatory_designation || "Managing Director")}<br />
          ${escapeHtml(company.name)}
        </div>
      </div>
    </body>
  </html>`;
};
