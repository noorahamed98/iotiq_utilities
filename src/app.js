// src/app.js
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import protectedRoutes from "./routes/protectedRoutes.js";
import { errorHandler } from "./middlewares/errorMiddleware.js";
import logRequests from "./middlewares/loggerMiddleware.js";

dotenv.config();

// Initialize express
const app = express();

// Security headers
app.use(helmet());
app.set("trust proxy", 1);

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "http://localhost:5000",
    credentials: true, // Allow cookies to be sent with requests
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Request parsing
app.use(express.json());
app.use(cookieParser()); // Add cookie parser middleware
app.use(logRequests);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});
// app.use("/", apiLimiter);

// Routes
app.use("/", authRoutes);

app.use("/", protectedRoutes);

app.use("/", userRoutes)

// Error handling middleware (must be after routes)
app.use(errorHandler);

export default app;
