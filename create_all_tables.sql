-- Create all tables in dependency order
-- Run this ONCE in new DB SQL Editor before importing any data

-- Enums first
CREATE TYPE "SiteAccessRequestStatus" AS ENUM ('pending', 'approved_no_visit', 'approved_visit_scheduled', 'visited', 'denied', 'cancelled');
CREATE TYPE "SiteAccessVisitStatus" AS ENUM ('proposed', 'accepted', 'declined', 'cancelled', 'completed');
CREATE TYPE "LocationDetailsStatus" AS ENUM ('pending', 'submitted', 'reviewed', 'approved');
CREATE TYPE "ProjectStage" AS ENUM ('CREATED', 'BIDDING_ACTIVE', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETE', 'QUOTE_RECEIVED', 'BIDDING_CLOSED', 'CONTRACT_PHASE', 'PRE_WORK', 'WORK_IN_PROGRESS', 'MILESTONE_PENDING', 'PAYMENT_RELEASED', 'NEAR_COMPLETION', 'FINAL_INSPECTION', 'COMPLETE', 'WARRANTY_PERIOD', 'CLOSED', 'PAUSED', 'DISPUTED');
CREATE TYPE "AdminActionType" AS ENUM ('VERIFY_ESCROW_RECEIPT', 'APPROVE_PAYMENT_RELEASE', 'REVIEW_CONTRACT', 'VALIDATE_INSURANCE', 'VALIDATE_LICENSE', 'RESOLVE_DISPUTE', 'APPROVE_LARGE_BUDGET', 'FLAG_QUALITY_ISSUE', 'INVESTIGATE_COMPLAINT', 'APPROVE_CHANGE_ORDER');
CREATE TYPE "PolicyType" AS ENUM ('TERMS_AND_CONDITIONS', 'SECURITY_STATEMENT', 'CONTRACT_TEMPLATE');
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP', 'WECHAT', 'EMAIL');
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed', 'undeliverable');

-- Level 0 tables (no dependencies)
CREATE TABLE "Tradesman" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT UNIQUE NOT NULL,
  "category" TEXT NOT NULL,
  "emoji" TEXT,
  "description" TEXT,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "jobs" TEXT[] NOT NULL,
  "aliases" TEXT[] NOT NULL DEFAULT '{}',
  "professionType" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 999,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "AnonymousChatThread" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT UNIQUE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "NextStepConfig" (
  "id" TEXT PRIMARY KEY,
  "projectStage" "ProjectStage" NOT NULL,
  "role" TEXT NOT NULL,
  "actionKey" TEXT NOT NULL,
  "actionLabel" TEXT NOT NULL,
  "description" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isElective" BOOLEAN NOT NULL DEFAULT false,
  "requiresAction" BOOLEAN NOT NULL DEFAULT true,
  "estimatedDurationMinutes" INTEGER,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NextStepConfig_projectStage_role_actionKey_key" UNIQUE ("projectStage", "role", "actionKey")
);

CREATE TABLE "AdminNextStepTemplate" (
  "id" TEXT PRIMARY KEY,
  "projectStage" "ProjectStage" NOT NULL,
  "actionType" "AdminActionType" NOT NULL,
  "description" TEXT NOT NULL,
  "triggerCondition" TEXT,
  "isPriority" BOOLEAN NOT NULL DEFAULT false,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminNextStepTemplate_projectStage_actionType_key" UNIQUE ("projectStage", "actionType")
);

CREATE TABLE "Policy" (
  "id" TEXT PRIMARY KEY,
  "type" "PolicyType" NOT NULL,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Policy_type_version_key" UNIQUE ("type", "version")
);

-- Level 1 tables
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "nickname" TEXT UNIQUE NOT NULL,
  "firstName" TEXT NOT NULL,
  "surname" TEXT NOT NULL,
  "chineseName" TEXT,
  "email" TEXT UNIQUE NOT NULL,
  "mobile" TEXT,
  "passwordHash" TEXT NOT NULL,
  "passwordResetToken" TEXT,
  "passwordResetExpiry" TIMESTAMP(3),
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "verificationToken" TEXT,
  "role" TEXT NOT NULL DEFAULT 'client',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "otpCode" TEXT,
  "otpExpiresAt" TIMESTAMP(3),
  "otpVerifiedAt" TIMESTAMP(3),
  "agreedToTermsAt" TIMESTAMP(3),
  "agreedToTermsVersion" TEXT DEFAULT '1.0',
  "agreedToSecurityStatementAt" TIMESTAMP(3),
  "agreedToSecurityStatementVersion" TEXT DEFAULT '1.0'
);

CREATE TABLE "MilestoneTemplate" (
  "id" TEXT PRIMARY KEY,
  "tradeId" TEXT NOT NULL,
  "stageName" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "description" TEXT,
  "estimatedDurationDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MilestoneTemplate_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Tradesman"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MilestoneTemplate_tradeId_sequence_key" UNIQUE ("tradeId", "sequence")
);

