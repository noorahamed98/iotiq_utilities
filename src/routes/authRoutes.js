// src/routes/authRoutes.js
import express from "express";
import {
  signup,
  signinInitiate,
  signinVerifyOTP,
  refreshToken,
  logout,
} from "../controllers/authController.js";
import { refreshTokenMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Authentication endpoints
router.post("/signin", signinInitiate);
router.post("/signin/otp", signinVerifyOTP);
router.post("/signup", signup);

// Token refresh endpoint
router.post("/refresh-token", refreshTokenMiddleware, refreshToken);

// Logout endpoint
router.post("/logout", logout);

export default router;
