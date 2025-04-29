// src/controllers/homeController.js
import { getHomeData } from "../services/homeService.js";

/**
 * Controller for the home route
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function homeController(req, res) {
  try {
    // Get home data for the authenticated user
    // The user is guaranteed to exist due to the authentication middleware
    const homeData = await getHomeData(req.user);

    return res.json({
      success: true,
      data: homeData,
      user: {
        mobile_number: req.user.mobile_number,
      },
    });
  } catch (error) {
    console.error("Home controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch home data",
      code: "HOME_DATA_ERROR",
    });
  }
}

/**
 * Controller for the profile route
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function profileController(req, res) {
  try {
    // Example profile data - in a real app, this would come from a database
    return res.json({
      success: true,
      profile: {
        mobile_number: req.user.mobile_number,
        // Add other profile data here
        last_active: new Date().toISOString(),
        account_type: "standard",
      },
    });
  } catch (error) {
    console.error("Profile controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile data",
      code: "PROFILE_DATA_ERROR",
    });
  }
}
