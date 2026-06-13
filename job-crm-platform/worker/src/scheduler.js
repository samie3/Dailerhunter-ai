const { PrismaClient } = require("@prisma/client");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const logger = require("./logger");

const prisma = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const dispatchQueue = new Queue("dispatch", { connection });
const whatsappQueue = new Queue("whatsapp", { connection });

const QUOTA_RAMP = [45, 90, 180, 360, 490];
const WA_DAILY_CAP = 100;

async function dispatchDailyBatch() {
  const activeSequences = await prisma.sequence.findMany({
    where: { status: "RUNNING" },
    include: { user: { include: { googleTokens: true } } },
  });

  for (const seq of activeSequences) {
    const dayIndex = Math.min(seq.dayNumber - 1, QUOTA_RAMP.length - 1);
    const quota = Math.min(seq.dailyLimit, QUOTA_RAMP[dayIndex]);

    const leads = await prisma.lead.findMany({
      where: {
        sequenceId: seq.id,
        status: "PENDING",
        emailValid: true,
        contactEmail: { not: null },
      },
      take: quota,
    });

    logger.info(`Sequence ${seq.id}: queuing ${leads.length} email jobs (quota ${quota})`);

    for (let i = 0; i < leads.length; i++) {
      const delayMs = i * (randomInt(60, 180) * 1000);
      await dispatchQueue.add(
        "send-email",
        { leadId: leads[i].id, userId: seq.userId, sequenceId: seq.id },
        {
          delay: delayMs,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        }
      );
      await prisma.lead.update({ where: { id: leads[i].id }, data: { status: "QUEUED" } });
    }

    // WhatsApp — Pro plan only, capped at 100/day
    if (seq.user.plan === "PRO") {
      const waLeads = await prisma.lead.findMany({
        where: {
          sequenceId: seq.id,
          status: "PENDING",
          whatsappSent: false,
          contactPhone: { not: null },
        },
        take: WA_DAILY_CAP,
      });

      for (let i = 0; i < waLeads.length; i++) {
        const delayMs = i * (randomInt(30, 90) * 1000);
        await whatsappQueue.add(
          "send-whatsapp",
          { leadId: waLeads[i].id, userId: seq.userId, companyName: waLeads[i].companyName },
          { delay: delayMs, attempts: 2 }
        );
      }
      logger.info(`Sequence ${seq.id}: queued ${waLeads.length} WA jobs`);
    }

    await prisma.sequence.update({
      where: { id: seq.id },
      data: { dayNumber: { increment: 1 } },
    });
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = { dispatchDailyBatch };
