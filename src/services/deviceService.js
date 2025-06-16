// src/services/deviceService.js - Update with global device uniqueness checks
import { User } from "../config/dbconfig.js";
import { getMqttClient, publish } from "../utils/mqttHelper.js";
import { getTopic } from "../config/awsIotConfig.js";
import logger from "../utils/logger.js";

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

  // Check if device exists globally
  const globalCheck = await checkDeviceExistsGlobally(
    deviceData.device_id,
    deviceData.thing_name
  );

  if (globalCheck.exists) {
    if (globalCheck.user.mobile_number === mobileNumber) {
      throw new Error(
        `Device '${deviceData.device_id}' is already registered in your space '${globalCheck.space.space_name}'. Please remove it from there first.`
      );
    } else {
      throw new Error(
        `Device '${deviceData.device_id}' is already registered to another account.`
      );
    }
  }

  if (deviceData.connection_type === "wifi") {
    if (!deviceData.ssid || !deviceData.password) {
      throw new Error("SSID and password are required for WiFi devices");
    }
  }

  // Set thing_name if not provided
  if (!deviceData.thing_name && deviceData.device_type === "base") {
    deviceData.thing_name = deviceData.device_id;
  }

  // ✅ AUTO-ASSIGN switch_no
  // ✅ Assign switch_no only for base devices
if (deviceData.device_type === "base") {
  const currentDevices = user.spaces[spaceIndex].devices;

  const existingSwitches = currentDevices
    .filter((d) => d.device_type === "base")
    .map((d) => d.switch_no);

  const available = ["BM1", "BM2"].find(
    (sw) => !existingSwitches.includes(sw)
  );

  if (!available) {
    throw new Error("Maximum 2 base devices already assigned in this space");
  }

  deviceData.switch_no = available;
  console.log("✅ Assigned switch:", available);
}


  user.spaces[spaceIndex].devices.push(deviceData);
  await user.save();

  const newDevice =
    user.spaces[spaceIndex].devices[user.spaces[spaceIndex].devices.length - 1];

  // Send config over MQTT
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
    } catch (e) {
      console.error("MQTT error:", e.message);
    }
  }

  return newDevice;
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

    const connectedTanks = user.spaces[spaceIndex].devices.filter(
  (device) => 
    device.device_type === "tank" && 
    device.parent_device_id === baseDeviceId
);

if (connectedTanks.length >= 4) {
  // Create a helpful error message with connected tank names
  const tankNames = connectedTanks.map(tank => tank.device_name).join(', ');
  throw new Error(
    `Base device '${baseDevice.device_name}' already has 4 tanks connected (${tankNames}). ` +
    `Please unassign one of the existing tanks before adding a new one. Maximum 4 tanks per base device allowed.`
  );
}

const usedSlaveNames = connectedTanks.map(tank => tank.slave_name);
const availableSlaveNames = ['TM1', 'TM2', 'TM3', 'TM4'].filter(
  slaveName => !usedSlaveNames.includes(slaveName)
);

// Automatically assign the first available slave name
const autoAssignedSlaveName = availableSlaveNames[0];

// Override the slave_name in tankData
tankData.slave_name = autoAssignedSlaveName;

logger.info(`Auto-assigned slave name: ${autoAssignedSlaveName} to tank: ${tankData.device_id}`);
    // Check if tank device exists globally
    const globalCheck = await checkDeviceExistsGlobally(tankData.device_id);

    if (globalCheck.exists) {
      // Check if it's the same user trying to add to a different space
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
      sensor_no: autoAssignedSlaveName, // Use auto-assigned name instead of tankData.slave_name
      slaveid: tankData.device_id,
        };

        // For "without_wifi" mode, add additional parameters
        if (tankData.connection_type === "without_wifi") {
      slaveRequestMessage.mode = 3;
      slaveRequestMessage.channel = tankData.channel;
      slaveRequestMessage.address_l = tankData.address_l;
      slaveRequestMessage.address_h = tankData.address_h;
      slaveRequestMessage.slave_name = autoAssignedSlaveName; // Use auto-assigned name
    }
        // Send MQTT message to base device to connect to tank
 publish(slaveRequestTopic, slaveRequestMessage);
    logger.info(
      `Sent slave request for tank ${tankData.device_id} with slave name ${autoAssignedSlaveName} to base ${baseDeviceId}`
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

