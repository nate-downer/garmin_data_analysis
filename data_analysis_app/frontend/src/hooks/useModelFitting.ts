/**
 * Drives the "Fit Models" button and the run-history table: starts a fit, polls
 * progress, maintains the list of historical runs, and loads diagnostics for
 * whichever run is currently selected.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { modelsAPI } from '../services/api';
import type { AllModelDiagnostics, FitStatus, ModelRunSummary } from '../types';

const POLL_INTERVAL_MS = 1500;

interface UseModelFittingResult {
  fitStatus: FitStatus | null;
  runs: ModelRunSummary[];
  runsLoading: boolean;
  selectedRunId: string | null;
  selectRun: (runId: string) => void;
  diagnostics: AllModelDiagnostics | null;
  diagnosticsLoading: boolean;
  diagnosticsError: string | null;
  startFit: (nRecentActivities?: number | null) => Promise<void>;
}

export function useModelFitting(): UseModelFittingResult {
  const [fitStatus, setFitStatus] = useState<FitStatus | null>(null);
  const [runs, setRuns] = useState<ModelRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<AllModelDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDiagnosticsForRun = useCallback(async (runId: string) => {
    try {
      setDiagnosticsLoading(true);
      setDiagnosticsError(null);
      const data = await modelsAPI.getRunDiagnostics(runId);
      setDiagnostics(data);
    } catch (err) {
      setDiagnosticsError(err instanceof Error ? err.message : 'Failed to load diagnostics');
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  const selectRun = useCallback((runId: string) => {
    setSelectedRunId(runId);
    fetchDiagnosticsForRun(runId);
  }, [fetchDiagnosticsForRun]);

  const fetchRuns = useCallback(async (): Promise<ModelRunSummary[]> => {
    try {
      setRunsLoading(true);
      const data = await modelsAPI.getRuns();
      setRuns(data);
      return data;
    } catch (err) {
      setDiagnosticsError(err instanceof Error ? err.message : 'Failed to load run history');
      return [];
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    const status = await modelsAPI.getFitStatus();
    setFitStatus(status);

    if (status.state === 'done') {
      stopPolling();
      const freshRuns = await fetchRuns();
      if (status.run_id) {
        selectRun(status.run_id);
      } else if (freshRuns.length > 0) {
        selectRun(freshRuns[0].run_id);
      }
    } else if (status.state === 'error') {
      stopPolling();
    }
  }, [fetchRuns, selectRun, stopPolling]);

  const startFit = useCallback(async (nRecentActivities?: number | null) => {
    await modelsAPI.fit(nRecentActivities);
    await pollStatus();
    stopPolling();
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
  }, [pollStatus, stopPolling]);

  useEffect(() => {
    fetchRuns().then((initialRuns) => {
      if (initialRuns.length > 0) {
        selectRun(initialRuns[0].run_id);
      }
    });

    // Resume polling if a fit was already running (e.g. page was refreshed mid-fit).
    modelsAPI.getFitStatus().then((status) => {
      setFitStatus(status);
      if (status.state === 'running') {
        pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
      }
    });

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    fitStatus,
    runs,
    runsLoading,
    selectedRunId,
    selectRun,
    diagnostics,
    diagnosticsLoading,
    diagnosticsError,
    startFit,
  };
}
