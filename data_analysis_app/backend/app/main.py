"""Main FastAPI application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .api import activities, gpx, points, segments

# Create database tables
Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title="Garmin Data Analysis API",
    description="API for analyzing GPS trace data from Garmin activities",
    version="0.1.0"
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(activities.router, prefix="/api", tags=["activities"])
app.include_router(gpx.router, prefix="/api/gpx", tags=["gpx"])
app.include_router(points.router, prefix="/api", tags=["points"])
app.include_router(segments.router, prefix="/api", tags=["segments"])


@app.get("/")
def root():
    """Root endpoint."""
    return {
        "message": "Garmin Data Analysis API",
        "version": "0.1.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
