const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");
const { dispatchQueue } = require("../services/queues");

const prisma = new PrismaClient();

router.post("/approve", authenticate, async (req, res) => {
  const { replyId } = req.body;
  if (!replyId) return res.status(400).json({ error: "replyId required" });

  const reply = await prisma.aIReply.findFirst({
    where: { id: replyId, userId: req.user.id, status: "PENDING_APPROVAL" },
  });
  if (!reply) return res.status(404).json({ error: "Pending reply not found" });

  await prisma.aIReply.update({
    where: { id: replyId },
    data: { status: "APPROVED", approvedAt: new Date() },
  });

  await dispatchQueue.add(
    "send-ai-reply",
    { replyId, userId: req.user.id },
    { attempts: 3, backoff: { type: "exponential", delay: 3000 } }
  );

  res.json({ message: "Reply approved and queued for sending" });
});

router.get("/pending-replies", authenticate, async (req, res) => {
  const replies = await prisma.aIReply.findMany({
    where: { userId: req.user.id, status: "PENDING_APPROVAL" },
    include: { lead: { select: { companyName: true, contactEmail: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ replies });
});

module.exports = router;
