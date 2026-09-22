-- Community posts: short travel moments, tips and place recommendations.
--
-- Deliberately not a social network. A post exists so another traveller can
-- act on it, which is why place_id is a real foreign key: a post about a place
-- can be added straight into someone's trip through the normal trip layer.
--
-- Moderation reuses the existing reports table (target_type = 'community_post')
-- rather than inventing a second moderation path.

CREATE TABLE IF NOT EXISTS community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind varchar(20) NOT NULL DEFAULT 'moment',
  body text NOT NULL,
  place_id uuid REFERENCES places(id) ON DELETE SET NULL,
  city varchar(120),
  country varchar(120),
  status varchar(20) NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_posts_kind_check CHECK (kind IN ('moment', 'tip', 'place')),
  CONSTRAINT community_posts_status_check CHECK (status IN ('published', 'flagged', 'removed')),
  CONSTRAINT community_posts_body_length_check CHECK (char_length(body) BETWEEN 2 AND 1000)
);

CREATE INDEX IF NOT EXISTS community_posts_created_idx ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_user_idx ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS community_posts_status_idx ON community_posts(status);
