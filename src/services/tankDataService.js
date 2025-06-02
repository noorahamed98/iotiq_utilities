export async function sensorData(req, res) {
  const { deviceid, sensorNumber } = req.params;
  const client = req.app.locals.dbClient;

  if (!deviceid || !sensorNumber) {
    return res.status(400).json({ success: false, message: 'deviceId and sensorNumber are required.' });
  }

  try {
    const result = await client.query(
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
  } catch (error) {
    console.error('Error fetching latest sensor data:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

export async function switchStatus(req, res) {
  const { deviceid, switchNumber } = req.params;
  const client = req.app.locals.dbClient;

  if (!deviceid || !switchNumber) {
    return res.status(400).json({ success: false, message: 'deviceId and sensorNumber are required.' });
  }

  try {
    const result = await client.query(
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

    res.json({ success: true, data: [result.rows[0]] }); //object to array
  } catch (error) {
    console.error('Error fetching latest sensor data:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
