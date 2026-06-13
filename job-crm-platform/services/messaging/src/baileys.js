const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = require("@vinxwhy1st/bails");
const path = require("path");
const logger = require("./logger");

const SESSION_DIR = process.env.SESSION_DIR || "/app/sessions";

async function initSocket(userId, existingCreds = null) {
  const sessionPath = path.join(SESSION_DIR, userId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  if (existingCreds) {
    Object.assign(state.creds, existingCreds);
  }

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger: logger.child({ module: "baileys" }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        logger.warn(`WA connection closed for ${userId}, reconnecting…`);
        initSocket(userId, existingCreds);
      }
    }
  });

  return sock;
}

async function requestPairingCode(userId, phoneNumber, onCredsUpdate) {
  const sessionPath = path.join(SESSION_DIR, userId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger: logger.child({ module: "baileys" }),
  });

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    await onCredsUpdate(state.creds);
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));
  const code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ""));
  return { sock, pairingCode: code };
}

async function sendMessage(sock, phone, text) {
  const jid = phone.replace(/\D/g, "") + "@s.whatsapp.net";
  await sock.sendMessage(jid, { text });
}

module.exports = { initSocket, sendMessage, requestPairingCode };
