import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";

let browserPromise = null;

const chromeCandidates = () => [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  process.env.LOCALAPPDATA
    ? path.join(
        process.env.LOCALAPPDATA,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      )
    : null,
  process.env.LOCALAPPDATA
    ? path.join(
        process.env.LOCALAPPDATA,
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe",
      )
    : null,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

export const resolveChromePath = () => {
  const result = chromeCandidates()
    .filter(Boolean)
    .find((candidate) => fs.existsSync(candidate));

  if (!result) {
    throw new Error(
      "Chrome or Edge executable was not found. Set CHROME_PATH in the backend .env file.",
    );
  }

  return result;
};

export const getPdfBrowser = async () => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath: resolveChromePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }

  return browserPromise;
};

export const renderHtmlToPdf = async ({
  html,
  outputPath,
  landscape = false,
}) => {
  const browser = await getPdfBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 60_000,
    });
    await page.emulateMediaType("print");
    await page.pdf({
      path: outputPath,
      format: "A4",
      landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
    });
    return outputPath;
  } finally {
    await page.close();
  }
};

export const closePdfBrowser = async () => {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
};
