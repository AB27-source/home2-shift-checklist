-- Migration: add rate_shops JSONB column to shift_records
-- Stores per-shift competitor rate shop data:
--   { start: { [hotelId]: { rate, ts } }, mid: {...}, end: {...} }
--
-- Run this in the Supabase SQL editor or via supabase db push.

ALTER TABLE shift_records
  ADD COLUMN IF NOT EXISTS rate_shops JSONB;
