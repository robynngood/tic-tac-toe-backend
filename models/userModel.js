const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true,
  },
  name: String,
  email: {
    type: String,
    required: true,
    unique: true,
  },
  avatar: String, // Google profile photo
  stats: {
    matches: { type: Number, default: 0 }, // Total distinct games
    rounds: { type: Number, default: 0 }, // Total rounds played
    matchesWon: { type: Number, default: 0 }, // Matches won (most round wins)
    matchesLost: { type: Number, default: 0 }, // Matches lost
    matchesDraw: { type: Number, default: 0 }, // Matches drawn (no overall winner)
    wins: { type: Number, default: 0 }, // Rounds won
    draws: { type: Number, default: 0 }, // Rounds drawn
    losses: { type: Number, default: 0 }, // Rounds lost
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
