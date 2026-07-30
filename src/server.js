import dotenv from "dotenv";

dotenv.config();

import app from "./app.js";
import sequelize from "./config/database.js";

import "./models/index.js";

import {
  bulkJobRunner,
} from "./jobs/bulkJobRunner.js";

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
  |
  | Agar server / PM2 restart ho gaya ho:
  |
  | queued  -> dobara queue me jayega
  | running -> queued karke dobara resume hoga
  |
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
    /*
     * Bulk resume fail hone par
     * poora API server band nahi hoga.
     */
    console.error(
      "❌ Bulk job resume failed:",
      error,
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