"""Orchestrates fitting all time-prediction models as a background task with progress
reporting, and persists each fit as a distinct historical run so past fits can be
browsed and compared rather than overwritten.
"""
import json
import threading
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import arviz as az
import numpy as np

from .data import extract_locomotion_dataframe, extract_rest_dataframe
from .effort import calibrate_effort_curve, compute_effort
from .locomotion_model import SEGMENT_TYPES, EFFORT_SEGMENT_TYPES, build_and_fit_pooled_model
from .rest_model import build_and_fit_rest_model
from .diagnostics import pooled_diagnostics, rest_diagnostics

TRACE_DIR = Path(__file__).resolve().parent / "traces"
TRACE_DIR.mkdir(exist_ok=True)

RUNS_DIR = TRACE_DIR / "runs"
RUNS_DIR.mkdir(exist_ok=True)

RUNS_INDEX_PATH = TRACE_DIR / "runs_index.json"

MODEL_GROUPS = SEGMENT_TYPES + ["rest"]

FIT_STEPS = [
    "Extracting segment data",
    "Calibrating effort curve",
    "Fitting pooled locomotion model",
    "Fitting rest-time model",
    "Computing diagnostics",
    "Saving results",
]

_status_lock = threading.Lock()
_status = {
    "state": "idle",  # idle | running | done | error
    "step_index": -1,
    "step_label": None,
    "total_steps": len(FIT_STEPS),
    "error": None,
    "updated_at": None,
    "run_id": None,
}


def get_fit_status() -> dict:
    with _status_lock:
        return dict(_status)


def _set_status(**kwargs) -> None:
    with _status_lock:
        _status.update(kwargs)
        _status["updated_at"] = datetime.utcnow().isoformat()


def _set_step(step_index: int) -> None:
    _set_status(state="running", step_index=step_index, step_label=FIT_STEPS[step_index])


def _new_run_id() -> str:
    base = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    run_id = base
    suffix = 1
    while (RUNS_DIR / run_id).exists():
        suffix += 1
        run_id = f"{base}_{suffix}"
    return run_id


def _run_dir(run_id: str) -> Path:
    return RUNS_DIR / run_id


def _read_runs_index() -> List[dict]:
    if not RUNS_INDEX_PATH.exists():
        return []
    return json.loads(RUNS_INDEX_PATH.read_text())


def _append_run_index_entry(entry: dict) -> None:
    runs = _read_runs_index()
    runs.append(entry)
    RUNS_INDEX_PATH.write_text(json.dumps(runs))


def list_runs() -> List[dict]:
    """Run summaries (run_id, created_at, n_activities_total, rmse_pct per model), newest first."""
    runs = _read_runs_index()
    for run in runs:
        run["is_predictable"] = (_run_dir(run["run_id"]) / "metadata.json").exists()
    return sorted(runs, key=lambda r: r["created_at"], reverse=True)


def load_run_diagnostics(run_id: str) -> Optional[dict]:
    path = _run_dir(run_id) / "diagnostics.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def load_run_metadata(run_id: str) -> Optional[dict]:
    path = _run_dir(run_id) / "metadata.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def run_dir(run_id: str) -> Path:
    """Public accessor for a run's directory (traces live here)."""
    return _run_dir(run_id)


def run_fit(db_session_factory, n_recent_activities: Optional[int] = None) -> None:
    """
    Fit all time-prediction models and persist results as a new historical run.

    The 5 locomotion segment types are fit together in one pooled hierarchical model
    (see locomotion_model.py) - this is safe to pool now that "effort" is a
    deterministic feature rather than a latent variable, which is what caused the
    earlier pooled attempt's hard-to-sample funnel.

    Runs inside a FastAPI background task, so it takes a session factory (not a live
    Session) since the request that triggered it may have already returned.

    `n_recent_activities`, if given, restricts training data to just the N
    most-recently-dated real activities instead of the full history.
    """
    with _status_lock:
        if _status["state"] == "running":
            return
    run_id = _new_run_id()
    _set_status(state="running", step_index=-1, step_label=None, error=None, run_id=run_id)

    db = db_session_factory()
    try:
        _set_step(0)
        loco_df = extract_locomotion_dataframe(db, n_recent_activities)
        rest_df = extract_rest_dataframe(db, n_recent_activities)

        if loco_df.empty or rest_df.empty:
            raise ValueError("Not enough segment data to fit models.")

        activity_ids = set(loco_df["activity_id"]) | set(rest_df["activity_id"])

        _set_step(1)
        # Calibrate the effort curve on only the 3 non-vertical types - including
        # technical_climb/technical_descent here would let their distance-irrelevant
        # dynamics skew the curve shape for the types that are genuinely
        # distance-driven (see locomotion_model.py's EFFORT_SEGMENT_TYPES docstring).
        effort_calibration_df = loco_df[loco_df["segment_type_5"].isin(EFFORT_SEGMENT_TYPES)]
        effort_params = calibrate_effort_curve(effort_calibration_df)
        loco_df = loco_df.copy()
        loco_df["effort"] = compute_effort(
            loco_df["distance_mi"], loco_df["elevation_gain_ft"],
            effort_params["p_distance"], effort_params["p_elevation"],
        )
        loco_df["log_effort"] = np.log(loco_df["effort"] + 1e-6)

        _set_step(2)
        loco_fit = build_and_fit_pooled_model(loco_df)
        diagnostics = pooled_diagnostics(loco_fit)

        _set_step(3)
        rest_fit = build_and_fit_rest_model(rest_df)

        _set_step(4)
        diagnostics.update(rest_diagnostics(rest_fit))

        _set_step(5)
        run_dir = _run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)
        az.to_netcdf(loco_fit["idata"], str(run_dir / "locomotion_trace.nc"))
        az.to_netcdf(rest_fit["idata"], str(run_dir / "rest_trace.nc"))
        (run_dir / "diagnostics.json").write_text(json.dumps(diagnostics))

        # Standardization stats + covariate bookkeeping needed to score NEW (unseen)
        # data later - these only exist in-memory during a fit otherwise, and
        # predicting against a historical run requires them in a later session.
        metadata = {
            "locomotion": {
                "segment_types": SEGMENT_TYPES,
                "effort_segment_types": EFFORT_SEGMENT_TYPES,
                "used_covariates": loco_fit["used_covariates"],
                "log_effort_stats": vars(loco_fit["log_effort_stats"]),
                "covariate_stats": {cov: vars(stats) for cov, stats in loco_fit["covariate_stats"].items()},
                "effort_params": effort_params,
            },
            "rest": {
                "used_covariates": rest_fit["used_covariates"],
                "distance_stats": vars(rest_fit["distance_stats"]),
                "elevation_stats": vars(rest_fit["elevation_stats"]),
                "covariate_stats": {cov: vars(stats) for cov, stats in rest_fit["covariate_stats"].items()},
            },
        }
        (run_dir / "metadata.json").write_text(json.dumps(metadata))

        rmse_pct = {
            group: diagnostics[group]["rmse_pct_of_mean"]
            for group in MODEL_GROUPS
            if group in diagnostics
        }
        _append_run_index_entry({
            "run_id": run_id,
            "created_at": datetime.utcnow().isoformat(),
            "n_activities_total": len(activity_ids),
            "n_recent_activities_filter": n_recent_activities,
            "rmse_pct": rmse_pct,
        })

        _set_status(state="done", step_index=len(FIT_STEPS), step_label="Done")
    except Exception as exc:  # noqa: BLE001 - surface any fitting error to the UI
        _set_status(state="error", error=str(exc))
    finally:
        db.close()
