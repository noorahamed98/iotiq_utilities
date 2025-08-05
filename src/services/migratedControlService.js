/**
 * Migrated Control Service Helper
 * 
 * This service provides helper functions to replace PostgreSQL queries
 * in controlService.js with MongoDB equivalents when using migrated data.
 */

import { getThingIdByDeviceId, getRecentDeviceResponses, getTankDataByMessageType } from './migratedDataService.js';

/**
 * Get thing ID for a device (replaces PostgreSQL sensor_data query)
 * @param {string} deviceId - Device ID
 * @returns {Promise<string|null>} Thing ID
 */
export async function getThingIdFromMongoDB(deviceId) {
  try {
    const thingId = await getThingIdByDeviceId(deviceId);
    return thingId;
  } catch (error) {
    console.error('Error fetching thing ID from MongoDB:', error);
    throw error;
  }
}

/**
 * Wait for slave response (replaces PostgreSQL slave_response polling)
 * @param {string} thingId - Thing ID
 * @param {number} maxWait - Maximum wait time in milliseconds
 * @returns {Promise<Object|null>} Response data or null if timeout
 */
export async function waitForSlaveResponseFromMongoDB(thingId, maxWait = 10000) {
  const interval = 500; // poll every 0.5 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    try {
      const responses = await getRecentDeviceResponses(thingId, 10);
      
      if (responses && responses.length > 0) {
        // Return the most recent response
        return responses[0].response_data;
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (error) {
      console.error('Error polling for slave response from MongoDB:', error);
      throw error;
    }
  }

  return null; // Timeout
}

/**
 * Wait for alive reply (replaces PostgreSQL tank_data polling for alive_reply)
 * @param {string} deviceId - Device ID
 * @param {number} maxWait - Maximum wait time in milliseconds
 * @returns {Promise<Object|null>} Response data or null if timeout
 */
export async function waitForAliveReplyFromMongoDB(deviceId, maxWait = 10000) {
  const interval = 500; // poll every 0.5 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    try {
      const responses = await getTankDataByMessageType(deviceId, 'alive_reply', null, 10);
      
      if (responses && responses.length > 0) {
        // Return the most recent response
        return responses[0];
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (error) {
      console.error('Error polling for alive reply from MongoDB:', error);
      throw error;
    }
  }

  return null; // Timeout
}

/**
 * Wait for sensor update (replaces PostgreSQL tank_data polling for update messages)
 * @param {string} deviceId - Device ID
 * @param {string} sensorNo - Sensor number
 * @param {number} maxWait - Maximum wait time in milliseconds
 * @returns {Promise<Object|null>} Response data or null if timeout
 */
export async function waitForSensorUpdateFromMongoDB(deviceId, sensorNo, maxWait = 10000) {
  const interval = 500; // poll every 0.5 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    try {
      const responses = await getTankDataByMessageType(deviceId, 'update', sensorNo, 10);
      
      if (responses && responses.length > 0) {
        // Return the most recent response
        return responses[0];
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (error) {
      console.error('Error polling for sensor update from MongoDB:', error);
      throw error;
    }
  }

  return null; // Timeout
}

/**
 * Helper function to determine if MongoDB should be used
 * @returns {boolean} True if MongoDB should be used
 */
export function shouldUseMongoDB() {
  return process.env.USE_MIGRATED_DATA === 'true';
}

export default {
  getThingIdFromMongoDB,
  waitForSlaveResponseFromMongoDB,
  waitForAliveReplyFromMongoDB,
  waitForSensorUpdateFromMongoDB,
  shouldUseMongoDB
};