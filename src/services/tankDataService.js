// src/services/tankDataService.js - COMPLETE VERSION with simple filter
import { getLatestSensorData, getLatestSwitchStatus, TankReading } from './migratedDataService.js';
import { publishToIoT } from '../utils/mqttHelper.js';
import { getTopic } from '../config/awsIotConfig.js';
import { User } from '../config/dbconfig.js';
import logger from '../utils/logger.js';

/**
 * ✅ Fetch latest tank sensor data from MongoDB
 * ✅ ADDED: Simple condition - only return if device_type is slave AND value > 0
 */
export async function sensorData(req, res) {
  const { deviceid, sensorNumber } = req.params;

  logger.info(`📊 sensorData API called with deviceid: ${deviceid}, sensorNumber: ${sensorNumber}`);

  if (!deviceid || !sensorNumber) {
    return res.status(400).json({
      success: false,
      message: 'deviceId and sensorNumber are required.',
    });
  }

  try {
    // Find the device to determine if it's a base or tank device
    const user = await User.findOne({
      "spaces.devices.device_id": deviceid
    });

    let baseDeviceId = deviceid;
    let thingName = null;

    if (user) {
      for (const space of user.spaces) {
        const device = space.devices.find(d => d.device_id === deviceid);
        
        if (device) {
          logger.info(`✅ Found device:`, {
            device_id: device.device_id,
            device_type: device.device_type,
            sensor_no: sensorNumber
          });

          // If it's a tank device, find its parent base device
          if (device.device_type === "tank") {
            baseDeviceId = device.parent_device_id;
            logger.info(`📌 Tank device detected, using parent base device: ${baseDeviceId}`);
            
            // Find parent device for thing_name
            const parentDevice = space.devices.find(d => 
              d.device_id === device.parent_device_id && 
              d.switch_no === device.parent_switch_no
            );
            
            if (parentDevice?.thing_name) {
              thingName = parentDevice.thing_name;
              
              // Publish update request to get fresh data
              try {
                const updateTopic = getTopic("update", thingName, "update");
                const updateMsg = {
                  deviceid: baseDeviceId,
                  device: "tank",
                  sensor_no: sensorNumber,
                  slaveid: deviceid,
                  switch_no: device.parent_switch_no,
                  request_type: "poll"
                };
                
                await publishToIoT(updateTopic, updateMsg);
                logger.info(`📤 Published update request for tank ${deviceid}`, updateMsg);
              } catch (publishError) {
                logger.error(`⚠️ Error publishing update request: ${publishError.message}`);
              }
            }
          } 
          // If it's a base device
          else if (device.device_type === "base" && device.thing_name) {
            thingName = device.thing_name;
            
            // Publish update request
            try {
              const updateTopic = getTopic("update", thingName, "update");
              const updateMsg = {
                deviceid: deviceid,
                device: "base",
                switch_no: sensorNumber,
                status: device.status || "off",
                sensor_no: sensorNumber,
                value: device.status === "on" ? "1" : "0",
                request_type: "poll"
              };
              
              await publishToIoT(updateTopic, updateMsg);
              logger.info(`📤 Published update request for base ${deviceid}`, updateMsg);
            } catch (publishError) {
              logger.error(`⚠️ Error publishing update request: ${publishError.message}`);
            }
          }
          break;
        }
      }
    }

    // Query MongoDB - now returns last document with value > 0
    logger.info(`🔍 Querying MongoDB with baseDeviceId: ${baseDeviceId}, sensorNumber: ${sensorNumber}`);
    const mongoResult = await getLatestSensorData(baseDeviceId, sensorNumber);

    if (!mongoResult) {
      logger.warn(`⚠️ No data found with value > 0 for base device ${baseDeviceId}, sensor ${sensorNumber}`);
      
      return res.status(404).json({
        success: false,
        message: 'No data found with value > 0 for the given sensor.',
        debug: {
          queried_deviceid: baseDeviceId,
          queried_sensor: sensorNumber,
          original_deviceid: deviceid
        }
      });
    }

    // ✅ Data already filtered by query (value > 0), just format and return
    logger.info(`✅ Found data with value > 0:`, mongoResult);

    const formattedResult = {
      deviceid: mongoResult.deviceid,
      sensor_no: mongoResult.sensor_no,
      switch_no: mongoResult.switch_no,
      level: mongoResult.level || mongoResult.value,
      value: mongoResult.value,
      status: mongoResult.status,
      message_type: mongoResult.message_type,
      timestamp: mongoResult.timestamp,
      thingid: mongoResult.thingid,
      device_type: mongoResult.device_type
    };

    logger.info(`✅ Returning sensor data:`, formattedResult);

    res.json({ 
      success: true, 
      data: [formattedResult] 
    });
    
  } catch (error) {
    logger.error('❌ Error fetching latest sensor data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: error.message,
    });
  }
}

