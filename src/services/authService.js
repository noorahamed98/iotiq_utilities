import { findByMobileNumber, updateUser, create } from "../models/userModel.js";
import jwt from "jsonwebtoken";
import axios from "axios";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
dotenv.config();

// JWT configuration
const ACCESS_TOKEN_SECRET =
  process.env.ACCESS_TOKEN_SECRET ||
  process.env.JWT_SECRET ||
  "your-secret-key";
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || "your-refresh-secret-key";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";

// WhatsApp API credentials
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "";
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN || "";

/**
 * Generate access token
 * @param {Object} user - User object
 * @returns {String} JWT token
 */
export function generateAccessToken(user) {
  return jwt.sign(
    {
      mobile: user.mobile_number,
      user_id: user.id || user._id || user.mobile_number,
      jti: uuidv4(), // Add unique token ID
    },
    ACCESS_TOKEN_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    }
  );
}

/**
 * Generate refresh token
 * @param {Object} user - User object
 * @returns {String} JWT refresh token
 */
export function generateRefreshToken(user) {
  return jwt.sign(
    {
      mobile: user.mobile_number,
      user_id: user.id || user._id || user.mobile_number,
      jti: uuidv4(), // Add unique token ID
    },
    REFRESH_TOKEN_SECRET,
    {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    }
  );
}

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} Object containing both tokens and their expiry times
 */
export function generateTokens(user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Calculate expiry timestamps
  const accessTokenExpiry = new Date();
  const accessTokenDuration = ACCESS_TOKEN_EXPIRY.match(/(\d+)([smhd])/);
  const refreshTokenDuration = REFRESH_TOKEN_EXPIRY.match(/(\d+)([smhd])/);

  // Parse expiry duration
  if (accessTokenDuration) {
    const [, value, unit] = accessTokenDuration;
    const multiplier =
      unit === "s"
        ? 1
        : unit === "m"
        ? 60
        : unit === "h"
        ? 3600
        : unit === "d"
        ? 86400
        : 0;
    accessTokenExpiry.setSeconds(
      accessTokenExpiry.getSeconds() + parseInt(value) * multiplier
    );
  } else {
    // Default 15 minutes if format isn't recognized
    accessTokenExpiry.setMinutes(accessTokenExpiry.getMinutes() + 15);
  }

  const refreshTokenExpiry = new Date();
  if (refreshTokenDuration) {
    const [, value, unit] = refreshTokenDuration;
    const multiplier =
      unit === "s"
        ? 1
        : unit === "m"
        ? 60
        : unit === "h"
        ? 3600
        : unit === "d"
        ? 86400
        : 0;
    refreshTokenExpiry.setSeconds(
      refreshTokenExpiry.getSeconds() + parseInt(value) * multiplier
    );
  } else {
    // Default 7 days if format isn't recognized
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpiry,
    refreshTokenExpiry,
  };
}

/**
 * Verify a JWT access token
 * @param {String} token - Token to verify
 * @returns {Promise} Promise that resolves with decoded payload or rejects with error
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

/**
 * Verify a JWT refresh token
 * @param {String} token - Refresh token to verify
 * @returns {Promise} Promise that resolves with decoded payload or rejects with error
 */
export function verifyRefreshToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, REFRESH_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        reject(err);
        return;
      }

      // Check if token is blacklisted (implement this if needed)
      // const isBlacklisted = checkIfTokenIsBlacklisted(token);
      // if (isBlacklisted) {
      //   reject(new Error('Token has been revoked'));
      //   return;
      // }

      resolve(decoded);
    });
  });
}

/**
 * Refresh an access token using a valid refresh token
 * @param {String} refreshToken - Valid refresh token
 * @returns {Promise} Promise resolving to new access token data
 */
export async function refreshAccessToken(refreshToken) {
  try {
    // Verify the refresh token
    const decoded = await verifyRefreshToken(refreshToken);

    // Get the user from database
    const user = findByMobileNumber(decoded.mobile);

    if (!user) {
      throw new Error("User not found");
    }

    // Generate new access token
    const accessToken = generateAccessToken(user);

    // Calculate expiry timestamp
    const accessTokenExpiry = new Date();
    const accessTokenDuration = ACCESS_TOKEN_EXPIRY.match(/(\d+)([smhd])/);
    if (accessTokenDuration) {
      const [, value, unit] = accessTokenDuration;
      const multiplier =
        unit === "s"
          ? 1
          : unit === "m"
          ? 60
          : unit === "h"
          ? 3600
          : unit === "d"
          ? 86400
          : 0;
      accessTokenExpiry.setSeconds(
        accessTokenExpiry.getSeconds() + parseInt(value) * multiplier
      );
    } else {
      accessTokenExpiry.setMinutes(accessTokenExpiry.getMinutes() + 15); // Default
    }

    return {
      accessToken,
      accessTokenExpiry,
    };
  } catch (error) {
    throw error;
  }
}

// Generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via WhatsApp
async function sendWhatsAppOTP(phoneNumber, otp) {
  try {
    // Check if environment variables are defined
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      console.error("Missing environment variables:", {
        hasPhoneNumberId: !!PHONE_NUMBER_ID,
        hasAccessToken: !!ACCESS_TOKEN,
      });
      throw new Error("WhatsApp API credentials are missing");
    }

    console.log("Making API request to WhatsApp");

    // Add timeout to prevent infinite waiting
    const response = await axios({
      method: "POST",
      url: `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneNumber, // Use the parameter instead of hardcoded number
        type: "template",
        template: {
          name: "sending_otp",
          language: {
            code: "en_US",
          },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: otp,
                },
              ],
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [
                {
                  type: "text",
                  text: otp,
                },
              ],
            },
          ],
        },
      },
      timeout: 15000, // 15 seconds
    });

    return response.data;
  } catch (error) {
    console.log("Caught error in WhatsApp API call");

    // Check for timeout specifically
    if (error.code === "ECONNABORTED") {
      console.error("WhatsApp API request timed out after 15 seconds");
    } else {
      console.error("WhatsApp API error:");
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);

      // Safely log response data if it exists
      if (error.response) {
        console.error("Status:", error.response.status);
        console.error(
          "Error data:",
          JSON.stringify(error.response.data, null, 2)
        );
      } else {
        console.error("No response received from API");
      }

      console.error("Request details:", {
        url: `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
        phoneNumber,
        templateName: "sending_otp",
      });
    }

    return {
      success: false,
      error: error.message || "Failed to send OTP via WhatsApp",
    };
  }
}

export async function initiateSignIn(mobileNumber, countryCode = "+91") {
  try {
    // Find the user
    const user = findByMobileNumber(mobileNumber);

    // If user not found
    if (!user) {
      throw new Error("User not found");
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP in user's record with timestamp
    const otpRecord = {
      otp,
      created_at: new Date().toISOString(),
      is_verified: false,
    };

    // Add OTP to user's records
    user.otp_record = otpRecord;

    // Update user in the database
    updateUser(user);

    // Format phone number with country code if not already included
    const fullPhoneNumber = mobileNumber.startsWith("+")
      ? mobileNumber
      : `${countryCode}${mobileNumber}`;

    // Send OTP via WhatsApp
    await sendWhatsAppOTP(fullPhoneNumber, otp);

    return {
      success: true,
      message: "OTP sent to your WhatsApp number",
      mobile_number: mobileNumber,
    };
  } catch (error) {
    console.error("WhatsApp OTP sending failed:", error);
    return {
      success: false,
      message: "Failed to send OTP to your WhatsApp. Please try again later.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };
  }
}

// Verify OTP and complete sign-in (Step 2)
export function verifyOTP(mobileNumber, otpToVerify) {
  // Find the user
  const user = findByMobileNumber(mobileNumber);

  // If user not found
  if (!user) {
    throw new Error("User not found");
  }

  // Check if user has any OTPs
  if (!user.otp_record) {
    throw new Error("No OTP found for this user");
  }

  // Check if OTP is expired (15 minutes validity)
  const otpCreatedAt = new Date(user.otp_record.created_at);
  const now = new Date();
  const diffInMinutes = (now - otpCreatedAt) / (1000 * 60);

  if (diffInMinutes > 15) {
    throw new Error("OTP expired");
  }

  // Verify OTP
  if (user.otp_record.otp !== otpToVerify) {
    throw new Error("Incorrect OTP");
  }

  // Mark OTP as verified
  user.otp_record.is_verified = true;
  updateUser(user);

  // Generate tokens (both access and refresh tokens)
  const { accessToken, refreshToken, accessTokenExpiry, refreshTokenExpiry } =
    generateTokens(user);

  // Return user and tokens
  return {
    success: true,
    message: "Sign in successful",
    user: {
      user_name: user.user_name,
      mobile_number: user.mobile_number,
    },
    tokens: {
      accessToken,
      refreshToken,
      accessTokenExpiry,
      refreshTokenExpiry,
    },
  };
}

// Simple sign up function
export function signUp(userData) {
  // Create the user
  const newUser = create(userData);

  // Generate tokens (both access and refresh tokens)
  const { accessToken, refreshToken, accessTokenExpiry, refreshTokenExpiry } =
    generateTokens(newUser);

  // Return user and tokens
  return {
    success: true,
    user: newUser,
    tokens: {
      accessToken,
      refreshToken,
      accessTokenExpiry,
      refreshTokenExpiry,
    },
  };
}

/**
 * Invalidate a refresh token (for logout or security purposes)
 * @param {String} token - Refresh token to invalidate
 * @returns {Boolean} Success status
 */
export function invalidateToken(token) {
  // Implementation depends on your storage strategy
  // Here's a simple implementation that could be expanded

  // Option 1: Store in memory (not persistent, only for development)
  // global.tokenBlacklist = global.tokenBlacklist || [];
  // global.tokenBlacklist.push({
  //   token,
  //   expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  // });

  // Option 2: Store in database (you would implement this)
  // await db.refreshTokenBlacklist.create({
  //   token,
  //   blacklistedAt: new Date(),
  //   expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  // });

  return true;
}
