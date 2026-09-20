-- Adds federated identity support without changing the existing session model.
-- Existing email/password users keep their hashes; Google-only users have no password hash.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS auth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(40) NOT NULL,
  provider_account_id varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_accounts_provider_account_unique
  ON auth_accounts(provider, provider_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS auth_accounts_user_provider_unique
  ON auth_accounts(user_id, provider);
CREATE INDEX IF NOT EXISTS auth_accounts_user_idx
  ON auth_accounts(user_id);
