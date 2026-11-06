"""Scores NEW, unseen segments against an already-fitted historical run's posterior.

This is pure prediction (no new MCMC sampling) - it loads a run's persisted trace +
metadata and, for each posterior draw, plugs in the new segment's deterministic
"effort" value (see effort.py - known from its own distance/elevation, same as at fit
time) plus a fresh activity-level offset (the new route isn't one of the training
activities, so no learned offset exists for it - use the hierarchy's prior mean of 0
instead).
"""
import bisect
from typing import Optional

import numpy as np
import pandas as pd
import arviz as az
import pytz
from astral import LocationInfo
from astral.sun import sun

from .. import models
from ..services.timezone import convert_to_local_time
from .data import extract_all_segments
from .effort import compute_effort
from .locomotion_model import _tod_harmonics
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

    segment_type_5 = raw_covariates["segment_type_5"]
    type_pos = meta["segment_types"].index(segment_type_5)
    alpha_type = flat("alpha_type")[:, type_pos]
    sigma_duration = flat("sigma_duration")

    # technical_climb/technical_descent have no effort term at all - their duration
    # comes entirely from the elevation_change_tech_*/pitch_count_tech_climb
    # covariates in the generic covariate loop below. Effort is deterministic/known
    # (same formula + calibrated exponents as fit time) for the 3 types that do use
    # it, not a latent variable - no closed-form conditional needed here anymore.
    if segment_type_5 in meta["effort_segment_types"]:
        effort_type_pos = meta["effort_segment_types"].index(segment_type_5)
        beta_type = flat("beta_type")[:, effort_type_pos]
        effort = compute_effort(
            raw_covariates["distance_mi"], raw_covariates["elevation_gain_ft"],
            meta["effort_params"]["p_distance"], meta["effort_params"]["p_elevation"],
        )
        log_effort_std = _standardize_value(float(np.log(effort + 1e-6)), meta["log_effort_stats"])
        effort_term = beta_type * log_effort_std
    else:
        effort_term = 0.0

    covariate_term = np.zeros(n_draws)
    if meta["used_covariates"]:
        gamma = flat("gamma")
        for j, cov in enumerate(meta["used_covariates"]):
            cov_std = _standardize_value(raw_covariates[cov], meta["covariate_stats"][cov])
            covariate_term += gamma[:, j] * cov_std

    sin1, cos1, sin2, cos2 = _tod_harmonics(np.array([raw_covariates["hour_of_day"]]))
    tod_term = (
        flat("tod_a1") * sin1[0] + flat("tod_b1") * cos1[0]
        + flat("tod_a2") * sin2[0] + flat("tod_b2") * cos2[0]
    )

    # New route is not one of the training activities, so there's no learned offset
    # for it. Rather than drawing a fresh one from the hierarchy's spread each time
    # (which stacks an extra independent noise source onto every draw and produces
    # implausibly wide/heavy-tailed predictions once exponentiated), use its prior
    # mean of 0 - "no particular reason to expect this route to be unusual."
    activity_term = 0.0

    mu = alpha_type + effort_term + covariate_term + tod_term + activity_term
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


def _elevation_at_or_before(point_times: list, point_elevations: list, t: pd.Timestamp) -> Optional[float]:
    """Elevation (ft) of the last recorded point at or before time `t`."""
    if not point_times:
        return None
    idx = bisect.bisect_right(point_times, t) - 1
    if idx < 0:
        idx = 0
    return point_elevations[idx]


def _time_of_day_minutes(start_time: pd.Timestamp, elapsed_min: np.ndarray) -> np.ndarray:
    """
    Convert elapsed-minutes-from-start values into minutes-since-midnight clock time.

    Linear, not circular: a route whose draws span midnight will wrap (23:50 and 00:10
    land far apart, not adjacent) - an accepted limitation for this app's typical
    single-day trips.
    """
    timestamps = start_time + pd.to_timedelta(elapsed_min, unit="m")
    return (timestamps.hour * 60 + timestamps.minute + timestamps.second / 60.0).to_numpy()


