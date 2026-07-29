import { DataTypes } from "sequelize";
import Quiz from "./Quiz.js";
import QuizAttempt from "./QuizAttempt.js";
import QuizAnswer from "./QuizAnswer.js";
import sequelize from "../config/database.js";
const common = { created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW } };
const define=(name, attrs, opts={})=>sequelize.define(name, attrs,{ tableName: opts.tableName||name.toLowerCase(), timestamps:false, indexes:opts.indexes||[] });

export const User = define(
  "User",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    username: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING(191),
      unique: true,
      allowNull: false,
    },

    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    role: {
      type: DataTypes.ENUM(
        "super_admin",
        "admin",
        "college_admin",
        "mentor",
        "student",
      ),
      allowNull: false,
    },

    college_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        "active",
        "inactive",
        "blocked",
        "pending",
      ),
      defaultValue: "active",
    },

    ...common,
  },
  {
    tableName: "users",
  },
);
export const College = define(
  "College",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    code: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false,
    },

    university: DataTypes.STRING(255),

    principal_name: DataTypes.STRING(150),

    coordinator_name: DataTypes.STRING(150),

    email: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },

    mobile: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    address: DataTypes.TEXT,
    state: DataTypes.STRING(100),
    district: DataTypes.STRING(100),
    pincode: DataTypes.STRING(10),
    logo: DataTypes.STRING(500),

    college_share: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },

    rknexora_share: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },

    status: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "active",
    },

    ...common,
  },
  {
    tableName: "colleges",
  },
);
export const Student = define(
  "Student",
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
    registration_number: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false,
    },
    student_id: {
      type: DataTypes.STRING(50),
      unique: true,
    },
    name: DataTypes.STRING(150),
    father_name: DataTypes.STRING(150),
    gender: DataTypes.ENUM("male", "female", "other"),
    dob: DataTypes.DATEONLY,
    programme: DataTypes.STRING(150),
    major_subject: DataTypes.STRING(150),
    session: DataTypes.STRING(20),
    semester: DataTypes.STRING(20),
    mobile: DataTypes.STRING(20),
    email: {
      type: DataTypes.STRING(191),
      unique: true,
    },
    photo: DataTypes.STRING(500),
    registration_date: DataTypes.DATEONLY,
    registration_locked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    internship_status: {
      type: DataTypes.ENUM(
        "preloaded",
        "registered",
        "active",
        "completed",
        "blocked",
      ),
      defaultValue: "preloaded",
    },
    payment_status: {
      type: DataTypes.ENUM(
        "pending",
        "paid",
        "failed",
        "refunded",
      ),
      defaultValue: "pending",
    },
    username: {
      type: DataTypes.STRING(100),
      unique: true,
    },
    password_hash: DataTypes.STRING(255),
    academics_json: DataTypes.JSON,
    domain_id: DataTypes.BIGINT.UNSIGNED,

    batch_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    mentor_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    internship_start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    internship_end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    total_progress: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
    certificate_generated: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    certificate_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    ...common,
  },
  {
    tableName: "students",
    indexes: [
      {
        fields: [
          "college_id",
          "session",
          "semester",
        ],
      },
      {
        fields: ["registration_number"],
      },
      {
        fields: ["student_id"],
      },
      {
        fields: ["domain_id"],
      },
      {
        fields: ["batch_id"],
      },
      {
        fields: ["mentor_id"],
      },
    ],
  },
);
export const Mentor = define(
  "Mentor",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    employee_id: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false,
    },
    designation: DataTypes.STRING(100),
    department: DataTypes.STRING(100),
    specialization: DataTypes.STRING(255),
    domain_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    college_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    mobile: DataTypes.STRING(20),
    email: {
      type: DataTypes.STRING(191),
      unique: true,
      allowNull: false,
    },
    qualification: DataTypes.STRING(255),
    profile_photo: DataTypes.STRING(500),
    password_hash: DataTypes.STRING(255),
    status: {
      type: DataTypes.ENUM(
        "active",
        "inactive",
      ),
      defaultValue: "active",
    },
    ...common,
  },
  {
    tableName: "mentors",
    indexes: [
      {
        fields: ["domain_id"],
      },
      {
        fields: ["college_id"],
      },
    ],
  },
);
export const Sector=define("Sector",{id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},sector_name:{type:DataTypes.STRING(150),unique:true,allowNull:false},status:{type:DataTypes.ENUM("active","inactive"),defaultValue:"active"},...common},{tableName:"sectors"});
export const Domain=define("Domain",{id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},sector_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},domain_name:{type:DataTypes.STRING(150),allowNull:false},fee:{type:DataTypes.DECIMAL(10,2),defaultValue:0},duration_hours:{type:DataTypes.INTEGER.UNSIGNED,defaultValue:0},...common},{tableName:"domains"});
export const MentorAssignment=define("MentorAssignment",{id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},mentor_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},domain_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},college_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},session:{type:DataTypes.STRING(20),allowNull:false},semester:{type:DataTypes.STRING(20),allowNull:false},...common},{tableName:"mentor_assignments"});

