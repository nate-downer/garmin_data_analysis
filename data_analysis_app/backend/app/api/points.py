"""Points API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
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
        'is_removed': p.is_removed
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
