import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const queryInterface = sequelize.getQueryInterface();

const tableExists = async (tableName) => {
  const tables = await queryInterface.showAllTables();

  return tables
    .map((table) =>
      typeof table === "string"
        ? table
        : table.tableName || table.name,
    )
    .includes(tableName);
};

const describe = async (tableName) => {
  if (!(await tableExists(tableName))) {
    return null;
  }

  return queryInterface.describeTable(tableName);
};

const addColumnIfMissing = async (
  tableName,
  columnName,
  definition,
) => {
  const columns = await describe(tableName);

  if (!columns) {
    throw new Error(`Table ${tableName} does not exist`);
  }

  if (!columns[columnName]) {
    await queryInterface.addColumn(
      tableName,
      columnName,
      definition,
    );

    console.log(`Added ${tableName}.${columnName}`);
  }
};

const addIndexIfMissing = async (
  tableName,
  fields,
  options = {},
) => {
  const indexes = await queryInterface.showIndex(tableName);

  const exists = indexes.some((index) => {
    if (options.name && index.name === options.name) {
      return true;
    }

    const currentFields = index.fields
      .map((field) => field.attribute || field.name)
      .join(",");

    return currentFields === fields.join(",");
  });

  if (!exists) {
    await queryInterface.addIndex(
      tableName,
      fields,
      options,
    );

    console.log(
      `Added index ${options.name || fields.join("_")} on ${tableName}`,
    );
  }
};

const timestampColumns = {
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
};

const run = async () => {
  await sequelize.authenticate();
  console.log("Database connected");

  await addColumnIfMissing(
    "students",
    "batch_id",
    {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
  );

  await addColumnIfMissing(
    "students",
    "mentor_id",
    {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
  );

  await addColumnIfMissing(
    "students",
    "internship_start_date",
    {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  );

  await addColumnIfMissing(
    "students",
    "internship_end_date",
    {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  );

  await addColumnIfMissing(
    "students",
    "total_progress",
    {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
  );

  await addColumnIfMissing(
    "students",
    "certificate_generated",
    {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  );

  await addColumnIfMissing(
    "students",
    "certificate_url",
    {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  );

  await addColumnIfMissing(
    "mentors",
    "domain_id",
    {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
  );

  await addColumnIfMissing(
    "mentors",
    "college_id",
    {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
  );

  await addColumnIfMissing(
    "assessments",
    "assessment_type",
    {
      type: DataTypes.ENUM(
        "midterm",
        "final",
      ),
      allowNull: false,
      defaultValue: "final",
    },
  );

  await addColumnIfMissing(
    "assessments",
    "assessed_at",
    {
      type: DataTypes.DATE,
      allowNull: true,
    },
  );

  await addColumnIfMissing(
    "assessments",
    "approved_at",
    {
      type: DataTypes.DATE,
      allowNull: true,
    },
  );

  await addColumnIfMissing(
    "assessments",
    "approved_by",
    {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
  );

  await addColumnIfMissing(
    "certificates",
    "certificate_url",
    {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  );

  await addColumnIfMissing(
    "certificates",
    "verification_url",
    {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  );

  if (!(await tableExists("batches"))) {
    await queryInterface.createTable(
      "batches",
      {
        id: {
          type: DataTypes.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
        },
        college_id: {
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: false,
        },
        domain_id: {
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: false,
        },
        mentor_id: {
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: true,
        },
        batch_name: {
          type: DataTypes.STRING(150),
          allowNull: false,
        },
        session: {
          type: DataTypes.STRING(20),
          allowNull: false,
        },
        semester: {
          type: DataTypes.STRING(20),
          allowNull: false,
        },
        start_date: {
          type: DataTypes.DATEONLY,
          allowNull: true,
        },
        end_date: {
          type: DataTypes.DATEONLY,
          allowNull: true,
        },
        status: {
          type: DataTypes.ENUM(
            "active",
            "inactive",
            "completed",
          ),
          allowNull: false,
          defaultValue: "active",
        },
        ...timestampColumns,
      },
    );

    console.log("Created batches table");
  }

  if (!(await tableExists("results"))) {
    await queryInterface.createTable(
      "results",
      {
        id: {
          type: DataTypes.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
        },
        student_id: {
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: false,
          unique: true,
        },
        assessment_id: {
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: true,
        },
        score_percentage: {
          type: DataTypes.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 0,
        },
        grade: {
          type: DataTypes.STRING(10),
          allowNull: false,
        },
        result_status: {
          type: DataTypes.ENUM(
            "passed",
            "failed",
          ),
          allowNull: false,
        },
        status: {
          type: DataTypes.ENUM(
            "draft",
            "published",
          ),
          allowNull: false,
          defaultValue: "draft",
        },
        published_at: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        published_by: {
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: true,
        },
        remarks: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        ...timestampColumns,
      },
    );

    console.log("Created results table");
  }

  if (!(await tableExists("generated_documents"))) {
    await queryInterface.createTable(
      "generated_documents",
      {
        id: {
          type: DataTypes.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
        },
        student_id: {
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: false,
        },
        type: {
          type: DataTypes.ENUM(
            "acceptance_letter",
            "internship_report",
            "attendance_sheet",
            "logbook",
            "certificate",
          ),
          allowNull: false,
        },
        file_url: {
          type: DataTypes.STRING(500),
          allowNull: false,
        },
        generated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        generated_by: {
          type: DataTypes.BIGINT.UNSIGNED,
          allowNull: true,
        },
        metadata_json: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        ...timestampColumns,
      },
    );

    console.log("Created generated_documents table");
  }

  await queryInterface.changeColumn(
    "bulk_jobs",
    "type",
    {
      type: DataTypes.ENUM(
        "attendance",
        "complete_learning",
        "complete_internship",
        "assessment",
        "publish_results",
        "acceptance_letters",
        "internship_reports",
        "attendance_sheets",
        "log_books",
        "certificates",
        "zip_documents",
        "full_internship_process",
      ),
      allowNull: false,
    },
  );

  await addIndexIfMissing(
    "students",
    ["batch_id"],
    {
      name: "idx_students_batch_id",
    },
  );

  await addIndexIfMissing(
    "students",
    ["mentor_id"],
    {
      name: "idx_students_mentor_id",
    },
  );

  await addIndexIfMissing(
    "chapter_completions",
    [
      "student_id",
      "chapter_id",
    ],
    {
      name: "uq_chapter_completion",
      unique: true,
    },
  );

  await addIndexIfMissing(
    "logbook",
    [
      "student_id",
      "date",
    ],
    {
      name: "uq_logbook_student_date",
      unique: true,
    },
  );

  await addIndexIfMissing(
    "assessments",
    [
      "student_id",
      "assessment_type",
    ],
    {
      name: "uq_student_assessment_type",
      unique: true,
    },
  );

  await addIndexIfMissing(
    "generated_documents",
    [
      "student_id",
      "type",
    ],
    {
      name: "uq_generated_document",
      unique: true,
    },
  );

  console.log("Bulk automation migration completed");
};

run()
  .catch((error) => {
    console.error(
      "Bulk automation migration failed:",
      error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
