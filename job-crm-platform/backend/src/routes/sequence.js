const router = require("express").Router();
const { body, validationResult } = require("express-validator");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");
const { dispatchQueue, aggregatorQueue } = require("../services/queues");

const prisma = new PrismaClient();

const QUOTA_RAMP = [45, 90, 180, 360, 490];

router.post(
  "/start",
  authenticate,
  [body("sector").notEmpty(), body("city").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sector, city, dailyLimit } = req.body;

    const active = await prisma.sequence.findFirst({
      where: { userId: req.user.id, status: "RUNNING" },
    });
    if (active) return res.status(409).json({ error: "A sequence is already running" });

    const sequence = await prisma.sequence.create({
      data: {
        userId: req.user.id,
        sector,
        city,
        status: "RUNNING",
        dailyLimit: dailyLimit || 45,
        dayNumber: 1,
        startedAt: new Date(),
      },
    });

    await aggregatorQueue.add(
      "fetch-listings",
      { sequenceId: sequence.id, userId: req.user.id, sector, city },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
    );

    res.status(201).json({ sequence });
  }
);

router.post("/stop", authenticate, async (req, res) => {
  const sequence = await prisma.sequence.findFirst({
    where: { userId: req.user.id, status: "RUNNING" },
  });
  if (!sequence) return res.status(404).json({ error: "No active sequence" });

  await prisma.sequence.update({
    where: { id: sequence.id },
    data: { status: "PAUSED", stoppedAt: new Date() },
  });
  res.json({ message: "Sequence paused" });
});

router.get("/status", authenticate, async (req, res) => {
  const sequence = await prisma.sequence.findFirst({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });

  const counts = await prisma.lead.groupBy({
    by: ["status"],
    where: { userId: req.user.id },
    _count: true,
  });

  const stats = counts.reduce((acc, c) => {
    acc[c.status.toLowerCase()] = c._count;
    return acc;
  }, {});

  const dayNum = sequence?.dayNumber || 1;
  const quota = QUOTA_RAMP[Math.min(dayNum - 1, QUOTA_RAMP.length - 1)];

  res.json({ sequence, stats, todayQuota: quota });
});

module.exports = router;
