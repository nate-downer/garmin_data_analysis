"""Scores NEW, unseen segments against an already-fitted historical run's posterior.

This is pure prediction (no new MCMC sampling) - it loads a run's persisted trace +
metadata and, for each posterior draw, computes a closed-form conditional for the
latent effort factor (since the new segment's distance/elevation are known but its
duration isn't) plus a fresh activity-level offset (the new route isn't one of the
training activities, so no learned offset exists for it - draw one from the
hierarchy's own hyperprior instead).
"""
from typing import Optional

import numpy as np
import pandas as pd
import arviz as az

from .data import extract_all_segments
from .fit_runner import load_run_metadata, run_dir as _fit_run_dir

REQUIRED_RAW_FIELDS = [
    "distance_mi", "elevation_gain_ft", "load_ratio", "terrain_factor",
    "party_size", "is_hiking", "is_running",
]


def _standardize_value(value: float, stats: dict) -> float:
    std = stats["std"] if stats["std"] > 1e-9 else 1.0
    return (value - stats["mean"]) / std


def _flat_posterior(idata, name: str, idx: np.ndarray) -> np.ndarray:
    arr = idata.posterior[name].stack(sample=("chain", "draw")).transpose("sample", ...).values
    return arr[idx]


def _sample_indices(idata, n_draws: int, rng: np.random.Generator) -> np.ndarray:
    sizes = idata.posterior.sizes
    n_total = sizes["chain"] * sizes["draw"]
    return rng.integers(0, n_total, size=n_draws)


def predict_segment_duration_draws(
    idata, meta: dict, raw_covariates: dict, n_draws: int = 2000, rng: Optional[np.random.Generator] = None
) -> np.ndarray:
    """Posterior-predictive duration draws (seconds) for one new locomotion segment."""
    rng = rng or np.random.default_rng()
    idx = _sample_indices(idata, n_draws, rng)

    def flat(name):
        return _flat_posterior(idata, name, idx)

    alpha = flat("alpha")
    beta = flat("beta")
    loading_distance = flat("loading_distance")
    intercept_distance = flat("intercept_distance")
    intercept_elevation = flat("intercept_elevation")
    sigma_distance = flat("sigma_distance")
    sigma_elevation = flat("sigma_elevation")
    sigma_duration = flat("sigma_duration")

    distance_std = _standardize_value(raw_covariates["distance_mi"], meta["distance_stats"])
    elevation_std = _standardize_value(raw_covariates["elevation_gain_ft"], meta["elevation_stats"])

    # Closed-form conditional posterior for the new segment's latent effort factor,
    # given its own (known) distance + elevation and this draw's measurement-model
    # parameters. Standard Bayesian linear regression with a unit-normal prior on eta
    # and two independent Gaussian "observations" (the distance/elevation equations).
    d1 = distance_std - intercept_distance
    d2 = elevation_std - intercept_elevation
    precision = 1.0 + (loading_distance ** 2) / (sigma_distance ** 2) + 1.0 / (sigma_elevation ** 2)
    mu_eta = (loading_distance / (sigma_distance ** 2) * d1 + (1.0 / (sigma_elevation ** 2)) * d2) / precision
    eta_new = rng.normal(mu_eta, np.sqrt(1.0 / precision))

    covariate_term = np.zeros(n_draws)
    if meta["used_covariates"]:
        gamma = flat("gamma")
        for j, cov in enumerate(meta["used_covariates"]):
            cov_std = _standardize_value(raw_covariates[cov], meta["covariate_stats"][cov])
            covariate_term += gamma[:, j] * cov_std

    # New route is not one of the training activities, so there's no learned offset
    # for it. Rather than drawing a fresh one from the hierarchy's spread each time
    # (which stacks an extra independent noise source onto every draw and produces
    # implausibly wide/heavy-tailed predictions once exponentiated), use its prior
    # mean of 0 - "no particular reason to expect this route to be unusual."
    activity_term = 0.0

    mu = alpha + beta * eta_new + covariate_term + activity_term
    log_duration = rng.normal(mu, sigma_duration)
    return np.exp(log_duration)


def predict_rest_duration_draws(
    idata, meta: dict, total_distance_mi: float, total_elevation_gain_ft: float,
    raw_covariates: dict, n_draws: int = 2000, rng: Optional[np.random.Generator] = None,
) -> np.ndarray:
    """Posterior-predictive total-rest-time draws (minutes) for the whole route."""
    rng = rng or np.random.default_rng()
    idx = _sample_indices(idata, n_draws, rng)

    def flat(name):
        return _flat_posterior(idata, name, idx)

    alpha = flat("alpha")
    beta_distance = flat("beta_distance")
    beta_elevation = flat("beta_elevation")
    sigma = flat("sigma")

    distance_std = _standardize_value(total_distance_mi, meta["distance_stats"])
    elevation_std = _standardize_value(total_elevation_gain_ft, meta["elevation_stats"])

    mu = alpha + beta_distance * distance_std + beta_elevation * elevation_std

    if meta["used_covariates"]:
        gamma = flat("gamma")
        for j, cov in enumerate(meta["used_covariates"]):
            cov_std = _standardize_value(raw_covariates[cov], meta["covariate_stats"][cov])
            mu = mu + gamma[:, j] * cov_std

    return rng.normal(mu, sigma)


def _load_trace(run_id: str, filename: str):
    return az.from_netcdf(str(_fit_run_dir(run_id) / filename))


