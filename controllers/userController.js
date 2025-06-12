const User = require("../models/userModel");
const axios = require("axios").default; // For fetching images
const { createClient } = require("redis");

// Initialize Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL, // Use Upstash Redis URL
  socket: {
    reconnectStrategy: retries => Math.min(retries * 100, 5000) // Retry with exponential backoff, max 5 seconds
  }
});

redisClient.on("error", (err) => console.error("Redis Client Error:", err));

// Connect to Redis
(async () => {
  await redisClient.connect();
})();

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
    
    // Check Redis cache
    const cachedImage = await redisClient.get(cacheKey);
    if (cachedImage) {
      console.log(`Cache hit for ${cacheKey}`);
      const { data, contentType } = JSON.parse(cachedImage);
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

    // Cache the image in Redis (store as base64 to simplify serialization)
    await redisClient.setEx(
      cacheKey,
      86400, // TTL of 24 hours
      JSON.stringify({
        data: imageBuffer.toString("base64"),
        contentType,
      })
    );

    // Send the image
    res.set("Content-Type", contentType);
    res.send(imageBuffer);
  } catch (err) {
    console.error("Failed to fetch avatar:", err);
    res.status(500).json({ message: "Failed to fetch avatar" });
  }
};

// Cleanup Redis connection on server shutdown
process.on("SIGTERM", async () => {
  await redisClient.quit();
  console.log("Redis connection closed");
});
