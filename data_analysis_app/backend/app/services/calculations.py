"""Calculation utilities for distance, speed, pace, and grade."""
import numpy as np
import pandas as pd
from math import radians, cos, sin, asin, sqrt
from typing import Dict


def haversine_distance(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """
    Calculate geodesic distance between two points using Haversine formula.

    Args:
        lon1, lat1: Longitude and latitude of first point (degrees)
        lon2, lat2: Longitude and latitude of second point (degrees)

    Returns:
        Distance in meters
    """
    # Convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])

    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))

    # Earth's radius in meters
    r = 6371000

    return c * r


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

        # Horizontal distance (Haversine)
        horizontal_dist_m = haversine_distance(
            p1['lon'], p1['lat'],
            p2['lon'], p2['lat']
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
