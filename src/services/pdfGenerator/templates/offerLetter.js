import {
  escapeHtml,
  formatDate,
} from "../helpers.js";

import {
  baseStyles,
} from "../baseStyles.js";

export const offerLetterTemplate = ({
  logoDataUri,
  signatureDataUri,
  stampDataUri,

  aicteDataUri,
  isoDataUri,
  msmeDataUri,
  mcaDataUri,

  company,
  student,
  college,
  domain,
  mentor,
  internship,
}) => {
  const portalRegistrationNumber =
    student?.portal_registration_number ||
    student?.internship_registration_number ||
    "-";

  const collegeRegistrationNumber =
    student?.registration_number ||
    student?.college_registration_number ||
    "-";

  const issueYear = new Date(
    internship?.issue_date || Date.now(),
  ).getFullYear();

  const referenceStudentId =
    student?.id ||
    portalRegistrationNumber;

  const letterReference =
    internship?.letter_reference ||
    `RKN/${issueYear}/INT/${String(
      referenceStudentId,
    ).padStart(6, "0")}`;

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
        size: A4;
        margin: 11mm 13mm 9mm;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
      }

      body {
        color: #202634;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 12.3px;
        line-height: 1.4;
      }

      .page {
        min-height: 275mm;
        display: flex;
        flex-direction: column;
      }

      .content {
        flex: 1;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
      }

      .logo {
        width: 205px;
        max-height: 68px;
        object-fit: contain;
        margin-top: 4px;
      }

      .fallback-logo {
        color: #1d4fa3;
        font-size: 26px;
        font-weight: 700;
      }

      .company {
        width: 390px;
        text-align: right;
        font-size: 10px;
        line-height: 1.4;
      }

      .company-name {
        font-size: 12px;
        font-weight: 700;
      }

      h1 {
        margin: 28px 0 22px;
        text-align: center;
        color: #1e293b;
        font-size: 21px;
        letter-spacing: 0.4px;
      }

      .reference-row {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 20px;
      }

      .recipient {
        margin-bottom: 18px;
        line-height: 1.5;
      }

      .recipient strong {
        display: block;
      }

      p {
        margin: 0 0 11px;
        text-align: justify;
      }

      .details-title {
        margin-top: 15px;
        margin-bottom: 9px;
        font-weight: 700;
      }

      .details {
        width: 78%;
        margin-bottom: 14px;
      }

      .details td {
        padding: 3.5px 0;
        vertical-align: top;
      }

      .details td:first-child {
        width: 44%;
        color: #3b4455;
        font-weight: 700;
      }

      .details td:nth-child(2) {
        width: 4%;
      }

      .details td:last-child {
        font-weight: 700;
      }

      .signature-block {
        position: relative;
        width: 330px;
        min-height: 165px;
        margin-top: 20px;
      }

      .signature {
        position: absolute;
        top: 35px;
        left: 8px;
        width: 78px;
        max-height: 55px;
        object-fit: contain;
      }

      .stamp {
        position: absolute;
        top: 0;
        left: 65px;
        width: 108px;
        max-height: 104px;
        object-fit: contain;
      }

      .signatory-text {
        position: absolute;
        top: 105px;
        left: 0;
        line-height: 1.35;
      }

      .document-footer {
        margin-top: 15px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .recognition-footer {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        align-items: center;
        gap: 12px;
        padding: 10px 10px 8px;
        border-top: 1px solid #d6deea;
      }

      .recognition-item {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 58px;
      }

      .recognition-item img {
        max-width: 118px;
        max-height: 54px;
        object-fit: contain;
      }

      .recognition-item:nth-child(3) img,
      .recognition-item:nth-child(4) img {
        max-width: 140px;
      }

      .recognition-caption {
        margin-top: 3px;
        text-align: center;
        color: #172033;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 8.5px;
        font-weight: 700;
      }

      .footer-blue-design {
        position: relative;
        height: 16px;
        margin-top: 6px;
        overflow: hidden;
        background: #079ae8;
      }

      .footer-blue-design::before {
        content: "";
        position: absolute;
        left: 0;
        bottom: 0;
        width: 64%;
        height: 9px;
        background: #155ab4;
      }

      .footer-blue-design::after {
        content: "";
        position: absolute;
        left: 49%;
        bottom: 0;
        width: 18%;
        height: 16px;
        background: #ffffff;
        transform: skewX(-42deg);
      }
    </style>
  </head>

  <body>
    <div class="page">
      <div class="content">
        <div class="header">
          <div>
            ${
              logoDataUri
                ? `<img class="logo" src="${logoDataUri}" alt="RK Nexora" />`
                : `<div class="fallback-logo">RK NEXORA</div>`
            }
          </div>

          <div class="company">
            <div class="company-name">
              ${escapeHtml(company?.name || "RKNEXORA PRIVATE LIMITED")}
            </div>

            <div>
              CIN: ${escapeHtml(company?.cin || "-")}
            </div>

            <div>
              ${escapeHtml(company?.address || "-")}
            </div>

            <div>
              ${escapeHtml(company?.email || "-")}
              |
              ${escapeHtml(company?.phone || "-")}
            </div>

            <div>
              ${escapeHtml(company?.website || "-")}
            </div>
          </div>
        </div>

        <h1>
          INTERNSHIP ACCEPTANCE LETTER
        </h1>

        <div class="reference-row">
          <div>
            <strong>Letter Ref. No.:</strong>
            ${escapeHtml(letterReference)}
          </div>

          <div>
            <strong>Date:</strong>
            ${escapeHtml(formatDate(internship?.issue_date))}
          </div>
        </div>

        <div class="recipient">
          <div>
            <strong>To,</strong>
          </div>

          <strong>
            ${escapeHtml(student?.name || "-")}
          </strong>

          <strong>
            College:
            ${escapeHtml(college?.name || "-")}
          </strong>
        </div>

        <p>
          Dear Candidate,
        </p>

        <p>
          We are pleased to accept your application and offer you an
          internship with
          <strong>${escapeHtml(company?.brand_name || "RK NEXORA")}</strong>,
          an initiative of
          <strong>${escapeHtml(company?.name || "RKNEXORA PRIVATE LIMITED")}</strong>.
          Our organization satisfies the applicable internship guidelines of
          <strong>
            ${escapeHtml(
              college?.university ||
                "the affiliated university",
            )}
          </strong>
          for undergraduate programmes.
        </p>

        <div class="details-title">
          Your internship details are as follows:
        </div>

        <table class="details">
          <tr>
            <td>Name of the Student</td>
            <td>:</td>
            <td>${escapeHtml(student?.name || "-")}</td>
          </tr>

          <tr>
            <td>Internship Portal Registration No.</td>
            <td>:</td>
            <td>${escapeHtml(portalRegistrationNumber)}</td>
          </tr>

          <tr>
            <td>College Registration No.</td>
            <td>:</td>
            <td>${escapeHtml(collegeRegistrationNumber)}</td>
          </tr>

          <tr>
            <td>College / Institution</td>
            <td>:</td>
            <td>${escapeHtml(college?.name || "-")}</td>
          </tr>

          <tr>
            <td>Department & Semester</td>
            <td>:</td>
            <td>
              ${escapeHtml(
                `${student?.programme || "-"} - ${
                  student?.semester || "-"
                }`,
              )}
            </td>
          </tr>

          <tr>
            <td>Internship Domain</td>
            <td>:</td>
            <td>${escapeHtml(domain?.domain_name || "-")}</td>
          </tr>

          <tr>
            <td>Internship Duration</td>
            <td>:</td>
            <td>${escapeHtml(`${durationHours} Hours`)}</td>
          </tr>

          <tr>
            <td>Assigned Mentor</td>
            <td>:</td>
            <td>${escapeHtml(mentor?.name || "-")}</td>
          </tr>
        </table>

        <p>
          During the internship, you are required to complete all assigned
          tasks, assessments and activities under the guidance of your mentor.
        </p>

        <p>
          We appreciate your interest in our organization and look forward
          to your valuable contribution during the internship period.
        </p>

        <div class="signature-block">
          ${
            signatureDataUri
              ? `<img class="signature" src="${signatureDataUri}" alt="Signature" />`
              : ""
          }

          ${
            stampDataUri
              ? `<img class="stamp" src="${stampDataUri}" alt="Company stamp" />`
              : ""
          }

          <div class="signatory-text">
            <strong>
              ${escapeHtml(
                company?.signatory_name ||
                  "Authorized Signatory",
              )}
            </strong>

            <br />

            ${escapeHtml(
              company?.signatory_designation ||
                "Managing Director",
            )}

            <br />

            ${escapeHtml(
              company?.name ||
                "RKNEXORA PRIVATE LIMITED",
            )}
          </div>
        </div>
      </div>

      <div class="document-footer">
        <div class="recognition-footer">
          <div class="recognition-item">
            ${
              aicteDataUri
                ? `<img src="${aicteDataUri}" alt="AICTE" />`
                : ""
            }
          </div>

          <div class="recognition-item">
            ${
              isoDataUri
                ? `<img src="${isoDataUri}" alt="ISO 9001:2015" />`
                : ""
            }
          </div>

          <div class="recognition-item">
            ${
              msmeDataUri
                ? `<img src="${msmeDataUri}" alt="MSME" />`
                : ""
            }
          </div>

          <div class="recognition-item">
            ${
              mcaDataUri
                ? `<img src="${mcaDataUri}" alt="Ministry of Corporate Affairs" />`
                : ""
            }
          </div>
        </div>

        <div class="recognition-caption">
          AICTE Approved • ISO 9001:2015 Certified •
          MSME Registered • MCA Incorporated
        </div>

        <div class="footer-blue-design"></div>
      </div>
    </div>
  </body>
</html>`;
};
