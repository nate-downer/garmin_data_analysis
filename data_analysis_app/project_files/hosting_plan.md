# Hosting Plan: Live Public Deployment with Admin Login

## Context

This is a reference document, not an immediate implementation task — the goal is to host this app so that (a) anyone can view activities/segments/predicted times read-only, and (b) I personally can log in from anywhere and edit/fit models remotely. Not ready to build this yet; this doc captures the plan to come back to later.

Two paths were considered:
- **Static export to GitHub Pages** — free, trivial, but inherently can't support remote editing or live model fitting (no backend at all). Ruled out since remote editing/fitting is wanted, not just local editing.
- **Live hosting with an admin login** (chosen) — a real persistent backend, a few $/month, supports everything including remote editing.

Confirmed decisions: real personal GPS/activity data is fine to be public (no scrubbing needed); budget is the "a few $/month, managed" tier (Render/Fly.io-style, not a raw VPS).

## Why this needs persistent, non-serverless hosting

- **PyMC/numpyro model fitting is a real compute job**, not a sub-second request — rules out classic serverless functions (Vercel/Netlify functions, AWS Lambda), which have execution-time/memory ceilings a NUTS sampler can blow through.
- **SQLite DB (currently 52MB) + model traces (currently 144MB, growing with every fit)** need to survive restarts/deploys — requires an attached persistent volume, not an ephemeral container filesystem.
- **No auth exists today** — every endpoint is open. This needs to be built from scratch.

## Recommended platform: Render

Connects directly to the GitHub repo (`github.com/nate-downer/garmin_data_analysis`), auto-deploys on push, supports a persistent disk on paid web services (~$7/mo base + ~$1-2/mo for a 1-2GB disk — size for headroom above the current 196MB combined DB+traces). Fly.io is a reasonable alternative with more manual control (flyctl CLI, fly.toml, volume commands) if Render's constraints become a problem later, but Render's simpler dashboard-based setup fits "come back to this later" better.

**Single-service architecture**: one Render Web Service runs FastAPI, which also serves the built Vite frontend's static files directly (mount `frontend/dist` and serve `index.html` for non-API routes). This avoids a second deploy target and avoids CORS configuration entirely — one URL, one service, one persistent disk.

## Auth: single admin login, not a user system ✅ Built (Milestone 1.0)

No multi-user auth provider needed — there's exactly one editor (me). This whole section is now implemented, not just planned:

1. **Backend**: a real `users` table (`backend/app/models.py`) with a bcrypt `password_hash`, set via `backend/set_admin_password.py`. `POST /api/auth/login` checks it and sets a signed httpOnly session cookie (Starlette's `SessionMiddleware`, `backend/app/main.py`) — cookie, not JWT, exactly as recommended below. `require_admin` (`backend/app/auth.py`) wraps every mutating route across `activities.py`/`points.py`/`segments.py`/`gpx.py`/`model_fitting.py`.
2. **The mutation-not-verb nuance held up as planned**: `POST /activities/{id}/predict` stays open to everyone - live Predict Time works for anonymous visitors. The one refinement made during implementation: its auto-save-to-activity side effect (added after this doc was first written) is gated to admin-only, so a visitor's inputs can't silently overwrite the saved result - the prediction itself is still fully live and open.
3. **Frontend**: real `/login` route (`frontend/src/pages/LoginPage.tsx`), `AuthContext` checking `GET /api/auth/me` on load, and a full **Viewer Mode** UX beyond what this doc originally scoped - a persistent banner, every write control guarded with a friendly "disabled in Viewer mode" message, and activities can be flagged private (`is_public` on `Activity`) and are fully invisible (404, not just hidden) to anyone but the admin.

Also added, beyond this doc's original scope: a `owner_id` column on `Activity` and a `role` column on `User`, so adding non-admin "Client" accounts later is additive (new user rows) rather than a schema migration.

## Deployment pieces still to build

Everything app-side (auth, viewer mode) is done. What's left is purely infrastructure - see `project_files/deployment_process.md` for the concrete step-by-step and the repo-split checklist:

- **Dockerfile** (or Render's native Python buildpack, simpler if it handles the `jax`/`numpyro` pins cleanly — worth testing both): installs `backend/requirements.txt`, builds the frontend (`npm run build`) and copies `frontend/dist` into a path the FastAPI app serves as static files.
- **Persistent volume** mounted at the path where the SQLite DB file and `backend/app/modeling/traces/` live, sized with headroom (start at 1-2GB).
- **Environment variables**: `SECRET_KEY` (session cookie signing - `main.py` already reads this via `os.environ.get`), any CORS origins (not needed in the single-service design, but keep in mind if this ever splits).
- **GitHub Pages-specific routing quirk does NOT apply here** — this is a real server (unlike the static-export path), so `BrowserRouter` works normally with no 404.html workaround needed.

## Things to decide when actually building this

- Whether to add light rate-limiting on the public `/predict` endpoint (low priority at personal-project traffic levels, but it is CPU work and is open to anyone).
- Backup strategy for the persistent volume (most PaaS platforms offer disk snapshots; otherwise a simple periodic copy of the SQLite file + traces to external storage).
- If this ever needs multiple instances or heavier concurrent write load, SQLite would need to move to a managed Postgres — not a near-term concern at current scale.

## Rough order of implementation

1. ✅ Admin-login backend module + `require_admin` on all mutating routes - done.
2. ✅ Frontend login flow + Viewer Mode (conditional edit-UI, banner, private activities) - done.
3. Write the Dockerfile / buildpack config and test it locally (`docker build` + run) before touching Render.
4. Create the Render Web Service, connect the (new, split-off) GitHub repo, attach a persistent volume, set environment variables/secrets.
5. Point the volume's mount path at the DB file + traces directory (one-time migration of the existing local `garmin_data.db` and `traces/` onto the new volume).
6. Deploy, verify the public read-only experience (including live Predict Time) and the admin login + edit flow both work end-to-end.

Steps 3-6 are written out as an actual checklist in `project_files/deployment_process.md`.
