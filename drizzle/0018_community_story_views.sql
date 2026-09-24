-- One row per (story, viewer): lets a story's author see how many people -
-- and who - have watched it, the way every real Stories UI does. A story is
-- just a community_posts row with kind='story', so this reuses that same id
-- rather than a separate stories table.

CREATE TABLE IF NOT EXISTS community_story_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_story_views_unique UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS community_story_views_post_idx ON community_story_views(post_id);
