"""Posterior diagnostics: variance-explained-per-variable and predicted-vs-actual.

"Variance explained" is approximated from the posterior rather than via classical R²:
for each posterior draw, each term's contribution to the linear predictor is computed
across the segments in a group, its variance taken, and normalized against the sum of
all terms' variances for that draw. The point estimate + credible interval reported per
variable is the median / 5th-95th percentile of that share across draws.
"""
import numpy as np
import xarray as xr

VARIABLE_LABELS = {
    "effort_factor": "Effort factor (distance + elevation)",
    "load_ratio": "Load ratio (pack/body weight)",
    "terrain_factor": "Terrain factor",
    "cum_distance_prior_mi": "Cumulative distance so far",
    "cum_elevation_prior_ft": "Cumulative elevation so far",
    "hour_of_day": "Time of day",
    "activity_offset": "Activity-level variation",
    "total_distance_mi": "Total distance",
    "total_elevation_gain_ft": "Total elevation gain",
    "party_size": "Party size",
    "is_hiking": "Activity type: hiking",
    "is_running": "Activity type: running",
}

TYPE_LABELS = {
    "technical_climb": "Technical Climb",
    "nontechnical_climb": "Non-Technical Climb",
    "flat": "Flat",
    "nontechnical_descent": "Non-Technical Descent",
    "technical_descent": "Technical Descent",
    "rest": "Rest Time",
}


def _flatten(posterior_var: xr.DataArray) -> np.ndarray:
    """Flatten (chain, draw, ...) -> (sample, ...)."""
    return posterior_var.stack(sample=("chain", "draw")).transpose("sample", ...).values


def _fit_summary_stats(predicted_vs_actual: list) -> dict:
    """R², RMSE, and RMSE as a % of the average actual value, in minutes."""
    actual = np.array([p["actual_min"] for p in predicted_vs_actual])
    predicted = np.array([p["predicted_min"] for p in predicted_vs_actual])

    residuals = actual - predicted
    ss_res = float(np.sum(residuals ** 2))
    ss_tot = float(np.sum((actual - actual.mean()) ** 2))
    r_squared = 1 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0

    rmse_min = float(np.sqrt(np.mean(residuals ** 2)))
    mean_actual_min = float(actual.mean())
    rmse_pct_of_mean = (rmse_min / mean_actual_min * 100) if mean_actual_min > 1e-12 else 0.0

    return {
        "r_squared": r_squared,
        "rmse_min": rmse_min,
        "rmse_pct_of_mean": rmse_pct_of_mean,
    }


def _variance_explained(term_vars: dict) -> list:
    total_var = sum(term_vars.values())
    total_var = np.where(total_var < 1e-12, 1e-12, total_var)

    rows = []
    for name, v in term_vars.items():
        share = v / total_var
        rows.append({
            "variable": name,
            "label": VARIABLE_LABELS.get(name, name),
            "median_pct": float(np.median(share) * 100),
            "low_pct": float(np.percentile(share, 5) * 100),
            "high_pct": float(np.percentile(share, 95) * 100),
        })
    return rows


def single_type_diagnostics(fit_result: dict, type_name: str) -> dict:
    """Diagnostics for one independently-fit segment-type model (no type dimension to slice)."""
    idata = fit_result["idata"]
    df = fit_result["df"]
    covariate_matrix = fit_result["covariate_matrix"]
    activity_idx = fit_result["activity_idx"]

    used_covariates = fit_result["used_covariates"]

    posterior = idata.posterior
    alpha = _flatten(posterior["alpha"])  # (S,)
    beta = _flatten(posterior["beta"])  # (S,)
    gamma = _flatten(posterior["gamma"])  # (S, n_cov)
    eta = _flatten(posterior["eta"])  # (S, n)

    n_cov = len(used_covariates)
    segment_ids = df["segment_id"].to_numpy()
    activity_names = df["activity_name"].to_numpy()
    duration_sec = df["duration_sec"].to_numpy()

    eta_term = beta[:, None] * eta  # (S, n)

    gamma_expanded = gamma[:, None, :]  # (S, 1, n_cov)
    cov_terms = gamma_expanded * covariate_matrix[None, :, :]  # (S, n, n_cov)

    term_vars = {"effort_factor": eta_term.var(axis=1)}
    for j in range(n_cov):
        term_vars[used_covariates[j]] = cov_terms[:, :, j].var(axis=1)

    mu = alpha[:, None] + eta_term + cov_terms.sum(axis=2)

    if fit_result.get("include_activity_offset", True):
        activity_offset = _flatten(posterior["activity_offset"])  # (S, n_activities)
        activity_term = activity_offset[:, activity_idx]  # (S, n)
        term_vars["activity_offset"] = activity_term.var(axis=1)
        mu = mu + activity_term
    predicted_min = np.exp(np.median(mu, axis=0)) / 60.0
    actual_min = duration_sec / 60.0

    predicted_vs_actual = [
        {
            "label": f"segment_{segment_ids[k]}",
            "activity_name": str(activity_names[k]),
            "predicted_min": float(predicted_min[k]),
            "actual_min": float(actual_min[k]),
        }
        for k in range(len(df))
    ]

    return {
        "label": TYPE_LABELS[type_name],
        "n_segments": int(len(df)),
        "variance_explained": _variance_explained(term_vars),
        "predicted_vs_actual": predicted_vs_actual,
        **_fit_summary_stats(predicted_vs_actual),
    }


def rest_diagnostics(fit_result: dict) -> dict:
    idata = fit_result["idata"]
    df = fit_result["df"]
    covariate_matrix = fit_result["covariate_matrix"]
    used_covariates = fit_result["used_covariates"]

    posterior = idata.posterior
    alpha = _flatten(posterior["alpha"])
    beta_distance = _flatten(posterior["beta_distance"])
    beta_elevation = _flatten(posterior["beta_elevation"])

    distance_std = fit_result["distance_stats"].transform(df["total_distance_mi"].to_numpy())
    elevation_std = fit_result["elevation_stats"].transform(df["total_elevation_gain_ft"].to_numpy())

    distance_term = beta_distance[:, None] * distance_std[None, :]
    elevation_term = beta_elevation[:, None] * elevation_std[None, :]

    term_vars = {
        "total_distance_mi": distance_term.var(axis=1),
        "total_elevation_gain_ft": elevation_term.var(axis=1),
    }

    mu = alpha[:, None] + distance_term + elevation_term

    if used_covariates:
        gamma = _flatten(posterior["gamma"])  # (S, n_cov)
        cov_terms = gamma[:, None, :] * covariate_matrix[None, :, :]  # (S, n, n_cov)
        for j, cov in enumerate(used_covariates):
            term_vars[cov] = cov_terms[:, :, j].var(axis=1)
        mu = mu + cov_terms.sum(axis=2)
    predicted_min = np.median(mu, axis=0)
    actual_min = df["total_rest_min"].to_numpy()
    activity_ids = df["activity_id"].to_numpy()
    activity_names = df["activity_name"].to_numpy()

    predicted_vs_actual = [
        {
            "label": f"activity_{activity_ids[k]}",
            "activity_name": str(activity_names[k]),
            "predicted_min": float(predicted_min[k]),
            "actual_min": float(actual_min[k]),
        }
        for k in range(len(df))
    ]

    return {
        "rest": {
            "label": TYPE_LABELS["rest"],
            "n_segments": int(len(df)),
            "variance_explained": _variance_explained(term_vars),
            "predicted_vs_actual": predicted_vs_actual,
            **_fit_summary_stats(predicted_vs_actual),
        }
    }
