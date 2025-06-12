import express from "express";
import { authenticateToken } from "../middlewares/authMiddleware.js";
import { sensorData, switchStatus } from "../services/tankDataService.js";

const router = express.Router();

router.get("/tank-data/latest/:deviceid/:sensorNumber",authenticateToken,sensorData);
router.get("/status/:deviceid/:switchNumber",authenticateToken,switchStatus)

export default router;