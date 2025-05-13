// src/iot/topicHandlers.js
import logger from "../utils/logger.js";
import { User } from "../config/dbconfig.js";
import { createNotification } from "../services/notificationService.js";
import { publish } from "../utils/mqttHelper.js";
import { getTopic } from "../config/awsIotConfig.js";
import { checkSetupConditions } from "./deviceManager.js";

// Handle device update messages (water level changes, status changes)
export async function handleUpdateMessage(topic, message) {
  try {
    // Extract deviceId from message
    const deviceId = message.deviceid;

    if (!deviceId) {
      logger.error("Update message missing deviceid:", message);
      return;
    }

    logger.info(`Received update for device ${deviceId}`);

    // Find the device in the database
    const user = await User.findOne({ "spaces.devices.device_id": deviceId });

    if (!user) {
      logger.error(`No user found with device ${deviceId}`);
      return;
    }

    // Find the specific space and device
    let deviceUpdated = false;
    let updatedDevice = null;
    let spaceName = "";

    for (const space of user.spaces) {
      const deviceIndex = space.devices.findIndex(
        (d) => d.device_id === deviceId
      );

      if (deviceIndex !== -1) {
        spaceName = space.space_name;
        const device = space.devices[deviceIndex];

        // Update device based on type
        if (device.device_type === "tank" && message.level !== undefined) {
          // Update tank level
          const previousLevel = device.level;
          device.level = message.level;
          device.last_updated = new Date();

          logger.info(
            `Updated tank device ${deviceId} level from ${previousLevel}% to ${message.level}%`
          );

          updatedDevice = {
            device_id: deviceId,
            device_name: device.device_name,
            device_type: "tank",
            level: message.level,
            previous_level: previousLevel,
            space_name: spaceName,
            space_id: space._id,
          };

          deviceUpdated = true;
        } else if (
          device.device_type === "base" &&
          message.status !== undefined
        ) {
          // Update base device status
          const previousStatus = device.status;
          device.status = message.status;
          device.last_updated = new Date();

          logger.info(
            `Updated base device ${deviceId} status from ${previousStatus} to ${message.status}`
          );

          updatedDevice = {
            device_id: deviceId,
            device_name: device.device_name,
            device_type: "base",
            status: message.status,
            previous_status: previousStatus,
            space_name: spaceName,
            space_id: space._id,
          };

          deviceUpdated = true;
        }

        // If device was updated, save changes and create notification
        if (deviceUpdated) {
          await user.save();

          // Create notification for significant changes
          await createNotification({
            type:
              device.device_type === "tank"
                ? "TANK_LEVEL_CHANGE"
                : "BASE_STATUS_CHANGE",
            title:
              device.device_type === "tank"
                ? "Tank Level Changed"
                : "Base Device Status Changed",
            message:
              device.device_type === "tank"
                ? `Tank ${device.device_name} level changed to ${message.level}%`
                : `Base device ${device.device_name} is now ${message.status}`,
            user_id: user._id,
            data: updatedDevice,
          });

          // Check if any setups should be triggered by this update
          await checkSetupConditions(
            user.mobile_number,
            space._id.toString(),
            deviceId,
            device
          );

          break;
        }
      }
    }

    if (!deviceUpdated) {
      logger.warn(`Device ${deviceId} found but no updates were made`);
    }
  } catch (error) {
    logger.error("Error handling update message:", error);
  }
}

// Handle device alive messages
export async function handleAliveMessage(topic, message) {
  try {
    // Extract deviceId from message
    const deviceId = message.deviceid;

    if (!deviceId) {
      logger.error("Alive message missing deviceid:", message);
      return;
    }

    logger.info(`Received alive message from device ${deviceId}`);

    // Find the device in the database
    const user = await User.findOne({ "spaces.devices.device_id": deviceId });

    if (!user) {
      logger.error(`No user found with device ${deviceId}`);
      return;
    }

    // Update device online status
    let deviceUpdated = false;

    for (const space of user.spaces) {
      const deviceIndex = space.devices.findIndex(
        (d) => d.device_id === deviceId
      );

      if (deviceIndex !== -1) {
        const device = space.devices[deviceIndex];

        // Update online status
        if (!device.online_status) {
          device.online_status = true;
          device.last_updated = new Date();

          // Extract firmware version if available
          if (message.firmware) {
            device.firmware_version = message.firmware;
          }

          deviceUpdated = true;

          logger.info(`Device ${deviceId} is now online`);

          // Create notification for device coming online
          await createNotification({
            type: "DEVICE_ONLINE",
            title: "Device Online",
            message: `${device.device_name} is now online`,
            user_id: user._id,
            data: {
              device_id: deviceId,
              device_name: device.device_name,
              device_type: device.device_type,
              space_name: space.space_name,
              space_id: space._id,
            },
          });
        }

        // Save if device was updated
        if (deviceUpdated) {
          await user.save();
        }

        break;
      }
    }
  } catch (error) {
    logger.error("Error handling alive message:", error);
  }
}

