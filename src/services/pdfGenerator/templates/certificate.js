import {
  escapeHtml,
  formatDate,
} from "../helpers.js";

import {
  baseStyles,
} from "../baseStyles.js";

export const certificateTemplate = ({
  logoDataUri,
  signatureDataUri,
  stampDataUri,
  qrDataUri,

  aicteDataUri,
  isoDataUri,
  msmeDataUri,
  mcaDataUri,

  company,
  student,
  college,
  domain,
  internship,
  certificate,
}) => {
  const portalRegistrationNumber =
    student?.portal_registration_number ||
    student?.internship_registration_number ||
    "-";

  const collegeRegistrationNumber =
    student?.registration_number ||
    student?.college_registration_number ||
    "-";

  const durationHours =
    internship?.duration_hours ||
    domain?.duration_hours ||
    120;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />

    <style>
      ${baseStyles}

      @page {
        size: A4 portrait;
        margin: 8mm;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
      }

      body {
        background: #f8fbff;
        color: #152238;
        font-family: Arial, Helvetica, sans-serif;
      }

      .certificate {
        position: relative;
        width: 100%;
        height: 270mm;
        overflow: hidden;
        border: 8px solid #d4af37;
        border-radius: 10px;
        padding: 6mm 10mm 4mm;
        background:
          radial-gradient(circle at 10% 10%, rgba(46, 112, 216, 0.08), transparent 28%),
          radial-gradient(circle at 90% 90%, rgba(11, 174, 97, 0.08), transparent 28%),
          #ffffff;
        display: flex;
        flex-direction: column;
      }

      /* Top Header */
      .top-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding-bottom: 4px;
        border-bottom: 2px solid #d4af37;
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
        font-size: 25px;
        font-weight: 700;
      }

      .company-info {
        display: flex;
        flex-direction: column;
      }

      .company-info .company-name {
        color: #1d4fa3;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 1px;
      }

      .company-info .company-tagline {
        color: #d4af37;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 1px;
      }

      .company-info .company-sub {
        color: #516073;
        font-size: 9px;
      }

      .header-right {
        text-align: right;
        font-size: 9px;
        line-height: 1.5;
        color: #152238;
      }

      .header-right .contact-item {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
      }

      .header-right .contact-item img {
        width: 12px;
        height: 12px;
      }

      /* Title Section */
      .title-section {
        text-align: center;
        margin-top: 4px;
      }

      .title-section h1 {
        margin: 0;
        color: #1d4fa3;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 32px;
        letter-spacing: 2px;
        text-transform: uppercase;
      }

      .title-section .subtitle-badge {
        display: inline-block;
        margin-top: -2px;
        padding: 2px 40px;
        background: linear-gradient(90deg, #d4af37, #f5d76e, #d4af37);
        color: #152238;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 4px;
        border-radius: 4px;
        border: 1px solid #b8962e;
      }

      /* Meta Info */
      .meta-info {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-size: 11px;
        font-weight: 600;
        color: #1d4fa3;
      }

      /* Body */
      .body {
        flex: 1;
        margin-top: 4px;
        text-align: center;
      }

      .intro {
        font-size: 13px;
        color: #152238;
      }

      .student-name {
        display: inline-block;
        min-width: 410px;
        margin: 4px 0;
        padding: 0 18px 3px;
        border-bottom: 2px solid #d4af37;
        color: #1d4fa3;
        font-family: "Great Vibes", "Brush Script MT", cursive;
        font-size: 34px;
        font-weight: 700;
      }

      .detail {
        max-width: 780px;
        margin: 0 auto;
        font-size: 12px;
        line-height: 1.6;
        color: #152238;
      }

      .detail strong {
        color: #1d4fa3;
      }

      /* Assessment Table */
      .assessment-section {
        margin-top: 8px;
      }

      .assessment-header {
        display: inline-block;
        padding: 2px 30px;
        background: #1d4fa3;
        color: #ffffff;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 2px;
        border-radius: 4px;
        margin-bottom: 4px;
      }

      .assessment-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
      }

      .assessment-table th {
        background: #1d4fa3;
        color: #ffffff;
        padding: 4px 6px;
        border: 1px solid #1d4fa3;
        text-align: center;
        font-weight: 700;
      }

      .assessment-table td {
        padding: 4px 6px;
        border: 1px solid #d4af37;
        text-align: center;
        color: #152238;
      }

      .assessment-table td:nth-child(2) {
        text-align: left;
      }

      /* Supervisor Remarks */
      .remarks-box {
        margin-top: 6px;
        padding: 4px 8px;
        border: 1px solid #1d4fa3;
        border-radius: 4px;
        text-align: left;
        font-size: 10px;
        font-style: italic;
        color: #152238;
      }

      .remarks-box strong {
        font-style: normal;
        color: #1d4fa3;
      }

      /* Bottom Section */
      .bottom {
        display: grid;
        grid-template-columns: 120px 1fr 120px;
        align-items: end;
        gap: 16px;
        margin-top: 6px;
      }

      .qr-section {
        text-align: center;
        font-size: 8px;
        font-weight: 700;
        color: #1d4fa3;
      }

      .qr-section img {
        display: block;
        width: 72px;
        height: 72px;
        margin: 0 auto 2px;
        object-fit: contain;
      }

      .qr-section .verify-btn {
        display: inline-block;
        margin-top: 2px;
        padding: 2px 10px;
        background: #1d4fa3;
        color: #ffffff;
        font-size: 7px;
        font-weight: 700;
        border-radius: 3px;
        text-decoration: none;
      }

      .signatory-section {
        display: flex;
        justify-content: space-around;
        align-items: flex-end;
        text-align: center;
        font-size: 9px;
        line-height: 1.4;
      }

      .signatory {
        position: relative;
        min-height: 80px;
        padding-top: 60px;
        text-align: center;
        font-size: 9px;
        line-height: 1.4;
      }

      .signatory .signature {
        position: absolute;
        top: 20px;
        left: calc(50% - 35px);
        width: 70px;
        max-height: 44px;
        object-fit: contain;
      }

      .signatory .stamp {
        position: absolute;
        top: -10px;
        left: calc(50% - 44px);
        width: 88px;
        max-height: 92px;
        object-fit: contain;
      }

      .signatory .line {
        margin-top: 4px;
        padding-top: 3px;
        border-top: 1px solid #1d4fa3;
        font-weight: 700;
        color: #1d4fa3;
      }

      /* Footer */
      .footer {
        display: flex;
        justify-content: space-between;
        margin-top: 4px;
        font-size: 9px;
        font-weight: 600;
        color: #1d4fa3;
      }

      /* Recognition */
      .certificate-recognition {
        margin-top: 4px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .recognition-row {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        align-items: center;
        gap: 10px;
        padding: 4px 10px 2px;
        border-top: 1px solid #d4af37;
      }

      .recognition-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
      }

      .recognition-logo img {
        display: block;
        max-width: 90px;
        max-height: 36px;
        object-fit: contain;
      }

      .recognition-text {
        text-align: center;
        color: #1d4fa3;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 7px;
        font-weight: 700;
      }

      .certificate-blue-footer {
        position: relative;
        height: 10px;
        margin-top: 2px;
        overflow: hidden;
        background: #079ae8;
      }

      .certificate-blue-footer::before {
        content: "";
        position: absolute;
        left: 0;
        bottom: 0;
        width: 64%;
        height: 5px;
        background: #155ab4;
      }

      .certificate-blue-footer::after {
        content: "";
        position: absolute;
        left: 50%;
        bottom: 0;
        width: 18%;
        height: 10px;
        background: #ffffff;
        transform: skewX(-42deg);
      }
    </style>
  </head>

  <body>
    <div class="certificate">
      <!-- Top Header -->
      <div class="top-header">
        <div class="header-left">
          ${
            logoDataUri
              ? `<img class="logo" src="${logoDataUri}" alt="RK Nexora" />`
              : `<div class="fallback-logo">RK NEXORA</div>`
          }
          <div class="company-info">
            <div class="company-name">${escapeHtml(company?.name || "RK NEXORA PRIVATE LIMITED")}</div>
            <div class="company-tagline">LEARN | PRACTICE | GROW | GET PLACED</div>
            <div class="company-sub">A Unit of RKNexora Private Limited</div>
          </div>
        </div>
        <div class="header-right">
          <div class="contact-item">
            <span>🌐</span> ${escapeHtml(company?.website || "www.rknexora.org")}
          </div>
          <div class="contact-item">
            <span>📞</span> ${escapeHtml(company?.phone || "9693275424")}
          </div>
          <div class="contact-item">
            <span>✉️</span> ${escapeHtml(company?.email || "supportrknexora@gmail.com")}
          </div>
          <div class="contact-item">
            <span>📍</span> ${escapeHtml(company?.address || "Khiri Jethian, Atri, Gaya, Bihar – 805236")}
          </div>
        </div>
      </div>

      <!-- Title -->
      <div class="title-section">
        <h1>INTERNSHIP COMPLETION</h1>
        <div class="subtitle-badge">CERTIFICATE</div>
      </div>

      <!-- Meta Info -->
      <div class="meta-info">
        <div><strong>Certificate No.:</strong> ${escapeHtml(certificate?.certificate_number || "-")}</div>
        <div><strong>Date:</strong> ${escapeHtml(formatDate(certificate?.issued_date))}</div>
      </div>

      <!-- Body -->
      <div class="body">
        <div class="intro">This is to certify that</div>
        <div class="student-name">
          ${escapeHtml(student?.name || "-")}
        </div>
       <div class="detail">
  ${
    student?.father_name
      ? `S/o or D/o <strong>${escapeHtml(student.father_name)}</strong>,`
      : `S/o or D/o <strong>[Father's/Guardian's Name]</strong>,`
  }
  bearing University Registration / Enrolment No.
  <strong>${escapeHtml(collegeRegistrationNumber)}</strong> of
  <strong>${escapeHtml(college?.name || "-")}</strong>,
  Session <strong>${escapeHtml(student?.session || "-")}</strong>,
  with Major in <strong>${escapeHtml(student?.major_subject || "-")}</strong>,
  has successfully completed his/her internship with
  <strong>${escapeHtml(company?.name || "RK NEXORA Private Limited")}</strong>.
