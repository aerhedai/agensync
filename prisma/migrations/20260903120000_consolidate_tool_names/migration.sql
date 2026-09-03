-- Tool consolidation (CLAUDE.md §7): the registry collapsed from sixteen
-- tools to eleven, replacing per-domain lookups with generic record verbs
-- and merging the two chat-notification tools into one.
--
-- Existing AgentTool grants and Agent.actionTool values reference the old
-- names, so they are rewritten here rather than left dangling — a grant
-- naming a tool that no longer exists would silently stop an agent doing
-- something it was configured to do.
--
-- Written as insert-then-delete rather than UPDATE because several old
-- names collapse onto one new name (find_customer, find_product and
-- find_custom_entity_record all become find_record), so an in-place UPDATE
-- violates the (agentId, toolName) unique constraint the moment an agent
-- holds two of them. ON CONFLICT DO NOTHING makes the collapse idempotent.

INSERT INTO "AgentTool" ("id", "agentId", "toolName")
SELECT DISTINCT
  gen_random_uuid()::text,
  "agentId",
  CASE "toolName"
    WHEN 'find_customer' THEN 'find_record'
    WHEN 'find_product' THEN 'find_record'
    WHEN 'find_custom_entity_record' THEN 'find_record'
    WHEN 'search_custom_entity' THEN 'search_records'
    WHEN 'create_custom_entity_record' THEN 'create_record'
    WHEN 'update_custom_entity_record' THEN 'update_record'
    WHEN 'notify_slack' THEN 'notify_channel'
    WHEN 'notify_teams' THEN 'notify_channel'
    WHEN 'create_storage_folder' THEN 'create_folder'
    WHEN 'save_storage_file' THEN 'save_file'
    WHEN 'populate_document_template' THEN 'populate_template'
  END
FROM "AgentTool"
WHERE "toolName" IN (
  'find_customer', 'find_product', 'find_custom_entity_record',
  'search_custom_entity', 'create_custom_entity_record',
  'update_custom_entity_record', 'notify_slack', 'notify_teams',
  'create_storage_folder', 'save_storage_file', 'populate_document_template'
)
ON CONFLICT ("agentId", "toolName") DO NOTHING;

-- Every old name is now represented by its replacement, so the old rows go.
-- check_inventory and calculate_quote have no replacement and are dropped
-- outright: stock is an ordinary field on the Product record returned by
-- find_record, and pricing is arithmetic the quote pipeline does inline
-- (CLAUDE.md §3 — a vertical is never a primitive).
DELETE FROM "AgentTool"
WHERE "toolName" IN (
  'find_customer', 'find_product', 'check_inventory', 'calculate_quote',
  'find_custom_entity_record', 'search_custom_entity',
  'create_custom_entity_record', 'update_custom_entity_record',
  'notify_slack', 'notify_teams', 'create_storage_folder',
  'save_storage_file', 'populate_document_template'
);

-- Agent.actionTool names the terminal action a HARNESS pipeline proposes.
-- Only the chat tools were renamed; send_email is unchanged.
UPDATE "Agent" SET "actionTool" = 'notify_channel'
WHERE "actionTool" IN ('notify_slack', 'notify_teams');
