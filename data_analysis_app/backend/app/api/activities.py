"""Activities API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import List
from .. import models, schemas
from ..database import get_db

router = APIRouter()


@router.get("/activities", response_model=List[schemas.Activity])
def list_activities(db: Session = Depends(get_db)):
    """List all activities with summary stats."""
    activities = db.query(models.Activity).order_by(models.Activity.date.desc()).all()
    return activities


@router.get("/activities/{activity_id}", response_model=schemas.Activity)
def get_activity(activity_id: str, db: Session = Depends(get_db)):
    """Get single activity details."""
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    return activity


@router.patch("/activities/{activity_id}", response_model=schemas.Activity)
def update_activity(
    activity_id: str,
    activity_update: schemas.ActivityUpdate,
    db: Session = Depends(get_db)
):
    """Update activity metadata (weight, party size, notes)."""
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Update fields
    update_data = activity_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(activity, field, value)

    activity.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)

    return activity


@router.delete("/activities/{activity_id}")
def delete_activity(activity_id: str, db: Session = Depends(get_db)):
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
def get_summary_stats(db: Session = Depends(get_db)):
    """Get summary stats for homepage."""
    # Total activities
    total_activities = db.query(func.count(models.Activity.id)).scalar()

    # Total distance
    total_distance = db.query(
        func.sum(models.Activity.total_distance_mi)
    ).scalar() or 0

    # Total elevation gain
    total_elevation_gain = db.query(
        func.sum(models.Activity.total_elevation_gain_ft)
    ).scalar() or 0

    # Days since last activity
    latest_activity = db.query(models.Activity).order_by(
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
