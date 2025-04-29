import logger from "../utils/logger.js";

const logRequests = (req, res, next) => {
  const start = Date.now();

  const { method, originalUrl, body } = req;

  logger.info(
    `Incoming Request: ${method} ${originalUrl} | Body: ${JSON.stringify(body)}`
  );

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(
      `Response: ${method} ${originalUrl} | Status: ${res.statusCode} | Time: ${duration}ms`
    );
  });

  next();
};

export default logRequests;
