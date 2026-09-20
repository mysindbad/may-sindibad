-- Keep provider coordinates structurally usable: either both values exist or neither does.
-- Existing inconsistent rows intentionally make validation fail so deployment stops
-- for explicit data repair instead of silently discarding a coordinate.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'providers_coordinate_pair_check'
      AND conrelid = 'providers'::regclass
  ) THEN
    ALTER TABLE providers
      ADD CONSTRAINT providers_coordinate_pair_check
      CHECK ((lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL))
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE providers
  VALIDATE CONSTRAINT providers_coordinate_pair_check;
