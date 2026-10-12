"""Segments API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import pandas as pd
import math
from .. import models, schemas
from ..database import get_db
from ..services.calculations import calculate_segments, aggregate_activity_stats
from app.services.calculations import calculate_pandolf_energy

router = APIRouter()


def calculate_segment_energy(user_segment: models.UserSegment, activity: models.Activity, db: Session):
    """
    Helper function to calculate and save energy expenditure for a non-technical segment.

    Args:
        user_segment: The segment to calculate energy for
        activity: The activity the segment belongs to
        db: Database session
    """
    if user_segment.is_technical:
        return  # Skip technical segments

    if not activity.body_weight_lbs:
        user_segment.energy_calculation_error = "Body weight required"
        return

    # Get all points for the activity
    points = db.query(models.Point).filter(
        models.Point.activity_id == activity.activity_id,
        models.Point.is_removed == False
    ).order_by(models.Point.time).all()

    # Determine pack weight (segment override or activity default)
    pack_weight = user_segment.pack_weight_override_lbs or activity.weight_carried_lbs or 0

    # Determine terrain factor (segment override or activity default)
    terrain_factor = user_segment.terrain_factor if user_segment.terrain_factor is not None else (activity.terrain_factor or 1.1)

    # Calculate energy
    result = calculate_pandolf_energy(
        points=points,
        start_time=user_segment.start_time,
        end_time=user_segment.end_time,
        body_weight_lbs=activity.body_weight_lbs,
        pack_weight_lbs=pack_weight,
        terrain_factor=terrain_factor
    )

    user_segment.avg_power_watts = result['avg_power_watts']
    user_segment.total_energy_kcal = result['total_energy_kcal']
    user_segment.energy_calculation_error = result['error']


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

    # Calculate energy expenditure if not a technical segment
    if not user_segment.is_technical:
        # Get all points for the activity
        points = db.query(models.Point).filter(
            models.Point.activity_id == activity_id,
            models.Point.is_removed == False
        ).order_by(models.Point.time).all()

        # Determine pack weight (segment override or activity default)
        pack_weight = user_segment.pack_weight_override_lbs or activity.weight_carried_lbs or 0

        # Determine terrain factor (segment override or activity default)
        terrain_factor = user_segment.terrain_factor if user_segment.terrain_factor is not None else (activity.terrain_factor or 1.1)

        # Calculate energy if body weight is available
        if activity.body_weight_lbs:
            result = calculate_pandolf_energy(
                points=points,
                start_time=user_segment.start_time,
                end_time=user_segment.end_time,
                body_weight_lbs=activity.body_weight_lbs,
                pack_weight_lbs=pack_weight,
                terrain_factor=terrain_factor
            )

            user_segment.avg_power_watts = result['avg_power_watts']
            user_segment.total_energy_kcal = result['total_energy_kcal']
            user_segment.energy_calculation_error = result['error']

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

    # Recalculate energy if inputs changed and segment is not technical
    if not user_segment.is_technical:
        # Get activity for body weight and default pack weight
        activity = db.query(models.Activity).filter(
            models.Activity.activity_id == user_segment.activity_id
        ).first()

        if activity:
            # Get all points for the activity
            points = db.query(models.Point).filter(
                models.Point.activity_id == user_segment.activity_id,
                models.Point.is_removed == False
            ).order_by(models.Point.time).all()

            # Determine pack weight (segment override or activity default)
            pack_weight = user_segment.pack_weight_override_lbs or activity.weight_carried_lbs or 0

            # Determine terrain factor (segment override or activity default)
            terrain_factor = user_segment.terrain_factor if user_segment.terrain_factor is not None else (activity.terrain_factor or 1.1)

            # Calculate energy if body weight is available
            if activity.body_weight_lbs:
                result = calculate_pandolf_energy(
                    points=points,
                    start_time=user_segment.start_time,
                    end_time=user_segment.end_time,
                    body_weight_lbs=activity.body_weight_lbs,
                    pack_weight_lbs=pack_weight,
                    terrain_factor=terrain_factor
                )

                user_segment.avg_power_watts = result['avg_power_watts']
                user_segment.total_energy_kcal = result['total_energy_kcal']
                user_segment.energy_calculation_error = result['error']

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


def auto_detect_segment_type(points: List[models.Point], start_time: datetime, end_time: datetime) -> str:
    """
    Auto-detect segment type based on elevation gain/loss.
    Returns: 'climb', 'descent', or 'flat'
    """
    # Filter points in time range
    segment_points = [p for p in points if start_time <= p.time <= end_time]

    if len(segment_points) < 2:
        return 'flat'

    # Calculate elevation gain and loss
    elevation_gain = 0
    elevation_loss = 0

    for i in range(len(segment_points) - 1):
        delta = segment_points[i + 1].elevation_ft - segment_points[i].elevation_ft
        if delta > 0:
            elevation_gain += delta
        else:
            elevation_loss += abs(delta)

    # Apply detection logic
    if elevation_gain > 50 and elevation_gain > elevation_loss * 1.5:
        return 'climb'
    elif elevation_loss > 50 and elevation_loss > elevation_gain * 1.5:
        return 'descent'
    else:
        return 'flat'


@router.post("/activities/{activity_id}/segments/generate")
def generate_segments(
    activity_id: str,
    force: bool = Query(False, description="Delete existing user segments before generating"),
    db: Session = Depends(get_db)
):
    """
    Auto-generate segments using 3-step algorithm:
    1. Calculate inactivity (rolling 2-min avg speed < 0.2 mph)
    2. Identify long rest segments (continuous inactivity > 5 minutes)
    3. Fill gaps with non-technical segments
    """
    # Verify activity exists
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == activity_id
    ).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Delete existing user segments if force=True
    if force:
        db.query(models.UserSegment).filter(
            models.UserSegment.activity_id == activity_id
        ).delete()
        db.commit()
    else:
        # Check if segments already exist
        existing = db.query(models.UserSegment).filter(
            models.UserSegment.activity_id == activity_id
        ).count()
        if existing > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Activity already has {existing} segments. Use force=true to overwrite."
            )

    # Get all non-removed points ordered by time
    points = db.query(models.Point).filter(
        models.Point.activity_id == activity_id,
        models.Point.is_removed == False
    ).order_by(models.Point.time).all()

    if len(points) < 2:
        return {
            "message": "Not enough points to generate segments",
            "segments_created": 0
        }

    # Step 1: Calculate inactivity using rolling average
    from datetime import timedelta

    window_seconds = 60  # 2-minute centered window (60 sec before + 60 sec after)
    inactive_count = 0

    for i, point in enumerate(points):
        window_start = point.time - timedelta(seconds=window_seconds)
        window_end = point.time + timedelta(seconds=window_seconds)

        window_points = [p for p in points if window_start <= p.time <= window_end]

        if len(window_points) < 2:
            point.is_inactive = True
            inactive_count += 1
            continue

        total_distance = 0
        for j in range(len(window_points) - 1):
            p1 = window_points[j]
            p2 = window_points[j + 1]
            distance = haversine_distance(p1.lat, p1.lon, p2.lat, p2.lon)
            total_distance += distance

        time_span = (window_points[-1].time - window_points[0].time).total_seconds() / 3600
        avg_speed = total_distance / time_span if time_span > 0 else 0
        point.is_inactive = avg_speed < 0.2
        if point.is_inactive:
            inactive_count += 1

    db.commit()  # Save inactivity flags

    # Step 2: Identify long rest segments (continuous inactivity > 5 minutes)
    rest_segments = []
    current_rest_start = None

    for i, point in enumerate(points):
        if point.is_inactive:
            if current_rest_start is None:
                current_rest_start = point.time
        else:
            if current_rest_start is not None:
                rest_duration_sec = (points[i - 1].time - current_rest_start).total_seconds()
                if rest_duration_sec >= 300:  # 5 minutes
                    rest_segments.append({
                        'start_time': current_rest_start,
                        'end_time': points[i - 1].time,
                        'segment_type': 'rest',
                        'is_technical': False
                    })
                current_rest_start = None

    # Handle rest at end of activity
    if current_rest_start is not None:
        rest_duration_sec = (points[-1].time - current_rest_start).total_seconds()
        if rest_duration_sec >= 300:  # 5 minutes
            rest_segments.append({
                'start_time': current_rest_start,
                'end_time': points[-1].time,
                'segment_type': 'rest',
                'is_technical': False
            })

    # Step 3: Fill gaps with non-technical segments
    all_segments = []
    rest_segments.sort(key=lambda s: s['start_time'])

    # Add segment from activity start to first rest
    if rest_segments:
        if points[0].time < rest_segments[0]['start_time']:
            seg_type = auto_detect_segment_type(points, points[0].time, rest_segments[0]['start_time'])
            all_segments.append({
                'start_time': points[0].time,
                'end_time': rest_segments[0]['start_time'],
                'segment_type': seg_type,
                'is_technical': False
            })

    # Add rest segments and fill gaps between them
    for i, rest in enumerate(rest_segments):
        all_segments.append(rest)

        # Fill gap to next rest
        if i < len(rest_segments) - 1:
            gap_start = rest['end_time']
            gap_end = rest_segments[i + 1]['start_time']
            if gap_end > gap_start:
                seg_type = auto_detect_segment_type(points, gap_start, gap_end)
                all_segments.append({
                    'start_time': gap_start,
                    'end_time': gap_end,
                    'segment_type': seg_type,
                    'is_technical': False
                })

    # Add segment from last rest to activity end
    if rest_segments:
        if points[-1].time > rest_segments[-1]['end_time']:
            seg_type = auto_detect_segment_type(points, rest_segments[-1]['end_time'], points[-1].time)
            all_segments.append({
                'start_time': rest_segments[-1]['end_time'],
                'end_time': points[-1].time,
                'segment_type': seg_type,
                'is_technical': False
            })

    # If no rest segments found, create one segment for entire activity
    if not rest_segments:
        seg_type = auto_detect_segment_type(points, points[0].time, points[-1].time)
        all_segments.append({
            'start_time': points[0].time,
            'end_time': points[-1].time,
            'segment_type': seg_type,
            'is_technical': False
        })

    # Create user segments in database
    segment_objects = []
    # Use activity's terrain factor or default to 1.1 (Dirt Road)
    default_terrain_factor = activity.terrain_factor or 1.1

    for seg in all_segments:
        user_segment = models.UserSegment(
            activity_id=activity_id,
            segment_type=seg['segment_type'],
            start_time=seg['start_time'],
            end_time=seg['end_time'],
            is_technical=seg['is_technical'],
            terrain_factor=default_terrain_factor
        )
        segment_objects.append(user_segment)

    db.bulk_save_objects(segment_objects)
    db.commit()

    # Calculate energy for all non-technical segments
    for segment in segment_objects:
        db.refresh(segment)  # Refresh to get the ID
        calculate_segment_energy(segment, activity, db)

    db.commit()

    return {
        "message": f"Generated {len(segment_objects)} segments",
        "segments_created": len(segment_objects),
        "rest_segments": len(rest_segments),
        "inactive_points": inactive_count,
        "total_points": len(points)
    }


@router.post("/user-segments/{segment_id}/split", response_model=List[schemas.UserSegment])
def split_segment(
    segment_id: int,
    request: schemas.SplitSegmentRequest,
    db: Session = Depends(get_db)
):
    """
    Split a user segment into two segments at the specified time.
    Both segments inherit the parent's technical rating.
    """
    # Get the segment to split
    segment = db.query(models.UserSegment).filter(
        models.UserSegment.id == segment_id
    ).first()

    if not segment:
        raise HTTPException(status_code=404, detail="User segment not found")

    # Validate split time is within segment bounds
    if not (segment.start_time < request.split_time < segment.end_time):
        raise HTTPException(
            status_code=400,
            detail="Split time must be between segment start and end times"
        )

    # Get all points for recalculating segment types
    points = db.query(models.Point).filter(
        models.Point.activity_id == segment.activity_id,
        models.Point.is_removed == False
    ).order_by(models.Point.time).all()

    # Create first segment (start to split point)
    segment_type_1 = auto_detect_segment_type(points, segment.start_time, request.split_time)
    segment_1 = models.UserSegment(
        activity_id=segment.activity_id,
        segment_type=segment_type_1,
        start_time=segment.start_time,
        end_time=request.split_time,
        is_technical=segment.is_technical,
        difficulty=segment.difficulty,
        pitch_count=segment.pitch_count,
        is_roped=segment.is_roped,
        rappel_count=segment.rappel_count,
        terrain_factor=segment.terrain_factor,
        pack_weight_override_lbs=segment.pack_weight_override_lbs
    )

    # Create second segment (split point to end)
    segment_type_2 = auto_detect_segment_type(points, request.split_time, segment.end_time)
    segment_2 = models.UserSegment(
        activity_id=segment.activity_id,
        segment_type=segment_type_2,
        start_time=request.split_time,
        end_time=segment.end_time,
        is_technical=segment.is_technical,
        difficulty=segment.difficulty,
        pitch_count=segment.pitch_count,
        is_roped=segment.is_roped,
        rappel_count=segment.rappel_count,
        terrain_factor=segment.terrain_factor,
        pack_weight_override_lbs=segment.pack_weight_override_lbs
    )

    # Delete original segment and add new ones
    db.delete(segment)
    db.add(segment_1)
    db.add(segment_2)
    db.commit()
    db.refresh(segment_1)
    db.refresh(segment_2)

    # Calculate energy for both new segments
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == segment.activity_id
    ).first()
    if activity:
        calculate_segment_energy(segment_1, activity, db)
        calculate_segment_energy(segment_2, activity, db)
        db.commit()
        db.refresh(segment_1)
        db.refresh(segment_2)

    return [segment_1, segment_2]


@router.post("/user-segments/{segment_id}/merge-with-next", response_model=schemas.UserSegment)
def merge_with_next(
    segment_id: int,
    db: Session = Depends(get_db)
):
    """
    Merge current segment with the next segment.
    Merged segment inherits ALL metadata from the next segment (target).
    """
    # Get current segment
    current = db.query(models.UserSegment).filter(
        models.UserSegment.id == segment_id
    ).first()

    if not current:
        raise HTTPException(status_code=404, detail="User segment not found")

    # Get next segment (ordered by start_time)
    next_segment = db.query(models.UserSegment).filter(
        models.UserSegment.activity_id == current.activity_id,
        models.UserSegment.start_time > current.start_time
    ).order_by(models.UserSegment.start_time).first()

    if not next_segment:
        raise HTTPException(status_code=400, detail="No next segment to merge with")

    # Verify segments are adjacent
    if current.end_time != next_segment.start_time:
        raise HTTPException(
            status_code=400,
            detail="Segments must be adjacent to merge"
        )

    # Create merged segment inheriting next segment's metadata
    merged = models.UserSegment(
        activity_id=current.activity_id,
        segment_type=next_segment.segment_type,
        start_time=current.start_time,
        end_time=next_segment.end_time,
        is_technical=next_segment.is_technical,
        difficulty=next_segment.difficulty,
        pitch_count=next_segment.pitch_count,
        is_roped=next_segment.is_roped,
        rappel_count=next_segment.rappel_count,
        terrain_factor=next_segment.terrain_factor,
        pack_weight_override_lbs=next_segment.pack_weight_override_lbs
    )

    # Delete both segments and add merged one
    db.delete(current)
    db.delete(next_segment)
    db.add(merged)
    db.commit()
    db.refresh(merged)

    # Calculate energy for merged segment
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == merged.activity_id
    ).first()
    if activity:
        calculate_segment_energy(merged, activity, db)
        db.commit()
        db.refresh(merged)

    return merged


@router.post("/user-segments/{segment_id}/merge-with-previous", response_model=schemas.UserSegment)
def merge_with_previous(
    segment_id: int,
    db: Session = Depends(get_db)
):
    """
    Merge current segment with the previous segment.
    Merged segment inherits ALL metadata from the previous segment (target).
    """
    # Get current segment
    current = db.query(models.UserSegment).filter(
        models.UserSegment.id == segment_id
    ).first()

    if not current:
        raise HTTPException(status_code=404, detail="User segment not found")

    # Get previous segment (ordered by start_time)
    previous = db.query(models.UserSegment).filter(
        models.UserSegment.activity_id == current.activity_id,
        models.UserSegment.start_time < current.start_time
    ).order_by(models.UserSegment.start_time.desc()).first()

    if not previous:
        raise HTTPException(status_code=400, detail="No previous segment to merge with")

    # Verify segments are adjacent
    if previous.end_time != current.start_time:
        raise HTTPException(
            status_code=400,
            detail="Segments must be adjacent to merge"
        )

    # Create merged segment inheriting previous segment's metadata
    merged = models.UserSegment(
        activity_id=current.activity_id,
        segment_type=previous.segment_type,
        start_time=previous.start_time,
        end_time=current.end_time,
        is_technical=previous.is_technical,
        difficulty=previous.difficulty,
        pitch_count=previous.pitch_count,
        is_roped=previous.is_roped,
        rappel_count=previous.rappel_count,
        terrain_factor=previous.terrain_factor,
        pack_weight_override_lbs=previous.pack_weight_override_lbs
    )

    # Delete both segments and add merged one
    db.delete(current)
    db.delete(previous)
    db.add(merged)
    db.commit()
    db.refresh(merged)

    # Calculate energy for merged segment
    activity = db.query(models.Activity).filter(
        models.Activity.activity_id == merged.activity_id
    ).first()
    if activity:
        calculate_segment_energy(merged, activity, db)
        db.commit()
        db.refresh(merged)

    return merged


@router.patch("/user-segments/{segment_id}/adjust-boundary", response_model=schemas.UserSegment)
def adjust_boundary(
    segment_id: int,
    request: schemas.AdjustBoundaryRequest,
    db: Session = Depends(get_db)
):
    """
    Adjust the start or end boundary of a segment.
    Automatically adjusts the adjacent segment to maintain 100% coverage.
    """
    # Get the segment to adjust
    segment = db.query(models.UserSegment).filter(
        models.UserSegment.id == segment_id
    ).first()

    if not segment:
        raise HTTPException(status_code=404, detail="User segment not found")

    if request.boundary == "start":
        # Get previous segment
        previous = db.query(models.UserSegment).filter(
            models.UserSegment.activity_id == segment.activity_id,
            models.UserSegment.end_time == segment.start_time
        ).first()

        if not previous:
            raise HTTPException(
                status_code=400,
                detail="Cannot adjust start of first segment"
            )

        # Validate new time is between previous start and current end
        if not (previous.start_time < request.new_time < segment.end_time):
            raise HTTPException(
                status_code=400,
                detail="New start time must be between previous segment start and current segment end"
            )

        # Update boundaries
        previous.end_time = request.new_time
        segment.start_time = request.new_time

    elif request.boundary == "end":
        # Get next segment
        next_segment = db.query(models.UserSegment).filter(
            models.UserSegment.activity_id == segment.activity_id,
            models.UserSegment.start_time == segment.end_time
        ).first()

        if not next_segment:
            raise HTTPException(
                status_code=400,
                detail="Cannot adjust end of last segment"
            )

        # Validate new time is between current start and next end
        if not (segment.start_time < request.new_time < next_segment.end_time):
            raise HTTPException(
                status_code=400,
                detail="New end time must be between current segment start and next segment end"
            )

        # Update boundaries
        segment.end_time = request.new_time
        next_segment.start_time = request.new_time

    db.commit()
    db.refresh(segment)

    return segment
