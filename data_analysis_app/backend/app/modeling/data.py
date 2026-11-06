"""Data extraction for the hierarchical time-prediction models."""
from typing import Dict, List, Optional

import pandas as pd
from sqlalchemy.orm import Session

from .. import models
from ..services.calculations import calculate_segment_metrics
from ..services.timezone import convert_to_local_time

LOCOMOTION_SEGMENT_TYPES = ("climb", "descent", "flat")


def _segment_type_5(segment_type: str, is_technical: bool) -> str:
    """Collapse segment_type + is_technical into the 5-level locomotion category."""
    if segment_type == "flat":
        return "flat"
    prefix = "technical" if is_technical else "nontechnical"
    return f"{prefix}_{segment_type}"


def extract_all_segments(
    db: Session, n_recent_activities: Optional[int] = None, exclude_planned: bool = False
) -> pd.DataFrame:
    """
    Pull every UserSegment with derived metrics and covariates, one row per
    UserSegment (all types, including rest), ordered by activity + start_time.
    Points are cached per activity to avoid the N+1 query pattern.

    `exclude_planned` defaults to False since this is also used at prediction time
    to extract a specific *planned* route's own segments - set it True only for
    training-data extraction, where planned routes (no "actual" duration) don't belong.

    If `n_recent_activities` is given (training-data use only), restricts to the N
    most-recently-dated activities instead of the full history.
    """
    query = db.query(models.UserSegment, models.Activity).join(
        models.Activity, models.UserSegment.activity_id == models.Activity.activity_id
    )
    if exclude_planned:
        query = query.filter(models.Activity.is_planned == False)

    if n_recent_activities is not None:
        recent_ids_query = db.query(models.Activity.activity_id)
        if exclude_planned:
            recent_ids_query = recent_ids_query.filter(models.Activity.is_planned == False)
        recent_activity_ids = [
            row[0] for row in recent_ids_query.order_by(models.Activity.date.desc()).limit(n_recent_activities).all()
        ]
        query = query.filter(models.Activity.activity_id.in_(recent_activity_ids))

    results = query.order_by(models.Activity.activity_id, models.UserSegment.start_time).all()

    points_cache: Dict[str, List[models.Point]] = {}
    rows = []

    for user_segment, activity in results:
        if activity.activity_id not in points_cache:
            points_cache[activity.activity_id] = (
                db.query(models.Point)
                .filter(models.Point.activity_id == activity.activity_id, models.Point.is_removed == False)
                .order_by(models.Point.time)
                .all()
            )
        points = points_cache[activity.activity_id]

        metrics = calculate_segment_metrics(
            points=points, start_time=user_segment.start_time, end_time=user_segment.end_time
        )

        pack_weight_lbs = user_segment.pack_weight_override_lbs
        if pack_weight_lbs is None:
            pack_weight_lbs = activity.weight_carried_lbs or 0.0

        terrain_factor = user_segment.terrain_factor
        if terrain_factor is None:
            terrain_factor = activity.terrain_factor or 1.1

        local_start = convert_to_local_time(user_segment.start_time, activity.timezone)

        rows.append({
            "segment_id": user_segment.id,
            "activity_id": activity.activity_id,
            "activity_name": activity.activity_name or activity.activity_id,
            "segment_type": user_segment.segment_type,
            "is_technical": bool(user_segment.is_technical),
            "difficulty": user_segment.difficulty,
            "start_time": user_segment.start_time,
            "duration_sec": metrics["duration_sec"],
            "distance_mi": metrics["distance_mi"],
            "elevation_gain_ft": metrics["elevation_gain_ft"],
            "elevation_loss_ft": metrics["elevation_loss_ft"],
            "pitch_count": user_segment.pitch_count,
            "body_weight_lbs": activity.body_weight_lbs,
            "pack_weight_lbs": pack_weight_lbs,
            "terrain_factor": terrain_factor,
            "hour_of_day": local_start.hour + local_start.minute / 60.0,
            "activity_type": activity.activity_type,
            "party_size": activity.party_size,
            "experience_level": activity.experience_level,
        })

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # Fatigue proxies: ground/climbing already covered earlier in this activity,
    # computed across ALL segment types (rest time still represents elapsed effort).
    df = df.sort_values(["activity_id", "start_time"]).reset_index(drop=True)
    distance_filled = df["distance_mi"].fillna(0.0)
    elevation_filled = df["elevation_gain_ft"].fillna(0.0)
    grouped_distance = distance_filled.groupby(df["activity_id"])
    grouped_elevation = elevation_filled.groupby(df["activity_id"])
    df["cum_distance_prior_mi"] = grouped_distance.cumsum() - distance_filled
    df["cum_elevation_prior_ft"] = grouped_elevation.cumsum() - elevation_filled

    df["load_ratio"] = df["pack_weight_lbs"] / df["body_weight_lbs"].where(df["body_weight_lbs"] > 0)
    df["segment_type_5"] = [
        _segment_type_5(st, tech) for st, tech in zip(df["segment_type"], df["is_technical"])
    ]

    # activity_type dummy-encoded relative to "mountaineering" (the most common level)
    df["is_hiking"] = (df["activity_type"] == "hiking").astype(float)
    df["is_running"] = (df["activity_type"] == "running").astype(float)

    # experience_level dummy-encoded relative to "New Route - Familiar Skills" (the
    # field's own DB default), same convention as the activity_type dummies above.
    df["exp_new_route_new_skills"] = (df["experience_level"] == "New Route + New Skills").astype(float)
    df["exp_somewhat_familiar_route"] = (df["experience_level"] == "Somewhat Familiar Route").astype(float)
    df["exp_familiar_route"] = (df["experience_level"] == "Familiar Route").astype(float)

    # Climb difficulty dummy-encoded relative to "3rd Class" (the easiest level) -
    # scoped to technical_climb rows only; zero everywhere else, same convention as
    # the dummies above.
    is_tech_climb = df["segment_type_5"] == "technical_climb"
    df["diff_4th_class"] = (is_tech_climb & (df["difficulty"] == "4th Class")).astype(float)
    df["diff_5th_easy"] = (is_tech_climb & (df["difficulty"] == "5th Easy")).astype(float)
    df["diff_5th_moderate"] = (is_tech_climb & (df["difficulty"] == "5th Moderate")).astype(float)
    df["diff_5th_hard"] = (is_tech_climb & (df["difficulty"] == "5th Hard")).astype(float)

    # Technical climb/descent duration is driven by vertical elevation change, not
    # horizontal distance - these are zero everywhere except their own type, same
    # convention as the dummies above. Climbs use elevation GAIN (net upward);
    # descents use elevation LOSS (net downward) - using gain for a descent would be
    # near-zero noise since gain only accumulates upward wiggles within an overall
    # downward segment.
    is_tech_descent = df["segment_type_5"] == "technical_descent"
    elevation_gain_filled = df["elevation_gain_ft"].fillna(0.0)
    elevation_loss_filled = df["elevation_loss_ft"].fillna(0.0)
    pitch_count_filled = df["pitch_count"].fillna(0.0)
    df["elevation_change_tech_climb"] = elevation_gain_filled.where(is_tech_climb, 0.0)
    df["elevation_change_tech_descent"] = elevation_loss_filled.where(is_tech_descent, 0.0)
    df["pitch_count_tech_climb"] = pitch_count_filled.where(is_tech_climb, 0.0)

    # Terrain factor (Pandolf ground-surface factor: paved/dirt/brush/sand) only
    # makes sense for foot-based locomotion - there's no "ground surface" when
    # climbing a rock face or rappelling. Zero for both vertical types, same
    # convention as the dummies above.
    is_tech_vertical = is_tech_climb | is_tech_descent
    df["terrain_factor_nontechnical"] = df["terrain_factor"].where(~is_tech_vertical, 0.0)

    return df


