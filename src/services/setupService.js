// src/services/setupService.js
import { User } from "../config/dbconfig.js";
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { setting } from "./controlService.js";
import { client } from "../config/postgres.js";
/**
 * Create a new setup configuration for a space
 * @param {String} mobileNumber - User's mobile number
 * @param {String} spaceId - Space ID
 * @param {Object} setupData - Setup configuration data
 * @returns {Object} The created setup configuration
 */
export async function createSetup(mobileNumber, spaceId, setupData) {
  try {
    const user = await User.findOne({ mobile_number: mobileNumber });
    if (!user) {
      throw new Error("User not found");
    }

    // Find the space to update
    const spaceIndex = user.spaces.findIndex(
      (space) => space._id.toString() === spaceId
    );
    if (spaceIndex === -1) {
      throw new Error("Space not found");
    }

    const space = user.spaces[spaceIndex];

    // Validate the condition device
    const conditionDeviceId = setupData.condition.device_id;
    const conditionDevice = space.devices.find(
      (device) => device.device_id === conditionDeviceId
    );
    if (!conditionDevice) {
      throw new Error(
        `Condition device with ID '${conditionDeviceId}' not found in this space`
      );
    }
    if (conditionDevice.device_type !== setupData.condition.device_type) {
      throw new Error(
        `Device type mismatch. Device '${conditionDeviceId}' is of type '${conditionDevice.device_type}', not '${setupData.condition.device_type}'`
      );
    }

    // Validate condition specifics
    if (conditionDevice.device_type === "base") {
      if (
        !setupData.condition.status ||
        !["on", "off"].includes(setupData.condition.status)
      ) {
        throw new Error(
          "Status field is required and must be 'on' or 'off' for base devices"
        );
      }
    }

    if (conditionDevice.device_type === "tank") {
      if (
        setupData.condition.level === undefined ||
        setupData.condition.level < 0 ||
        setupData.condition.level > 100
      ) {
        throw new Error(
          "Level field is required and must be between 0 and 100 for tank devices"
        );
      }
      if (
        !setupData.condition.operator ||
        !["<", ">", "<=", ">=", "=="].includes(setupData.condition.operator)
      ) {
        throw new Error("Valid operator is required for tank level comparison");
      }
    }

    // Validate each action device
    for (const action of setupData.condition.actions) {
      const actionDeviceId = action.device_id;
      const actionDevice = space.devices.find(
        (device) => device.device_id === actionDeviceId
      );
      if (!actionDevice) {
        throw new Error(
          `Action device with ID '${actionDeviceId}' not found in this space`
        );
      }
      if (actionDevice.device_type !== "base") {
        throw new Error(
          `Device '${actionDeviceId}' must be of type 'base' to be used in actions`
        );
      }
      if (!action.set_status || !["on", "off"].includes(action.set_status)) {
        throw new Error(
          "set_status field is required and must be 'on' or 'off' for actions"
        );
      }
    }

    // Create the new setup
    const newSetup = {
      _id: new mongoose.Types.ObjectId(),
      name: setupData.name || `Setup ${(space.setups?.length || 0) + 1}`,
      description: setupData.description || "",
      condition: setupData.condition,
      active: setupData.active !== undefined ? setupData.active : true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Initialize setups array if needed
    if (!user.spaces[spaceIndex].setups) {
      user.spaces[spaceIndex].setups = [];
    }

    user.spaces[spaceIndex].setups.push(newSetup);

    // ✅ MQTT Publish Payload Logic
    const mqttPayload = {
      deviceid: conditionDevice.device_id,
      sensor_no: conditionDevice.sensor_no || "TM1",
      switch_no: conditionDevice.switch_no || "BM1",
      maximum:
        ["<", "<="].includes(setupData.condition.operator) &&
        setupData.condition.level !== undefined
          ? setupData.condition.level
          : 95,
      minimum:
        [">", ">="].includes(setupData.condition.operator) &&
        setupData.condition.level !== undefined
          ? setupData.condition.level
          : 30,
    };
    setting(client,setupData.condition.actions[0].device_id,mqttPayload);
    // Save changes
    await user.save();

    logger.info(`Setup created for space ${spaceId}`);
    return newSetup;
  } catch (error) {
    logger.error(`Error creating setup: ${error.message}`);
    throw error;
  }
}

/**
 * Get all setups for a space
 * @param {String} mobileNumber - User's mobile number
 * @param {String} spaceId - Space ID
 * @returns {Array} Array of setup configurations
 */
export async function getSetups(mobileNumber, spaceId) {
  try {
    const user = await User.findOne({ mobile_number: mobileNumber });
    if (!user) {
      throw new Error("User not found");
    }

    const space = user.spaces.find((space) => space._id.toString() === spaceId);
    if (!space) {
      throw new Error("Space not found");
    }

    // Return setups or empty array if no setups found
    return space.setups || [];
  } catch (error) {
    logger.error(`Error getting setups: ${error.message}`);
    throw error;
  }
}

/**
 * Get a specific setup by ID
 * @param {String} mobileNumber - User's mobile number
 * @param {String} spaceId - Space ID
 * @param {String} setupId - Setup ID
 * @returns {Object} The setup configuration
 */
export async function getSetupById(mobileNumber, spaceId, setupId) {
  try {
    const user = await User.findOne({ mobile_number: mobileNumber });
    if (!user) {
      throw new Error("User not found");
    }

    const space = user.spaces.find((space) => space._id.toString() === spaceId);
    if (!space) {
      throw new Error("Space not found");
    }

    const setup = space.setups?.find(
      (setup) => setup._id.toString() === setupId
    );
    if (!setup) {
      throw new Error("Setup not found");
    }

    return setup;
  } catch (error) {
    logger.error(`Error getting setup: ${error.message}`);
    throw error;
  }
}

/**
 * Update a setup configuration
 * @param {String} mobileNumber - User's mobile number
 * @param {String} spaceId - Space ID
 * @param {String} setupId - Setup ID
 * @param {Object} setupData - Updated setup data
 * @returns {Object} The updated setup configuration
 */
export async function updateSetup(mobileNumber, spaceId, setupId, setupData) {
  try {
    const user = await User.findOne({ mobile_number: mobileNumber });
    if (!user) {
      throw new Error("User not found");
    }

    const spaceIndex = user.spaces.findIndex(
      (space) => space._id.toString() === spaceId
    );
    if (spaceIndex === -1) {
      throw new Error("Space not found");
    }

    // Find the setup to update
    const setupIndex = user.spaces[spaceIndex].setups?.findIndex(
      (setup) => setup._id.toString() === setupId
    );

    if (setupIndex === -1 || setupIndex === undefined) {
      throw new Error("Setup not found");
    }

    // Get the current setup
    const currentSetup = user.spaces[spaceIndex].setups[setupIndex];

    // If condition is being updated, validate new condition
    if (setupData.condition) {
      // Perform the same validation as in createSetup
      // (Validation code would be similar to createSetup logic)
      const conditionDeviceId = setupData.condition.device_id;
      const conditionDevice = user.spaces[spaceIndex].devices.find(
        (device) => device.device_id === conditionDeviceId
      );

      if (!conditionDevice) {
        throw new Error(
          `Condition device with ID '${conditionDeviceId}' not found in this space`
        );
      }

      // Validate device type
      if (conditionDevice.device_type !== setupData.condition.device_type) {
        throw new Error(
          `Device type mismatch. Device '${conditionDeviceId}' is of type '${conditionDevice.device_type}', not '${setupData.condition.device_type}'`
        );
      }

      // Validate conditions based on device type
      if (conditionDevice.device_type === "base") {
        if (
          !setupData.condition.status ||
          !["on", "off"].includes(setupData.condition.status)
        ) {
          throw new Error(
            "Status field is required and must be 'on' or 'off' for base devices"
          );
        }
      } else if (conditionDevice.device_type === "tank") {
        if (
          setupData.condition.level === undefined ||
          setupData.condition.level < 0 ||
          setupData.condition.level > 100
        ) {
          throw new Error(
            "Level field is required and must be between 0 and 100 for tank devices"
          );
        }

        if (
          !setupData.condition.operator ||
          !["<", ">", "<=", ">=", "=="].includes(setupData.condition.operator)
        ) {
          throw new Error(
            "Valid operator is required for tank level comparison"
          );
        }
      }

      // Validate actions
      if (setupData.condition.actions) {
        for (const action of setupData.condition.actions) {
          const actionDeviceId = action.device_id;
          const actionDevice = user.spaces[spaceIndex].devices.find(
            (device) => device.device_id === actionDeviceId
          );

          if (!actionDevice) {
            throw new Error(
              `Action device with ID '${actionDeviceId}' not found in this space`
            );
          }

          if (actionDevice.device_type !== "base") {
            throw new Error(
              `Device '${actionDeviceId}' must be of type 'base' to be used in actions`
            );
          }

          if (
            !action.set_status ||
            !["on", "off"].includes(action.set_status)
          ) {
            throw new Error(
              "set_status field is required and must be 'on' or 'off' for actions"
            );
          }
        }
      }
    }

    // Update fields
    if (setupData.name) {
      user.spaces[spaceIndex].setups[setupIndex].name = setupData.name;
    }

    if (setupData.description !== undefined) {
      user.spaces[spaceIndex].setups[setupIndex].description =
        setupData.description;
    }

    if (setupData.active !== undefined) {
      user.spaces[spaceIndex].setups[setupIndex].active = setupData.active;
    }

    if (setupData.condition) {
      user.spaces[spaceIndex].setups[setupIndex].condition =
        setupData.condition;
    }

    // Update the updated_at timestamp
    user.spaces[spaceIndex].setups[setupIndex].updated_at = new Date();

    // Save the updated user document
    await user.save();

    logger.info(`Setup updated for space ${spaceId}`);
    return user.spaces[spaceIndex].setups[setupIndex];
  } catch (error) {
    logger.error(`Error updating setup: ${error.message}`);
    throw error;
  }
}

/**
 * Update setup active status
 * @param {String} mobileNumber - User's mobile number
 * @param {String} spaceId - Space ID
 * @param {String} setupId - Setup ID
 * @param {Boolean} active - New active status
 * @returns {Object} The updated setup
 */
export async function updateSetupStatus(
  mobileNumber,
  spaceId,
  setupId,
  active
) {
  try {
    const user = await User.findOne({ mobile_number: mobileNumber });
    if (!user) {
      throw new Error("User not found");
    }

    const spaceIndex = user.spaces.findIndex(
      (space) => space._id.toString() === spaceId
    );
    if (spaceIndex === -1) {
      throw new Error("Space not found");
    }

    const setupIndex = user.spaces[spaceIndex].setups?.findIndex(
      (setup) => setup._id.toString() === setupId
    );

    if (setupIndex === -1 || setupIndex === undefined) {
      throw new Error("Setup not found");
    }

    // Update active status
    user.spaces[spaceIndex].setups[setupIndex].active = active;
    user.spaces[spaceIndex].setups[setupIndex].updated_at = new Date();

    // Save the updated user document
    await user.save();

    logger.info(`Setup status updated for setup ${setupId} to ${active}`);
    return user.spaces[spaceIndex].setups[setupIndex];
  } catch (error) {
    logger.error(`Error updating setup status: ${error.message}`);
    throw error;
  }
}

/**
 * Delete a setup configuration
 * @param {String} mobileNumber - User's mobile number
 * @param {String} spaceId - Space ID
 * @param {String} setupId - Setup ID
 * @returns {Object} Success message
 */
export async function deleteSetup(mobileNumber, spaceId, setupId) {
  try {
    const user = await User.findOne({ mobile_number: mobileNumber });
    if (!user) {
      throw new Error("User not found");
    }

    const spaceIndex = user.spaces.findIndex(
      (space) => space._id.toString() === spaceId
    );
    if (spaceIndex === -1) {
      throw new Error("Space not found");
    }

    // Find the setup to delete
    const setupIndex = user.spaces[spaceIndex].setups?.findIndex(
      (setup) => setup._id.toString() === setupId
    );

    if (setupIndex === -1 || setupIndex === undefined) {
      throw new Error("Setup not found");
    }

    // Remove the setup
    user.spaces[spaceIndex].setups.splice(setupIndex, 1);

    // Save the updated user document
    await user.save();

    logger.info(`Setup deleted: ${setupId}`);
    return { success: true, message: "Setup deleted successfully" };
  } catch (error) {
    logger.error(`Error deleting setup: ${error.message}`);
    throw error;
  }
}
