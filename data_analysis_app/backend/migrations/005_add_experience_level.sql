-- Migration 005: Add experience_level to activities table
-- Date: 2026-11-05
-- Description: Route-familiarity categorical field (4 levels), used as a shared
-- covariate in the pooled locomotion duration model (Milestone 0.9).

ALTER TABLE activities ADD COLUMN experience_level TEXT NOT NULL DEFAULT 'New Route - Familiar Skills';
