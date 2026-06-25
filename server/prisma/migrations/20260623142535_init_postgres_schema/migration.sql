-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "billing" JSONB NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wabas" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "provider" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "bspApiKeyRef" TEXT,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "providerRef" TEXT,
    "webhookSecretRef" TEXT,
    "qualityRating" TEXT,
    "messagingTier" TEXT,
    "qualityUpdatedAt" BIGINT,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "wabas_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "waba_quality_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "rating" TEXT,
    "tier" TEXT,
    "event" TEXT,
    "source" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,

    CONSTRAINT "waba_quality_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing" (
    "tenantId" TEXT NOT NULL,
    "marketingPaise" INTEGER NOT NULL,
    "utilityPaise" INTEGER NOT NULL,
    "authPaise" INTEGER NOT NULL,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "pricing_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "pricing_cost" (
    "tenantId" TEXT NOT NULL,
    "marketingPaise" INTEGER NOT NULL,
    "utilityPaise" INTEGER NOT NULL,
    "authPaise" INTEGER NOT NULL,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "pricing_cost_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "contact_settings" (
    "tenantId" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "tags" JSONB NOT NULL,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "contact_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "contacts" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "nameLower" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optInStatus" TEXT NOT NULL,
    "attributes" JSONB,
    "source" TEXT,
    "status" TEXT,
    "channel" TEXT,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "templates" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "body" TEXT,
    "status" TEXT NOT NULL,
    "channel" TEXT,
    "bspTemplateId" TEXT,
    "components" JSONB,
    "variableCount" INTEGER,
    "submittedAt" BIGINT,
    "rejectionReason" TEXT,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT,
    "lastMessageAt" BIGINT NOT NULL,
    "lastMessagePreview" TEXT,
    "windowExpiresAt" BIGINT NOT NULL,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "messages" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "channel" TEXT,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "templateName" TEXT,
    "campaignId" TEXT,
    "campaignRecipientId" TEXT,
    "status" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "costPaise" INTEGER NOT NULL DEFAULT 0,
    "bspMessageId" TEXT,
    "error" JSONB,
    "ts" BIGINT NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "media" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "metaMediaId" TEXT NOT NULL,
    "handle" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "channel" TEXT,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel" TEXT,
    "templateName" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "submitted" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "read" INTEGER DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "templateVariablesMode" TEXT,
    "segment" JSONB,
    "scheduledAt" BIGINT,
    "startedAt" BIGINT,
    "completedAt" BIGINT,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "contactId" TEXT,
    "name" TEXT,
    "messageId" TEXT,
    "bspMessageId" TEXT,
    "error" JSONB,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("tenantId","campaignId","id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "tenantId" TEXT NOT NULL,
    "balancePaise" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "gstPaise" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL,
    "ref" TEXT NOT NULL,
    "note" TEXT,
    "ts" BIGINT NOT NULL,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "wallet_orders" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "creditPaise" INTEGER NOT NULL,
    "gstPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "wallet_orders_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "razorpayPaymentId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxableAmountPaise" INTEGER NOT NULL,
    "gstTotalPaise" INTEGER NOT NULL,
    "taxType" TEXT NOT NULL,
    "cgstPaise" INTEGER,
    "sgstPaise" INTEGER,
    "igstPaise" INTEGER,
    "sellerGstin" TEXT,
    "sellerStateCode" TEXT,
    "buyerGstin" TEXT,
    "buyerStateCode" TEXT,
    "razorpayOrderId" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("razorpayPaymentId")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "processedAt" BIGINT NOT NULL,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keyPrefix" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "lastUsedAt" BIGINT,
    "revokedAt" BIGINT,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_configs" (
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "callbackUrl" TEXT NOT NULL,
    "eventTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signingSecretRef" TEXT,
    "secretLast4" TEXT,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "webhook_configs_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "nextAttemptAt" BIGINT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,
    "deliveredAt" BIGINT,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "secrets" (
    "ref" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "secretId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "data_deletion_requests" (
    "code" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "data_deletion_requests_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "deauthorizations" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "deauthorizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "wabas_wabaId_key" ON "wabas"("wabaId");

-- CreateIndex
CREATE UNIQUE INDEX "wabas_phoneNumberId_key" ON "wabas"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "wabas_providerRef_key" ON "wabas"("providerRef");

-- CreateIndex
CREATE INDEX "waba_quality_history_tenantId_wabaId_ts_idx" ON "waba_quality_history"("tenantId", "wabaId", "ts");

-- CreateIndex
CREATE INDEX "contacts_tenantId_optInStatus_idx" ON "contacts"("tenantId", "optInStatus");

-- CreateIndex
CREATE INDEX "contacts_tenantId_source_idx" ON "contacts"("tenantId", "source");

-- CreateIndex
CREATE INDEX "contacts_tenantId_status_idx" ON "contacts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "contacts_tenantId_phone_idx" ON "contacts"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "contacts_tenantId_nameLower_idx" ON "contacts"("tenantId", "nameLower");

-- CreateIndex
CREATE INDEX "contacts_tags_idx" ON "contacts" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "conversations_tenantId_lastMessageAt_idx" ON "conversations"("tenantId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "messages_tenantId_conversationId_ts_idx" ON "messages"("tenantId", "conversationId", "ts");

-- CreateIndex
CREATE INDEX "messages_tenantId_bspMessageId_idx" ON "messages"("tenantId", "bspMessageId");

-- CreateIndex
CREATE INDEX "campaigns_status_scheduledAt_idx" ON "campaigns"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "campaign_recipients_tenantId_campaignId_status_idx" ON "campaign_recipients"("tenantId", "campaignId", "status");

-- CreateIndex
CREATE INDEX "wallet_transactions_tenantId_ts_idx" ON "wallet_transactions"("tenantId", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_orders_razorpayOrderId_key" ON "wallet_orders"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_idx" ON "invoices"("tenantId");

-- CreateIndex
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_nextAttemptAt_idx" ON "webhook_deliveries"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "secrets_namespace_idx" ON "secrets"("namespace");
