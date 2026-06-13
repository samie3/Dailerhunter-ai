const { PrismaClient } = require("@prisma/client");
const { google } = require("googleapis");
const logger = require("../logger");

const prisma = new PrismaClient();

async function processDispatchJob(job) {
  const { name, data } = job;

  if (name === "send-email") {
    await sendEmail(data);
  } else if (name === "send-ai-reply") {
    await sendAIReply(data);
  } else {
    logger.warn(`Unknown dispatch job: ${name}`);
  }
}

async function sendEmail({ leadId, userId }) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  const cv = await prisma.cvFile.findFirst({ where: { userId, active: true } });
  const token = await prisma.googleToken.findUnique({ where: { userId } });

  if (!lead || !token || !lead.contactEmail) {
    await prisma.lead.update({ where: { id: leadId }, data: { status: "FAILED" } });
    throw new Error(`Missing lead/token/email for leadId=${leadId}`);
  }

  const oauth2Client = buildOAuth2Client(token);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const subject = `فرصة تعاون مع ${lead.companyName}`;
  const body = buildEmailBody(lead);
  const raw = buildRawEmail(lead.contactEmail, subject, body);

  const sent = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "SENT", sentAt: new Date() },
  });

  await prisma.communication.create({
    data: {
      leadId,
      type: "EMAIL",
      direction: "OUTBOUND",
      subject,
      body,
      gmailId: sent.data.id,
      sentAt: new Date(),
    },
  });

  await prisma.sequenceAnalytic.upsert({
    where: { userId_date: { userId, date: today() } },
    update: { sent: { increment: 1 } },
    create: { userId, sent: 1 },
  });

  logger.info(`Email sent to ${lead.contactEmail} (lead ${leadId})`);
}

async function sendAIReply({ replyId, userId }) {
  const reply = await prisma.aIReply.findUnique({ where: { id: replyId }, include: { lead: true } });
  const token = await prisma.googleToken.findUnique({ where: { userId } });

  if (!reply || !token) throw new Error(`Missing reply/token for replyId=${replyId}`);

  const oauth2Client = buildOAuth2Client(token);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const raw = buildRawEmail(reply.lead.contactEmail, reply.draftSubject || "Re:", reply.draftBody);
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

  await prisma.aIReply.update({ where: { id: replyId }, data: { status: "SENT", sentAt: new Date() } });
  logger.info(`AI reply sent for replyId=${replyId}`);
}

function buildOAuth2Client(token) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
  });
  return auth;
}

function buildEmailBody(lead) {
  return `السلام عليكم،

أود التقدم لوظيفة ${lead.jobTitle || "متاحة"} في شركة ${lead.companyName}.

يسعدني إرسال سيرتي الذاتية للنظر فيها.

مع التحية،`;
}

function buildRawEmail(to, subject, body) {
  const msg = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(body).toString("base64"),
  ].join("\r\n");

  return Buffer.from(msg).toString("base64url");
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

module.exports = { processDispatchJob };
