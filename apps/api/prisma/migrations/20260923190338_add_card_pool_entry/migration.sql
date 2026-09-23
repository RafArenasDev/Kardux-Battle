-- CreateTable
CREATE TABLE "CardPoolEntry" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "quartetKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "stats" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPoolEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardPoolEntry_source_quartetKey_idx" ON "CardPoolEntry"("source", "quartetKey");

-- CreateIndex
CREATE UNIQUE INDEX "CardPoolEntry_source_externalId_key" ON "CardPoolEntry"("source", "externalId");
