// src/iot/deviceManager.js
import { User } from "../config/dbconfig.js";
import { publish } from "../utils/mqttHelper.js";
import { getTopic } from "../config/awsIotConfig.js";
import { createNotification } from "../services/notificationService.js";
import logger from "../utils/logger.js";

/**
 * Check if any setup conditions are met and execute actions
 * @param {String} mobileNumber - User's mobile number
 * @param {String} spaceId - Space ID
 * @param {String} deviceId - Device ID that was updated
 * @param {Object} deviceData - Updated device data
 */
export async function checkSetupConditions(
  mobileNumber,
  spaceId,
  deviceId,
  deviceData
) {
  try {
    // Find the user and space
    const user = await User.findOne({ mobile_number: mobileNumber });
    if (!user) {
      logger.error(`User not found: ${mobileNumber}`);
      return;
    }

    const space = user.spaces.find((s) => s._id.toString() === spaceId);
    if (!space) {
      logger.error(`Space not found: ${spaceId}`);
      return;
    }

    // No setups to check
    if (!space.setups || space.setups.length === 0) {
      return;
    }

    logger.info(
      `Checking ${space.setups.length} setups for triggered conditions`
    );

    // Check each setup to see if this device update triggers it
    for (const setup of space.setups) {
      // Skip inactive setups
      if (!setup.active) {
        continue;
      }

      // Check if this device is the condition device for this setup
      if (setup.condition.device_id === deviceId) {
        logger.info(`Setup ${setup.name} uses device ${deviceId} as condition`);

        // Check if condition is met based on device type
        let conditionMet = false;

        if (deviceData.device_type === "tank") {
          // For tank device, check water level against threshold
          const currentLevel = deviceData.level;
          const thresholdLevel = setup.condition.level;
          const operator = setup.condition.operator || "<"; // Default to < if not specified

          switch (operator) {
            case "<":
              conditionMet = currentLevel < thresholdLevel;
              break;
            case "<=":
              conditionMet = currentLevel <= thresholdLevel;
              break;
            case ">":
              conditionMet = currentLevel > thresholdLevel;
              break;
            case ">=":
              conditionMet = currentLevel >= thresholdLevel;
              break;
            case "==":
              conditionMet = currentLevel == thresholdLevel;
              break;
            default:
              conditionMet = false;
          }

          logger.info(
            `Tank level condition: ${currentLevel}% ${operator} ${thresholdLevel}% = ${conditionMet}`
          );
        } else if (deviceData.device_type === "base") {
          // For base device, check if status matches
          const currentStatus = deviceData.status;
          const triggerStatus = setup.condition.status;

          conditionMet = currentStatus === triggerStatus;
          logger.info(
            `Base status condition: ${currentStatus} === ${triggerStatus} = ${conditionMet}`
          );
        }

        // If condition is met, execute actions
        if (conditionMet) {
          logger.info(
            `Condition met for setup: ${setup.name}. Executing actions.`
          );
          await executeActions(mobileNumber, spaceId, setup.condition.actions);
        }
      }
    }
  } catch (error) {
    logger.error(`Error checking setup conditions: ${error.message}`);
  }
}

/**
 * Execute the actions defined in a setup
 * @param {String} mobileNumber - User's mobile number
 * @param {String} spaceId - Space ID
 * @param {Array} actions - Array of actions to execute
 */
async function executeActions(mobileNumber, spaceId, actions) {
  try {
    // Find the user and space
    const user = await User.findOne({ mobile_number: mobileNumber });
    if (!user) {
      logger.error(`User not found: ${mobileNumber}`);
      return;
    }

    const space = user.spaces.find((s) => s._id.toString() === spaceId);
    if (!space) {
      logger.error(`Space not found: ${spaceId}`);
      return;
    }

    // Execute each action
    for (const action of actions) {
      // Find the device to control
      const actionDevice = space.devices.find(
        (d) => d.device_id === action.device_id
      );

      if (!actionDevice) {
        logger.error(`Action device not found: ${action.device_id}`);
        continue;
      }

      // Only base devices can be controlled
      if (actionDevice.device_type !== "base") {
        logger.error(`Cannot control non-base device: ${action.device_id}`);
        continue;
      }

      // Skip if device is already in the target state
      if (actionDevice.status === action.set_status) {
        logger.info(
          `Device ${action.device_id} already in state ${action.set_status}`
        );
        continue;
      }

      // Update device status locally
      actionDevice.status = action.set_status;
      actionDevice.last_updated = new Date();

      // Send MQTT command if device has thing_name
      if (actionDevice.thing_name) {
        const controlTopic = getTopic(
          "control",
          actionDevice.thing_name,
          "control"
        );
        const controlMessage = {
          deviceid: action.device_id,
          switch_no: "BM1", // Default to first switch
          status: action.set_status,
        };

        logger.info(
          `Sending control command to ${
            actionDevice.thing_name
          }: ${JSON.stringify(controlMessage)}`
        );

        // Publish MQTT message
        try {
          publish(controlTopic, controlMessage);
        } catch (mqttError) {
          logger.error(
            `Error publishing MQTT control message: ${mqttError.message}`
          );
        }
      }

      // Create notification for the action
      await createNotification({
        type: "SETUP_ACTION",
        title: "Automated Action",
        message: `Device ${actionDevice.device_name} turned ${action.set_status} by automation`,
        user_id: user._id,
        data: {
          device_id: action.device_id,
          device_name: actionDevice.device_name,
          action: action.set_status,
          space_name: space.space_name,
          space_id: space._id,
          automated: true,
        },
      });

      logger.info(
        `Executed action: ${actionDevice.device_name} → ${action.set_status}`
      );
    }

    // Save user document with updated device statuses
    await user.save();
  } catch (error) {
    logger.error(`Error executing actions: ${error.message}`);
  }
}
