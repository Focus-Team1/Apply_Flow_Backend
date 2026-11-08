
import { Request } from "express";
import { Prisma } from "@prisma/client";

import { prisma } from "../../config/database.config.js";
import { statusCodes,Message,errorCodes } from "../../constants/response.constants.js";
import customErrors from "../../utils/exception.utils.js";

import {
  createApplicationSchema,
  updateApplicationSchema,
  updateApplicationStatusSchema,
  applicationFiltersSchema,
  applicationIdParamsSchema,
  addNoteSchema,
} from "./application.schema.js";

const verifyResumeOwnership = async (
  resumeId: string | null | undefined,
  userId: string
) => {
  if (!resumeId) return;

  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    select: { id: true },
  });

  if (!resume) {
    throw new customErrors(
      statusCodes.notFound,
      Message.resumeNotFound,
      errorCodes.resumeNotFound
    );
  }
};
export const createApplication = async (req: Request) => {
  if (!req.user?.userId) {
    throw new customErrors(
      statusCodes.unauthorized,
      Message.unauthorized,
      errorCodes.unauthorized
    );
  }

  const userId = req.user.userId;
  const data = createApplicationSchema.parse(req.body);

  await verifyResumeOwnership(data.resumeId, userId);

  const { notes, ...applicationData } = data;

  const application = await prisma.application.create({
    data: {
      ...applicationData,
      Notes: notes,
      userId,
      statusHistory: {
        create: { status: data.status },
      },
    },
    include: {
      resume: true,
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });

  return {
    statusCode: statusCodes.created,
    message: "Job application created successfully",
    data: application,
  };
};

export const getApplications = async (req: Request) => {
  const filters = applicationFiltersSchema.parse(req.query);
  const userId = req.user.userId;
  const { search, company, location, jobType, status, fromDate, toDate,
    page, limit } = filters;

  const where: Prisma.ApplicationWhereInput = {
    userId,
    ...(company && {
      company: { contains: company, mode: "insensitive" },
    }),
    ...(location && {
      location: { contains: location, mode: "insensitive" },
    }),
    ...(jobType && { jobType }),
    ...(status && { status }),
    ...((fromDate || toDate) && {
      applicationDate: {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      },
    }),
    ...(search && {
      OR: [
        { company: { contains: search, mode: "insensitive" } },
        { jobTitle: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [applications, total] = await prisma.$transaction([
    prisma.application.findMany({
      where,
      include: { resume: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.application.count({ where }),
  ]);

  return {
    statusCode: statusCodes.ok,
    message: "Applications retrieved successfully",
    data: {
      applications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  };
};

export const getApplicationById = async (req: Request) => {
  const application = await prisma.application.findFirst({
    where: {
      id: req.params.id as string,
      userId: req.user.userId,
    },
    include: {
      resume: true,
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!application) throw new customErrors(
    statusCodes.notFound,
    Message.applicationNotFound,
    errorCodes.applicationNotFound
  );

  return {
    statusCode: statusCodes.ok,
    message: "Application retrieved successfully",
    data: application,
  };
};

export const updateApplication = async (req: Request) => {
  const data = updateApplicationSchema.parse(req.body);
  const { notes, ...applicationData } = data;
  const userId = req.user.userId;
  const id  = req.params.id as string;

  const existing = await prisma.application.findFirst({
    
    where: { id , userId },
  });

  if (!existing) throw new customErrors(
    statusCodes.notFound,
    Message.applicationNotFound,
    errorCodes.applicationNotFound
  );

  await verifyResumeOwnership(data.resumeId, userId);

  const minSalary =
    data.minSalary === undefined ? existing.minSalary : data.minSalary;
  const maxSalary =
    data.maxSalary === undefined ? existing.maxSalary : data.maxSalary;

  if (
    minSalary != null &&
    maxSalary != null &&
    Number(maxSalary) < Number(minSalary)
  ) {
    throw new customErrors(
      statusCodes.badRequest,
      "Maximum salary must be greater than or equal to minimum salary",
      "INVALID_SALARY_RANGE"
    );
  }

  const application = await prisma.application.update({
    where: { id },
    data: {
      ...applicationData,
      ...(notes !== undefined && { Notes: notes }),
    },
    include: { resume: true },
  });

  return {
    statusCode: statusCodes.ok,
    message: "Application updated successfully",
    data: application,
  };
};

export const deleteApplication = async (req: Request) => {
  const result = await prisma.application.deleteMany({
    where: {
      id: req.params.id as string,
      userId: req.user.userId,
    },
  });

  if (result.count === 0) throw new customErrors(
    statusCodes.notFound,
    Message.applicationNotFound,
    errorCodes.applicationNotFound
  );

  return {
    statusCode: statusCodes.ok,
    message: "Application deleted successfully",
    data:{}
  };
};

export const updateApplicationStatus = async (req: Request) => {
  const { status } = updateApplicationStatusSchema.parse(req.body);
  const id = req.params.id as string;
  const userId = req.user.userId;

  const existing = await prisma.application.findFirst({
    where: { id, userId },
    select: { id: true, status: true },
  });

  if (!existing) throw new customErrors(
    statusCodes.notFound,
    Message.applicationNotFound,
    errorCodes.applicationNotFound
  );

  if (existing.status === status) {
    return {
      statusCode: statusCodes.ok,
      message: "Application already has this status",
      data: { id: existing.id, status: existing.status },
    };
  }

  const application = await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id },
      data: { status },
    });

    await tx.applicationStatusHistory.create({
      data: {
        applicationId: id,
        status,
      },
    });

    return tx.application.findUniqueOrThrow({
      where: { id },
      include: {
        statusHistory: { orderBy: { createdAt: "desc" } },
      },
    });
  });

  return {
    statusCode: statusCodes.ok,
    message: "Application status updated successfully",
    data: application,
  };
};

export const addNote = async (req: Request) => {
  const userId = req.user.userId;
  const id = req.params.id as string;
  const data = addNoteSchema.parse(req.body);
  const { note } = data;

  const existing = await prisma.application.findFirst({
    where: { id, userId },
    select: { id: true, Notes: true },
  });

  if (!existing) throw new customErrors(
    statusCodes.notFound,
    Message.applicationNotFound,
    errorCodes.applicationNotFound
  );

  const updatedNotes = note.trim();

  const application = await prisma.application.update({
    where: { id },
    data: { Notes: updatedNotes },
    include: {
      resume: true,
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });

  return {
    statusCode: statusCodes.ok,
    message: "Note added to application successfully",
    data: application,
  };
};
