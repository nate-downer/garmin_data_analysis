"""GPX upload and processing API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime
import tempfile
import os
from .. import models, schemas
from ..database import get_db
from ..services.gpx_parser import parse_gpx_file
from ..services.calculations import calculate_segments, aggregate_activity_stats
from ..services.timezone import lookup_timezone, convert_to_local_time

router = APIRouter()


@router.post("/upload", response_model=schemas.GPXUploadResponse)
async def upload_gpx(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload and process GPX file.

    Steps:
    1. Parse GPX file
    2. Lookup timezone from first point
    3. Convert timestamps to local time
    4. Store raw points in database
    5. Calculate segments
    6. Store activity metadata
    """
    # Validate file type
    if not file.filename.endswith('.gpx'):
        raise HTTPException(status_code=400, detail="File must be a GPX file")

    try:
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix='.gpx') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name

        # Parse GPX file
        points_df, metadata = parse_gpx_file(tmp_file_path)

        # Clean up temp file
        os.unlink(tmp_file_path)

        if points_df.empty:
            raise HTTPException(status_code=400, detail="No GPS points found in GPX file")

        # Check if activity already exists
        existing_activity = db.query(models.Activity).filter(
            models.Activity.activity_id == metadata['activity_id']
        ).first()

        if existing_activity:
            raise HTTPException(
                status_code=409,
                detail=f"Activity {metadata['activity_id']} already exists"
            )

        # Lookup timezone from first point
        first_point = points_df.iloc[0]
        timezone_str = lookup_timezone(first_point['lat'], first_point['lon'])

        # Convert start time to local time
        start_time_local = convert_to_local_time(metadata['start_time_utc'], timezone_str)

        # Calculate segments
        segments_df = calculate_segments(points_df)

        # Aggregate activity stats
        stats = aggregate_activity_stats(segments_df)

        # Create activity record
        activity = models.Activity(
            activity_id=metadata['activity_id'],
            activity_name=metadata['activity_name'],
            activity_type=metadata['activity_type'],
            date=metadata['date'],
            start_time_utc=metadata['start_time_utc'],
            start_time_local=start_time_local,
            timezone=timezone_str,
            total_duration_sec=stats['total_duration_sec'],
            total_distance_mi=stats['total_distance_mi'],
            total_elevation_gain_ft=stats['total_elevation_gain_ft'],
            total_elevation_loss_ft=stats['total_elevation_loss_ft']
        )

        db.add(activity)
        db.flush()  # Flush to get activity ID before adding points

        # Store points
        point_objects = []
        for _, row in points_df.iterrows():
            point = models.Point(
                activity_id=metadata['activity_id'],
                time=row['time'],
                lat=row['lat'],
                lon=row['lon'],
                elevation_m=row['elevation_m'],
                elevation_ft=row['elevation_ft'],
                is_removed=False
            )
            point_objects.append(point)

        db.bulk_save_objects(point_objects)

        # Store segments
        if not segments_df.empty:
            # Get point IDs for segment references
            points_list = db.query(models.Point).filter(
                models.Point.activity_id == metadata['activity_id']
            ).order_by(models.Point.time).all()

            segment_objects = []
            for i, row in segments_df.iterrows():
                if i < len(points_list) - 1:
                    segment = models.Segment(
                        activity_id=metadata['activity_id'],
                        start_point_id=points_list[i].id,
                        end_point_id=points_list[i + 1].id,
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

        db.commit()

        return schemas.GPXUploadResponse(
            activity_id=metadata['activity_id'],
            status="success",
            points_count=len(points_df),
            message=f"Activity '{metadata['activity_name']}' uploaded successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing GPX file: {str(e)}")
