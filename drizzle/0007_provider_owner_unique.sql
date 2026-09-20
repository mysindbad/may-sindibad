-- Current provider workspace supports one business listing per user account.
-- Make that UI/domain invariant race-safe at the database boundary.
CREATE UNIQUE INDEX IF NOT EXISTS providers_owner_user_unique
  ON providers(owner_user_id);
