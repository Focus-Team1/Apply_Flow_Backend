import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { errorCodes } from '../../constants/response.constants.js';
import { AppException } from '../settings/common/exceptions/app.exception.js';
import { ResumeService } from './resume.service.js';

export class ResumeController {
  private readonly resumeService: ResumeService;

  constructor() {
    this.resumeService = new ResumeService();
  }

  listResumes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { page, limit } = req.query;

      const result = await this.resumeService.listResumes(userId!, Number(page), Number(limit));

      res.status(200).json({
        message: 'Resumes fetched successfully',
        data: result.resumes,
        pagination: result.pagination,
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { id } = req.params as { id: string };

      const resume = await this.resumeService.getResumeById(userId!, id);

      res.status(200).json({ message: 'Resume fetched successfully', data: resume });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getResumeFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { id } = req.params as { id: string };
      const filePath = await this.resumeService.getResumeFilePath(userId!, id);

      res.setHeader('Cache-Control', 'private, no-store');

      if (req.query.download === 'true') {
        res.download(filePath, (error) => {
          if (error) {
            this.handleFileError(error, res, next);
          }
        });
        return;
      }

      res.sendFile(filePath, (error) => {
        if (error) {
          this.handleFileError(error, res, next);
        }
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  uploadResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const name = req.body?.name;

      if (!req.file) {
        throw new AppException('No file uploaded', 400);
      }

      const resume = await this.resumeService.createResume(userId!, {
        name: name || 'Resume',
        originalFileName: req.file.originalname,
        generatedFileName: req.file.filename,
        mimeType: req.file.mimetype,
      });

      res.status(201).json({ message: 'Resume uploaded successfully', data: resume });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  updateResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { id } = req.params as { id: string };
      const { name } = req.body;

      const updated = await this.resumeService.updateResumeName(userId!, id, name);

      res.status(200).json({ message: 'Resume updated successfully', data: updated });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  deleteResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { id } = req.params as { id: string };

      await this.resumeService.deleteResume(userId!, id);

      res.status(200).json({ message: 'Resume deleted successfully' });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  private handleFileError(error: Error, res: Response, next: NextFunction): void {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      this.handleError(new AppException('Resume file not found', 404), res, next);
      return;
    }

    this.handleError(error, res, next);
  }

  handleError = (error: unknown, res: Response, next: NextFunction): void => {
    if (error instanceof ZodError) {
      res.status(400).json({ message: 'Validation failed', errors: (error as any).errors });
      return;
    }
    if (error instanceof AppException) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        errorCode:
          error.statusCode === 404
            ? errorCodes.notFound
            : error.statusCode === 400
              ? errorCodes.badRequest
              : errorCodes.serverError,
        errors: [],
        data: null,
      });
      return;
    }
    next(error);
  };
}
