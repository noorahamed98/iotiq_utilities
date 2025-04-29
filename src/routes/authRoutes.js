// src/routes/authRoutes.js
import express from "express";
import { signup } from "../controllers/authController.js";
import {
  signinInitiate,
  signinVerifyOTP,
} from "../controllers/authController.js";

const router = express.Router();

router.post("/signIn", signinInitiate);
router.post("/signIn/otp", signinVerifyOTP);
router.post("/signup", signup);

export default router;
