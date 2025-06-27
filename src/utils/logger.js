import winston from "winston";
import path from "path";
import dotenv from "dotenv";
import { context, trace } from '@opentelemetry/api';
import 'winston-mongodb';

dotenv.config(); // Load environment variables

// Set your MongoDB connection URI from .env
const mongoUri = process.env.MONGO_URI;
const logFilePath = path.join("logs", "server.log");

// Get current OpenTelemetry trace context
function getTraceInfo() {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

// Winston logger instance
const logger = winston.createLogger({
  level: "info",

  // Format for Console and File
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const traceMeta = getTraceInfo();
      const combined = { ...meta, ...traceMeta };
      return `[${timestamp}] ${level.toUpperCase()}: ${message} ${JSON.stringify(combined)}`;
    })
  ),

  transports: [
    // Console
    new winston.transports.Console(),

    // File
    new winston.transports.File({ filename: logFilePath }),

    // MongoDB
    new winston.transports.MongoDB({
      db: mongoUri,
      collection: 'applogs',
      level: 'info',
      tryReconnect: true,
      options: { useUnifiedTopology: true },
      metaKey: 'meta',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
      )
    }),
  ],
});

// Optional: log internal Winston transport errors
logger.on('error', (err) => {
  console.error('❌ Winston internal error:', err);
});

export default logger;
