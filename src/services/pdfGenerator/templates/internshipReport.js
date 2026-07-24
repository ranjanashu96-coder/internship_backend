import { escapeHtml, formatDate, numberValue } from "../helpers.js";
import { baseStyles } from "../baseStyles.js";

const paragraph = (value) => `<p>${escapeHtml(value)}</p>`;
const orderedList = (items) =>
  `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;

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
  const topic = domain.domain_name || "Internship Domain";
  const durationHours = numberValue(
    internship.duration_hours || domain.duration_hours,
    120,
  );
  const attendancePercentage = numberValue(
    attendanceSummary.percentage,
    100,
  );
  const scorePercentage = numberValue(
    result.score_percentage || assessment.percentage,
    0,
  );

  const objectives = reportContent.objectives || [
    `Develop a structured understanding of ${topic}.`,
    "Apply theoretical knowledge through guided practical activities.",
    "Improve problem-solving, documentation and analytical skills.",
    "Develop communication, teamwork and professional discipline.",
  ];

  const activities = reportContent.week_activities || [
    `Week 1: Orientation and foundations of ${topic}.`,
    "Week 2: Core modules, guided exercises and assignments.",
    "Week 3: Practical application, case analysis and documentation.",
    "Week 4: Project activity, assessment and report preparation.",
  ];

  const challenges = reportContent.challenges || [
    "Understanding unfamiliar terminology and industry workflows.",
    "Balancing internship tasks with regular academic commitments.",
    "Translating theoretical concepts into practical outcomes.",
    "Maintaining consistent documentation and time management.",
  ];

  const learningOutcomes = reportContent.learning_outcomes || [
    `Improved conceptual understanding of ${topic}.`,
    "Developed practical problem-solving and analytical abilities.",
    "Improved professional communication and documentation skills.",
    "Understood workplace discipline, attendance and time management.",
    "Gained confidence in applying academic knowledge to practical tasks.",
  ];

  const references = reportContent.references || [
    "University Grants Commission internship guidelines.",
    "National Education Policy implementation resources.",
    `${company.brand_name || "Eduintern"} internship programme handbook.`,
    `Selected learning resources and case studies related to ${topic}.`,
  ];

  const coverLogo = collegeLogoDataUri || logoDataUri;

  const cover = `
    <section class="cover-page">
      <div class="university">${escapeHtml(
        college.university || "AFFILIATED UNIVERSITY",
      )}</div>
      <div class="college-name">${escapeHtml(college.name)}</div>
      ${coverLogo ? `<img class="cover-logo" src="${coverLogo}" alt="Logo" />` : ""}
      <h1>INTERNSHIP REPORT</h1>
      <div class="topic">Topic - ${escapeHtml(topic)}</div>

      <table class="cover-details">
        <tr><td>Name of the IPO</td><td>:</td><td>${escapeHtml(company.name)}</td></tr>
        <tr><td>Name of Student</td><td>:</td><td>${escapeHtml(student.name)}</td></tr>
        <tr><td>Programme</td><td>:</td><td>${escapeHtml(student.programme || "-")}</td></tr>
        <tr><td>University Roll Number</td><td>:</td><td>${escapeHtml(student.student_id || student.registration_number || "-")}</td></tr>
        <tr><td>Semester</td><td>:</td><td>${escapeHtml(student.semester || "-")}</td></tr>
        <tr><td>Session</td><td>:</td><td>${escapeHtml(student.session || "-")}</td></tr>
      </table>

      <div class="cover-signatures">
        <span>Signature of Student</span>
        <span>Seal & Signature of IPO</span>
      </div>
    </section>`;

  const acknowledgment = reportPage(
    "ACKNOWLEDGMENT",
    paragraph(
      reportContent.acknowledgment ||
        `I express my sincere gratitude to ${company.brand_name || "Eduintern"}, ${company.name}, ${college.name}, my faculty mentors and the internship supervisor for their guidance and support. The structured activities, learning resources and regular feedback helped me complete this internship in ${topic} successfully. I also thank my family and peers for their encouragement throughout the programme.`,
    ) +
      `<div class="student-note"><strong>${escapeHtml(student.name)}</strong><br />University Roll No. - ${escapeHtml(student.student_id || student.registration_number || "-")}</div>`,
  );

  const abstract = reportPage(
    "ABSTRACT",
    paragraph(
      reportContent.abstract ||
        `This report documents the ${durationHours}-hour internship programme completed in ${topic}. The programme combined conceptual learning, practical activities, assignments, case-based exercises and assessment. It describes the methodology, activities, learning outcomes, challenges and professional development achieved during the internship. Attendance was ${attendancePercentage}% and the final recorded assessment score was ${scorePercentage}%.`,
    ) +
      `<p><strong>Keywords:</strong> Internship, ${escapeHtml(topic)}, Practical Learning, Industry Exposure, Employability Skills</p>`,
  );

  const contents = reportPage(
    "TABLE OF CONTENTS",
    `<table class="toc">
      <tr><td>1. Introduction</td><td>1</td></tr>
      <tr><td>2. Literature Review</td><td>2</td></tr>
      <tr><td>3. About the Organization</td><td>3</td></tr>
      <tr><td>4. Internship Objectives</td><td>4</td></tr>
      <tr><td>5. Methodology</td><td>5</td></tr>
      <tr><td>6. Implementation and Week-wise Activities</td><td>6</td></tr>
      <tr><td>7. Data Analysis and Findings</td><td>7</td></tr>
      <tr><td>8. Challenges and Solutions</td><td>8</td></tr>
      <tr><td>9. Learning Outcomes</td><td>9</td></tr>
      <tr><td>10. Impact and Contribution</td><td>10</td></tr>
      <tr><td>11. Conclusion</td><td>11</td></tr>
      <tr><td>12. Recommendations</td><td>12</td></tr>
      <tr><td>13. References</td><td>13</td></tr>
      <tr><td>14. Appendices</td><td>14</td></tr>
    </table>`,
  );

  const pages = [
    reportPage(
      "1. INTRODUCTION",
      paragraph(
        reportContent.introduction ||
          `This internship report presents the learning journey completed in ${topic}. The programme was designed to supplement academic study with practical exposure, structured activities and professional documentation. The internship duration was ${durationHours} hours and included learning modules, assignments, attendance, logbook entries and assessment.`,
      ) +
        `<h3>1.1 Background and Context</h3>` +
        paragraph(
          `Internships bridge the gap between classroom concepts and workplace application. The ${topic} programme helped the student understand industry expectations and apply academic knowledge in a guided environment.`,
        ) +
        `<h3>1.2 Scope and Limitations</h3>` +
        paragraph(
          `The scope included foundational concepts, practical activities, assignments, documentation and assessment. The main limitation was the fixed programme duration and the availability of resources within the scheduled period.`,
        ),
    ),
    reportPage(
      "2. LITERATURE REVIEW",
      paragraph(
        `The internship approach was based on experiential learning, where knowledge is strengthened through activity, reflection and practical application. Existing educational studies consistently indicate that structured internships improve professional awareness, employability and confidence.`,
      ) +
        paragraph(
          `For ${topic}, practice-based learning is particularly valuable because it helps students connect concepts with realistic tasks, tools and decision-making situations.`,
        ),
    ),
    reportPage(
      "3. ABOUT THE ORGANIZATION",
      paragraph(
        reportContent.organization ||
          `${company.brand_name || "Eduintern"}, a unit of ${company.name}, provides structured internship and skill-development programmes. The organization focuses on academic-industry alignment, practical exposure, assessment, documentation and employability-oriented learning.`,
      ) +
        `<h3>3.1 Vision</h3>` +
        paragraph(
          "To support students in developing practical, professional and industry-relevant capabilities.",
        ) +
        `<h3>3.2 Mission</h3>` +
        paragraph(
          "To deliver structured learning experiences that connect academic knowledge with workplace expectations.",
        ),
    ),
    reportPage("4. INTERNSHIP OBJECTIVES", orderedList(objectives)),
    reportPage(
      "5. METHODOLOGY",
      paragraph(
        reportContent.methodology ||
          "The programme followed a blended methodology consisting of learning modules, guided practical activities, assignments, reflective work, attendance tracking and a final assessment. Progress was documented through attendance records, logbook entries and this report.",
      ) +
        `<h3>5.1 Work Schedule</h3>` +
        paragraph(
          `The internship was conducted from ${formatDate(internship.start_date)} to ${formatDate(internship.end_date)} and was planned to complete ${durationHours} learning hours.`,
        ),
    ),
    reportPage(
      "6. IMPLEMENTATION",
      `<h3>6.1 Week-wise Activities</h3>${orderedList(activities)}<h3>6.2 Tools and Resources</h3>${paragraph(
        `Learning materials, digital resources, assignments, documentation tools and mentor feedback were used during the ${topic} internship.`,
      )}`,
    ),
    reportPage(
      "7. DATA ANALYSIS AND FINDINGS",
      paragraph(
        `The attendance analysis recorded ${attendancePercentage}% participation. The final assessment score was ${scorePercentage}%. The results indicate consistent engagement with the learning activities and satisfactory completion of the prescribed requirements.`,
      ) +
        orderedList([
          "Structured modules improved understanding of complex concepts.",
          "Assignments supported practical application of theory.",
          "Regular documentation improved reflection and communication.",
          "Assessment feedback helped identify strengths and improvement areas.",
        ]),
    ),
    reportPage(
      "8. CHALLENGES AND SOLUTIONS",
      `<h3>Challenges</h3>${orderedList(challenges)}<h3>Solutions Adopted</h3>${orderedList(
        reportContent.solutions || [
          "Used structured resources and mentor guidance.",
          "Followed a daily plan supported by attendance and logbook records.",
          "Practised concepts through assignments and activity-based learning.",
          "Reviewed feedback and improved documentation progressively.",
        ],
      )}`,
    ),
    reportPage("9. LEARNING OUTCOMES", orderedList(learningOutcomes)),
    reportPage(
      "10. IMPACT AND CONTRIBUTION",
      paragraph(
        `The internship improved academic understanding, professional confidence and awareness of workplace practices. It strengthened the student's ability to communicate, document work, manage time and approach practical tasks systematically.`,
      ) +
        `<h3>10.1 Academic Impact</h3>${paragraph(
          `The programme complemented coursework by adding practical exposure in ${topic}.`,
        )}<h3>10.2 Professional Impact</h3>${paragraph(
          "The student developed discipline, communication, teamwork and task-management skills.",
        )}`,
    ),
    reportPage(
      "11. CONCLUSION",
      paragraph(
        reportContent.conclusion ||
          `The ${durationHours}-hour internship in ${topic} was a valuable learning experience that integrated academic knowledge with practical activity. The programme achieved its objectives through structured learning, attendance, assignments, assessment and documentation.`,
      ),
    ),
    reportPage(
      "12. RECOMMENDATIONS",
      orderedList(
        reportContent.recommendations || [
          "Include additional live demonstrations and practical case studies.",
          "Continue regular mentor feedback and progress reviews.",
          "Provide more project-based and collaborative activities.",
          "Encourage students to maintain detailed daily documentation.",
        ],
      ),
    ),
    reportPage("13. REFERENCES", orderedList(references)),
    reportPage(
      "14. APPENDICES",
      `<h3>Appendix A: Internship Completion Certificate</h3>${paragraph(
        "The QR-verified internship completion certificate is generated separately.",
      )}<h3>Appendix B: Attendance Record</h3>${paragraph(
        "The detailed attendance log is generated separately from recorded attendance entries.",
      )}<h3>Appendix C: Assessment Results</h3>${paragraph(
        "The assessment marksheet is generated separately from the published result.",
      )}<div class="thank-you">THANK YOU</div>`,
    ),
  ].join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        ${baseStyles}
        @page { size: A4; margin: 16mm 18mm 17mm; }
        body { font-family: Georgia, "Times New Roman", serif; font-size: 12px; line-height: 1.62; color: #111827; }
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
        .report-page { min-height: 245mm; }
        .report-page h2 { text-align: center; font-size: 20px; margin: 0 0 22px; }
        .report-page h3 { font-size: 14px; margin: 18px 0 6px; }
        .section-body p { margin: 0 0 12px; text-align: justify; }
        .section-body li { margin-bottom: 8px; text-align: justify; }
        .student-note { margin-top: 25px; text-align: right; }
        .toc td { padding: 5px 4px; border-bottom: 1px dotted #7c8593; }
        .toc td:last-child { width: 55px; text-align: right; }
        .thank-you { margin-top: 60px; text-align: center; font-size: 24px; font-weight: 700; }
      </style>
    </head>
    <body>
      ${cover}
      ${acknowledgment}
      ${abstract}
      ${contents}
      ${pages}
    </body>
  </html>`;
};
