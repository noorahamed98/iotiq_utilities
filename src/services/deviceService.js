import { User } from "../config/dbconfig.js";

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

  return space.devices || [];
}

// Get a specific device in a space
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

  return device;
}

// Add a new device to a space
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

  // Add device to the space
  user.spaces[spaceIndex].devices.push(deviceData);

  // Save the updated user document
  await user.save();

  // Return the newly added device
  return user.spaces[spaceIndex].devices[
    user.spaces[spaceIndex].devices.length - 1
  ];
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

  // Remove the device
  user.spaces[spaceIndex].devices.splice(deviceIndex, 1);

  // Save the updated user document
  await user.save();

  return { success: true, message: "Device deleted successfully" };
}
