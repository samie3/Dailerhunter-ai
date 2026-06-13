const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { authenticate, requirePro } = require("../middleware/auth");
const axios = require("axios");

const prisma = new PrismaClient();

router.post("/pair", authenticate, requirePro, async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: "phoneNumber required" });

  try {
    const response = await axios.post(
      `http://messaging:3001/pair`,
      { phoneNumber, userId: req.user.id },
      { timeout: 30000 }
    );
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: "Messaging service unavailable", detail: err.message });
  }
});

router.get("/status", authenticate, requirePro, async (req, res) => {
  const session = await prisma.whatsappSession.findUnique({
    where: { userId: req.user.id },
    select: { paired: true, phoneNumber: true, updatedAt: true },
  });
  res.json({ session });
});

module.exports = router;
