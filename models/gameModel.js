const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema({
    roomId: {
      type: String,
      required: true,
      unique: true,
    },
    playerX: {
      _id: String,
      name: String,
      email: String,
      avatar: String,
      symbol: { type: String, enum: ['X', 'O'], default: 'X' },
    },
    playerO: {
      _id: String,
      name: String,
      email: String,
      avatar: String,
      symbol: { type: String, enum: ['X', 'O'], default: 'O' },
    },
    board: {
      type: [String], // 'X', 'O', or null
      default: [],
    },
    xIsNext: {
      type: Boolean,
      default: true,
    },
    boardSize: {
      type: Number,
      required: true,
    },
    lineLength: {
      type: Number,
      required: true,
    },
    round: {
      type: Number,
      default: 1,
    },
    totalRounds: {
      type: Number,
      default: 3,
    },
    isFinished: {
      type: Boolean,
      default: false,
    },
    results: {
      type: Array,
      default: [],
    },
    isGameEnding: {
      type: Boolean,
      default: false,
    },
  }, {
    timestamps: true, // adds createdAt and updatedAt fields
  });

const Game = mongoose.model("Game", gameSchema);

module.exports = Game;
