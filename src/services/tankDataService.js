// tankDataService.js - MongoDB Only Version
import { getLatestSensorData, getLatestSwitchStatus } from './migratedDataService.js';
import { TankReading } from './migratedDataService.js';
import { publish, getMqttClient } from '../utils/mqttHelper.js';
import logger from '../utils/logger.js';

/**
 * Fetch latest tank sensor data from MongoDB
 * Subscribes to MQTT update topics for live sync
 */
export async function sensorData(req, res) {
  const { deviceid, sensorNumber } = req.params;

  if (!deviceid || !sensorNumber) {
    return res.status(400).json({ 
      success: false, 
      message: 'deviceId and sensorNumber are required.' 
    });
  }

  try {
    // Subscribe to real-time MQTT topics for live updates
    const mqttClient = getMqttClient();
    const updateTopic = `$aws/things/${deviceid}/update`;
    const statusTopic = `$aws/things/${deviceid}/status_response`;

    mqttClient.subscribe(updateTopic);
    mqttClient.subscribe(statusTopic);

    mqttClient.on('message', async (topic, messageBuffer) => {
      try {
        const message = JSON.parse(messageBuffer.toString());
        if (topic.includes('/update') || topic.includes('/status_response')) {
          await handleMqttIncomingData(message);
        }
      } catch (err) {
        logger.error(`Error parsing MQTT message for ${topic}: ${err.message}`);
      }
    });

    // Fetch from MongoDB
    const mongoResult = await getLatestSensorData(deviceid, sensorNumber);

    if (!mongoResult) {
      return res.status(404).json({ 
        success: false, 
        message: 'No data found for the given sensor.' 
      });
    }

    const formattedResult = {
      deviceid: mongoResult.deviceid,
      sensor_no: mongoResult.sensor_no,
      switch_no: mongoResult.switch_no,
      level: mongoResult.level,
      value: mongoResult.value || mongoResult.level,
      status: mongoResult.status,
      message_type: mongoResult.message_type,
      timestamp: mongoResult.timestamp,
      thingid: mongoResult.thingid,
    };

    res.json({ success: true, data: [formattedResult] });
  } catch (error) {
    logger.error('Error fetching latest sensor data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error',
      details: error.message 
    });
  }
}

/**
 * Fetch latest switch status from MongoDB
 * Reflects real-time MQTT updates via $aws/things/(thingId)/update
 */
export async function switchStatus(req, res) {
  const { deviceid, switchNumber } = req.params;

  if (!deviceid || !switchNumber) {
    return res.status(400).json({ 
      success: false, 
      message: 'deviceId and switchNumber are required.' 
    });
  }

  try {
    // Subscribe to MQTT topics for live switch updates
    const mqttClient = getMqttClient();
    const updateTopic = `$aws/things/${deviceid}/update`;

    mqttClient.subscribe(updateTopic);

    mqttClient.on('message', async (topic, messageBuffer) => {
      try {
        const message = JSON.parse(messageBuffer.toString());
        if (topic.includes('/update') && message.switch_no === switchNumber) {
          await handleMqttIncomingData(message);
        }
      } catch (err) {
        logger.error(`Error processing switch MQTT update: ${err.message}`);
      }
    });

    // Fetch from MongoDB
    const mongoResult = await getLatestSwitchStatus(deviceid, switchNumber);

    if (!mongoResult) {
      return res.status(404).json({ 
        success: false, 
        message: 'No data found for the given switch.' 
      });
    }

    const formattedResult = {
      deviceid: mongoResult.deviceid,
      sensor_no: mongoResult.sensor_no,
      switch_no: mongoResult.switch_no,
      value: mongoResult.value || mongoResult.level,
      status: mongoResult.status === "true" ? "on" : "off",
      timestamp: mongoResult.timestamp,
      thingid: mongoResult.thingid,
    };

    res.json({ success: true, data: [formattedResult] });
  } catch (error) {
    logger.error('Error fetching latest switch data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error',
      details: error.message 
    });
  }
}

/**
 * Handle incoming MQTT messages and update MongoDB
 */
export async function handleMqttIncomingData(message) {
  try {
    const { deviceid, sensor_no, switch_no, value, status, timestamp, thingId } = message;
    
    if (!deviceid) {
      logger.warn('Received MQTT message without deviceid');
      return;
    }

    const now = timestamp ? new Date(timestamp) : new Date();

    // Save to MongoDB
    const tankReading = new TankReading({
      deviceid,
      sensor_no,
      switch_no,
      level: value,
      value,
      status,
      message_type: 'mqtt_update',
      timestamp: now,
      thingid: thingId || message.thingid,
      raw_data: message
    });

    await tankReading.save();
    logger.info(`✅ MQTT data saved to MongoDB for device ${deviceid}`);
  } catch (err) {
    logger.error(`❌ Error handling MQTT data: ${err.message}`);
  }
}

/**
 * Get historical sensor data for a device
 */
export async function getHistoricalData(req, res) {
  const { deviceid, sensorNumber } = req.params;
  const { startDate, endDate, limit = 1000 } = req.query;

  if (!deviceid) {
    return res.status(400).json({ 
      success: false, 
      message: 'deviceId is required.' 
    });
  }

  try {
    const query = { deviceid };
    
    if (sensorNumber) {
      query.sensor_no = sensorNumber;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const readings = await TankReading.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ 
      success: true, 
      data: readings,
      count: readings.length 
    });
  } catch (error) {
    logger.error('Error fetching historical data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error',
      details: error.message 
    });
  }
}

export default {
  sensorData,
  switchStatus,
  handleMqttIncomingData,
  getHistoricalData
};