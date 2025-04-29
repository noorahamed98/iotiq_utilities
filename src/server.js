// src/server.js
import app from "./app.js";
import dotenv from "dotenv";
import "./config/db.js";

// Load environment variables
dotenv.config();

// Server configuration
const PORT = process.env.PORT || 5000;

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
