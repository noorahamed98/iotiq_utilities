// src/services/deviceService.js - Update with global device uniqueness checks
import { User } from "../config/dbconfig.js";
import { getMqttClient, publish } from "../utils/mqttHelper.js";
import { getTopic } from "../config/awsIotConfig.js";
import logger from "../utils/logger.js";
import { trace, context } from '@opentelemetry/api';

// Helper function to check if device exists globally
async function checkDeviceExistsGlobally(deviceId, thingName = null) {
  const query = {
    $or: [
      { "spaces.devices.device_id": deviceId }
    ]
  };

  // If thing_name is provided, also check for it
  if (thingName) {
    query.$or.push({ "spaces.devices.thing_name": thingName });
  }

  const existingUser = await User.findOne(query);
  
  if (existingUser) {
    // Find the specific device and space details
    for (const space of existingUser.spaces) {
      const device = space.devices.find(d => 
        d.device_id === deviceId || (thingName && d.thing_name === thingName)
      );
      if (device) {
        return {
          exists: true,
          user: existingUser,
          space: space,
          device: device
        };
      }
    }
  }
  
  return { exists: false };
}

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

// Check if device can be transferred or needs to be removed first
export async function checkDeviceAvailability(deviceId, thingName = null) {
  const result = await checkDeviceExistsGlobally(deviceId, thingName);
  
  if (result.exists) {
    return {
      available: false,
      currentOwner: {
        mobile_number: result.user.mobile_number,
        user_name: result.user.user_name,
        space_name: result.space.space_name,
        space_id: result.space._id
      },
      device: result.device
    };
  }
  
  return { available: true };
}

// Add a base device to a space
export async function addDevice(mobileNumber, spaceId, deviceData) {
  const span = trace.getSpan(context.active());
  const traceInfo = span ? span.spanContext() : {};

  try {
    const user = await User.findOne({ mobile_number: mobileNumber });
    if (!user) {
      logger.error("User not found", { mobileNumber, traceId: traceInfo.traceId });
      throw new Error("User not found");
    }

    const spaceIndex = user.spaces.findIndex(space => space._id.toString() === spaceId);
    if (spaceIndex === -1) {
      logger.error("Space not found", { spaceId, mobileNumber, traceId: traceInfo.traceId });
      throw new Error("Space not found");
    }

    // Check for global duplicate device
    const globalCheck = await checkDeviceExistsGlobally(deviceData.device_id, deviceData.thing_name);
    if (globalCheck.exists) {
      logger.warn("Device already registered", {
        device_id: deviceData.device_id,
        registeredTo: globalCheck.user.mobile_number,
        traceId: traceInfo.traceId
      });

      if (globalCheck.user.mobile_number === mobileNumber) {
        throw new Error(`Device '${deviceData.device_id}' already in your space '${globalCheck.space.space_name}'`);
      } else {
        throw new Error(`Device '${deviceData.device_id}' is registered to another account`);
      }
    }

    // Validate WiFi creds if WiFi mode
    if (deviceData.connection_type === "wifi") {
      if (!deviceData.ssid || !deviceData.password) {
        throw new Error("SSID and password are required for WiFi devices");
      }
    }

    // Set default thing_name if base and not provided
    if (!deviceData.thing_name && deviceData.device_type === "base") {
      deviceData.thing_name = deviceData.device_id;
    }

    // Auto assign switch_no if base device
    if (deviceData.device_type === "base") {
      const currentDevices = user.spaces[spaceIndex].devices;
      const existingSwitches = currentDevices
        .filter(d => d.device_type === "base")
        .map(d => d.switch_no);
      const available = ["BM1", "BM2"].find(sw => !existingSwitches.includes(sw));

      if (!available) {
        throw new Error("Maximum 2 base devices already assigned in this space");
      }

      deviceData.switch_no = available;
      logger.info("Assigned switch_no", {
        switch_no: available,
        device_id: deviceData.device_id,
        traceId: traceInfo.traceId
      });
    }

    // Create BM1 and BM2 clones
    const bm1Device = { ...deviceData, switch_no: "BM1", status: "off" };
    const bm2Device = { ...deviceData, switch_no: "BM2", status: "off" };

    // Push to DB
    user.spaces[spaceIndex].devices.push(bm1Device, bm2Device);
    await user.save();

    // Optional MQTT send if WiFi
    if (deviceData.connection_type === "wifi" && deviceData.thing_name) {
      try {
        const topic = getTopic("config", deviceData.thing_name, "config");
        const message = {
          deviceid: deviceData.device_id,
          ssid: deviceData.ssid,
          password: deviceData.password,
          mode: 1
        };
        publish(topic, message);
        logger.info("Published MQTT config", { topic, message, traceId: traceInfo.traceId });
      } catch (e) {
        logger.error("MQTT publish error", { error: e.message, traceId: traceInfo.traceId });
      }
    }

    logger.info("Base device added", {
      device_id: deviceData.device_id,
      spaceId,
      traceId: traceInfo.traceId
    });

    return [bm1Device, bm2Device];
  } catch (error) {
    logger.error("Error in addDevice", {
      error: error.message,
      device_id: deviceData.device_id,
      traceId: traceInfo.traceId
    });
    throw error;
  }
}