def extract_locomotion_dataframe(db: Session, n_recent_activities: Optional[int] = None) -> pd.DataFrame:
    """Rows for the locomotion hierarchical model (climb/descent/flat segments only)."""
    df = extract_all_segments(db, n_recent_activities, exclude_planned=True)
    if df.empty:
        return df

    loco = df[df["segment_type"].isin(LOCOMOTION_SEGMENT_TYPES)].copy()
    required = [
        "duration_sec", "distance_mi", "elevation_gain_ft", "load_ratio", "terrain_factor",
        "activity_type", "party_size",
    ]
    loco = loco.dropna(subset=required)
    loco = loco[loco["duration_sec"] > 0]
    return loco.reset_index(drop=True)


def extract_rest_dataframe(db: Session, n_recent_activities: Optional[int] = None) -> pd.DataFrame:
    """One row per activity: total rest time vs. total distance/elevation gain."""
    df = extract_all_segments(db, n_recent_activities, exclude_planned=True)
    if df.empty:
        return df

    activity_totals = (
        df.groupby("activity_id")
        .agg(
            total_distance_mi=("distance_mi", "sum"),
            total_elevation_gain_ft=("elevation_gain_ft", "sum"),
            activity_name=("activity_name", "first"),
            activity_type=("activity_type", "first"),
            party_size=("party_size", "first"),
            is_hiking=("is_hiking", "first"),
            is_running=("is_running", "first"),
        )
        .reset_index()
    )
    rest_totals = (
        df[df["segment_type"] == "rest"]
        .groupby("activity_id")["duration_sec"]
        .sum()
        .rename("total_rest_sec")
        .reset_index()
    )
    merged = activity_totals.merge(rest_totals, on="activity_id", how="left")
    merged["total_rest_sec"] = merged["total_rest_sec"].fillna(0.0)
    merged["total_rest_min"] = merged["total_rest_sec"] / 60.0

    # % of total route elevation gain that came from technical climbing - normalized by
    # total gain (not climbing-only gain) so it reflects both how much technical
    # climbing happened AND how significant it was relative to the whole trip.
    technical_totals = (
        df[df["segment_type_5"] == "technical_climb"]
        .groupby("activity_id")["elevation_gain_ft"].sum()
        .rename("technical_elevation_gain_ft")
        .reset_index()
    )
    merged = merged.merge(technical_totals, on="activity_id", how="left")
    merged["technical_elevation_gain_ft"] = merged["technical_elevation_gain_ft"].fillna(0.0)
    merged["pct_technical_elevation_gain"] = (
        merged["technical_elevation_gain_ft"]
        / merged["total_elevation_gain_ft"].where(merged["total_elevation_gain_ft"] > 0)
    ).fillna(0.0)

    required = ["total_distance_mi", "total_elevation_gain_ft", "activity_type", "party_size"]
    return merged.dropna(subset=required).reset_index(drop=True)
