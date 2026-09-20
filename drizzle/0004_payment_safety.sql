CREATE INDEX IF NOT EXISTS "payments_booking_idx" ON "payments" USING btree ("booking_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_active_booking_unique"
  ON "payments" USING btree ("booking_id")
  WHERE "status" in ('requires_payment', 'processing', 'succeeded');
