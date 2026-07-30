import { escapeHtml, formatDate } from "../helpers.js";
import { baseStyles } from "../baseStyles.js";

export const certificateTemplate = ({
  logoDataUri,
  signatureDataUri,
  stampDataUri,
  qrDataUri,
  company,
  student,
  college,
  domain,
  internship,
  certificate,
}) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${baseStyles}
      @page { size: A4 landscape; margin: 8mm; }
      body { background: #f8fbff; color: #152238; }
      .certificate {
        height: 190mm;
        border: 10px double #1d4fa3;
        padding: 10mm 16mm 8mm;
        background:
          radial-gradient(circle at 10% 10%, rgba(46,112,216,.08), transparent 28%),
          radial-gradient(circle at 90% 90%, rgba(11,174,97,.08), transparent 28%),
          #fff;
        display: flex;
        flex-direction: column;
      }
      .top { display: flex; align-items: flex-start; justify-content: space-between; }
      .logo { width: 180px; }
      .company { text-align: right; font-size: 9px; line-height: 1.4; }
      h1 { margin: 7px 0 2px; text-align: center; color: #1d4fa3; font-family: Georgia, "Times New Roman", serif; font-size: 31px; letter-spacing: 1px; }
      .subtitle { text-align: center; font-size: 13px; letter-spacing: 2px; color: #516073; }
      .body { text-align: center; margin-top: 10px; flex: 1; }
      .intro { font-size: 13px; }
      .student-name { margin: 7px 0; font-family: Georgia, "Times New Roman", serif; font-size: 29px; font-weight: 700; color: #173e85; border-bottom: 1px solid #7a8ca8; display: inline-block; min-width: 410px; padding-bottom: 3px; }
      .detail { max-width: 760px; margin: 0 auto; font-size: 13px; line-height: 1.55; }
      .bottom { display: grid; grid-template-columns: 1fr 135px 1fr; align-items: end; gap: 26px; margin-top: 8px; }
      .certificate-meta { font-size: 9px; line-height: 1.6; align-self: end; }
      .qr { text-align: center; font-size: 8px; }
      .qr img { width: 78px; height: 78px; }
      .signatory { position: relative; min-height: 105px; text-align: center; padding-top: 72px; }
      .signatory .signature { position: absolute; top: 30px; left: calc(50% - 75px); width: 70px; }
      .signatory .stamp { position: absolute; top: 0; left: calc(50% - 12px); width: 92px; }
      .signatory .line { border-top: 1px solid #172033; margin-top: 4px; padding-top: 3px; }
    </style>
  </head>
  <body>
    <div class="certificate">
      <div class="top">
        ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="Rnexora" />` : `<div class="blue text-bold" style="font-size:25px">Rnexora</div>`}
        <div class="company"><strong>${escapeHtml(company.name)}</strong><br />CIN: ${escapeHtml(company.cin || "-")}<br />${escapeHtml(company.website || "-")}</div>
      </div>
      <h1>Certificate of Completion</h1>
      <div class="subtitle">INTERNSHIP PROGRAMME</div>
      <div class="body">
        <div class="intro">This certificate is proudly presented to</div>
        <div class="student-name">${escapeHtml(student.name)}</div>
        <div class="detail">
          for successfully completing the <strong>${escapeHtml(domain.domain_name)}</strong> internship programme of
          <strong>${escapeHtml(`${internship.duration_hours || domain.duration_hours || 120} hours`)}</strong>
          conducted from <strong>${escapeHtml(formatDate(internship.start_date))}</strong> to
          <strong>${escapeHtml(formatDate(internship.end_date))}</strong>. The student represented
          <strong>${escapeHtml(college.name)}</strong> and fulfilled the prescribed attendance, learning,
          assessment and reporting requirements.
        </div>
      </div>
      <div class="bottom">
        <div class="certificate-meta">
          <strong>Certificate No.:</strong> ${escapeHtml(certificate.certificate_number)}<br />
          <strong>Issued Date:</strong> ${escapeHtml(formatDate(certificate.issued_date))}<br />
          <strong>University Roll No.:</strong> ${escapeHtml(student.student_id || student.registration_number || "-")}
        </div>
        <div class="qr">${qrDataUri ? `<img src="${qrDataUri}" alt="Verification QR" /><br />` : ""}Scan to verify</div>
        <div class="signatory">
          ${signatureDataUri ? `<img class="signature" src="${signatureDataUri}" alt="Signature" />` : ""}
          ${stampDataUri ? `<img class="stamp" src="${stampDataUri}" alt="Stamp" />` : ""}
          <strong>${escapeHtml(company.signatory_name)}</strong><br />
          ${escapeHtml(company.signatory_designation)}
          <div class="line">Authorized Signatory</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
