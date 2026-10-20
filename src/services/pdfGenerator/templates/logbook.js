import {
  escapeHtml,
  formatDateNumeric,
  numberValue,
} from "../helpers.js";

import { baseStyles } from "../baseStyles.js";

export const logbookTemplate = ({
  logoDataUri,
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
        <td class="sl-no">${index + 1}</td>
        <td class="date-cell">${escapeHtml(formatDateNumeric(entry.date))}</td>
        <td class="activity-cell">${escapeHtml(entry.activity || "-")}</td>
        <td class="skills-cell">${escapeHtml(entry.skills || entry.skills_learned || "-")}</td>
        <td class="hours-cell">${escapeHtml(
          numberValue(entry.hours_worked).toFixed(2).replace(/\.00$/, ""),
        )}</td>
        <td class="sign-cell">${
          signatureDataUri
            ? `<img class="row-signature" src="${signatureDataUri}" alt="Signature" />`
            : ""
        }</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        ${baseStyles}

        @page {
          size: A4 portrait;
          margin: 10mm 10mm 12mm;
        }

        * { box-sizing: border-box; }

        html, body {
          margin: 0;
          padding: 0;
          font-family: Arial, Helvetica, sans-serif;
          color: #152238;
          font-size: 10px;
        }

        /* Company header */
        .company-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 8px;
          border-bottom: 3px solid #1d4fa3;
          margin-bottom: 14px;
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

        .company-info .company-name {
          color: #1d4fa3;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 1.2px;
          line-height: 1.1;
        }

        .company-info .company-tagline {
          color: #d4af37;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.4px;
          margin-top: 2px;
        }

        .company-info .company-sub {
          color: #516073;
          font-size: 9px;
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

        .header-right strong {
          color: #516073;
          font-weight: 600;
          margin-right: 3px;
        }

        /* Title */
        h1 {
          text-align: center;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #1d4fa3;
          margin: 4px 0 14px;
        }

        /* Info box */
        .header-box {
          border: 1.5px solid #1d4fa3;
          border-radius: 3px;
          padding: 10px 14px;
          margin-bottom: 12px;
          background: #f9fbfe;
        }

        .header-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 30px;
        }

        .item {
          display: grid;
          grid-template-columns: 150px 10px 1fr;
          gap: 2px;
          font-size: 10px;
          line-height: 1.5;
        }

        .item strong {
          color: #1d4fa3;
          font-weight: 700;
        }

        .item .value {
          color: #152238;
          font-weight: 600;
          word-break: break-word;
        }

        /* Table */
        .log-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 9px;
          border: 1.5px solid #1d4fa3;
        }

        .log-table thead {
          display: table-header-group;
        }

        .log-table th {
          background: #1d4fa3;
          color: #ffffff;
          font-weight: 800;
          font-size: 9px;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          border: 1px solid #1d4fa3;
          padding: 7px 5px;
          text-align: center;
        }

        .log-table td {
          border: 1px solid #d8e0ec;
          padding: 6px 5px;
          vertical-align: middle;
          color: #152238;
          font-size: 8.8px;
        }

        .log-table tbody tr { page-break-inside: avoid; }
        .log-table tbody tr:nth-child(even) { background: #f6f9fd; }
        .log-table tbody tr:nth-child(odd)  { background: #ffffff; }

        .sl-no       { width: 5%;  text-align: center; font-weight: 700; color: #1d4fa3; }
        .date-cell   { width: 12%; text-align: center; font-weight: 600; }
        .activity-cell { width: 32%; text-align: left; }
        .skills-cell { width: 24%; text-align: left; }
        .hours-cell  { width: 8%;  text-align: center; font-weight: 800; color: #1d4fa3; }
        .sign-cell   { width: 19%; background: #f9fbfe; text-align: center; }

        .row-signature {
          width: 55px;
          max-height: 22px;
          object-fit: contain;
        }

        /* Footer */
        .footer-section {
          margin-top: 30px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
          break-inside: avoid;
          page-break-inside: avoid;
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

        /* Page footer */
        .page-footer {
          position: fixed;
          left: 10mm;
          right: 10mm;
          bottom: 4mm;
          display: flex;
          justify-content: space-between;
          padding-top: 4px;
          border-top: 1px solid #d8e0ec;
          color: #64748b;
          font-size: 8px;
          letter-spacing: 0.3px;
        }
      </style>
    </head>
    <body>

      <!-- Company header -->
      <div class="company-header">
        <div class="header-left">
          ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="Logo" />` : ""}
          <div class="company-info">
            <div class="company-name">${escapeHtml(company.brand_name || "RK NEXORA")}</div>
            <div class="company-tagline">CAMPUS TO CAREER</div>
            <div class="company-sub">A Unit of ${escapeHtml(company.name || "RKNexora Private Limited")}</div>
          </div>
        </div>

        <div class="header-right">
          <div class="company-legal">${escapeHtml(company.name || "RKNEXORA PRIVATE LIMITED")}</div>
          <div>${escapeHtml(company.address || "-")}</div>
          <div><strong>Email:</strong> ${escapeHtml(company.email || "-")}</div>
          <div><strong>Web:</strong> ${escapeHtml(company.website || "-")}</div>
          <div><strong>CIN:</strong> ${escapeHtml(company.cin || "-")}</div>
        </div>
      </div>

      <!-- Title -->
      <h1>Internship Daily Log Book</h1>

      <!-- Header info box -->
      <div class="header-box">
        <div class="header-grid">
          <div class="item">
            <strong>Student Name</strong>
            <span>:</span>
            <span class="value">${escapeHtml(student.name || "-")}</span>
          </div>
          <div class="item">
            <strong>College</strong>
            <span>:</span>
            <span class="value">${escapeHtml(college.name || "-")}</span>
          </div>
          <div class="item">
            <strong>Portal Reg. No.</strong>
            <span>:</span>
            <span class="value">${escapeHtml(portalRegistrationNumber)}</span>
          </div>
          <div class="item">
            <strong>College Reg. No.</strong>
            <span>:</span>
            <span class="value">${escapeHtml(collegeRegistrationNumber)}</span>
          </div>
          <div class="item">
            <strong>Domain</strong>
            <span>:</span>
            <span class="value">${escapeHtml(domain.domain_name || "-")}</span>
          </div>
          <div class="item">
            <strong>Session</strong>
            <span>:</span>
            <span class="value">${escapeHtml(student.session || "-")}</span>
          </div>
          <div class="item">
            <strong>Mentor</strong>
            <span>:</span>
            <span class="value">${escapeHtml(mentor?.name || "-")}</span>
          </div>
          <div class="item">
            <strong>Start Date</strong>
            <span>:</span>
            <span class="value">${escapeHtml(formatDateNumeric(internship.start_date))}</span>
          </div>
          <div class="item">
            <strong>End Date</strong>
            <span>:</span>
            <span class="value">${escapeHtml(formatDateNumeric(internship.end_date))}</span>
          </div>
        </div>
      </div>

      <!-- Log table -->
      <table class="log-table">
        <thead>
          <tr>
            <th>Sl.No</th>
            <th>Date</th>
            <th>Activity Performed</th>
            <th>Skills Learned</th>
            <th>Hours</th>
            <th>Supervisor Signature</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6" style="text-align:center;padding:14px;color:#94a3b8;">No logbook entries found</td></tr>`}
        </tbody>
      </table>

      <!-- Footer -->
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

      <!-- Page footer -->
      <div class="page-footer">
        <div>${escapeHtml(company.name || "RK NEXORA PRIVATE LIMITED")} - Internship Log Book</div>
        <div>Page <span class="pageNumber"></span></div>
      </div>

    </body>
  </html>`;
};