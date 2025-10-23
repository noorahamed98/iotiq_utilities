/**
 * Migrated Data Service
 * 
 * This service provides methods to query the migrated PostgreSQL data
 * from MongoDB collections without affecting existing functionality.
 */

import mongoose from 'mongoose';

// MongoDB Schemas for migrated data (matching migration script)
const tankReadingSchema = new mongoose.Schema({
  deviceid: { type: String, required: true, index: true },
  sensor_no: { type: String, index: true },
  switch_no: { type: String, index: true },
  level: { type: Number },
  value: { type: Number }, // Original value field from PostgreSQL
  status: { type: String },
  message_type: { type: String, index: true },
  timestamp: { type: Date, required: true, index: true },
  thingid: { type: String, index: true },
  raw_data: { type: mongoose.Schema.Types.Mixed },
  migrated_at: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'tank_readings'
});

const sensorMetadataSchema = new mongoose.Schema({
  deviceid: { type: String, required: true, unique: true, index: true },
  thingid: { type: String, required: true, index: true },
  device_type: { type: String },
  connection_info: { type: mongoose.Schema.Types.Mixed },
  first_seen: { type: Date },
  last_seen: { type: Date },
  migrated_at: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'sensor_metadata'
});

const deviceResponseSchema = new mongoose.Schema({
  thingid: { type: String, required: true, index: true },
  deviceid: { type: String, index: true },
  response_type: { type: String, index: true },
  response_data: { type: mongoose.Schema.Types.Mixed },
  inserted_at: { type: Date, required: true, index: true },
  migrated_at: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'device_responses'
});

// Create models
const TankReading = mongoose.model('TankReading', tankReadingSchema);
const SensorMetadata = mongoose.model('SensorMetadata', sensorMetadataSchema);
const DeviceResponse = mongoose.model('DeviceResponse', deviceResponseSchema);

/**
 * Get latest sensor data for a device (equivalent to PostgreSQL tank_data query)
 * @param {string} deviceId - Device ID
 * @param {string} sensorNumber - Sensor number
 * @returns {Promise<Object>} Latest sensor reading
 */
export async function getLatestSensorData(deviceId, sensorNumber) {
  try {
    const result = await TankReading.findOne({
      deviceid: deviceId,
      sensor_no: sensorNumber
    })
    .sort({ timestamp: -1 })
    .lean();

    return result;
  } catch (error) {
    console.error('Error fetching latest sensor data from MongoDB:', error);
    throw error;
  }
}

/**
 * Get latest switch status for a device
 * @param {string} deviceId - Device ID
 * @param {string} switchNumber - Switch number
 * @returns {Promise<Object>} Latest switch status
 */
export async function getLatestSwitchStatus(deviceId, switchNumber) {
  try {
    const result = await TankReading.findOne({
      deviceid: deviceId,
      switch_no: switchNumber,
      status: { $ne: null }
    })
    .sort({ timestamp: -1 })
    .lean();

    return result;
  } catch (error) {
    console.error('Error fetching latest switch status from MongoDB:', error);
    throw error;
  }
}

/**
 * Get historical sensor data for a device within a time range
 * @param {string} deviceId - Device ID
 * @param {string} sensorNumber - Sensor number (optional)
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {number} limit - Maximum number of records (default: 1000)
 * @returns {Promise<Array>} Historical sensor readings
 */
export async function getHistoricalSensorData(deviceId, sensorNumber = null, startDate, endDate, limit = 1000) {
  try {
    const query = {
      deviceid: deviceId,
      timestamp: {
        $gte: startDate,
        $lte: endDate
      }
    };

    if (sensorNumber) {
      query.sensor_no = sensorNumber;
    }

    const results = await TankReading.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return results;
  } catch (error) {
    console.error('Error fetching historical sensor data from MongoDB:', error);
    throw error;
  }
}

/**
 * Get sensor metadata by device ID
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} Sensor metadata
 */
export async function getSensorMetadata(deviceId) {
  try {
    const result = await SensorMetadata.findOne({ deviceid: deviceId }).lean();
    return result;
  } catch (error) {
    console.error('Error fetching sensor metadata from MongoDB:', error);
    throw error;
  }
}

/**
 * Get thing ID for a device (equivalent to PostgreSQL sensor_data query)
 * @param {string} deviceId - Device ID
 * @returns {Promise<string>} Thing ID
 */
