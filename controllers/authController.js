
const jwt = require("jsonwebtoken");
 
 exports.googleCallback = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication failed" });
  }

  try{
    const token = jwt.sign(
      { id: req.user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
  
    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

    
    res.redirect(`${FRONTEND_URL}/home?token=${token}`);
    
  } catch (err) {
    console.error("JWT creation failed:", err);
    res.status(500).send("Internal Server Error");
  }

 };


  
  exports.logout = (req, res, next) => {
    req.logout(err => {
      if (err) return next(err);
      res.redirect(process.env.FRONTEND_URL);
    });
  };
  
  exports.getUser = (req, res) => {
    if (req.user) {
      res.json({
        isAuthenticated: true,
        user: req.user,
      });
    } else {
      res.json({ isAuthenticated: false });
    }
  };
  
  exports.authFailure = (req, res) => {
    res.status(401).json({ message: "Authentication failed" });
  };
  