// Add a tank device to a space and connect to base device
// Updated addTankDevice function in deviceService.js
// Updated addTankDevice function in deviceService.js
export async function addTankDevice(
  mobileNumber,
  spaceId,
  baseDeviceId,
  switchNo, // Add switch_no parameter
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

    // Find the specific base device with matching device_id AND switch_no
    const baseDevice = user.spaces[spaceIndex].devices.find(
      (device) =>
        device.device_id === baseDeviceId && 
        device.device_type === "base" &&
        device.switch_no === switchNo
    );

    if (!baseDevice) {
      throw new Error(`Base device with ID '${baseDeviceId}' and switch '${switchNo}' not found`);
    }

    // Validate switch_no
    if (!["BM1", "BM2"].includes(switchNo)) {
      throw new Error("Switch number must be either 'BM1' or 'BM2'");
    }

    // Count connected tanks for this specific base device switch
    const connectedTanks = user.spaces[spaceIndex].devices.filter(
      (device) => 
        device.device_type === "tank" && 
        device.parent_device_id === baseDeviceId &&
        device.parent_switch_no === switchNo // Add this field to track which switch
    );

    if (connectedTanks.length >= 2) { // Each switch can handle 2 tanks (TM1, TM2 for BM1 and TM3, TM4 for BM2)
      const tankNames = connectedTanks.map(tank => tank.device_name).join(', ');
      throw new Error(
        `Base device switch '${switchNo}' already has 2 tanks connected (${tankNames}). ` +
        `Please unassign one of the existing tanks before adding a new one. Maximum 2 tanks per switch allowed.`
      );
    }

    // Determine available slave names based on switch
    const slaveMapping = {
      "BM1": ["TM1", "TM2"],
      "BM2": ["TM1", "TM2"]
    };

    const usedSlaveNames = connectedTanks.map(tank => tank.slave_name);
    const availableSlaveNames = slaveMapping[switchNo].filter(
      slaveName => !usedSlaveNames.includes(slaveName)
    );

    if (availableSlaveNames.length === 0) {
      throw new Error(`No available slave names for switch ${switchNo}`);
    }

    // Automatically assign the first available slave name
    const autoAssignedSlaveName = availableSlaveNames[0];
    tankData.slave_name = autoAssignedSlaveName;

    logger.info(`Auto-assigned slave name: ${autoAssignedSlaveName} to tank: ${tankData.device_id} for switch: ${switchNo}`);

    // Check if tank device exists globally
    const globalCheck = await checkDeviceExistsGlobally(tankData.device_id);

    if (globalCheck.exists) {
      if (globalCheck.user.mobile_number === mobileNumber) {
        throw new Error(
          `Tank device '${tankData.device_id}' is already registered in your space '${globalCheck.space.space_name}'. Please remove it from there first before adding to another space.`
        );
      } else {
        throw new Error(
          `Tank device '${tankData.device_id}' is already registered to another account. Each device can only be registered to one account at a time.`
        );
      }
    }

    // Ensure required fields for tank model
    if (!tankData.device_name) {
      throw new Error("Device name is required");
    }

    // Set defaults for tank model
    tankData.device_type = "tank";
    tankData.parent_device_id = baseDeviceId;
    tankData.parent_switch_no = switchNo; // Add this field to track parent switch
    tankData.level = 0;

    // Set connection_type to "without_wifi" by default if not specified
    if (!tankData.connection_type) {
      tankData.connection_type = "without_wifi";
    }

    // For "without_wifi" mode, ensure channel and address fields
    if (tankData.connection_type === "without_wifi") {
      if (!tankData.channel) {
        tankData.channel = "24";
      }
      if (!tankData.address_l) {
        tankData.address_l = "0x01";
      }
      if (!tankData.address_h) {
        tankData.address_h = "0x01";
      }
    }

    // Add tank device to the space
    user.spaces[spaceIndex].devices.push(tankData);
    await user.save();

    // Get the newly added device
    const newTankDevice =
      user.spaces[spaceIndex].devices[
        user.spaces[spaceIndex].devices.length - 1
      ];

    // Send MQTT message using the base device's thing_name
    if (baseDevice.thing_name) {
      try {
        const slaveRequestTopic = getTopic(
          "slaveRequest",
          baseDevice.thing_name,
          "slaveRequest"
        );
        const slaveRequestMessage = {
          deviceid: baseDeviceId,
          switch_no: switchNo, // Include switch number in MQTT message
          sensor_no: autoAssignedSlaveName,
          slaveid: tankData.device_id,
        };

        // For "without_wifi" mode, add additional parameters
        if (tankData.connection_type === "without_wifi") {
          slaveRequestMessage.mode = 3;
          slaveRequestMessage.channel = tankData.channel;
          slaveRequestMessage.address_l = tankData.address_l;
          slaveRequestMessage.address_h = tankData.address_h;
          slaveRequestMessage.slave_name = autoAssignedSlaveName;
        }

        publish(slaveRequestTopic, slaveRequestMessage);
        logger.info(
          `Sent slave request for tank ${tankData.device_id} with slave name ${autoAssignedSlaveName} to base ${baseDeviceId} switch ${switchNo}`
        );
      } catch (mqttError) {
        logger.error(
          `Error sending slave request via MQTT: ${mqttError.message}`
        );
      }
    }

    return newTankDevice;
  } catch (error) {
    logger.error(`Error adding tank device: ${error.message}`);
    throw error;
  }
}

