import AWS from "aws-sdk";

const iotData = new AWS.IotData({
  endpoint: process.env.IOT_ENDPOINT || "a34dc4u8qfki7y-ats.iot.ap-south-1.amazonaws.com",
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