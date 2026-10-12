-- Migration 002: Add Pandolf Equation fields for energy expenditure calculation
-- Date: 2026-10-11
-- Description: Adds body weight to activities and Pandolf equation fields to user segments

-- Add body weight to activities table
ALTER TABLE activities ADD COLUMN body_weight_lbs REAL;

-- Add Pandolf equation input fields to user_segments table
ALTER TABLE user_segments ADD COLUMN terrain_factor REAL DEFAULT 1.0 NOT NULL;
ALTER TABLE user_segments ADD COLUMN pack_weight_override_lbs REAL;

-- Add Pandolf equation output fields to user_segments table
ALTER TABLE user_segments ADD COLUMN avg_power_watts REAL;
ALTER TABLE user_segments ADD COLUMN total_energy_kcal REAL;
ALTER TABLE user_segments ADD COLUMN energy_calculation_error TEXT;
