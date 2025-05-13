// src/controllers/deviceController.js - Add tank device functionality
import * as deviceService from "../services/deviceService.js";

// Get all devices in a space
export const getAllDevices = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId } = req.params;
    const { type } = req.query; // Optional device type filter

    if (!spaceId) {
      return res.status(400).json({
        success: false,
        message: "Space ID is required",
      });
    }

    const devices = await deviceService.getSpaceDevices(mobile_number, spaceId);

    // Filter devices by type if specified
    const filteredDevices = type
      ? devices.filter((device) => device.device_type === type)
      : devices;

    // Ensure that devices is always returned as an array
    return res.status(200).json({
      success: true,
      data: Array.isArray(filteredDevices)
        ? filteredDevices
        : filteredDevices
        ? [filteredDevices]
        : [],
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
      message: error.message || "Failed to retrieve devices",
    });
  }
};

// Add other existing methods...

// Add a tank device to a space
export const addTankDevice = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId, baseDeviceId } = req.params;
    const tankData = req.body;

    if (!spaceId) {
      return res.status(400).json({
        success: false,
        message: "Space ID is required",
      });
    }

    if (!baseDeviceId) {
      return res.status(400).json({
        success: false,
        message: "Base device ID is required",
      });
    }

    // Validate required fields
    if (!tankData.device_id) {
      return res.status(400).json({
        success: false,
        message: "Device ID is required",
      });
    }

    if (!tankData.device_name) {
      return res.status(400).json({
        success: false,
        message: "Device name is required",
      });
    }

    if (!tankData.slave_name) {
      return res.status(400).json({
        success: false,
        message: "Slave name is required (e.g., TM1)",
      });
    }

    const newDevice = await deviceService.addTankDevice(
      mobile_number,
      spaceId,
      baseDeviceId,
      tankData
    );

    return res.status(201).json({
      success: true,
      data: newDevice,
      message: "Tank device added successfully",
    });
  } catch (error) {
    // Determine appropriate status code based on error
    let statusCode = 500;
    if (
      error.message === "User not found" ||
      error.message === "Space not found" ||
      error.message === "Base device not found or is not a base model"
    ) {
      statusCode = 404;
    }
    if (error.message.includes("already exists")) {
      statusCode = 409; // Conflict
    }
    if (error.message.includes("required")) {
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

// Update device status (for base devices)
export const updateDeviceStatus = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId, deviceId } = req.params;
    const { status } = req.body;

    if (!spaceId || !deviceId) {
      return res.status(400).json({
        success: false,
        message: "Space ID and Device ID are required",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const updatedDevice = await deviceService.updateDeviceStatus(
      mobile_number,
      spaceId,
      deviceId,
      status
    );

    return res.status(200).json({
      success: true,
      data: updatedDevice,
      message: `Device turned ${status} successfully`,
    });
  } catch (error) {
    // Determine appropriate status code based on error
    let statusCode = 500;
    if (
      error.message === "User not found" ||
      error.message === "Space not found" ||
      error.message === "Device not found"
    ) {
      statusCode = 404;
    }
    if (
      error.message.includes("Only base devices") ||
      error.message.includes("Status must be")
    ) {
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};
