# Garmin Data Analysis Backend

FastAPI backend for GPS trace data analysis.

## Setup

### 1. Create Virtual Environment

```bash
cd data_analysis_app/backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Environment Configuration

```bash
cp .env.example .env
# Edit .env if needed (defaults should work for local development)
```

### 4. Initialize Database

The database will be created automatically when you first run the app.
Tables are created via SQLAlchemy models.

### 5. Seed with Existing Data (Optional)

If you have existing data from the R pipeline, run the seed script:

```bash
python seed_data.py
```

This will import activities from the R pipeline CSVs into the SQLite database.

## Running the Server

### Development Mode (with auto-reload)

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:
- API: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- Alternative docs: http://localhost:8000/redoc

## API Endpoints

### Activities
- `GET /api/activities` - List all activities
- `GET /api/activities/{activity_id}` - Get activity details
- `PATCH /api/activities/{activity_id}` - Update activity metadata
- `DELETE /api/activities/{activity_id}` - Delete activity
- `GET /api/activities/stats/summary` - Get summary statistics

### GPX Upload
- `POST /api/gpx/upload` - Upload GPX file

### Points
- `GET /api/activities/{activity_id}/points` - Get all points
- `GET /api/activities/{activity_id}/points/decimated` - Get downsampled points
- `DELETE /api/activities/{activity_id}/points` - Remove points (time range)
- `POST /api/activities/{activity_id}/points/restore` - Restore removed points

### Segments
- `GET /api/activities/{activity_id}/segments` - Get calculated segments
- `POST /api/activities/{activity_id}/segments/recalculate` - Recalculate segments
- `GET /api/activities/{activity_id}/user-segments` - Get user-defined segments
- `POST /api/activities/{activity_id}/user-segments` - Create user segment
- `PUT /api/user-segments/{segment_id}` - Update user segment
- `DELETE /api/user-segments/{segment_id}` - Delete user segment

## Testing

### Manual Testing with curl

```bash
# Health check
curl http://localhost:8000/health

# List activities
curl http://localhost:8000/api/activities

# Get summary stats
curl http://localhost:8000/api/activities/stats/summary

# Upload GPX
curl -X POST -F "file=@path/to/activity.gpx" http://localhost:8000/api/gpx/upload
```

### Interactive Testing

Visit http://localhost:8000/docs for Swagger UI with interactive API testing.

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── database.py          # Database setup
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── api/                 # API endpoints
│   │   ├── activities.py
│   │   ├── gpx.py
│   │   ├── points.py
│   │   └── segments.py
│   ├── services/            # Business logic
│   │   ├── gpx_parser.py
│   │   ├── calculations.py
│   │   └── timezone.py
│   └── utils/               # Utilities
├── requirements.txt
├── .env.example
├── seed_data.py             # Seed script for existing data
└── garmin_data.db           # SQLite database (created on first run)
```

## Development Notes

- The database uses SQLite for simplicity (single-user, local deployment)
- All timestamps are stored in UTC; timezone info is separate
- Points are soft-deleted (is_removed flag) to preserve history
- Segments are automatically recalculated when points are removed
- CORS is configured for local frontend development (ports 3000, 5173)
