"""Calculation utilities for segments, statistics, and energy expenditure."""
import math
import numpy as np
import pandas as pd
from math import sqrt
from datetime import datetime
from typing import List, Dict, Optional
from app import models


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate great circle distance between two points in meters.

    Args:
        lat1, lon1: First point coordinates (degrees)
        lat2, lon2: Second point coordinates (degrees)

    Returns:
        Distance in meters
    """
    R = 6371000  # Earth's radius in meters
    dLat = (lat2 - lat1) * math.pi / 180
    dLon = (lon2 - lon1) * math.pi / 180
    a = (
        math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) * math.cos(lat2 * math.pi / 180) *
        math.sin(dLon / 2) * math.sin(dLon / 2)
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def calculate_pandolf_energy(
    points: List[models.Point],
    start_time: datetime,
    end_time: datetime,
    body_weight_lbs: float,
    pack_weight_lbs: float,
    terrain_factor: float
) -> Dict[str, Optional[float]]:
    """
    Calculate energy expenditure using the Pandolf Equation.

    The Pandolf Equation:
    M = 1.5W + 2.0(W + L)(L / W)^2 + n(W + L)(1.5V^2 + 0.35VG)

    Where:
        M = Metabolic rate (watts)
        W = Body weight (kg)
        L = Load/pack weight (kg)
        V = Velocity (m/s)
        G = Grade (as decimal, e.g., 0.10 for 10%)
        n = Terrain factor (1.0-2.1)

    Args:
        points: List of Point objects for the activity
        start_time: Segment start time
        end_time: Segment end time
        body_weight_lbs: User's body weight in pounds
        pack_weight_lbs: Pack/load weight in pounds
        terrain_factor: Terrain factor (1.0-2.1)

    Returns:
        Dictionary with:
            avg_power_watts: Average metabolic power (watts)
            total_energy_kcal: Total energy expenditure (kilocalories)
            error: Error message if calculation failed, else None
    """
    # Validate inputs
    if not body_weight_lbs or body_weight_lbs <= 0:
        return {
            'avg_power_watts': None,
            'total_energy_kcal': None,
            'error': 'Body weight required'
        }

    if body_weight_lbs < 50 or body_weight_lbs > 400:
        return {
            'avg_power_watts': None,
            'total_energy_kcal': None,
            'error': 'Body weight out of valid range (50-400 lbs)'
        }

    if pack_weight_lbs is None:
        pack_weight_lbs = 0

    if pack_weight_lbs < 0 or pack_weight_lbs > 200:
        return {
            'avg_power_watts': None,
            'total_energy_kcal': None,
            'error': 'Pack weight out of valid range (0-200 lbs)'
        }

    # Convert weights from lbs to kg
    W = body_weight_lbs * 0.453592  # Body weight in kg
    L = pack_weight_lbs * 0.453592  # Load weight in kg
    n = terrain_factor

    # Filter points to segment time range
    segment_points = [p for p in points if start_time <= p.time <= end_time]

    if len(segment_points) < 2:
        return {
            'avg_power_watts': None,
            'total_energy_kcal': None,
            'error': 'Insufficient data points'
        }

    # Calculate metabolic rate for each point pair
    metabolic_rates = []
    time_deltas = []

    for i in range(len(segment_points) - 1):
        p1 = segment_points[i]
        p2 = segment_points[i + 1]

        # Calculate horizontal distance in meters
        horizontal_distance = haversine_distance(p1.lat, p1.lon, p2.lat, p2.lon)

        # Calculate time delta in seconds
        time_delta = (p2.time - p1.time).total_seconds()

        if time_delta <= 0:
            continue  # Skip zero or negative time deltas

        # Calculate velocity in m/s
        V = horizontal_distance / time_delta

        # Calculate elevation change in meters
        elevation_delta = p2.elevation_m - p1.elevation_m

        # Calculate grade (as decimal, e.g., 0.10 for 10%)
        if horizontal_distance > 0:
            G = elevation_delta / horizontal_distance
        else:
            G = 0

        # Calculate metabolic rate using Pandolf equation
        # M = 1.5W + 2.0(W + L)(L / W)^2 + n(W + L)(1.5V^2 + 0.35VG)
        try:
            if W > 0:
                term1 = 1.5 * W
                term2 = 2.0 * (W + L) * (L / W) ** 2
                term3 = n * (W + L) * (1.5 * V ** 2 + 0.35 * V * G)
                M = term1 + term2 + term3
            else:
                M = 0
        except (ZeroDivisionError, ValueError):
            M = 0

        # Ensure non-negative metabolic rate
        M = max(0, M)

        metabolic_rates.append(M)
        time_deltas.append(time_delta)

    if not metabolic_rates:
        return {
            'avg_power_watts': None,
            'total_energy_kcal': None,
            'error': 'No valid data for calculation'
        }

    # Calculate average power (mean of metabolic rates)
    avg_power_watts = sum(metabolic_rates) / len(metabolic_rates)

    # Calculate total energy (sum of M * time_delta)
    # Result is in watt-seconds (joules)
    total_joules = sum(M * dt for M, dt in zip(metabolic_rates, time_deltas))

    # Convert joules to kilocalories
    # 1 joule = 0.000239006 kcal
    total_energy_kcal = total_joules * 0.000239006

    return {
        'avg_power_watts': avg_power_watts,
        'total_energy_kcal': total_energy_kcal,
        'error': None
    }


# Legacy functions for GPX upload and segment calculation
def calculate_segments(points_df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate segments between consecutive GPS points.

    Args:
        points_df: DataFrame with columns: time, lat, lon, elevation_m, elevation_ft

    Returns:
        DataFrame with segment metrics
    """
    if len(points_df) < 2:
        return pd.DataFrame()

    segments = []

    for i in range(len(points_df) - 1):
        p1 = points_df.iloc[i]
        p2 = points_df.iloc[i + 1]

        # Time delta
        time_delta = (p2['time'] - p1['time']).total_seconds()

        if time_delta == 0:
            continue  # Skip zero-duration segments

        # Horizontal distance (Haversine) - note parameter order
        horizontal_dist_m = haversine_distance(
            p1['lat'], p1['lon'],
            p2['lat'], p2['lon']
        )
        horizontal_dist_mi = horizontal_dist_m * 0.000621371

        # Elevation change
        elevation_delta_m = p2['elevation_m'] - p1['elevation_m']
        elevation_delta_ft = p2['elevation_ft'] - p1['elevation_ft']

        # 3D distance (Pythagorean theorem)
        distance_3d_m = sqrt(horizontal_dist_m**2 + elevation_delta_m**2)
        distance_3d_mi = distance_3d_m * 0.000621371

        # Speed (mph)
        speed_mph = (distance_3d_mi / time_delta) * 3600 if time_delta > 0 else 0

        # Pace (min/mile)
        pace_min_per_mi = (time_delta / 60) / distance_3d_mi if distance_3d_mi > 0 else 0

        # Grade (percent)
        grade_percent = (elevation_delta_ft / (horizontal_dist_mi * 5280)) * 100 if horizontal_dist_mi > 0 else 0

        segments.append({
            'start_time': p1['time'],
            'end_time': p2['time'],
            'time_delta_sec': time_delta,
            'horizontal_distance_mi': horizontal_dist_mi,
            'distance_3d_mi': distance_3d_mi,
            'elevation_delta_ft': elevation_delta_ft,
            'speed_mph': speed_mph,
            'pace_min_per_mi': pace_min_per_mi,
            'grade_percent': grade_percent
        })

    return pd.DataFrame(segments)


