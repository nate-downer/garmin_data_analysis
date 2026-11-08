/**
 * API client for communicating with the FastAPI backend.
 * Uses axios for HTTP requests.
 */
import axios from 'axios';
import type {
  Activity,
  Point,
  Segment,
  UserSegment,
  UserSegmentWithActivity,
  SummaryStats,
  RemovePointsRequest,
  RestorePointsRequest,
  ActivityUpdate,
  UserSegmentCreate,
  UserSegmentUpdate,
  FitStatus,
  AllModelDiagnostics,
  ModelRunSummary,
  PredictionRequest,
  PredictionResult,
} from '../types';

// Base API URL - reads from environment variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Required for the signed session cookie (login) to be sent/received at all.
  withCredentials: true,
});

// Activities API
export const activitiesAPI = {
  // List all activities
  list: async (): Promise<Activity[]> => {
    const response = await apiClient.get<Activity[]>('/activities');
    return response.data;
  },

  // Get single activity
  get: async (activityId: string): Promise<Activity> => {
    const response = await apiClient.get<Activity>(`/activities/${activityId}`);
    return response.data;
  },

  // Update activity metadata
  update: async (activityId: string, data: ActivityUpdate): Promise<Activity> => {
    const response = await apiClient.patch<Activity>(`/activities/${activityId}`, data);
    return response.data;
  },

  // Delete activity
  delete: async (activityId: string): Promise<void> => {
    await apiClient.delete(`/activities/${activityId}`);
  },

  // Get summary stats
  getSummaryStats: async (): Promise<SummaryStats> => {
    const response = await apiClient.get<SummaryStats>('/activities/stats/summary');
    return response.data;
  },
};

// Points API
export const pointsAPI = {
  // Get all points for an activity
  list: async (activityId: string, includeRemoved: boolean = false): Promise<Point[]> => {
    const response = await apiClient.get<Point[]>(`/activities/${activityId}/points`, {
      params: { include_removed: includeRemoved },
    });
    return response.data;
  },

  // Get decimated points for rendering
  getDecimated: async (
    activityId: string,
    maxPoints: number = 1000,
    includeRemoved: boolean = false
  ): Promise<Point[]> => {
    const response = await apiClient.get<Point[]>(`/activities/${activityId}/points/decimated`, {
      params: { max_points: maxPoints, include_removed: includeRemoved },
    });
    return response.data;
  },

  // Remove points in time range
  remove: async (activityId: string, request: RemovePointsRequest): Promise<any> => {
    const response = await apiClient.delete(`/activities/${activityId}/points`, { data: request });
    return response.data;
  },

  // Restore removed points
  restore: async (activityId: string, request: RestorePointsRequest): Promise<void> => {
    await apiClient.post(`/activities/${activityId}/points/restore`, request);
  },
};

// Segments API
export const segmentsAPI = {
  // Get calculated segments
  list: async (activityId: string): Promise<Segment[]> => {
    const response = await apiClient.get<Segment[]>(`/activities/${activityId}/segments`);
    return response.data;
  },

  // Recalculate segments after point edits
  recalculate: async (activityId: string): Promise<any> => {
    const response = await apiClient.post(`/activities/${activityId}/segments/recalculate`);
    return response.data;
  },
};

