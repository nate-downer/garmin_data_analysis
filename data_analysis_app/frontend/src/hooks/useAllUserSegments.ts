/**
 * Custom React hook for fetching all user segments across activities.
 */
import { useState, useEffect } from 'react';
import { userSegmentsAPI } from '../services/api';
import type { UserSegmentWithActivity } from '../types';

interface UseAllUserSegmentsResult {
  segments: UserSegmentWithActivity[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAllUserSegments(segmentType?: string): UseAllUserSegmentsResult {
  const [segments, setSegments] = useState<UserSegmentWithActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSegments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await userSegmentsAPI.listAll(segmentType);
      setSegments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch segments');
      console.error('Error fetching segments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSegments();
  }, [segmentType]);

  return {
    segments,
    loading,
    error,
    refetch: fetchSegments,
  };
}
