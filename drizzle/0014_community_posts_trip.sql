-- Let a community post optionally showcase one of the traveller's own trips,
-- not just a single place. Nullable and ON DELETE SET NULL: deleting the
-- trip should not delete the post someone already read and reacted to.

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES trips(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS community_posts_trip_idx ON community_posts(trip_id);
