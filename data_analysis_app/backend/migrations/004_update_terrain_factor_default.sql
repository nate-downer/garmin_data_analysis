-- Migration 004: Update default terrain_factor to 1.1 (Dirt Road)
-- Date: 2026-10-11
-- Description: Changes default terrain factor from 1.0 (Paved) to 1.1 (Dirt Road)

-- Update existing activities with terrain_factor = 1.0 to 1.1
UPDATE activities SET terrain_factor = 1.1 WHERE terrain_factor = 1.0 OR terrain_factor IS NULL;
