-- Migration 006: Add predicted_total_duration_sec to activities table
-- Date: 2026-11-05
-- Description: Persists the most recent Predict Time result's total duration for
-- planned routes, so the list view can show a projected time instead of the
-- imported GPX trace's own (irrelevant) recorded duration.

ALTER TABLE activities ADD COLUMN predicted_total_duration_sec REAL;
