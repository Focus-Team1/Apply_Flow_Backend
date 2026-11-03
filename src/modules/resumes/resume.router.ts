import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { uploadSingleFile } from '../../middlewares/upload.middleware.js';
import { ResumeController } from './resume.controller.js';

const router: Router = Router();
const resumeController = new ResumeController();

router.use(authMiddleware);

router.get('/', resumeController.listResumes);
router.get('/:id/file', resumeController.getResumeFile);
router.get('/:id', resumeController.getResume);
router.post('/', uploadSingleFile, resumeController.uploadResume);
router.patch('/:id', resumeController.updateResume);
router.delete('/:id', resumeController.deleteResume);

export default router;
