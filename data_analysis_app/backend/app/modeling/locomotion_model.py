"""PyMC model for locomotion segment duration, fit independently per segment type.

Each segment type (technical_climb, nontechnical_climb, flat, nontechnical_descent,
technical_descent) gets its own fully self-contained model — no parameters are shared
across types. Structure within each model:
- A latent "effort" factor eta per segment (sized to just that type's segments), measured
  by two indicators (standardized distance and elevation gain). Elevation gain's loading
  is fixed at 1.0 (marker-variable identification); distance's loading is estimated.
- duration (log scale) regressed on eta, load ratio, terrain factor, cumulative
  distance/elevation prior to segment start, and time of day, plus an activity-level
  random intercept (segments nested within activities, scoped to this type's own
  activities).

Types are fit independently (rather than pooled via shared hyper-priors) because pooling
produced a hard-to-sample funnel from the beta_type*eta interaction (growing divergences
even with more tuning) — the sparse types (technical_climb n~17, technical_descent n~11)
don't have enough data to support that extra coupling.
"""
from dataclasses import dataclass

import numpy as np
import pandas as pd
import pymc as pm

SEGMENT_TYPES = [
    "technical_climb",
    "nontechnical_climb",
    "flat",
    "nontechnical_descent",
    "technical_descent",
]

COVARIATES = [
    "load_ratio",
    "terrain_factor",
    "cum_distance_prior_mi",
    "cum_elevation_prior_ft",
    "hour_of_day",
    "party_size",
    "is_hiking",
    "is_running",
]

# These types average ~1 segment per activity (a trip typically has only one technical
# section), leaving too little within-activity repetition to separate an activity effect
# from segment-level noise - the activity-level intercept is nearly unidentifiable for
# them and produces severe divergences/r-hat. Skip it for just these two.
TYPES_WITHOUT_ACTIVITY_OFFSET = {"technical_climb", "technical_descent"}


@dataclass
class StandardizationStats:
    mean: float
    std: float

    def transform(self, values: np.ndarray) -> np.ndarray:
        std = self.std if self.std > 1e-9 else 1.0
        return (np.asarray(values) - self.mean) / std


def _standardize(series: pd.Series):
    stats = StandardizationStats(mean=float(series.mean()), std=float(series.std()))
    return stats.transform(series.to_numpy()), stats


def build_and_fit_single_type_model(
    df: pd.DataFrame,
    include_activity_offset: bool = True,
    draws: int = 1000,
    tune: int = 1000,
    chains: int = 4,
    random_seed: int = 42,
) -> dict:
    """Build and sample a fully independent locomotion model for one segment type."""
    df = df.reset_index(drop=True)
    n = len(df)

    # Drop any covariate that's constant within this type's data (e.g. is_running when
    # a type never occurs on a running activity) - a zero-variance column is collinear
    # with the intercept and causes the same identifiability problems fixed elsewhere.
    used_covariates = [cov for cov in COVARIATES if df[cov].std() > 1e-9]
    n_covariates = len(used_covariates)

    activity_ids = sorted(df["activity_id"].unique())
    activity_index_map = {a: i for i, a in enumerate(activity_ids)}
    activity_idx = df["activity_id"].map(activity_index_map).to_numpy()
    n_activities = len(activity_ids)

    log_duration = np.log(df["duration_sec"].to_numpy())

    distance_std, distance_stats = _standardize(df["distance_mi"])
    elevation_std, elevation_stats = _standardize(df["elevation_gain_ft"])

    covariate_stats = {}
    covariate_cols = []
    for cov in used_covariates:
        std_vals, stats = _standardize(df[cov])
        covariate_stats[cov] = stats
        covariate_cols.append(std_vals)
    covariate_matrix = np.column_stack(covariate_cols)

    with pm.Model() as model:
        # --- Latent effort factor: distance + elevation gain as indicators ---
        eta = pm.Normal("eta", 0.0, 1.0, shape=n)

        loading_distance = pm.Normal("loading_distance", 1.0, 0.2)
        intercept_distance = pm.Normal("intercept_distance", 0.0, 1.0)
        intercept_elevation = pm.Normal("intercept_elevation", 0.0, 1.0)
        sigma_distance = pm.HalfNormal("sigma_distance", 0.5)
        sigma_elevation = pm.HalfNormal("sigma_elevation", 0.5)

        pm.Normal(
            "distance_obs",
            mu=intercept_distance + loading_distance * eta,
            sigma=sigma_distance,
            observed=distance_std,
        )
        pm.Normal(
            "elevation_obs",
            mu=intercept_elevation + 1.0 * eta,  # fixed loading = marker variable
            sigma=sigma_elevation,
            observed=elevation_std,
        )

        # --- Structural model (independent for this type - no cross-type sharing) ---
        alpha = pm.Normal("alpha", 0.0, 2.0)
        beta = pm.Normal("beta", 0.5, 0.3)
        gamma = pm.Normal("gamma", 0.0, 0.5, shape=n_covariates)

        # --- Activity-level random intercept (segments nested within activities) ---
        # Skipped for types with too little within-activity repetition to support it
        # (see TYPES_WITHOUT_ACTIVITY_OFFSET) - it's otherwise nearly unidentifiable there.
        if include_activity_offset:
            sigma_activity = pm.HalfNormal("sigma_activity", 0.5)
            activity_raw = pm.Normal("activity_raw", 0.0, 1.0, shape=n_activities)
            activity_offset = pm.Deterministic("activity_offset", sigma_activity * activity_raw)
            activity_term = activity_offset[activity_idx]
        else:
            activity_term = 0.0

        sigma_duration = pm.HalfNormal("sigma_duration", 0.5)

        covariate_term = pm.math.sum(gamma[None, :] * covariate_matrix, axis=1)

        mu = alpha + beta * eta + covariate_term + activity_term

        pm.Normal("log_duration_obs", mu=mu, sigma=sigma_duration, observed=log_duration)

        idata = pm.sample(
            draws=draws,
            tune=tune,
            chains=chains,
            random_seed=random_seed,
            target_accept=0.95,
            max_treedepth=12,
            progressbar=False,
        )

    return {
        "idata": idata,
        "df": df,
        "activity_index_map": activity_index_map,
        "distance_stats": distance_stats,
        "elevation_stats": elevation_stats,
        "covariate_stats": covariate_stats,
        "covariate_matrix": covariate_matrix,
        "activity_idx": activity_idx,
        "include_activity_offset": include_activity_offset,
        "used_covariates": used_covariates,
    }
