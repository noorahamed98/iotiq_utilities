import * as deviceService from "../services/deviceService.js";

// Get all devices in a space
export const getAllDevices = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId } = req.params;

    if (!spaceId) {
      return res.status(400).json({
        success: false,
        message: "Space ID is required",
      });
    }

    const devices = await deviceService.getSpaceDevices(mobile_number, spaceId);

    return res.status(200).json({
      success: true,
      data: devices,
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

// Add to deviceController.js
export const getAllUserDevices = async (req, res) => {
  try {
    const { mobile_number, user_id } = req.user;
    const { userId } = req.params;

    // Security check - ensure the authenticated user is only accessing their own devices
    if (userId !== user_id) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only access your own devices.",
      });
    }

    const devices = await deviceService.getAllUserDevices(
      mobile_number,
      userId
    );

    return res.status(200).json({
      success: true,
      data: devices,
    });
  } catch (error) {
    // Determine appropriate status code based on error
    let statusCode = 500;
    if (error.message === "User not found") {
      statusCode = 404;
    }

    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to retrieve devices",
    });
  }
};

// Get a specific device by ID
export const getDeviceById = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId, deviceId } = req.params;

    if (!spaceId || !deviceId) {
      return res.status(400).json({
        success: false,
        message: "Space ID and Device ID are required",
      });
    }

    const device = await deviceService.getDeviceById(
      mobile_number,
      spaceId,
      deviceId
    );

    return res.status(200).json({
      success: true,
      data: device,
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

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

// Add a new device to a space
export const addDevice = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId } = req.params;
    const deviceData = req.body;

    if (!spaceId) {
      return res.status(400).json({
        success: false,
        message: "Space ID is required",
      });
    }

    // Validate required fields
    if (!deviceData.device_id) {
      return res.status(400).json({
        success: false,
        message: "Device ID is required",
      });
    }

    if (!deviceData.device_type) {
      return res.status(400).json({
        success: false,
        message: "Device type is required",
      });
    }

    if (!deviceData.device_name) {
      return res.status(400).json({
        success: false,
        message: "Device name is required",
      });
    }

    if (!deviceData.connection_type) {
      return res.status(400).json({
        success: false,
        message: "Connection type is required",
      });
    }

    // For wifi devices, validate WiFi credentials
    if (deviceData.connection_type === "wifi") {
      if (!deviceData.ssid || !deviceData.password) {
        return res.status(400).json({
          success: false,
          message: "SSID and password are required for WiFi devices",
        });
      }
    }

    const newDevice = await deviceService.addDevice(
      mobile_number,
      spaceId,
      deviceData
    );

    return res.status(201).json({
      success: true,
      data: newDevice,
      message: "Device added successfully",
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
    if (error.message.includes("already exists")) {
      statusCode = 409; // Conflict
    }
    if (error.message.includes("SSID and password are required")) {
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete a device from a space
export const deleteDevice = async (req, res) => {
  try {
    const { mobile_number } = req.user;
    const { spaceId, deviceId } = req.params;

    if (!spaceId || !deviceId) {
      return res.status(400).json({
        success: false,
        message: "Space ID and Device ID are required",
      });
    }

    const result = await deviceService.deleteDevice(
      mobile_number,
      spaceId,
      deviceId
    );

    return res.status(200).json({
      success: true,
      message: result.message,
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

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};
