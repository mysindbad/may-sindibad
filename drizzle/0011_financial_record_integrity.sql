-- Bookings/payments are retained as authoritative financial records. Mirror the
-- application-level numeric/currency bounds in PostgreSQL so future import,
-- admin, or migration paths cannot persist financially nonsensical rows.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_guests_count_check' AND conrelid = 'bookings'::regclass) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_guests_count_check CHECK (guests_count BETWEEN 1 AND 50) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_total_amount_check' AND conrelid = 'bookings'::regclass) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_total_amount_check CHECK (total_amount >= 0 AND total_amount <= 99999999.99) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_currency_check' AND conrelid = 'bookings'::regclass) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_currency_check CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_check' AND conrelid = 'payments'::regclass) THEN
    ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0 AND amount <= 99999999.99) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_currency_check' AND conrelid = 'payments'::regclass) THEN
    ALTER TABLE payments ADD CONSTRAINT payments_currency_check CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
  END IF;
END $$;

ALTER TABLE bookings VALIDATE CONSTRAINT bookings_guests_count_check;
ALTER TABLE bookings VALIDATE CONSTRAINT bookings_total_amount_check;
ALTER TABLE bookings VALIDATE CONSTRAINT bookings_currency_check;
ALTER TABLE payments VALIDATE CONSTRAINT payments_amount_check;
ALTER TABLE payments VALIDATE CONSTRAINT payments_currency_check;
