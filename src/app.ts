import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./modules/auth/auth.router.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import userRoutes from "./modules/users/user.router.js";
import applicationRoutes from "./modules/applications/application.router.js";
import dashboardRoutes from "./modules/dashboard/dashboard.router.js";
import resumeRoutes from "./modules/resumes/resume.router.js";
import settingsRoutes from "./modules/settings/settings.router.js";

const app = express();

// CORS configuration for frontend integration
app.use(cors({
  origin: "http://localhost:5173", // Frontend development server
  credentials: true, // Allow cookies and credentials
}));

app.use(cookieParser());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/settings", settingsRoutes);
app.use(errorMiddleware);

export default app;
