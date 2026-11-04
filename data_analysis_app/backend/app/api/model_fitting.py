"""Endpoints for fitting and reading the hierarchical time-prediction models."""
from fastapi import APIRouter, BackgroundTasks, HTTPException

from ..database import SessionLocal
from ..modeling.fit_runner import get_fit_status, list_runs, load_run_diagnostics, run_fit

router = APIRouter()


@router.post("/models/fit")
def fit_models(background_tasks: BackgroundTasks):
    """Kick off fitting in the background. Only one fit runs at a time."""
    status = get_fit_status()
    if status["state"] == "running":
        return {"status": "already_running"}

    background_tasks.add_task(run_fit, SessionLocal)
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
