import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";


let browserInstance = null;
let browserLaunchPromise = null;


/*
|--------------------------------------------------------------------------
| Chrome Executable Candidates
|--------------------------------------------------------------------------
*/

const chromeCandidates = () => [
  process.env.CHROME_PATH,

  process.env
    .PUPPETEER_EXECUTABLE_PATH,

  // Windows
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

  // Linux
  "/usr/bin/google-chrome",

  "/usr/bin/google-chrome-stable",

  "/usr/bin/chromium",

  "/usr/bin/chromium-browser",
];


/*
|--------------------------------------------------------------------------
| Resolve Chrome Path
|--------------------------------------------------------------------------
*/

export const resolveChromePath =
  () => {
    const result =
      chromeCandidates()
        .filter(Boolean)
        .find(
          (candidate) =>
            fs.existsSync(
              candidate,
            ),
        );

    if (!result) {
      throw new Error(
        "Chrome or Edge executable was not found. Set CHROME_PATH in the backend .env file.",
      );
    }

    return result;
  };


/*
|--------------------------------------------------------------------------
| Check Browser
|--------------------------------------------------------------------------
*/

const isBrowserAlive =
  (browser) => {
    try {
      return Boolean(
        browser &&
          browser.connected,
      );
    } catch {
      return false;
    }
  };


/*
|--------------------------------------------------------------------------
| Launch Browser
|--------------------------------------------------------------------------
*/

const launchPdfBrowser =
  async () => {
    const executablePath =
      resolveChromePath();

    console.log(
      "🚀 Launching PDF browser:",
      executablePath,
    );

    const browser =
      await puppeteer.launch({
        headless: true,

        executablePath,

        args: [
          /*
           * Required on most Linux/VPS
           */
          "--no-sandbox",

          "--disable-setuid-sandbox",

          /*
           * Important for small /dev/shm
           * on production servers.
           */
          "--disable-dev-shm-usage",

          /*
           * Reduce Chromium resource usage
           */
          "--disable-gpu",

          "--disable-extensions",

          "--disable-background-networking",

          "--disable-default-apps",

          "--disable-sync",

          "--metrics-recording-only",

          "--mute-audio",

          "--no-first-run",

          "--no-default-browser-check",
        ],
      });

    /*
    |--------------------------------------------------------------------------
    | Browser Disconnect Handler
    |--------------------------------------------------------------------------
    */

    browser.on(
      "disconnected",
      () => {
        console.error(
          "❌ PDF browser disconnected",
        );

        if (
          browserInstance ===
          browser
        ) {
          browserInstance =
            null;
        }

        /*
         * Very important:
         * dead browser promise must
         * never be reused.
         */
        browserLaunchPromise =
          null;
      },
    );

    console.log(
      "✅ PDF browser launched",
    );

    return browser;
  };


/*
|--------------------------------------------------------------------------
| Get / Reuse Browser
|--------------------------------------------------------------------------
*/

export const getPdfBrowser =
  async () => {
    /*
     * Existing browser alive hai
     * to reuse karo.
     */
    if (
      isBrowserAlive(
        browserInstance,
      )
    ) {
      return browserInstance;
    }

    /*
     * Dead reference remove.
     */
    browserInstance = null;

    /*
     * Agar already launch chal raha
     * hai to same launch await karo.
     */
    if (
      browserLaunchPromise
    ) {
      try {
        const browser =
          await browserLaunchPromise;

        if (
          isBrowserAlive(
            browser,
          )
        ) {
          browserInstance =
            browser;

          return browser;
        }
      } catch (error) {
        console.error(
          "❌ Existing browser launch failed:",
          error?.message ||
            error,
        );
      }

      browserLaunchPromise =
        null;
    }

    /*
     * Fresh Chromium launch
     */
    browserLaunchPromise =
      launchPdfBrowser();

    try {
      const browser =
        await browserLaunchPromise;

      browserInstance =
        browser;

      return browser;
    } catch (error) {
      browserInstance =
        null;

      throw error;
    } finally {
      /*
       * Promise ko permanently
       * cache nahi karna.
       *
       * Actual browserInstance
       * cache hoga.
       */
      browserLaunchPromise =
        null;
    }
  };


/*
|--------------------------------------------------------------------------
| Reset Dead Browser
|--------------------------------------------------------------------------
*/

const resetPdfBrowser =
  async () => {
    const browser =
      browserInstance;

    browserInstance =
      null;

    browserLaunchPromise =
      null;

    if (
      browser &&
      isBrowserAlive(browser)
    ) {
      try {
        await browser.close();
      } catch (error) {
        console.warn(
          "⚠️ Error closing PDF browser:",
          error?.message ||
            error,
        );
      }
    }
  };


/*
|--------------------------------------------------------------------------
| Detect Browser Connection Error
|--------------------------------------------------------------------------
*/

