import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import CustomError from '../utils/exception.utils.js';
import { errorCodes, statusCodes } from '../constants/response.constants.js';
import { UPLOAD_DIR } from '../config/upload.config.js';

// Configure storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

// File filter - only allow PDF files
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['application/pdf'];

  if (
    allowedMimes.includes(file.mimetype) &&
    path.extname(file.originalname).toLowerCase() === '.pdf'
  ) {
    cb(null, true);
  } else {
    cb(new CustomError(statusCodes.badRequest, 'Only PDF files are allowed', errorCodes.badRequest));
  }
};

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Middleware for single file upload
export const uploadSingleFile = upload.single('file');
