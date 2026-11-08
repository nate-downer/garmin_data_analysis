-- Migration 008: Tenancy foundation (Milestone 1.0, phase 1)
-- Date: 2026-11-08
-- Description: Adds a real users table (so future client accounts are additive,
-- not a migration) plus owner_id and is_public on activities. No login/session
-- logic yet - that's phase 2. owner_id is left nullable since there's no "current
-- user" concept to stamp new activities with until then; seed_admin_user.py
-- backfills it for existing rows once the single admin user is created.

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at DATETIME
);

ALTER TABLE activities ADD COLUMN owner_id INTEGER REFERENCES users(id);
ALTER TABLE activities ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT 1;
