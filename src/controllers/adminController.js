import fs from "fs";
import { Op } from "sequelize";
import {
  importStudents as importStudentsFromExcel,
} from "../services/excelImportService.js";

import {
  sequelize,
  User,
  College,
  Mentor,
  Student,
  Domain,
  BulkJob,
} from "../models/index.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";
import { hashPassword } from "../utils/security.js";
import {
  BULK_JOB_TYPES,
  bulkJobRunner,
} from "../jobs/bulkJobRunner.js";


const modelMap = {
  colleges: College,
  mentors: Mentor,
  students: Student,
};

const assignMentorToMatchingStudents = async ({
  mentor,
  transaction,
  overwriteExisting = false,
}) => {
  const where = {
    domain_id: mentor.domain_id,
  };

  if (mentor.college_id) {
    where.college_id = mentor.college_id;
  }

  if (!overwriteExisting) {
    where.mentor_id = null;
  }

  const [assignedStudentCount] =
    await Student.update(
      {
        mentor_id: mentor.id,
      },
      {
        where,
        transaction,
      },
    );

  return assignedStudentCount;
};

/**
 * Generic paginated list
 */
export const list = (entity) =>
  asyncHandler(async (req, res) => {
    const Model = modelMap[entity];

    if (!Model) {
      throw new AppError("Invalid entity", 400);
    }

    const page = Math.max(
      1,
      Number(req.query.page || 1),
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number(req.query.limit || 20),
      ),
    );

    const where = {};

    /*
    |--------------------------------------------------------------------------
    | Common status filter
    |--------------------------------------------------------------------------
    */

    if (req.query.status) {
      if (entity === "students") {
        where.internship_status =
          req.query.status;
      } else {
        where.status = req.query.status;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Student filters
    |--------------------------------------------------------------------------
    */

    if (entity === "students") {
      if (req.query.college_id) {
        where.college_id =
          req.query.college_id;
      }

      if (req.query.domain_id) {
  where.domain_id =
    req.query.domain_id;
}

if (req.query.batch_id) {
  where.batch_id =
    req.query.batch_id;
}

if (req.query.mentor_id) {
  where.mentor_id =
    req.query.mentor_id;
}

      if (req.query.session) {
        where.session =
          req.query.session;
      }

      if (req.query.semester) {
        where.semester =
          req.query.semester;
      }

      if (req.query.search) {
        where[Op.or] = [
          {
            registration_number: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
          {
            student_id: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
          {
            name: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
          {
            email: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
        ];
      }
    }

    /*
    |--------------------------------------------------------------------------
    | College search
    |--------------------------------------------------------------------------
    */

    if (
      entity === "colleges" &&
      req.query.search
    ) {
      where[Op.or] = [
        {
          name: {
            [Op.like]:
              `%${req.query.search}%`,
          },
        },
        {
          code: {
            [Op.like]:
              `%${req.query.search}%`,
          },
        },
        {
          university: {
            [Op.like]:
              `%${req.query.search}%`,
          },
        },
      ];
    }

    /*
    |--------------------------------------------------------------------------
    | Mentor filters
    |--------------------------------------------------------------------------
    */

    if (entity === "mentors") {
      if (req.query.domain_id) {
        where.domain_id =
          req.query.domain_id;
      }

      if (req.query.college_id) {
        where.college_id =
          req.query.college_id;
      }

      if (req.query.search) {
        where[Op.or] = [
          {
            employee_id: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
          {
            name: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
          {
            email: {
              [Op.like]:
                `%${req.query.search}%`,
            },
          },
        ];
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Query options
    |--------------------------------------------------------------------------
    */

    const options = {
      where,
      limit,
      offset: (page - 1) * limit,
      order: [["id", "DESC"]],
      distinct: true,
    };

    /*
    |--------------------------------------------------------------------------
    | Student relations
    |--------------------------------------------------------------------------
    */

    if (entity === "students") {
      options.attributes = {
        exclude: ["password_hash"],
      };

      options.include = [
        {
          model: College,
          as: "college",
          attributes: [
            "id",
            "name",
            "code",
            "university",
          ],
          required: false,
        },
        {
  model: Domain,
  as: "domain",

  attributes: [
    "id",
    "sector_id",
    "domain_name",
  ],

  where:
    req.query.sector_id
      ? {
          sector_id:
            req.query.sector_id,
        }
      : undefined,

  required:
    Boolean(
      req.query.sector_id,
    ),
},
      ];
    }

    /*
    |--------------------------------------------------------------------------
    | Mentor relations
    |--------------------------------------------------------------------------
    */

    if (entity === "mentors") {
      options.attributes = {
        exclude: ["password_hash"],
      };

      options.include = [
        {
          model: Domain,
          as: "domain",
          attributes: [
            "id",
            "domain_name",
          ],
          required: false,
        },
        {
          model: College,
          as: "college",
          attributes: [
            "id",
            "name",
            "code",
          ],
          required: false,
        },
      ];
    }

    /*
    |--------------------------------------------------------------------------
    | College relations
    |--------------------------------------------------------------------------
    */

    if (entity === "colleges") {
      options.include = [
        {
          model: User,
          as: "users",
          attributes: [
            "id",
            "username",
            "email",
            "role",
            "status",
          ],
          where: {
            role: "college_admin",
          },
          required: false,
        },
      ];
    }

    const result =
      await Model.findAndCountAll(
        options,
      );

    ok(res, {
      items: result.rows,
      total: result.count,
      page,
      limit,
      totalPages: Math.ceil(
        result.count / limit,
      ),
    });
  });

/**
 * Get one record
 */
export const getById = (entity) =>
  asyncHandler(async (req, res) => {
    const Model = modelMap[entity];

    if (!Model) {
      throw new AppError("Invalid entity", 400);
    }

    const options = {};
    if (entity === "students") {
  options.attributes = {
    exclude: ["password_hash"],
  };

  options.include = [
    {
      model: College,
      as: "college",
      attributes: [
        "id",
        "name",
        "code",
        "university",
      ],
      required: false,
    },
    {
      model: Domain,
      as: "domain",
      attributes: [
        "id",
        "domain_name",
        "fee",
        "duration_hours",
      ],
      required: false,
    },
  ];
}

    if (entity === "colleges") {
      options.include = [
        {
          model: User,
          as: "users",
          attributes: [
            "id",
            "username",
            "email",
            "role",
            "status",
          ],
          where: {
            role: "college_admin",
          },
          required: false,
        },
      ];
    }

    if (entity === "mentors") {
  options.attributes = {
    exclude: ["password_hash"],
  };

  options.include = [
    {
      model: Domain,
      as: "domain",
      attributes: [
        "id",
        "domain_name",
        "fee",
        "duration_hours",
      ],
    },
    {
      model: College,
      as: "college",
      attributes: [
        "id",
        "name",
        "code",
      ],
      required: false,
    },
  ];
}

    const row = await Model.findByPk(req.params.id, options);

    if (!row) {
      throw new AppError("Record not found", 404);
    }

    ok(res, row);
  });

/**
 * Generic create for Mentor and Student only
 */
export const create = (entity) =>
  asyncHandler(async (req, res) => {
    const Model = modelMap[entity];

    if (!Model) {
      throw new AppError("Invalid entity", 400);
    }

    if (entity === "colleges") {
      throw new AppError(
        "Use dedicated college creation endpoint",
        400,
      );
    }

    const payload = {
      ...req.body,
    };

    if (payload.password) {
      payload.password_hash = await hashPassword(payload.password);
      delete payload.password;
    }

    const row = await Model.create(payload);

    ok(res, row, "Created", 201);
  });

/**
 * Dedicated College creation
 *
 * Creates:
 * 1. College
 * 2. College admin user
 */
export const createCollege = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      name,
      code,
      university,
      principal_name,
      coordinator_name,
      address,
      state,
      district,
      pincode,
      logo,
      college_share,
      rknexora_share,
      status,

      admin_username,
      admin_email,
      admin_password,
    } = req.body;

    if (!name || !code) {
      throw new AppError(
        "College name and code are required",
        422,
      );
    }

    if (
      !admin_username ||
      !admin_email ||
      !admin_password
    ) {
      throw new AppError(
        "College admin username, email and password are required",
        422,
      );
    }

    const totalShare =
      Number(college_share || 0) +
      Number(rknexora_share || 0);

    if (Math.abs(totalShare - 100) > 0.01) {
      throw new AppError(
        "College share and RKNexora share total must be 100",
        422,
      );
    }

    const existingCollege = await College.findOne({
      where: {
        code,
      },
      transaction,
    });

    if (existingCollege) {
      throw new AppError(
        "College code already exists",
        409,
      );
    }

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          {
            username: admin_username,
          },
          {
            email: admin_email,
          },
        ],
      },
      transaction,
    });

    if (existingUser) {
      throw new AppError(
        "Admin username or email already exists",
        409,
      );
    }

    const college = await College.create(
      {
        name,
        code,
        university,
        principal_name,
        coordinator_name,
        address,
        state,
        district,
        pincode,
        logo: logo || null,
        college_share,
        rknexora_share,
        status: status || "active",
      },
      {
        transaction,
      },
    );

    const passwordHash = await hashPassword(admin_password);

    const collegeAdmin = await User.create(
      {
        username: admin_username,
        email: admin_email,
        password_hash: passwordHash,
        role: "college_admin",
        college_id: college.id,
        status:
          college.status === "active"
            ? "active"
            : "inactive",
      },
      {
        transaction,
      },
    );

    await transaction.commit();

    ok(
      res,
      {
        college,
        admin: {
          id: collegeAdmin.id,
          username: collegeAdmin.username,
          email: collegeAdmin.email,
          role: collegeAdmin.role,
          college_id: collegeAdmin.college_id,
          status: collegeAdmin.status,
        },
      },
      "College and college admin created successfully",
      201,
    );
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

/**
 * Generic update
 */
export const update = (entity) =>
  asyncHandler(async (req, res) => {
    const Model = modelMap[entity];

    if (!Model) {
      throw new AppError("Invalid entity", 400);
    }

    const row = await Model.findByPk(req.params.id);

    if (!row) {
      throw new AppError("Record not found", 404);
    }

    const payload = {
      ...req.body,
    };

    if (payload.password) {
      payload.password_hash = await hashPassword(
        payload.password,
      );

      delete payload.password;
    }

    await row.update(payload);

    ok(res, row, "Updated");
  });

/**
 * Dedicated College update
 */
export const updateCollege = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const college = await College.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!college) {
      throw new AppError("College not found", 404);
    }

    const {
      admin_username,
      admin_email,
      admin_password,
      ...collegePayload
    } = req.body;

    if (
      collegePayload.college_share !== undefined ||
      collegePayload.rknexora_share !== undefined
    ) {
      const collegeShare = Number(
        collegePayload.college_share ??
          college.college_share,
      );

      const rknexoraShare = Number(
        collegePayload.rknexora_share ??
          college.rknexora_share,
      );

      if (
        Math.abs(
          collegeShare + rknexoraShare - 100,
        ) > 0.01
      ) {
        throw new AppError(
          "College share and RKNexora share total must be 100",
          422,
        );
      }
    }

    delete collegePayload.id;
    delete collegePayload.created_at;
    delete collegePayload.updated_at;

    await college.update(collegePayload, {
      transaction,
    });

    const collegeAdmin = await User.findOne({
      where: {
        college_id: college.id,
        role: "college_admin",
      },
      transaction,
    });

    if (collegeAdmin) {
      const adminPayload = {};

      if (admin_username) {
        const existingUsername = await User.findOne({
          where: {
            username: admin_username,
            id: {
              [Op.ne]: collegeAdmin.id,
            },
          },
          transaction,
        });

        if (existingUsername) {
          throw new AppError(
            "Admin username already exists",
            409,
          );
        }

        adminPayload.username = admin_username;
      }

      if (admin_email) {
        const existingEmail = await User.findOne({
          where: {
            email: admin_email,
            id: {
              [Op.ne]: collegeAdmin.id,
            },
          },
          transaction,
        });

        if (existingEmail) {
          throw new AppError(
            "Admin email already exists",
            409,
          );
        }

        adminPayload.email = admin_email;
      }

      if (admin_password) {
        adminPayload.password_hash =
          await hashPassword(admin_password);
      }

      if (collegePayload.status) {
        adminPayload.status =
          collegePayload.status === "active"
            ? "active"
            : "inactive";
      }

      if (Object.keys(adminPayload).length > 0) {
        await collegeAdmin.update(adminPayload, {
          transaction,
        });
      }
    }

    await transaction.commit();

    ok(
      res,
      {
        college,
        admin: collegeAdmin
          ? {
              id: collegeAdmin.id,
              username: collegeAdmin.username,
              email: collegeAdmin.email,
              role: collegeAdmin.role,
              status: collegeAdmin.status,
            }
          : null,
      },
      "College updated successfully",
    );
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

/**
 * Approve/activate College
 */
export const approveCollege = asyncHandler(
  async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const college = await College.findByPk(
        req.params.id,
        {
          transaction,
        },
      );

      if (!college) {
        throw new AppError(
          "College not found",
          404,
        );
      }

      await college.update(
        {
          status: "active",
        },
        {
          transaction,
        },
      );

      await User.update(
        {
          status: "active",
        },
        {
          where: {
            college_id: college.id,
            role: "college_admin",
          },
          transaction,
        },
      );

      await transaction.commit();

      ok(
        res,
        college,
        "College approved successfully",
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
);

/**
 * Generic delete
 */
export const remove = (entity) =>
  asyncHandler(async (req, res) => {
    const Model = modelMap[entity];

    if (!Model) {
      throw new AppError("Invalid entity", 400);
    }

    const row = await Model.findByPk(req.params.id);

    if (!row) {
      throw new AppError("Record not found", 404);
    }

    await row.destroy();

    ok(res, {}, "Deleted");
  });

/**
 * Dedicated College delete
 */
export const removeCollege = asyncHandler(
  async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const college = await College.findByPk(
        req.params.id,
        {
          transaction,
        },
      );

      if (!college) {
        throw new AppError(
          "College not found",
          404,
        );
      }

      const studentCount = await Student.count({
        where: {
          college_id: college.id,
        },
        transaction,
      });

      if (studentCount > 0) {
        throw new AppError(
          "College cannot be deleted because students are linked to it. Deactivate it instead.",
          409,
        );
      }

      await User.destroy({
        where: {
          college_id: college.id,
          role: "college_admin",
        },
        transaction,
      });

      await college.destroy({
        transaction,
      });

      await transaction.commit();

      ok(
        res,
        {},
        "College deleted successfully",
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
);

export const processBulk = asyncHandler(
  async (req, res) => {
    const {
      type,
      payload = {},
    } = req.body;

    if (
      !BULK_JOB_TYPES.includes(type)
    ) {
      throw new AppError(
        "Invalid bulk operation type",
        422,
      );
    }

    const job =
      await bulkJobRunner.create(
        type,
        payload,
        req.user.id,
      );

    ok(
      res,
      {
        job_uuid:
          job.job_uuid,
        type:
          job.type,
        status:
          job.status,
      },
      "Bulk job queued",
      202,
    );
  },
);

export const bulkStatus = asyncHandler(
  async (req, res) => {
    const job =
      await BulkJob.findOne({
        where: {
          job_uuid:
            req.params.jobUuid,
        },
      });

    if (!job) {
      throw new AppError(
        "Job not found",
        404,
      );
    }

    ok(
      res,
      job,
      "Bulk job status fetched successfully",
    );
  },
);

export const createMentor = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      name,
      employee_id,
      designation,
      department,
      specialization,
      mobile,
      email,
      qualification,
      profile_photo,
      password,
      username,
      domain_id,
      college_id,
      status = "active",
    } = req.body;

    if (!name) {
      throw new AppError("Mentor name is required", 422);
    }

    if (!employee_id) {
      throw new AppError("Employee ID is required", 422);
    }

    if (!email) {
      throw new AppError("Email is required", 422);
    }

    if (!password) {
      throw new AppError("Password is required", 422);
    }

    if (!domain_id) {
      throw new AppError("Domain is required", 422);
    }

    if (!["active", "inactive"].includes(status)) {
      throw new AppError("Invalid mentor status", 422);
    }

    const domain = await Domain.findByPk(domain_id, {
      transaction,
    });

    if (!domain) {
      throw new AppError("Selected domain not found", 404);
    }

    if (college_id) {
      const college = await College.findByPk(college_id, {
        transaction,
      });

      if (!college) {
        throw new AppError("Selected college not found", 404);
      }
    }

    const existingMentor = await Mentor.findOne({
      where: {
        [Op.or]: [
          { employee_id },
          { email },
        ],
      },
      transaction,
    });

    if (existingMentor) {
      throw new AppError(
        "Mentor employee ID or email already exists",
        409,
      );
    }

    const loginUsername = username || employee_id;

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { username: loginUsername },
          { email },
        ],
      },
      transaction,
    });

    if (existingUser) {
      throw new AppError(
        "Login username or email already exists",
        409,
      );
    }

    const passwordHash = await hashPassword(password);

    const mentor = await Mentor.create(
      {
        name,
        employee_id,
        designation: designation || null,
        department: department || null,
        specialization: specialization || null,
        domain_id,
        college_id: college_id || null,
        mobile: mobile || null,
        email,
        qualification: qualification || null,
        profile_photo: profile_photo || null,
        password_hash: passwordHash,
        status,
      },
      {
        transaction,
      },
    );

   const user = await User.create(
  {
    username: loginUsername,
    email,
    password_hash: passwordHash,
    role: "mentor",
    college_id: college_id || null,
    status,
  },
  {
    transaction,
  },
);

