-- Ensure an external payment object cannot reconcile to more than one local payment.
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_unique
  ON payments(provider, provider_ref)
  WHERE provider_ref IS NOT NULL;
