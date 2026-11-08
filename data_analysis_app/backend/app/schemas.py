"""Pydantic schemas for API request/response validation."""
from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field

ExperienceLevel = Literal[
    "New Route + New Skills",
    "New Route - Familiar Skills",
    "Somewhat Familiar Route",
    "Familiar Route",
]

ClimbDifficulty = Literal[
    "3rd Class",
    "4th Class",
    "5th Easy",
    "5th Moderate",
    "5th Hard",
]

# The 3 values the modeling pipeline actually distinguishes (is_hiking/is_running
# dummies, relative to "mountaineering" as the baseline - see modeling/data.py).
# Restricted only on the write path (ActivityUpdate) - the read path
# (ActivityBase/Activity) stays a plain str since historical rows were populated
# straight from each GPX file's own track-type tag and could carry other values.
ActivityType = Literal["hiking", "running", "mountaineering"]


# Activity schemas
class ActivityBase(BaseModel):
    activity_name: Optional[str] = None
    activity_type: Optional[str] = None
    body_weight_lbs: Optional[float] = None
    weight_carried_lbs: Optional[float] = None
    terrain_factor: Optional[float] = None
    party_size: Optional[int] = None
    notes: Optional[str] = None
    is_planned: Optional[bool] = None
    experience_level: Optional[ExperienceLevel] = None
    is_public: Optional[bool] = None


class ActivityCreate(ActivityBase):
    activity_id: str
    date: datetime
    start_time_utc: datetime
    start_time_local: Optional[datetime] = None
    timezone: Optional[str] = None


class ActivityUpdate(BaseModel):
    activity_name: Optional[str] = None
    activity_type: Optional[ActivityType] = None
    body_weight_lbs: Optional[float] = None
    weight_carried_lbs: Optional[float] = None
    terrain_factor: Optional[float] = None
    party_size: Optional[int] = None
    notes: Optional[str] = None
    is_planned: Optional[bool] = None
    experience_level: Optional[ExperienceLevel] = None
    predicted_total_duration_sec: Optional[float] = None
    # Only settable for planned routes - shifts every point/segment time by the same delta
    start_time_local: Optional[datetime] = None
    is_public: Optional[bool] = None


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
    predicted_total_duration_sec: Optional[float] = None
    is_planned: bool = False
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
    is_inactive: bool = False

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
    # Loose on purpose: this base is also used for the response/read schemas
    # (UserSegment, UserSegmentWithActivity), which must still be able to serialize
    # older free-text values ("5.6", "5.10a", ...) saved before the fixed dropdown
    # existed. The 5-value restriction is enforced on write only - see
    # UserSegmentCreate/UserSegmentUpdate below.
    difficulty: Optional[str] = None
    pitch_count: Optional[int] = None
    is_roped: Optional[bool] = None
    rappel_count: Optional[int] = None
    terrain_factor: Optional[float] = None
    pack_weight_override_lbs: Optional[float] = None


class UserSegmentCreate(UserSegmentBase):
    difficulty: Optional[ClimbDifficulty] = None


class UserSegmentUpdate(BaseModel):
    segment_type: Optional[str] = Field(None, pattern="^(climb|descent|flat|rest)$")
    # start_time and end_time removed - use adjust-boundary endpoint instead
    is_technical: Optional[bool] = None
    difficulty: Optional[ClimbDifficulty] = None
    pitch_count: Optional[int] = None
    is_roped: Optional[bool] = None
    rappel_count: Optional[int] = None
    terrain_factor: Optional[float] = None
    pack_weight_override_lbs: Optional[float] = None


class UserSegment(UserSegmentBase):
    id: int
    activity_id: str
    avg_power_watts: Optional[float] = None
    total_energy_kcal: Optional[float] = None
    energy_calculation_error: Optional[str] = None

    class Config:
        from_attributes = True


class UserSegmentWithActivity(UserSegment):
    """User segment with activity context and calculated metrics."""
    # Activity context
    activity_name: Optional[str] = None
    activity_date: datetime

    # Calculated metrics
    duration_sec: float
    distance_mi: Optional[float] = None
    avg_speed_mph: Optional[float] = None
    avg_grade_percent: Optional[float] = None
    climb_rate_ft_per_hr: Optional[float] = None
    elevation_gain_ft: Optional[float] = None


class SplitSegmentRequest(BaseModel):
    split_time: datetime


class AdjustBoundaryRequest(BaseModel):
    boundary: str = Field(..., pattern="^(start|end)$")
    new_time: datetime


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
