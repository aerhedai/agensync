-- Vocabulary alignment (CLAUDE.md §4.3): the primitive is a Record Type,
-- and the tools now take `recordType`. Agent configuration still said
-- `entityType` for the same concept — two names for one thing, which is
-- exactly the kind of drift this consolidation exists to remove.
--
-- Both columns hold live configuration, so the keys are renamed in place
-- rather than left for the application to read defensively.

-- Agent.pipelineConfig.entityType -> .recordType
-- Used by the entity_status_signal and entity_correspondence_archive
-- pipelines. Guarded on the key existing so agents with other pipeline
-- shapes (or no config at all) are untouched.
UPDATE "Agent"
SET "pipelineConfig" =
  ("pipelineConfig" - 'entityType')
  || jsonb_build_object('recordType', "pipelineConfig" -> 'entityType')
WHERE "pipelineConfig" ? 'entityType';

-- Agent.extractionFields[].lookupEntityType -> .lookupRecordType
-- An array of objects, so each element is rebuilt rather than the whole
-- value replaced. Elements without the key pass through unchanged.
UPDATE "Agent"
SET "extractionFields" = (
  SELECT jsonb_agg(
    CASE
      WHEN field ? 'lookupEntityType'
        THEN (field - 'lookupEntityType')
             || jsonb_build_object('lookupRecordType', field -> 'lookupEntityType')
      ELSE field
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements("extractionFields") WITH ORDINALITY AS t(field, ordinality)
)
WHERE jsonb_typeof("extractionFields") = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("extractionFields") AS f
    WHERE f ? 'lookupEntityType'
  );
