const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

const aggregatorQueue = new Queue("aggregator", { connection });
const dispatchQueue = new Queue("dispatch", { connection });
const whatsappQueue = new Queue("whatsapp", { connection });
const aiQueue = new Queue("ai-inbox", { connection });

module.exports = { aggregatorQueue, dispatchQueue, whatsappQueue, aiQueue, connection };
