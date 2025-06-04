import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import protectedRoutes from "./routes/protectedRoutes.js";
import controlRoutes from "./routes/controlRoute.js";
import { errorHandler } from "./middlewares/errorMiddleware.js";
import logRequests from "./middlewares/loggerMiddleware.js";
import tankDataRoutes from "./routes/tankDataRoute.js";
import { autoRefreshMiddleware } from "./middlewares/authMiddleware.js";
import setupRoutes from './routes/setupRoutes.js';

dotenv.config();

const app = express();

app.use(helmet());
app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "http://localhost:5000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(cookieParser());
app.use(logRequests);

// Rate limiter (optional)
// const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
// app.use("/", apiLimiter);

app.use("/", authRoutes);
app.use(autoRefreshMiddleware); // Middleware to refresh auth token
app.use("/", protectedRoutes);
app.use("/", controlRoutes);
app.use("/", userRoutes);
app.use("/", tankDataRoutes);
app.use('/', setupRoutes);  // Remove the '/api' prefix

app.use(errorHandler);

export default app;

