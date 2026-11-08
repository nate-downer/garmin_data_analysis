"""Activities API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import List, Optional
from .. import models, schemas
from ..auth import get_current_user_optional, get_visible_activity, is_admin_user, require_admin
from ..database import get_db

router = APIRouter()


@router.get("/activities", response_model=List[schemas.Activity])
def list_activities(
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user_optional),
):
    """List all activities with summary stats."""
    query = db.query(models.Activity)
    if not is_admin_user(current_user):
        query = query.filter(models.Activity.is_public == True)
    activities = query.order_by(models.Activity.date.desc()).all()
    return activities


@router.get("/activities/{activity_id}", response_model=schemas.Activity)
def get_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user_optional),
):
    """Get single activity details."""
    return get_visible_activity(activity_id, db, current_user)


@router.patch("/activities/{activity_id}", response_model=schemas.Activity)
def update_activity(
    activity_id: str,
    activity_update: schemas.ActivityUpdate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    """Update activity metadata (weight, party size, notes)."""
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    update_data = activity_update.model_dump(exclude_unset=True)

    # Start time is special-cased: shift every point/segment time by the same delta
    # instead of just overwriting the activity's own timestamp, so downstream
    # extraction (hour-of-day, etc.) stays consistent with the new schedule.
    new_start_time_local = update_data.pop("start_time_local", None)
    if new_start_time_local is not None:
        if not activity.is_planned:
            raise HTTPException(status_code=400, detail="Start time can only be edited for planned routes")

        old_reference = activity.start_time_local or activity.start_time_utc
        delta = new_start_time_local - old_reference

        activity.start_time_utc = activity.start_time_utc + delta
        activity.start_time_local = new_start_time_local

        for point in db.query(models.Point).filter(models.Point.activity_id == activity_id).all():
            point.time = point.time + delta

        for segment in db.query(models.Segment).filter(models.Segment.activity_id == activity_id).all():
            segment.start_time = segment.start_time + delta
            segment.end_time = segment.end_time + delta

        for user_segment in db.query(models.UserSegment).filter(models.UserSegment.activity_id == activity_id).all():
            user_segment.start_time = user_segment.start_time + delta
            user_segment.end_time = user_segment.end_time + delta

    # Update remaining fields
    for field, value in update_data.items():
        setattr(activity, field, value)

    activity.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)

    return activity


@router.delete("/activities/{activity_id}")
def delete_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    """Delete activity and all related data."""
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    db.delete(activity)
    db.commit()

    return {"message": f"Activity {activity_id} deleted successfully"}


@router.get("/activities/stats/summary", response_model=schemas.SummaryStats)
def get_summary_stats(
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user_optional),
):
    """Get summary stats for homepage."""
    base_query = db.query(models.Activity)
    if not is_admin_user(current_user):
        base_query = base_query.filter(models.Activity.is_public == True)
    visible_ids = base_query.with_entities(models.Activity.id)

    # Total activities
    total_activities = db.query(func.count(models.Activity.id)).filter(
        models.Activity.id.in_(visible_ids)
    ).scalar()

    # Total distance
    total_distance = db.query(
        func.sum(models.Activity.total_distance_mi)
    ).filter(models.Activity.id.in_(visible_ids)).scalar() or 0

    # Total elevation gain
    total_elevation_gain = db.query(
        func.sum(models.Activity.total_elevation_gain_ft)
    ).filter(models.Activity.id.in_(visible_ids)).scalar() or 0

    # Days since last activity
    latest_activity = base_query.order_by(
        models.Activity.date.desc()
    ).first()

    days_since_last = None
    if latest_activity:
        delta = datetime.utcnow().date() - latest_activity.date.date()
        days_since_last = delta.days

    return schemas.SummaryStats(
        total_activities=total_activities,
        total_distance_mi=round(total_distance, 2),
        total_elevation_gain_ft=round(total_elevation_gain, 2),
        days_since_last_activity=days_since_last
    )
