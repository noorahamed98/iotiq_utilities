import { verifyAccessToken } from "../utils/jwtHelper.js";

/**
 * Middleware to authenticate users via JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const [bearer, token] = authHeader.split(" ");

    if (bearer !== "Bearer" || !token) {
      return res.status(401).json({ message: "Invalid authorization format" });
    }

    verifyAccessToken(token)
      .then((decoded) => {
        req.user = { username: decoded.sub };
        next();
      })
      .catch((err) => {
        if (err.name === "TokenExpiredError") {
          return res.status(401).json({ message: "Token expired" });
        }
        return res.status(403).json({ message: "Invalid token" });
      });
  } catch (error) {
    next(error);
  }
}
