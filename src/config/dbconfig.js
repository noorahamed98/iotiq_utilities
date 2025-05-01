// dbconfig.js
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

// Device Schema
const deviceSchema = new mongoose.Schema(
  {
    // Define your device schema properties here
  },
  { timestamps: true }
);

// Space Schema
const spaceSchema = new mongoose.Schema({
  space_name: {
    type: String,
    required: [true, "Space name is required"],
  },
  address: {
    type: String,
    required: [true, "Address is required"],
  },
  devices: [deviceSchema],
  created_at: {
    type: Date,
    default: Date.now,
  },
});

// OTP Record Schema
const otpRecordSchema = new mongoose.Schema({
  otp: {
    type: String,
    required: [true, "OTP is required"],
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  is_verified: {
    type: Boolean,
    default: false,
  },
});

// User Schema
const userSchema = new mongoose.Schema(
  {
    user_name: {
      type: String,
      required: [true, "User name is required"],
    },
    mobile_number: {
      type: String,
      required: [true, "Mobile number is required"],
      unique: true, // Ensure mobile numbers are unique across users
      validate: {
        validator: function (value) {
          // Add additional validation if needed (e.g., length, format)
          return /^\d+$/.test(value);
        },
        message: (props) => `${props.value} is not a valid mobile number!`,
      },
    },
    spaces: {
      type: [spaceSchema],
      validate: {
        validator: function (spaces) {
          // Check for unique space names within a user's spaces array
          const spaceNames = spaces.map((space) => space.space_name);
          const uniqueSpaceNames = new Set(spaceNames);
          return spaceNames.length === uniqueSpaceNames.size;
        },
        message: "Space names must be unique for each user",
      },
    },
    otp_record: otpRecordSchema,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Create models
const User = mongoose.model("User", userSchema);
const Space = mongoose.model("Space", spaceSchema);
const Device = mongoose.model("Device", deviceSchema);

export { connectDB, User, Space, Device };
