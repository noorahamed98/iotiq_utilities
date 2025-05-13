// src/services/deviceService.js - Update with tank device functionality
import { User } from "../config/dbconfig.js";
import { getMqttClient, publish } from "../utils/mqttHelper.js";
import { getTopic } from "../config/awsIotConfig.js";
import logger from "../utils/logger.js";

// Get all devices in a space
export async function getSpaceDevices(mobileNumber, spaceId) {
  const user = await User.findOne({ mobile_number: mobileNumber });
  if (!user) {
    throw new Error("User not found");
  }

  const space = user.spaces.find((space) => space._id.toString() === spaceId);
  if (!space) {
    throw new Error("Space not found");
  }

  // Transform the devices to include space information
  const devicesWithSpaceInfo = space.devices.map((device) => ({
    ...device.toObject(),
    space_id: space._id,
    space_name: space.space_name,
  }));

  return devicesWithSpaceInfo || [];
}

// Get all devices for a user across all spaces
export async function getAllUserDevices(mobileNumber, userId) {
  // Verify that the mobile number matches the requested userId for security
  const user = await User.findOne({
    mobile_number: mobileNumber,
    _id: userId,
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Collect devices from all spaces
  const allDevices = [];

  user.spaces.forEach((space) => {
    if (space.devices && space.devices.length > 0) {
      // Add space information to each device
      const devicesWithSpaceInfo = space.devices.map((device) => ({
        ...device.toObject(),
        space_id: space._id,
        space_name: space.space_name,
      }));

      allDevices.push(...devicesWithSpaceInfo);
    }
  });

  return allDevices;
}

// Get a specific device by ID
export async function getDeviceById(mobileNumber, spaceId, deviceId) {
  const user = await User.findOne({ mobile_number: mobileNumber });
  if (!user) {
    throw new Error("User not found");
  }

  const space = user.spaces.find((space) => space._id.toString() === spaceId);
  if (!space) {
    throw new Error("Space not found");
  }

  const device = space.devices.find((device) => device.device_id === deviceId);
  if (!device) {
    throw new Error("Device not found");
  }

  // Add space information to the device
  const deviceWithSpaceInfo = {
    ...device.toObject(),
    space_id: space._id,
    space_name: space.space_name,
  };

  return deviceWithSpaceInfo;
}

// Add a base device to a space
export async function addDevice(mobileNumber, spaceId, deviceData) {
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

  // Check if device with the same ID already exists
  const existingDevice = user.spaces[spaceIndex].devices.find(
    (device) => device.device_id === deviceData.device_id
  );

  if (existingDevice) {
    throw new Error(
      `Device with ID '${deviceData.device_id}' already exists in this space`
    );
  }

  // For wifi connection, ensure ssid and password are provided
  if (deviceData.connection_type === "wifi") {
    if (!deviceData.ssid || !deviceData.password) {
      throw new Error("SSID and password are required for WiFi devices");
    }
  }

  // Set thing_name if not provided (defaults to device_id for base models)
  if (!deviceData.thing_name && deviceData.device_type === "base") {
    deviceData.thing_name = deviceData.device_id;
  }

  // Add device to the space
  user.spaces[spaceIndex].devices.push(deviceData);

  // Save the updated user document
  await user.save();

  // If device is connected via WiFi, send MQTT configuration
  if (deviceData.connection_type === "wifi" && deviceData.thing_name) {
    try {
      // Send configuration to device via MQTT
      const configTopic = getTopic("config", deviceData.thing_name, "config");
      const configMessage = {
        deviceid: deviceData.device_id,
        ssid: deviceData.ssid,
        password: deviceData.password,
        mode: deviceData.connection_type === "wifi" ? 1 : 3,
      };

      publish(configTopic, configMessage);
      logger.info(`Sent configuration to device ${deviceData.device_id}`);
    } catch (mqttError) {
      logger.error(`Error sending MQTT configuration: ${mqttError.message}`);
      // Continue process, don't fail if MQTT fails
    }
  }

  // Return the newly added device
  return user.spaces[spaceIndex].devices[
    user.spaces[spaceIndex].devices.length - 1
  ];
}

// Add a tank device to a space and connect to base device
export async function addTankDevice(
  mobileNumber,
  spaceId,
  baseDeviceId,
  tankData
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

    // Find the base device
    const baseDevice = user.spaces[spaceIndex].devices.find(
      (device) =>
        device.device_id === baseDeviceId && device.device_type === "base"
    );

    if (!baseDevice) {
      throw new Error("Base device not found or is not a base model");
    }

    // Check if device with the same ID already exists
    const existingDevice = user.spaces[spaceIndex].devices.find(
      (device) => device.device_id === tankData.device_id
    );

    if (existingDevice) {
      throw new Error(
        `Device with ID '${tankData.device_id}' already exists in this space`
      );
    }

    // Ensure required fields for tank model
    if (!tankData.slave_name) {
      throw new Error("Slave name is required for tank devices");
    }

    if (!tankData.device_name) {
      throw new Error("Device name is required");
    }

    // Set defaults for tank model
    tankData.device_type = "tank";
    tankData.parent_device_id = baseDeviceId;
    tankData.level = 0; // Initial water level

    // Set connection_type to "without_wifi" by default if not specified
    if (!tankData.connection_type) {
      tankData.connection_type = "without_wifi";
    }

    // For "without_wifi" mode, ensure channel and address fields
    if (tankData.connection_type === "without_wifi") {
      if (!tankData.channel) {
        tankData.channel = "24"; // Default channel
      }

      if (!tankData.address_l) {
        tankData.address_l = "0x01"; // Default address low
      }

      if (!tankData.address_h) {
        tankData.address_h = "0x01"; // Default address high
      }
    }

    // Add tank device to the space
    user.spaces[spaceIndex].devices.push(tankData);

    // Save the updated user document
    await user.save();

    // Get the newly added device
    const newTankDevice =
      user.spaces[spaceIndex].devices[
        user.spaces[spaceIndex].devices.length - 1
      ];

    // If base device has thing_name, send slave request via MQTT
    if (baseDevice.thing_name) {
      try {
        const slaveRequestTopic = getTopic(
          "slaveRequest",
          baseDevice.thing_name,
          "slaveRequest"
        );
        const slaveRequestMessage = {
          deviceid: baseDeviceId,
          sensor_no: tankData.slave_name,
          slaveid: tankData.device_id,
        };

        // For "without_wifi" mode, add additional parameters
        if (tankData.connection_type === "without_wifi") {
          slaveRequestMessage.mode = 3;
          slaveRequestMessage.channel = tankData.channel;
          slaveRequestMessage.address_l = tankData.address_l;
          slaveRequestMessage.address_h = tankData.address_h;
          slaveRequestMessage.slave_name = tankData.slave_name;
        }

        // Send MQTT message to base device to connect to tank
        publish(slaveRequestTopic, slaveRequestMessage);
        logger.info(
          `Sent slave request for tank ${tankData.device_id} to base ${baseDeviceId}`
        );
      } catch (mqttError) {
        logger.error(
          `Error sending slave request via MQTT: ${mqttError.message}`
        );
        // Continue process, don't fail if MQTT fails
      }
    }

    return newTankDevice;
  } catch (error) {
    logger.error(`Error adding tank device: ${error.message}`);
    throw error;
  }
}

// Delete a device from a space
export async function deleteDevice(mobileNumber, spaceId, deviceId) {
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

  // Find the device to delete
  const deviceIndex = user.spaces[spaceIndex].devices.findIndex(
    (device) => device.device_id === deviceId
  );
  if (deviceIndex === -1) {
    throw new Error("Device not found");
  }

  const device = user.spaces[spaceIndex].devices[deviceIndex];

  // Check if this is a base device with connected tank devices
  if (device.device_type === "base") {
    const connectedTanks = user.spaces[spaceIndex].devices.filter(
      (d) => d.device_type === "tank" && d.parent_device_id === deviceId
    );

    if (connectedTanks.length > 0) {
      throw new Error(
        "Cannot delete base device with connected tank devices. Please remove the tank devices first."
      );
    }
  }

  // Remove the device
  user.spaces[spaceIndex].devices.splice(deviceIndex, 1);

  // If this device was used in any setups, remove or disable those setups
  if (user.spaces[spaceIndex].setups) {
    // Find setups that use this device as a condition
    for (let i = 0; i < user.spaces[spaceIndex].setups.length; i++) {
      const setup = user.spaces[spaceIndex].setups[i];

      // Check if this device is used as a condition device
      if (setup.condition.device_id === deviceId) {
        // Remove the setup entirely
        user.spaces[spaceIndex].setups.splice(i, 1);
        i--; // Adjust index since we removed an item
        continue;
      }

      // Check if this device is used in actions
      if (setup.condition.actions) {
        const actionIndex = setup.condition.actions.findIndex(
          (action) => action.device_id === deviceId
        );

        if (actionIndex !== -1) {
          // Remove this action
          setup.condition.actions.splice(actionIndex, 1);

          // If no actions remain, remove the entire setup
          if (setup.condition.actions.length === 0) {
            user.spaces[spaceIndex].setups.splice(i, 1);
            i--; // Adjust index since we removed an item
          }
        }
      }
    }
  }

  // Save the updated user document
  await user.save();

  return { success: true, message: "Device deleted successfully" };
}

// Update device status (for base devices)
export async function updateDeviceStatus(
  mobileNumber,
  spaceId,
  deviceId,
  status
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

    // Find the device
    const deviceIndex = user.spaces[spaceIndex].devices.findIndex(
      (device) => device.device_id === deviceId
    );
    if (deviceIndex === -1) {
      throw new Error("Device not found");
    }

    const device = user.spaces[spaceIndex].devices[deviceIndex];

    // Only base devices can have their status updated
    if (device.device_type !== "base") {
      throw new Error("Only base devices can have their status updated");
    }

    // Validate status
    if (!status || !["on", "off"].includes(status)) {
      throw new Error("Status must be 'on' or 'off'");
    }

    // Update device status
    user.spaces[spaceIndex].devices[deviceIndex].status = status;
    user.spaces[spaceIndex].devices[deviceIndex].last_updated = new Date();

    // Save the updated user document
    await user.save();

    // If device has thing_name, send control command via MQTT
    if (device.thing_name) {
      try {
        const controlTopic = getTopic("control", device.thing_name, "control");
        const controlMessage = {
          deviceid: deviceId,
          switch_no: "BM1", // Default to first switch
          status: status,
        };

        publish(controlTopic, controlMessage);
        logger.info(`Sent control command to device ${deviceId}: ${status}`);
      } catch (mqttError) {
        logger.error(
          `Error sending control command via MQTT: ${mqttError.message}`
        );
        // Continue process, don't fail if MQTT fails
      }
    }

    return {
      ...device.toObject(),
      status,
      space_id: user.spaces[spaceIndex]._id,
      space_name: user.spaces[spaceIndex].space_name,
    };
  } catch (error) {
    logger.error(`Error updating device status: ${error.message}`);
    throw error;
  }
}
