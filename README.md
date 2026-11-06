# Garmin Data Analysis

A comprehensive platform for analyzing GPS activity data from Garmin devices. The project includes both an R-based data pipeline for preprocessing and a full-stack web application for interactive exploration, segmentation, energy expenditure analysis, and Bayesian time prediction for future routes.

## Overview

This platform enables detailed analysis of hiking, climbing, and mountaineering activities by:
- **Importing GPX files** with GPS trackpoints and elevation data
- **Cleaning and preprocessing** waypoint data (removing noise, detecting inactive periods)
- **Manual segmentation** of activities into climbs, descents, rests, and technical (roped) sections
- **Energy expenditure calculations** using the Pandolf biomechanical equation
- **Fitting a Bayesian hierarchical model** of locomotion duration across your own activity history
- **Predicting how long a planned route will take**, with full posterior uncertainty, before you go
- **Interactive visualization** with maps, elevation profiles, speed charts, and model diagnostics
- **A public-facing landing page** summarizing the app's capabilities

## Project Structure

```
garmin_data_analysis/
├── data_analysis_app/          # Full-stack web application
│   ├── backend/                 # FastAPI + SQLAlchemy backend
│   ├── frontend/                # React + TypeScript frontend
│   └── project_files/           # Project documentation, demo images, reference docs
├── scratch/data_pipeline/       # R-based preprocessing pipeline (legacy)
└── raw_garmin_data/             # Raw GPX files (not tracked in git)
```

## Tech Stack

### Web Application
- **Backend**: FastAPI, SQLAlchemy, SQLite, Python 3.9+
- **Bayesian modeling**: PyMC + ArviZ, sampled with the `numpyro` NUTS backend (JAX) for speed
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Recharts, React Router
- **Maps**: Leaflet / react-leaflet with OpenStreetMap tiles

### Data Pipeline (Legacy)
- **Language**: R
- **Packages**: tidyverse, sf, leaflet, caret, plotKML

## Running the Web Application Locally

### Prerequisites

- **Python 3.9+** (for backend)
- **Node.js 16+** and npm (for frontend)
- **Git** (to clone the repository)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd garmin_data_analysis
```

### 2. Set Up the Backend

```bash
# Navigate to backend directory
cd data_analysis_app/backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Initialize the database (first time only)
python seed_data.py

# Start the backend server
uvicorn app.main:app --reload --port 8000
```

The backend API will be available at **http://localhost:8000**

API documentation: **http://localhost:8000/docs**

> **Note on the Bayesian modeling dependencies**: `jax[cpu]`, `numpyro`, and `numpy` are pinned to specific compatible versions in `requirements.txt`. Newer `jax` releases pull in a `numpy>=2` dependency that conflicts with `pandas`/`pytensor`/`timezonefinder`'s `numpy<2` requirement — don't upgrade these three independently.

### 3. Set Up the Frontend

Open a **new terminal window**:

```bash
# Navigate to frontend directory
cd data_analysis_app/frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be available at **http://localhost:5173**

> If you edit frontend code and don't see the change after a refresh, see `project_files/frontend_edits_not_appearing.md` before assuming anything is broken — in practice this has always been a stale long-running `npm run dev` process, fixed by restarting it and opening a fresh browser tab.

### 4. Access the Application

Open your browser and navigate to **http://localhost:5173** — this is the public landing page. From there, "View Activity Analysis" takes you into the app itself.

## Pages / Routes

| Route | Page | Purpose |
|---|---|---|
| `/` | Landing page | Public-facing marketing page: feature highlights, "About the Analyst," methodology, and links to other projects. Not gated behind any login today. |
| `/app` | Activity list | Upload, edit, and clean completed activities. The main working view (this used to live at `/`). |
| `/analysis` | Analysis | Aggregate charts across all completed activities and climb segments, with best-fit trend lines. Planned (not-yet-completed) activities are excluded. |
| `/build-model` | Model diagnostics | Fit the Bayesian locomotion/rest-time models on your activity history and review their diagnostics (variance explained, coefficients, predicted-vs-actual). |
| `/plan-routes` | Plan routes | Upload a GPX trace for a route you haven't done yet (or re-trace a past one) and get a predicted completion time instead of an "actual" one. |

