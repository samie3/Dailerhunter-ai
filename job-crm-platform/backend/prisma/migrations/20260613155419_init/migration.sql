-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "SequenceStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'OPENED', 'REPLIED', 'FAILED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "CommType" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CommDir" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "AIReplyStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'SENT', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credsJson" TEXT NOT NULL,
    "paired" BOOLEAN NOT NULL DEFAULT false,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "status" "SequenceStatus" NOT NULL DEFAULT 'IDLE',
    "dailyLimit" INTEGER NOT NULL DEFAULT 45,
    "dayNumber" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sequenceId" TEXT,
    "companyName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "jobUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "source" TEXT,
    "emailValid" BOOLEAN,
    "status" "LeadStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "whatsappSent" BOOLEAN NOT NULL DEFAULT false,
    "whatsappSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Communication" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "CommType" NOT NULL,
    "direction" "CommDir" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "gmailId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIReply" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "inboundBody" TEXT NOT NULL,
    "draftSubject" TEXT,
    "draftBody" TEXT NOT NULL,
    "status" "AIReplyStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "parsedText" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceAnalytic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "replied" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "whatsapp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SequenceAnalytic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleToken_userId_key" ON "GoogleToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappSession_userId_key" ON "WhatsappSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceAnalytic_userId_date_key" ON "SequenceAnalytic"("userId", "date");

-- AddForeignKey
ALTER TABLE "GoogleToken" ADD CONSTRAINT "GoogleToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappSession" ADD CONSTRAINT "WhatsappSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIReply" ADD CONSTRAINT "AIReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIReply" ADD CONSTRAINT "AIReply_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvFile" ADD CONSTRAINT "CvFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceAnalytic" ADD CONSTRAINT "SequenceAnalytic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