// Handle slave response messages (from base to tank connections)
export async function handleSlaveResponseMessage(topic, message) {
  try {
    // Extract base and slave device IDs
    const baseDeviceId = message.deviceid;
    const slaveId = message.slaveid;
    const sensorNo = message.sensor_no;

    if (!baseDeviceId || !slaveId || !sensorNo) {
      logger.error("Slave response missing required fields:", message);
      return;
    }

    logger.info(
      `Received slave response for base ${baseDeviceId} and tank ${slaveId}`
    );

    // Find the base device
    const user = await User.findOne({
      "spaces.devices.device_id": baseDeviceId,
    });

    if (!user) {
      logger.error(`No user found with base device ${baseDeviceId}`);
      return;
    }

    // Find the space containing both devices
    let baseSpace = null;
    let baseDevice = null;
    let tankDevice = null;

    for (const space of user.spaces) {
      const baseIndex = space.devices.findIndex(
        (d) => d.device_id === baseDeviceId
      );
      const tankIndex = space.devices.findIndex((d) => d.device_id === slaveId);

      if (baseIndex !== -1) {
        baseSpace = space;
        baseDevice = space.devices[baseIndex];

        if (tankIndex !== -1) {
          tankDevice = space.devices[tankIndex];
          break;
        }
      }
    }

    if (!baseSpace || !baseDevice) {
      logger.error(`Base device ${baseDeviceId} not found in any space`);
      return;
    }

    if (!tankDevice) {
      logger.error(
        `Tank device ${slaveId} not found in space with base ${baseDeviceId}`
      );
      return;
    }

    // Update tank device with connection details
    tankDevice.parent_device_id = baseDeviceId;
    tankDevice.slave_name = sensorNo;

    // Update additional fields if available
    if (message.channel) {
      tankDevice.channel = message.channel;
    }

    if (message.address_l) {
      tankDevice.address_l = message.address_l;
    }

    if (message.address_h) {
      tankDevice.address_h = message.address_h;
    }

    tankDevice.last_updated = new Date();

    // Save updates
    await user.save();

    logger.info(
      `Updated tank device ${slaveId} connection to base ${baseDeviceId}`
    );

    // Create notification
    await createNotification({
      type: "TANK_CONNECTED",
      title: "Tank Connected",
      message: `Tank ${tankDevice.device_name} connected to base ${baseDevice.device_name}`,
      user_id: user._id,
      data: {
        base_device_id: baseDeviceId,
        base_device_name: baseDevice.device_name,
        tank_device_id: slaveId,
        tank_device_name: tankDevice.device_name,
        space_name: baseSpace.space_name,
        space_id: baseSpace._id,
      },
    });
  } catch (error) {
    logger.error("Error handling slave response message:", error);
  }
}

// Handle device health messages
export async function handleHealthMessage(topic, message) {
  try {
    // Extract deviceId from message
    const deviceId = message.deviceid;

    if (!deviceId) {
      logger.error("Health message missing deviceid:", message);
      return;
    }

    // Log health message but don't create notifications for routine health updates
    logger.info(`Received health message from device ${deviceId}`);

    // Could update device metrics in database if needed
    // For now, just log the message
  } catch (error) {
    logger.error("Error handling health message:", error);
  }
}

// Handle offline detection (if device hasn't sent alive message in a while)
export async function handleDeviceOffline(deviceId) {
  try {
    // Find the device in the database
    const user = await User.findOne({ "spaces.devices.device_id": deviceId });

    if (!user) {
      logger.error(`No user found with device ${deviceId}`);
      return;
    }

    // Update device online status
    let deviceUpdated = false;

    for (const space of user.spaces) {
      const deviceIndex = space.devices.findIndex(
        (d) => d.device_id === deviceId
      );

      if (deviceIndex !== -1) {
        const device = space.devices[deviceIndex];

        // Update online status
        if (device.online_status) {
          device.online_status = false;
          device.last_updated = new Date();
          deviceUpdated = true;

          logger.info(`Device ${deviceId} is now offline`);

          // Create notification for device going offline
          await createNotification({
            type: "DEVICE_OFFLINE",
            title: "Device Offline",
            message: `${device.device_name} is offline`,
            user_id: user._id,
            data: {
              device_id: deviceId,
              device_name: device.device_name,
              device_type: device.device_type,
              space_name: space.space_name,
              space_id: space._id,
            },
          });
        }

        // Save if device was updated
        if (deviceUpdated) {
          await user.save();
        }

        break;
      }
    }
  } catch (error) {
    logger.error("Error handling device offline:", error);
  }
}
