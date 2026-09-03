-- Corrective follow-up to 20260903120000_consolidate_tool_names.
--
-- That migration mapped find_product onto find_record, which is right for
-- the exact-match lookups but wrong for the quote pipeline specifically:
-- its product lookup is now `search_records` (a fuzzy match on an
-- LLM-extracted product name), not `find_record`. Existing quote agents
-- were therefore left holding find_record + send_email and would fail at
-- the product step with "does not have access to this tool" — the tool
-- grant check working exactly as intended, against a grant list the
-- previous migration should have widened.
--
-- Scoped to agents actually running the quote pipeline rather than
-- granting search_records broadly: a tool an agent doesn't need is a tool
-- it shouldn't hold (CLAUDE.md §4.5).
INSERT INTO "AgentTool" ("id", "agentId", "toolName")
SELECT gen_random_uuid()::text, "id", 'search_records'
FROM "Agent"
WHERE "pipelineKey" = 'quote'
ON CONFLICT ("agentId", "toolName") DO NOTHING;
