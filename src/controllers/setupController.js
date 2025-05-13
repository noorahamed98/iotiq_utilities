// src/controllers/setupController.js
import * as setupService from "../services/setupService.js";

/**
 * Create a new setup configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createSetup = async (req, res) => {
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

    // For tank devices, validate level
    if (setupData.condition.device_type === "tank") {
      if (setupData.condition.level === undefined) {
        return res.status(400).json({
          success: false,
          message: "Level is required for tank devices",
        });
      }

      if (!setupData.condition.operator) {
        return res.status(400).json({
          success: false,
          message: "Operator is required for tank devices",
        });
      }
    }

    // For base devices, validate status
    if (
      setupData.condition.device_type === "base" &&
      !setupData.condition.status
    ) {
      return res.status(400).json({
        success: false,
        message: "Status is required for base devices",
      });
    }

    if (
      !setupData.condition.actions ||
      !Array.isArray(setupData.condition.actions) ||
      setupData.condition.actions.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "At least one action is required",
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

    const setup = await setupService.createSetup(
      mobile_number,
      spaceId,
      setupData
    );

    return res.status(201).json({
      success: true,
      data: setup,
      message: "Setup created successfully",
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
      error.message.includes("required") ||
      error.message.includes("between 0 and 100") ||
      error.message.includes("type mismatch")
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
 * Get all setups for a space
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getSetups = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId } = req.params;

    if (!spaceId) {
      return res.status(400).json({
        success: false,
        message: "Space ID is required",
      });
    }

    const setups = await setupService.getSetups(mobile_number, spaceId);

    return res.status(200).json({
      success: true,
      data: setups,
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

/**
 * Get a setup by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getSetupById = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId, setupId } = req.params;

    if (!spaceId || !setupId) {
      return res.status(400).json({
        success: false,
        message: "Space ID and Setup ID are required",
      });
    }

    const setup = await setupService.getSetupById(
      mobile_number,
      spaceId,
      setupId
    );

    return res.status(200).json({
      success: true,
      data: setup,
    });
  } catch (error) {
    // Determine appropriate status code based on error
    let statusCode = 500;
    if (
      error.message === "User not found" ||
      error.message === "Space not found" ||
      error.message === "Setup not found"
    ) {
      statusCode = 404;
    }

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Update a setup
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const updateSetup = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId, setupId } = req.params;
    const setupData = req.body;

    if (!spaceId || !setupId) {
      return res.status(400).json({
        success: false,
        message: "Space ID and Setup ID are required",
      });
    }

    const updatedSetup = await setupService.updateSetup(
      mobile_number,
      spaceId,
      setupId,
      setupData
    );

    return res.status(200).json({
      success: true,
      data: updatedSetup,
      message: "Setup updated successfully",
    });
  } catch (error) {
    // Determine appropriate status code based on error
    let statusCode = 500;
    if (
      error.message === "User not found" ||
      error.message === "Space not found" ||
      error.message === "Setup not found" ||
      error.message.includes("not found in this space")
    ) {
      statusCode = 404;
    }
    if (
      error.message.includes("must be") ||
      error.message.includes("required") ||
      error.message.includes("between 0 and 100") ||
      error.message.includes("type mismatch")
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
 * Update setup active status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const updateSetupStatus = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId, setupId } = req.params;
    const { active } = req.body;

    if (!spaceId || !setupId) {
      return res.status(400).json({
        success: false,
        message: "Space ID and Setup ID are required",
      });
    }

    if (active === undefined) {
      return res.status(400).json({
        success: false,
        message: "Active status is required",
      });
    }

    const updatedSetup = await setupService.updateSetupStatus(
      mobile_number,
      spaceId,
      setupId,
      active
    );

    return res.status(200).json({
      success: true,
      data: updatedSetup,
      message: `Setup ${active ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    // Determine appropriate status code based on error
    let statusCode = 500;
    if (
      error.message === "User not found" ||
      error.message === "Space not found" ||
      error.message === "Setup not found"
    ) {
      statusCode = 404;
    }

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Delete a setup
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const deleteSetup = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId, setupId } = req.params;

    if (!spaceId || !setupId) {
      return res.status(400).json({
        success: false,
        message: "Space ID and Setup ID are required",
      });
    }

    const result = await setupService.deleteSetup(
      mobile_number,
      spaceId,
      setupId
    );

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    // Determine appropriate status code based on error
    let statusCode = 500;
    if (
      error.message === "User not found" ||
      error.message === "Space not found" ||
      error.message === "Setup not found"
    ) {
      statusCode = 404;
    }

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};
