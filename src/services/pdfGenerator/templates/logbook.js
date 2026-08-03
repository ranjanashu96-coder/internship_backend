import { escapeHtml, formatDateNumeric, numberValue } from "../helpers.js";
import { baseStyles } from "../baseStyles.js";

export const logbookTemplate = ({
  signatureDataUri,
  stampDataUri,
  company,
  student,
  college,
  domain,
  mentor,
  internship,
  logbookEntries,
}) => {

  const portalRegistrationNumber =
    student.portal_registration_number ||
    student.internship_registration_number ||
    "-";

  const collegeRegistrationNumber =
    student.registration_number ||
    student.college_registration_number ||
    "-";

  const rows = logbookEntries
    .map(
      (entry, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(formatDateNumeric(entry.date))}</td>
        <td class="activity">${escapeHtml(entry.activity || "-")}</td>
        <td>${escapeHtml(entry.skills || entry.skills_learned || "-")}</td>
        <td>${escapeHtml(numberValue(entry.hours_worked).toFixed(2).replace(/\.00$/, ""))}</td>
        <td>${signatureDataUri ? `<img class="row-signature" src="${signatureDataUri}" alt="Signature" />` : ""}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        ${baseStyles}
        @page { size: A4; margin: 9mm 9mm 11mm; }
        body { font-size: 10px; }
        h1 { text-align: center; font-size: 16px; margin: 4px 0 12px; }
        .header-box { border: 1.3px solid #111; padding: 8px 10px; margin-bottom: 10px; }
        .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 25px; }
.item {
  display: grid;
  grid-template-columns: 145px 8px 1fr;
}        .item strong { font-weight: 700; }
        .log-table { table-layout: fixed; border: 1.3px solid #111; }
        .log-table th, .log-table td { border: 1px solid #111; padding: 5px 4px; text-align: center; vertical-align: middle; }
        .log-table th { font-size: 9px; }
        .log-table td { height: 42px; font-size: 8.8px; }
        .log-table th:nth-child(1) { width: 6%; }
        .log-table th:nth-child(2) { width: 13%; }
        .log-table th:nth-child(3) { width: 31%; }
        .log-table th:nth-child(4) { width: 23%; }
        .log-table th:nth-child(5) { width: 10%; }
        .log-table th:nth-child(6) { width: 17%; }
        .activity { text-align: left !important; }
        .row-signature { width: 54px; max-height: 24px; object-fit: contain; }
        .footer-signature { position: relative; width: 300px; min-height: 185px; margin-left: auto; margin-top: 12px; padding-top: 132px; text-align: center; break-inside: avoid; }
        .footer-signature .signature { position: absolute; top: 55px; left: 38px; width: 70px; }
        .footer-signature .stamp { position: absolute; top: 0; left: 92px; width: 115px; }
        .footer-signature .line { border-top: 1px solid #111; margin-top: 6px; padding-top: 4px; }
      </style>
    </head>
    <body>
      <h1>INTERNSHIP DAILY LOG BOOK</h1>
      <div class="header-box">
       <div class="header-grid">
  <div class="item">
    <strong>Student Name</strong>
    <span>:</span>
    <span>${escapeHtml(student.name)}</span>
  </div>

  <div class="item">
    <strong>College</strong>
    <span>:</span>
    <span>${escapeHtml(college.name)}</span>
  </div>

  <div class="item">
    <strong>Portal Registration No.</strong>
    <span>:</span>
    <span>${escapeHtml(portalRegistrationNumber)}</span>
  </div>

  <div class="item">
    <strong>College Registration No.</strong>
    <span>:</span>
    <span>${escapeHtml(collegeRegistrationNumber)}</span>
  </div>

  <div class="item">
    <strong>Domain</strong>
    <span>:</span>
    <span>${escapeHtml(domain.domain_name || "-")}</span>
  </div>

  <div class="item">
    <strong>Session</strong>
    <span>:</span>
    <span>${escapeHtml(student.session || "-")}</span>
  </div>

  <div class="item">
    <strong>Mentor</strong>
    <span>:</span>
    <span>${escapeHtml(mentor?.name || "-")}</span>
  </div>

  <div class="item">
    <strong>Start Date</strong>
    <span>:</span>
    <span>${escapeHtml(formatDateNumeric(internship.start_date))}</span>
  </div>

  <div class="item">
    <strong>End Date</strong>
    <span>:</span>
    <span>${escapeHtml(formatDateNumeric(internship.end_date))}</span>
  </div>
</div>
      </div>
      <table class="log-table">
        <thead><tr><th>Sl.No</th><th>Date</th><th>Activity Performed</th><th>Skills Learned</th><th>Hours</th><th>Supervisor Signature</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer-signature">
        ${signatureDataUri ? `<img class="signature" src="${signatureDataUri}" alt="Signature" />` : ""}
        ${stampDataUri ? `<img class="stamp" src="${stampDataUri}" alt="Stamp" />` : ""}
        <strong>${escapeHtml(company.signatory_name)}</strong><br />
        ${escapeHtml(company.signatory_designation)}<br />
        ${escapeHtml(company.name)}
        <div class="line">Authorized Signatory</div>
      </div>
    </body>
  </html>`;
};
