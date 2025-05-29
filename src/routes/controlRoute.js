import express from "express";
import { authenticateToken } from "../middlewares/authMiddleware.js";
import { control } from "../services/controlService.js";

const router = express.Router();

router.post("/publish", authenticateToken, control);

export default router;