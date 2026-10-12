# Garmin Data Analysis

A comprehensive platform for analyzing GPS activity data from Garmin devices. The project includes both an R-based data pipeline for preprocessing and a full-stack web application for interactive exploration, segmentation, and energy expenditure analysis.

## Overview

This platform enables detailed analysis of hiking, climbing, and outdoor activities by:
- **Importing GPX files** with GPS trackpoints and elevation data
- **Cleaning and preprocessing** waypoint data (removing noise, detecting inactive periods)
- **Manual segmentation** of activities into climbs, descents, rests, and technical sections
- **Energy expenditure calculations** using the Pandolf biomechanical equation
- **Interactive visualization** with maps, elevation profiles, and speed charts
- **Comparative analysis** across multiple activities

## Project Structure

```
garmin_data_analysis/
├── data_analysis_app/          # Full-stack web application
│   ├── backend/                 # FastAPI + SQLAlchemy backend
│   ├── frontend/                # React + TypeScript frontend
│   └── project_files/           # Project documentation
├── scratch/data_pipeline/       # R-based preprocessing pipeline (legacy)
└── raw_garmin_data/             # Raw GPX files (not tracked in git)
```

## Tech Stack

### Web Application
- **Backend**: FastAPI, SQLAlchemy, SQLite, Python 3.9+
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Recharts
- **Maps**: Leaflet with OpenStreetMap tiles

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

### 4. Access the Application

Open your browser and navigate to **http://localhost:5173**

## Using the Application

### First-Time Setup

1. **Upload a GPX file**
   - Click "Upload GPX" in the top navigation
   - Select a `.gpx` file from your Garmin device
   - The system will parse the file and create an activity

2. **Set Activity Metadata**
   - Open an activity and click "Activity Details"
   - Set **Body Weight (lbs)** - required for energy calculations
   - Set **Default Terrain Factor** (default: Dirt Road = 1.1)
   - Set **Pack Weight (lbs)** - optional, for load carriage analysis

3. **Generate Segments**
   - Click "View Segments" panel
   - Click "Generate Segments" to auto-detect rest periods
   - OR manually create segments by clicking points on the charts

### Key Features

#### Segment Management
- **Auto-generation**: Detects rest periods (inactivity >5 min) and fills gaps
- **Manual creation**: Click start/end points on elevation or speed charts
- **Segment types**: Climb, Descent, Flat, Rest
- **Technical classification**: Mark segments as technical climbing
- **Split/Merge**: Adjust segment boundaries as needed

#### Energy Expenditure Analysis
- **Pandolf Equation**: Calculates metabolic power and energy expenditure
- **Customizable inputs**:
  - Body weight (activity-level, required)
  - Pack weight (activity-level with per-segment override)
  - Terrain factor (6 presets from Paved Road to Loose Sand)
- **Outputs**:
  - Average Power (watts)
  - Total Energy (kcal)
- **Automatic calculation** on segment create/update/merge/split

#### Data Cleaning
- **Remove outliers**: Click points on charts or box-select on map
- **Max speed filter**: Automatically flag GPS noise above a threshold
- **Restore waypoints**: Undo all removals if needed

## Database

The application uses **SQLite** for data storage:
- Development database: `backend/garmin_data.db`
- Schema migrations: `backend/migrations/`

### Database Schema

**Main tables:**
- `activities` - Activity metadata (name, date, body weight, terrain factor)
- `points` - GPS trackpoints (lat, lon, elevation, time, is_removed, is_inactive)
- `user_segments` - User-defined segments with terrain/energy data

## API Endpoints

Key endpoints (full documentation at `/docs`):

- `POST /upload` - Upload GPX file
- `GET /activities` - List all activities
- `GET /activities/{id}/points` - Get activity points (with decimation)
- `POST /activities/{id}/user-segments` - Create segment
- `POST /activities/{id}/user-segments/generate` - Auto-generate segments
- `PUT /user-segments/{id}` - Update segment (triggers energy recalculation)

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

Hot reload is enabled for both backend and frontend.

### Database Migrations

Migrations are SQL files in `backend/migrations/`:

```bash
sqlite3 backend/garmin_data.db < backend/migrations/001_initial_schema.sql
```

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

### Energy calculations not appearing
- Ensure activity has **Body Weight** set in Activity Details
- Segment must be **non-technical** (not marked as technical climbing)
- Check for error messages in segment statistics

### Database issues
- Backup your database: `cp backend/garmin_data.db backend/garmin_data.db.backup`
- Re-run migrations if schema is out of date
- Use `seed_data.py` to reset to a fresh database (destroys data)

## Contributing

This is a personal project, but suggestions and improvements are welcome via issues or pull requests.

## License

Private project - see repository owner for licensing information.

## Acknowledgments

- **Pandolf Equation**: Pandolf, K. B., et al. (1977). Predicting energy expenditure with loads while standing or walking very slowly. *Journal of Applied Physiology*.
- **OpenStreetMap** contributors for map tiles
- **Garmin** for GPS device ecosystem