export const Batch = define(
  "Batch",
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
    start_date: DataTypes.DATEONLY,
    end_date: DataTypes.DATEONLY,
    status: {
      type: DataTypes.ENUM(
        "active",
        "inactive",
        "completed",
      ),
      defaultValue: "active",
    },
    ...common,
  },
  {
    tableName: "batches",
    indexes: [
      {
        fields: [
          "college_id",
          "domain_id",
          "session",
          "semester",
        ],
      },
      {
        fields: ["mentor_id"],
      },
    ],
  },
);

export const Result = define(
  "Result",
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
      defaultValue: "draft",
    },
    published_at: DataTypes.DATE,
    published_by: DataTypes.BIGINT.UNSIGNED,
    remarks: DataTypes.TEXT,
    ...common,
  },
  {
    tableName: "results",
    indexes: [
      {
        unique: true,
        fields: ["student_id"],
      },
    ],
  },
);

export const GeneratedDocument = define(
  "GeneratedDocument",
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
        "assessment_marksheet",
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
    generated_by: DataTypes.BIGINT.UNSIGNED,
    metadata_json: DataTypes.JSON,
    ...common,
  },
  {
    tableName: "generated_documents",
    indexes: [
      {
        unique: true,
        name: "uq_generated_document",
        fields: [
          "student_id",
          "type",
        ],
      },
    ],
  },
);

export const Module=define("Module",{id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},domain_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},module_number:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false},module_name:{type:DataTypes.STRING(255),allowNull:false},...common},{tableName:"modules"});
export const Chapter = define(
  "Chapter",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    module_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    chapter_number: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },

    chapter_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    description: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },

    duration_minutes: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },

    is_preview: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    status: {
      type: DataTypes.ENUM(
        "draft",
        "published",
      ),
      allowNull: false,
      defaultValue: "published",
    },

    /*
     * Purane records ke liye temporary compatibility.
     * Naye resources chapter_resources me save honge.
     */
    content_type: {
      type: DataTypes.ENUM(
        "video",
        "pdf",
        "text",
        "link",
      ),
      allowNull: true,
    },

    content_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    ...common,
  },
  {
    tableName: "chapters",

    indexes: [
      {
        unique: true,
        fields: [
          "module_id",
          "chapter_number",
        ],
      },
    ],
  },
);

export const ChapterResource = define(
  "ChapterResource",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    chapter_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    resource_type: {
      type: DataTypes.ENUM(
        "video",
        "pdf",
        "ppt",
        "document",
        "image",
        "audio",
        "text",
        "link",
        "zip",
        "source_code",
        "other",
      ),
      allowNull: false,
    },

    file_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    external_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    text_content: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },

    file_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    mime_type: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },

    file_size: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    duration_seconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },

    sort_order: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
    },

    is_downloadable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    is_primary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    status: {
      type: DataTypes.ENUM(
        "active",
        "inactive",
      ),
      allowNull: false,
      defaultValue: "active",
    },

    ...common,
  },
  {
    tableName:
      "chapter_resources",

    indexes: [
      {
        fields: [
          "chapter_id",
        ],
      },
      {
        fields: [
          "resource_type",
        ],
      },
    ],
  },
);

