const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true },
    host: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      avatar: { type: String, required: true },
      socketId: { type: String, default: null },
      symbol: { type: String, enum: ["X", "O"], default: "X" },
    },
    guest: {
      id: String,
      name: String,
      avatar: String,
      socketId: String,
      symbol: { type: String, enum: ["X", "O"], default: "O" },
    },
    config: {
      boardSize: { type: Number, required: true },
      lineLength: { type: Number, required: true },
      rounds: { type: Number, required: true },
      timerDuration: { type: Number, enum: [10, 30, null], default: null }, // 10s, 30s, or no limit
    },
    lastActivity: { type: Date, default: Date.now }, // Track last activity
  },
  { timestamps: true }
);

const Room = mongoose.model("Room", roomSchema);

module.exports = Room;
