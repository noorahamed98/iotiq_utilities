// src/services/migratedDataService.js - UPDATED with value > 0 filter
import mongoose from "mongoose";
import logger from "../utils/logger.js";

const db = () => mongoose.connection.db;

// Tank Reading Schema
const tankReadingSchema = new mongoose.Schema({
  deviceid: String,
  parent_deviceid: String,
  device_type: String,
  sensor_no: String,
  switch_no: String,
  level: Number,
  value: mongoose.Schema.Types.Mixed,
  status: String,
  message_type: String,
  timestamp: { type: Date, default: Date.now },
  thingid: String,
  channel: String,
  addl: String,
  addh: String,
  raw_data: mongoose.Schema.Types.Mixed
}, { timestamps: true });

export const TankReading = mongoose.model("TankReading", tankReadingSchema, "tank_readings");

/**
 * ✅ UPDATED: Get latest sensor data with value > 0
 * Returns the most recent document where value > 0
 */
export async function getLatestSensorData(deviceid, sensorNo) {
  logger.info(`🔍 Getting latest sensor data (value > 0) for deviceid: ${deviceid}, sensor_no: ${sensorNo}`);
  
  try {
    const database = db();
    const collection = database.collection("tank_readings");
    
    // ✅ Query for the LAST document with value > 0
    const query = {
      deviceid: deviceid,
      sensor_no: sensorNo,
      message_type: "update",
      $or: [
        { value: { $gt: 0 } },  // value as number
        { value: { $gt: "0" } } // value as string
      ]
    };
    
    logger.info(`🔍 Query (last value > 0):`, JSON.stringify(query, null, 2));
    
    const result = await collection.findOne(
      query,
      { 
        sort: { timestamp: -1 }, // Most recent first
        projection: {
          deviceid: 1,
          sensor_no: 1,
          switch_no: 1,
          level: 1,
          value: 1,
          status: 1,
          message_type: 1,
          timestamp: 1,
          thingid: 1,
          device_type: 1
        }
      }
    );

    if (result) {
      logger.info(`✅ Found sensor data with value > 0:`, JSON.stringify(result, null, 2));
      return result;
    } else {
      logger.warn(`⚠️ No sensor data found with value > 0 for deviceid: ${deviceid}, sensor_no: ${sensorNo}`);
      
      // Debug: Check what's in the database
      const recentRecords = await collection.find(
        { deviceid: deviceid, sensor_no: sensorNo },
        { sort: { timestamp: -1 }, limit: 5 }
      ).toArray();
      
      logger.info(`📊 Recent records for deviceid ${deviceid}, sensor ${sensorNo}:`, 
        recentRecords.map(r => ({
          sensor_no: r.sensor_no,
          level: r.level,
          value: r.value,
          timestamp: r.timestamp,
          message_type: r.message_type
        }))
      );
      
      return null;
    }
  } catch (error) {
    logger.error(`❌ Error getting latest sensor data:`, error);
    throw error;
  }
}

/**
 * Get latest switch status for a base device
 */
export async function getLatestSwitchStatus(deviceid, switchNo) {
  logger.info(`🔍 Getting latest switch status for deviceid: ${deviceid}, switch_no: ${switchNo}`);
  
  try {
    const database = db();
    const collection = database.collection("tank_readings");
    
    const query = {
      deviceid: deviceid,
      $or: [
        { switch_no: switchNo },
        { sensor_no: switchNo }
      ],
      device_type: { $in: ["base", null] },
      message_type: "update"
    };
    
    logger.info(`🔍 Query:`, JSON.stringify(query, null, 2));
    
    const result = await collection.findOne(
      query,
      { 
        sort: { timestamp: -1 },
        projection: {
          deviceid: 1,
          sensor_no: 1,
          switch_no: 1,
          value: 1,
          status: 1,
          timestamp: 1,
          thingid: 1
        }
      }
    );

    if (result) {
      logger.info(`✅ Found switch status:`, JSON.stringify(result, null, 2));
      return result;
    } else {
      logger.warn(`⚠️ No switch status found for deviceid: ${deviceid}, switch_no: ${switchNo}`);
      return null;
    }
  } catch (error) {
    logger.error(`❌ Error getting latest switch status:`, error);
    throw error;
  }
}

/**
 * Save MQTT data from topicHandlers
 */
export async function saveMqttDataToMongo(data) {
  try {
    const database = db();
    const collection = database.collection("tank_readings");
    
    const document = {
      deviceid: data.deviceid,
      sensor_no: data.sensor_no,
      switch_no: data.switch_no,
      level: data.level,
      value: data.value,
      status: data.status,
      message_type: data.message_type,
      timestamp: data.timestamp || new Date(),
      thingid: data.thingid,
      channel: data.channel,
      addl: data.addl,
      addh: data.addh,
      raw_data: data.raw_data
    };
    
    const result = await collection.insertOne(document);
    logger.info(`✅ Saved MQTT data to tank_readings:`, result.insertedId);
    
    return result;
  } catch (error) {
    logger.error(`❌ Error saving MQTT data:`, error);
    throw error;
  }
}

/**
 * Save device response (for slave responses, etc.)
 */
export async function saveDeviceResponse(thingid, deviceid, responseType, responseData) {
  try {
    const database = db();
    const collection = database.collection("device_responses");
    
    const document = {
      thingid: thingid,
      deviceid: deviceid,
      response_type: responseType,
      response_data: responseData,
      inserted_at: new Date()
    };
    
    const result = await collection.insertOne(document);
    logger.info(`✅ Saved device response:`, result.insertedId);
    
    return result;
  } catch (error) {
    logger.error(`❌ Error saving device response:`, error);
    throw error;
  }
}

/**
 * Get historical sensor data with filters
 */
export async function getHistoricalSensorData(deviceid, sensorNo, startDate, endDate, limit = 1000) {
  try {
    const database = db();
    const collection = database.collection("tank_readings");
    
    const query = {
      deviceid: deviceid,
      message_type: "update"
    };
    
    if (sensorNo) {
      query.sensor_no = sensorNo;
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    const results = await collection.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    
    logger.info(`✅ Found ${results.length} historical records`);
    return results;
  } catch (error) {
    logger.error(`❌ Error getting historical data:`, error);
    throw error;
  }
}

/**
 * Get all sensor data for a device (for debugging)
 */
export async function getAllSensorDataForDevice(deviceid) {
  try {
    const database = db();
    const collection = database.collection("tank_readings");
    
    const results = await collection.find({ deviceid: deviceid })
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();
    
    logger.info(`✅ Found ${results.length} total records for device ${deviceid}`);
    return results;
  } catch (error) {
    logger.error(`❌ Error getting all sensor data:`, error);
    throw error;
  }
}

export default {
  TankReading,
  getLatestSensorData,
  getLatestSwitchStatus,
  saveMqttDataToMongo,
  saveDeviceResponse,
  getHistoricalSensorData,
  getAllSensorDataForDevice
};