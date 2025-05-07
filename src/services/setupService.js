// src/services/setupService.js
import { User } from "../config/dbconfig.js";

/**
 * Create or update setup configuration for a space
 * @param {String} mobileNumber - User's mobile number
 * @param {String} spaceId - Space ID
 * @param {Object} setupData - Setup configuration data
 * @returns {Object} The updated setup configuration
 */
export async function createOrUpdateSetup(mobileNumber, spaceId, setupData) {
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

  // Get the space
  const space = user.spaces[spaceIndex];

  // Validate that the condition device exists in the space
  const conditionDeviceId = setupData.condition.device_id;
  const conditionDevice = space.devices.find(
    (device) => device.device_id === conditionDeviceId
  );

  if (!conditionDevice) {
    throw new Error(
      `Condition device with ID '${conditionDeviceId}' not found in this space`
    );
  }

  // Validate that the device type matches what's specified in condition
  if (conditionDevice.device_type !== setupData.condition.device_type) {
    throw new Error(
      `Device type mismatch. Device '${conditionDeviceId}' is of type '${conditionDevice.device_type}', not '${setupData.condition.device_type}'`
    );
  }

  // For base device conditions, validate status field
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

  // For tank device conditions, validate level field
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
  }

  // Validate each action device exists and is of type 'base'
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

    // Ensure action device is a base device
    if (actionDevice.device_type !== "base") {
      throw new Error(
        `Device '${actionDeviceId}' must be of type 'base' to be used in actions`
      );
    }

    // Validate action status
    if (!action.set_status || !["on", "off"].includes(action.set_status)) {
      throw new Error(
        "set_status field is required and must be 'on' or 'off' for actions"
      );
    }
  }

  // Set the setup for the space
  user.spaces[spaceIndex].setup = setupData;

  // Save the updated user document
  await user.save();

  return user.spaces[spaceIndex].setup;
}

/**
 * Get setup configuration for a space
 * @param {String} mobileNumber - User's mobile number
 * @param {String} spaceId - Space ID
 * @returns {Object} The setup configuration
 */
export async function getSetup(mobileNumber, spaceId) {
  const user = await User.findOne({ mobile_number: mobileNumber });
  if (!user) {
    throw new Error("User not found");
  }

  const space = user.spaces.find((space) => space._id.toString() === spaceId);
  if (!space) {
    throw new Error("Space not found");
  }

  return space.setup || null;
}
