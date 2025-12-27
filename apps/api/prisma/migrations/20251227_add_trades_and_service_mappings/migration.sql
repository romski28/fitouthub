-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "professionType" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 999,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMapping" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trade_name_key" ON "Trade"("name");

-- CreateIndex
CREATE INDEX "Trade_category_idx" ON "Trade"("category");

-- CreateIndex
CREATE INDEX "Trade_enabled_idx" ON "Trade"("enabled");

-- CreateIndex
CREATE INDEX "Trade_professionType_idx" ON "Trade"("professionType");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMapping_keyword_key" ON "ServiceMapping"("keyword");

-- CreateIndex
CREATE INDEX "ServiceMapping_keyword_idx" ON "ServiceMapping"("keyword");

-- CreateIndex
CREATE INDEX "ServiceMapping_tradeId_idx" ON "ServiceMapping"("tradeId");

-- CreateIndex
CREATE INDEX "ServiceMapping_enabled_idx" ON "ServiceMapping"("enabled");

-- AddForeignKey
ALTER TABLE "ServiceMapping" ADD CONSTRAINT "ServiceMapping_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
