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
  SummaryStats,
  RemovePointsRequest,
  RestorePointsRequest,
  ActivityUpdate,
  UserSegmentCreate,
  UserSegmentUpdate,
} from '../types';

// Base API URL - reads from environment variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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
  // List user-defined segments
  list: async (activityId: string): Promise<UserSegment[]> => {
    const response = await apiClient.get<UserSegment[]>(`/activities/${activityId}/user-segments`);
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
};

// GPX Upload API
export const gpxAPI = {
  upload: async (file: File): Promise<{ activity_id: string; status: string; points_count: number; message: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/gpx/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export default apiClient;