// Transfer device to another space within the same account
export async function transferDevice(mobileNumber, fromSpaceId, toSpaceId, deviceId) {
  const user = await User.findOne({ mobile_number: mobileNumber });
  if (!user) {
    throw new Error("User not found");
  }

  const fromSpaceIndex = user.spaces.findIndex(
    (space) => space._id.toString() === fromSpaceId
  );
  const toSpaceIndex = user.spaces.findIndex(
    (space) => space._id.toString() === toSpaceId
  );

  if (fromSpaceIndex === -1 || toSpaceIndex === -1) {
    throw new Error("Source or destination space not found");
  }

  // Find the device in the source space
  const deviceIndex = user.spaces[fromSpaceIndex].devices.findIndex(
    (device) => device.device_id === deviceId
  );

  if (deviceIndex === -1) {
    throw new Error("Device not found in source space");
  }

  const device = user.spaces[fromSpaceIndex].devices[deviceIndex];

  // If it's a base device, check for connected tank devices
  if (device.device_type === "base") {
    const connectedTanks = user.spaces[fromSpaceIndex].devices.filter(
      (d) => d.device_type === "tank" && d.parent_device_id === deviceId
    );

    if (connectedTanks.length > 0) {
      throw new Error(
        "Cannot transfer base device with connected tank devices. Please transfer or remove the tank devices first."
      );
    }
  }

  // Remove device from source space
  user.spaces[fromSpaceIndex].devices.splice(deviceIndex, 1);

  // Add device to destination space
  user.spaces[toSpaceIndex].devices.push(device);

  // Clean up any setups in the source space that used this device
  if (user.spaces[fromSpaceIndex].setups) {
    for (let i = 0; i < user.spaces[fromSpaceIndex].setups.length; i++) {
      const setup = user.spaces[fromSpaceIndex].setups[i];

      if (setup.condition.device_id === deviceId) {
        user.spaces[fromSpaceIndex].setups.splice(i, 1);
        i--;
        continue;
      }

      if (setup.condition.actions) {
        const actionIndex = setup.condition.actions.findIndex(
          (action) => action.device_id === deviceId
        );

        if (actionIndex !== -1) {
          setup.condition.actions.splice(actionIndex, 1);
          if (setup.condition.actions.length === 0) {
            user.spaces[fromSpaceIndex].setups.splice(i, 1);
            i--;
          }
        }
      }
    }
  }

  await user.save();

  return {
    success: true,
    message: `Device transferred successfully from ${user.spaces[fromSpaceIndex].space_name} to ${user.spaces[toSpaceIndex].space_name}`,
    device: device
  };
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

