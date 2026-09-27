"""GPX file parsing utilities."""
import gpxpy
import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple


def parse_gpx_file(filepath: str) -> Tuple[pd.DataFrame, Dict]:
    """
    Parse GPX file to extract points and metadata.

    Args:
        filepath: Path to GPX file

    Returns:
        Tuple of (points_df, metadata_dict)
        - points_df: DataFrame with columns: time, lat, lon, elevation_m, elevation_ft
        - metadata_dict: Activity metadata (name, type, etc.)
    """
    with open(filepath, 'r') as gpx_file:
        gpx = gpxpy.parse(gpx_file)

    # Extract metadata
    metadata = extract_gpx_metadata(gpx, filepath)

    # Extract points from tracks
    points = []
    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                points.append({
                    'time': point.time,
                    'lat': point.latitude,
                    'lon': point.longitude,
                    'elevation_m': point.elevation if point.elevation is not None else 0.0,
                    'elevation_ft': (point.elevation * 3.28084) if point.elevation is not None else 0.0
                })

    # Convert to DataFrame
    points_df = pd.DataFrame(points)

    # Handle missing timestamps (create synthetic ones)
    if points_df.empty or points_df['time'].isna().any():
        # If no timestamps, create them starting from metadata start time
        start_time = metadata.get('start_time_utc', datetime.utcnow())
        points_df['time'] = pd.date_range(
            start=start_time,
            periods=len(points_df),
            freq='1S'
        )

    return points_df, metadata


def extract_gpx_metadata(gpx, filepath: str) -> Dict:
    """
    Extract activity metadata from GPX object.

    Args:
        gpx: Parsed GPX object
        filepath: Path to GPX file (used to extract activity_id from filename)

    Returns:
        Dictionary with activity metadata
    """
    # Extract activity_id from filename
    filename = Path(filepath).stem
    activity_id = filename

    # Extract name from GPX (if available)
    activity_name = None
    if gpx.tracks:
        activity_name = gpx.tracks[0].name
    if not activity_name:
        activity_name = filename

    # Extract activity type (default to 'hiking' if not specified)
    activity_type = None
    if gpx.tracks and gpx.tracks[0].type:
        activity_type = gpx.tracks[0].type
    else:
        activity_type = 'hiking'

    # Extract start time
    start_time_utc = None
    if gpx.tracks:
        for track in gpx.tracks:
            for segment in track.segments:
                if segment.points and segment.points[0].time:
                    start_time_utc = segment.points[0].time
                    break
            if start_time_utc:
                break

    # If no start time found, use file modification time
    if not start_time_utc:
        start_time_utc = datetime.utcnow()

    return {
        'activity_id': activity_id,
        'activity_name': activity_name,
        'activity_type': activity_type,
        'start_time_utc': start_time_utc,
        'date': start_time_utc.date() if start_time_utc else datetime.utcnow().date()
    }
