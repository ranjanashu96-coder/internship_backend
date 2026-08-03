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
        size: A4 landscape;
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
        height: 190mm;
        overflow: hidden;

        border: 10px double #1d4fa3;
        padding: 7mm 12mm 4mm;

        background:
          radial-gradient(
            circle at 10% 10%,
            rgba(46, 112, 216, 0.08),
            transparent 28%
          ),
          radial-gradient(
            circle at 90% 90%,
            rgba(11, 174, 97, 0.08),
            transparent 28%
          ),
          #ffffff;

        display: flex;
        flex-direction: column;
      }

      .top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
      }

      .logo {
        width: 175px;
        max-height: 58px;
        object-fit: contain;
      }

      .fallback-logo {
        color: #1d4fa3;
        font-size: 25px;
        font-weight: 700;
      }

      .company {
        max-width: 290px;
        text-align: right;
        font-size: 9px;
        line-height: 1.45;
      }

      .company strong {
        font-size: 10px;
      }

      h1 {
        margin: 5px 0 2px;
        text-align: center;
        color: #1d4fa3;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 30px;
        letter-spacing: 1px;
      }

      .subtitle {
        text-align: center;
        color: #516073;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 2px;
      }

      .body {
        flex: 1;
        margin-top: 8px;
        text-align: center;
      }

      .intro {
        font-size: 13px;
      }

      .student-name {
        display: inline-block;
        min-width: 410px;
        margin: 6px 0;
        padding: 0 18px 3px;
        border-bottom: 1px solid #7a8ca8;
        color: #173e85;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 28px;
        font-weight: 700;
      }

      .detail {
        max-width: 760px;
        margin: 0 auto;
        font-size: 12.5px;
        line-height: 1.5;
      }

      .bottom {
        display: grid;
        grid-template-columns:
          minmax(0, 1fr)
          120px
          minmax(0, 1fr);
        align-items: end;
        gap: 24px;
        margin-top: 5px;
      }

      .certificate-meta {
        align-self: end;
        font-size: 8.5px;
        line-height: 1.65;
      }

      .certificate-meta strong {
        color: #172033;
      }

      .qr {
        text-align: center;
        color: #475569;
        font-size: 8px;
        font-weight: 700;
      }

      .qr img {
        display: block;
        width: 72px;
        height: 72px;
        margin: 0 auto 2px;
        object-fit: contain;
      }

      .signatory {
        position: relative;
        min-height: 100px;
        padding-top: 68px;
        text-align: center;
        font-size: 9px;
        line-height: 1.4;
      }

      .signatory .signature {
        position: absolute;
        top: 27px;
        left: calc(50% - 73px);
        width: 70px;
        max-height: 44px;
        object-fit: contain;
      }

      .signatory .stamp {
        position: absolute;
        top: 0;
        left: calc(50% - 10px);
        width: 88px;
        max-height: 92px;
        object-fit: contain;
      }

      .signatory .line {
        margin-top: 4px;
        padding-top: 3px;
        border-top: 1px solid #172033;
      }

      .certificate-recognition {
        margin-top: 6px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .recognition-row {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        align-items: center;
        gap: 10px;
        padding: 6px 10px 4px;
        border-top: 1px solid #d3dce9;
      }

      .recognition-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
      }

      .recognition-logo img {
        display: block;
        max-width: 108px;
        max-height: 44px;
        object-fit: contain;
      }

      .recognition-logo:nth-child(3) img,
      .recognition-logo:nth-child(4) img {
        max-width: 125px;
      }

      .recognition-text {
        text-align: center;
        color: #172033;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 8px;
        font-weight: 700;
      }

      .certificate-blue-footer {
        position: relative;
        height: 13px;
        margin-top: 4px;
        overflow: hidden;
        background: #079ae8;
      }

      .certificate-blue-footer::before {
        content: "";
        position: absolute;
        left: 0;
        bottom: 0;
        width: 64%;
        height: 7px;
        background: #155ab4;
      }

      .certificate-blue-footer::after {
        content: "";
        position: absolute;
        left: 50%;
        bottom: 0;
        width: 18%;
        height: 13px;
        background: #ffffff;
        transform: skewX(-42deg);
      }
    </style>
  </head>

  <body>
    <div class="certificate">
      <div class="top">
        ${
          logoDataUri
            ? `<img class="logo" src="${logoDataUri}" alt="RK Nexora" />`
            : `<div class="fallback-logo">RK NEXORA</div>`
        }

        <div class="company">
          <strong>${escapeHtml(company?.name || "RKNEXORA PRIVATE LIMITED")}</strong><br />
          CIN: ${escapeHtml(company?.cin || "-")}<br />
          ${escapeHtml(company?.website || "-")}
        </div>
      </div>

      <h1>Certificate of Completion</h1>

      <div class="subtitle">
        INTERNSHIP PROGRAMME
      </div>

      <div class="body">
        <div class="intro">
          This certificate is proudly presented to
        </div>

        <div class="student-name">
          ${escapeHtml(student?.name || "-")}
        </div>

        <div class="detail">
          for successfully completing the
          <strong>${escapeHtml(domain?.domain_name || "-")}</strong>
          internship programme of
          <strong>${escapeHtml(`${durationHours} hours`)}</strong>
          conducted from
          <strong>${escapeHtml(formatDate(internship?.start_date))}</strong>
          to
          <strong>${escapeHtml(formatDate(internship?.end_date))}</strong>.

          The student represented
          <strong>${escapeHtml(college?.name || "-")}</strong>
          and fulfilled the prescribed attendance,
          learning, assessment and reporting requirements.
        </div>
      </div>

      <div class="bottom">
        <div class="certificate-meta">
          <strong>Certificate No.:</strong>
          ${escapeHtml(certificate?.certificate_number || "-")}
          <br />

          <strong>Issued Date:</strong>
          ${escapeHtml(formatDate(certificate?.issued_date))}
          <br />

          <strong>Internship Portal Registration No.:</strong>
          ${escapeHtml(portalRegistrationNumber)}
          <br />

          <strong>College Registration No.:</strong>
          ${escapeHtml(collegeRegistrationNumber)}
        </div>

        <div class="qr">
          ${
            qrDataUri
              ? `<img src="${qrDataUri}" alt="Verification QR" />`
              : ""
          }
          Scan to verify
        </div>

        <div class="signatory">
          ${
            signatureDataUri
              ? `<img class="signature" src="${signatureDataUri}" alt="Authorized signature" />`
              : ""
          }

          ${
            stampDataUri
              ? `<img class="stamp" src="${stampDataUri}" alt="Company stamp" />`
              : ""
          }

          <strong>${escapeHtml(company?.signatory_name || "Authorized Signatory")}</strong><br />
          ${escapeHtml(company?.signatory_designation || "Managing Director")}

          <div class="line">
            Authorized Signatory
          </div>
        </div>
      </div>

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
          AICTE Approved • ISO 9001:2015 Certified •
          MSME Registered • MCA Incorporated
        </div>

        <div class="certificate-blue-footer"></div>
      </div>
    </div>
  </body>
</html>`;
};
