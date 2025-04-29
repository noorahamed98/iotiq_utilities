// src/services/homeService.js

/**
 * Get home page data for authenticated user
 * @param {Object} user - User object from authentication middleware
 * @returns {Object} Home page data
 */
export function getHomeData(user) {
  try {
    // In a real application, you would fetch user-specific data from database
    // For demonstration, returning sample data
    return {
      welcomeMessage: `Welcome back, ${user.mobile_number}!`,
      lastLogin: new Date().toISOString(),
      recommendedItems: [
        { id: 1, title: "Recommended item 1" },
        { id: 2, title: "Recommended item 2" },
        { id: 3, title: "Recommended item 3" },
      ],
      notifications: [
        {
          id: 101,
          message: "You have a new message",
          timestamp: new Date().toISOString(),
        },
        {
          id: 102,
          message: "Your account was accessed from a new device",
          timestamp: new Date().toISOString(),
        },
      ],
    };
  } catch (error) {
    console.error("Error fetching home data:", error);
    throw new Error("Failed to fetch home data");
  }
}
