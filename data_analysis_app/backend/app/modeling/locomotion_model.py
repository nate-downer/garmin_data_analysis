"""Pooled hierarchical PyMC model for locomotion segment duration, spanning all 5
segment types (technical_climb, nontechnical_climb, flat, nontechnical_descent,
technical_descent) in one fit.

"Effort" (distance + elevation gain, via an accelerating power-law curve - see
`effort.py`) is now a deterministic, precomputed column rather than a latent
per-segment variable. This is what makes pooling safe to retry: the earlier pooled
attempt produced a hard-to-sample funnel from the `beta_type*eta` interaction, where
`eta` was a *stochastic* latent factor with its own prior. With effort now known in
advance, `beta_type * log_effort` is an ordinary varying-slopes hierarchical term - a
routine, well-behaved structure, not a funnel generator.

What's pooled (non-centered, varies by type) vs. shared (one global coefficient across
all 5 types):
- Pooled across all 5 types: `alpha_type` (baseline pace) - harmless and beneficial to
  share regardless of what other covariates drive a given type's duration.
- Pooled across only the 3 non-vertical types (`EFFORT_SEGMENT_TYPES`): `beta_type`
  (effort elasticity). `technical_climb`/`technical_descent` are vertical terrain where
  horizontal distance is meaningless - effort (distance + elevation, see `effort.py`)
  doesn't apply to them at all, and including their data in the effort-curve
  calibration or this hierarchy would skew both for the types that genuinely are
  distance-driven. They get dedicated elevation/pitch covariates in the shared bracket
  instead (`elevation_change_tech_climb`, `elevation_change_tech_descent`,
  `pitch_count_tech_climb`).
- Shared (one global coefficient, all 5 types): every covariate in `SHARED_COVARIATES`
  (load ratio, terrain factor, party size, activity type, cumulative distance/elevation
  fatigue proxies, route-experience level, climb difficulty, the 2 technical-terrain
  covariates above) plus the 2-harmonic time-of-day modifier and the per-activity
  random offset (pooled across all 5 types per activity - this is what gives the
  sparse technical types a usable activity-level signal at all).
- `sigma_duration` (residual noise) is a single shared term, not hierarchical by type -
  a scale-parameter hierarchy on top of already-sparse groups is exactly the kind of
  structure that can quietly reintroduce funnel-like geometry, so it's kept simple
  unless diagnostics clearly call for more.
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

# technical_climb/technical_descent are vertical-terrain types where horizontal
# distance is meaningless - they don't use the effort/beta_type hierarchy at all
# (see the elevation_change_tech_* / pitch_count_tech_climb covariates below
# instead). Only these 3 types' data feeds the effort curve calibration and the
# beta_type hierarchy, so the two vertical types can no longer skew either.
EFFORT_SEGMENT_TYPES = [
    "nontechnical_climb",
    "flat",
    "nontechnical_descent",
]

SHARED_COVARIATES = [
    "load_ratio",
    "terrain_factor_nontechnical",
    "cum_distance_prior_mi",
    "cum_elevation_prior_ft",
    "party_size",
    "is_hiking",
    "is_running",
    "exp_new_route_new_skills",
    "exp_somewhat_familiar_route",
    "exp_familiar_route",
    "diff_4th_class",
    "diff_5th_easy",
    "diff_5th_moderate",
    "diff_5th_hard",
    "elevation_change_tech_climb",
    "elevation_change_tech_descent",
    "pitch_count_tech_climb",
]


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


def _tod_harmonics(hour_of_day: np.ndarray):
    """2-harmonic (24h + 12h period) Fourier terms for the shared time-of-day modifier."""
    hour_rad = 2 * np.pi * np.asarray(hour_of_day, dtype=float) / 24.0
    return np.sin(hour_rad), np.cos(hour_rad), np.sin(2 * hour_rad), np.cos(2 * hour_rad)


def build_and_fit_pooled_model(
    df: pd.DataFrame,
    draws: int = 1000,
    tune: int = 1000,
    chains: int = 4,
    random_seed: int = 42,
) -> dict:
    """
    Build and sample the pooled locomotion model across all 5 segment types.

    `df` must already have a `log_effort` column (see `effort.py`), computed once by
    the caller using this run's own calibrated curve exponents.
    """
    df = df.reset_index(drop=True)
    n = len(df)

    # Drop any covariate that's constant across the whole pooled dataset (e.g. no
    # running activities at all) - a zero-variance column is collinear with the
    # intercept and causes the same identifiability problems fixed elsewhere.
    used_covariates = [cov for cov in SHARED_COVARIATES if df[cov].std() > 1e-9]

    type_to_idx = {t: i for i, t in enumerate(SEGMENT_TYPES)}
    type_idx = df["segment_type_5"].map(type_to_idx).to_numpy()

    # Effort/beta_type only applies to the 3 non-vertical types - technical_climb/
    # technical_descent get a dummy fallback index (0) that's always masked out by
    # is_effort_eligible below, so their rows never influence beta_type's hierarchy.
    effort_type_to_idx = {t: i for i, t in enumerate(EFFORT_SEGMENT_TYPES)}
    is_effort_eligible = df["segment_type_5"].isin(EFFORT_SEGMENT_TYPES).to_numpy().astype(float)
    effort_type_idx = df["segment_type_5"].map(lambda t: effort_type_to_idx.get(t, 0)).to_numpy()

    activity_ids = sorted(df["activity_id"].unique())
    activity_index_map = {a: i for i, a in enumerate(activity_ids)}
    activity_idx = df["activity_id"].map(activity_index_map).to_numpy()

    log_duration = np.log(df["duration_sec"].to_numpy())
    log_effort_std, log_effort_stats = _standardize(df["log_effort"])

    covariate_stats = {}
    covariate_cols = []
    for cov in used_covariates:
        std_vals, stats = _standardize(df[cov])
        covariate_stats[cov] = stats
        covariate_cols.append(std_vals)
    covariate_matrix = np.column_stack(covariate_cols) if covariate_cols else np.zeros((n, 0))

    sin1, cos1, sin2, cos2 = _tod_harmonics(df["hour_of_day"].to_numpy())

    coords = {
        "segment_type": SEGMENT_TYPES,
        "effort_segment_type": EFFORT_SEGMENT_TYPES,
        "covariate": used_covariates,
        "activity": [str(a) for a in activity_ids],
    }

    with pm.Model(coords=coords) as model:
        # --- Non-centered type hierarchy: baseline pace (all 5 types) ---
        mu_alpha = pm.Normal("mu_alpha", 0.0, 2.0)
        sigma_alpha = pm.HalfNormal("sigma_alpha", 1.0)
        alpha_raw = pm.Normal("alpha_raw", 0.0, 1.0, dims="segment_type")
        alpha_type = pm.Deterministic("alpha_type", mu_alpha + sigma_alpha * alpha_raw, dims="segment_type")

        # --- Non-centered type hierarchy: effort elasticity (3 non-vertical types
        # only - technical_climb/technical_descent use elevation_change_tech_*/
        # pitch_count_tech_climb in the shared covariate bracket below instead). ---
        # Centered near 1: effort is engineered so duration scales roughly
        # proportionally to it by construction.
        mu_beta = pm.Normal("mu_beta", 1.0, 0.5)
        sigma_beta = pm.HalfNormal("sigma_beta", 0.4)
        beta_raw = pm.Normal("beta_raw", 0.0, 1.0, dims="effort_segment_type")
        beta_type = pm.Deterministic("beta_type", mu_beta + sigma_beta * beta_raw, dims="effort_segment_type")

        # --- Shared covariate bracket (one equation across all 5 types) ---
        gamma = pm.Normal("gamma", 0.0, 0.5, dims="covariate")
        if used_covariates:
            covariate_term = pm.math.sum(gamma[None, :] * covariate_matrix, axis=1)
        else:
            covariate_term = 0.0

        # --- Shared 2-harmonic time-of-day modifier ---
        tod_a1 = pm.Normal("tod_a1", 0.0, 0.3)
        tod_b1 = pm.Normal("tod_b1", 0.0, 0.3)
        tod_a2 = pm.Normal("tod_a2", 0.0, 0.3)
        tod_b2 = pm.Normal("tod_b2", 0.0, 0.3)
        tod_term = tod_a1 * sin1 + tod_b1 * cos1 + tod_a2 * sin2 + tod_b2 * cos2

        # --- Activity-level random intercept, pooled across ALL 5 types per activity ---
        sigma_activity = pm.HalfNormal("sigma_activity", 0.4)
        activity_raw = pm.Normal("activity_raw", 0.0, 1.0, dims="activity")
        activity_offset = pm.Deterministic("activity_offset", sigma_activity * activity_raw, dims="activity")

        sigma_duration = pm.HalfNormal("sigma_duration", 0.5)

        # is_effort_eligible zeroes the effort term for technical_climb/
        # technical_descent regardless of effort_type_idx's dummy fallback value.
        mu = (
            alpha_type[type_idx]
            + beta_type[effort_type_idx] * log_effort_std * is_effort_eligible
            + covariate_term
            + tod_term
            + activity_offset[activity_idx]
        )
        pm.Normal("log_duration_obs", mu=mu, sigma=sigma_duration, observed=log_duration)

        idata = pm.sample(
            draws=draws,
            tune=tune,
            chains=chains,
            random_seed=random_seed,
            target_accept=0.95,
            nuts_sampler="numpyro",
            nuts_sampler_kwargs={"nuts_kwargs": {"max_tree_depth": 12}},
            progressbar=False,
        )

    return {
        "idata": idata,
        "df": df,
        "activity_index_map": activity_index_map,
        "type_idx": type_idx,
        "effort_type_idx": effort_type_idx,
        "is_effort_eligible": is_effort_eligible,
        "activity_idx": activity_idx,
        "log_effort_stats": log_effort_stats,
        "covariate_stats": covariate_stats,
        "covariate_matrix": covariate_matrix,
        "used_covariates": used_covariates,
    }
