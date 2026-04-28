-- Migration: add edit_history JSONB column to shift_records
-- Stores an array of previous post versions before each edit:
--   [{ post_text, submitted_at, replaced_at }, ...]  (prepended, newest first)
--
-- Run in the Supabase SQL editor or via supabase db push.

ALTER TABLE shift_records
  ADD COLUMN IF NOT EXISTS edit_history JSONB NOT NULL DEFAULT '[]'::jsonb;
