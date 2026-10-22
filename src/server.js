import "dotenv/config";

import app from "./app.js";
import sequelize from "./config/database.js";
import "./models/index.js";

const port = Number(process.env.PORT || 5000);

try {
  await sequelize.authenticate();
  console.log("✅ MySQL connected");

  const server = app.listen(port, () => {
    console.log(`🚀 RKNexora API running on port ${port}`);
  });

  setInterval(() => {
    const pool = sequelize.connectionManager.pool;
    console.log(
      `[POOL] size=${pool.size} available=${pool.available} using=${pool.using} waiting=${pool.waiting}`
    );
  }, 30000);

  const shutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down...`);
    server.close(async () => {
      try {
        await sequelize.close();
        console.log("✅ DB pool closed");
      } catch (e) {
        console.error("DB close error:", e);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
} catch (error) {
  console.error("❌ Startup failed:", error);
  process.exit(1);
}