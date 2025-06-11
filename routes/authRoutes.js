const express = require("express");
const passport = require("passport");
const router = express.Router();
const {
  googleCallback,
  logout,
  getUser,
  authFailure,
} = require("../controllers/authController");
const { verifyToken } = require("../middlewares/authMiddleware");

// Initiate Google OAuth
router.get("/google", (req, res, next) => {
  const state = req.query.state || "/";
  passport.authenticate("google", {
    scope: ["profile", "email"],
    state,
})(req, res, next);
});

// OAuth Callback
router.get("/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/auth/failure",
    session: false,   // now we are not using cookies-session or express-session... but  JWT ... so sessions has been disabled... 
  }),
  googleCallback
);

// Logout
router.get("/logout", logout);

// Return user info
router.get("/user",verifyToken, getUser);

// Failure route
router.get("/failure", authFailure);

module.exports = router;

