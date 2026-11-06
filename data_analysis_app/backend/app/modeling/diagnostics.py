"""Posterior diagnostics: variance-explained-per-variable and predicted-vs-actual.

"Variance explained" is approximated from the posterior rather than via classical R²:
for each posterior draw, each term's contribution to the linear predictor is computed
across the segments in a group, its variance taken, and normalized against the sum of
all terms' variances for that draw. The point estimate + credible interval reported per
variable is the median / 5th-95th percentile of that share across draws.
"""
import numpy as np
import xarray as xr

from .locomotion_model import SEGMENT_TYPES, EFFORT_SEGMENT_TYPES, _tod_harmonics

VARIABLE_LABELS = {
    "effort_factor": "Effort factor (distance + elevation)",
    "load_ratio": "Load ratio (pack/body weight)",
    "terrain_factor_nontechnical": "Terrain factor",
    "cum_distance_prior_mi": "Cumulative distance so far",
    "cum_elevation_prior_ft": "Cumulative elevation so far",
    "tod_modifier": "Time of day",
    "activity_offset": "Activity-level variation",
    "total_distance_mi": "Total distance",
    "total_elevation_gain_ft": "Total elevation gain",
    "party_size": "Party size",
    "is_hiking": "Activity type: hiking",
    "is_running": "Activity type: running",
    "pct_technical_elevation_gain": "% elevation gain from technical climbing",
    "exp_new_route_new_skills": "Experience: New Route + New Skills",
    "exp_somewhat_familiar_route": "Experience: Somewhat Familiar Route",
    "exp_familiar_route": "Experience: Familiar Route",
    "diff_4th_class": "Difficulty: 4th Class",
    "diff_5th_easy": "Difficulty: 5th Easy",
    "diff_5th_moderate": "Difficulty: 5th Moderate",
    "diff_5th_hard": "Difficulty: 5th Hard",
    "elevation_change_tech_climb": "Elevation gain (technical climb)",
    "elevation_change_tech_descent": "Elevation loss (technical descent)",
    "pitch_count_tech_climb": "Number of pitches",
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


def _variance_explained(term_vars: dict, term_coefs: dict) -> list:
    """
    `term_coefs` holds each term's own posterior samples (its regression
    coefficient for plain covariates; a representative effect-size proxy for
    composite terms like tod_modifier/activity_offset/effort_factor) - reported
    alongside variance-explained so the two can be plotted side by side on a
    shared category axis.
    """
    total_var = sum(term_vars.values())
    total_var = np.where(total_var < 1e-12, 1e-12, total_var)

    rows = []
    for name, v in term_vars.items():
        share = v / total_var
        coef = term_coefs[name]
        rows.append({
            "variable": name,
            "label": VARIABLE_LABELS.get(name, name),
            "median_pct": float(np.median(share) * 100),
            "low_pct": float(np.percentile(share, 5) * 100),
            "high_pct": float(np.percentile(share, 95) * 100),
            "coefficient_median": float(np.median(coef)),
            "coefficient_low": float(np.percentile(coef, 5)),
            "coefficient_high": float(np.percentile(coef, 95)),
        })
    return rows


def pooled_diagnostics(fit_result: dict) -> dict:
    """
    Diagnostics for the pooled locomotion model, keyed by segment_type_5 - same output
    shape per type as the old single_type_diagnostics, just sliced from one shared fit
    instead of coming from 5 separate fits.
    """
    idata = fit_result["idata"]
    df = fit_result["df"]
    covariate_matrix = fit_result["covariate_matrix"]
    activity_idx = fit_result["activity_idx"]
    type_idx = fit_result["type_idx"]
    used_covariates = fit_result["used_covariates"]
    n_cov = len(used_covariates)

    posterior = idata.posterior
    alpha_type_all = _flatten(posterior["alpha_type"])  # (S, n_types)
    beta_type_all = _flatten(posterior["beta_type"])  # (S, n_types)
    gamma = _flatten(posterior["gamma"])  # (S, n_cov)
    tod_a1 = _flatten(posterior["tod_a1"])  # (S,)
    tod_b1 = _flatten(posterior["tod_b1"])
    tod_a2 = _flatten(posterior["tod_a2"])
    tod_b2 = _flatten(posterior["tod_b2"])
    activity_offset = _flatten(posterior["activity_offset"])  # (S, n_activities)
    sigma_activity = _flatten(posterior["sigma_activity"])  # (S,)
    # Non-negative amplitude of the 2-harmonic wave - there's no single signed
    # slope for a composite sinusoid, so this stands in as its "coefficient".
    tod_amplitude = np.sqrt(tod_a1 ** 2 + tod_b1 ** 2 + tod_a2 ** 2 + tod_b2 ** 2)  # (S,)

    log_effort_std = fit_result["log_effort_stats"].transform(df["log_effort"].to_numpy())
    sin1, cos1, sin2, cos2 = _tod_harmonics(df["hour_of_day"].to_numpy())

    segment_ids = df["segment_id"].to_numpy()
    activity_names = df["activity_name"].to_numpy()
    duration_sec = df["duration_sec"].to_numpy()

    out = {}
    for t_pos, type_name in enumerate(SEGMENT_TYPES):
        mask = type_idx == t_pos
        if not mask.any():
            continue

        alpha_t = alpha_type_all[:, t_pos]  # (S,)

        gamma_expanded = gamma[:, None, :]  # (S, 1, n_cov)
        cov_terms = gamma_expanded * covariate_matrix[None, mask, :]  # (S, n_t, n_cov)

        tod_term = (
            tod_a1[:, None] * sin1[None, mask] + tod_b1[:, None] * cos1[None, mask]
            + tod_a2[:, None] * sin2[None, mask] + tod_b2[:, None] * cos2[None, mask]
        )  # (S, n_t)

        activity_term = activity_offset[:, activity_idx[mask]]  # (S, n_t)

        term_vars = {
            "tod_modifier": tod_term.var(axis=1),
            "activity_offset": activity_term.var(axis=1),
        }
        term_coefs = {
            "tod_modifier": tod_amplitude,
            "activity_offset": sigma_activity,
        }

        # technical_climb/technical_descent have no effort term at all - their
        # duration comes entirely from the elevation_change_tech_*/
        # pitch_count_tech_climb covariates in the generic loop below.
        if type_name in EFFORT_SEGMENT_TYPES:
            beta_t = beta_type_all[:, EFFORT_SEGMENT_TYPES.index(type_name)]  # (S,)
            effort_term = beta_t[:, None] * log_effort_std[None, mask]  # (S, n_t)
            term_vars["effort_factor"] = effort_term.var(axis=1)
            term_coefs["effort_factor"] = beta_t
        else:
            effort_term = 0.0

        for j in range(n_cov):
            # Covariate is a global, shared column, but many entries (climb
            # difficulty, elevation_change_tech_*, pitch_count_tech_climb,
            # terrain_factor_nontechnical) are zero-gated to only one or a few
            # segment types. Skip it entirely for types where it never varies -
            # it contributes nothing to explaining variance there, and showing
            # it anyway just clutters every type's panel with irrelevant rows.
            if covariate_matrix[mask, j].std() < 1e-9:
                continue
            term_vars[used_covariates[j]] = cov_terms[:, :, j].var(axis=1)
            term_coefs[used_covariates[j]] = gamma[:, j]

        mu = alpha_t[:, None] + effort_term + cov_terms.sum(axis=2) + tod_term + activity_term
        predicted_min = np.exp(np.median(mu, axis=0)) / 60.0
        actual_min = duration_sec[mask] / 60.0

        predicted_vs_actual = [
            {
                "label": f"segment_{sid}",
                "activity_name": str(aname),
                "predicted_min": float(pmin),
                "actual_min": float(amin),
            }
            for sid, aname, pmin, amin in zip(
                segment_ids[mask], activity_names[mask], predicted_min, actual_min
            )
        ]

        out[type_name] = {
            "label": TYPE_LABELS[type_name],
            "n_segments": int(mask.sum()),
            "variance_explained": _variance_explained(term_vars, term_coefs),
            "predicted_vs_actual": predicted_vs_actual,
            **_fit_summary_stats(predicted_vs_actual),
        }

    return out


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
    term_coefs = {
        "total_distance_mi": beta_distance,
        "total_elevation_gain_ft": beta_elevation,
    }

    mu = alpha[:, None] + distance_term + elevation_term

    if used_covariates:
        gamma = _flatten(posterior["gamma"])  # (S, n_cov)
        cov_terms = gamma[:, None, :] * covariate_matrix[None, :, :]  # (S, n, n_cov)
        for j, cov in enumerate(used_covariates):
            term_vars[cov] = cov_terms[:, :, j].var(axis=1)
            term_coefs[cov] = gamma[:, j]
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
            "variance_explained": _variance_explained(term_vars, term_coefs),
            "predicted_vs_actual": predicted_vs_actual,
            **_fit_summary_stats(predicted_vs_actual),
        }
    }
