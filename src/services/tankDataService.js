// tankDataService.js
import { getLatestSensorData } from './migratedDataService.js';
import { publish, getMqttClient } from '../utils/mqttHelper.js';
import logger from '../utils/logger.js';

/**
 * Fetch latest tank sensor data
 * Now also subscribes to MQTT update topics for live sync
 */
export async function sensorData(req, res) {
  const { deviceid, sensorNumber } = req.params;
  const client = req.app.locals.dbClient;
  const useMongoDB = process.env.USE_MIGRATED_DATA === 'true';

  if (!deviceid || !sensorNumber) {
    return res.status(400).json({ success: false, message: 'deviceId and sensorNumber are required.' });
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

    let result;

    if (useMongoDB) {
      // Use MongoDB
      const mongoResult = await getLatestSensorData(deviceid, sensorNumber);

      if (!mongoResult) {
        return res.status(404).json({ success: false, message: 'No data found for the given sensor.' });
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
    } else {
      // Use PostgreSQL
      result = await client.query(
        `
        SELECT *
        FROM tank_data
        WHERE sensor_no = $1 AND deviceid = $2
        ORDER BY timestamp DESC
        LIMIT 1
        `,
        [sensorNumber, deviceid]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'No data found for the given sensor.' });
      }

      res.json({ success: true, data: [result.rows[0]] });
    }
  } catch (error) {
    logger.error('Error fetching latest sensor data:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

/**
 * Fetch latest switch status
 * Reflects real-time MQTT updates via $aws/things/(thingId)/update
 */
export async function switchStatus(req, res) {
  const { deviceid, switchNumber } = req.params;
  const client = req.app.locals.dbClient;
  const useMongoDB = process.env.USE_MIGRATED_DATA === 'true';

  if (!deviceid || !switchNumber) {
    return res.status(400).json({ success: false, message: 'deviceId and switchNumber are required.' });
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

    let result;

    if (useMongoDB) {
      const { getLatestSwitchStatus } = await import('./migratedDataService.js');
      const mongoResult = await getLatestSwitchStatus(deviceid, switchNumber);

      if (!mongoResult) {
        return res.status(404).json({ success: false, message: 'No data found for the given switch.' });
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
    } else {
      result = await client.query(
        `
        SELECT *
        FROM tank_data
        WHERE switch_no = $1 AND deviceid = $2
        ORDER BY timestamp DESC
        LIMIT 1
        `,
        [switchNumber, deviceid]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'No data found for the given switch.' });
      }

      const data = result.rows[0];
      data.status = data.status === "true" ? "on" : "off";

      res.json({ success: true, data: [data] });
    }
  } catch (error) {
    logger.error('Error fetching latest switch data:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

/**
 * 🧩 NEW FUNCTION
 * Handle incoming MQTT messages and update DB (MongoDB or PostgreSQL)
 */
export async function handleMqttIncomingData(message) {
  try {
    const { deviceid, sensor_no, switch_no, value, status, timestamp, thingId } = message;
    if (!deviceid) return;

    const useMongoDB = process.env.USE_MIGRATED_DATA === 'true';
    const now = timestamp || new Date().toISOString();

    if (useMongoDB) {
      // Insert or update in MongoDB
      const { saveMqttDataToMongo } = await import('./migratedDataService.js');
      await saveMqttDataToMongo({
        deviceid,
        sensor_no,
        switch_no,
        value,
        status,
        message_type: 'mqtt_update',
        timestamp: now,
        thingid: thingId,
      });
      logger.info(`MQTT data saved to MongoDB for ${deviceid}`);
    } else {
      // Insert or update in PostgreSQL
      const dbClient = global.pgClient;
      await dbClient.query(
        `
        INSERT INTO tank_data (deviceid, sensor_no, switch_no, value, status, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (deviceid, sensor_no)
        DO UPDATE SET
          value = EXCLUDED.value,
          status = EXCLUDED.status,
          timestamp = EXCLUDED.timestamp
        `,
        [deviceid, sensor_no, switch_no, value, status, now]
      );
      logger.info(`MQTT data updated in PostgreSQL for ${deviceid}`);
    }
  } catch (err) {
    logger.error(`❌ Error handling MQTT data: ${err.message}`);
  }
}
