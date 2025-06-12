
const express = require("express");
const mongoose = require("mongoose");
const passport = require("passport");
const cors = require("cors");
const dotenv = require("dotenv");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes"); // ✅ New import
const http = require("http");
const setupSocket = require("./socket/socket")
const helmet = require("helmet");



dotenv.config();
require("./config/passport"); // Google Strategy config

const app = express();
const server = http.createServer(app);



// MongoDB Connection
const connectDB = require("./config/db")
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// This helps protect the backend with secure headers (e.g., against XSS, clickjacking).
app.use(helmet());

app.use(passport.initialize());

// CORS for frontend
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

// Routes
app.use("/auth", authRoutes);
app.use("/api/user", userRoutes);     // 👤 User-specific routes (e.g., /api/user/me, /api/user/:id)


// const testRoutes = require("./routes/testRoutes");
// app.use("/api", testRoutes);

// Root test route
app.get("/", (req, res) => {
  res.send("🎯 Tic Tac Toe Backend Running");
});

// Setup socket.io
setupSocket(server);   // Bind socket to the http server

// Server Start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
