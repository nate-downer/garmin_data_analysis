-- Migration: Add is_inactive field to points table
-- Date: 2026-10-11
-- Description: Adds boolean field to track inactive points (speed < 0.05 mph) for automated segmentation

-- Add is_inactive column with default value of 0 (False)
ALTER TABLE points ADD COLUMN is_inactive BOOLEAN DEFAULT 0 NOT NULL;

-- Optional: Add index if we frequently query by inactivity status
-- CREATE INDEX idx_points_inactive ON points(is_inactive);
