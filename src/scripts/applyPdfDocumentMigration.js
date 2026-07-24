import {
  DataTypes,
} from "sequelize";

import sequelize from "../config/database.js";

const queryInterface =
  sequelize.getQueryInterface();

const run = async () => {
  await sequelize.authenticate();

  const tables =
    await queryInterface.showAllTables();

  const tableNames = tables.map(
    (table) =>
      typeof table === "string"
        ? table
        : table.tableName ||
          table.name,
  );

  if (
    !tableNames.includes(
      "generated_documents",
    )
  ) {
    throw new Error(
      "generated_documents table was not found. Run the bulk automation migration first.",
    );
  }

  await queryInterface.changeColumn(
    "generated_documents",
    "type",
    {
      type: DataTypes.ENUM(
        "acceptance_letter",
        "attendance_sheet",
        "assessment_marksheet",
        "logbook",
        "internship_report",
        "certificate",
      ),
      allowNull: false,
    },
  );

  console.log(
    "PDF document migration completed",
  );
};

run()
  .catch((error) => {
    console.error(
      "PDF document migration failed:",
      error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
