// src/server.js
import app from "./app.js";
import dotenv from "dotenv";
import { connectDB } from "./config/dbconfig.js";
import { connectPostDB } from './config/postgres.js';

// Load environment variables
dotenv.config();

connectDB()
  .then(() => {
    console.log("MongoDB connection established successfully");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
connectPostDB()
  .then(() => {
    console.log("Postgres connection established successfully");
  })
  .catch((err) => {
    console.error("Postgres connection error:", err);
    process.exit(1);
  });


// Server configuration
const PORT = process.env.PORT || 5000;

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
