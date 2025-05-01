// src/routes/protectedRoutes.js
import express from "express";
import {
  verifyAccessToken,
  refreshAccessToken,
  verifyRefreshToken,
} from "../services/authService.js";
import * as spaceController from "../controllers/spaceController.js";
import * as deviceController from "../controllers/deviceController.js";

const router = express.Router();

/**
 * Universal authentication middleware that handles multiple authentication methods:
 * 1. Access token in Authorization header
 * 2. Access token in cookie
 * 3. Refresh token in cookie or body (with auto-refresh)
 */
const universalAuth = async (req, res, next) => {
  try {
    // Try to authenticate with access token first
    let accessToken = null;
    let refreshToken = null;
    let isAuthenticated = false;
    let user = null;

    // 1. Check for access token in Authorization header
    const authHeader = req.headers["authorization"];
    if (authHeader) {
      const parts = authHeader.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer") {
        accessToken = parts[1];
      }
    }

    // 2. Check for access token in cookies if not found in header
    if (!accessToken && req.cookies && req.cookies.accessToken) {
      accessToken = req.cookies.accessToken;
    }

    // 3. Check for refresh token - safely check if properties exist
    if (req.cookies && req.cookies.refreshToken) {
      refreshToken = req.cookies.refreshToken;
    } else if (req.body && req.body.refreshToken) {
      refreshToken = req.body.refreshToken;
    }

    // Try to authenticate with access token
    if (accessToken) {
      try {
        const decoded = await verifyAccessToken(accessToken);
        user = {
          mobile_number: decoded.mobile,
          user_id: decoded.user_id,
        };
        isAuthenticated = true;
      } catch (tokenError) {
        // Access token invalid or expired, will try refresh token next
        console.log("Access token validation failed:", tokenError.message);
      }
    }

    // If access token failed but refresh token exists, try to refresh
    if (!isAuthenticated && refreshToken) {
      try {
        // Verify refresh token first
        const decoded = await verifyRefreshToken(refreshToken);

        // Get user data from decoded token
        user = {
          mobile_number: decoded.mobile,
          user_id: decoded.user_id,
        };

        // Generate new access token
        const { accessToken: newAccessToken, accessTokenExpiry } =
          await refreshAccessToken(refreshToken);

        // Set new access token cookie
        res.cookie("accessToken", newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          expires: accessTokenExpiry,
        });

        // Also send new token in header for API clients
        res.setHeader("X-New-Access-Token", newAccessToken);

        isAuthenticated = true;
      } catch (refreshError) {
        console.log("Refresh token validation failed:", refreshError.message);
      }
    }

    // Final authentication check
    if (isAuthenticated && user) {
      req.user = user;
      next();
    } else {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED",
      });
    }
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      code: "SERVER_ERROR",
    });
  }
};

// Space routes
// -------------
// Get all spaces for the authenticated user
router.get("/spaces", universalAuth, spaceController.getAllSpaces);

// Get a specific space by ID
router.get("/spaces/:spaceId", universalAuth, spaceController.getSpaceById);

// Create a new space
router.post("/spaces", universalAuth, spaceController.createSpace);

// Update a space
router.put("/spaces/:spaceId", universalAuth, spaceController.updateSpace);

// Delete a space
router.delete("/spaces/:spaceId", universalAuth, spaceController.deleteSpace);

// Device routes
// -------------
// Get all devices in a space
router.get(
  "/spaces/:spaceId/devices",
  universalAuth,
  deviceController.getAllDevices
);

// Get a specific device in a space
router.get(
  "/spaces/:spaceId/devices/:deviceId",
  universalAuth,
  deviceController.getDeviceById
);

// Add a new device to a space
router.post(
  "/spaces/:spaceId/devices",
  universalAuth,
  deviceController.addDevice
);

// Delete a device from a space
router.delete(
  "/spaces/:spaceId/devices/:deviceId",
  universalAuth,
  deviceController.deleteDevice
);

export default router;
