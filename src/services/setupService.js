// src/services/setupService.js - FIXED VERSION
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
      
      // Validate switch_no for base devices
      if (
        !setupData.condition.switch_no ||
        !["BM1", "BM2"].includes(setupData.condition.switch_no)
      ) {
        throw new Error(
          "switch_no field is required and must be 'BM1' or 'BM2' for base devices"
        );
      }
    }

    if (conditionDevice.device_type === "tank") {
      // Validate maximum parameter
      if (typeof setupData.condition.maximum !== 'number' || 
          setupData.condition.maximum < 0 || 
          setupData.condition.maximum > 100) {
        throw new Error("Maximum must be a number between 0 and 100 for tank devices");
      }

      // Validate minimum parameter
      if (typeof setupData.condition.minimum !== 'number' || 
          setupData.condition.minimum < 0 || 
          setupData.condition.minimum > 100) {
        throw new Error("Minimum must be a number between 0 and 100 for tank devices");
      }

      if (setupData.condition.minimum >= setupData.condition.maximum) {
        throw new Error("Minimum must be less than maximum");
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
      // Validate switch_no for each action
      if (!action.switch_no || !["BM1", "BM2"].includes(action.switch_no)) {
        throw new Error(
          "switch_no field is required and must be 'BM1' or 'BM2' for each action"
        );
      }
    }

    // Create condition object with proper switch_no handling
    const conditionData = {
      device_id: setupData.condition.device_id,
      device_type: setupData.condition.device_type,
      actions: setupData.condition.actions
    };

    // Add fields based on device type
    if (setupData.condition.device_type === "base") {
      conditionData.status = setupData.condition.status;
      conditionData.switch_no = setupData.condition.switch_no;
    } else if (setupData.condition.device_type === "tank") {
      conditionData.level = setupData.condition.level;
      conditionData.minimum = setupData.condition.minimum;
      conditionData.maximum = setupData.condition.maximum;
      conditionData.operator = setupData.condition.operator;
    }

    // Create the new setup
    const newSetup = {
      _id: new mongoose.Types.ObjectId(),
      name: setupData.name || `Setup ${(space.setups?.length || 0) + 1}`,
      description: setupData.description || "",
      condition: conditionData,
      active: setupData.active !== undefined ? setupData.active : true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Initialize setups array if needed
    if (!user.spaces[spaceIndex].setups) {
      user.spaces[spaceIndex].setups = [];
    }

    user.spaces[spaceIndex].setups.push(newSetup);

    // ✅ CRITICAL FIX: Save the user document to database BEFORE MQTT operations
    await user.save();
    logger.info(`Setup saved to database for space ${spaceId}`);

    // Now handle MQTT operations
    try {
      if (setupData.condition.device_type === "tank") {
        let mqttPayload = {};

        // Use the first action's switch_no for MQTT payload
        const firstAction = setupData.condition.actions[0];
        
        mqttPayload = {
          deviceid: conditionDevice.device_id,
          sensor_no: conditionDevice.sensor_no || "TM1",
          switch_no: firstAction.switch_no,
          maximum: setupData.condition.maximum?.toString(),
          minimum: setupData.condition.minimum?.toString()
        };

        setting(client, firstAction.device_id, mqttPayload);
      } 
      // Add MQTT publishing for base devices
      else if (setupData.condition.device_type === "base") {
        const mqttPayload = {
          deviceid: setupData.condition.device_id,
          switch_no: setupData.condition.switch_no,
          status: setupData.condition.status,
          setup_id: newSetup._id.toString(),
          setup_name: newSetup.name,
          actions: setupData.condition.actions.map(action => ({
            device_id: action.device_id,
            switch_no: action.switch_no,
            set_status: action.set_status,
            delay: action.delay || 0
          }))
        };

        setting(client, setupData.condition.device_id, mqttPayload);
      }
    } catch (mqttError) {
      logger.error(`MQTT publishing failed, but setup was saved to DB: ${mqttError.message}`);
    }

    logger.info(`Setup created successfully for space ${spaceId}`);
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
    logger.info(`Getting setups for mobile: ${mobileNumber}, spaceId: ${spaceId}`);
    
    const user = await User.findOne({ mobile_number: mobileNumber });
    if (!user) {
      logger.error(`User not found for mobile: ${mobileNumber}`);
      throw new Error("User not found");
    }

    logger.info(`User found with ${user.spaces?.length || 0} spaces`);

    const space = user.spaces.find((space) => space._id.toString() === spaceId);
    if (!space) {
      logger.error(`Space not found for spaceId: ${spaceId}`);
      logger.info(`Available spaces: ${user.spaces.map(s => s._id.toString()).join(', ')}`);
      throw new Error("Space not found");
    }

    logger.info(`Space found with ${space.setups?.length || 0} setups and ${space.devices?.length || 0} devices`);

    // ✅ FIX: Handle case when setups array doesn't exist or is empty
    const setups = space.setups || [];
    const devices = space.devices || [];

    if (setups.length === 0) {
      logger.info(`No setups found for space ${spaceId}`);
      return [];
    }

    // Map and clean up the setups data
    const cleanSetups = setups.map((setup, index) => {
      try {
        logger.info(`Processing setup ${index + 1}: ${setup._id}`);
        
        // ✅ FIX: Add null checks for setup properties
        if (!setup.condition) {
          logger.warn(`Setup ${setup._id} has no condition data`);
          return null;
        }

        // Find device names with null checks
        const conditionDevice = devices.find(
          (device) => device && device.device_id === setup.condition.device_id
        );

        if (!conditionDevice) {
          logger.warn(`Condition device ${setup.condition.device_id} not found in space devices`);
        }

        // ✅ FIX: Add null checks for actions
        const cleanActions = (setup.condition.actions || []).map((action) => {
          if (!action) {
            logger.warn(`Null action found in setup ${setup._id}`);
            return null;
          }

          const actionDevice = devices.find(
            (device) => device && device.device_id === action.device_id
          );
          
          if (!actionDevice) {
            logger.warn(`Action device ${action.device_id} not found in space devices`);
          }

          return {
            device_id: action.device_id,
            device_name: actionDevice?.device_name || "Unknown Device",
            switch_no: action.switch_no || "BM1", // Default fallback
            set_status: action.set_status,
            delay: action.delay || 0,
          };
        }).filter(action => action !== null); // Remove null actions

        // Handle condition response with proper null checks
        const conditionResponse = {
          device_id: setup.condition.device_id,
          device_name: conditionDevice?.device_name || "Unknown Device",
          device_type: setup.condition.device_type,
          actions: cleanActions,
        };

        // Add device-type specific fields
        if (setup.condition.device_type === "base") {
          conditionResponse.status = setup.condition.status;
          conditionResponse.switch_no = setup.condition.switch_no || "BM1"; // Default fallback
        } else if (setup.condition.device_type === "tank") {
          conditionResponse.level = setup.condition.level;
          conditionResponse.minimum = setup.condition.minimum;
          conditionResponse.maximum = setup.condition.maximum;
          conditionResponse.operator = setup.condition.operator;
        }

        // Return cleaned setup object
        return {
          id: setup._id?.toString() || `temp_${index}`,
          name: setup.name || `Setup ${index + 1}`,
          description: setup.description || "",
          condition: conditionResponse,
          active: setup.active !== undefined ? setup.active : true,
          created_at: setup.created_at || new Date(),
          updated_at: setup.updated_at || setup.created_at || new Date(),
        };
      } catch (setupError) {
        logger.error(`Error processing setup ${setup._id}: ${setupError.message}`);
        return null;
      }
    }).filter(setup => setup !== null); // Remove null setups

    logger.info(`Successfully processed ${cleanSetups.length} setups for space ${spaceId}`);
    return cleanSetups;
  } catch (error) {
    logger.error(`Error getting setups: ${error.message}`);
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
        
        // Validate switch_no in update
        if (
          !setupData.condition.switch_no ||
          !["BM1", "BM2"].includes(setupData.condition.switch_no)
        ) {
          throw new Error(
            "switch_no field is required and must be 'BM1' or 'BM2' for base devices"
          );
        }
      } else if (conditionDevice.device_type === "tank") {
        // Validate maximum parameter
        if (typeof setupData.condition.maximum !== 'number' || 
            setupData.condition.maximum < 0 || 
            setupData.condition.maximum > 100) {
          throw new Error("Maximum must be a number between 0 and 100 for tank devices");
        }

        // Validate minimum parameter
        if (typeof setupData.condition.minimum !== 'number' || 
            setupData.condition.minimum < 0 || 
            setupData.condition.minimum > 100) {
          throw new Error("Minimum must be a number between 0 and 100 for tank devices");
        }

        if (setupData.condition.minimum >= setupData.condition.maximum) {
          throw new Error("Minimum must be less than maximum");
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
          
          // Validate switch_no for each action in update
          if (!action.switch_no || !["BM1", "BM2"].includes(action.switch_no)) {
            throw new Error(
              "switch_no field is required and must be 'BM1' or 'BM2' for each action"
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
      user.spaces[spaceIndex].setups[setupIndex].condition = setupData.condition;
    }

    // Update the updated_at timestamp
    user.spaces[spaceIndex].setups[setupIndex].updated_at = new Date();

    // ✅ CRITICAL FIX: Save the updated user document BEFORE MQTT operations
    await user.save();
    logger.info(`Setup updated and saved to database for space ${spaceId}`);

    // Now handle MQTT operations (after successful DB save)
    try {
      if (setupData.condition) {
        const conditionDevice = user.spaces[spaceIndex].devices.find(
          (device) => device.device_id === setupData.condition.device_id
        );

        if (setupData.condition.device_type === "tank") {
          let mqttPayload = {};

          // Use the first action's switch_no for MQTT payload
          const firstAction = setupData.condition.actions[0];

          mqttPayload = {
            deviceid: conditionDevice.device_id,
            sensor_no: conditionDevice.sensor_no || "TM1",
            switch_no: firstAction.switch_no,
            maximum: setupData.condition.maximum?.toString(),
            minimum: setupData.condition.minimum?.toString()
          };

          setting(client, firstAction.device_id, mqttPayload);
        } 
        // Add MQTT publishing for base devices
        else if (setupData.condition.device_type === "base") {
          const updatedSetup = user.spaces[spaceIndex].setups[setupIndex];
          const mqttPayload = {
            deviceid: setupData.condition.device_id,
            switch_no: setupData.condition.switch_no,
            status: setupData.condition.status,
            setup_id: updatedSetup._id.toString(),
            setup_name: updatedSetup.name,
            actions: setupData.condition.actions.map(action => ({
              device_id: action.device_id,
              switch_no: action.switch_no,
              set_status: action.set_status,
              delay: action.delay || 0
            }))
          };

          setting(client, setupData.condition.device_id, mqttPayload);
        }
      }
    } catch (mqttError) {
      logger.error(`MQTT publishing failed during update, but changes were saved to DB: ${mqttError.message}`);
    }

    logger.info(`Setup updated successfully for space ${spaceId}`);
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

    // Update setup status
    user.spaces[spaceIndex].setups[setupIndex].active = active;
    user.spaces[spaceIndex].setups[setupIndex].updated_at = new Date();

    // ✅ CRITICAL FIX: Save changes to database
    await user.save();

    logger.info(`Setup ${setupId} status updated to ${active} and saved to DB`);
    return user.spaces[spaceIndex].setups[setupIndex];
  } catch (error) {
    logger.error(`Error updating setup status: ${error.message}`);
    throw error;
  }
}

/**
 * Get a single setup by ID
 * @param {String} mobileNumber - User's mobile number
 * @param {String} spaceId - Space ID
 * @param {String} setupId - Setup ID
 * @returns {Object} The setup configuration
 */
export async function getSetupById(mobileNumber, spaceId, setupId) {
  try {
    logger.info(`Getting setup by ID: ${setupId} for space: ${spaceId}`);
    
    const user = await User.findOne({ mobile_number: mobileNumber });
    if (!user) {
      throw new Error("User not found");
    }

    const space = user.spaces.find((space) => space._id.toString() === spaceId);
    if (!space) {
      throw new Error("Space not found");
    }

    const setup = space.setups?.find((setup) => setup._id.toString() === setupId);
    if (!setup) {
      throw new Error("Setup not found");
    }

    // Find device names
    const conditionDevice = space.devices.find(
      (device) => device.device_id === setup.condition.device_id
    );

    const cleanActions = setup.condition.actions.map((action) => {
      const actionDevice = space.devices.find(
        (device) => device.device_id === action.device_id
      );
      return {
        device_id: action.device_id,
        device_name: actionDevice?.device_name || "Unknown Device",
        switch_no: action.switch_no || "BM1",
        set_status: action.set_status,
        delay: action.delay || 0,
      };
    });

    const conditionResponse = {
      device_id: setup.condition.device_id,
      device_name: conditionDevice?.device_name || "Unknown Device",
      device_type: setup.condition.device_type,
      actions: cleanActions,
    };

    // Add device-type specific fields
    if (setup.condition.device_type === "base") {
      conditionResponse.status = setup.condition.status;
      conditionResponse.switch_no = setup.condition.switch_no || "BM1";
    } else if (setup.condition.device_type === "tank") {
      conditionResponse.level = setup.condition.level;
      conditionResponse.minimum = setup.condition.minimum;
      conditionResponse.maximum = setup.condition.maximum;
      conditionResponse.operator = setup.condition.operator;
    }

    const cleanSetup = {
      id: setup._id.toString(),
      name: setup.name,
      description: setup.description || "",
      condition: conditionResponse,
      active: setup.active,
      created_at: setup.created_at,
      updated_at: setup.updated_at,
    };

    logger.info(`Successfully retrieved setup ${setupId}`);
    return cleanSetup;
  } catch (error) {
    logger.error(`Error getting setup by ID: ${error.message}`);
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

    // ✅ CRITICAL FIX: Save the updated user document
    await user.save();

    logger.info(`Setup deleted: ${setupId} and changes saved to DB`);
    return { success: true, message: "Setup deleted successfully" };
  } catch (error) {
    logger.error(`Error deleting setup: ${error.message}`);
    throw error;
  }
}