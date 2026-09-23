-- Real reactions on community posts: a simple like, one row per (post, user)
-- so toggling can never double-count, enforced by the database rather than
-- trusted to the application alone. Both sides cascade so removing a post or
-- an account also removes the likes attached to it.

CREATE TABLE IF NOT EXISTS community_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_post_likes_unique UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS community_post_likes_post_idx ON community_post_likes(post_id);
