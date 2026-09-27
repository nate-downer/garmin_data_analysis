"""SQLAlchemy ORM models for the Garmin data analysis app."""
from datetime import datetime
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, Index
)
from sqlalchemy.orm import relationship
from .database import Base


class Activity(Base):
    """Activity metadata and aggregate statistics."""
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(String, unique=True, nullable=False, index=True)
    activity_name = Column(String)
    activity_type = Column(String)
    date = Column(DateTime, nullable=False)
    start_time_utc = Column(DateTime, nullable=False)
    start_time_local = Column(DateTime)
    timezone = Column(String)

    # Cached aggregate stats (calculated from segments)
    total_duration_sec = Column(Float)
    total_distance_mi = Column(Float)
    total_elevation_gain_ft = Column(Float)
    total_elevation_loss_ft = Column(Float)

    # User metadata
    weight_carried_lbs = Column(Float)
    party_size = Column(Integer)
    notes = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    points = relationship("Point", back_populates="activity", cascade="all, delete-orphan")
    segments = relationship("Segment", back_populates="activity", cascade="all, delete-orphan")
    user_segments = relationship("UserSegment", back_populates="activity", cascade="all, delete-orphan")


class Point(Base):
    """GPS point from GPX file."""
    __tablename__ = "points"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(String, ForeignKey("activities.activity_id", ondelete="CASCADE"), nullable=False)
    time = Column(DateTime, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    elevation_m = Column(Float, nullable=False)
    elevation_ft = Column(Float, nullable=False)

    # User edit flag (soft delete)
    is_removed = Column(Boolean, default=False)

    # Relationships
    activity = relationship("Activity", back_populates="points")

    # Define composite index
    __table_args__ = (
        Index('idx_points_activity_time', 'activity_id', 'time'),
    )


class Segment(Base):
    """Calculated segment between consecutive GPS points."""
    __tablename__ = "segments"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(String, ForeignKey("activities.activity_id", ondelete="CASCADE"), nullable=False)

    # Start/end references
    start_point_id = Column(Integer, ForeignKey("points.id", ondelete="CASCADE"), nullable=False)
    end_point_id = Column(Integer, ForeignKey("points.id", ondelete="CASCADE"), nullable=False)

    # Time
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    time_delta_sec = Column(Float, nullable=False)

    # Distance
    horizontal_distance_mi = Column(Float)
    distance_3d_mi = Column(Float)

    # Elevation
    elevation_delta_ft = Column(Float)

    # Calculated metrics
    speed_mph = Column(Float)
    pace_min_per_mi = Column(Float)
    grade_percent = Column(Float)

    # Relationships
    activity = relationship("Activity", back_populates="segments")

    __table_args__ = (
        Index('idx_segments_activity', 'activity_id'),
    )


class UserSegment(Base):
    """User-defined segment (manual terrain annotation)."""
    __tablename__ = "user_segments"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(String, ForeignKey("activities.activity_id", ondelete="CASCADE"), nullable=False)
    segment_type = Column(String, nullable=False)  # 'climb', 'descent', 'flat', 'rest'
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)

    # Technical climb metadata
    is_technical = Column(Boolean, default=False)
    difficulty = Column(String)  # e.g. "5.10a"
    pitch_count = Column(Integer)  # Number of pitches for technical climbs
    is_roped = Column(Boolean)

    # Technical descent metadata
    rappel_count = Column(Integer)

    # Relationships
    activity = relationship("Activity", back_populates="user_segments")

    __table_args__ = (
        Index('idx_user_segments_activity', 'activity_id'),
    )
