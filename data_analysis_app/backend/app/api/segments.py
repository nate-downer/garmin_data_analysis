"""Segments API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import pandas as pd
from .. import models, schemas
from ..database import get_db
from ..services.calculations import calculate_segments, aggregate_activity_stats

router = APIRouter()


@router.get("/activities/{activity_id}/segments", response_model=List[schemas.Segment])
def get_activity_segments(activity_id: str, db: Session = Depends(get_db)):
    """Get calculated segments for an activity."""
    # Verify activity exists
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get segments
    segments = db.query(models.Segment).filter(
        models.Segment.activity_id == activity_id
    ).order_by(models.Segment.start_time).all()

    return segments


@router.post("/activities/{activity_id}/segments/recalculate")
def recalculate_segments(activity_id: str, db: Session = Depends(get_db)):
    """
    Recalculate segments after point edits.

    This deletes existing segments and recalculates based on non-removed points.
    """
    # Verify activity exists
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get non-removed points
    points = db.query(models.Point).filter(
        models.Point.activity_id == activity_id,
        models.Point.is_removed == False
    ).order_by(models.Point.time).all()

    if len(points) < 2:
        return {
            "message": "Not enough points to calculate segments",
            "segments_created": 0
        }

    # Convert points to DataFrame
    points_data = [{
        'id': p.id,
        'time': p.time,
        'lat': p.lat,
        'lon': p.lon,
        'elevation_m': p.elevation_m,
        'elevation_ft': p.elevation_ft
    } for p in points]

    points_df = pd.DataFrame(points_data)

    # Calculate new segments
    segments_df = calculate_segments(points_df)

    # Delete old segments
    db.query(models.Segment).filter(
        models.Segment.activity_id == activity_id
    ).delete()

    # Create new segments
    segment_objects = []
    for i, row in segments_df.iterrows():
        if i < len(points) - 1:
            segment = models.Segment(
                activity_id=activity_id,
                start_point_id=points[i].id,
                end_point_id=points[i + 1].id,
                start_time=row['start_time'],
                end_time=row['end_time'],
                time_delta_sec=row['time_delta_sec'],
                horizontal_distance_mi=row['horizontal_distance_mi'],
                distance_3d_mi=row['distance_3d_mi'],
                elevation_delta_ft=row['elevation_delta_ft'],
                speed_mph=row['speed_mph'],
                pace_min_per_mi=row['pace_min_per_mi'],
                grade_percent=row['grade_percent']
            )
            segment_objects.append(segment)

    db.bulk_save_objects(segment_objects)

    # Recalculate activity stats
    stats = aggregate_activity_stats(segments_df)
    activity.total_duration_sec = stats['total_duration_sec']
    activity.total_distance_mi = stats['total_distance_mi']
    activity.total_elevation_gain_ft = stats['total_elevation_gain_ft']
    activity.total_elevation_loss_ft = stats['total_elevation_loss_ft']

    db.commit()

    return {
        "message": f"Recalculated {len(segment_objects)} segments",
        "segments_created": len(segment_objects),
        "activity_stats": stats
    }


@router.get("/activities/{activity_id}/user-segments", response_model=List[schemas.UserSegment])
def get_user_segments(activity_id: str, db: Session = Depends(get_db)):
    """Get user-defined segments for an activity."""
    # Verify activity exists
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get user segments
    user_segments = db.query(models.UserSegment).filter(
        models.UserSegment.activity_id == activity_id
    ).order_by(models.UserSegment.start_time).all()

    return user_segments


@router.post("/activities/{activity_id}/user-segments", response_model=schemas.UserSegment)
def create_user_segment(
    activity_id: str,
    segment: schemas.UserSegmentCreate,
    db: Session = Depends(get_db)
):
    """Create a new user-defined segment."""
    # Verify activity exists
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Create user segment
    user_segment = models.UserSegment(
        activity_id=activity_id,
        **segment.model_dump()
    )

    db.add(user_segment)
    db.commit()
    db.refresh(user_segment)

    return user_segment


@router.put("/user-segments/{segment_id}", response_model=schemas.UserSegment)
def update_user_segment(
    segment_id: int,
    segment_update: schemas.UserSegmentUpdate,
    db: Session = Depends(get_db)
):
    """Update a user-defined segment."""
    user_segment = db.query(models.UserSegment).filter(
        models.UserSegment.id == segment_id
    ).first()

    if not user_segment:
        raise HTTPException(status_code=404, detail="User segment not found")

    # Update fields
    update_data = segment_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user_segment, field, value)

    db.commit()
    db.refresh(user_segment)

    return user_segment


@router.delete("/user-segments/{segment_id}")
def delete_user_segment(segment_id: int, db: Session = Depends(get_db)):
    """Delete a user-defined segment."""
    user_segment = db.query(models.UserSegment).filter(
        models.UserSegment.id == segment_id
    ).first()

    if not user_segment:
        raise HTTPException(status_code=404, detail="User segment not found")

    db.delete(user_segment)
    db.commit()

    return {"message": f"User segment {segment_id} deleted successfully"}
