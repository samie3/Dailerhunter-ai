require("dotenv").config();
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const logger = require("./logger");
const { initSocket, sendMessage, requestPairingCode } = require("./baileys");

const app = express();
app.use(express.json());
const prisma = new PrismaClient();

// Map userId → Baileys socket instance
const sockets = new Map();

// ─── Re-connect existing paired sessions on startup ─────────────────────────
async function restoreSessions() {
  const sessions = await prisma.whatsappSession.findMany({ where: { paired: true } });
  for (const s of sessions) {
    try {
      const sock = await initSocket(s.userId, JSON.parse(s.credsJson));
      sockets.set(s.userId, sock);
      logger.info(`Restored WA session for user ${s.userId}`);
    } catch (e) {
      logger.warn(`Could not restore session for ${s.userId}: ${e.message}`);
    }
  }
}

// ─── Pairing endpoint ────────────────────────────────────────────────────────
app.post("/pair", async (req, res) => {
  const { userId, phoneNumber } = req.body;
  if (!userId || !phoneNumber) return res.status(400).json({ error: "userId and phoneNumber required" });

  try {
    const { sock, pairingCode } = await requestPairingCode(userId, phoneNumber, async (creds) => {
      await prisma.whatsappSession.upsert({
        where: { userId },
        update: { credsJson: JSON.stringify(creds), paired: true, phoneNumber },
        create: { userId, credsJson: JSON.stringify(creds), paired: true, phoneNumber },
      });
      sockets.set(userId, sock);
    });
    sockets.set(userId, sock);
    res.json({ pairingCode, message: "Enter this 8-digit code in WhatsApp > Linked Devices" });
  } catch (err) {
    logger.error(`Pairing error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Send message endpoint ────────────────────────────────────────────────────
app.post("/send", async (req, res) => {
  const { userId, phone, message } = req.body;
  if (!userId || !phone || !message) return res.status(400).json({ error: "userId, phone, message required" });

  const sock = sockets.get(userId);
  if (!sock) return res.status(503).json({ error: "WhatsApp not connected for this user" });

  try {
    await sendMessage(sock, phone, message);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Send error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = 3001;
app.listen(PORT, async () => {
  await restoreSessions();
  logger.info(`Messaging service on port ${PORT}`);
});
