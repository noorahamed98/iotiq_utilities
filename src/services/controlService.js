import AWS from "aws-sdk";
import {
  getThingIdByDeviceId,
  waitForSlaveResponseFromMongoDB,
  checkBaseRespondedInMongo,
  checkTankRespondedInMongo,
} from "../services/migratedControlService.js";

const iotData = new AWS.IotData({
  endpoint: process.env.IOT_ENDPOINT,
  region: "ap-south-1",
});


export async function control(req, res) {
  // const client = req.app.locals.dbClient;
  console.log("Using MongoDB path for control");
  console.log("Authenticated user:", req.user);
  console.log("🚀 CONTROL ENDPOINT REACHED - This should only appear if auth passes!");

  try {
    const { deviceid } = req.body;

    if (!deviceid) {
      return res.status(400).json({
        success: false,
        error: "Missing deviceid in request"
      });
    }

    const thingid = await getThingIdByDeviceId(deviceid);
    if (!thingid) {
      return res.status(404).json({
        success: false,
        error: "DeviceId not found"
      });
    }

    const topic = `mqtt/device/${thingid}/control`;

    const payload = JSON.stringify({
      ...req.body,
      requestedBy: req.user?.mobile_number,
      timestamp: new Date().toISOString()
    });

    await iotData
      .publish({ topic, payload, qos: 0 })
      .promise();

    res.status(200).json({
      success: true,
      message: "Published successfully",
      topic,
      user: req.user?.mobile_number
    });
  } catch (error) {
    console.error("Publish error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: error.message
    });
  }
};

export async function setting(client, deviceid, payload) {
  try {
    // accept either original signature (client param) or use mongo
    const thingid = await getThingIdByDeviceId(deviceid);
    if (!thingid) {
      throw new Error(`No thingid found for deviceid: ${deviceid}`);
    }

    const topic = `mqtt/device/${thingid}/setting`;
    console.log(topic);
    const finalPayload = JSON.stringify(payload);

    await iotData
      .publish({ topic, payload: finalPayload, qos: 0 })
      .promise();

    console.log(`✅ Payload published to topic: ${topic}`);
    return { success: true, topic };
  } catch (error) {
    console.error("❌ Publish error in setting():", error);
    throw new Error(`MQTT Publish Failed: ${error.message}`);
  }
}

export async function slaveRequest(req, res) {
  // const client = req.app.locals.dbClient;
  console.log("Using MongoDB path for slaveRequest");
  console.log("Authenticated user:", req.user);
  console.log("🚀 SLAVE REQUEST ENDPOINT REACHED");

  try {
    const { deviceid } = req.body;

    if (!deviceid) {
      return res.status(400).json({
        success: false,
        error: "Missing deviceid in request"
      });
    }

    const thingid = await getThingIdByDeviceId(deviceid);
    if (!thingid) {
      return res.status(404).json({
        success: false,
        error: "DeviceId not found"
      });
    }

    const requestTopic = `mqtt/device/${thingid}/slave_request`;

    const payload = JSON.stringify({
      ...req.body
    });

    // Publish using AWS IoT Core
    await iotData.publish({
      topic: requestTopic,
      payload,
      qos: 0
    }).promise();
    console.log("✅ Payload published to:", requestTopic);

    // Poll MongoDB for response
    const response = await waitForSlaveResponseFromMongoDB(thingid, 5000);

    return res.status(200).json({
      success: true,
      message: "Published and response received",
      topic: requestTopic,
      data: response ? {
        ...response,
        channel: response.channel ? parseInt(response.channel) : response.channel
      } : null,
      user: req.user?.mobile_number
    });

  } catch (error) {
    console.error("slaveRequest error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: error.message
    });
  }
}

export async function isBaseResponded(req, res) {
  const { deviceid } = req.params;
  // const client = req.app.locals.dbClient;

  if (!deviceid) {
    return res.status(400).json({ success: false, message: 'Device ID is required.' });
  }

  try {
    const responded = await checkBaseRespondedInMongo(deviceid, 5000);
    if (responded) {
      return res.status(200).json({
        success: true,
        message: 'Base responded successfully.'
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Base is not responded.'
    });
  } catch (error) {
    console.error('Error checking base response:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
}


export async function isTankResponded(req, res) {
  const { deviceid, sensorNumber } = req.params;
  // const client = req.app.locals.dbClient;

  if (!deviceid || !sensorNumber) {
    return res.status(400).json({ success: false, message: 'Device ID and Sensor Number is required.' });
  }

  try {
    const responded = await checkTankRespondedInMongo(deviceid, sensorNumber, 10000);
    if (responded) {
      return res.status(200).json({
        success: true,
        message: 'Tank responded successfully.'
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Tank is not responded.'
    });
  } catch (error) {
    console.error('Error checking tank response:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
}