def aggregate_activity_stats(segments_df: pd.DataFrame) -> Dict:
    """
    Aggregate segment data to activity-level statistics.

    Args:
        segments_df: DataFrame with segment metrics

    Returns:
        Dictionary with aggregate statistics
    """
    if segments_df.empty:
        return {
            'total_duration_sec': 0,
            'total_distance_mi': 0,
            'total_elevation_gain_ft': 0,
            'total_elevation_loss_ft': 0
        }

    # Total duration
    total_duration_sec = segments_df['time_delta_sec'].sum()

    # Total distance (3D)
    total_distance_mi = segments_df['distance_3d_mi'].sum()

    # Total elevation gain and loss
    total_elevation_gain_ft = segments_df[segments_df['elevation_delta_ft'] > 0]['elevation_delta_ft'].sum()
    total_elevation_loss_ft = abs(segments_df[segments_df['elevation_delta_ft'] < 0]['elevation_delta_ft'].sum())

    return {
        'total_duration_sec': total_duration_sec,
        'total_distance_mi': total_distance_mi,
        'total_elevation_gain_ft': total_elevation_gain_ft,
        'total_elevation_loss_ft': total_elevation_loss_ft
    }


def decimate_points(points_df: pd.DataFrame, max_points: int = 1000) -> pd.DataFrame:
    """
    Downsample points for efficient rendering.
    Uses uniform sampling - could be enhanced with Ramer-Douglas-Peucker later.

    Args:
        points_df: DataFrame with GPS points
        max_points: Maximum number of points to return

    Returns:
        Downsampled DataFrame
    """
    if len(points_df) <= max_points:
        return points_df

    # Simple uniform sampling - take every Nth point
    step = len(points_df) // max_points
    indices = list(range(0, len(points_df), step))

    # Always include first and last point
    if indices[-1] != len(points_df) - 1:
        indices.append(len(points_df) - 1)

    return points_df.iloc[indices].reset_index(drop=True)
