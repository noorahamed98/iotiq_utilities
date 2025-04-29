// src/controllers/authController.js
import { signUp } from "../services/authService.js";

import { initiateSignIn, verifyOTP } from "../services/authService.js";

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
