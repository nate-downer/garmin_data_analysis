"""Deterministic "effort" feature: an accelerating (compounding-fatigue) power-law
transform of distance and elevation gain, replacing the old latent per-segment eta.

Power law (not e^(kx)-1) because it's scale-covariant - rescaling units just rescales
the result by a constant factor, so it stays well-behaved regardless of the raw
magnitude of distance (miles) vs. elevation (feet). An exponential's curvature is far
more sensitive to the absolute scale of x, which would require re-tuning k per unit
choice.

The curve exponents are calibrated once per fit via a closed-form grid search (plain
NumPy OLS, no MCMC) rather than as free PyMC parameters - letting them vary inside the
sampled model would reintroduce a parameter multiplicatively coupled with the
hierarchical beta_type, which is exactly the kind of interaction that produced the old
funnel. Keeping curve-shape calibration outside the model entirely avoids that.
"""
import numpy as np
import pandas as pd

ELEVATION_RESCALE_FT = 1000.0
P_GRID = np.round(np.arange(1.05, 2.51, 0.05), 2)


def compute_effort(
    distance_mi, elevation_gain_ft, p_distance: float, p_elevation: float
):
    """effort = distance_mi^p_distance + (elevation_gain_ft/1000)^p_elevation."""
    distance_mi = np.asarray(distance_mi, dtype=float)
    elevation_gain_ft = np.asarray(elevation_gain_ft, dtype=float)
    return (
        np.power(distance_mi, p_distance)
        + np.power(elevation_gain_ft / ELEVATION_RESCALE_FT, p_elevation)
    )


def calibrate_effort_curve(df: pd.DataFrame, p_grid: np.ndarray = P_GRID) -> dict:
    """
    Closed-form grid search over (p_distance, p_elevation): for each candidate pair,
    fit log(duration) ~ c + b*log(effort) via OLS and keep the pair with lowest SSE.

    Brute-force over the full grid, so the result is the true grid optimum - no
    local-minima risk, and cheap enough (a few hundred OLS solves on a few hundred
    rows) to redo on every fit rather than caching a frozen constant.
    """
    log_duration = np.log(df["duration_sec"].to_numpy())
    distance = df["distance_mi"].to_numpy()
    elevation = df["elevation_gain_ft"].to_numpy()

    best_sse = None
    best_p_distance = None
    best_p_elevation = None

    for p_d in p_grid:
        for p_e in p_grid:
            effort = compute_effort(distance, elevation, p_d, p_e)
            log_effort = np.log(effort + 1e-6)
            design = np.column_stack([np.ones_like(log_effort), log_effort])
            coef, *_ = np.linalg.lstsq(design, log_duration, rcond=None)
            residual = log_duration - design @ coef
            sse = float(np.sum(residual ** 2))
            if best_sse is None or sse < best_sse:
                best_sse = sse
                best_p_distance = float(p_d)
                best_p_elevation = float(p_e)

    return {
        "p_distance": best_p_distance,
        "p_elevation": best_p_elevation,
        "elevation_rescale_ft": ELEVATION_RESCALE_FT,
    }
