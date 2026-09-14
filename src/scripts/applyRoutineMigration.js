import "dotenv/config";
import sequelize from "../config/database.js";

const sql = `
CREATE TABLE IF NOT EXISTS routines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  file_path VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NULL,
  mime_type VARCHAR(100) NULL,
  file_size BIGINT UNSIGNED NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  published_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_routines_status (status),
  KEY idx_routines_published_at (published_at),
  KEY idx_routines_created_by (created_by)
);
`;

try {
  await sequelize.authenticate();
  await sequelize.query(sql);
  console.log("✅ routines table is ready");
} catch (error) {
  console.error("❌ routine migration failed:", error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
