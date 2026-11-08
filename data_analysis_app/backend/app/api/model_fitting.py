"""Endpoints for fitting and reading the hierarchical time-prediction models."""
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from pydantic import BaseModel

from .. import models
from ..auth import require_admin
from ..database import SessionLocal
from ..modeling.fit_runner import get_fit_status, list_runs, load_run_diagnostics, run_fit

router = APIRouter()


class FitRequest(BaseModel):
    # If set, restrict training data to just the N most-recently-dated activities
    # instead of the full history.
    n_recent_activities: Optional[int] = None


@router.post("/models/fit")
def fit_models(
    background_tasks: BackgroundTasks,
    request: FitRequest = FitRequest(),
    _admin: models.User = Depends(require_admin),
):
    """Kick off fitting in the background. Only one fit runs at a time."""
    status = get_fit_status()
    if status["state"] == "running":
        return {"status": "already_running"}

    background_tasks.add_task(run_fit, SessionLocal, request.n_recent_activities)
    return {"status": "started"}


@router.get("/models/fit-status")
def fit_status():
    """Current fit progress, polled by the frontend to drive the progress bar."""
    return get_fit_status()


@router.get("/models/runs")
def model_runs():
    """Historical fit runs (run_id, created_at, n_activities_total, rmse_pct per model), newest first."""
    return list_runs()


@router.get("/models/runs/{run_id}/diagnostics")
def model_run_diagnostics(run_id: str):
    """Variance-explained and predicted-vs-actual data for each of the 6 model groups, for one run."""
    diagnostics = load_run_diagnostics(run_id)
    if diagnostics is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return diagnostics
