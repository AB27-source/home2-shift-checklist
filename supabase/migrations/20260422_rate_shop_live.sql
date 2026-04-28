-- Migration: rate_shop_live table
-- Stores in-progress rate shop data as agents enter it, before shift log submission.
-- The admin dashboard reads from this table in real-time via Supabase Realtime.
-- Run in the Supabase SQL editor or via supabase db push.

CREATE TABLE IF NOT EXISTS rate_shop_live (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid        NOT NULL,
  agent_name  text        NOT NULL,
  shift       text        NOT NULL,
  date        date        NOT NULL,
  rate_shops  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_shop_live_unique UNIQUE (agent_id, shift, date)
);

-- Enable Row Level Security with a fully permissive policy
-- (matches the access pattern of the rest of the app)
ALTER TABLE rate_shop_live ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON rate_shop_live FOR ALL USING (true) WITH CHECK (true);

-- Add table to the supabase_realtime publication so the admin dashboard
-- receives live updates without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE rate_shop_live;