export const Assignment=define("Assignment",{id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},chapter_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},question_text:{type:DataTypes.TEXT,allowNull:false},...common},{tableName:"assignments"});
export const Submission=define("Submission",{id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},student_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},assignment_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},file_url:{type:DataTypes.STRING(500),allowNull:false},marks:DataTypes.DECIMAL(5,2),status:{type:DataTypes.ENUM("submitted","approved","resubmit"),defaultValue:"submitted"},mentor_comments:DataTypes.TEXT,...common},{tableName:"submissions"});
export const Attendance = define(
  "Attendance",
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

    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    login_time: {
      type: DataTypes.TIME,
      allowNull: true,
    },

    logout_time: {
      type: DataTypes.TIME,
      allowNull: true,
    },

    learning_hours: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },

    status: {
      type: DataTypes.ENUM(
        "present",
        "absent",
        "leave",
        "half_day",
      ),
      allowNull: false,
      defaultValue: "absent",
    },

    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    ...common,
  },
  {
    tableName: "attendance",

    indexes: [
      {
        unique: true,
        name: "uq_attendance",
        fields: [
          "student_id",
          "date",
        ],
      },

      {
        name: "idx_attendance_date",
        fields: [
          "date",
          "status",
        ],
      },
    ],
  },
);export const Logbook = define(
  "Logbook",
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
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    activity: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    skills: DataTypes.TEXT,
    hours_worked: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    ...common,
  },
  {
    tableName: "logbook",
    indexes: [
      {
        unique: true,
        name: "uq_logbook_student_date",
        fields: [
          "student_id",
          "date",
        ],
      },
    ],
  },
);
export const LiveProject=define("LiveProject",{id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},student_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},domain_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},title:{type:DataTypes.STRING(255),allowNull:false},report_url:DataTypes.STRING(500),status:{type:DataTypes.ENUM("submitted","approved","resubmit"),defaultValue:"submitted"},mentor_feedback:DataTypes.TEXT,...common},{tableName:"live_projects"});
export const InternshipReport=define("InternshipReport",{id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},student_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},report_url:{type:DataTypes.STRING(500),allowNull:false},status:{type:DataTypes.ENUM("submitted","approved","resubmit"),defaultValue:"submitted"},mentor_remarks:DataTypes.TEXT,...common},{tableName:"internship_reports"});
export const Assessment = define(
  "Assessment",
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
    mentor_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    assessment_type: {
      type: DataTypes.ENUM(
        "midterm",
        "final",
      ),
      allowNull: false,
      defaultValue: "final",
    },
    criteria_ratings_json: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    overall_performance: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    supervisor_remarks: DataTypes.TEXT,
    status: {
      type: DataTypes.ENUM(
        "draft",
        "submitted",
        "approved",
      ),
      defaultValue: "submitted",
    },
    assessed_at: DataTypes.DATE,
    approved_at: DataTypes.DATE,
    approved_by: DataTypes.BIGINT.UNSIGNED,
    ...common,
  },
  {
    tableName: "assessments",
    indexes: [
      {
        unique: true,
        name: "uq_student_assessment_type",
        fields: [
          "student_id",
          "assessment_type",
        ],
      },
    ],
  },
);
export const Certificate = define(
  "Certificate",
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
    certificate_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    certificate_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    qr_code_url: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    verification_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    issued_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    ...common,
  },

  
  {
    tableName: "certificates",
  },
);
export const Payment = define(
  "Payment",
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

    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "INR",
    },

    transaction_id: {
      type: DataTypes.STRING(150),
      unique: true,
      allowNull: true,
    },

    gateway: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "cashfree",
    },

    cashfree_order_id: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: true,
    },

    cf_order_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    cf_payment_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        "created",
        "pending",
        "processing",
        "success",
        "failed",
        "refunded",
      ),
      defaultValue: "created",
    },

    failure_reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    gateway_payload: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    receipt_path: {
  type: DataTypes.STRING(500),
  allowNull: true,
},

receipt_generated_at: {
  type: DataTypes.DATE,
  allowNull: true,
},

