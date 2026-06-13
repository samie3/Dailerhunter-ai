require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { PrismaClient } = require("@prisma/client");
const logger = require("./config/logger");
const passport = require("./config/passport");

const authRoutes = require("./routes/auth");
const sequenceRoutes = require("./routes/sequence");
const emailRoutes = require("./routes/email");
const whatsappRoutes = require("./routes/whatsapp");
const analyticsRoutes = require("./routes/analytics");
const uploadRoutes = require("./routes/upload");

const app = express();
const prisma = new PrismaClient();

app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(passport.initialize());

const limiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use("/api/", limiter);

app.use("/api/auth", authRoutes);
app.use("/api/sequence", sequenceRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/upload", uploadRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use((err, _req, res, _next) => {
  logger.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  await prisma.$connect();
  logger.info(`Backend running on port ${PORT}`);
});

module.exports = app;
