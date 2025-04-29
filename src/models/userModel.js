import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the database file
const dbPath = path.join(__dirname, "../data/database.json");

// Function to read the database
function readDatabase() {
  try {
    const data = fs.readFileSync(dbPath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading database:", error);
    return { users: [] };
  }
}

// Function to write to the database
function writeDatabase(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error writing to database:", error);
    return false;
  }
}

// Find a user by mobile number
export function findByMobileNumber(mobileNumber) {
  const db = readDatabase();
  return db.users.find((user) => user.mobile_number === mobileNumber);
}

// Update a user
export function updateUser(updatedUser) {
  const db = readDatabase();
  const index = db.users.findIndex(
    (user) => user.mobile_number === updatedUser.mobile_number
  );

  if (index !== -1) {
    db.users[index] = updatedUser;
    return writeDatabase(db);
  }

  return false;
}

// Create a new user
export function create(userData) {
  const db = readDatabase();

  // Check if user already exists
  const existingUser = db.users.find(
    (user) => user.mobile_number === userData.mobile_number
  );
  if (existingUser) {
    throw new Error("User with this mobile number already exists");
  }

  // Create user with default space
  const newUser = {
    ...userData,
    spaces: [
      {
        space_name: "home",
        devices: [],
      },
    ],
    otps: [],
  };

  db.users.push(newUser);
  writeDatabase(db);

  return newUser;
}

// Clean expired OTPs (utility function)
export function cleanExpiredOTPs() {
  const db = readDatabase();
  const now = new Date();

  db.users.forEach((user) => {
    if (user.otps && user.otps.length > 0) {
      user.otps = user.otps.filter((otp) => {
        const otpDate = new Date(otp.created_at);
        const diffInMinutes = (now - otpDate) / (1000 * 60);
        return diffInMinutes <= 24 * 60; // Keep OTPs newer than 24 hours
      });
    }
  });

  writeDatabase(db);
}
