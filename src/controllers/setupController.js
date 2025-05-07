// src/controllers/setupController.js
import * as setupService from "../services/setupService.js";

/**
 * Create or update setup configuration for a space
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createOrUpdateSetup = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId } = req.params;
    const setupData = req.body;

    if (!spaceId) {
      return res.status(400).json({
        success: false,
        message: "Space ID is required",
      });
    }

    // Validate required fields
    if (!setupData.condition) {
      return res.status(400).json({
        success: false,
        message: "Condition is required",
      });
    }

    if (!setupData.condition.device_id) {
      return res.status(400).json({
        success: false,
        message: "Condition device ID is required",
      });
    }

    if (!setupData.condition.device_type) {
      return res.status(400).json({
        success: false,
        message: "Condition device type is required",
      });
    }

    if (
      !setupData.condition.actions ||
      !Array.isArray(setupData.condition.actions)
    ) {
      return res.status(400).json({
        success: false,
        message: "Actions array is required",
      });
    }

    // Validate each action
    for (const action of setupData.condition.actions) {
      if (!action.device_id) {
        return res.status(400).json({
          success: false,
          message: "Action device ID is required",
        });
      }

      if (!action.set_status) {
        return res.status(400).json({
          success: false,
          message: "Action set_status is required",
        });
      }
    }

    const setup = await setupService.createOrUpdateSetup(
      mobile_number,
      spaceId,
      setupData
    );

    return res.status(201).json({
      success: true,
      data: setup,
      message: "Setup created/updated successfully",
    });
  } catch (error) {
    // Determine appropriate status code based on error
    let statusCode = 500;
    if (
      error.message === "User not found" ||
      error.message === "Space not found" ||
      error.message.includes("not found in this space")
    ) {
      statusCode = 404;
    }
    if (
      error.message.includes("must be") ||
      error.message.includes("required")
    ) {
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get setup configuration for a space
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getSetup = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId } = req.params;

    if (!spaceId) {
      return res.status(400).json({
        success: false,
        message: "Space ID is required",
      });
    }

    const setup = await setupService.getSetup(mobile_number, spaceId);

    return res.status(200).json({
      success: true,
      data: setup,
    });
  } catch (error) {
    // Determine appropriate status code based on error
    let statusCode = 500;
    if (
      error.message === "User not found" ||
      error.message === "Space not found"
    ) {
      statusCode = 404;
    }

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};
