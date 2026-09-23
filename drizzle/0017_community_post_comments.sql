-- Comments on community posts: flat (not threaded), matching the feed's own
-- scope of short-form travel chatter rather than a discussion forum. Cascades
-- with both the post and the commenter's account like every other reaction
-- table here.

CREATE TABLE IF NOT EXISTS community_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body varchar(1000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_post_comments_post_idx ON community_post_comments(post_id);