def _local_time_of_day_minutes(utc_time, timezone_str: Optional[str]) -> float:
    """Minutes-since-local-midnight for a single real (recorded) UTC timestamp."""
    local_time = convert_to_local_time(utc_time, timezone_str)
    return local_time.hour * 60 + local_time.minute + local_time.second / 60.0


def _sun_times_minutes_since_midnight(
    lat: float, lon: float, date, timezone_str: Optional[str]
) -> Optional[tuple]:
    """(sunrise, sunset) minutes since local midnight for this lat/lon and date."""
    try:
        tz = pytz.timezone(timezone_str) if timezone_str else pytz.utc
        location = LocationInfo(timezone=str(tz), latitude=lat, longitude=lon)
        sun_times = sun(location.observer, date=date, tzinfo=tz)
        sunrise, sunset = sun_times["sunrise"], sun_times["sunset"]
        return (
            sunrise.hour * 60 + sunrise.minute + sunrise.second / 60.0,
            sunset.hour * 60 + sunset.minute + sunset.second / 60.0,
        )
    except Exception:
        # Polar day/night or any other edge case - just skip daylight-based coloring.
        return None


def predict_route(
    db, activity_id: str, run_id: str, start_time: pd.Timestamp,
    body_weight_lbs: float, pack_weight_lbs: float, party_size: float,
    experience_level: str,
    n_draws: int = 2000,
) -> dict:
    """
    Predict per-segment and total trip time for a planned route's segments.

    `start_time` is a hypothetical, request-scoped start time - it is NOT written
    back to the database. hour_of_day for each segment is derived from the route's
    own relative segment ordering plus the running sum of *predicted* durations so
    far, not from whatever absolute timestamp happens to be stored.

    `body_weight_lbs`/`pack_weight_lbs`/`party_size`/`experience_level` are likewise
    request-scoped overrides (not read from the activity's own stored metadata) so
    the user can try different combinations without round-tripping through Activity
    Details.
    """
    if body_weight_lbs <= 0:
        raise ValueError("Body weight must be greater than 0.")

    metadata = load_run_metadata(run_id)
    if metadata is None:
        raise ValueError(f"Run {run_id} has no persisted metadata - re-fit before predicting with it.")

    df = extract_all_segments(db)
    route_df = df[df["activity_id"] == activity_id].sort_values("start_time").reset_index(drop=True)
    loco_df = route_df[route_df["segment_type"].isin(("climb", "descent", "flat"))].reset_index(drop=True)

    if loco_df.empty:
        raise ValueError("No locomotion segments found for this activity - generate segments first.")

    # Real recorded elevation profile for this route, used to find "the summit"
    # (highest point reached) - the prediction model itself only knows per-segment
    # relative gain, not absolute elevation, so this is read straight from the GPS points.
    points = (
        db.query(models.Point)
        .filter(models.Point.activity_id == activity_id, models.Point.is_removed == False)
        .order_by(models.Point.time)
        .all()
    )
    point_times = [p.time for p in points]
    point_elevations = [p.elevation_ft for p in points]

    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    timezone_str = activity.timezone if activity else None

    loco_df["load_ratio"] = pack_weight_lbs / body_weight_lbs
    loco_df["party_size"] = party_size
    # Request-scoped experience_level override, same convention as load_ratio/
    # party_size above - recompute the dummy columns from the override instead of
    # the activity's own stored value (same encoding as extract_all_segments).
    loco_df["exp_new_route_new_skills"] = 1.0 if experience_level == "New Route + New Skills" else 0.0
    loco_df["exp_somewhat_familiar_route"] = 1.0 if experience_level == "Somewhat Familiar Route" else 0.0
    loco_df["exp_familiar_route"] = 1.0 if experience_level == "Familiar Route" else 0.0

    missing = loco_df[REQUIRED_RAW_FIELDS].isna().any()
    if missing.any():
        raise ValueError(
            "Activity is missing required metadata for prediction: "
            f"{', '.join(missing[missing].index)}. Fill in Activity Details first."
        )

    rng = np.random.default_rng()

    total_distance_mi = float(loco_df["distance_mi"].sum())
    total_elevation_gain_ft = float(loco_df["elevation_gain_ft"].sum())

    technical_elevation_gain_ft = float(
        loco_df.loc[loco_df["segment_type_5"] == "technical_climb", "elevation_gain_ft"].sum()
    )
    pct_technical_elevation_gain = (
        technical_elevation_gain_ft / total_elevation_gain_ft if total_elevation_gain_ft > 0 else 0.0
    )

    rest_meta = metadata.get("rest")
    if rest_meta is None:
        raise ValueError(f"Run {run_id} has no fitted rest model.")
    rest_trace = _load_trace(run_id, "rest_trace.nc")
    rest_raw_covariates = {
        "party_size": float(loco_df["party_size"].iloc[0]),
        "is_hiking": float(loco_df["is_hiking"].iloc[0]),
        "is_running": float(loco_df["is_running"].iloc[0]),
        "pct_technical_elevation_gain": pct_technical_elevation_gain,
    }
    rest_draws_min = predict_rest_duration_draws(
        rest_trace, rest_meta, total_distance_mi, total_elevation_gain_ft, rest_raw_covariates,
        n_draws=n_draws, rng=rng,
    )
    total_rest_mean_min = float(rest_draws_min.mean())

    n_segments = len(loco_df)
    rest_gap_mean_min = total_rest_mean_min / (n_segments - 1) if n_segments > 1 else 0.0

    loco_meta = metadata.get("locomotion")
    if loco_meta is None:
        raise ValueError(f"Run {run_id} has no fitted locomotion model.")
    loco_trace = _load_trace(run_id, "locomotion_trace.nc")

    cum_distance_mean = 0.0
    cum_elevation_mean = 0.0
    predicted_elapsed = pd.Timedelta(0)

    route_start_elevation_ft = _elevation_at_or_before(point_times, point_elevations, loco_df["start_time"].iloc[0])

    segments_result = []
    climb_candidates = []  # (end_elevation_ft, segment_index) for each "climb" segment
    cumulative_points = [
        {
            "cumulative_distance_mi": 0.0, "cumulative_time_min": 0.0, "kind": "start", "label": "Start",
            "elevation_ft": route_start_elevation_ft if route_start_elevation_ft is not None else 0.0,
        }
    ]
    cum_distance_plot = 0.0
    cum_time_plot = 0.0
    last_elevation_ft = cumulative_points[0]["elevation_ft"]

    for i in range(n_segments):
        row = loco_df.iloc[i]
        type_name = row["segment_type_5"]

        hypothetical_time = start_time + predicted_elapsed
        raw_covariates = {
            "segment_type_5": type_name,
            "distance_mi": float(row["distance_mi"]),
            "elevation_gain_ft": float(row["elevation_gain_ft"]),
            "load_ratio": float(row["load_ratio"]),
            "terrain_factor_nontechnical": float(row["terrain_factor_nontechnical"]),
            "cum_distance_prior_mi": cum_distance_mean,
            "cum_elevation_prior_ft": cum_elevation_mean,
            "hour_of_day": hypothetical_time.hour + hypothetical_time.minute / 60.0,
            "party_size": float(row["party_size"]),
            "is_hiking": float(row["is_hiking"]),
            "is_running": float(row["is_running"]),
            "exp_new_route_new_skills": float(row["exp_new_route_new_skills"]),
            "exp_somewhat_familiar_route": float(row["exp_somewhat_familiar_route"]),
            "exp_familiar_route": float(row["exp_familiar_route"]),
            "diff_4th_class": float(row["diff_4th_class"]),
            "diff_5th_easy": float(row["diff_5th_easy"]),
            "diff_5th_moderate": float(row["diff_5th_moderate"]),
            "diff_5th_hard": float(row["diff_5th_hard"]),
            "elevation_change_tech_climb": float(row["elevation_change_tech_climb"]),
            "elevation_change_tech_descent": float(row["elevation_change_tech_descent"]),
            "pitch_count_tech_climb": float(row["pitch_count_tech_climb"]),
        }

        draws_sec = predict_segment_duration_draws(loco_trace, loco_meta, raw_covariates, n_draws=n_draws, rng=rng)
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

        # Real recorded elevation at this segment's actual end - used for both the
        # elevation-vs-time plot (every segment) and the summit search (climbs only).
        segment_end_time = row["start_time"] + pd.Timedelta(seconds=float(row["duration_sec"]))
        end_elevation_ft = _elevation_at_or_before(point_times, point_elevations, segment_end_time)
        if end_elevation_ft is None:
            end_elevation_ft = last_elevation_ft
        last_elevation_ft = end_elevation_ft

        cum_distance_plot += float(row["distance_mi"])
        cum_time_plot += mean_min
        cumulative_points.append({
            "cumulative_distance_mi": cum_distance_plot,
            "cumulative_time_min": cum_time_plot,
            "kind": "segment",
            "label": type_name,
            "elevation_ft": end_elevation_ft,
        })

        cum_distance_mean += float(row["distance_mi"])
        cum_elevation_mean += float(row["elevation_gain_ft"])
        predicted_elapsed += pd.Timedelta(minutes=mean_min)

        if row["segment_type"] == "climb":
            climb_candidates.append((end_elevation_ft, i))

        if i < n_segments - 1:
            predicted_elapsed += pd.Timedelta(minutes=rest_gap_mean_min)
            cum_time_plot += rest_gap_mean_min
            cumulative_points.append({
                "cumulative_distance_mi": cum_distance_plot,
                "cumulative_time_min": cum_time_plot,
                "kind": "rest",
                "label": "Rest",
                "elevation_ft": last_elevation_ft,  # position doesn't change during rest
            })

    segment_draws_matrix = np.array([s["draws_min"] for s in segments_result])
    active_distribution_min = segment_draws_matrix.sum(axis=0)
    total_distribution_min = active_distribution_min + rest_draws_min

    active_mean_min = float(sum(s["mean_predicted_min"] for s in segments_result))
    total_mean_min = active_mean_min + total_rest_mean_min

    # The summit is the climb segment whose end lands at the highest real recorded
    # elevation (not just the one with the most gain) - fixed once by real elevation,
    # not draw-dependent. Routes with no climb segments have no summit to report.
    summit_time = None
    summit_time_of_day_min = None
    summit_mean_time_of_day_min = None
    actual_summit_time_of_day_min = None
    if climb_candidates:
        summit_idx = max(climb_candidates, key=lambda c: c[0])[1]

        summit_elapsed_mean_min = (
            sum(s["mean_predicted_min"] for s in segments_result[: summit_idx + 1])
            + summit_idx * rest_gap_mean_min
        )
        summit_time = (start_time + pd.Timedelta(minutes=summit_elapsed_mean_min)).isoformat()

        # Per-draw elapsed time to the summit: that segment's own stored draws summed
        # with every prior segment's draws, plus that many rest gaps' worth of each
        # draw's own sampled rest time (not the mean gap).
        summit_elapsed_distribution_min = segment_draws_matrix[: summit_idx + 1].sum(axis=0)
        if summit_idx > 0 and n_segments > 1:
            summit_elapsed_distribution_min = summit_elapsed_distribution_min + summit_idx * (
                rest_draws_min / (n_segments - 1)
            )
        summit_time_of_day_min = _time_of_day_minutes(start_time, summit_elapsed_distribution_min).tolist()
        summit_mean_time_of_day_min = float(np.mean(summit_time_of_day_min))

        if not (activity and activity.is_planned):
            # Real recorded end time of the summit segment itself - mirrors the
            # segment_end_time calculation already done per-segment in the main loop.
            summit_actual_end_time = (
                loco_df["start_time"].iloc[summit_idx]
                + pd.Timedelta(seconds=float(loco_df["duration_sec"].iloc[summit_idx]))
            )
            actual_summit_time_of_day_min = _local_time_of_day_minutes(summit_actual_end_time, timezone_str)

    finish_time = (start_time + pd.Timedelta(minutes=total_mean_min)).isoformat()
    finish_time_of_day_min = _time_of_day_minutes(start_time, total_distribution_min).tolist()
    finish_mean_time_of_day_min = float(_time_of_day_minutes(start_time, np.array([total_mean_min]))[0])

    actual_total_min = None
    actual_finish_time_of_day_min = None
    actual_cumulative_points = None
    if points and not (activity and activity.is_planned):
        actual_total_min = (point_times[-1] - point_times[0]).total_seconds() / 60.0
        actual_finish_time_of_day_min = _local_time_of_day_minutes(point_times[-1], timezone_str)

        # Real recorded cumulative path (every segment, including rest, in chronological
        # order) - distance is already real in the predicted path too, only the time
        # axis differs, so this traces the same distances against actual elapsed time.
        actual_cumulative_points = [
            {"cumulative_distance_mi": 0.0, "cumulative_time_min": 0.0, "kind": "start", "label": "Start"}
        ]
        cum_distance_actual = 0.0
        cum_time_actual = 0.0
        for _, row in route_df.iterrows():
            cum_time_actual += float(row["duration_sec"]) / 60.0
            if row["segment_type"] == "rest":
                actual_cumulative_points.append({
                    "cumulative_distance_mi": cum_distance_actual,
                    "cumulative_time_min": cum_time_actual,
                    "kind": "rest",
                    "label": "Rest",
                })
            else:
                cum_distance_actual += float(row["distance_mi"])
                actual_cumulative_points.append({
                    "cumulative_distance_mi": cum_distance_actual,
                    "cumulative_time_min": cum_time_actual,
                    "kind": "segment",
                    "label": row["segment_type_5"],
                })

    sunrise_time_of_day_min = None
    sunset_time_of_day_min = None
    if points:
        sun_times = _sun_times_minutes_since_midnight(
            points[0].lat, points[0].lon, start_time.date(), timezone_str
        )
        if sun_times is not None:
            sunrise_time_of_day_min, sunset_time_of_day_min = sun_times

    for s in segments_result:
        s["draws_min"] = s["draws_min"].tolist()

    return {
        "segments": segments_result,
        "total_mean_min": total_mean_min,
        "active_mean_min": active_mean_min,
        "rest_mean_min": total_rest_mean_min,
        "summit_time": summit_time,
        "finish_time": finish_time,
        "active_distribution_min": active_distribution_min.tolist(),
        "total_distribution_min": total_distribution_min.tolist(),
        "cumulative_points": cumulative_points,
        "summit_time_of_day_min": summit_time_of_day_min,
        "summit_mean_time_of_day_min": summit_mean_time_of_day_min,
        "finish_time_of_day_min": finish_time_of_day_min,
        "finish_mean_time_of_day_min": finish_mean_time_of_day_min,
        "sunrise_time_of_day_min": sunrise_time_of_day_min,
        "sunset_time_of_day_min": sunset_time_of_day_min,
        "actual_total_min": actual_total_min,
        "actual_summit_time_of_day_min": actual_summit_time_of_day_min,
        "actual_finish_time_of_day_min": actual_finish_time_of_day_min,
        "actual_cumulative_points": actual_cumulative_points,
    }
