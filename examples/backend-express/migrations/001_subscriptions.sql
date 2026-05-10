-- Postgres schema for the Hugo PWA reference Express push backend.
--
-- Apply via: psql "$DATABASE_URL" -f migrations/001_subscriptions.sql
--
-- The endpoint column is the natural primary key (every push subscription has a unique
-- endpoint URL). p256dh + auth are the subscription keys (base64url-encoded). created_at
-- and updated_at track lifecycle for periodic cleanup of stale rows.

CREATE TABLE IF NOT EXISTS pwa_subscriptions (
  endpoint    TEXT        PRIMARY KEY,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Useful for periodic cleanup tasks: "delete rows where updated_at < NOW() - INTERVAL '180 days'".
CREATE INDEX IF NOT EXISTS pwa_subscriptions_updated_at_idx
  ON pwa_subscriptions (updated_at);
