// controlService.js - MongoDB Only Version
import AWS from "aws-sdk";
import {
  getThingIdByDeviceId,
  waitForSlaveResponseFromMongoDB,
  checkBaseRespondedInMongo,
  checkTankRespondedInMongo,
} from "../services/migratedControlService.js";
import logger from "../utils/logger.js";

const iotData = new AWS.IotData({
  endpoint: process.env.IOT_ENDPOINT,
  region: process.env.AWS_REGION || "ap-south-1",
});

/**
 * Control device via AWS IoT MQTT
 */
export async function control(req, res) {
  logger.info("🚀 CONTROL endpoint called", {
    user: req.user?.mobile_number,
    deviceid: req.body?.deviceid
  });

  try {
    const { deviceid } = req.body;

    if (!deviceid) {
      return res.status(400).json({
        success: false,
        error: "Missing deviceid in request"
      });
    }

    // Get thing ID from MongoDB
    const thingid = await getThingIdByDeviceId(deviceid);
    if (!thingid) {
      return res.status(404).json({
        success: false,
        error: "DeviceId not found or no associated thing ID"
      });
    }

    const topic = `mqtt/device/${thingid}/control`;

    const payload = JSON.stringify({
      ...req.body,
      requestedBy: req.user?.mobile_number,
      timestamp: new Date().toISOString()
    });

    // Publish to AWS IoT
    await iotData
      .publish({ topic, payload, qos: 0 })
      .promise();

    logger.info("✅ Control command published", {
      topic,
      deviceid,
      user: req.user?.mobile_number
    });

    res.status(200).json({
      success: true,
      message: "Published successfully",
      topic,
      user: req.user?.mobile_number
    });
  } catch (error) {
    logger.error("❌ Control publish error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: error.message
    });
  }
}

/**
 * Send device settings via AWS IoT MQTT
 */
export async function setting(deviceid, payload) {
  try {
    // Get thing ID from MongoDB
    const thingid = await getThingIdByDeviceId(deviceid);
    if (!thingid) {
      throw new Error(`No thingid found for deviceid: ${deviceid}`);
    }

    const topic = `mqtt/device/${thingid}/setting`;
    const finalPayload = JSON.stringify(payload);

    await iotData
      .publish({ topic, payload: finalPayload, qos: 0 })
      .promise();

    logger.info(`✅ Settings published to topic: ${topic}`, { deviceid, thingid });
    return { success: true, topic };
  } catch (error) {
    logger.error("❌ Settings publish error:", error);
    throw new Error(`MQTT Publish Failed: ${error.message}`);
  }
}

/**
 * Send slave request and wait for response
 */
export async function slaveRequest(req, res) {
  logger.info("🚀 SLAVE REQUEST endpoint called", {
    user: req.user?.mobile_number,
    deviceid: req.body?.deviceid
  });

  try {
    const { deviceid } = req.body;

    if (!deviceid) {
      return res.status(400).json({
        success: false,
        error: "Missing deviceid in request"
      });
    }

    // Get thing ID from MongoDB
    const thingid = await getThingIdByDeviceId(deviceid);
    if (!thingid) {
      return res.status(404).json({
        success: false,
        error: "DeviceId not found or no associated thing ID"
      });
    }

    const requestTopic = `mqtt/device/${thingid}/slave_request`;

    const payload = JSON.stringify({
      ...req.body,
      requestedBy: req.user?.mobile_number,
      timestamp: new Date().toISOString()
    });

    // Publish using AWS IoT Core
    await iotData.publish({
      topic: requestTopic,
      payload,
      qos: 0
    }).promise();

    logger.info("✅ Slave request published to:", requestTopic);

    // Poll MongoDB for response
    const response = await waitForSlaveResponseFromMongoDB(thingid, 5000);

    return res.status(200).json({
      success: true,
      message: response ? "Published and response received" : "Published but no response received",
      topic: requestTopic,
      data: response ? {
        ...response.response_data,
        channel: response.response_data?.channel ? parseInt(response.response_data.channel) : response.response_data?.channel
      } : null,
      user: req.user?.mobile_number
    });

  } catch (error) {
    logger.error("❌ Slave request error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: error.message
    });
  }
}

/**
 * Check if base device responded
 */
export async function isBaseResponded(req, res) {
  const { deviceid } = req.params;

  if (!deviceid) {
    return res.status(400).json({ 
      success: false, 
      message: 'Device ID is required.' 
    });
  }

  try {
    logger.info(`Checking base response for device: ${deviceid}`);
    
    const responded = await checkBaseRespondedInMongo(deviceid, 5000);
    
    if (responded) {
      return res.status(200).json({
        success: true,
        message: 'Base responded successfully.'
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Base did not respond.'
    });
  } catch (error) {
    logger.error('Error checking base response:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
      details: error.message
    });
  }
}

/**
 * Check if tank device responded
 */
export async function isTankResponded(req, res) {
  const { deviceid, sensorNumber } = req.params;

  if (!deviceid || !sensorNumber) {
    return res.status(400).json({ 
      success: false, 
      message: 'Device ID and Sensor Number are required.' 
    });
  }

  try {
    logger.info(`Checking tank response for device: ${deviceid}, sensor: ${sensorNumber}`);
    
    const responded = await checkTankRespondedInMongo(deviceid, sensorNumber, 10000);
    
    if (responded) {
      return res.status(200).json({
        success: true,
        message: 'Tank responded successfully.'
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Tank did not respond.'
    });
  } catch (error) {
    logger.error('Error checking tank response:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
      details: error.message
    });
  }
}

export default {
  control,
  setting,
  slaveRequest,
  isBaseResponded,
  isTankResponded
};