// src/config/db.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to database.json
const dbPath = path.join(__dirname, "./database.json");

// Initialize database if it doesn't exist
export function initDatabase() {
  if (!fs.existsSync(dbPath)) {
    const initialData = {
      users: [
        {
          user_name: "ravi",
          mobile_number: "9247872691",
          country_code: "+91",
          mail: "xyz@gmail.com",
          location: "madhapur",
          spaces: [
            {
              space_name: "home",
              devices: [],
            },
          ],
        },
      ],
    };

    fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2), "utf8");
    console.log("Database initialized with sample data");
  }
}

// Call the init function
initDatabase();
