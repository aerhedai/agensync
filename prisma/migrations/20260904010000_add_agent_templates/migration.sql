-- Named, reusable step programmes (docs/agent-step-engine-design.md §6).
-- This is where verticals live: "Quote Handling" becomes a template rather
-- than a hardcoded category every unrelated business scrolls past.
CREATE TABLE "AgentTemplate" (
    "id" TEXT NOT NULL,
    -- NULL means a built-in template available to every organisation; set
    -- means one a business saved for itself.
    "organisationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '{}',
    "suggestedTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentTemplate_organisationId_idx" ON "AgentTemplate"("organisationId");

ALTER TABLE "AgentTemplate" ADD CONSTRAINT "AgentTemplate_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
