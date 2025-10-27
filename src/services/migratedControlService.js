/**
 * Control Service Helper - MongoDB Only
 * 
 * This service provides helper functions to query MongoDB for device control operations
 */

import mongoose from "mongoose";
import logger from "../utils/logger.js";

const db = () => mongoose.connection.db;

/**
 * Get thingid by deviceid from MongoDB
 * Checks in sensor_metadata collection first, then falls back to users.spaces.devices
 */
export async function getThingIdByDeviceId(deviceid) {
  if (!deviceid) {
    logger.warn('getThingIdByDeviceId called without deviceid');
    return null;
  }

  const database = db();

  // 1) Try sensor_metadata collection
  try {
    const sensorColl = database.collection("sensor_metadata");
    const row = await sensorColl.findOne({ deviceid });
    if (row && (row.thingid || row.thingId || row.thing_id)) {
      return row.thingid || row.thingId || row.thing_id;
    }
  } catch (err) {
    logger.error(`Error querying sensor_metadata: ${err.message}`);
  }

  // 2) Fallback: search users -> spaces -> devices
  try {
    const usersColl = database.collection("users");
    const userDoc = await usersColl.findOne(
      { "spaces.devices.device_id": deviceid },
      { projection: { spaces: 1 } }
    );

    if (userDoc && userDoc.spaces) {
      for (const space of userDoc.spaces) {
        if (!space.devices) continue;
        for (const device of space.devices) {
          if (device.device_id === deviceid) {
            return device.thing_name || device.thingid || device.thingId || device.thing_id || null;
          }
        }
      }
    }
  } catch (err) {
    logger.error(`Error querying users collection: ${err.message}`);
  }

  logger.warn(`No thingid found for deviceid: ${deviceid}`);
  return null;
}

/**
 * Poll the device_responses collection in MongoDB for a matching thingid
 * Returns the document or null on timeout
 */
export async function waitForSlaveResponseFromMongoDB(thingid, timeoutMs = 10000) {
  const database = db();
  const coll = database.collection("device_responses");
  const interval = 500;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const since = new Date(Date.now() - 10000); // 10s window

    try {
      const doc = await coll.findOne(
        {
          thingid,
          inserted_at: { $gte: since },
          $or: [
            { response_type: 'slave_response' },
            { response_type: 'slave-resp' },
            { response_type: { $regex: /^slave/i } },
            { 'response_data.type': { $regex: /slave/i } },
            { 'response_data.response_type': { $regex: /slave/i } }
          ]
        },
        { sort: { inserted_at: -1 } }
      );

      if (doc) {
        logger.info(`✅ Slave response found for thingid: ${thingid}`);
        return doc;
      }
    } catch (err) {
      logger.error(`Error polling slave response: ${err.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  logger.warn(`Timeout waiting for slave response for thingid: ${thingid}`);
  return null;
}

/**
 * Check if base device responded by looking in tank_readings collection for alive_reply
 */
export async function checkBaseRespondedInMongo(deviceid, timeoutMs = 5000) {
  const database = db();
  const coll = database.collection("tank_readings");
  const pollInterval = 1000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const since = new Date(Date.now() - 10000);
    
    try {
      const doc = await coll.findOne(
        {
          deviceid,
          message_type: "alive_reply",
          timestamp: { $gte: since }
        },
        { sort: { timestamp: -1 } }
      );

      if (doc) {
        logger.info(`✅ Base device ${deviceid} responded`);
        return true;
      }
    } catch (err) {
      logger.error(`Error checking base response: ${err.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  logger.warn(`Base device ${deviceid} did not respond within ${timeoutMs}ms`);
  return false;
}

/**
 * Check if tank device responded by looking in tank_readings collection for update of sensor_no
 */
export async function checkTankRespondedInMongo(deviceid, sensorNo, timeoutMs = 10000) {
  const database = db();
  const coll = database.collection("tank_readings");
  const pollInterval = 1000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const since = new Date(Date.now() - 10000);
    
    try {
      const doc = await coll.findOne(
        {
          deviceid,
          sensor_no: sensorNo,
          message_type: "update",
          timestamp: { $gte: since }
        },
        { sort: { timestamp: -1 } }
      );

      if (doc) {
        logger.info(`✅ Tank device ${deviceid} (${sensorNo}) responded`);
        return true;
      }
    } catch (err) {
      logger.error(`Error checking tank response: ${err.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  logger.warn(`Tank device ${deviceid} (${sensorNo}) did not respond within ${timeoutMs}ms`);
  return false;
}

/**
 * Sanitize MongoDB document by converting _id to string
 */
function sanitizeMongoDoc(doc) {
  if (!doc) return doc;
  const sanitized = { ...doc };
  if (sanitized._id) sanitized._id = sanitized._id.toString();
  return sanitized;
}

/**
 * Get recent device responses from MongoDB
 */
export async function getRecentDeviceResponses(thingid, seconds = 10) {
  const database = db();
  const coll = database.collection("device_responses");
  const cutoffTime = new Date(Date.now() - (seconds * 1000));

  try {
    const results = await coll.find({
      thingid,
      inserted_at: { $gte: cutoffTime }
    })
    .sort({ inserted_at: -1 })
    .toArray();

    return results.map(sanitizeMongoDoc);
  } catch (err) {
    logger.error(`Error getting recent device responses: ${err.message}`);
    return [];
  }
}

export default {
  getThingIdByDeviceId,
  waitForSlaveResponseFromMongoDB,
  checkBaseRespondedInMongo,
  checkTankRespondedInMongo,
  getRecentDeviceResponses
};