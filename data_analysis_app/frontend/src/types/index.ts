/**
 * TypeScript type definitions for the Garmin Data Analysis app.
 * These types mirror the Pydantic schemas from the backend API.
 */

export interface Activity {
  id: number;
  activity_id: string;
  activity_name: string | null;
  activity_type: string | null;
  date: string;
  start_time_utc: string;
  start_time_local: string | null;
  timezone: string | null;
  total_duration_sec: number | null;
  total_distance_mi: number | null;
  total_elevation_gain_ft: number | null;
  total_elevation_loss_ft: number | null;
  weight_carried_lbs: number | null;
  party_size: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Point {
  id: number;
  activity_id: string;
  time: string;
  lat: number;
  lon: number;
  elevation_m: number;
  elevation_ft: number;
  is_removed: boolean;
}

export interface Segment {
  id: number;
  activity_id: string;
  start_point_id: number;
  end_point_id: number;
  start_time: string;
  end_time: string;
  time_delta_sec: number;
  horizontal_distance_mi: number | null;
  distance_3d_mi: number | null;
  elevation_delta_ft: number | null;
  speed_mph: number | null;
  pace_min_per_mi: number | null;
  grade_percent: number | null;
}

export interface UserSegment {
  id: number;
  activity_id: string;
  segment_type: 'climb' | 'descent' | 'flat' | 'rest';
  start_time: string;
  end_time: string;
  is_technical: boolean;
  difficulty: string | null;
  pitch_count: number | null;
  is_roped: boolean | null;
  rappel_count: number | null;
}

export interface SummaryStats {
  total_activities: number;
  total_distance_mi: number;
  total_elevation_gain_ft: number;
  days_since_last_activity: number | null;
}

export interface TimeRange {
  start: string;
  end: string;
}

export interface RemovePointsRequest {
  time_range: TimeRange;
}

export interface RestorePointsRequest {
  point_ids: number[];
}

export interface ActivityUpdate {
  activity_name?: string;
  weight_carried_lbs?: number;
  party_size?: number;
  notes?: string;
}

export interface UserSegmentCreate {
  segment_type: 'climb' | 'descent' | 'flat' | 'rest';
  start_time: string;
  end_time: string;
  is_technical: boolean;
  difficulty?: string;
  pitch_count?: number;
  is_roped?: boolean;
  rappel_count?: number;
}

export interface UserSegmentUpdate {
  segment_type?: 'climb' | 'descent' | 'flat' | 'rest';
  start_time?: string;
  end_time?: string;
  is_technical?: boolean;
  difficulty?: string;
  pitch_count?: number;
  is_roped?: boolean;
  rappel_count?: number;
}
