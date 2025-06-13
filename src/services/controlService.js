import AWS from "aws-sdk";

const iotData = new AWS.IotData({
  endpoint: process.env.IOT_ENDPOINT,
  region: "ap-south-1",
});


export async function control(req, res) {
  const client = req.app.locals.dbClient;
  console.log("DB client:", !!client); // For debugging
  console.log("Authenticated user:", req.user); // Log authenticated user info
  console.log("🚀 CONTROL ENDPOINT REACHED - This should only appear if auth passes!");

  try {
    const { deviceid } = req.body;

    if (!deviceid) {
      return res.status(400).json({ 
        success: false,
        error: "Missing deviceid in request" 
      });
    }

    const result = await client.query(
      "SELECT thingid FROM sensor_data WHERE deviceid = $1 LIMIT 1",
      [deviceid]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ 
        success: false,
        error: "DeviceId not found" 
      });
    }

    const thingid = result.rows[0].thingid;
    const topic = `mqtt/device/${thingid}/control`;

    const payload = JSON.stringify({
      ...req.body,
      // Optional: Add user info to the payload for tracking
      requestedBy: req.user.mobile_number,
      timestamp: new Date().toISOString()
    });

    await iotData
      .publish({ topic, payload, qos: 0 })
      .promise();

    res.status(200).json({ 
      success: true,
      message: "Published successfully", 
      topic,
      user: req.user.mobile_number // Optional: return user info
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
    const result = await client.query(
      "SELECT thingid FROM sensor_data WHERE deviceid = $1 LIMIT 1",
      [deviceid]
    );

    if (result.rowCount === 0) {
      throw new Error(`No thingid found for deviceid: ${deviceid}`);
    }

    const thingid = result.rows[0].thingid;
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
  const client = req.app.locals.dbClient;
  console.log("DB client:", !!client);
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

    const result = await client.query(
      "SELECT thingid FROM sensor_data WHERE deviceid = $1 LIMIT 1",
      [deviceid]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ 
        success: false,
        error: "DeviceId not found" 
      });
    }

    const thingid = result.rows[0].thingid;
    const requestTopic = `mqtt/device/${thingid}/slave_request`;

    const payload = JSON.stringify({
      ...req.body
    });

    // 1. Publish using AWS IoT Core
    await iotData.publish({
      topic: requestTopic,
      payload,
      qos: 0
    }).promise();
    console.log("✅ Payload published to:", requestTopic);

    // 2. Poll database for response
    const waitForResponse = async () => {
      const maxWait = 5000; // 5 seconds timeout
      const interval = 500; // poll every 0.5 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const responseQuery = await client.query(
          `SELECT * FROM slave_response
           WHERE thingid = $1
             AND inserted_at >= NOW() - INTERVAL '10 seconds'
           ORDER BY inserted_at DESC
           LIMIT 1`,
          [thingid]
        );

        if (responseQuery.rowCount > 0) {
          console.log("✅ Response received from DB");
          return responseQuery.rows[0];
        }

        console.log("⏳ Waiting for response...");
        await new Promise(resolve => setTimeout(resolve, interval));
      }

      throw new Error("Timeout waiting for MQTT response in DB");
    };

    const response = await waitForResponse();

    return res.status(200).json({ 
      success: true,
      message: "Published and response received", 
      topic: requestTopic,
      data: {
        ...response,
        channel: parseInt(response.channel)
      },
      user: req.user.mobile_number
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
  const client = req.app.locals.dbClient;

  if (!deviceid) {
    return res.status(400).json({ success: false, message: 'Device ID is required.' });
  }

  const startTime = Date.now();
  const maxWait = 5000; // 10 seconds
  const pollInterval = 1000; // check every 1 second

  try {
    while (Date.now() - startTime < maxWait) {
      const responseQuery = await client.query(
        `SELECT * FROM tank_data
         WHERE deviceid = $1
           AND message_type = 'alive_reply'
           AND timestamp >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') - INTERVAL '10 seconds'
         ORDER BY timestamp DESC
         LIMIT 1`,
        [deviceid]
      );

      if (responseQuery.rows.length > 0) {
        return res.status(200).json({
          success: true,
          message: deviceid+'Base responded successfully.'
        });
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timed out with no response
    return res.status(404).json({
      success: false,
      message: deviceid+'Base is not responded.'
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
  const { deviceid,sensorNumber } = req.params;
  const client = req.app.locals.dbClient;

  if (!deviceid || !sensorNumber) {
    return res.status(400).json({ success: false, message: 'Device ID and Sensor Number is required.' });
  }

  const startTime = Date.now();
  const maxWait = 10000; // 10 seconds
  const pollInterval = 1000; // check every 1 second

  try {
    while (Date.now() - startTime < maxWait) {
      const responseQuery = await client.query(
        `SELECT * FROM tank_data
         WHERE deviceid = $1 
           AND sensor_no = $2
           AND message_type = 'update'
           AND timestamp >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') - INTERVAL '10 seconds'
         ORDER BY timestamp DESC
         LIMIT 1`,
        [deviceid,sensorNumber]
      );
      console.log(responseQuery.rows)
      if (responseQuery.rows.length > 0) {
        return res.status(200).json({
          success: true,
          message: 'Tank responded successfully.'
        });
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timed out with no response
    return res.status(404).json({
      success: false,
      message: deviceid+'Tank is not responded.'
    });

  } catch (error) {
    console.error('Error checking base response:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
}