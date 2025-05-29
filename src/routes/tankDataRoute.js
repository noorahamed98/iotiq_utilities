import express from "express";
import { authenticateToken } from "../middlewares/authMiddleware.js";
import { sensorData } from "../services/tankDataService.js";

const router = express.Router();

router.get("/tank-data/latest/:deviceid/:sensorNumber",authenticateToken,sensorData);

export default router;