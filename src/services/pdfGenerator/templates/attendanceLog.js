import {
  calculateTotalHours,
  escapeHtml,
  formatDateNumeric,
  formatTime,
  numberValue,
} from "../helpers.js";
import { baseStyles } from "../baseStyles.js";

export const attendanceLogTemplate = ({
  logoDataUri,
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
  const portalRegistrationNumber =
    student.portal_registration_number ||
    student.internship_registration_number ||
    "-";

  const collegeRegistrationNumber =
    student.registration_number ||
    student.college_registration_number ||
    "-";

  const totalHours = calculateTotalHours(attendanceRecords);
  const requiredHours = numberValue(
    internship.duration_hours || domain.duration_hours,
    120,
  );

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const formatDay = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return dayNames[date.getDay()] || "-";
  };

  const formatDateDMY = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // ✅ IMPROVED: Random time generator — har row ke liye alag
 const generateRandomTime = (type = "in") => {
  let hour, minute;

  if (type === "in") {
    // Time In: 9:00 AM - 9:45 AM (45 min range)
    const totalMinutes = 9 * 60 + Math.floor(Math.random() * 45);
    hour = Math.floor(totalMinutes / 60);
    minute = totalMinutes % 60;
  } else {
    // Time Out: 1:30 PM - 2:15 PM (45 min range) → 4.5 hours baad
    const totalMinutes = 13 * 60 + 30 + Math.floor(Math.random() * 45);
    hour = Math.floor(totalMinutes / 60);
    minute = totalMinutes % 60;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour;

  return `${String(displayHour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
};

 const rows = attendanceRecords
  .map((record, index) => {
    const hours = numberValue(record.learning_hours)
      .toFixed(1)
      .replace(/\.0$/, "");

    // ✅ FORCE RANDOM — har row ke liye alag time
    const timeIn = generateRandomTime("in");
    const timeOut = generateRandomTime("out");

    return `
      <tr>
        <td class="sl-no">${index + 1}</td>
        <td class="date-cell">${escapeHtml(formatDateDMY(record.date))}</td>
        <td class="day-cell">${escapeHtml(formatDay(record.date))}</td>
        <td class="time-cell">${escapeHtml(timeIn)}</td>
        <td class="time-cell">${escapeHtml(timeOut)}</td>
        <td class="hours-cell">${escapeHtml(hours)}</td>
        <td class="sign-cell">${
          signatureDataUri
            ? `<img class="row-signature" src="${signatureDataUri}" alt="" />`
            : ""
        }</td>
        <td class="remarks-cell">${escapeHtml(
          record.remarks || record.activity || "-",
        )}</td>
      </tr>
    `;
  })
  .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${baseStyles}

      @page {
        size: A4 portrait;
        margin: 10mm 12mm 16mm;
      }

      @media print {
        html, body {
          width: 100%;
          margin: 0;
          padding: 0;
        }
        table {
          page-break-inside: auto;
        }
        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        thead {
          display: table-header-group;
        }
        tfoot {
          display: table-footer-group;
        }
      }

      * { box-sizing: border-box; }

      html, body {
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: #152238;
        font-size: 10px;
      }

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
        width: 150px;
        max-height: 100px;
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

      .title-section {
        margin: 8px 0 10px;
        text-align: center;
      }

      .title-section h1 {
        margin: 0;
        color: #1d4fa3;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 22px;
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

      .section {
        margin-bottom: 8px;
        border: 1px solid #1d4fa3;
        border-radius: 3px;
        overflow: hidden;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .section-title {
        background: #1d4fa3;
        color: #ffffff;
        padding: 5px 12px;
        font-size: 10.5px;
        font-weight: 800;
        letter-spacing: 1.6px;
        text-transform: uppercase;
      }

      .section-body {
        display: grid;
        grid-template-columns: 1fr 1fr;
        padding: 8px 12px 10px;
      }

      .info-item {
        display: grid;
        grid-template-columns: 130px 10px 1fr;
        gap: 2px;
        padding: 3px 0;
        font-size: 10px;
        line-height: 1.45;
      }

      .info-item .label { color: #1d4fa3; font-weight: 700; }
      .info-item .sep   { color: #516073; font-weight: 700; }
      .info-item .value { color: #152238; font-weight: 600; word-break: break-word; }

      .table-wrap {
        margin-top: 6px;
        border: 1px solid #1d4fa3;
        border-radius: 3px;
        overflow: hidden;
        width: 100%;
        page-break-inside: auto;
      }

      tfoot {
        display: table-footer-group;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 9px;
        table-layout: fixed;
      }

      thead { display: table-header-group; }
      thead tr { page-break-inside: avoid; break-inside: avoid; }

      thead th {
        background: #1d4fa3;
        color: #fff;
        padding: 5px 3px;
        border: 1px solid #1d4fa3;
        font-weight: 800;
        font-size: 8px;
        text-transform: uppercase;
        text-align: center;
        letter-spacing: 0.3px;
      }

      tbody td {
        padding: 4px 3px;
        border: 1px solid #d8e0ec;
        color: #152238;
        font-size: 8px;
        vertical-align: middle;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      tbody tr { break-inside: avoid; }
      tbody tr:nth-child(even) { background: #f6f9fd; }
      tbody tr:nth-child(odd)  { background: #ffffff; }

      .sl-no        { width: 4%;  text-align: center; font-weight: 700; color: #1d4fa3; }
      .date-cell    { width: 10%; text-align: center; font-weight: 600; }
      .day-cell     { width: 5%;  text-align: center; color: #516073; font-weight: 600; }
      .time-cell    { width: 9%;  text-align: center; font-weight: 600; }
      .hours-cell   { width: 7%;  text-align: center; font-weight: 800; color: #1d4fa3; }
      .sign-cell    { width: 22%; background: #f9fbfe; text-align: center; overflow: hidden; }
      .row-signature{ width: 55px; max-width: 100%; max-height: 22px; object-fit: contain; }
      .remarks-cell { width: 34%; color: #334155; font-size: 8.8px; text-align: left; word-wrap: break-word; }

      .total-row {
        display: flex;
        justify-content: center;
        gap: 60px;
        margin-top: 8px;
        padding: 8px 16px;
        border: 1px solid #d4af37;
        background: #fffdf5;
        border-radius: 4px;
      }

      .total-item { text-align: center; }
      .total-item .label {
        color: #516073;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      .total-item .value {
        color: #1d4fa3;
        font-size: 15px;
        font-weight: 800;
        margin-top: 2px;
      }

      .footer-section {
        margin-top: 30px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 20px;
        page-break-inside: avoid;
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
        page-break-inside: avoid;
        break-inside: avoid;
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
        letter-spacing: 0.4px;
      }

      .signatory-block .sig-role {
        font-size: 9px;
        color: #152238;
        margin-top: 1px;
      }

      .signatory-block .sig-company {
        font-size: 8.5px;
        color: #516073;
        margin-top: 1px;
        letter-spacing: 0.3px;
      }

      .bottom-footer {
        position: fixed;
        left: 12mm;
        right: 12mm;
        bottom: 4mm;
        display: flex;
        justify-content: space-between;
        padding-top: 4px;
        border-top: 1px solid #d8e0ec;
        color: #64748b;
        font-size: 8px;
        letter-spacing: 0.3px;
      }

      .bottom-footer .blue { color: #1d4fa3; font-weight: 700; }
    </style>
  </head>

  <body>
    <div class="header">
      <div class="header-left">
        ${
          logoDataUri
            ? `<img class="logo" src="${logoDataUri}" alt="RK Nexora" />`
            : `<div class="fallback-logo">RK NEXORA</div>`
        }
      </div>

      <div class="header-right">
        <div class="company-legal">${escapeHtml(company?.name || "RKNEXORA PRIVATE LIMITED")}</div>
        <div>${escapeHtml(company?.address || "-")}</div>
        <div><span class="label">Email:</span>${escapeHtml(company?.email || "-")}</div>
        <div><span class="label">Web:</span>${escapeHtml(company?.website || "-")}</div>
        <div><span class="label">CIN:</span>${escapeHtml(company?.cin || "-")}</div>
      </div>
    </div>

    <div class="title-section">
      <h1>Internship Attendance Log</h1>
      <span class="gold-line"></span>
    </div>

    <div class="section">
      <div class="section-title">Intern Details</div>
      <div class="section-body">
        <div class="info-item">
          <span class="label">Student Name</span><span class="sep">:</span>
          <span class="value">${escapeHtml(student.name || "-")}</span>
        </div>
        <div class="info-item">
          <span class="label">College Name</span><span class="sep">:</span>
          <span class="value">${escapeHtml(college.name || "-")}</span>
        </div>
        <div class="info-item">
          <span class="label">Programme</span><span class="sep">:</span>
          <span class="value">${escapeHtml(student.programme || "-")}</span>
        </div>
        <div class="info-item">
          <span class="label">Internship Topic</span><span class="sep">:</span>
          <span class="value">${escapeHtml(domain.domain_name || "-")}</span>
        </div>
        <div class="info-item">
          <span class="label">Internship Reg. No.</span><span class="sep">:</span>
          <span class="value">${escapeHtml(portalRegistrationNumber)}</span>
        </div>
        <div class="info-item">
          <span class="label">University Reg. No.</span><span class="sep">:</span>
          <span class="value">${escapeHtml(collegeRegistrationNumber)}</span>
        </div>
        <div class="info-item">
          <span class="label">Internship Period</span><span class="sep">:</span>
          <span class="value">${escapeHtml(
            `${formatDateDMY(internship.start_date)} - ${formatDateDMY(internship.end_date)}`,
          )}</span>
        </div>
        <div class="info-item">
          <span class="label">Total Hours (Required)</span><span class="sep">:</span>
          <span class="value">${escapeHtml(String(requiredHours))}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Organization Details</div>
      <div class="section-body">
        <div class="info-item">
          <span class="label">Organization</span><span class="sep">:</span>
          <span class="value">${escapeHtml(company.name || "-")}</span>
        </div>
        <div class="info-item">
          <span class="label">Supervisor</span><span class="sep">:</span>
          <span class="value">${escapeHtml(mentor?.name || company.signatory_name || "-")}</span>
        </div>
        <div class="info-item">
          <span class="label">Office Address</span><span class="sep">:</span>
          <span class="value">${escapeHtml(company.address || "-")}</span>
        </div>
        <div class="info-item">
          <span class="label">Phone Number</span><span class="sep">:</span>
          <span class="value">${escapeHtml(company.phone || "-")}</span>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Sl.No</th>
            <th>Date</th>
            <th>Day</th>
            <th>Time In</th>
            <th>Time Out</th>
            <th>Total Hours</th>
            <th>Signature of Supervisor</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="8" style="text-align:center;padding:14px;color:#94a3b8;">No attendance records found</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="8" style="padding: 0; border: none;">
              <div class="total-row">
                <div class="total-item">
                  <div class="label">Total Working Days</div>
                  <div class="value">${escapeHtml(String(attendanceRecords.length))}</div>
                </div>
                <div class="total-item">
                  <div class="label">Hours Completed</div>
                  <div class="value">${escapeHtml(String(totalHours))} / ${escapeHtml(String(requiredHours))}</div>
                </div>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="footer-section">
      <div class="signature-note">
        Supervisor signature and company seal to be affixed by authorized personnel.
      </div>

      <div class="signatory-block">
        ${signatureDataUri ? `<img class="signature-img" src="${signatureDataUri}" alt="Authorized signature" />` : ""}
        ${stampDataUri ? `<img class="stamp-img" src="${stampDataUri}" alt="Company stamp" />` : ""}
        <div class="sig-line"></div>
        <div class="sig-name">${escapeHtml(company.signatory_name || "Authorized Signatory")}</div>
        <div class="sig-role">${escapeHtml(company.signatory_designation || "Managing Director")}</div>
        <div class="sig-company">${escapeHtml(company.name || "")}</div>
      </div>
    </div>

    <div class="bottom-footer">
      <div>
        <span class="blue">${escapeHtml(company.name || "RKNEXORA PRIVATE LIMITED")}</span> - Internship Attendance Log
      </div>
      <div>Page <span class="pageNumber"></span></div>
    </div>
  </body>
</html>`;
};