-- Domain-ownership and review-target invariants. Existing malformed rows
-- intentionally block validation so operators repair them explicitly.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_exactly_one_target_check' AND conrelid = 'reviews'::regclass) THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_exactly_one_target_check
      CHECK ((place_id IS NOT NULL) <> (provider_id IS NOT NULL)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_rating_range_check' AND conrelid = 'reviews'::regclass) THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range_check
      CHECK (rating BETWEEN 1 AND 5) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_exactly_one_owner_check' AND conrelid = 'trips'::regclass) THEN
    ALTER TABLE trips ADD CONSTRAINT trips_exactly_one_owner_check
      CHECK ((user_id IS NOT NULL) <> (guest_id IS NOT NULL)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_owner_exclusive_check' AND conrelid = 'bookings'::regclass) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_owner_exclusive_check
      CHECK (NOT (user_id IS NOT NULL AND guest_id IS NOT NULL)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_conversations_exactly_one_owner_check' AND conrelid = 'ai_conversations'::regclass) THEN
    ALTER TABLE ai_conversations ADD CONSTRAINT ai_conversations_exactly_one_owner_check
      CHECK ((user_id IS NOT NULL) <> (guest_id IS NOT NULL)) NOT VALID;
  END IF;
END
$$;

ALTER TABLE reviews VALIDATE CONSTRAINT reviews_exactly_one_target_check;
ALTER TABLE reviews VALIDATE CONSTRAINT reviews_rating_range_check;
ALTER TABLE trips VALIDATE CONSTRAINT trips_exactly_one_owner_check;
ALTER TABLE bookings VALIDATE CONSTRAINT bookings_owner_exclusive_check;
ALTER TABLE ai_conversations VALIDATE CONSTRAINT ai_conversations_exactly_one_owner_check;
