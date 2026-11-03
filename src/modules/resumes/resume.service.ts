import fs from 'fs/promises';
import path from 'path';
import { Resume } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { UPLOAD_DIR } from '../../config/upload.config.js';
import { AppException } from '../settings/common/exceptions/app.exception.js';

const getResumeFilePath = (fileUrl: string): string => {
  const prefix = '/uploads/';
  const filename = fileUrl.startsWith(prefix) ? fileUrl.slice(prefix.length) : '';

  if (
    !filename ||
    filename.includes('/') ||
    filename.includes('\\') ||
    path.basename(filename) !== filename
  ) {
    throw new AppException('Resume file not found', 404);
  }

  const filePath = path.resolve(UPLOAD_DIR, filename);
  if (!filePath.startsWith(`${UPLOAD_DIR}${path.sep}`)) {
    throw new AppException('Resume file not found', 404);
  }

  return filePath;
};

const cleanupUploadedFile = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[ResumeService] Failed to clean up uploaded resume.', error);
    }
  }
};

const withProtectedFileUrl = (resume: Resume): Resume => ({
  ...resume,
  fileUrl: `/resumes/${resume.id}/file`,
});

export class ResumeService {
  async listResumes(userId: string, page: number = 1, limit: number = 10): Promise<any> {
    const skip = (page - 1) * limit;

    const [resumes, total] = await Promise.all([
      prisma.resume.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.resume.count({ where: { userId } }),
    ]);

    return {
      resumes: resumes.map(withProtectedFileUrl),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async getResumeById(userId: string, resumeId: string): Promise<Resume> {
    const resume = await prisma.resume.findFirst({
      where: { id: resumeId, userId },
    });

    if (!resume) {
      throw new AppException('Resume not found', 404);
    }

    return withProtectedFileUrl(resume);
  }

  async getResumeFilePath(userId: string, resumeId: string): Promise<string> {
    const resume = await prisma.resume.findFirst({
      where: { id: resumeId, userId },
    });

    if (!resume) {
      throw new AppException('Resume not found', 404);
    }

    const filePath = getResumeFilePath(resume.fileUrl);
    try {
      await fs.access(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppException('Resume file not found', 404);
      }
      throw error;
    }

    return filePath;
  }

  async createResume(userId: string, input: any): Promise<Resume> {
    const filename = input.generatedFileName;
    const fileUrl = `/uploads/${filename}`;
    const filePath = getResumeFilePath(fileUrl);
    const file = await fs.open(filePath, 'r');
    const header = Buffer.alloc(1024);
    let bytesRead = 0;
    try {
      ({ bytesRead } = await file.read(header, 0, header.length, 0));
    } finally {
      await file.close();
    }

    if (!header.subarray(0, bytesRead).includes(Buffer.from('%PDF-'))) {
      await cleanupUploadedFile(filePath);
      throw new AppException('Uploaded file is not a valid PDF', 400);
    }

    try {
      const resume = await prisma.resume.create({
        data: {
          userId,
          name: input.name,
          fileName: input.originalFileName,
          fileType: input.mimeType,
          fileUrl,
        },
      });
      return withProtectedFileUrl(resume);
    } catch (error) {
      console.error('[ResumeService] Failed to create resume record.', error);
      await cleanupUploadedFile(filePath);
      throw new AppException('Failed to save resume', 500);
    }
  }

  async updateResumeName(userId: string, resumeId: string, name: string): Promise<Resume> {
    const existing = await prisma.resume.findFirst({
      where: { id: resumeId, userId },
    });

    if (!existing) {
      throw new AppException('Resume not found', 404);
    }

    const updated = await prisma.resume.update({
      where: { id: resumeId },
      data: { name },
    });
    return withProtectedFileUrl(updated);
  }

  async deleteResume(userId: string, resumeId: string): Promise<void> {
    const resume = await prisma.resume.findFirst({
      where: { id: resumeId, userId },
    });

    if (!resume) {
      throw new AppException('Resume not found', 404);
    }

    const filePath = getResumeFilePath(resume.fileUrl);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[ResumeService] Failed to delete resume file.', error);
        throw new AppException('Failed to delete resume file', 500);
      }
    }

    await prisma.resume.delete({ where: { id: resumeId } });
  }
}
