require("dotenv").config();
const cron = require("node-cron");
const { Worker, QueueScheduler } = require("bullmq");
const IORedis = require("ioredis");
const logger = require("./logger");
const { dispatchDailyBatch } = require("./scheduler");
const { processDispatchJob } = require("./processors/dispatch");
const { processWhatsappJob } = require("./processors/whatsapp");

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

// ─── Dispatch worker ────────────────────────────────────────────────────────

const dispatchWorker = new Worker(
  "dispatch",
  async (job) => {
    logger.info(`Processing dispatch job: ${job.name}`, { jobId: job.id });
    await processDispatchJob(job);
  },
  { connection, concurrency: 5 }
);

// ─── WhatsApp worker (capped at 100/day) ────────────────────────────────────

const whatsappWorker = new Worker(
  "whatsapp",
  async (job) => {
    logger.info(`Processing whatsapp job`, { jobId: job.id });
    await processWhatsappJob(job);
  },
  { connection, concurrency: 1 }
);

// ─── Cron: 8:00 AM daily — enqueue today's batch ───────────────────────────

cron.schedule("0 8 * * *", async () => {
  logger.info("Cron: dispatching daily batch");
  await dispatchDailyBatch();
});

// ─── Error handlers ─────────────────────────────────────────────────────────

dispatchWorker.on("failed", (job, err) =>
  logger.error(`Dispatch job ${job?.id} failed`, { error: err.message })
);
whatsappWorker.on("failed", (job, err) =>
  logger.error(`WhatsApp job ${job?.id} failed`, { error: err.message })
);

logger.info("Worker started — dispatch + whatsapp + cron active");
