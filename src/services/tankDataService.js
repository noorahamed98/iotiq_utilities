import { getLatestSensorData } from './migratedDataService.js';

export async function sensorData(req, res) {
  const { deviceid, sensorNumber } = req.params;
  const client = req.app.locals.dbClient;
  const useMongoDB = process.env.USE_MIGRATED_DATA === 'true';

  if (!deviceid || !sensorNumber) {
    return res.status(400).json({ success: false, message: 'deviceId and sensorNumber are required.' });
  }

  try {
    let result;
    
    if (useMongoDB) {
      // Use migrated MongoDB data
      const mongoResult = await getLatestSensorData(deviceid, sensorNumber);
      
      if (!mongoResult) {
        return res.status(404).json({ success: false, message: 'No data found for the given sensor.' });
      }
      
      // Convert MongoDB document to match PostgreSQL format
      const formattedResult = {
        deviceid: mongoResult.deviceid,
        sensor_no: mongoResult.sensor_no,
        switch_no: mongoResult.switch_no,
        level: mongoResult.level,
        status: mongoResult.status,
        message_type: mongoResult.message_type,
        timestamp: mongoResult.timestamp,
        thingid: mongoResult.thingid
      };
      
      res.json({ success: true, data: [formattedResult] });
    } else {
      // Use original PostgreSQL data
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

      res.json({ success: true, data: [result.rows[0]] }); //object to array
    }
  } catch (error) {
    console.error('Error fetching latest sensor data:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

export async function switchStatus(req, res) {
  const { deviceid, switchNumber } = req.params;
  const client = req.app.locals.dbClient;
  const useMongoDB = process.env.USE_MIGRATED_DATA === 'true';

  if (!deviceid || !switchNumber) {
    return res.status(400).json({ success: false, message: 'deviceId and sensorNumber are required.' });
  }

  try {
    let result;
    
    if (useMongoDB) {
      // Use migrated MongoDB data
      const { getLatestSwitchStatus } = await import('./migratedDataService.js');
      const mongoResult = await getLatestSwitchStatus(deviceid, switchNumber);
      
      if (!mongoResult) {
        return res.status(404).json({ success: false, message: 'No data found for the given switch.' });
      }
      
      // Convert MongoDB document to match PostgreSQL format
      const formattedResult = {
        deviceid: mongoResult.deviceid,
        sensor_no: mongoResult.sensor_no,
        switch_no: mongoResult.switch_no,
        level: mongoResult.level,
        status: mongoResult.status,
        message_type: mongoResult.message_type,
        timestamp: mongoResult.timestamp,
        thingid: mongoResult.thingid
      };
      
      // Convert status from "true"/"false" string to "on"/"off"
      if (formattedResult.status) {
        formattedResult.status = formattedResult.status === "true" ? "on" : "off";
      }
      
      res.json({ success: true, data: [formattedResult] });
    } else {
      // Use original PostgreSQL data
      result = await client.query(
        `
        SELECT *
        FROM tank_data
        WHERE switch_no = $1 AND deviceid = $2 AND status IS NOT null
        ORDER BY timestamp DESC
        LIMIT 1
        `,
        [switchNumber, deviceid]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'No data found for the given switch.' });
      }

      const data = result.rows[0];

      // Convert status from "true"/"false" string to "on"/"off"
      data.status = data.status === "true" ? "on" : "off";

      res.json({ success: true, data: [data] });
    }
  } catch (error) {
    console.error('Error fetching latest sensor data:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
