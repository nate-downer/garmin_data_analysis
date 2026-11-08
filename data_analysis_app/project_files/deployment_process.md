# Deployment Process

How "push code → the public site updates" will actually work once this is live, plus the exact checklist for the day you move this app into its own clean repo and point Render at it for the first time.

This doc assumes the architecture already decided in `hosting_plan.md` (Render, single service, persistent volume) and that the app-side work (login, Viewer Mode, private activities) is already built - see that doc's "Auth" section. Nothing here has been executed yet; this is the reference to follow when you are ready.

## The day-to-day picture (once this is live)

Just two environments, on purpose - no staging, to keep this simple:

- **Local** - your laptop, exactly like today: `uvicorn app.main:app --reload` + `npm run dev`, pointed at your local `garmin_data.db`. Nothing you do here is visible to anyone else until you push.
- **Public** - one Render Web Service, auto-deploying from a specific branch (`main`, by convention) of the GitHub repo. Every time you `git push` to that branch, Render notices, rebuilds, and replaces the running app with the new version automatically - you never log into Render's dashboard to manually trigger a deploy.

So the loop is: make changes locally, test them against your local database like always, and when you're happy, commit and push. A few minutes later the public site reflects it. If a push ever breaks something, Render's dashboard keeps the last few deploys and can roll back to the previous one with a couple of clicks - worth knowing that exists, but not something to set up in advance.

**What does *not* auto-update**: the database and model traces live on Render's persistent volume, completely separate from the code. Pushing code never touches your live data - the only way data changes is through the app itself (uploading activities, editing segments, fitting a model), exactly like using the local version.

## Repo-split checklist (do this when you're ready to actually go live)

### 1. Create the new repo
- Create `generative-outdoor-activity-tracker` on GitHub.
- Copy over **only** `data_analysis_app/` from this repo - not `scratch/`, `data_pipeline/`, `raw_garmin_data/`, or `README_files/` (those are this repo's legacy R-pipeline/analysis scratch work, not part of the app).
- Bring `project_files/` along too, including this doc and `hosting_plan.md` - they're meant to keep being useful after the split.
- Worth writing a fresh, shorter `README.md` scoped to just the app (the current root `README.md` covers the legacy R pipeline too, which won't exist in the new repo).

### 2. Confirm what's gitignored carries over correctly
The current `.gitignore` already excludes `*.db`, `backend/app/modeling/traces/`, `node_modules/`, `venv/`, and `.env` - carry the same patterns into the new repo. This means **the database and model traces are not in git today and won't be in the new repo either** - they move separately, in step 5.

### 3. Build and test the Dockerfile locally first
Per `hosting_plan.md`: installs `backend/requirements.txt`, runs `npm run build` for the frontend, and serves `frontend/dist` as static files from the same FastAPI app (single service, no CORS to configure). Test with `docker build` + `docker run` locally and confirm the app actually works end-to-end in the container **before** touching Render - much faster to debug locally than through Render's build logs.

### 4. Create the Render Web Service
- Connect it to the new GitHub repo, branch `main`.
- Attach a persistent disk (start at 1-2GB - current combined DB + traces is under 200MB, this gives headroom).
- Set environment variables:
  - `SECRET_KEY` - a random long string for session cookie signing (`main.py` reads this via `os.environ.get("SECRET_KEY", ...)`; the fallback value in the code is dev-only and must not be used in production).
  - Any others `requirements.txt`/`main.py` end up needing by the time you do this (re-check both files, since more may have been added since this doc was written).

### 5. Migrate the database and traces onto the new volume
This is a one-time manual copy, not a git operation:
- Copy your local `backend/garmin_data.db` onto the Render volume's mount path.
- Copy `backend/app/modeling/traces/` (the `runs/` directory and any top-level trace files) onto the same volume.
- Point the app's `SQLALCHEMY_DATABASE_URL` (`backend/app/database.py`) and the traces path at the volume's mount path instead of the local relative paths they use today.

### 6. Set your admin login on the production database
The scripts already built for this (`backend/seed_admin_user.py`, `backend/set_admin_password.py`) are designed to run once against whichever database they're pointed at - run them against the production DB (via Render's shell/SSH access, or by running them locally against a copy before uploading it in step 5):
```
python seed_admin_user.py <your-email>
python set_admin_password.py <your-password>
```

### 7. Deploy and verify end-to-end
- Confirm the public site loads and the landing page works for a logged-out visitor.
- Confirm Viewer Mode behaves correctly: banner shows, edit controls are guarded, private activities (if any) are invisible.
- Confirm live Predict Time works for a logged-out visitor.
- Log in as admin, confirm editing, GPX upload, and triggering a model fit all work.
- Confirm a fitted model's trace actually persists on the volume across a redeploy (push a trivial code change, redeploy, confirm the model run is still there) - this is the one thing that would silently break if the volume mount path were wrong.

### 8. Optional: custom domain
Not required to go live - Render provides a free `*.onrender.com` URL. Pointing a custom domain at it is a separate, later step if you want one.
