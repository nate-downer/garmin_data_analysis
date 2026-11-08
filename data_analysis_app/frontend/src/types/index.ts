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
  predicted_total_duration_sec: number | null;
  body_weight_lbs: number | null;
  weight_carried_lbs: number | null;
  terrain_factor: number | null;
  party_size: number | null;
  notes: string | null;
  is_planned: boolean;
  experience_level: string | null;
  is_public: boolean;
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
  is_inactive: boolean;
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
  terrain_factor: number | null;
  pack_weight_override_lbs: number | null;
  avg_power_watts: number | null;
  total_energy_kcal: number | null;
  energy_calculation_error: string | null;
}

export interface UserSegmentWithActivity extends UserSegment {
  // Activity context
  activity_name: string | null;
  activity_date: string;

  // Calculated metrics
  duration_sec: number;
  distance_mi: number | null;
  avg_speed_mph: number | null;
  avg_grade_percent: number | null;
  climb_rate_ft_per_hr: number | null;
  elevation_gain_ft: number | null;
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
  activity_type?: string;
  body_weight_lbs?: number;
  weight_carried_lbs?: number;
  terrain_factor?: number;
  party_size?: number;
  notes?: string;
  is_planned?: boolean;
  experience_level?: string;
  predicted_total_duration_sec?: number;
  // Only settable for planned routes - shifts every point/segment time by the same delta
  start_time_local?: string;
  is_public?: boolean;
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
  terrain_factor?: number;
  pack_weight_override_lbs?: number;
}

export interface UserSegmentUpdate {
  segment_type?: 'climb' | 'descent' | 'flat' | 'rest';
  // start_time and end_time removed - use adjustBoundary API instead
  is_technical?: boolean;
  difficulty?: string;
  pitch_count?: number;
  is_roped?: boolean;
  rappel_count?: number;
  terrain_factor?: number;
  pack_weight_override_lbs?: number;
}

// Model fitting (Milestone 0.7 - hierarchical Bayesian time-prediction models)
export interface FitStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  step_index: number;
  step_label: string | null;
  total_steps: number;
  error: string | null;
  updated_at: string | null;
  run_id: string | null;
}

export interface ModelRunSummary {
  run_id: string;
  created_at: string;
  n_activities_total: number;
  n_recent_activities_filter: number | null;
  rmse_pct: Record<string, number>;
  is_predictable: boolean;
}

// Time prediction (Milestone 0.8 - predicting planned routes)
export interface PredictionRequest {
  run_id: string;
  start_time: string;
  body_weight_lbs: number;
  pack_weight_lbs: number;
  party_size: number;
  experience_level: string;
}

export interface PredictionSegmentResult {
  segment_id: number;
  segment_type_5: string;
  distance_mi: number;
  elevation_gain_ft: number;
  mean_predicted_min: number;
  draws_min: number[];
}

export interface PredictionCumulativePoint {
  cumulative_distance_mi: number;
  cumulative_time_min: number;
  kind: 'start' | 'segment' | 'rest';
  label: string;
  elevation_ft: number;
}

export interface ActualCumulativePoint {
  cumulative_distance_mi: number;
  cumulative_time_min: number;
  kind: 'start' | 'segment' | 'rest';
  label: string;
}

export interface PredictionResult {
  segments: PredictionSegmentResult[];
  total_mean_min: number;
  active_mean_min: number;
  rest_mean_min: number;
  summit_time: string | null;
  finish_time: string;
  active_distribution_min: number[];
  total_distribution_min: number[];
  cumulative_points: PredictionCumulativePoint[];
  summit_time_of_day_min: number[] | null;
  summit_mean_time_of_day_min: number | null;
  finish_time_of_day_min: number[];
  finish_mean_time_of_day_min: number;
  sunrise_time_of_day_min: number | null;
  sunset_time_of_day_min: number | null;
  actual_total_min: number | null;
  actual_summit_time_of_day_min: number | null;
  actual_finish_time_of_day_min: number | null;
  actual_cumulative_points: ActualCumulativePoint[] | null;
}

export interface VarianceExplainedEntry {
  variable: string;
  label: string;
  median_pct: number;
  low_pct: number;
  high_pct: number;
  // Optional: absent on runs fitted before this field existed.
  coefficient_median?: number;
  coefficient_low?: number;
  coefficient_high?: number;
}

export interface PredictedVsActualPoint {
  label: string;
  activity_name: string;
  predicted_min: number;
  actual_min: number;
}

export interface ModelDiagnostics {
  label: string;
  n_segments: number;
  r_squared: number;
  rmse_min: number;
  rmse_pct_of_mean: number;
  variance_explained: VarianceExplainedEntry[];
  predicted_vs_actual: PredictedVsActualPoint[];
}

export type AllModelDiagnostics = Record<string, ModelDiagnostics>;

export const MODEL_GROUP_ORDER = [
  'technical_climb',
  'nontechnical_climb',
  'flat',
  'nontechnical_descent',
  'technical_descent',
  'rest',
] as const;

// Terrain factor constants for Pandolf equation
export const TERRAIN_FACTORS = {
  'Paved Road': 1.0,
  'Dirt Road': 1.1,
  'Light Brush': 1.2,
  'Heavy Brush': 1.5,
  'Swampy Bog': 1.8,
  'Loose Sand': 2.1,
} as const;

// Route/skill familiarity levels - shared covariate in the pooled time-prediction model
export const EXPERIENCE_LEVELS = [
  'New Route + New Skills',
  'New Route - Familiar Skills',
  'Somewhat Familiar Route',
  'Familiar Route',
] as const;

// Technical climb difficulty levels - covariate in the pooled time-prediction model
export const CLIMB_DIFFICULTIES = [
  '3rd Class',
  '4th Class',
  '5th Easy',
  '5th Moderate',
  '5th Hard',
] as const;

// The 3 values the time-prediction model actually distinguishes (is_hiking/
// is_running dummies, relative to "mountaineering" as the baseline)
export const ACTIVITY_TYPES = [
  'hiking',
  'running',
  'mountaineering',
] as const;
