const { PrismaClient } = require("@prisma/client");
const logger = require("../logger");
const axios = require("axios");

const prisma = new PrismaClient();

async function processWhatsappJob(job) {
  const { leadId, userId, companyName } = job.data;

  const session = await prisma.whatsappSession.findUnique({ where: { userId } });
  if (!session?.paired) {
    logger.warn(`WhatsApp not paired for user ${userId}`);
    return;
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead?.contactPhone) {
    logger.warn(`No phone number for lead ${leadId}`);
    return;
  }

  const message = `السلام عليكم + ${companyName}`;

  try {
    await axios.post(
      "http://messaging:3001/send",
      { userId, phone: lead.contactPhone, message },
      { timeout: 15000 }
    );

    await prisma.lead.update({
      where: { id: leadId },
      data: { whatsappSent: true, whatsappSentAt: new Date() },
    });

    await prisma.communication.create({
      data: {
        leadId,
        type: "WHATSAPP",
        direction: "OUTBOUND",
        body: message,
        sentAt: new Date(),
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.sequenceAnalytic.upsert({
      where: { userId_date: { userId, date: today } },
      update: { whatsapp: { increment: 1 } },
      create: { userId, whatsapp: 1 },
    });

    logger.info(`WhatsApp sent to ${lead.contactPhone}`);
  } catch (err) {
    logger.error(`WhatsApp send failed: ${err.message}`);
    throw err;
  }
}

module.exports = { processWhatsappJob };
