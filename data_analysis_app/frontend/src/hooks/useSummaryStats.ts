/**
 * Custom React hook for fetching summary statistics.
 */
import { useState, useEffect } from 'react';
import { activitiesAPI } from '../services/api';
import type { SummaryStats } from '../types';

interface UseSummaryStatsResult {
  stats: SummaryStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSummaryStats(): UseSummaryStatsResult {
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await activitiesAPI.getSummaryStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch summary stats');
      console.error('Error fetching summary stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  };
}
