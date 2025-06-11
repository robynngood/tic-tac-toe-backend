// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const { getMe, getUserById, getUserAvatar } = require("../controllers/userController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.get("/me", verifyToken, getMe);
router.get("/:id/avatar", verifyToken, getUserAvatar); // New route for avatar


module.exports = router;
