import fs from "fs";
import path from "path";

export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
};

export const formatDateNumeric = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}/${date.getFullYear()}`;
};

export const formatTime = (value) => {
  if (!value) return "-";
  const [hourText, minuteText = "0"] = String(value).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return String(value);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${String(hour % 12 || 12).padStart(2, "0")}:${String(
    minute,
  ).padStart(2, "0")} ${suffix}`;
};

export const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const safeName = (value) =>
  String(value || "student")
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const ensureDirectory = (directory) => {
  fs.mkdirSync(directory, { recursive: true });
  return directory;
};

export const fileToDataUri = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const mimeMap = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  const mimeType = mimeMap[extension] || "application/octet-stream";
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString("base64")}`;
};

export const calculateTotalHours = (records = []) =>
  Number(
    records
      .reduce(
        (sum, record) => sum + numberValue(record.learning_hours),
        0,
      )
      .toFixed(2),
  );

export const gradeFromPercentage = (percentage) => {
  const score = numberValue(percentage);
  if (score >= 90) return { code: "O", label: "Outstanding" };
  if (score >= 80) return { code: "A+", label: "Excellent" };
  if (score >= 70) return { code: "A", label: "Very Good" };
  if (score >= 60) return { code: "B+", label: "Good" };
  if (score >= 50) return { code: "B", label: "Satisfactory" };
  if (score >= 40) return { code: "C", label: "Pass" };
  return { code: "F", label: "Needs Improvement" };
};

export const toPublicUrl = (absolutePath, projectRoot = process.cwd()) => {
  const relative = path
    .relative(projectRoot, absolutePath)
    .replaceAll("\\", "/");
  return `/${relative}`;
};
