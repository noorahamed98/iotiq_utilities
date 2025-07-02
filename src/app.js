// tracing MUST be the first import
import './utils/tracing.js'; // ✅ OTel must load before anything else

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
import { initLoggerMiddleware } from "./middlewares/loggerMiddleware.js";
import logRequests from "./middlewares/loggerMiddleware.js";
import tankDataRoutes from "./routes/tankDataRoute.js";
import { autoRefreshMiddleware } from "./middlewares/authMiddleware.js";
import setupRoutes from './routes/setupRoutes.js';
import { MongoClient } from "mongodb"; // ✅ Used for /logs route
import traceRoutes from "./routes/traceRoutes.js"; // ✅ Import trace routes

dotenv.config();

const app = express();

// Security headers
app.use(helmet());
app.set("trust proxy", 1);

// CORS setup
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "http://localhost:5000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Middleware stack
app.use(express.json());
app.use(cookieParser());
await initLoggerMiddleware(); // Add this before app.use(logRequests)
app.use(logRequests);

// Optional rate limiter
// const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
// app.use("/", apiLimiter);

// App routes
app.use("/", authRoutes);
app.use(autoRefreshMiddleware);
app.use("/", protectedRoutes);
app.use("/", controlRoutes);
app.use("/", userRoutes);
app.use("/", tankDataRoutes);
app.use("/", setupRoutes);
app.use('/api', traceRoutes); // This will mount all routes as defined (e.g., /api/logs, /traces)

// ✅ NEW: Serve logs from MongoDB for the dashboard
app.get("/logs", async (req, res) => {
  try {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    const logs = await client
      .db("test")
      .collection("applogs")
      .find({})
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    res.json(logs);
  } catch (err) {
    console.error("Error fetching logs:", err);
    res.status(500).send("Failed to fetch logs");
  }
});

// Global error handler
app.use(errorHandler);

export default app;