receipt_number: {
  type: DataTypes.STRING(100),
  allowNull: true,
  unique: true,
},

    ...common,
  },
  {
    tableName: "payments",
  },
);export const AuditLog=define("AuditLog",{id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},user_id:DataTypes.BIGINT.UNSIGNED,action:{type:DataTypes.STRING(100),allowNull:false},entity_type:{type:DataTypes.STRING(100),allowNull:false},entity_id:DataTypes.BIGINT.UNSIGNED,details:DataTypes.JSON,timestamp:{type:DataTypes.DATE,defaultValue:DataTypes.NOW}},{tableName:"audit_logs"});
export const ChapterCompletion = define(
  "ChapterCompletion",
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
    chapter_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(
        "unlocked",
        "completed",
      ),
      defaultValue: "unlocked",
    },
    completed_at: DataTypes.DATE,
    ...common,
  },
  {
    tableName: "chapter_completions",
    indexes: [
      {
        unique: true,
        name: "uq_chapter_completion",
        fields: [
          "student_id",
          "chapter_id",
        ],
      },
    ],
  },
);
export const BulkJob = define(
  "BulkJob",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    job_uuid: {
      type: DataTypes.STRING(36),
      unique: true,
      allowNull: false,
    },

    type: {
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

    status: {
      type: DataTypes.ENUM(
        "queued",
        "running",
        "completed",
        "failed",
        "cancelled",
      ),
      allowNull: false,
      defaultValue: "queued",
    },

    current_step: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },

    progress: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },

    processed: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },

    total: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },

    success_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },

    failed_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },

    cancel_requested: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    finished_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    payload: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    result: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    created_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    ...common,
  },
  {
    tableName: "bulk_jobs",

    indexes: [
      {
        fields: [
          "status",
          "created_at",
        ],
      },

      {
        fields: [
          "created_by",
          "created_at",
        ],
      },
    ],
  },
);
export const PasswordReset=define("PasswordReset",{id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},email:{type:DataTypes.STRING(191),allowNull:false},token_hash:{type:DataTypes.STRING(255),allowNull:false},expires_at:{type:DataTypes.DATE,allowNull:false},used_at:DataTypes.DATE,...common},{tableName:"password_resets"});

export const RefreshToken = define(
  "RefreshToken",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    account_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    account_type: {
      type: DataTypes.ENUM(
        "user",
        "mentor",
        "student",
      ),
      allowNull: false,
    },

    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },

    token_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },

    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "refresh_tokens",
  },
);

College.hasMany(Student, {
  foreignKey: "college_id",
   as: "students",
});

Student.belongsTo(College, {
  foreignKey: "college_id",
   as: "college",
});

College.hasMany(User, {
  foreignKey: "college_id",
  as: "users",
});

User.belongsTo(College, {
  foreignKey: "college_id",
  as: "college",
});

Student.belongsTo(Domain, {
  foreignKey: "domain_id",
  as: "domain",
});

Domain.hasMany(Student, {
  foreignKey: "domain_id",
  as: "students",
});

Domain.hasMany(Module, {
  foreignKey: "domain_id",
});

Module.belongsTo(Domain, {
  foreignKey: "domain_id",
});

Module.hasMany(Chapter, {
  foreignKey: "module_id",
});

Chapter.belongsTo(Module, {
  foreignKey: "module_id",
});

Chapter.hasMany(Assignment, {
  foreignKey: "chapter_id",
});

Assignment.belongsTo(Chapter, {
  foreignKey: "chapter_id",
});

Student.hasMany(Submission, {
  foreignKey: "student_id",
});
Student.hasMany(Attendance, {
  foreignKey: "student_id",
  as: "attendance_records",
});

Attendance.belongsTo(Student, {
  foreignKey: "student_id",
  as: "student",
});

Sector.hasMany(Domain, {
  foreignKey: "sector_id",
});

Domain.belongsTo(Sector, {
  foreignKey: "sector_id",
});

Mentor.belongsTo(Domain, {
  foreignKey: "domain_id",
  as: "domain",
});

Domain.hasMany(Mentor, {
  foreignKey: "domain_id",
  as: "mentors",
});

Mentor.belongsTo(College, {
  foreignKey: "college_id",
  as: "college",
});

College.hasMany(Mentor, {
  foreignKey: "college_id",
  as: "mentors",
});


College.hasMany(Batch, {
  foreignKey: "college_id",
  as: "batches",
});

Batch.belongsTo(College, {
  foreignKey: "college_id",
  as: "college",
});

Domain.hasMany(Batch, {
  foreignKey: "domain_id",
  as: "batches",
});

Batch.belongsTo(Domain, {
  foreignKey: "domain_id",
  as: "domain",
});

Mentor.hasMany(Batch, {
  foreignKey: "mentor_id",
  as: "batches",
});

