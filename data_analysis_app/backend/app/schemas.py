"""Pydantic schemas for API request/response validation."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# Activity schemas
class ActivityBase(BaseModel):
    activity_name: Optional[str] = None
    activity_type: Optional[str] = None
    weight_carried_lbs: Optional[float] = None
    party_size: Optional[int] = None
    notes: Optional[str] = None


class ActivityCreate(ActivityBase):
    activity_id: str
    date: datetime
    start_time_utc: datetime
    start_time_local: Optional[datetime] = None
    timezone: Optional[str] = None


class ActivityUpdate(BaseModel):
    activity_name: Optional[str] = None
    weight_carried_lbs: Optional[float] = None
    party_size: Optional[int] = None
    notes: Optional[str] = None


class Activity(ActivityBase):
    id: int
    activity_id: str
    date: datetime
    start_time_utc: datetime
    start_time_local: Optional[datetime] = None
    timezone: Optional[str] = None
    total_duration_sec: Optional[float] = None
    total_distance_mi: Optional[float] = None
    total_elevation_gain_ft: Optional[float] = None
    total_elevation_loss_ft: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Point schemas
class PointBase(BaseModel):
    time: datetime
    lat: float
    lon: float
    elevation_m: float
    elevation_ft: float


class Point(PointBase):
    id: int
    activity_id: str
    is_removed: bool = False

    class Config:
        from_attributes = True


# Segment schemas
class SegmentBase(BaseModel):
    start_time: datetime
    end_time: datetime
    time_delta_sec: float
    horizontal_distance_mi: Optional[float] = None
    distance_3d_mi: Optional[float] = None
    elevation_delta_ft: Optional[float] = None
    speed_mph: Optional[float] = None
    pace_min_per_mi: Optional[float] = None
    grade_percent: Optional[float] = None


class Segment(SegmentBase):
    id: int
    activity_id: str
    start_point_id: int
    end_point_id: int

    class Config:
        from_attributes = True


# User Segment schemas
class UserSegmentBase(BaseModel):
    segment_type: str = Field(..., pattern="^(climb|descent|flat|rest)$")
    start_time: datetime
    end_time: datetime
    is_technical: bool = False
    difficulty: Optional[str] = None
    pitch_count: Optional[int] = None
    is_roped: Optional[bool] = None
    rappel_count: Optional[int] = None


class UserSegmentCreate(UserSegmentBase):
    pass


class UserSegmentUpdate(BaseModel):
    segment_type: Optional[str] = Field(None, pattern="^(climb|descent|flat|rest)$")
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_technical: Optional[bool] = None
    difficulty: Optional[str] = None
    pitch_count: Optional[int] = None
    is_roped: Optional[bool] = None
    rappel_count: Optional[int] = None


class UserSegment(UserSegmentBase):
    id: int
    activity_id: str

    class Config:
        from_attributes = True


# Request/Response schemas
class TimeRange(BaseModel):
    start: datetime
    end: datetime


class RemovePointsRequest(BaseModel):
    time_range: TimeRange


class RestorePointsRequest(BaseModel):
    point_ids: List[int]


class SummaryStats(BaseModel):
    total_activities: int
    total_distance_mi: float
    total_elevation_gain_ft: float
    days_since_last_activity: Optional[int] = None


class GPXUploadResponse(BaseModel):
    activity_id: str
    status: str
    points_count: int
    message: str
