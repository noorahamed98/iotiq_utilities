// Update src/routes/protectedRoutes.js to include setup routes
import express from "express";
import { universalAuth } from "../middlewares/authMiddleware.js";
import * as spaceController from "../controllers/spaceController.js";
import * as deviceController from "../controllers/deviceController.js";
import * as setupController from "../controllers/setupController.js";
import * as notificationController from "../controllers/notificationController.js";

const router = express.Router();

// Space routes
// -------------
router.get("/spaces", universalAuth, spaceController.getAllSpaces);
router.get("/spaces/:spaceId", universalAuth, spaceController.getSpaceById);
router.post("/spaces", universalAuth, spaceController.createSpace);
router.put("/spaces/:spaceId", universalAuth, spaceController.updateSpace);
router.delete("/spaces/:spaceId", universalAuth, spaceController.deleteSpace);

// Device routes
// -------------
router.get(
  "/spaces/:spaceId/devices",
  universalAuth,
  deviceController.getAllDevices
);
router.get(
  "/spaces/:spaceId/devices/:deviceId",
  universalAuth,
  deviceController.getDeviceById
);
router.get(
  "/users/:userId/devices",
  universalAuth,
  deviceController.getAllUserDevices
);
router.post(
  "/spaces/:spaceId/devices",
  universalAuth,
  deviceController.addDevice
);
router.post(
  "/spaces/:spaceId/devices/:baseDeviceId/tank",
  universalAuth,
  deviceController.addTankDevice
); // New route for adding tank devices
router.delete(
  "/spaces/:spaceId/devices/:deviceId",
  universalAuth,
  deviceController.deleteDevice
);

// Setup routes
// -------------
router.get("/spaces/:spaceId/setups", universalAuth, setupController.getSetups);
router.get(
  "/spaces/:spaceId/setups/:setupId",
  universalAuth,
  setupController.getSetupById
);
router.post(
  "/spaces/:spaceId/setups",
  universalAuth,
  setupController.createSetup
);
router.put(
  "/spaces/:spaceId/setups/:setupId",
  universalAuth,
  setupController.updateSetup
);
router.put(
  "/spaces/:spaceId/setups/:setupId/status",
  universalAuth,
  setupController.updateSetupStatus
);
router.delete(
  "/spaces/:spaceId/setups/:setupId",
  universalAuth,
  setupController.deleteSetup
);

// Notification routes
// -------------
router.get(
  "/notifications",
  universalAuth,
  notificationController.getUserNotifications
);
router.put(
  "/notifications/:notificationId/read",
  universalAuth,
  notificationController.markNotificationAsRead
);

export default router;