The header's app name ("Mountain G.O.A.T.") links back to `/` from anywhere in the app.

## Using the Application

### First-Time Setup

1. **Upload a GPX file** from `/app` or `/plan-routes`
   - Click "Add Activity" in the header
   - Select a `.gpx` file and whether it's a completed activity or a planned route
   - The system parses the file, creates the activity, and automatically attempts to generate segments

2. **Set Activity Metadata**
   - Open the activity and edit its metadata: **Body Weight (lbs)** (required for energy calculations), **Pack Weight (lbs)**, **Default Terrain Factor**, **Activity Type** (hiking/running/mountaineering), and — for completed activities — **Experience Level** (route/skill familiarity, used by the prediction model)
   - Experience Level for *planned* routes is instead set per-prediction in the Predict Time panel, alongside party size

3. **Generate or Edit Segments**
   - Segments are auto-generated on upload; re-run manually with "Generate Segments" if needed
   - Tag technical climbs/descents with difficulty (5-value dropdown), pitch count, and rope status
   - Split, merge, or adjust segment boundaries as needed

4. **Fit the prediction models** (once you have a reasonable amount of completed-activity history)
   - Go to `/build-model`, click "Build Model" (or trigger a fit) and review the diagnostics once it finishes

5. **Predict a route's time**
   - Open any activity (planned or completed) and expand "Predict Time"
   - Set start date/time, body weight, pack weight, party size, and experience level overrides, then run the prediction
   - Results (median + uncertainty band per segment, cumulative distance/time chart) are saved automatically and reload the next time you open that activity's prediction panel

### Key Features

#### Segment Management
- **Auto-generation**: Detects rest periods (inactivity > 5 min) and fills the gaps with climb/descent/flat segments
- **Manual creation**: Click start/end points on the elevation or speed charts
- **Segment types**: Climb, Descent, Flat, Rest, each optionally marked Technical
- **Technical climbing/descent metadata**: difficulty (3rd Class → 5th Hard), pitch count, roped/rappel status
- **Split/Merge/Adjust boundary**: reshape segments as your understanding of the route improves

#### Energy Expenditure Analysis
- **Pandolf Equation**: calculates metabolic power and energy expenditure for non-technical segments
- **Customizable inputs**: body weight (activity-level, required), pack weight (activity-level, with per-segment override), terrain factor (6 presets, Paved Road → Loose Sand, with per-segment override)
- **Outputs**: Average Power (watts), Total Energy (kcal)
- **Automatic (re)calculation** on segment create/update/merge/split/auto-generate

#### Time Prediction Models (Bayesian)
- A single pooled hierarchical model (PyMC, sampled via the `numpyro` NUTS backend) spans all 5 locomotion segment types — technical climb, non-technical climb, flat, non-technical descent, technical descent — plus a separate model for total rest time per activity
- **"Effort"** (a calibrated power-law function of distance + elevation gain) drives duration for the 3 non-vertical types; technical climb/descent instead use elevation change and pitch count directly, since horizontal distance is meaningless on a vertical face
- Shared covariates across all types: pack-load ratio, terrain factor, cumulative distance/elevation fatigue, party size, activity type, route-familiarity (experience level), and (for technical segments) climb difficulty
- A 2-harmonic time-of-day modifier and a per-activity random offset are shared across all segment types in one activity
- **Model diagnostics page** (`/build-model`) shows, per segment type: variance explained by each covariate (with its coefficient), and predicted-vs-actual duration, colored by segment type

