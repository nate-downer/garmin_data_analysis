"""Points API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import timedelta
import math
import pandas as pd
from .. import models, schemas
from ..database import get_db
from ..services.calculations import decimate_points

router = APIRouter()


@router.get("/activities/{activity_id}/points", response_model=List[schemas.Point])
def get_activity_points(
    activity_id: str,
    include_removed: bool = Query(False, description="Include removed points"),
    db: Session = Depends(get_db)
):
    """Get all points for an activity."""
    # Verify activity exists
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Query points
    query = db.query(models.Point).filter(models.Point.activity_id == activity_id)

    if not include_removed:
        query = query.filter(models.Point.is_removed == False)

    points = query.order_by(models.Point.time).all()

    return points


@router.get("/activities/{activity_id}/points/decimated", response_model=List[schemas.Point])
def get_decimated_points(
    activity_id: str,
    max_points: int = Query(1000, ge=100, le=5000, description="Maximum points to return"),
    include_removed: bool = Query(False, description="Include removed points"),
    db: Session = Depends(get_db)
):
    """Get downsampled points for efficient rendering."""
    # Verify activity exists
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Query points
    query = db.query(models.Point).filter(models.Point.activity_id == activity_id)

    if not include_removed:
        query = query.filter(models.Point.is_removed.is_(False))  # Use is_() for proper boolean comparison

    points = query.order_by(models.Point.time).all()

    print(f"[DECIMATED] Activity {activity_id}, include_removed={include_removed}, found {len(points)} points")

    if not points:
        return []

    # Convert to DataFrame for decimation
    points_data = [{
        'id': p.id,
        'activity_id': p.activity_id,
        'time': p.time,
        'lat': p.lat,
        'lon': p.lon,
        'elevation_m': p.elevation_m,
        'elevation_ft': p.elevation_ft,
        'is_removed': p.is_removed,
        'is_inactive': p.is_inactive
    } for p in points]

    points_df = pd.DataFrame(points_data)

    # Decimate
    decimated_df = decimate_points(points_df, max_points=max_points)

    # Convert back to Point schemas
    decimated_points = [
        schemas.Point(**row) for row in decimated_df.to_dict('records')
    ]

    return decimated_points


@router.delete("/activities/{activity_id}/points")
def remove_points(
    activity_id: str,
    request: schemas.RemovePointsRequest,
    db: Session = Depends(get_db)
):
    """Remove points in a time range (soft delete)."""
    # Verify activity exists
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Find points in time range
    points_to_remove = db.query(models.Point).filter(
        models.Point.activity_id == activity_id,
        models.Point.time >= request.time_range.start,
        models.Point.time <= request.time_range.end,
        models.Point.is_removed == False
    ).all()

    if not points_to_remove:
        return {
            "message": "No points found in the specified time range",
            "points_removed": 0
        }

    # Mark points as removed
    for point in points_to_remove:
        point.is_removed = True

    db.commit()

    return {
        "message": f"Removed {len(points_to_remove)} points",
        "points_removed": len(points_to_remove)
    }


@router.post("/activities/{activity_id}/points/restore")
def restore_points(
    activity_id: str,
    request: schemas.RestorePointsRequest,
    db: Session = Depends(get_db)
):
    """Restore previously removed points."""
    # Verify activity exists
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Find points to restore
    # If point_ids is empty, restore ALL removed points for this activity
    if not request.point_ids:
        points_to_restore = db.query(models.Point).filter(
            models.Point.activity_id == activity_id,
            models.Point.is_removed == True
        ).all()
    else:
        points_to_restore = db.query(models.Point).filter(
            models.Point.id.in_(request.point_ids),
            models.Point.activity_id == activity_id,
            models.Point.is_removed == True
        ).all()

    if not points_to_restore:
        return {
            "message": "No removed points found with the specified IDs",
            "points_restored": 0
        }

    # Restore points
    for point in points_to_restore:
        point.is_removed = False

    db.commit()

    return {
        "message": f"Restored {len(points_to_restore)} points",
        "points_restored": len(points_to_restore)
    }


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great circle distance between two points in miles."""
    R = 3959  # Earth's radius in miles
    dLat = (lat2 - lat1) * math.pi / 180
    dLon = (lon2 - lon1) * math.pi / 180
    a = (
        math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) * math.cos(lat2 * math.pi / 180) *
        math.sin(dLon / 2) * math.sin(dLon / 2)
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


@router.post("/activities/{activity_id}/points/calculate-inactivity")
def calculate_inactivity(
    activity_id: str,
    db: Session = Depends(get_db)
):
    """
    Calculate rolling 3-minute average speed for all points and mark inactive points.
    A point is considered inactive if its rolling average speed < 0.05 mph.
    Uses a centered window (1.5 min before + 1.5 min after each point).
    """
    # Verify activity exists
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get all non-removed points ordered by time
    points = db.query(models.Point).filter(
        models.Point.activity_id == activity_id,
        models.Point.is_removed == False
    ).order_by(models.Point.time).all()

    if len(points) < 2:
        return {
            "message": "Not enough points for inactivity calculation",
            "points_processed": 0,
            "inactive_points": 0
        }

    inactive_count = 0
    window_seconds = 90  # ±90 seconds = 3-minute centered window

    for i, point in enumerate(points):
        # Define time window
        window_start = point.time - timedelta(seconds=window_seconds)
        window_end = point.time + timedelta(seconds=window_seconds)

        # Get points within window
        window_points = [
            p for p in points
            if window_start <= p.time <= window_end
        ]

        if len(window_points) < 2:
            # Not enough points in window - mark as inactive (conservative)
            point.is_inactive = True
            inactive_count += 1
            continue

        # Calculate total distance traveled in window
        total_distance = 0
        for j in range(len(window_points) - 1):
            p1 = window_points[j]
            p2 = window_points[j + 1]
            distance = haversine_distance(p1.lat, p1.lon, p2.lat, p2.lon)
            total_distance += distance

        # Calculate time span of window in hours
        time_span = (window_points[-1].time - window_points[0].time).total_seconds() / 3600

        # Calculate average speed
        if time_span > 0:
            avg_speed = total_distance / time_span
        else:
            avg_speed = 0

        # Mark as inactive if average speed < 0.05 mph
        point.is_inactive = avg_speed < 0.05
        if point.is_inactive:
            inactive_count += 1

    # Commit all changes
    db.commit()

    return {
        "message": f"Inactivity calculated for {len(points)} points",
        "points_processed": len(points),
        "inactive_points": inactive_count,
        "inactive_percentage": round((inactive_count / len(points)) * 100, 1) if points else 0
    }