const isBrowserConnectionError =
  (error) => {
    const message =
      String(
        error?.message || "",
      ).toLowerCase();

    const name =
      String(
        error?.name || "",
      ).toLowerCase();

    return (
      message.includes(
        "connection closed",
      ) ||
      message.includes(
        "target closed",
      ) ||
      message.includes(
        "session closed",
      ) ||
      message.includes(
        "browser has disconnected",
      ) ||
      message.includes(
        "protocol error",
      ) ||
      name.includes(
        "connectionclosed",
      ) ||
      name.includes(
        "targetclose",
      )
    );
  };


/*
|--------------------------------------------------------------------------
| Create Page With Retry
|--------------------------------------------------------------------------
*/

const createPdfPage =
  async () => {
    /*
     * Maximum 2 attempts:
     *
     * 1. existing browser
     * 2. fresh browser
     */

    for (
      let attempt = 1;
      attempt <= 2;
      attempt += 1
    ) {
      try {
        const browser =
          await getPdfBrowser();

        if (
          !isBrowserAlive(
            browser,
          )
        ) {
          throw new Error(
            "PDF browser is not connected",
          );
        }

        return await browser
          .newPage();
      } catch (error) {
        console.error(
          `❌ PDF page creation failed (attempt ${attempt}):`,
          error?.message ||
            error,
        );

        /*
         * First attempt fail hone
         * par fresh Chromium launch.
         */
        if (
          attempt === 1 &&
          isBrowserConnectionError(
            error,
          )
        ) {
          console.warn(
            "🔄 Restarting PDF browser...",
          );

          await resetPdfBrowser();

          continue;
        }

        throw error;
      }
    }

    throw new Error(
      "Unable to create PDF page",
    );
  };


/*
|--------------------------------------------------------------------------
| Render HTML → PDF
|--------------------------------------------------------------------------
*/

export const renderHtmlToPdf =
  async ({
    html,
    outputPath,
    landscape = false,
  }) => {
    let page = null;

    try {
      /*
       * IMPORTANT:
       * direct browser.newPage()
       * nahi karenge.
       */
      page =
        await createPdfPage();

      /*
      |--------------------------------------------------------------------------
      | Page Configuration
      |--------------------------------------------------------------------------
      */

      page.setDefaultTimeout(
        60_000,
      );

      page.setDefaultNavigationTimeout(
        60_000,
      );

      /*
      |--------------------------------------------------------------------------
      | HTML
      |--------------------------------------------------------------------------
      */

      await page.setContent(
        html,
        {
          waitUntil: [
            "domcontentloaded",
            "networkidle0",
          ],

          timeout:
            60_000,
        },
      );

      /*
      |--------------------------------------------------------------------------
      | Print Media
      |--------------------------------------------------------------------------
      */

      await page.emulateMediaType(
        "print",
      );

      /*
      |--------------------------------------------------------------------------
      | Ensure Output Directory
      |--------------------------------------------------------------------------
      */

      const outputDirectory =
        path.dirname(
          outputPath,
        );

      await fs.promises.mkdir(
        outputDirectory,
        {
          recursive: true,
        },
      );

      /*
      |--------------------------------------------------------------------------
      | Generate PDF
      |--------------------------------------------------------------------------
      */

      await page.pdf({
        path:
          outputPath,

        format:
          "A4",

        landscape,

        printBackground:
          true,

        preferCSSPageSize:
          true,

        margin: {
          top:
            "0mm",

          right:
            "0mm",

          bottom:
            "0mm",

          left:
            "0mm",
        },
      });

      /*
      |--------------------------------------------------------------------------
      | Validate Generated File
      |--------------------------------------------------------------------------
      */

      const stats =
        await fs.promises.stat(
          outputPath,
        );

      if (
        !stats ||
        stats.size <= 0
      ) {
        throw new Error(
          "Generated PDF file is empty",
        );
      }

      return outputPath;
    } catch (error) {
      console.error(
        "❌ PDF generation failed:",
        error,
      );

      /*
       * Agar rendering ke beech
       * browser disconnect hua hai,
       * next student ko dead browser
       * nahi milega.
       */
      if (
        isBrowserConnectionError(
          error,
        )
      ) {
        await resetPdfBrowser();
      }

      throw error;
    } finally {
      /*
      |--------------------------------------------------------------------------
      | Always Close Page
      |--------------------------------------------------------------------------
      */

      if (page) {
        try {
          if (
            !page.isClosed()
          ) {
            await page.close();
          }
        } catch (error) {
          console.warn(
            "⚠️ PDF page close failed:",
            error?.message ||
              error,
          );
        }
      }
    }
  };


/*
|--------------------------------------------------------------------------
| Gracefully Close Browser
|--------------------------------------------------------------------------
*/

export const closePdfBrowser =
  async () => {
    const browser =
      browserInstance;

    browserInstance =
      null;

    browserLaunchPromise =
      null;

    if (!browser) {
      return;
    }

    try {
      if (
        isBrowserAlive(
          browser,
        )
      ) {
        await browser.close();
      }
    } catch (error) {
      console.warn(
        "⚠️ PDF browser close failed:",
        error?.message ||
          error,
      );
    }
  };