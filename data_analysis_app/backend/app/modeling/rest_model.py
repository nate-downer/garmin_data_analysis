"""Simple Bayesian regression for total activity rest time (one row per activity)."""
import numpy as np
import pandas as pd
import pymc as pm

from .locomotion_model import _standardize

EXTRA_COVARIATES = ["party_size", "is_hiking", "is_running", "pct_technical_elevation_gain"]


def build_and_fit_rest_model(
    df: pd.DataFrame, draws: int = 1000, tune: int = 1000, chains: int = 4, random_seed: int = 42
) -> dict:
    df = df.reset_index(drop=True)
    y = df["total_rest_min"].to_numpy()

    distance_std, distance_stats = _standardize(df["total_distance_mi"])
    elevation_std, elevation_stats = _standardize(df["total_elevation_gain_ft"])

    # Same zero-variance guard as the locomotion models - a constant covariate (e.g. no
    # running activities left after dropna) is collinear with the intercept.
    used_covariates = [cov for cov in EXTRA_COVARIATES if df[cov].std() > 1e-9]
    n_covariates = len(used_covariates)

    covariate_stats = {}
    covariate_cols = []
    for cov in used_covariates:
        std_vals, stats = _standardize(df[cov])
        covariate_stats[cov] = stats
        covariate_cols.append(std_vals)
    covariate_matrix = np.column_stack(covariate_cols) if covariate_cols else np.zeros((len(df), 0))

    y_mean = float(y.mean())
    y_std = float(y.std()) if y.std() > 1e-6 else 1.0

    with pm.Model():
        alpha = pm.Normal("alpha", y_mean, y_std + 1.0)
        beta_distance = pm.Normal("beta_distance", 0.0, 2 * y_std)
        beta_elevation = pm.Normal("beta_elevation", 0.0, 2 * y_std)
        gamma = pm.Normal("gamma", 0.0, 2 * y_std, shape=n_covariates)
        sigma = pm.HalfNormal("sigma", y_std + 1.0)

        covariate_term = pm.math.sum(gamma[None, :] * covariate_matrix, axis=1) if n_covariates > 0 else 0.0
        mu = alpha + beta_distance * distance_std + beta_elevation * elevation_std + covariate_term
        pm.Normal("rest_obs", mu=mu, sigma=sigma, observed=y)

        idata = pm.sample(
            draws=draws,
            tune=tune,
            chains=chains,
            random_seed=random_seed,
            target_accept=0.9,
            nuts_sampler="numpyro",
            progressbar=False,
        )

    return {
        "idata": idata,
        "df": df,
        "distance_stats": distance_stats,
        "elevation_stats": elevation_stats,
        "covariate_stats": covariate_stats,
        "covariate_matrix": covariate_matrix,
        "used_covariates": used_covariates,
    }
