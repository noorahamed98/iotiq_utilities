// src/routes/authRoutes.js
import express from "express";
import {
  signupInitiate,
  signupVerifyOTP,
  signinInitiate,
  signinVerifyOTP,
  refreshToken,
  logout,
} from "../controllers/authController.js";
import { refreshTokenMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Authentication endpoints - Sign In
router.post("/signin", signinInitiate);
router.post("/signin/otp", signinVerifyOTP);

// Authentication endpoints - Sign Up (new two-step process)
router.post("/signup", signupInitiate);
router.post("/signup/otp", signupVerifyOTP);

// Token refresh endpoint
router.post("/refresh-token", refreshTokenMiddleware, refreshToken);

// Logout endpoint
router.post("/logout", logout);

export default router;
