/**
 * Migrated Control Service Helper
 * 
 * This service provides helper functions to replace PostgreSQL queries
 * in controlService.js with MongoDB equivalents when using migrated data.
 */

import mongoose from "mongoose";
import { getThingIdByDeviceId, getRecentDeviceResponses, getTankDataByMessageType } from './migratedDataService.js';

/**
 * Helper functions to read thingid and response documents from MongoDB.
 * Assumes a Mongo connection (mongoose) is already established elsewhere in app.
 */

const db = () => mongoose.connection.db;

/**
 * Attempt to find thingid by deviceid.
 * Checks in 'sensor_data' collection first, then falls back to looking through users.spaces.devices.
 */
export async function getThingIdByDeviceId(deviceid) {
  if (!deviceid) return null;

  const database = db();

  // 1) Try sensor_data collection (if migration kept same collection name)
  try {
    const sensorColl = database.collection("sensor_data");
    const row = await sensorColl.findOne({ deviceid });
    if (row && (row.thingid || row.thingId || row.thing_id)) {
      return row.thingid || row.thingId || row.thing_id;
    }
  } catch (err) {
    // ignore if collection missing
  }

  // 2) Fallback: search users -> spaces -> devices
  try {
    const usersColl = database.collection("users");
    const userDoc = await usersColl.findOne(
      { "spaces.devices.device_id": deviceid },
      { projection: { "spaces.$": 1 } }
    );

    if (userDoc && userDoc.spaces && userDoc.spaces.length) {
      for (const space of userDoc.spaces) {
        if (!space.devices) continue;
        for (const d of space.devices) {
          if (d.device_id === deviceid) {
            // try common field names for thing id
            return d.thingid || d.thingId || d.thing_id || d.thing || null;
          }
        }
      }
    }
  } catch (err) {
    // ignore
  }

  return null;
}

/**
 * Poll the 'slave_response' collection in MongoDB for a matching thingid.
 * Returns the document or null on timeout.
 */
export async function waitForSlaveResponseFromMongoDB(thingid, timeoutMs = 5000) {
  const database = db();
  const coll = database.collection("slave_response");
  const interval = 500;
  const start = Date.now();

  while (Date.now() - start <(timeoutMs)) {
    const since = new Date(Date.now() - 10000); // 10 seconds window
    const doc = await coll.findOne(
      { thingid, inserted_at: { $gte: since } },
      { sort: { inserted_at: -1 } }
    );
    if (doc) return sanitizeMongoDoc(doc);

    await new Promise((r) => setTimeout(r, interval));
  }

  return null;
}

/**
 * Check base responded by looking in 'tank_data' collection for alive_reply.
 */
export async function checkBaseRespondedInMongo(deviceid, timeoutMs = 5000) {
  const database = db();
  const coll = database.collection("tank_data");
  const pollInterval = 1000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const since = new Date(Date.now() - 10000);
    const doc = await coll.findOne(
      {
        deviceid,
        message_type: "alive_reply",
        timestamp: { $gte: since }
      },
      { sort: { timestamp: -1 } }
    );

    if (doc) return true;
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return false;
}

/**
 * Check tank responded by looking in 'tank_data' collection for update of sensor_no.
 */
export async function checkTankRespondedInMongo(deviceid, sensorNo, timeoutMs = 10000) {
  const database = db();
  const coll = database.collection("tank_data");
  const pollInterval = 1000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const since = new Date(Date.now() - 10000);
    const doc = await coll.findOne(
      {
        deviceid,
        sensor_no: sensorNo,
        message_type: "update",
        timestamp: { $gte: since }
      },
      { sort: { timestamp: -1 } }
    );

    if (doc) return true;
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return false;
}

function sanitizeMongoDoc(doc) {
  if (!doc) return doc;
  const sanitized = { ...doc };
  if (sanitized._id) sanitized._id = sanitized._id.toString();
  return sanitized;
}

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