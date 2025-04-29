// src/app.js
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/authRoutes.js";
import { errorHandler } from "./middlewares/errorMiddleware.js";

// Initialize express
const app = express();

// Security headers
app.use(helmet());
app.set("trust proxy", 1);
// Request parsing
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/", apiLimiter);

// Routes
app.use("/", authRoutes);

// Error handling middleware (must be after routes)
app.use(errorHandler);

export default app;
