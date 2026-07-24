import { Op } from "sequelize";

import {
  Sector,
  Domain,
  Module,
  Chapter,
  Assignment,
} from "../models/index.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError, ok } from "../utils/response.js";

const getPagination = (query) => {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(
    100,
    Math.max(1, Number(query.limit || 20)),
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

const paginationResponse = (
  result,
  page,
  limit,
) => ({
  items: result.rows,
  total: result.count,
  page,
  limit,
  totalPages: Math.ceil(result.count / limit),
});

const parsePositiveInteger = (
  value,
  fieldName,
) => {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    throw new AppError(
      `${fieldName} must be a positive integer`,
      422,
    );
  }

  return number;
};

/*
|--------------------------------------------------------------------------
| Sector
|--------------------------------------------------------------------------
*/

export const listSectors = asyncHandler(
  async (req, res) => {
    const {
      page,
      limit,
      offset,
    } = getPagination(req.query);

    const where = {};

    if (req.query.status) {
      where.status = req.query.status;
    }

    if (req.query.search) {
      where.sector_name = {
        [Op.like]: `%${req.query.search.trim()}%`,
      };
    }

    const result =
      await Sector.findAndCountAll({
        where,
        limit,
        offset,
        order: [["id", "DESC"]],
      });

    ok(
      res,
      paginationResponse(
        result,
        page,
        limit,
      ),
    );
  },
);

export const getSectorById =
  asyncHandler(async (req, res) => {
    const sector =
      await Sector.findByPk(
        req.params.id,
        {
          include: [
            {
              model: Domain,
              attributes: [
                "id",
                "domain_name",
                "fee",
                "duration_hours",
              ],
              required: false,
            },
          ],
        },
      );

    if (!sector) {
      throw new AppError(
        "Sector not found",
        404,
      );
    }

    ok(res, sector);
  });

export const createSector =
  asyncHandler(async (req, res) => {
    const sectorName =
      String(
        req.body.sector_name || "",
      ).trim();

    const status =
      req.body.status || "active";

    if (!sectorName) {
      throw new AppError(
        "Sector name is required",
        422,
      );
    }

    if (
      !["active", "inactive"].includes(
        status,
      )
    ) {
      throw new AppError(
        "Invalid sector status",
        422,
      );
    }

    const existing =
      await Sector.findOne({
        where: {
          sector_name: sectorName,
        },
      });

    if (existing) {
      throw new AppError(
        "Sector already exists",
        409,
      );
    }

    const sector =
      await Sector.create({
        sector_name: sectorName,
        status,
      });

    ok(
      res,
      sector,
      "Sector created successfully",
      201,
    );
  });

export const updateSector =
  asyncHandler(async (req, res) => {
    const sector =
      await Sector.findByPk(
        req.params.id,
      );

    if (!sector) {
      throw new AppError(
        "Sector not found",
        404,
      );
    }

    const payload = {};

    if (
      req.body.sector_name !==
      undefined
    ) {
      const sectorName =
        String(
          req.body.sector_name,
        ).trim();

      if (!sectorName) {
        throw new AppError(
          "Sector name is required",
          422,
        );
      }

      const existing =
        await Sector.findOne({
          where: {
            sector_name: sectorName,
            id: {
              [Op.ne]: sector.id,
            },
          },
        });

      if (existing) {
        throw new AppError(
          "Sector already exists",
          409,
        );
      }

      payload.sector_name =
        sectorName;
    }

    if (
      req.body.status !== undefined
    ) {
      if (
        ![
          "active",
          "inactive",
        ].includes(req.body.status)
      ) {
        throw new AppError(
          "Invalid sector status",
          422,
        );
      }

      payload.status =
        req.body.status;
    }

    await sector.update(payload);

    ok(
      res,
      sector,
      "Sector updated successfully",
    );
  });

export const deleteSector =
  asyncHandler(async (req, res) => {
    const sector =
      await Sector.findByPk(
        req.params.id,
      );

    if (!sector) {
      throw new AppError(
        "Sector not found",
        404,
      );
    }

    const domainCount =
      await Domain.count({
        where: {
          sector_id: sector.id,
        },
      });

    if (domainCount > 0) {
      throw new AppError(
        "Sector cannot be deleted because domains are linked to it",
        409,
      );
    }

    await sector.destroy();

    ok(
      res,
      {},
      "Sector deleted successfully",
    );
  });

/*
|--------------------------------------------------------------------------
| Domain
|--------------------------------------------------------------------------
*/

export const listDomains = asyncHandler(
  async (req, res) => {
    const {
      page,
      limit,
      offset,
    } = getPagination(req.query);

    const where = {};

    if (req.query.sector_id) {
      where.sector_id =
        req.query.sector_id;
    }

    if (req.query.search) {
      where.domain_name = {
        [Op.like]: `%${req.query.search.trim()}%`,
      };
    }

    const result =
      await Domain.findAndCountAll({
        where,
        limit,
        offset,
        order: [["id", "DESC"]],
        distinct: true,
        include: [
          {
            model: Sector,
            attributes: [
              "id",
              "sector_name",
              "status",
            ],
          },
        ],
      });

    ok(
      res,
      paginationResponse(
        result,
        page,
        limit,
      ),
    );
  },
);

export const getDomainById =
  asyncHandler(async (req, res) => {
    const domain =
      await Domain.findByPk(
        req.params.id,
        {
          include: [
            {
              model: Sector,
              attributes: [
                "id",
                "sector_name",
                "status",
              ],
            },
            {
              model: Module,
              required: false,
            },
          ],
        },
      );

    if (!domain) {
      throw new AppError(
        "Domain not found",
        404,
      );
    }

    ok(res, domain);
  });

export const createDomain =
  asyncHandler(async (req, res) => {
    const {
      sector_id,
      fee = 0,
      duration_hours = 0,
    } = req.body;

    const domainName =
      String(
        req.body.domain_name || "",
      ).trim();

    if (!sector_id) {
      throw new AppError(
        "Sector is required",
        422,
      );
    }

    if (!domainName) {
      throw new AppError(
        "Domain name is required",
        422,
      );
    }

    const sector =
      await Sector.findByPk(
        sector_id,
      );

    if (!sector) {
      throw new AppError(
        "Sector not found",
        404,
      );
    }

    const parsedFee = Number(fee);
    const parsedDuration =
      Number(duration_hours);

    if (
      Number.isNaN(parsedFee) ||
      parsedFee < 0
    ) {
      throw new AppError(
        "Fee must be zero or greater",
        422,
      );
    }

    if (
      !Number.isInteger(
        parsedDuration,
      ) ||
      parsedDuration < 0
    ) {
      throw new AppError(
        "Duration hours must be a non-negative integer",
        422,
      );
    }

    const existing =
      await Domain.findOne({
        where: {
          sector_id,
          domain_name:
            domainName,
        },
      });

    if (existing) {
      throw new AppError(
        "Domain already exists in this sector",
        409,
      );
    }

    const domain =
      await Domain.create({
        sector_id,
        domain_name:
          domainName,
        fee: parsedFee,
        duration_hours:
          parsedDuration,
      });

    ok(
      res,
      domain,
      "Domain created successfully",
      201,
    );
  });

export const updateDomain =
  asyncHandler(async (req, res) => {
    const domain =
      await Domain.findByPk(
        req.params.id,
      );

    if (!domain) {
      throw new AppError(
        "Domain not found",
        404,
      );
    }

    const sectorId =
      req.body.sector_id ??
      domain.sector_id;

    const domainName =
      req.body.domain_name !==
      undefined
        ? String(
            req.body.domain_name,
          ).trim()
        : domain.domain_name;

    if (!domainName) {
      throw new AppError(
        "Domain name is required",
        422,
      );
    }

    const sector =
      await Sector.findByPk(
        sectorId,
      );

    if (!sector) {
      throw new AppError(
        "Sector not found",
        404,
      );
    }

    const existing =
      await Domain.findOne({
        where: {
          sector_id: sectorId,
          domain_name:
            domainName,
          id: {
            [Op.ne]: domain.id,
          },
        },
      });

    if (existing) {
      throw new AppError(
        "Domain already exists in this sector",
        409,
      );
    }

    const payload = {
      sector_id: sectorId,
      domain_name:
        domainName,
    };

    if (
      req.body.fee !== undefined
    ) {
      const fee = Number(
        req.body.fee,
      );

      if (
        Number.isNaN(fee) ||
        fee < 0
      ) {
        throw new AppError(
          "Fee must be zero or greater",
          422,
        );
      }

      payload.fee = fee;
    }

    if (
      req.body.duration_hours !==
      undefined
    ) {
      const duration = Number(
        req.body.duration_hours,
      );

      if (
        !Number.isInteger(
          duration,
        ) ||
        duration < 0
      ) {
        throw new AppError(
          "Duration hours must be a non-negative integer",
          422,
        );
      }

      payload.duration_hours =
        duration;
    }

    await domain.update(payload);

    ok(
      res,
      domain,
      "Domain updated successfully",
    );
  });

export const deleteDomain =
  asyncHandler(async (req, res) => {
    const domain =
      await Domain.findByPk(
        req.params.id,
      );

    if (!domain) {
      throw new AppError(
        "Domain not found",
        404,
      );
    }

    const moduleCount =
      await Module.count({
        where: {
          domain_id: domain.id,
        },
      });

    if (moduleCount > 0) {
      throw new AppError(
        "Domain cannot be deleted because modules are linked to it",
        409,
      );
    }

    await domain.destroy();

    ok(
      res,
      {},
      "Domain deleted successfully",
    );
  });

/*
|--------------------------------------------------------------------------
| Module
|--------------------------------------------------------------------------
*/

export const listModules = asyncHandler(
  async (req, res) => {
    const {
      page,
      limit,
      offset,
    } = getPagination(req.query);

    const where = {};

    if (req.query.domain_id) {
      where.domain_id =
        req.query.domain_id;
    }

    if (req.query.search) {
      where.module_name = {
        [Op.like]: `%${req.query.search.trim()}%`,
      };
    }

    const result =
      await Module.findAndCountAll({
        where,
        limit,
        offset,
        order: [
          ["domain_id", "ASC"],
          ["module_number", "ASC"],
        ],
        distinct: true,
        include: [
          {
            model: Domain,
            attributes: [
              "id",
              "domain_name",
            ],
            include: [
              {
                model: Sector,
                attributes: [
                  "id",
                  "sector_name",
                ],
              },
            ],
          },
        ],
      });

    ok(
      res,
      paginationResponse(
        result,
        page,
        limit,
      ),
    );
  },
);

export const getModuleById =
  asyncHandler(async (req, res) => {
    const module =
      await Module.findByPk(
        req.params.id,
        {
          include: [
            {
              model: Domain,
              attributes: [
                "id",
                "domain_name",
              ],
            },
            {
              model: Chapter,
              required: false,
            },
          ],
        },
      );

    if (!module) {
      throw new AppError(
        "Module not found",
        404,
      );
    }

    ok(res, module);
  });

export const createModule =
  asyncHandler(async (req, res) => {
    const {
      domain_id,
      module_number,
    } = req.body;

    const moduleName =
      String(
        req.body.module_name || "",
      ).trim();

    if (!domain_id) {
      throw new AppError(
        "Domain is required",
        422,
      );
    }

    if (!moduleName) {
      throw new AppError(
        "Module name is required",
        422,
      );
    }

    const moduleNumber =
      parsePositiveInteger(
        module_number,
        "Module number",
      );

    const domain =
      await Domain.findByPk(
        domain_id,
      );

    if (!domain) {
      throw new AppError(
        "Domain not found",
        404,
      );
    }

    const existing =
      await Module.findOne({
        where: {
          domain_id,
          module_number:
            moduleNumber,
        },
      });

    if (existing) {
      throw new AppError(
        "Module number already exists in this domain",
        409,
      );
    }

    const module =
      await Module.create({
        domain_id,
        module_number:
          moduleNumber,
        module_name:
          moduleName,
      });

    ok(
      res,
      module,
      "Module created successfully",
      201,
    );
  });

export const updateModule =
  asyncHandler(async (req, res) => {
    const module =
      await Module.findByPk(
        req.params.id,
      );

    if (!module) {
      throw new AppError(
        "Module not found",
        404,
      );
    }

    const domainId =
      req.body.domain_id ??
      module.domain_id;

    const moduleNumber =
      req.body.module_number !==
      undefined
        ? parsePositiveInteger(
            req.body.module_number,
            "Module number",
          )
        : module.module_number;

    const moduleName =
      req.body.module_name !==
      undefined
        ? String(
            req.body.module_name,
          ).trim()
        : module.module_name;

    if (!moduleName) {
      throw new AppError(
        "Module name is required",
        422,
      );
    }

    const domain =
      await Domain.findByPk(
        domainId,
      );

    if (!domain) {
      throw new AppError(
        "Domain not found",
        404,
      );
    }

    const existing =
      await Module.findOne({
        where: {
          domain_id: domainId,
          module_number:
            moduleNumber,
          id: {
            [Op.ne]: module.id,
          },
        },
      });

    if (existing) {
      throw new AppError(
        "Module number already exists in this domain",
        409,
      );
    }

    await module.update({
      domain_id: domainId,
      module_number:
        moduleNumber,
      module_name: moduleName,
    });

    ok(
      res,
      module,
      "Module updated successfully",
    );
  });

export const deleteModule =
  asyncHandler(async (req, res) => {
    const module =
      await Module.findByPk(
        req.params.id,
      );

    if (!module) {
      throw new AppError(
        "Module not found",
        404,
      );
    }

    const chapterCount =
      await Chapter.count({
        where: {
          module_id: module.id,
        },
      });

    if (chapterCount > 0) {
      throw new AppError(
        "Module cannot be deleted because chapters are linked to it",
        409,
      );
    }

    await module.destroy();

    ok(
      res,
      {},
      "Module deleted successfully",
    );
  });

/*
|--------------------------------------------------------------------------
| Chapter
|--------------------------------------------------------------------------
*/

export const listChapters =
  asyncHandler(async (req, res) => {
    const {
      page,
      limit,
      offset,
    } = getPagination(req.query);

    const where = {};

    if (req.query.module_id) {
      where.module_id =
        req.query.module_id;
    }

    if (req.query.content_type) {
      where.content_type =
        req.query.content_type;
    }

    if (req.query.search) {
      where.chapter_name = {
        [Op.like]: `%${req.query.search.trim()}%`,
      };
    }

    const result =
      await Chapter.findAndCountAll({
        where,
        limit,
        offset,
        order: [
          ["module_id", "ASC"],
          ["chapter_number", "ASC"],
        ],
        distinct: true,
        include: [
          {
            model: Module,
            attributes: [
              "id",
              "module_number",
              "module_name",
              "domain_id",
            ],
            include: [
              {
                model: Domain,
                attributes: [
                  "id",
                  "domain_name",
                ],
              },
            ],
          },
        ],
      });

    ok(
      res,
      paginationResponse(
        result,
        page,
        limit,
      ),
    );
  });

export const getChapterById =
  asyncHandler(async (req, res) => {
    const chapter =
      await Chapter.findByPk(
        req.params.id,
        {
          include: [
            {
              model: Module,
              attributes: [
                "id",
                "module_number",
                "module_name",
              ],
              include: [
                {
                  model: Domain,
                  attributes: [
                    "id",
                    "domain_name",
                  ],
                },
              ],
            },
            {
              model: Assignment,
              required: false,
            },
          ],
        },
      );

    if (!chapter) {
      throw new AppError(
        "Chapter not found",
        404,
      );
    }

    ok(res, chapter);
  });

export const createChapter =
  asyncHandler(async (req, res) => {
    const {
      module_id,
      chapter_number,
      content_type,
    } = req.body;

    const chapterName =
      String(
        req.body.chapter_name || "",
      ).trim();

    const contentUrl =
      String(
        req.body.content_url || "",
      ).trim();

    if (!module_id) {
      throw new AppError(
        "Module is required",
        422,
      );
    }

    if (!chapterName) {
      throw new AppError(
        "Chapter name is required",
        422,
      );
    }

    if (!contentUrl) {
      throw new AppError(
        "Content URL is required",
        422,
      );
    }

    const allowedContentTypes = [
      "video",
      "pdf",
      "text",
      "link",
    ];

    if (
      !allowedContentTypes.includes(
        content_type,
      )
    ) {
      throw new AppError(
        "Invalid content type",
        422,
      );
    }

    const chapterNumber =
      parsePositiveInteger(
        chapter_number,
        "Chapter number",
      );

    const module =
      await Module.findByPk(
        module_id,
      );

    if (!module) {
      throw new AppError(
        "Module not found",
        404,
      );
    }

    const existing =
      await Chapter.findOne({
        where: {
          module_id,
          chapter_number:
            chapterNumber,
        },
      });

    if (existing) {
      throw new AppError(
        "Chapter number already exists in this module",
        409,
      );
    }

    const chapter =
      await Chapter.create({
        module_id,
        chapter_number:
          chapterNumber,
        chapter_name:
          chapterName,
        content_type,
        content_url: contentUrl,
      });

    ok(
      res,
      chapter,
      "Chapter created successfully",
      201,
    );
  });

export const updateChapter =
  asyncHandler(async (req, res) => {
    const chapter =
      await Chapter.findByPk(
        req.params.id,
      );

    if (!chapter) {
      throw new AppError(
        "Chapter not found",
        404,
      );
    }

    const moduleId =
      req.body.module_id ??
      chapter.module_id;

    const chapterNumber =
      req.body.chapter_number !==
      undefined
        ? parsePositiveInteger(
            req.body.chapter_number,
            "Chapter number",
          )
        : chapter.chapter_number;

    const chapterName =
      req.body.chapter_name !==
      undefined
        ? String(
            req.body.chapter_name,
          ).trim()
        : chapter.chapter_name;

    const contentType =
      req.body.content_type ??
      chapter.content_type;

    const contentUrl =
      req.body.content_url !==
      undefined
        ? String(
            req.body.content_url,
          ).trim()
        : chapter.content_url;

    if (!chapterName) {
      throw new AppError(
        "Chapter name is required",
        422,
      );
    }

    if (!contentUrl) {
      throw new AppError(
        "Content URL is required",
        422,
      );
    }

    if (
      ![
        "video",
        "pdf",
        "text",
        "link",
      ].includes(contentType)
    ) {
      throw new AppError(
        "Invalid content type",
        422,
      );
    }

    const module =
      await Module.findByPk(
        moduleId,
      );

    if (!module) {
      throw new AppError(
        "Module not found",
        404,
      );
    }

    const existing =
      await Chapter.findOne({
        where: {
          module_id: moduleId,
          chapter_number:
            chapterNumber,
          id: {
            [Op.ne]: chapter.id,
          },
        },
      });

    if (existing) {
      throw new AppError(
        "Chapter number already exists in this module",
        409,
      );
    }

    await chapter.update({
      module_id: moduleId,
      chapter_number:
        chapterNumber,
      chapter_name: chapterName,
      content_type: contentType,
      content_url: contentUrl,
    });

    ok(
      res,
      chapter,
      "Chapter updated successfully",
    );
  });

export const deleteChapter =
  asyncHandler(async (req, res) => {
    const chapter =
      await Chapter.findByPk(
        req.params.id,
      );

    if (!chapter) {
      throw new AppError(
        "Chapter not found",
        404,
      );
    }

    const assignmentCount =
      await Assignment.count({
        where: {
          chapter_id: chapter.id,
        },
      });

    if (assignmentCount > 0) {
      throw new AppError(
        "Chapter cannot be deleted because assignments are linked to it",
        409,
      );
    }

    await chapter.destroy();

    ok(
      res,
      {},
      "Chapter deleted successfully",
    );
  });

/*
|--------------------------------------------------------------------------
| Assignment
|--------------------------------------------------------------------------
*/

export const listAssignments =
  asyncHandler(async (req, res) => {
    const {
      page,
      limit,
      offset,
    } = getPagination(req.query);

    const where = {};

    if (req.query.chapter_id) {
      where.chapter_id =
        req.query.chapter_id;
    }

    if (req.query.search) {
      where.question_text = {
        [Op.like]: `%${req.query.search.trim()}%`,
      };
    }

    const result =
      await Assignment.findAndCountAll({
        where,
        limit,
        offset,
        order: [["id", "DESC"]],
        distinct: true,
        include: [
          {
            model: Chapter,
            attributes: [
              "id",
              "chapter_number",
              "chapter_name",
            ],
            include: [
              {
                model: Module,
                attributes: [
                  "id",
                  "module_number",
                  "module_name",
                ],
                include: [
                  {
                    model: Domain,
                    attributes: [
                      "id",
                      "domain_name",
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

    ok(
      res,
      paginationResponse(
        result,
        page,
        limit,
      ),
    );
  });

export const getAssignmentById =
  asyncHandler(async (req, res) => {
    const assignment =
      await Assignment.findByPk(
        req.params.id,
        {
          include: [
            {
              model: Chapter,
              attributes: [
                "id",
                "chapter_number",
                "chapter_name",
              ],
              include: [
                {
                  model: Module,
                  attributes: [
                    "id",
                    "module_number",
                    "module_name",
                  ],
                  include: [
                    {
                      model: Domain,
                      attributes: [
                        "id",
                        "domain_name",
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      );

    if (!assignment) {
      throw new AppError(
        "Assignment not found",
        404,
      );
    }

    ok(res, assignment);
  });

export const createAssignment =
  asyncHandler(async (req, res) => {
    const { chapter_id } =
      req.body;

    const questionText =
      String(
        req.body.question_text || "",
      ).trim();

    if (!chapter_id) {
      throw new AppError(
        "Chapter is required",
        422,
      );
    }

    if (!questionText) {
      throw new AppError(
        "Question text is required",
        422,
      );
    }

    const chapter =
      await Chapter.findByPk(
        chapter_id,
      );

    if (!chapter) {
      throw new AppError(
        "Chapter not found",
        404,
      );
    }

    const assignment =
      await Assignment.create({
        chapter_id,
        question_text:
          questionText,
      });

    ok(
      res,
      assignment,
      "Assignment created successfully",
      201,
    );
  });

export const updateAssignment =
  asyncHandler(async (req, res) => {
    const assignment =
      await Assignment.findByPk(
        req.params.id,
      );

    if (!assignment) {
      throw new AppError(
        "Assignment not found",
        404,
      );
    }

    const chapterId =
      req.body.chapter_id ??
      assignment.chapter_id;

    const questionText =
      req.body.question_text !==
      undefined
        ? String(
            req.body.question_text,
          ).trim()
        : assignment.question_text;

    if (!questionText) {
      throw new AppError(
        "Question text is required",
        422,
      );
    }

    const chapter =
      await Chapter.findByPk(
        chapterId,
      );

    if (!chapter) {
      throw new AppError(
        "Chapter not found",
        404,
      );
    }

    await assignment.update({
      chapter_id: chapterId,
      question_text:
        questionText,
    });

    ok(
      res,
      assignment,
      "Assignment updated successfully",
    );
  });

export const deleteAssignment =
  asyncHandler(async (req, res) => {
    const assignment =
      await Assignment.findByPk(
        req.params.id,
      );

    if (!assignment) {
      throw new AppError(
        "Assignment not found",
        404,
      );
    }

    await assignment.destroy();

    ok(
      res,
      {},
      "Assignment deleted successfully",
    );
  });