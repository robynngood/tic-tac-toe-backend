const User = require("../models/userModel");
const axios = require("axios").default; // For fetching images

// In-memory cache for avatars
const avatarCache = new Map();

exports.getMe = (req, res) => {
  if (!req.user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({
    id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    avatar: req.user.avatar,
    stats: {
      matches: req.user.stats.matches || 0,
      rounds: req.user.stats.rounds || 0,
      matchesWon: req.user.stats.matchesWon || 0,
      matchesLost: req.user.stats.matchesLost || 0,
      matchesDraw: req.user.stats.matchesDraw || 0,
      wins: req.user.stats.wins || 0,
      draws: req.user.stats.draws || 0,
      losses: req.user.stats.losses || 0,
    },
  });
};

exports.getUserAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("avatar");

    if (!user || !user.avatar) {
      return res.status(404).json({ message: "User or avatar not found" });
    }

    const cacheKey = `avatar_${req.params.id}`;
    
    // Check in-memory cache
    const cachedImage = avatarCache.get(cacheKey);
    if (cachedImage && cachedImage.expiry > Date.now()) {
      console.log(`Cache hit for ${cacheKey}`);
      const { data, contentType } = cachedImage;
      res.set("Content-Type", contentType);
      return res.send(Buffer.from(data, "base64"));
    }

    console.log(`Cache miss for ${cacheKey}, fetching avatar`);
    
    // Fetch image from Google URL
    const response = await axios.get(user.avatar, {
      responseType: "arraybuffer", // Get binary data
    });

    const imageBuffer = Buffer.from(response.data);
    const contentType = response.headers["content-type"] || "image/jpeg";

    // Cache the image in memory (store as base64, with 24-hour TTL)
    avatarCache.set(cacheKey, {
      data: imageBuffer.toString("base64"),
      contentType,
      expiry: Date.now() + 86400 * 1000 // 24 hours in milliseconds
    });

    // Send the image
    res.set("Content-Type", contentType);
    res.send(imageBuffer);
  } catch (err) {
    console.error("Failed to fetch avatar:", err);
    res.status(500).json({ message: "Failed to fetch avatar" });
  }
};