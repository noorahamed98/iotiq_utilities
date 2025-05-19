// src/utils/mqttHelper.js
import awsIot from "aws-iot-device-sdk";
import { AWS_IOT_CONFIG } from "../config/awsIotConfig.js";
import logger from "./logger.js";

let mqttClient = null;

// Connect to AWS IoT
export function connectMqtt() {
  try {
    mqttClient = awsIot.device({
      keyPath: AWS_IOT_CONFIG.keyPath,
      certPath: AWS_IOT_CONFIG.certPath,
      caPath: AWS_IOT_CONFIG.caPath,
      clientId: AWS_IOT_CONFIG.clientId,
      host: AWS_IOT_CONFIG.host,
      region: AWS_IOT_CONFIG.region,
    });

    mqttClient.on("connect", () => {
      logger.info("Connected to AWS IoT");
    });

    mqttClient.on("error", (error) => {
      logger.error("AWS IoT error:", error);
    });

    mqttClient.on("close", () => {
      logger.info("AWS IoT connection closed");
    });

    mqttClient.on("reconnect", () => {
      logger.info("Reconnecting to AWS IoT");
    });

    return mqttClient;
  } catch (error) {
    logger.error("Error connecting to AWS IoT:", error);
    throw error;
  }
}

// Get MQTT client
export function getMqttClient() {
  if (!mqttClient) {
    return connectMqtt();
  }
  return mqttClient;
}

// Subscribe to a topic
export function subscribe(topic) {
  const client = getMqttClient();
  client.subscribe(topic, { qos: 1 }, (err) => {
    if (err) {
      logger.error(`Error subscribing to ${topic}:`, err);
    } else {
      logger.info(`Subscribed to ${topic}`);
    }
  });
}

// Publish to a topic
export function publish(topic, message) {
  const client = getMqttClient();
  client.publish(topic, JSON.stringify(message), { qos: 1 }, (err) => {
    if (err) {
      logger.error(`Error publishing to ${topic}:`, err);
      return false;
    } else {
      logger.info(`Published to ${topic}: ${JSON.stringify(message)}`);
      return true;
    }
  });
}

// Close MQTT connection
export function closeMqtt() {
  if (mqttClient) {
    mqttClient.end();
    mqttClient = null;
  }
}