</div>

        <!-- Internship Details -->
        <div style="display: flex; justify-content: space-around; margin-top: 6px; font-size: 10px; color: #152238;">
          <div style="text-align: center;">
            <div style="font-weight: 700; color: #1d4fa3;">Internship Duration</div>
            <div>From ${escapeHtml(formatDate(internship?.start_date))}</div>
            <div>to ${escapeHtml(formatDate(internship?.end_date))}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-weight: 700; color: #1d4fa3;">Total Hours Completed</div>
            <div><strong>${escapeHtml(`${durationHours} Hours`)}</strong></div>
          </div>
          <div style="text-align: center;">
            <div style="font-weight: 700; color: #1d4fa3;">Mode of Internship</div>
            <div><strong>${escapeHtml(internship?.mode || "Online")}</strong></div>
          </div>
          <div style="text-align: center;">
            <div style="font-weight: 700; color: #1d4fa3;">Domain / Area</div>
            <div><strong>${escapeHtml(domain?.domain_name || "-")}</strong></div>
          </div>
        </div>

        <!-- Assessment Section -->
        <div class="assessment-section">
          <div class="assessment-header">INTERNSHIP PERFORMANCE ASSESSMENT</div>
          <div style="font-size: 10px; margin-bottom: 2px;">
            During the internship, the student worked on assigned project(s) and task(s). Based on our observation
            and mentorship, we assess the student's performance as follows:
          </div>
          <table class="assessment-table">
            <thead>
              <tr>
                <th style="width: 8%;">S. No.</th>
                <th style="width: 52%;">Assessment Criteria</th>
                <th style="width: 40%;">Rating<br />(Outstanding / Good / Satisfactory / Needs Improvement)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1.</td>
                <td>Technical Knowledge &amp; Application</td>
                <td>Good</td>
              </tr>
              <tr>
                <td>2.</td>
                <td>Quality of Work &amp; Task Completion</td>
                <td>Outstanding</td>
              </tr>
              <tr>
                <td>3.</td>
                <td>Initiative &amp; Problem-Solving Ability</td>
                <td>Good</td>
              </tr>
              <tr>
                <td>4.</td>
                <td>Communication &amp; Interpersonal Skills</td>
                <td>Good</td>
              </tr>
              <tr>
                <td>5.</td>
                <td>Punctuality, Discipline &amp; Professional Conduct</td>
                <td>Outstanding</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Supervisor Remarks -->
        <div class="remarks-box">
          <strong>Supervisor's Remarks:</strong>
          The student has shown good understanding of the assigned work, completed tasks sincerely and demonstrated
          a positive attitude towards learning. Keep up the good work.
        </div>
      </div>

      <!-- Bottom Section -->
      <div class="bottom">
        <!-- QR Code -->
        <div class="qr-section">
          ${
            qrDataUri
              ? `<img src="${qrDataUri}" alt="Verification QR" />`
              : ""
          }
          Scan to Verify<br />This Certificate
          <a href="#" class="verify-btn">VERIFY NOW</a>
        </div>

        <!-- Signatures -->
        <div class="signatory-section">
          <div class="signatory">
            ${
              signatureDataUri
                ? `<img class="signature" src="${signatureDataUri}" alt="Mentor signature" />`
                : ""
            }
            <div class="line">Mentor Signature</div>
          </div>

          <div class="signatory">
            ${
              stampDataUri
                ? `<img class="stamp" src="${stampDataUri}" alt="Company stamp" />`
                : ""
            }
            <div style="margin-top: 4px; font-size: 8px; color: #1d4fa3;">Organization Seal</div>
          </div>

          <div class="signatory">
            ${
              signatureDataUri
                ? `<img class="signature" src="${signatureDataUri}" alt="Authorized signature" />`
                : ""
            }
            <strong>${escapeHtml(company?.signatory_name || "Mr. Amarjeet Kumar")}</strong><br />
            ${escapeHtml(company?.signatory_designation || "Founder & CEO")}<br />
            RK NEXORA Private Limited
            <div class="line">Authorized Signatory</div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <div><strong>Date:</strong> ${escapeHtml(formatDate(certificate?.issued_date))}</div>
        <div><strong>Place:</strong> ${escapeHtml(company?.city || "Gaya, Bihar")}</div>
      </div>

      <!-- Recognition -->
      <div class="certificate-recognition">
        <div class="recognition-row">
          <div class="recognition-logo">
            ${
              aicteDataUri
                ? `<img src="${aicteDataUri}" alt="AICTE" />`
                : ""
            }
          </div>
          <div class="recognition-logo">
            ${
              isoDataUri
                ? `<img src="${isoDataUri}" alt="ISO 9001:2015" />`
                : ""
            }
          </div>
          <div class="recognition-logo">
            ${
              msmeDataUri
                ? `<img src="${msmeDataUri}" alt="MSME" />`
                : ""
            }
          </div>
          <div class="recognition-logo">
            ${
              mcaDataUri
                ? `<img src="${mcaDataUri}" alt="Ministry of Corporate Affairs" />`
                : ""
            }
          </div>
        </div>
        <div class="recognition-text">
          AICTE Approved • ISO 9001:2015 Certified • MSME Registered • MCA Incorporated
        </div>
        <div class="certificate-blue-footer"></div>
      </div>
    </div>
  </body>
</html>`;
};