const assignedStudentCount =
  await assignMentorToMatchingStudents({
    mentor,
    transaction,
    overwriteExisting: false,
  });

await transaction.commit();

    await transaction.commit();

    ok(
      res,
      {
        mentor: {
          id: mentor.id,
          name: mentor.name,
          employee_id: mentor.employee_id,
          designation: mentor.designation,
          department: mentor.department,
          specialization: mentor.specialization,
          domain_id: mentor.domain_id,
          college_id: mentor.college_id,
          mobile: mentor.mobile,
          email: mentor.email,
          qualification: mentor.qualification,
          profile_photo: mentor.profile_photo,
          status: mentor.status,
        },
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          college_id: user.college_id,
          status: user.status,
        },
        assigned_students:
      assignedStudentCount,
      },
      "Mentor profile and login account created successfully",
      201,
    );
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

export const updateMentor = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const mentor = await Mentor.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!mentor) {
      throw new AppError("Mentor not found", 404);
    }

    const {
      name,
      employee_id,
      designation,
      department,
      specialization,
      mobile,
      email,
      qualification,
      profile_photo,
      password,
      username,
      domain_id,
      college_id,
      status,
    } = req.body;

    if (
      status !== undefined &&
      !["active", "inactive"].includes(status)
    ) {
      throw new AppError("Invalid mentor status", 422);
    }

    if (domain_id !== undefined) {
      const domain = await Domain.findByPk(domain_id, {
        transaction,
      });

      if (!domain) {
        throw new AppError("Selected domain not found", 404);
      }
    }

    if (college_id !== undefined && college_id !== null) {
      const college = await College.findByPk(college_id, {
        transaction,
      });

      if (!college) {
        throw new AppError("Selected college not found", 404);
      }
    }

    if (employee_id || email) {
      const duplicateMentor = await Mentor.findOne({
        where: {
          id: {
            [Op.ne]: mentor.id,
          },
          [Op.or]: [
            ...(employee_id ? [{ employee_id }] : []),
            ...(email ? [{ email }] : []),
          ],
        },
        transaction,
      });

      if (duplicateMentor) {
        throw new AppError(
          "Mentor employee ID or email already exists",
          409,
        );
      }
    }

    const mentorPayload = {};

    if (name !== undefined) mentorPayload.name = name;
    if (employee_id !== undefined) {
      mentorPayload.employee_id = employee_id;
    }
    if (designation !== undefined) {
      mentorPayload.designation = designation || null;
    }
    if (department !== undefined) {
      mentorPayload.department = department || null;
    }
    if (specialization !== undefined) {
      mentorPayload.specialization = specialization || null;
    }
    if (domain_id !== undefined) {
      mentorPayload.domain_id = domain_id;
    }
    if (college_id !== undefined) {
      mentorPayload.college_id = college_id || null;
    }
    if (mobile !== undefined) {
      mentorPayload.mobile = mobile || null;
    }
    if (email !== undefined) {
      mentorPayload.email = email;
    }
    if (qualification !== undefined) {
      mentorPayload.qualification = qualification || null;
    }
    if (profile_photo !== undefined) {
      mentorPayload.profile_photo = profile_photo || null;
    }
    if (status !== undefined) {
      mentorPayload.status = status;
    }

    if (password) {
      mentorPayload.password_hash =
        await hashPassword(password);
    }

    await mentor.update(mentorPayload, {
      transaction,
    });

    const mentorUser = await User.findOne({
      where: {
        email: mentor.email,
        role: "mentor",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!mentorUser) {
      throw new AppError(
        "Mentor login account not found",
        404,
      );
    }

    const userPayload = {};

    if (username !== undefined) {
      const existingUsername = await User.findOne({
        where: {
          username,
          id: {
            [Op.ne]: mentorUser.id,
          },
        },
        transaction,
      });

      if (existingUsername) {
        throw new AppError(
          "Username already exists",
          409,
        );
      }

      userPayload.username = username;
    }

    if (email !== undefined) {
      const existingEmail = await User.findOne({
        where: {
          email,
          id: {
            [Op.ne]: mentorUser.id,
          },
        },
        transaction,
      });

      if (existingEmail) {
        throw new AppError(
          "User email already exists",
          409,
        );
      }

      userPayload.email = email;
    }

    if (college_id !== undefined) {
      userPayload.college_id = college_id || null;
    }

    if (status !== undefined) {
      userPayload.status = status;
    }

    if (password) {
      userPayload.password_hash =
        mentorPayload.password_hash;
    }

    if (Object.keys(userPayload).length > 0) {
      await mentorUser.update(userPayload, {
        transaction,
      });
    }

    await transaction.commit();

    ok(
      res,
      {
        mentor: {
          id: mentor.id,
          name: mentor.name,
          employee_id: mentor.employee_id,
          email: mentor.email,
          domain_id: mentor.domain_id,
          college_id: mentor.college_id,
          status: mentor.status,
        },
        user: {
          id: mentorUser.id,
          username: mentorUser.username,
          email: mentorUser.email,
          role: mentorUser.role,
          college_id: mentorUser.college_id,
          status: mentorUser.status,
        },
      },
      "Mentor profile and login account updated successfully",
    );
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

export const importStudents = asyncHandler(
  async (req, res) => {
    const collegeId = Number(
      req.body.college_id,
    );

    if (!collegeId) {
      throw new AppError(
        "College is required",
        422,
      );
    }

    if (!req.file) {
      throw new AppError(
        "Excel file is required",
        422,
      );
    }

    const college =
      await College.findByPk(
        collegeId,
        {
          attributes: [
            "id",
            "name",
            "code",
          ],
        },
      );

    if (!college) {
      throw new AppError(
        "Selected college not found",
        404,
      );
    }

    try {
      const result =
        await importStudentsFromExcel(
          req.file.path,
          collegeId,
        );

      ok(
        res,
        {
          college: {
            id: college.id,
            name: college.name,
            code: college.code,
          },

          ...result,
        },
        "Student Excel imported successfully",
      );
    } finally {
      fs.unlink(
        req.file.path,
        (error) => {
          if (
            error &&
            error.code !== "ENOENT"
          ) {
            console.error(
              "Failed to delete uploaded Excel file:",
              error.message,
            );
          }
        },
      );
    }
  },
);