export async function getThingIdByDeviceId(deviceId) {
  try {
    const result = await SensorMetadata.findOne({ deviceid: deviceId }, { thingid: 1 }).lean();
    return result ? result.thingid : null;
  } catch (error) {
    console.error('Error fetching thing ID from MongoDB:', error);
    throw error;
  }
}

/**
 * Get recent device responses
 * @param {string} thingId - Thing ID
 * @param {number} seconds - Number of seconds to look back (default: 10)
 * @returns {Promise<Array>} Recent device responses
 */
export async function getRecentDeviceResponses(thingId, seconds = 10) {
  try {
    const cutoffTime = new Date(Date.now() - (seconds * 1000));
    
    const results = await DeviceResponse.find({
      thingid: thingId,
      inserted_at: { $gte: cutoffTime }
    })
    .sort({ inserted_at: -1 })
    .lean();

    return results;
  } catch (error) {
    console.error('Error fetching recent device responses from MongoDB:', error);
    throw error;
  }
}

/**
 * Get tank data with specific message type and time range
 * @param {string} deviceId - Device ID
 * @param {string} messageType - Message type (e.g., 'alive_reply', 'update')
 * @param {string} sensorNo - Sensor number (optional)
 * @param {number} seconds - Number of seconds to look back (default: 10)
 * @returns {Promise<Array>} Matching tank readings
 */
export async function getTankDataByMessageType(deviceId, messageType, sensorNo = null, seconds = 10) {
  try {
    const cutoffTime = new Date(Date.now() - (seconds * 1000));
    
    const query = {
      deviceid: deviceId,
      message_type: messageType,
      timestamp: { $gte: cutoffTime }
    };

    if (sensorNo) {
      query.sensor_no = sensorNo;
    }

    const results = await TankReading.find(query)
      .sort({ timestamp: -1 })
      .lean();

    return results;
  } catch (error) {
    console.error('Error fetching tank data by message type from MongoDB:', error);
    throw error;
  }
}

/**
 * Get aggregated sensor statistics
 * @param {string} deviceId - Device ID
 * @param {string} sensorNumber - Sensor number
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Aggregated statistics
 */
export async function getSensorStatistics(deviceId, sensorNumber, startDate, endDate) {
  try {
    const pipeline = [
      {
        $match: {
          deviceid: deviceId,
          sensor_no: sensorNumber,
          timestamp: { $gte: startDate, $lte: endDate },
          level: { $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          avgLevel: { $avg: '$level' },
          minLevel: { $min: '$level' },
          maxLevel: { $max: '$level' },
          totalReadings: { $sum: 1 },
          firstReading: { $min: '$timestamp' },
          lastReading: { $max: '$timestamp' }
        }
      }
    ];

    const result = await TankReading.aggregate(pipeline);
    return result[0] || null;
  } catch (error) {
    console.error('Error fetching sensor statistics from MongoDB:', error);
    throw error;
  }
}

/**
 * Search tank readings with flexible criteria
 * @param {Object} criteria - Search criteria
 * @param {Object} options - Query options (sort, limit, skip)
 * @returns {Promise<Array>} Matching tank readings
 */
export async function searchTankReadings(criteria = {}, options = {}) {
  try {
    const {
      sort = { timestamp: -1 },
      limit = 100,
      skip = 0
    } = options;

    const results = await TankReading.find(criteria)
      .sort(sort)
      .limit(limit)
      .skip(skip)
      .lean();

    return results;
  } catch (error) {
    console.error('Error searching tank readings from MongoDB:', error);
    throw error;
  }
}

/**
 * Get collection statistics
 * @returns {Promise<Object>} Collection statistics
 */
export async function getMigrationStatistics() {
  try {
    const tankReadingsCount = await TankReading.countDocuments();
    const sensorMetadataCount = await SensorMetadata.countDocuments();
    const deviceResponsesCount = await DeviceResponse.countDocuments();

    // Get date ranges
    const oldestTankReading = await TankReading.findOne({}, { timestamp: 1 }).sort({ timestamp: 1 });
    const newestTankReading = await TankReading.findOne({}, { timestamp: 1 }).sort({ timestamp: -1 });

    return {
      collections: {
        tank_readings: tankReadingsCount,
        sensor_metadata: sensorMetadataCount,
        device_responses: deviceResponsesCount
      },
      dateRange: {
        oldest: oldestTankReading ? oldestTankReading.timestamp : null,
        newest: newestTankReading ? newestTankReading.timestamp : null
      }
    };
  } catch (error) {
    console.error('Error fetching migration statistics:', error);
    throw error;
  }
}

export {
  TankReading,
  SensorMetadata,
  DeviceResponse
};