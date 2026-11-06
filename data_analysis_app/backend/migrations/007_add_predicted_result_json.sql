-- Migration 007: Add predicted_result_json to activities table
-- Date: 2026-11-06
-- Description: Persists the full most-recent Predict Time result (segments,
-- distributions, cumulative points, etc.) so it can be restored without
-- re-running the prediction when the user reopens the activity.

ALTER TABLE activities ADD COLUMN predicted_result_json TEXT;
