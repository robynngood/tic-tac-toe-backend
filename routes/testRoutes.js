// routes/testRoutes.js   .... for testing user creation

// const express = require("express");
// const router = express.Router();
// const User = require("../models/userModel");

// router.post("/test-register", async (req, res) => {
//   try {
//     const { googleId, email, name, picture } = req.body;
//     const newUser = new User({ googleId, email, name, picture });
//     await newUser.save();
//     res.status(201).json({ message: "User saved", user: newUser });
//   } catch (err) {
//     console.error("Error saving user:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// module.exports = router;
