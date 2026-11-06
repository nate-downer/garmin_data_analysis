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

## Auth: single admin login, not a user system

No multi-user auth provider needed — there's exactly one editor (me). Plan:

1. **Backend**: an admin password stored as a Render environment variable/secret (never committed). A `POST /api/auth/login` endpoint checks the submitted password against it and, if correct, issues a signed JWT (or sets an httpOnly session cookie — cookie is preferable, avoids exposing the token to frontend JS/XSS). A FastAPI dependency (e.g. `require_admin`) wraps every **mutating** route: segment create/edit/delete, activity metadata updates, GPX upload, triggering a model fit.
2. **Important nuance — gate on mutation, not on HTTP verb**: `POST /activities/{id}/predict` is a `POST` but doesn't write anything to the database — it just runs inference against an already-fitted model and returns a result. This should stay **open to everyone**, not gated behind login. That means anonymous visitors get the *real*, *live*, interactive Predict Time panel (pick body weight/start time/etc. and get an actual computed result) — strictly better than a static "frozen example" — not just a read-only view of past predictions. Gate only on routes that actually change persisted state.
3. **Frontend**: a login form (e.g. a hidden `/login` route or a discreet header button), storing auth via the httpOnly cookie Render/the backend sets (no manual token handling needed in JS). Conditionally render all editing UI (segment forms, activity metadata edit controls, GPX upload page, "Build Model" trigger) based on an `isAuthenticated` check (e.g. a `GET /api/auth/me` call on load). Logged-out visitors see the full read-only experience: activities, segments, charts, and a fully live/interactive Predict Time panel — just no edit controls.

## Deployment pieces to build (none exist today)

- **Dockerfile** (or Render's native Python buildpack, simpler if it handles the `jax`/`numpyro` pins cleanly — worth testing both): installs `backend/requirements.txt`, builds the frontend (`npm run build`) and copies `frontend/dist` into a path the FastAPI app serves as static files.
- **Persistent volume** mounted at the path where the SQLite DB file and `backend/app/modeling/traces/` live, sized with headroom (start at 1-2GB).
- **Environment variables**: admin password, JWT/session signing secret, any CORS origins (not needed in the single-service design, but keep in mind if this ever splits).
- **Auth module** (new): login/logout endpoints, the `require_admin` dependency, applied across `backend/app/api/*.py` mutating routes.
- **Frontend auth state**: login form, auth-check hook, conditional rendering of edit controls across `ActivityEditor.tsx`, `ActivityMetadataForm.tsx`, the GPX upload page, and the "Build Model" page.
- **GitHub Pages-specific routing quirk does NOT apply here** — this is a real server (unlike the static-export path), so `BrowserRouter` works normally with no 404.html workaround needed.

## Things to decide when actually building this

- Exact session mechanism: signed httpOnly cookie (recommended, simpler + more secure) vs. JWT-in-localStorage.
- Whether to add light rate-limiting on the public `/predict` endpoint (low priority at personal-project traffic levels, but it is CPU work and is open to anyone).
- Backup strategy for the persistent volume (most PaaS platforms offer disk snapshots; otherwise a simple periodic copy of the SQLite file + traces to external storage).
- If this ever needs multiple instances or heavier concurrent write load, SQLite would need to move to a managed Postgres — not a near-term concern at current scale.

## Rough order of implementation, when ready

1. Build the admin-login backend module (password check, session/JWT issuance, `require_admin` dependency) and apply it to all mutating routes.
2. Add the frontend login flow + conditional edit-UI rendering.
3. Write the Dockerfile / buildpack config and test it locally (`docker build` + run) before touching Render.
4. Create the Render Web Service, connect the GitHub repo, attach a persistent volume, set environment variables/secrets.
5. Point the volume's mount path at the DB file + traces directory (will need a one-time migration of the existing local `garmin_data.db` and `traces/` onto the new volume).
6. Deploy, verify the public read-only experience (including live Predict Time) and the admin login + edit flow both work end-to-end.
