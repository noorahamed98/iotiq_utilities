// src/utils/jwtHelper.js
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import {
  ACCESS_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRY,
} from "../config/serverConfig.js";

/**
 * Generate a new access token
 * @param {Object} user - User object containing mobile_number
 * @returns {String} JWT access token
 */
export function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.mobile_number, jti: uuidv4() },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Verify an access token
 * @param {String} token - JWT access token to verify
 * @returns {Promise} Resolves with decoded payload or rejects with error
 */
export function verifyAccessToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(decoded);
    });
  });
}
