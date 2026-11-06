/**
 * Custom React hook for fetching and managing activities.
 */
import { useState, useEffect } from 'react';
import { activitiesAPI } from '../services/api';
import type { Activity } from '../types';

interface UseActivitiesResult {
  activities: Activity[];
  loading: boolean;
  error: string | null;
  refetch: (silent?: boolean) => Promise<void>;
}

export function useActivities(): UseActivitiesResult {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `silent` skips the loading toggle - used after background saves (e.g. a
  // Predict Time run) so the list doesn't unmount/remount mid-refresh and wipe
  // whatever's currently expanded (open accordion panel, in-progress form, etc.).
  const fetchActivities = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const data = await activitiesAPI.list();
      setActivities(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch activities');
      console.error('Error fetching activities:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  return {
    activities,
    loading,
    error,
    refetch: fetchActivities,
  };
}
