import "dotenv/config";

import app from "./app.js";
import sequelize from "./config/database.js";

import "./models/index.js";

import {
  bulkJobRunner,
} from "./jobs/bulkJobRunner.js";

import {
  startEmailQueueWorker,
} from "./services/emailQueueWorker.js";

import {
  verifyEmailConnection,
} from "./services/emailService.js";


const port =
  Number(
    process.env.PORT ||
      5000,
  );


try {
  /*
  |--------------------------------------------------------------------------
  | Database Connection
  |--------------------------------------------------------------------------
  */

  await sequelize.authenticate();

  console.log(
    "✅ MySQL connected",
  );


  /*
  |--------------------------------------------------------------------------
  | Resume Pending Bulk Jobs
  |--------------------------------------------------------------------------
  */

  try {
    const resumedJobs =
      await bulkJobRunner
        .resumePendingJobs();

    console.log(
      `🔄 Bulk jobs resumed: ${resumedJobs}`,
    );
  } catch (error) {
    console.error(
      "❌ Bulk job resume failed:",
      error,
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Email / SMTP
  |--------------------------------------------------------------------------
  */

  const emailConfigured =
    Boolean(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS,
    );

  if (emailConfigured) {
    try {
      await verifyEmailConnection();

      console.log(
        "✅ SMTP connected",
      );

      startEmailQueueWorker();
    } catch (error) {
      /*
       * Email fail hone se
       * poora backend band nahi hoga.
       */
      console.error(
        "❌ SMTP connection failed:",
        error?.message ||
          error,
      );
    }
  } else {
    console.warn(
      "⚠️ SMTP not configured. Email worker not started.",
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Start Server
  |--------------------------------------------------------------------------
  */

  app.listen(
    port,
    () => {
      console.log(
        `🚀 RKNexora API running on port ${port}`,
      );
    },
  );
} catch (error) {
  console.error(
    "❌ Startup failed:",
    error,
  );

  process.exit(1);
}