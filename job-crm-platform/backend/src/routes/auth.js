const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { PrismaClient } = require("@prisma/client");
const passport = require("../config/passport");

const prisma = new PrismaClient();

const signToken = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

router.post(
  "/register",
  [
    body("email").isEmail(),
    body("password").isLength({ min: 8 }),
    body("name").notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, name } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, passwordHash, name } });
    res.status(201).json({ token: signToken(user.id), user: { id: user.id, email, name, plan: user.plan } });
  }
);

router.post(
  "/login",
  [body("email").isEmail(), body("password").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    res.json({ token: signToken(user.id), user: { id: user.id, email, name: user.name, plan: user.plan } });
  }
);

router.get(
  "/google",
  passport.authenticate("google", { session: false, accessType: "offline", prompt: "consent" })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  (req, res) => {
    const token = signToken(req.user.id);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

router.get("/me", require("../middleware/auth").authenticate, (req, res) => {
  const { id, email, name, plan } = req.user;
  res.json({ id, email, name, plan });
});

module.exports = router;
