import logger from "../utils/logger.js";
import { MongoClient } from "mongodb";

let collection;

export async function initLoggerMiddleware() {
  const client = new MongoClient(process.env.MONGO_URI, { useUnifiedTopology: true });
  await client.connect();
  collection = client.db("test").collection("applogs");
}

const logRequests = (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl, body } = req;

  // Log incoming request
  const requestLog = {
    timestamp: new Date(),
    level: "info",
    message: `Incoming Request: ${method} ${originalUrl} | Body: ${JSON.stringify(body)}`,
    meta: { method, path: originalUrl, body },
  };
  if (collection) {
    collection.insertOne(requestLog).catch(err => {
      console.error("❌ Failed to log request:", err.message);
    });
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    const responseLog = {
      timestamp: new Date(),
      level: "info",
      message: `Response: ${method} ${originalUrl} | Status: ${res.statusCode} | Time: ${duration}ms`,
      meta: { method, path: originalUrl, status: res.statusCode, duration },
    };
    if (collection) {
      collection.insertOne(responseLog).catch(err => {
        console.error("❌ Failed to log response:", err.message);
      });
    }
  });

  next();
};

export default logRequests;
