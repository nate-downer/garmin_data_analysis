"""Re-import points and segments with proper activity_id handling."""
import pandas as pd
from pathlib import Path
from app.database import SessionLocal
from app.models import Point, Segment

# Paths to CSV files
CSV_DIR = Path(__file__).parent.parent.parent / "data_pipeline" / "clean_data"
POINTS_CSV = CSV_DIR / "long_points_data.csv"
SEGMENTS_CSV = CSV_DIR / "long_segments_data.csv"

def reimport_data():
    """Re-import points and segments with correct data types."""
    print("Re-importing points and segments...")

    db = SessionLocal()

    try:
        # Load points CSV
        print(f"\nLoading points from {POINTS_CSV}...")
        points_df = pd.read_csv(POINTS_CSV, dtype={'activity_id': str})
        points_df['time'] = pd.to_datetime(points_df['time'])
        print(f"Found {len(points_df)} points")

        # Get unique activity IDs from database to validate
        from app.models import Activity
        valid_activity_ids = set([a.activity_id for a in db.query(Activity).all()])
        print(f"Found {len(valid_activity_ids)} activities in database")

        # Import points in batches
        print("\nImporting points...")
        point_count = 0
        batch_size = 5000

        for i in range(0, len(points_df), batch_size):
            batch = points_df.iloc[i:i+batch_size]
            point_objects = []

            for _, row in batch.iterrows():
                activity_id = str(row['activity_id'])  # Ensure string

                if activity_id not in valid_activity_ids:
                    continue  # Skip points for non-existent activities

                point = Point(
                    activity_id=activity_id,
                    time=row['time'],
                    lat=float(row['lat']),
                    lon=float(row['lon']),
                    elevation_m=float(row.get('elevation_m', row.get('elevation', 0) / 3.28084)),
                    elevation_ft=float(row.get('elevation_ft', row.get('elevation', 0))),
                    is_removed=False
                )
                point_objects.append(point)

            db.bulk_save_objects(point_objects)
            db.commit()
            point_count += len(point_objects)

            if point_count % 10000 == 0:
                print(f"  Imported {point_count} points...")

        print(f"\n✓ Imported {point_count} points")

        # Load segments CSV
        print(f"\nLoading segments from {SEGMENTS_CSV}...")
        segments_df = pd.read_csv(SEGMENTS_CSV, dtype={'activity_id': str})
        segments_df['start_time'] = pd.to_datetime(segments_df['start_time'])
        segments_df['end_time'] = pd.to_datetime(segments_df['end_time'])
        print(f"Found {len(segments_df)} segments")

        # Import segments in batches
        print("\nImporting segments...")
        segment_count = 0

        for activity_id in valid_activity_ids:
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
                    activity_id=str(activity_id),
                    start_point_id=points_list[i].id,
                    end_point_id=points_list[i + 1].id,
                    start_time=row['start_time'],
                    end_time=row['end_time'],
                    time_delta_sec=float(row.get('time_delta_sec', 0)),
                    horizontal_distance_mi=float(row.get('horizontal_distance_mi', 0)) if pd.notna(row.get('horizontal_distance_mi')) else None,
                    distance_3d_mi=float(row.get('distance_3d_mi', 0)) if pd.notna(row.get('distance_3d_mi')) else None,
                    elevation_delta_ft=float(row.get('elevation_delta_ft', 0)) if pd.notna(row.get('elevation_delta_ft')) else None,
                    speed_mph=float(row.get('speed_mph', 0)) if pd.notna(row.get('speed_mph')) else None,
                    pace_min_per_mi=float(row.get('pace_min_per_mi', 0)) if pd.notna(row.get('pace_min_per_mi')) else None,
                    grade_percent=float(row.get('grade_percent', 0)) if pd.notna(row.get('grade_percent')) else None
                )
                segment_objects.append(segment)

            db.bulk_save_objects(segment_objects)
            db.commit()
            segment_count += len(segment_objects)

            if segment_count % 1000 == 0:
                print(f"  Imported {segment_count} segments...")

        print(f"\n✓ Imported {segment_count} segments")
        print("\n" + "="*50)
        print("✓ Re-import completed successfully!")
        print("="*50)

    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    reimport_data()
