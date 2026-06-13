const passport = require("passport");

const authenticate = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.user = user;
    next();
  })(req, res, next);
};

const requirePro = (req, res, next) => {
  if (req.user.plan !== "PRO") {
    return res.status(403).json({ error: "Pro plan required" });
  }
  next();
};

module.exports = { authenticate, requirePro };
