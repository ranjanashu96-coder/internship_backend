import path from "path";
import QRCode from "qrcode";
import archiver from "archiver";
import fs from "fs";

import { renderHtmlToPdf } from "./browser.js";
import {
  ensureDirectory,
  fileToDataUri,
  safeName,
  toPublicUrl,
} from "./helpers.js";

import { offerLetterTemplate } from "./templates/offerLetter.js";
import { attendanceLogTemplate } from "./templates/attendanceLog.js";
import { assessmentMarksheetTemplate } from "./templates/assessmentMarksheet.js";
import { logbookTemplate } from "./templates/logbook.js";
import { certificateTemplate } from "./templates/certificate.js";
import { internshipReportTemplate } from "./templates/internshipReport.js";

const defaultCompany = {
  brand_name: "Eduintern Internship Program",
  name: "OPTIMARK VENTURES PRIVATE LIMITED",
  cin: "U62020BR2023PTC064893",
  address: "East Lohanipur Khadpar, Kadamkuan, Patna - 800003",
  email: "support@eduintern.in",
  phone: "7544090878",
  website: "www.eduintern.in",
  signatory_name: "Rahul Kumar",
  signatory_designation: "Managing Director",
};

const resolveAssets = (assets = {}) => {
  const assetRoot = path.resolve("src", "assets", "pdf");

  return {
    logoDataUri: fileToDataUri(
      assets.logo || path.join(assetRoot, "rknexora-logo.png"),
    ),
    signatureDataUri: fileToDataUri(
      assets.signature || path.join(assetRoot, "director-signature.png"),
    ),
    stampDataUri: fileToDataUri(
      assets.stamp || path.join(assetRoot, "company-stamp.png"),
    ),
    collegeLogoDataUri: fileToDataUri(assets.collegeLogo),
  };
};

const studentDirectory = (student, outputRoot) =>
  ensureDirectory(
    path.join(
      outputRoot,
      safeName(
        student.registration_number ||
          student.student_id ||
          `student-${student.id}`,
      ),
    ),
  );

const renderDocument = async ({
  html,
  outputPath,
  landscape = false,
}) => {
  ensureDirectory(path.dirname(outputPath));
  await renderHtmlToPdf({ html, outputPath, landscape });
  return {
    absolutePath: outputPath,
    publicUrl: toPublicUrl(outputPath),
  };
};

export const createPdfGenerator = ({
  outputRoot = path.resolve("uploads", "generated"),
  company = {},
  assets = {},
} = {}) => {
  const organization = {
    ...defaultCompany,
    ...company,
  };

  const assetData = resolveAssets(assets);

  const generateOfferLetter = async (data) => {
    const directory = studentDirectory(data.student, outputRoot);
    const outputPath = path.join(directory, "internship-offer-letter.pdf");
    const html = offerLetterTemplate({
      ...data,
      ...assetData,
      company: {
        ...organization,
        ...(data.company || {}),
      },
    });

    return renderDocument({ html, outputPath });
  };

  const generateAttendanceLog = async (data) => {
    const directory = studentDirectory(data.student, outputRoot);
    const outputPath = path.join(directory, "internship-attendance-log.pdf");
    const html = attendanceLogTemplate({
      ...data,
      ...assetData,
      company: {
        ...organization,
        ...(data.company || {}),
      },
    });

    return renderDocument({ html, outputPath });
  };

  const generateAssessmentMarksheet = async (data) => {
    const directory = studentDirectory(data.student, outputRoot);
    const outputPath = path.join(directory, "assessment-marksheet.pdf");
    const html = assessmentMarksheetTemplate({
      ...data,
      company: {
        ...organization,
        ...(data.company || {}),
      },
    });

    return renderDocument({ html, outputPath });
  };

  const generateLogbook = async (data) => {
    const directory = studentDirectory(data.student, outputRoot);
    const outputPath = path.join(directory, "internship-logbook.pdf");
    const html = logbookTemplate({
      ...data,
      ...assetData,
      company: {
        ...organization,
        ...(data.company || {}),
      },
    });

    return renderDocument({ html, outputPath });
  };

  const generateInternshipReport = async (data) => {
    const directory = studentDirectory(data.student, outputRoot);
    const outputPath = path.join(directory, "internship-report.pdf");
    const html = internshipReportTemplate({
      ...data,
      ...assetData,
      company: {
        ...organization,
        ...(data.company || {}),
      },
    });

    return renderDocument({ html, outputPath });
  };

  const generateCertificate = async (data) => {
    const directory = studentDirectory(data.student, outputRoot);
    const outputPath = path.join(directory, "internship-certificate.pdf");
    const qrPath = path.join(directory, "certificate-verification-qr.png");

    await QRCode.toFile(
      qrPath,
      data.certificate.verification_url,
      {
        width: 500,
        margin: 2,
        errorCorrectionLevel: "H",
      },
    );

    const qrDataUri = fileToDataUri(qrPath);

    const html = certificateTemplate({
      ...data,
      ...assetData,
      qrDataUri,
      company: {
        ...organization,
        ...(data.company || {}),
      },
    });

    const generated = await renderDocument({
      html,
      outputPath,
      landscape: true,
    });

    return {
      ...generated,
      qrAbsolutePath: qrPath,
      qrPublicUrl: toPublicUrl(qrPath),
    };
  };

  const generateAll = async (data) => {
    const result = {};

    result.offerLetter = await generateOfferLetter(data);
    result.attendanceLog = await generateAttendanceLog(data);
    result.assessmentMarksheet = await generateAssessmentMarksheet(data);
    result.logbook = await generateLogbook(data);
    result.internshipReport = await generateInternshipReport(data);
    result.certificate = await generateCertificate(data);

    return result;
  };

  const createStudentZip = async ({ student, zipPath }) => {
    const directory = studentDirectory(student, outputRoot);
    ensureDirectory(path.dirname(zipPath));

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", {
        zlib: {
          level: 9,
        },
      });

      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
      archive.pipe(output);
      archive.directory(directory, safeName(student.registration_number));
      archive.finalize();
    });

    return {
      absolutePath: zipPath,
      publicUrl: toPublicUrl(zipPath),
    };
  };

  return {
    generateOfferLetter,
    generateAttendanceLog,
    generateAssessmentMarksheet,
    generateLogbook,
    generateInternshipReport,
    generateCertificate,
    generateAll,
    createStudentZip,
  };
};

export const pdfGenerator = createPdfGenerator();