#### Predicting a Route's Time
- Works for both completed activities (re-predict "what if") and planned routes you haven't done yet
- Per-prediction overrides: body weight, pack weight, party size, experience level, start date/time
- Posterior-predictive draws per segment, propagated into a cumulative time/distance chart with uncertainty bands
- Accounts for daylight (sunrise/sunset at the route's location) to flag whether you'd finish before dark
- The most recent prediction result is persisted per activity and auto-restored when you reopen it — no need to re-run it just to look at the last result

#### Planned Routes
- Upload a GPX trace for a route (your own past trace, or someone else's) without marking it as a completed activity of yours
- The activity list shows a **projected** time instead of an "actual" one, saved from your last prediction run
- Sorted alphabetically (no date column, since these have no real recorded date)

#### Data Cleaning
- **Remove outliers**: click points on charts or box-select on the map
- **Max speed filter**: automatically flag GPS noise above a threshold
- **Restore waypoints**: undo all removals if needed

#### Public Landing Page
- Marketing-style page at `/` built for a future public deployment, with feature highlights, an "About the Analyst" section, methodology write-up, and links to other projects
- "Admin Login" currently points to the same place as "View Activity Analysis" — real admin/view-only separation is tracked in `project_files/hosting_plan.md` and not yet built

## Database

The application uses **SQLite** for data storage:
- Development database: `backend/garmin_data.db`
- Schema migrations: `backend/migrations/` (sequential numbered `.sql` files, applied directly — there's no migration runner, just run the new ones in order against your `.db` file)

### Database Schema

**Main tables:**
- `activities` - Activity metadata and aggregate stats: name, date, activity type, body weight, pack weight, terrain factor, party size, experience level, `is_planned` flag, and the most recent prediction result (`predicted_total_duration_sec`, `predicted_result_json`)
- `points` - GPS trackpoints (lat, lon, elevation, time, `is_removed`, `is_inactive`)
- `segments` - Raw point-to-point deltas (distance/speed/grade), used internally for recalculation
- `user_segments` - User-defined segments with type, technical/difficulty/pitch-count metadata, terrain/pack overrides, and cached energy outputs

## API Endpoints

Full interactive documentation at `/docs`. Grouped by resource:

**Activities**
- `GET /api/activities` / `GET /api/activities/{id}` / `PATCH /api/activities/{id}` / `DELETE /api/activities/{id}`
- `GET /api/activities/stats/summary`
- `GET /api/activities/{id}/points`, `GET /api/activities/{id}/points/decimated`, `DELETE /api/activities/{id}/points`, `POST /api/activities/{id}/points/restore`, `POST /api/activities/{id}/points/calculate-inactivity`

**GPX upload**
- `POST /api/gpx/upload`

**Segments**
- `GET /api/activities/{id}/segments`, `POST /api/activities/{id}/segments/recalculate`
- `GET /api/activities/{id}/user-segments`, `POST /api/activities/{id}/user-segments`
- `POST /api/activities/{id}/segments/generate` - auto-generate segments
- `GET /api/user-segments` (all activities, used by the Analysis page), `PUT /api/user-segments/{id}`, `DELETE /api/user-segments/{id}`
- `PATCH /api/user-segments/{id}/adjust-boundary`, `POST /api/user-segments/{id}/split`, `POST /api/user-segments/{id}/merge-with-next`, `POST /api/user-segments/{id}/merge-with-previous`

**Model fitting & diagnostics**
- `POST /api/models/fit` - kick off a fit of the pooled locomotion + rest models
- `GET /api/models/fit-status`, `GET /api/models/runs`, `GET /api/models/runs/{run_id}/diagnostics`

**Predictions**
- `POST /api/activities/{id}/predict` - run a prediction (with optional body weight/pack weight/party size/experience-level overrides), auto-saves the result
- `GET /api/activities/{id}/predicted-result` - fetch the last saved prediction without re-running it

## Energy Calculation Details

The Pandolf Equation estimates metabolic energy cost during load carriage:

```
M = 1.5W + 2.0(W + L)(L/W)² + n(W + L)(1.5V² + 0.35VG)
```

Where:
- **M** = Metabolic rate (watts)
- **W** = Body weight (kg)
- **L** = Load/pack weight (kg)
- **V** = Velocity (m/s)
- **G** = Grade (as decimal)
- **n** = Terrain factor (1.0 = paved, 2.1 = loose sand)

**Requirements:**
- Segment must be non-technical
- Activity must have body weight set
- Minimum 2 GPS points in segment

**Calculation triggers:**
- Creating a segment
- Updating a segment
- Merging segments
- Splitting a segment
- Auto-generating segments

## Time Prediction Model Details

- **Effort curve**: for the 3 non-vertical segment types, a power-law transform of distance and elevation gain (`distance^p1 + (elevation/1000)^p2`) is calibrated once per fit via a closed-form grid search (plain OLS, no sampling) before the main model runs, so the hierarchical model never has to learn a nonlinear curve shape jointly with everything else.
- **Pooling structure**: baseline pace (`alpha_type`) is pooled across all 5 segment types; effort elasticity (`beta_type`) is pooled only across the 3 non-vertical types; every other covariate is a single shared coefficient across all 5 types.
- **Technical climb/descent**: use elevation change (gain for climbs, loss for descents) and pitch count directly instead of the effort curve, since horizontal distance doesn't mean anything on a vertical face.
- **Rest time**: a separate, simpler model regresses total rest time per activity on total distance and total elevation gain, plus the same shared covariates.
- **Diagnostics**: for each posterior draw, each model term's contribution to the linear predictor is computed and its variance taken across segments, normalized against total variance that draw — the median and 5th/95th percentile of that share is what's plotted as "% contribution," alongside the term's own coefficient.

## Data Pipeline (Legacy R Scripts)

The `scratch/data_pipeline/` directory contains the original R-based preprocessing pipeline:

1. `00_init.R` - Initialize environment and load libraries
2. `01_load_gpx_data.R` - Parse GPX files and extract trackpoints
3. `02_clean_noise_data.R` - Remove GPS noise and outliers
4. `03_distance_intervals.R` - Create distance-based segments
5. `05_comparative_analysis.R` - Compare multiple activities
6. `06_time_prediction_models.R` - Build predictive models

**Note**: The web application has largely replaced this pipeline, but the R scripts remain for reference and specialized batch processing.

## Development

### Backend Development

```bash
cd data_analysis_app/backend
source venv/bin/activate
uvicorn app.main:app --reload
```

### Frontend Development

```bash
cd data_analysis_app/frontend
npm run dev
```

Hot reload is enabled for both backend and frontend. To type-check the frontend without starting the dev server: `npx tsc --noEmit -p .`

### Database Migrations

Migrations are sequential SQL files in `backend/migrations/`, applied directly against the SQLite file (there's no migration-runner tool):

```bash
sqlite3 backend/garmin_data.db < backend/migrations/007_add_predicted_result_json.sql
```

Apply any migrations newer than your local database's state, in order.

## Troubleshooting

### Backend won't start
- Verify Python 3.9+ is installed: `python --version`
- Check virtual environment is activated
- Ensure all dependencies installed: `pip install -r requirements.txt`
- Check port 8000 is not in use: `lsof -i :8000`

### Frontend won't start
- Verify Node.js 16+ is installed: `node --version`
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check port 5173 is not in use

### Frontend changes don't appear after a refresh
- See `data_analysis_app/project_files/frontend_edits_not_appearing.md` — in practice this has always been a stale, long-running `npm run dev` process rather than a real code/caching bug. Restart the dev server and open a fresh browser tab before assuming anything else is wrong.

### Energy calculations not appearing
- Ensure activity has **Body Weight** set in Activity Details
- Segment must be **non-technical** (not marked as technical climbing)
- Check for error messages in segment statistics

### Model fit fails or won't converge
- Check `jax`/`numpyro`/`numpy` are pinned exactly as in `requirements.txt` - a newer `jax` pulls in `numpy>=2`, which silently breaks `pandas`/`pytensor`
- You need enough completed-activity history across enough segment types for the hierarchical model to have something to pool from; a handful of activities with only one segment type each won't fit well

### Database issues
- Backup your database: `cp backend/garmin_data.db backend/garmin_data.db.backup`
- Re-run any migrations newer than your current schema
- Use `seed_data.py` to reset to a fresh database (destroys data)

## Contributing

This is a personal project, but suggestions and improvements are welcome via issues or pull requests.

## License

Private project - see repository owner for licensing information.

## Acknowledgments

- **Pandolf Equation**: Pandolf, K. B., et al. (1977). Predicting energy expenditure with loads while standing or walking very slowly. *Journal of Applied Physiology*.
- **OpenStreetMap** contributors for map tiles
- **Garmin** for GPS device ecosystem
- This app was designed and specified by its owner, and implemented with assistance from **Claude Code**