def predict_route(db, activity_id: str, run_id: str, start_time: pd.Timestamp, n_draws: int = 2000) -> dict:
    """
    Predict per-segment and total trip time for a planned route's segments.

    `start_time` is a hypothetical, request-scoped start time - it is NOT written
    back to the database. hour_of_day for each segment is derived from the route's
    own relative segment ordering plus the running sum of *predicted* durations so
    far, not from whatever absolute timestamp happens to be stored.
    """
    metadata = load_run_metadata(run_id)
    if metadata is None:
        raise ValueError(f"Run {run_id} has no persisted metadata - re-fit before predicting with it.")

    df = extract_all_segments(db)
    route_df = df[df["activity_id"] == activity_id].sort_values("start_time").reset_index(drop=True)
    loco_df = route_df[route_df["segment_type"].isin(("climb", "descent", "flat"))].reset_index(drop=True)

    if loco_df.empty:
        raise ValueError("No locomotion segments found for this activity - generate segments first.")

    missing = loco_df[REQUIRED_RAW_FIELDS].isna().any()
    if missing.any():
        raise ValueError(
            "Activity is missing required metadata for prediction: "
            f"{', '.join(missing[missing].index)}. Fill in Activity Details first."
        )

    rng = np.random.default_rng()

    total_distance_mi = float(loco_df["distance_mi"].sum())
    total_elevation_gain_ft = float(loco_df["elevation_gain_ft"].sum())

    rest_meta = metadata.get("rest")
    if rest_meta is None:
        raise ValueError(f"Run {run_id} has no fitted rest model.")
    rest_trace = _load_trace(run_id, "rest_trace.nc")
    rest_raw_covariates = {
        "party_size": float(loco_df["party_size"].iloc[0]),
        "is_hiking": float(loco_df["is_hiking"].iloc[0]),
        "is_running": float(loco_df["is_running"].iloc[0]),
    }
    rest_draws_min = predict_rest_duration_draws(
        rest_trace, rest_meta, total_distance_mi, total_elevation_gain_ft, rest_raw_covariates,
        n_draws=n_draws, rng=rng,
    )
    total_rest_mean_min = float(rest_draws_min.mean())

    n_segments = len(loco_df)
    rest_gap_mean_min = total_rest_mean_min / (n_segments - 1) if n_segments > 1 else 0.0

    trace_cache = {}
    cum_distance_mean = 0.0
    cum_elevation_mean = 0.0
    predicted_elapsed = pd.Timedelta(0)

    segments_result = []
    cumulative_points = [
        {"cumulative_distance_mi": 0.0, "cumulative_time_min": 0.0, "kind": "start", "label": "Start"}
    ]
    cum_distance_plot = 0.0
    cum_time_plot = 0.0

    for i in range(n_segments):
        row = loco_df.iloc[i]
        type_name = row["segment_type_5"]

        if type_name not in trace_cache:
            trace_cache[type_name] = _load_trace(run_id, f"locomotion_trace_{type_name}.nc")
        type_meta = metadata.get(type_name)
        if type_meta is None:
            raise ValueError(f"Run {run_id} has no fitted model for segment type '{type_name}'.")

        hypothetical_time = start_time + predicted_elapsed
        raw_covariates = {
            "distance_mi": float(row["distance_mi"]),
            "elevation_gain_ft": float(row["elevation_gain_ft"]),
            "load_ratio": float(row["load_ratio"]),
            "terrain_factor": float(row["terrain_factor"]),
            "cum_distance_prior_mi": cum_distance_mean,
            "cum_elevation_prior_ft": cum_elevation_mean,
            "hour_of_day": hypothetical_time.hour + hypothetical_time.minute / 60.0,
            "party_size": float(row["party_size"]),
            "is_hiking": float(row["is_hiking"]),
            "is_running": float(row["is_running"]),
        }

        draws_sec = predict_segment_duration_draws(trace_cache[type_name], type_meta, raw_covariates, n_draws=n_draws, rng=rng)
        draws_min = draws_sec / 60.0
        mean_min = float(draws_min.mean())

        segments_result.append({
            "segment_id": int(row["segment_id"]),
            "segment_type_5": type_name,
            "distance_mi": float(row["distance_mi"]),
            "elevation_gain_ft": float(row["elevation_gain_ft"]),
            "mean_predicted_min": mean_min,
            "draws_min": draws_min,
        })

        cum_distance_plot += float(row["distance_mi"])
        cum_time_plot += mean_min
        cumulative_points.append({
            "cumulative_distance_mi": cum_distance_plot,
            "cumulative_time_min": cum_time_plot,
            "kind": "segment",
            "label": type_name,
        })

        cum_distance_mean += float(row["distance_mi"])
        cum_elevation_mean += float(row["elevation_gain_ft"])
        predicted_elapsed += pd.Timedelta(minutes=mean_min)

        if i < n_segments - 1:
            predicted_elapsed += pd.Timedelta(minutes=rest_gap_mean_min)
            cum_time_plot += rest_gap_mean_min
            cumulative_points.append({
                "cumulative_distance_mi": cum_distance_plot,
                "cumulative_time_min": cum_time_plot,
                "kind": "rest",
                "label": "Rest",
            })

    segment_draws_matrix = np.array([s["draws_min"] for s in segments_result])
    total_distribution_min = segment_draws_matrix.sum(axis=0) + rest_draws_min

    for s in segments_result:
        s["draws_min"] = s["draws_min"].tolist()

    return {
        "segments": segments_result,
        "total_mean_min": float(sum(s["mean_predicted_min"] for s in segments_result) + total_rest_mean_min),
        "total_distribution_min": total_distribution_min.tolist(),
        "cumulative_points": cumulative_points,
    }
