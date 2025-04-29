import { findByMobileNumber, updateUser } from "../models/userModel.js";
import jwt from "jsonwebtoken";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// Secret for JWT
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
// WhatsApp API credentials
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "";
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN || "";

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

  // Generate JWT token
  const token = jwt.sign(
    {
      mobile: mobileNumber,
      user_id: user.id || user._id || mobileNumber, // Fallback to mobile if no ID
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );

  // Return user and token
  return {
    success: true,
    message: "Sign in successful",
    user: {
      user_name: user.user_name,
      mobile_number: user.mobile_number,
      country_code: user.country_code,
      mail: user.mail,
      location: user.location,
    },
    token,
  };
}

// Simple sign up function
export function signUp(userData) {
  // Create the user
  const newUser = create(userData);

  // Generate a token
  const token = jwt.sign({ mobile: newUser.mobile_number }, JWT_SECRET, {
    expiresIn: "7d",
  });

  // Return user and token
  return {
    success: true,
    user: newUser,
    token,
  };
}
