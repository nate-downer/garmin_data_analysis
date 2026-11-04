/**
 * Table of historical model fit runs. Clicking a row selects that run, loading
 * its diagnostics into the panels below.
 */
import { memo } from 'react';
import type { ModelRunSummary } from '../../types';
import { MODEL_GROUP_ORDER } from '../../types';

interface ModelRunsTableProps {
  runs: ModelRunSummary[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}

const GROUP_LABELS: Record<string, string> = {
  technical_climb: 'Tech. Climb',
  nontechnical_climb: 'Climb',
  flat: 'Flat',
  nontechnical_descent: 'Descent',
  technical_descent: 'Tech. Descent',
  rest: 'Rest',
};

const formatRunLabel = (createdAt: string) =>
  new Date(createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

const formatRmse = (value: number | undefined) =>
  typeof value === 'number' ? `${value.toFixed(1)}%` : '—';

function ModelRunsTable({ runs, selectedRunId, onSelectRun }: ModelRunsTableProps) {
  if (runs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500 text-sm">
        No fit runs yet. Click "Fit Models" to create the first one.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="px-4 py-3 font-medium">Run</th>
            <th className="px-4 py-3 font-medium text-right">Activities</th>
            {MODEL_GROUP_ORDER.map((group) => (
              <th key={group} className="px-4 py-3 font-medium text-right whitespace-nowrap">
                {GROUP_LABELS[group]} RMSE%
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const isSelected = run.run_id === selectedRunId;
            return (
              <tr
                key={run.run_id}
                onClick={() => onSelectRun(run.run_id)}
                className={`cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${
                  isSelected ? 'bg-orange-50' : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-4 py-3 text-gray-800 whitespace-nowrap">
                  {formatRunLabel(run.created_at)}
                  {isSelected && <span className="ml-2 text-xs text-orange-600 font-medium">(viewing)</span>}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{run.n_activities_total}</td>
                {MODEL_GROUP_ORDER.map((group) => (
                  <td key={group} className="px-4 py-3 text-right text-gray-700">
                    {formatRmse(run.rmse_pct[group])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default memo(ModelRunsTable);
