-- Add a fourth, long-form community post kind: a "story" (نشر قصة) with its
-- own title, alongside the existing short moment/tip/place posts. Body length
-- is widened for everyone since a story needs more room than a quick moment.

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS title varchar(140);

ALTER TABLE community_posts DROP CONSTRAINT IF EXISTS community_posts_kind_check;
ALTER TABLE community_posts ADD CONSTRAINT community_posts_kind_check
  CHECK (kind IN ('moment', 'tip', 'place', 'story'));

ALTER TABLE community_posts DROP CONSTRAINT IF EXISTS community_posts_body_length_check;
ALTER TABLE community_posts ADD CONSTRAINT community_posts_body_length_check
  CHECK (char_length(body) BETWEEN 2 AND 4000);
