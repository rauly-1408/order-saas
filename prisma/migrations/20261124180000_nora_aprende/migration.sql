-- NORA: preguntas del asistente y su valoración, por restaurante.
CREATE TABLE "AssistantQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "reply" TEXT,
    "likedReply" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "helpful" INTEGER NOT NULL DEFAULT 0,
    "unhelpful" INTEGER NOT NULL DEFAULT 0,
    "lastAskedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssistantQuestion_tenantId_key_key" ON "AssistantQuestion"("tenantId", "key");
CREATE INDEX "AssistantQuestion_tenantId_count_idx" ON "AssistantQuestion"("tenantId", "count");

ALTER TABLE "AssistantQuestion" ADD CONSTRAINT "AssistantQuestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
