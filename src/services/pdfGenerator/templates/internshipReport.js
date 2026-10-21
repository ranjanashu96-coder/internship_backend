// src/templates/internshipReport.js
import { escapeHtml, formatDate, numberValue } from "../helpers.js";
import { baseStyles } from "../baseStyles.js";
import { domainReportData } from "../../../config/domainReportData.js"; // Step 1 wali file import ki

const paragraph = (value) => `<p>${escapeHtml(value)}</p>`;
const orderedList = (items) => 
  `<ol>${(items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;

const reportPage = (title, body, subtitle = "") => `
  <section class="report-page page-break">
    <h2>${escapeHtml(title)}</h2>
    ${subtitle ? `<h3>${escapeHtml(subtitle)}</h3>` : ""}
    <div class="section-body">${body}</div>
  </section>`;

export const internshipReportTemplate = ({
  logoDataUri,
  collegeLogoDataUri,
  company,
  student,
  college,
  domain,
  internship,
  attendanceSummary = {},
  assessment = {},
  result = {},
  reportContent = {},
}) => {
  
  // Basic Details Fetch
  const portalRegistrationNumber = student.portal_registration_number || student.internship_registration_number || "-";
  const collegeRegistrationNumber = student.registration_number || student.college_registration_number || "-";
  const topic = domain.domain_name || "Internship Domain";
  const durationHours = numberValue(internship.duration_hours || domain.duration_hours, 120);
  const attendancePercentage = numberValue(attendanceSummary.percentage, 100);
  const scorePercentage = numberValue(result.score_percentage || assessment.percentage, 0);

  // Domain Specific Data Fetch
  const specificData = domainReportData[topic] || {};

  // Agar specific data mila hai toh use karo, warna default fallback
  const objectives = reportContent.objectives || specificData.objectives || [`Develop a structured understanding of ${topic}.`];
  const weekActivities = reportContent.week_activities || specificData.weekActivities || [];
  const projectTitle = specificData.projectTitle || "Internship Project";
  const projectScope = specificData.projectScope || "The internship work was organised around a practical project.";
  const projectSteps = specificData.projectSteps || ["Analyzed requirements", "Prepared documentation", "Reviewed with supervisor"];
  
  const coverLogo = collegeLogoDataUri || logoDataUri;

  // 1. COVER PAGE
  const cover = `
    <section class="cover-page">
      <div class="university">${escapeHtml(college.university || "MAGADH UNIVERSITY")}</div>
      <div class="college-name">${escapeHtml(college.name)}</div>
      ${coverLogo ? `<img class="cover-logo" src="${coverLogo}" alt="Logo" />` : ""}
      <h1>INTERNSHIP REPORT</h1>
      <div class="topic">Topic - ${escapeHtml(topic)}</div>

      <table class="cover-details">
        <tr><td>Name of the IPO</td><td>:</td><td>${escapeHtml(company.name)}</td></tr>
        <tr><td>Name of Student</td><td>:</td><td>${escapeHtml(student.name)}</td></tr>
        <tr><td>Programme</td><td>:</td><td>${escapeHtml(student.programme || "-")}</td></tr>
        <tr><td>Internship Portal Reg. No.</td><td>:</td><td>${escapeHtml(portalRegistrationNumber)}</td></tr>
        <tr><td>College Registration No.</td><td>:</td><td>${escapeHtml(collegeRegistrationNumber)}</td></tr>
        <tr><td>Semester</td><td>:</td><td>${escapeHtml(student.semester || "-")}</td></tr>
        <tr><td>Session</td><td>:</td><td>${escapeHtml(student.session || "-")}</td></tr>
      </table>

      <div class="cover-signatures">
        <span>Signature of Student</span>
        <span>Seal & Signature of IPO</span>
      </div>
    </section>`;

  // 2. ACKNOWLEDGMENT
  const acknowledgment = reportPage(
    "ACKNOWLEDGMENT",
    paragraph(
      reportContent.acknowledgment ||
      `I express my sincere gratitude to ${company.brand_name || "Rnexora"}, ${company.name}, ${college.name}, my faculty mentors and the internship supervisor for their guidance and support. The structured activities, learning resources and regular feedback helped me complete this internship in ${topic} successfully.`
    ) +
    `<div class="student-note"><strong>${escapeHtml(student.name)}</strong><br />University Roll No. - ${escapeHtml(student.registration_number || "-")}</div>`
  );

  // 3. PREFACE
  const preface = reportPage(
    "PREFACE",
    paragraph(
      reportContent.preface || specificData.preface ||
      `Internships are an important part of the undergraduate programme, as they allow students to see how classroom learning is applied in real organisations. This report describes the internship undertaken in ${topic} at ${company.name}.`
    )
  );

  // 4. EXECUTIVE SUMMARY
  const abstract = reportPage(
    "EXECUTIVE SUMMARY",
    paragraph(
      reportContent.abstract ||
      `This report documents the ${durationHours}-hour internship programme completed in ${topic}. The programme combined conceptual learning, practical activities, assignments and assessment. Attendance was ${attendancePercentage}% and the final recorded assessment score was ${scorePercentage}%.`
    ) +
    `<p><strong>Keywords:</strong> Internship, ${escapeHtml(topic)}, Practical Learning, Industry Exposure, Employability Skills</p>`
  );

  // 5. TABLE OF CONTENTS
  const contents = reportPage(
    "TABLE OF CONTENTS",
    `<table class="toc">
      <tr><td>1. Introduction</td><td>1</td></tr>
      <tr><td>2. About the Organization</td><td>2</td></tr>
      <tr><td>3. Internship Objectives</td><td>3</td></tr>
      <tr><td>4. Methodology</td><td>4</td></tr>
      <tr><td>5. Plan and Execution</td><td>5</td></tr>
      <tr><td>6. Project Details</td><td>6</td></tr>
      <tr><td>7. Learning Outcomes</td><td>7</td></tr>
      <tr><td>8. Challenges and Solutions</td><td>8</td></tr>
      <tr><td>9. Conclusion</td><td>9</td></tr>
      <tr><td>10. Recommendations</td><td>10</td></tr>
      <tr><td>11. References</td><td>11</td></tr>
      <tr><td>12. Appendices</td><td>12</td></tr>
    </table>`
  );

  // 6. MAIN PAGES
  const pages = [
    // Introduction
    reportPage(
      "1. INTRODUCTION",
      paragraph(
        `This internship report presents the learning journey completed in ${topic}. The programme was designed to supplement academic study with practical exposure, structured activities and professional documentation. The internship duration was ${durationHours} hours.`
      )
    ),

    // About Organization
    reportPage(
      "2. ABOUT THE ORGANIZATION",
      paragraph(
        reportContent.organization ||
        `${company.brand_name || "Rnexora"}, a unit of ${company.name}, provides structured internship and skill-development programmes. The organization focuses on academic-industry alignment, practical exposure, assessment, documentation and employability-oriented learning.`
      ) +
      `<h3>2.1 Vision</h3>` + paragraph("To support students in developing practical, professional and industry-relevant capabilities.") +
      `<h3>2.2 Mission</h3>` + paragraph("To deliver structured learning experiences that connect academic knowledge with workplace expectations.")
    ),

    // Objectives
    reportPage("3. INTERNSHIP OBJECTIVES", orderedList(objectives)),

    // Methodology
    reportPage(
      "4. METHODOLOGY",
      paragraph(
        `The programme followed a blended methodology consisting of learning modules, guided practical activities, assignments, reflective work, attendance tracking and a final assessment.`
      ) +
      `<h3>4.1 Work Schedule</h3>` +
      paragraph(`The internship was conducted from ${formatDate(internship.start_date)} to ${formatDate(internship.end_date)} and was planned to complete ${durationHours} learning hours.`)
    ),

    // Plan and Execution (Table Format)
    reportPage(
      "5. PLAN AND EXECUTION",
      `<table class="week-table" style="width:100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Week</th>
            <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Days</th>
            <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Activities</th>
          </tr>
        </thead>
        <tbody>
          ${weekActivities.map(w => `
            <tr>
              <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold;">${escapeHtml(w.week)}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${escapeHtml(w.days)}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${escapeHtml(w.activities)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    ),

    // Project Details
    reportPage(
      "6. PROJECT: " + projectTitle.toUpperCase(),
      `<h3>6.1 Scope</h3>` + paragraph(projectScope) +
      `<h3>6.2 Steps Followed</h3>` + orderedList(projectSteps)
    ),

    // Learning Outcomes
    reportPage(
      "7. LEARNING OUTCOMES",
      orderedList(reportContent.learning_outcomes || [
        `Improved conceptual understanding of ${topic}.`,
        "Developed practical problem-solving and analytical abilities.",
        "Improved professional communication and documentation skills.",
        "Understood workplace discipline, attendance and time management.",
        "Gained confidence in applying academic knowledge to practical tasks."
      ])
    ),

    // Challenges
    reportPage(
      "8. CHALLENGES AND SOLUTIONS",
      `<h3>Challenges</h3>` +
      orderedList(reportContent.challenges || [
        "Understanding unfamiliar terminology and industry workflows.",
        "Balancing internship tasks with regular academic commitments.",
        "Translating theoretical concepts into practical outcomes.",
        "Maintaining consistent documentation and time management."
      ]) +
      `<h3>Solutions Adopted</h3>` +
      orderedList(reportContent.solutions || [
        "Used structured resources and mentor guidance.",
        "Followed a daily plan supported by attendance and logbook records.",
        "Practised concepts through assignments and activity-based learning.",
        "Reviewed feedback and improved documentation progressively."
      ])
    ),

    // Conclusion
    reportPage(
      "9. CONCLUSION",
      paragraph(
        reportContent.conclusion || specificData.conclusion ||
        `The ${durationHours}-hour internship in ${topic} was a valuable learning experience that integrated academic knowledge with practical activity. The programme achieved its objectives through structured learning, attendance, assignments, assessment and documentation.`
      )
    ),

    // Recommendations
    reportPage(
      "10. RECOMMENDATIONS",
      orderedList(reportContent.recommendations || specificData.recommendations || [
        "Include additional live demonstrations and practical case studies.",
        "Continue regular mentor feedback and progress reviews.",
        "Provide more project-based and collaborative activities.",
        "Encourage students to maintain detailed daily documentation."
      ])
    ),

    // References
    reportPage("11. REFERENCES", orderedList([
      "Kolb, D. A. (1984). Experiential Learning: Experience as the Source of Learning and Development.",
      "University Grants Commission (UGC). Internship guidelines for higher education institutions.",
      "Ministry of Education, Government of India. National Education Policy 2020.",
      `${company.brand_name || "Rnexora"} internship programme handbook.`,
      `Selected learning resources and case studies related to ${topic}.`
    ])),

    // Appendices
    reportPage(
      "12. APPENDICES",
      `<h3>Appendix A: Internship Completion Certificate</h3>` + paragraph("The QR-verified internship completion certificate is generated separately.") +
      `<h3>Appendix B: Attendance Record</h3>` + paragraph("The detailed attendance log is generated separately from recorded attendance entries.") +
      `<h3>Appendix C: Assessment Results</h3>` + paragraph("The assessment marksheet is generated separately from the published result.") +
      `<div class="thank-you">THANK YOU</div>`
    )
  ].join("");

  // 7. FINAL HTML RETURN
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        ${baseStyles}
        @page { size: A4; margin: 16mm 18mm 17mm; }
        body { font-family: Georgia, "Times New Roman", serif; font-size: 12px; line-height: 1.62; color: #111827; }
        
        /* Cover Page Styling */
        .cover-page { height: 245mm; text-align: center; position: relative; padding-top: 5mm; }
        .university { font-size: 20px; font-weight: 700; text-transform: uppercase; }
        .college-name { font-size: 17px; font-weight: 700; margin-top: 4px; }
        .cover-logo { width: 90px; max-height: 90px; object-fit: contain; margin: 22px auto 12px; }
        .cover-page h1 { margin: 20px 0 8px; font-size: 25px; letter-spacing: 1px; }
        .topic { font-size: 17px; font-weight: 700; margin-bottom: 28px; }
        .cover-details { width: 82%; margin: 0 auto; text-align: left; font-size: 13px; }
        .cover-details td { padding: 6px 4px; vertical-align: top; }
        .cover-details td:first-child { width: 38%; font-weight: 700; }
        .cover-details td:nth-child(2) { width: 4%; }
        .cover-signatures { position: absolute; left: 0; right: 0; bottom: 8mm; display: flex; justify-content: space-between; font-weight: 700; }

        /* Report Page Styling */
        .report-page { min-height: 245mm; }
        .report-page h2 { text-align: center; font-size: 20px; margin: 0 0 22px; text-transform: uppercase; }
        .report-page h3 { font-size: 14px; margin: 18px 0 6px; }
        .section-body p { margin: 0 0 12px; text-align: justify; }
        .section-body li { margin-bottom: 8px; text-align: justify; }
        .student-note { margin-top: 25px; text-align: right; }
        
        /* Table of Contents */
        .toc { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .toc td { padding: 8px 4px; border-bottom: 1px dotted #7c8593; }
        .toc td:last-child { width: 55px; text-align: right; }
        
        /* Thank you */
        .thank-you { margin-top: 60px; text-align: center; font-size: 24px; font-weight: 700; }
      </style>
    </head>
    <body>
      ${cover}
      ${acknowledgment}
      ${preface}
      ${abstract}
      ${contents}
      ${pages}
    </body>
  </html>`;
};