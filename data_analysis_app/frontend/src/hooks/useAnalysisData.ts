/**
 * Custom React hook that combines activities and segment data for the analysis page.
 * Returns both datasets with coordinated loading/error states.
 */
import { useActivities } from './useActivities';
import { useAllUserSegments } from './useAllUserSegments';
import type { Activity, UserSegmentWithActivity } from '../types';

interface UseAnalysisDataResult {
  activities: Activity[];
  climbSegments: UserSegmentWithActivity[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAnalysisData(): UseAnalysisDataResult {
  const {
    activities,
    loading: activitiesLoading,
    error: activitiesError,
    refetch: refetchActivities,
  } = useActivities();

  const {
    segments: climbSegments,
    loading: segmentsLoading,
    error: segmentsError,
    refetch: refetchSegments,
  } = useAllUserSegments('climb');

  const refetch = async () => {
    await Promise.all([refetchActivities(), refetchSegments()]);
  };

  return {
    activities,
    climbSegments,
    loading: activitiesLoading || segmentsLoading,
    error: activitiesError || segmentsError,
    refetch,
  };
}
