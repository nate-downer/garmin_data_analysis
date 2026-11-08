/**
 * Build Model page - fits the hierarchical Bayesian time-prediction models and
 * shows diagnostic plots (variance explained, predicted vs. actual) per model.
 */
import { useState } from 'react';
import Header from '../components/layout/Header';
import VarianceExplainedChart from '../components/charts/analysis/VarianceExplainedChart';
import PredictedVsActualChart from '../components/charts/analysis/PredictedVsActualChart';
import ModelRunsTable from '../components/analysis/ModelRunsTable';
import { useModelFitting } from '../hooks/useModelFitting';
import { MODEL_GROUP_ORDER } from '../types';
import { useAuth } from '../context/AuthContext';

// Matches the segment-type color convention used elsewhere in the app (e.g.
// ActivityEditor.tsx's getSegmentColors(), PredictionCumulativeChart.tsx).
const colorForGroup = (key: string): string => {
  if (key.includes('climb')) return '#ea580c'; // orange
  if (key.includes('descent')) return '#2563eb'; // blue
  if (key === 'rest') return '#16a34a'; // green
  return '#6b7280'; // flat - grey
};

function ModelDiagnosticsPage() {
  const { isAdmin } = useAuth();
  const {
    fitStatus,
    runs,
    selectedRunId,
    selectRun,
    diagnostics,
    diagnosticsLoading,
    diagnosticsError,
    startFit,
  } = useModelFitting();
  const [starting, setStarting] = useState(false);
  const [limitToRecent, setLimitToRecent] = useState(false);
  const [nRecentActivities, setNRecentActivities] = useState('10');

  const isRunning = fitStatus?.state === 'running' || starting;
  const progressPct = fitStatus && fitStatus.total_steps > 0
    ? Math.min(100, Math.round(((fitStatus.step_index + 1) / fitStatus.total_steps) * 100))
    : 0;

  const handleFitClick = async () => {
    if (!isAdmin) {
      alert('This feature is disabled in Viewer mode');
      return;
    }
    setStarting(true);
    try {
      await startFit(limitToRecent ? Number(nRecentActivities) : null);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-gray-50 rounded-lg shadow-md p-6">
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Time Prediction Models</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Hierarchical Bayesian models predicting segment duration from distance, elevation, load, terrain, and fatigue.
                </p>
              </div>
              <button
                className={`btn-primary disabled:opacity-50 disabled:cursor-not-allowed ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={handleFitClick}
                disabled={isRunning}
              >
                {isRunning ? 'Fitting…' : 'Fit Models'}
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={limitToRecent}
                  onChange={(e) => setLimitToRecent(e.target.checked)}
                  disabled={isRunning}
                />
                Limit to most recent
              </label>
              <input
                type="number"
                min={1}
                value={nRecentActivities}
                onChange={(e) => setNRecentActivities(e.target.value)}
                disabled={!limitToRecent || isRunning}
                className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              <span>activities</span>
            </div>

            {isRunning && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>{fitStatus?.step_label || 'Starting…'}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-orange-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {fitStatus?.state === 'error' && (
              <div className="mt-4 text-sm text-red-600">
                Fit failed: {fitStatus.error}
              </div>
            )}
          </div>

          <div className="mb-6">
            <ModelRunsTable runs={runs} selectedRunId={selectedRunId} onSelectRun={selectRun} />
          </div>

          {diagnosticsLoading && !diagnostics && (
            <div className="flex justify-center items-center h-32">
              <div className="text-gray-600">Loading diagnostics...</div>
            </div>
          )}

          {diagnosticsError && (
            <div className="bg-white rounded-lg shadow-sm p-4 text-red-600 text-sm">
              {diagnosticsError}
            </div>
          )}

          {!diagnosticsLoading && !diagnostics && !diagnosticsError && (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <p className="text-gray-500">No fitted models yet. Click "Fit Models" to get started.</p>
            </div>
          )}

          {diagnostics && (
            <div className="space-y-6">
              {MODEL_GROUP_ORDER.map((key) => {
                const group = diagnostics[key];
                if (!group) return null;
                return (
                  <div key={key}>
                    <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <h3 className="text-lg font-semibold text-gray-800">{group.label}</h3>
                        <div className="flex gap-6 text-sm">
                          <div>
                            <span className="text-gray-400">Segments: </span>
                            <span className="font-medium text-gray-700">{group.n_segments}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">R²: </span>
                            <span className="font-medium text-gray-700">
                              {typeof group.r_squared === 'number' ? group.r_squared.toFixed(3) : '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">RMSE: </span>
                            <span className="font-medium text-gray-700">
                              {typeof group.rmse_min === 'number' ? `${group.rmse_min.toFixed(1)} min` : '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">RMSE / Avg Time: </span>
                            <span className="font-medium text-gray-700">
                              {typeof group.rmse_pct_of_mean === 'number' ? `${group.rmse_pct_of_mean.toFixed(1)}%` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-white rounded-lg shadow-md p-6">
                        <h4 className="text-sm font-semibold mb-4 text-gray-700">Variance Explained by Variable</h4>
                        <VarianceExplainedChart data={group.variance_explained} />
                      </div>
                      <div className="bg-white rounded-lg shadow-md p-6">
                        <h4 className="text-sm font-semibold mb-4 text-gray-700">Predicted vs. Actual</h4>
                        <PredictedVsActualChart data={group.predicted_vs_actual} color={colorForGroup(key)} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default ModelDiagnosticsPage;
