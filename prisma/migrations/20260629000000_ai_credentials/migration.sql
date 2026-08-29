-- CreateTable
CREATE TABLE "AiCredential" (
    "key" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCredential_pkey" PRIMARY KEY ("key")
);
