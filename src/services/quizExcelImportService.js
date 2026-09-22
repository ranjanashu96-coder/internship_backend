import XLSX from "xlsx";

/**
 * Excel file se questions parse karo
 *
 * Expected columns:
 * - question
 * - option1, option2, option3, option4 (minimum 2 options)
 * - correct_answer (jaise "Option 1", "Option 2", ...)
 * - marks (optional, default 1)
 * - explanation (optional)
 */
export const parseQuizExcel = (filePath) => {
  // Excel file read karo
  const workbook = XLSX.readFile(filePath);

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Excel file me koi sheet nahi hai");
  }

  const sheet = workbook.Sheets[sheetName];

  // JSON me convert karo
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Excel file me koi data nahi hai");
  }

  const questions = [];
  const errors = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // Excel me header row 1 hota hai

    try {
      const questionText = String(row.question || "").trim();

      if (!questionText) {
        errors.push({
          row: rowNumber,
          message: "Question text missing",
        });
        return;
      }

      // Options nikaalo — option1 se option10 tak support karo
      const options = [];

      for (let i = 1; i <= 10; i++) {
        const optionText = String(
          row[`option${i}`] || "",
        ).trim();

        if (optionText) {
          options.push({
            id: `question-${questions.length + 1}-option-${i}`,
            text: optionText,
          });
        }
      }

      if (options.length < 2) {
        errors.push({
          row: rowNumber,
          message: "At least 2 options required",
        });
        return;
      }

      // Correct answer nikaalo
      const correctAnswerRaw = String(
        row.correct_answer || "",
      ).trim();

      if (!correctAnswerRaw) {
        errors.push({
          row: rowNumber,
          message: "Correct answer missing",
        });
        return;
      }

      // "Option 1" se number nikaalo
      const match = correctAnswerRaw.match(
        /(?:option)?\s*(\d+)/i,
      );

      if (!match) {
        errors.push({
          row: rowNumber,
          message: `Invalid correct_answer format: "${correctAnswerRaw}" (use "Option 1", "Option 2" etc.)`,
        });
        return;
      }

      const correctOptionNumber = Number(match[1]);

      if (
        !Number.isInteger(correctOptionNumber) ||
        correctOptionNumber < 1 ||
        correctOptionNumber > options.length
      ) {
        errors.push({
          row: rowNumber,
          message: `Correct option ${correctOptionNumber} does not exist (only ${options.length} options found)`,
        });
        return;
      }

      const correctOption = options[correctOptionNumber - 1];

      // Marks
      const marks = Number(row.marks);

      const questionMarks =
        Number.isFinite(marks) && marks > 0 ? marks : 1;

      // Explanation
      const explanation = String(
        row.explanation || "",
      ).trim();

      questions.push({
        id: `question-${questions.length + 1}`,
        question: questionText,
        options,
        correct_option_id: correctOption.id,
        marks: questionMarks,
        explanation: explanation || null,
      });
    } catch (error) {
      errors.push({
        row: rowNumber,
        message: error.message,
      });
    }
  });

  return {
    questions,
    errors,
    totalRows: rows.length,
    validCount: questions.length,
    errorCount: errors.length,
  };
};