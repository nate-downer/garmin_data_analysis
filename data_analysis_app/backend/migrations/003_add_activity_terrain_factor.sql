-- Migration 003: Add terrain_factor to activities table
-- Date: 2026-10-11
-- Description: Adds default terrain factor to activities for segment inheritance

ALTER TABLE activities ADD COLUMN terrain_factor REAL DEFAULT 1.0 NOT NULL;
