-- Sindbad's long-term memory of the traveller.
--
-- Deliberately narrow: this table holds durable facts about a *person*
-- (how they like to travel, who they travel with, what they avoid), never
-- facts about the *world* (prices, opening hours, weather, availability).
-- World facts go stale and would be quoted back as if still true; personal
-- preferences stay useful across trips.
--
-- One row per (user, kind, key) so re-stating a preference updates it in
-- place instead of accumulating duplicates, and everything is scoped to a
-- user id with ON DELETE CASCADE so deleting an account deletes its memory.

CREATE TABLE IF NOT EXISTS user_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind varchar(32) NOT NULL,
  memory_key varchar(80) NOT NULL,
  value text NOT NULL,
  source varchar(16) NOT NULL DEFAULT 'stated',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_memories_kind_check
    CHECK (kind IN ('preference', 'interest', 'avoid', 'companion', 'budget_style', 'constraint')),
  CONSTRAINT user_memories_source_check
    CHECK (source IN ('stated', 'observed')),
  CONSTRAINT user_memories_value_length_check
    CHECK (char_length(value) BETWEEN 1 AND 200),
  CONSTRAINT user_memories_user_key_unique UNIQUE (user_id, kind, memory_key)
);

CREATE INDEX IF NOT EXISTS user_memories_user_idx ON user_memories(user_id);