/**
 * Fetch latest switch status from MongoDB
 */
export async function switchStatus(req, res) {
  const { deviceid, switchNumber } = req.params;

  logger.info(`📊 switchStatus API called with deviceid: ${deviceid}, switchNumber: ${switchNumber}`);

  if (!deviceid || !switchNumber) {
    return res.status(400).json({
      success: false,
      message: 'deviceId and switchNumber are required.',
    });
  }

  try {
    // Find the device and publish update request
    const user = await User.findOne({
      "spaces.devices.device_id": deviceid
    });

    if (user) {
      for (const space of user.spaces) {
        const device = space.devices.find(d => 
          d.device_id === deviceid && 
          d.switch_no === switchNumber
        );
        
        if (device && device.thing_name) {
          try {
            const updateTopic = getTopic("update", device.thing_name, "update");
            const updateMsg = {
              deviceid: deviceid,
              device: "base",
              switch_no: switchNumber,
              status: device.status || "off",
              sensor_no: switchNumber,
              value: device.status === "on" ? "1" : "0",
              request_type: "poll"
            };
            
            await publishToIoT(updateTopic, updateMsg);
            logger.info(`📤 Published update request for switch ${deviceid}/${switchNumber}`, updateMsg);
          } catch (publishError) {
            logger.error(`⚠️ Error publishing update request: ${publishError.message}`);
          }
          break;
        }
      }
    }

    // Fetch latest switch status from MongoDB
    logger.info(`🔍 Querying MongoDB for switch status: ${deviceid}/${switchNumber}`);
    const mongoResult = await getLatestSwitchStatus(deviceid, switchNumber);

    if (!mongoResult) {
      logger.warn(`⚠️ No switch data found for ${deviceid}/${switchNumber}`);
      
      return res.status(404).json({
        success: false,
        message: 'No data found for the given switch.',
      });
    }

    const formattedResult = {
      deviceid: mongoResult.deviceid,
      sensor_no: mongoResult.sensor_no,
      switch_no: mongoResult.switch_no,
      value: mongoResult.value || mongoResult.level,
      status: mongoResult.status === 'true' || mongoResult.status === 'on' ? 'on' : 'off',
      timestamp: mongoResult.timestamp,
      thingid: mongoResult.thingid,
    };

    logger.info(`✅ Returning switch status:`, formattedResult);

    res.json({ 
      success: true, 
      data: [formattedResult] 
    });
    
  } catch (error) {
    logger.error('❌ Error fetching latest switch data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: error.message,
    });
  }
}

/**
 * Handle IoT message forwarding through Lambda
 */
export async function forwardToIoT(deviceid, messageType, payload) {
  try {
    const topic = getTopic(messageType, deviceid, messageType);
    await publishToIoT(topic, payload);

    logger.info(`✅ Forwarded ${messageType} message to IoT Core via Lambda for ${deviceid}`);
  } catch (err) {
    logger.error(`❌ Error forwarding message to IoT for ${deviceid}: ${err.message}`);
  }
}

/**
 * Handle incoming MQTT data (used by AWS IoT → Lambda → MongoDB path)
 */
export async function handleMqttIncomingData(message) {
  try {
    const { deviceid, sensor_no, switch_no, value, status, timestamp, thingId } = message;

    if (!deviceid) {
      logger.warn('Received MQTT message without deviceid');
      return;
    }

    const now = timestamp ? new Date(timestamp) : new Date();

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
      raw_data: message,
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

  logger.info(`📊 getHistoricalData called for ${deviceid}/${sensorNumber}`);

  if (!deviceid) {
    return res.status(400).json({
      success: false,
      message: 'deviceId is required.',
    });
  }

  try {
    const query = { deviceid };

    if (sensorNumber) query.sensor_no = sensorNumber;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const readings = await TankReading.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();

    logger.info(`✅ Found ${readings.length} historical records`);

    res.json({
      success: true,
      data: readings,
      count: readings.length,
    });
  } catch (error) {
    logger.error('❌ Error fetching historical data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: error.message,
    });
  }
}

export default {
  sensorData,
  switchStatus,
  handleMqttIncomingData,
  getHistoricalData,
  forwardToIoT,
};