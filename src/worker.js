import "dotenv/config";

import sequelize from "./config/database.js";
import "./models/index.js";

import { bulkJobRunner } from "./jobs/bulkJobRunner.js";
import {
  startEmailQueueWorker,
  stopEmailQueueWorker,
} from "./services/emailQueueWorker.js";
import { verifyEmailConnection } from "./services/emailService.js";

let shuttingDown = false;

async function start() {
  try {
    await sequelize.authenticate();
    console.log("✅ [WORKER] MySQL connected");

    // Bulk jobs resume (background mein)
    setImmediate(async () => {
      try {
        const resumed = await bulkJobRunner.resumePendingJobs();
        console.log(`🔄 [WORKER] Bulk jobs resumed: ${resumed}`);
      } catch (error) {
        console.error("❌ [WORKER] Bulk job resume failed:", error);
      }
    });

    // Email worker start
    const emailConfigured = Boolean(
      process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS
    );

    if (emailConfigured) {
      try {
        await verifyEmailConnection();
        console.log("✅ [WORKER] SMTP connected");
        await startEmailQueueWorker();
        console.log("📧 [WORKER] Email queue worker started");
      } catch (error) {
        console.error(
          "❌ [WORKER] SMTP connection failed:",
          error?.message || error
        );
      }
    } else {
      console.warn("⚠️ [WORKER] SMTP not configured");
    }

    console.log("🛠️ [WORKER] All workers are running");

    // Pool monitoring
    setInterval(() => {
      if (shuttingDown) return;
      const pool = sequelize.connectionManager.pool;
      console.log(
        `[WORKER POOL] size=${pool.size} available=${pool.available} using=${pool.using} waiting=${pool.waiting}`
      );
    }, 30000);
  } catch (error) {
    console.error("❌ [WORKER] Startup failed:", error);
    process.exit(1);
  }
}

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[WORKER] ${signal} received. Shutting down...`);

  try {
    await bulkJobRunner.stop();
    await stopEmailQueueWorker();
    await sequelize.close();
    console.log("[WORKER] ✅ All workers stopped");
  } catch (e) {
    console.error("[WORKER] Shutdown error:", e);
  }

  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error("[WORKER] Unhandled Rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[WORKER] Uncaught Exception:", error);
  shutdown("uncaughtException");
});

start();