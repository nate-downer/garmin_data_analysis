"""Main FastAPI application."""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from .database import engine, Base
from .api import activities, auth, gpx, points, segments, model_fitting, predictions

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

# Signed httpOnly session cookie (Milestone 1.0 phase 2 - admin login). SECRET_KEY
# should be set via the environment in any real deployment; the fallback here is
# only for local dev convenience.
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SECRET_KEY", "dev-only-insecure-secret-key"),
    same_site="lax",
)

# Include routers
app.include_router(activities.router, prefix="/api", tags=["activities"])
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(gpx.router, prefix="/api/gpx", tags=["gpx"])
app.include_router(points.router, prefix="/api", tags=["points"])
app.include_router(segments.router, prefix="/api", tags=["segments"])
app.include_router(model_fitting.router, prefix="/api", tags=["models"])
app.include_router(predictions.router, prefix="/api", tags=["predictions"])


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
