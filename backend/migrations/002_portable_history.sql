-- Whole historical graphs are replayed as documents. Preserve node dictionary order on new imports.
ALTER TABLE import_history ALTER COLUMN graph TYPE JSON USING graph::json;
ALTER TABLE snapshot_heads ALTER COLUMN snapshot TYPE BIGINT;
