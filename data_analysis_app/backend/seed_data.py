"""Seed script to import existing data from R pipeline CSVs into SQLite database."""
import sys
import pandas as pd
from pathlib import Path
from datetime import datetime
from app.database import SessionLocal, engine, Base
from app.models import Activity, Point, Segment
from app.services.timezone import lookup_timezone, convert_to_local_time

# Paths to CSV files (relative to repo root)
CSV_DIR = Path(__file__).parent.parent.parent / "data_pipeline" / "clean_data"
ACTIVITY_METADATA_CSV = CSV_DIR / "activity_metadata.csv"
POINTS_CSV = CSV_DIR / "long_points_data.csv"
SEGMENTS_CSV = CSV_DIR / "long_segments_data.csv"


def parse_datetime(date_str):
    """Parse datetime string from R CSV."""
    try:
        # Try parsing with timezone info
        return pd.to_datetime(date_str)
    except:
        return None


def seed_database():
    """Import data from R pipeline CSVs."""
    print("Starting database seed...")

    # Create tables
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    # Create session
    db = SessionLocal()

    try:
        # Check if data already exists
        existing_count = db.query(Activity).count()
        if existing_count > 0:
            response = input(f"Database already contains {existing_count} activities. Continue and add more? (y/n): ")
            if response.lower() != 'y':
                print("Seed cancelled.")
                return

        # Load activity metadata
        print(f"\nLoading activity metadata from {ACTIVITY_METADATA_CSV}...")
        if not ACTIVITY_METADATA_CSV.exists():
            print(f"ERROR: File not found: {ACTIVITY_METADATA_CSV}")
            print("Make sure you've run the R pipeline to generate CSV files.")
            return

        metadata_df = pd.read_csv(ACTIVITY_METADATA_CSV)
        print(f"Found {len(metadata_df)} activities")

        # Load points
        print(f"\nLoading points from {POINTS_CSV}...")
        if not POINTS_CSV.exists():
            print(f"ERROR: File not found: {POINTS_CSV}")
            return

        points_df = pd.read_csv(POINTS_CSV)
        points_df['time'] = pd.to_datetime(points_df['time'])
        print(f"Found {len(points_df)} points")

        # Load segments (optional)
        segments_df = None
        if SEGMENTS_CSV.exists():
            print(f"\nLoading segments from {SEGMENTS_CSV}...")
            segments_df = pd.read_csv(SEGMENTS_CSV)
            segments_df['start_time'] = pd.to_datetime(segments_df['start_time'])
            segments_df['end_time'] = pd.to_datetime(segments_df['end_time'])
            print(f"Found {len(segments_df)} segments")

        # Import activities
        print("\nImporting activities...")
        for _, row in metadata_df.iterrows():
            activity_id = row['activity_id']

            # Check if activity already exists
            existing = db.query(Activity).filter(Activity.activity_id == activity_id).first()
            if existing:
                print(f"  Skipping {activity_id} (already exists)")
                continue

            # Parse dates
            start_time_utc = parse_datetime(row.get('start_time_utc'))
            if not start_time_utc:
                print(f"  WARNING: No start time for {activity_id}, using date")
                date_val = pd.to_datetime(row['date'])
                start_time_utc = datetime.combine(date_val.date(), datetime.min.time())

            # Get first point for this activity to lookup timezone
            activity_points = points_df[points_df['activity_id'] == activity_id]
            if not activity_points.empty:
                first_point = activity_points.iloc[0]
                timezone_str = lookup_timezone(first_point['lat'], first_point['lon'])
                start_time_local = convert_to_local_time(start_time_utc, timezone_str)
            else:
                timezone_str = "UTC"
                start_time_local = start_time_utc

            # Create activity
            activity = Activity(
                activity_id=activity_id,
                activity_name=row.get('activity_name', activity_id),
                activity_type=row.get('activity_type', 'hiking'),
                date=pd.to_datetime(row['date']),
                start_time_utc=start_time_utc,
                start_time_local=start_time_local,
                timezone=timezone_str,
                total_duration_sec=row.get('total_duration_sec'),
                total_distance_mi=row.get('total_distance_mi'),
                total_elevation_gain_ft=row.get('total_elevation_gain_ft'),
                total_elevation_loss_ft=row.get('total_elevation_loss_ft')
            )

            db.add(activity)
            print(f"  ✓ Added activity: {activity_id}")

        db.commit()
        print(f"\n✓ Imported {len(metadata_df)} activities")

        # Import points
        print("\nImporting points...")
        point_count = 0
        for activity_id in metadata_df['activity_id'].unique():
            activity_points = points_df[points_df['activity_id'] == activity_id]

            if activity_points.empty:
                continue

            point_objects = []
            for _, row in activity_points.iterrows():
                point = Point(
                    activity_id=activity_id,
                    time=row['time'],
                    lat=row['lat'],
                    lon=row['lon'],
                    elevation_m=row.get('elevation_m', row.get('elevation', 0) / 3.28084),
                    elevation_ft=row.get('elevation_ft', row.get('elevation', 0)),
                    is_removed=False
                )
                point_objects.append(point)

            db.bulk_save_objects(point_objects)
            point_count += len(point_objects)

            if point_count % 10000 == 0:
                print(f"  Imported {point_count} points...")

        db.commit()
        print(f"\n✓ Imported {point_count} points")

        # Import segments (if available)
        if segments_df is not None:
            print("\nImporting segments...")
            segment_count = 0

            for activity_id in metadata_df['activity_id'].unique():
                activity_segments = segments_df[segments_df['activity_id'] == activity_id]

                if activity_segments.empty:
                    continue

                # Get points for this activity to create foreign key references
                points_list = db.query(Point).filter(
                    Point.activity_id == activity_id
                ).order_by(Point.time).all()

                if len(points_list) < 2:
                    continue

                segment_objects = []
                for i, row in activity_segments.iterrows():
                    if i >= len(points_list) - 1:
                        break

                    segment = Segment(
                        activity_id=activity_id,
                        start_point_id=points_list[i].id,
                        end_point_id=points_list[i + 1].id,
                        start_time=row['start_time'],
                        end_time=row['end_time'],
                        time_delta_sec=row.get('time_delta_sec', 0),
                        horizontal_distance_mi=row.get('horizontal_distance_mi'),
                        distance_3d_mi=row.get('distance_3d_mi'),
                        elevation_delta_ft=row.get('elevation_delta_ft'),
                        speed_mph=row.get('speed_mph'),
                        pace_min_per_mi=row.get('pace_min_per_mi'),
                        grade_percent=row.get('grade_percent')
                    )
                    segment_objects.append(segment)

                db.bulk_save_objects(segment_objects)
                segment_count += len(segment_objects)

                if segment_count % 10000 == 0:
                    print(f"  Imported {segment_count} segments...")

            db.commit()
            print(f"\n✓ Imported {segment_count} segments")

        print("\n" + "="*50)
        print("✓ Database seed completed successfully!")
        print("="*50)
        print(f"\nYou can now start the API server:")
        print("  uvicorn app.main:app --reload")

    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
