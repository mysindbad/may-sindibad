-- Provider service rows are authoritative booking/pricing inputs. Mirror the
-- application validation in PostgreSQL so imports/admin scripts/corrupt writes
-- cannot silently create negative/free pricing, invalid capacities, or malformed
-- currency values that the booking path would later trust.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_services_price_amount_check'
      AND conrelid = 'provider_services'::regclass
  ) THEN
    ALTER TABLE provider_services ADD CONSTRAINT provider_services_price_amount_check
      CHECK (price_amount IS NULL OR (price_amount >= 0 AND price_amount <= 1000000)) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_services_currency_check'
      AND conrelid = 'provider_services'::regclass
  ) THEN
    ALTER TABLE provider_services ADD CONSTRAINT provider_services_currency_check
      CHECK (price_currency ~ '^[A-Z]{3}$') NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_services_duration_check'
      AND conrelid = 'provider_services'::regclass
  ) THEN
    ALTER TABLE provider_services ADD CONSTRAINT provider_services_duration_check
      CHECK (duration_minutes IS NULL OR (duration_minutes >= 1 AND duration_minutes <= 100000)) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_services_capacity_check'
      AND conrelid = 'provider_services'::regclass
  ) THEN
    ALTER TABLE provider_services ADD CONSTRAINT provider_services_capacity_check
      CHECK (capacity IS NULL OR (capacity >= 1 AND capacity <= 10000)) NOT VALID;
  END IF;
END $$;

ALTER TABLE provider_services VALIDATE CONSTRAINT provider_services_price_amount_check;
ALTER TABLE provider_services VALIDATE CONSTRAINT provider_services_currency_check;
ALTER TABLE provider_services VALIDATE CONSTRAINT provider_services_duration_check;
ALTER TABLE provider_services VALIDATE CONSTRAINT provider_services_capacity_check;
