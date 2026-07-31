import {
  calculateTotalHours,
  escapeHtml,
  formatDateNumeric,
  formatTime,
  numberValue,
} from "../helpers.js";
import { baseStyles } from "../baseStyles.js";

export const attendanceLogTemplate = ({
  signatureDataUri,
  stampDataUri,
  company,
  student,
  college,
  domain,
  mentor,
  internship,
  attendanceRecords,
}) => {
  const totalHours = calculateTotalHours(attendanceRecords);
  const requiredHours = numberValue(
    internship.duration_hours || domain.duration_hours,
    120,
  );
  const rows = attendanceRecords
    .map(
      (record, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(formatDateNumeric(record.date))}</td>
          <td>${escapeHtml(formatTime(record.login_time))}</td>
          <td>${escapeHtml(formatTime(record.logout_time))}</td>
          <td>${escapeHtml(numberValue(record.learning_hours).toFixed(2).replace(/\.00$/, ""))}</td>
          <td>${signatureDataUri ? `<img class="row-signature" src="${signatureDataUri}" alt="Supervisor signature" />` : ""}</td>
          <td>${escapeHtml(record.remarks || record.activity || "-")}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        ${baseStyles}
        @page { size: A4; margin: 7mm 8mm 10mm; }
        body { font-size: 10px; color: #111827; }
        .document-title { text-align: center; margin-bottom: 12px; }
        .annexure { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
        .document-title h1 { margin: 0; font-size: 15px; }
        .info-box { border: 1.3px solid #161616; margin-bottom: 9px; padding: 7px 10px; }
        .info-title { text-align: center; text-decoration: underline; font-weight: 700; margin-bottom: 6px; }
        .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 28px; }
        .info-line { display: grid; grid-template-columns: 112px 8px 1fr; gap: 2px; margin-bottom: 3px; }
        .info-line .label { font-weight: 700; }
        .attendance-table { table-layout: fixed; border: 1.3px solid #111; }
        .attendance-table th, .attendance-table td { border: 1px solid #111; padding: 5px 3px; text-align: center; vertical-align: middle; }
        .attendance-table th { font-size: 9.5px; font-weight: 700; }
        .attendance-table td { height: 36px; font-size: 9px; }
        .attendance-table th:nth-child(1) { width: 7%; }
        .attendance-table th:nth-child(2) { width: 13%; }
        .attendance-table th:nth-child(3), .attendance-table th:nth-child(4) { width: 12%; }
        .attendance-table th:nth-child(5) { width: 13%; }
        .attendance-table th:nth-child(6) { width: 22%; }
        .attendance-table th:nth-child(7) { width: 21%; }
        .row-signature { width: 58px; max-height: 25px; object-fit: contain; }
        .completion-footer { margin-top: 10px; display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; break-inside: avoid; }
        .hours-completed { font-weight: 700; font-size: 10px; padding-top: 6px; }
        .authorized { position: relative; width: 310px; min-height: 190px; text-align: center; padding-top: 132px; }
        .authorized .signature { position: absolute; top: 55px; left: 38px; width: 72px; max-height: 42px; object-fit: contain; }
        .authorized .stamp { position: absolute; top: 0; left: 92px; width: 118px; max-height: 128px; object-fit: contain; }
        .authorized .line { border-top: 1px solid #111; margin-top: 7px; padding-top: 4px; }
      </style>
    </head>
    <body>
      <div class="document-title">
        <div class="annexure">${escapeHtml(internship.annexure || "ANNEXURE VII")}</div>
        <h1>INTERNSHIP ATTENDANCE LOG</h1>
      </div>

      <div class="info-box avoid-break">
        <div class="info-title">Intern Details</div>
        <div class="two-column">
          <div>
            <div class="info-line"><span class="label">Student Name</span><span>:</span><span>${escapeHtml(student.name)}</span></div>
            <div class="info-line"><span class="label">Programme</span><span>:</span><span>${escapeHtml(student.programme || "-")}</span></div>
            <div class="info-line"><span class="label">Internsghip Registration  Number</span><span>:</span><span>${escapeHtml(student.portal_registration_number || student.registration_number || "-")}</span></div>
            <div class="info-line"><span class="label">Internship Period</span><span>:</span><span>${escapeHtml(`${formatDateNumeric(internship.start_date)} - ${formatDateNumeric(internship.end_date)}`)}</span></div>
          </div>
          <div>
            <div class="info-line"><span class="label">College Name</span><span>:</span><span>${escapeHtml(college.name)}</span></div>
            <div class="info-line"><span class="label">Internship Topic</span><span>:</span><span>${escapeHtml(domain.domain_name || "-")}</span></div>
            <div class="info-line"><span class="label">Registration No.</span><span>:</span><span>${escapeHtml(student.registration_number || "-")}</span></div>
            <div class="info-line"><span class="label">Total Hours</span><span>:</span><span>${escapeHtml(requiredHours)}</span></div>
          </div>
        </div>
      </div>

      <div class="info-box avoid-break">
        <div class="info-title">Agency / Organization Details</div>
        <div class="two-column">
          <div>
            <div class="info-line"><span class="label">Organization</span><span>:</span><span>${escapeHtml(company.name)}</span></div>
            <div class="info-line"><span class="label">Office Address</span><span>:</span><span>${escapeHtml(company.address || "-")}</span></div>
          </div>
          <div>
            <div class="info-line"><span class="label">Supervisor</span><span>:</span><span>${escapeHtml(mentor?.name || company.signatory_name)}</span></div>
            <div class="info-line"><span class="label">Phone Number</span><span>:</span><span>${escapeHtml(company.phone || "-")}</span></div>
          </div>
        </div>
      </div>

      <table class="attendance-table">
        <thead>
          <tr>
            <th>Sl.No</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Total Hours</th><th>Signature of Supervisor</th><th>Remarks</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="completion-footer">
        <div class="hours-completed">Hours Completed : ${escapeHtml(totalHours)} / ${escapeHtml(requiredHours)}</div>
        <div class="authorized">
          ${signatureDataUri ? `<img class="signature" src="${signatureDataUri}" alt="Signature" />` : ""}
          ${stampDataUri ? `<img class="stamp" src="${stampDataUri}" alt="Stamp" />` : ""}
          <strong>${escapeHtml(company.signatory_name || "Authorized Signatory")}</strong><br />
          ${escapeHtml(company.signatory_designation || "Managing Director")}<br />
          ${escapeHtml(company.name)}
          <div class="line">Authorized Signatory</div>
        </div>
      </div>
    </body>
  </html>`;
};