// User Segments API
export const userSegmentsAPI = {
  // List user-defined segments for a specific activity
  list: async (activityId: string): Promise<UserSegment[]> => {
    const response = await apiClient.get<UserSegment[]>(`/activities/${activityId}/user-segments`);
    return response.data;
  },

  // List all user segments across all activities with enriched data
  listAll: async (segmentType?: string): Promise<UserSegmentWithActivity[]> => {
    const params = segmentType ? { segment_type: segmentType } : {};
    const response = await apiClient.get<UserSegmentWithActivity[]>('/user-segments', { params });
    return response.data;
  },

  // Create user segment
  create: async (activityId: string, data: UserSegmentCreate): Promise<UserSegment> => {
    const response = await apiClient.post<UserSegment>(
      `/activities/${activityId}/user-segments`,
      data
    );
    return response.data;
  },

  // Update user segment
  update: async (segmentId: number, data: UserSegmentUpdate): Promise<UserSegment> => {
    const response = await apiClient.put<UserSegment>(`/user-segments/${segmentId}`, data);
    return response.data;
  },

  // Delete user segment
  delete: async (segmentId: number): Promise<void> => {
    await apiClient.delete(`/user-segments/${segmentId}`);
  },

  // Generate segments automatically
  generate: async (activityId: string, force: boolean = false): Promise<any> => {
    const response = await apiClient.post(`/activities/${activityId}/segments/generate`, null, {
      params: { force },
      timeout: 120000 // 120 second timeout for segment generation
    });
    return response.data;
  },

  // Split segment
  split: async (segmentId: number, splitTime: string): Promise<UserSegment[]> => {
    const response = await apiClient.post<UserSegment[]>(
      `/user-segments/${segmentId}/split`,
      { split_time: splitTime }
    );
    return response.data;
  },

  // Merge with next segment
  mergeWithNext: async (segmentId: number): Promise<UserSegment> => {
    const response = await apiClient.post<UserSegment>(
      `/user-segments/${segmentId}/merge-with-next`
    );
    return response.data;
  },

  // Merge with previous segment
  mergeWithPrevious: async (segmentId: number): Promise<UserSegment> => {
    const response = await apiClient.post<UserSegment>(
      `/user-segments/${segmentId}/merge-with-previous`
    );
    return response.data;
  },

  // Adjust segment boundary
  adjustBoundary: async (segmentId: number, boundary: 'start' | 'end', newTime: string): Promise<UserSegment> => {
    const response = await apiClient.patch<UserSegment>(
      `/user-segments/${segmentId}/adjust-boundary`,
      { boundary, new_time: newTime }
    );
    return response.data;
  },

  // Repair segment adjacency
  repairAdjacency: async (activityId: string): Promise<{ repaired: number; gaps_fixed: any[] }> => {
    const response = await apiClient.post(
      `/activities/${activityId}/user-segments/repair-adjacency`
    );
    return response.data;
  },
};

// GPX Upload API
export const gpxAPI = {
  upload: async (file: File, isPlanned: boolean = false): Promise<{ activity_id: string; status: string; points_count: number; message: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/gpx/upload', formData, {
      params: { is_planned: isPlanned },
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

// Model fitting API
export const modelsAPI = {
  // Start fitting the hierarchical time-prediction models (runs as a background task)
  fit: async (nRecentActivities?: number | null): Promise<{ status: string }> => {
    const response = await apiClient.post('/models/fit', { n_recent_activities: nRecentActivities ?? null });
    return response.data;
  },

  // Poll current fit progress
  getFitStatus: async (): Promise<FitStatus> => {
    const response = await apiClient.get<FitStatus>('/models/fit-status');
    return response.data;
  },

  // List historical fit runs, newest first
  getRuns: async (): Promise<ModelRunSummary[]> => {
    const response = await apiClient.get<ModelRunSummary[]>('/models/runs');
    return response.data;
  },

  // Fetch diagnostics for one specific run
  getRunDiagnostics: async (runId: string): Promise<AllModelDiagnostics> => {
    const response = await apiClient.get<AllModelDiagnostics>(`/models/runs/${runId}/diagnostics`);
    return response.data;
  },
};

// Time prediction API (Milestone 0.8)
export const predictionsAPI = {
  predict: async (activityId: string, request: PredictionRequest): Promise<PredictionResult> => {
    const response = await apiClient.post<PredictionResult>(`/activities/${activityId}/predict`, request);
    return response.data;
  },
  // Most recently saved prediction for this activity (the backend auto-saves on
  // every successful predict call), or null if none has been run yet.
  getSaved: async (activityId: string): Promise<PredictionResult | null> => {
    const response = await apiClient.get<PredictionResult | null>(`/activities/${activityId}/predicted-result`);
    return response.data;
  },
};

// Auth (Milestone 1.0 phase 2)
export interface AuthStatus {
  authenticated: boolean;
  email?: string;
  role?: string;
}

export const authAPI = {
  login: async (email: string, password: string): Promise<AuthStatus> => {
    const response = await apiClient.post('/auth/login', { email, password });
    return { authenticated: true, ...response.data };
  },
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },
  me: async (): Promise<AuthStatus> => {
    const response = await apiClient.get<AuthStatus>('/auth/me');
    return response.data;
  },
};

export default apiClient;