CREATE TABLE "ServiceMapping" (
  "id" TEXT PRIMARY KEY,
  "keyword" TEXT UNIQUE NOT NULL,
  "tradeId" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceMapping_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Tradesman"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AnonymousChatMessage" (
  "id" TEXT PRIMARY KEY,
  "threadId" TEXT NOT NULL,
  "senderType" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "attachments" JSONB DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnonymousChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AnonymousChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Level 2 tables
CREATE TABLE "Professional" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "registrationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fullName" TEXT,
  "businessName" TEXT,
  "serviceArea" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "email" TEXT UNIQUE NOT NULL,
  "phone" TEXT NOT NULL,
  "professionType" TEXT NOT NULL,
  "additionalData" JSONB,
  "locationPrimary" TEXT,
  "locationSecondary" TEXT,
  "locationTertiary" TEXT,
  "servicePrimaries" TEXT[] NOT NULL DEFAULT '{}',
  "serviceSecondaries" TEXT[] NOT NULL DEFAULT '{}',
  "primaryTrade" TEXT,
  "profileImages" TEXT[] NOT NULL DEFAULT '{}',
  "suppliesOffered" TEXT[] NOT NULL DEFAULT '{}',
  "tradesOffered" TEXT[] NOT NULL DEFAULT '{}',
  "passwordHash" TEXT,
  "agreedToTermsAt" TIMESTAMP(3),
  "agreedToTermsVersion" TEXT DEFAULT '1.0',
  "agreedToSecurityStatementAt" TIMESTAMP(3),
  "agreedToSecurityStatementVersion" TEXT DEFAULT '1.0',
  "otpCode" TEXT,
  "otpExpiresAt" TIMESTAMP(3),
  "otpVerifiedAt" TIMESTAMP(3),
  CONSTRAINT "Professional_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "NotificationPreference" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE,
  "professionalId" TEXT UNIQUE,
  "primaryChannel" "NotificationChannel" NOT NULL DEFAULT 'WHATSAPP',
  "fallbackChannel" "NotificationChannel" NOT NULL DEFAULT 'SMS',
  "enableSMS" BOOLEAN NOT NULL DEFAULT true,
  "enableWhatsApp" BOOLEAN NOT NULL DEFAULT true,
  "enableWeChat" BOOLEAN NOT NULL DEFAULT false,
  "enableEmail" BOOLEAN NOT NULL DEFAULT true,
  "allowPartnerOffers" BOOLEAN NOT NULL DEFAULT false,
  "allowPlatformUpdates" BOOLEAN NOT NULL DEFAULT true,
  "weChatOpenId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotificationPreference_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Level 3 tables  
CREATE TABLE "Project" (
  "id" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "clientId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT,
  "budget" DECIMAL(12,2),
  "approvedBudget" DECIMAL(12,2),
  "approvedBudgetTxId" TEXT UNIQUE,
  "awardedProjectProfessionalId" TEXT UNIQUE,
  "paymentCurrency" TEXT NOT NULL DEFAULT 'HKD',
  "escrowRequired" DECIMAL(12,2),
  "escrowHeld" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "escrowHeldUpdatedAt" TIMESTAMP(3),
  "clientName" TEXT NOT NULL,
  "contractorName" TEXT,
  "notes" TEXT,
  "projectName" TEXT NOT NULL,
  "tradesRequired" TEXT[] NOT NULL DEFAULT '{}',
  "servicesUsed" TEXT[] NOT NULL DEFAULT '{}',
  "region" TEXT NOT NULL,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "isEmergency" BOOLEAN NOT NULL DEFAULT false,
  "onlySelectedProfessionalsCanBid" BOOLEAN NOT NULL DEFAULT true,
  "contractorContactName" TEXT,
  "contractorContactPhone" TEXT,
  "contractorContactEmail" TEXT,
  "siteAccessDataCollected" BOOLEAN NOT NULL DEFAULT false,
  "siteAccessDataCollectedAt" TIMESTAMP(3),
  "locationDetailsStatus" "LocationDetailsStatus" DEFAULT 'pending',
  "locationDetailsRequiredAt" TIMESTAMP(3),
  "locationDetailsProvidedAt" TIMESTAMP(3),
  "userPrompt" TEXT,
  "currentStage" "ProjectStage" NOT NULL DEFAULT 'CREATED',
  "stageStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastStageTransitionAt" TIMESTAMP(3),
  "contractType" TEXT,
  "contractContent" TEXT,
  "contractGeneratedAt" TIMESTAMP(3),
  "clientSignedAt" TIMESTAMP(3),
  "clientSignedById" TEXT,
  "professionalSignedAt" TIMESTAMP(3),
  "professionalSignedById" TEXT,
  CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Project_clientSignedById_fkey" FOREIGN KEY ("clientSignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Project_professionalSignedById_fkey" FOREIGN KEY ("professionalSignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Continue with remaining tables...
-- (This is getting long - I'll create a complete file)
