const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");

const prisma = new PrismaClient();

router.get("/", authenticate, async (req, res) => {
  const { days = 7 } = req.query;
  const since = new Date();
  since.setDate(since.getDate() - Number(days));

  const daily = await prisma.sequenceAnalytic.findMany({
    where: { userId: req.user.id, date: { gte: since } },
    orderBy: { date: "asc" },
  });

  const totals = await prisma.lead.aggregate({
    where: { userId: req.user.id },
    _count: { id: true },
  });

  const byStatus = await prisma.lead.groupBy({
    by: ["status"],
    where: { userId: req.user.id },
    _count: true,
  });

  res.json({ daily, totals: totals._count.id, byStatus });
});

module.exports = router;
