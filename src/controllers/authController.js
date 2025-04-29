// src/controllers/authController.js
import {
  signUp,
  initiateSignIn,
  verifyOTP,
  refreshAccessToken,
  invalidateToken,
} from "../services/authService.js";

// Part 1: Initiate sign-in and send OTP via WhatsApp
export async function signinInitiate(req, res) {
  console.log("Function Called Initiatesignin", req.body);
  try {
    const { mobile_number, country_code } = req.body;

    if (!mobile_number) {
      return res
        .status(400)
        .json({ success: false, message: "Mobile number is required" });
    }

    const result = await initiateSignIn(mobile_number, country_code || "+91");
    return res.json(result);
  } catch (error) {
    if (error.message === "User not found") {
      return res.status(404).json({
        success: false,
        message: "User not found. Please sign up first.",
        code: "USER_NOT_FOUND",
      });
    }

    if (error.message === "Failed to send OTP via WhatsApp") {
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP. Please try again later.",
        code: "OTP_SEND_FAILED",
      });
    }

    console.error("Sign-in initiation error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
}

// Part 2: Verify OTP and complete sign-in
export function signinVerifyOTP(req, res) {
  try {
    const { mobile_number, otp } = req.body;

    if (!mobile_number) {
      return res
        .status(400)
        .json({ success: false, message: "Mobile number is required" });
    }

    if (!otp) {
      return res
        .status(400)
        .json({ success: false, message: "OTP is required" });
    }

    const result = verifyOTP(mobile_number, otp);

    // Set cookies for both tokens if verification successful
    if (result.success && result.tokens) {
      const {
        accessToken,
        refreshToken,
        accessTokenExpiry,
        refreshTokenExpiry,
      } = result.tokens;

      // Set HTTP-only cookies
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        expires: accessTokenExpiry,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        expires: refreshTokenExpiry,
        path: "/refresh-token", // Restrict to refresh token endpoint
      });
    }

    return res.json(result);
  } catch (error) {
    if (error.message === "User not found") {
      return res.status(404).json({
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    if (error.message === "No OTP found for this user") {
      return res.status(400).json({
        success: false,
        message: "Please request an OTP first",
        code: "NO_OTP_FOUND",
      });
    }

    if (error.message === "OTP expired") {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one",
        code: "OTP_EXPIRED",
      });
    }

    if (error.message === "Incorrect OTP") {
      return res.status(400).json({
        success: false,
        message: "Incorrect OTP. Please try again",
        code: "INCORRECT_OTP",
      });
    }

    console.error("OTP verification error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
}

// Handle sign up request
export function signup(req, res) {
  try {
    const { user_name, mobile_number, location } = req.body;

    if (!user_name || !mobile_number) {
      return res.status(400).json({
        success: false,
        message: "Username and mobile number are required",
      });
    }

    const result = signUp({ user_name, mobile_number, location });

    // Set token cookies if signup successful
    if (result.success && result.tokens) {
      const {
        accessToken,
        refreshToken,
        accessTokenExpiry,
        refreshTokenExpiry,
      } = result.tokens;

      // Set HTTP-only cookies
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        expires: accessTokenExpiry,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        expires: refreshTokenExpiry,
        path: "/refresh-token", // Restrict to refresh token endpoint
      });
    }

    return res.status(201).json(result);
  } catch (error) {
    if (error.message === "User already exists") {
      return res.status(409).json({ success: false, message: error.message });
    }

    console.error("Signup error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
}

/**
 * Handle token refresh
 * To be used with refreshTokenMiddleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function refreshToken(req, res) {
  try {
    // Get refresh token from cookie or request body
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is required",
        code: "REFRESH_TOKEN_REQUIRED",
      });
    }

    // Refresh the access token
    const { accessToken, accessTokenExpiry } = await refreshAccessToken(
      refreshToken
    );

    // Set the new access token as a cookie
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      expires: accessTokenExpiry,
    });

    // Return the new access token
    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      accessToken,
      accessTokenExpiry,
    });
  } catch (error) {
    console.error("Token refresh error:", error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Refresh token has expired, please login again",
        code: "REFRESH_TOKEN_EXPIRED",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
        code: "INVALID_REFRESH_TOKEN",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to refresh token",
      code: "TOKEN_REFRESH_FAILED",
    });
  }
}

/**
 * Handle user logout
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export function logout(req, res) {
  try {
    // Get refresh token from cookie or request body
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    // Invalidate the refresh token if one was provided
    if (refreshToken) {
      invalidateToken(refreshToken);
    }

    // Clear cookies regardless
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken", { path: "/refresh-token" });

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during logout",
    });
  }
}