Batch.belongsTo(Mentor, {
  foreignKey: "mentor_id",
  as: "mentor",
});

Batch.hasMany(Student, {
  foreignKey: "batch_id",
  as: "students",
});

Student.belongsTo(Batch, {
  foreignKey: "batch_id",
  as: "batch",
});

Mentor.hasMany(Student, {
  foreignKey: "mentor_id",
  as: "assigned_students",
});

Student.belongsTo(Mentor, {
  foreignKey: "mentor_id",
  as: "mentor",
});

Student.hasMany(ChapterCompletion, {
  foreignKey: "student_id",
  as: "chapter_completions",
});

ChapterCompletion.belongsTo(Student, {
  foreignKey: "student_id",
  as: "student",
});

Chapter.hasMany(ChapterCompletion, {
  foreignKey: "chapter_id",
  as: "student_completions",
});

ChapterCompletion.belongsTo(Chapter, {
  foreignKey: "chapter_id",
  as: "chapter",
});

Student.hasMany(Logbook, {
  foreignKey: "student_id",
  as: "logbook_entries",
});

Logbook.belongsTo(Student, {
  foreignKey: "student_id",
  as: "student",
});

Student.hasMany(Assessment, {
  foreignKey: "student_id",
  as: "assessments",
});

Assessment.belongsTo(Student, {
  foreignKey: "student_id",
  as: "student",
});

Mentor.hasMany(Assessment, {
  foreignKey: "mentor_id",
  as: "assessments",
});

Assessment.belongsTo(Mentor, {
  foreignKey: "mentor_id",
  as: "mentor",
});

Student.hasOne(Result, {
  foreignKey: "student_id",
  as: "result",
});

Result.belongsTo(Student, {
  foreignKey: "student_id",
  as: "student",
});

Assessment.hasOne(Result, {
  foreignKey: "assessment_id",
  as: "result",
});

Result.belongsTo(Assessment, {
  foreignKey: "assessment_id",
  as: "assessment",
});

Student.hasMany(GeneratedDocument, {
  foreignKey: "student_id",
  as: "generated_documents",
});

GeneratedDocument.belongsTo(Student, {
  foreignKey: "student_id",
  as: "student",
});

Student.hasOne(Certificate, {
  foreignKey: "student_id",
  as: "certificate",
});

Certificate.belongsTo(Student, {
  foreignKey: "student_id",
  as: "student",
});

Student.hasMany(InternshipReport, {
  foreignKey: "student_id",
  as: "internship_reports",
});

InternshipReport.belongsTo(Student, {
  foreignKey: "student_id",
  as: "student",
});

Student.hasMany(LiveProject, {
  foreignKey: "student_id",
  as: "live_projects",
});

LiveProject.belongsTo(Student, {
  foreignKey: "student_id",
  as: "student",
});

Submission.belongsTo(Student, {
  foreignKey: "student_id",
  as: "student",
});

Chapter.hasMany(
  ChapterResource,
  {
    foreignKey:
      "chapter_id",
    as: "resources",
    onDelete: "CASCADE",
  },
);

ChapterResource.belongsTo(
  Chapter,
  {
    foreignKey:
      "chapter_id",
    as: "chapter",
  },
);

Chapter.hasOne(Quiz, {
  foreignKey: "chapter_id",
  as: "quiz",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

Quiz.belongsTo(Chapter, {
  foreignKey: "chapter_id",
  as: "chapter",
});

Quiz.hasMany(QuizAttempt, {
  foreignKey: "quiz_id",
  as: "attempts",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

QuizAttempt.belongsTo(Quiz, {
  foreignKey: "quiz_id",
  as: "quiz",
});

Student.hasMany(QuizAttempt, {
  foreignKey: "student_id",
  as: "quiz_attempts",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

QuizAttempt.belongsTo(Student, {
  foreignKey: "student_id",
  as: "student",
});

/*
|--------------------------------------------------------------------------
| Quiz Answer Associations
|--------------------------------------------------------------------------
*/

QuizAttempt.hasMany(QuizAnswer, {
  foreignKey: "attempt_id",
  as: "answers",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

QuizAnswer.belongsTo(QuizAttempt, {
  foreignKey: "attempt_id",
  as: "attempt",
});

export { sequelize , Quiz,QuizAttempt, QuizAnswer,};
 
