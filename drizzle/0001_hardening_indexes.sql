-- Local hardening migration for an existing database created from the original archive.
-- Fresh databases created from src/db/schema.ts already include these constraints.
ALTER TABLE IF EXISTS reviews DROP CONSTRAINT IF EXISTS reviews_user_place_unique;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_place_unique
  ON reviews (user_id, place_id)
  WHERE place_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_provider_unique
  ON reviews (user_id, provider_id)
  WHERE provider_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_user_target_unique'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT reports_user_target_unique UNIQUE (reported_by_user_id, target_type, target_id);
  END IF;
END $$;
