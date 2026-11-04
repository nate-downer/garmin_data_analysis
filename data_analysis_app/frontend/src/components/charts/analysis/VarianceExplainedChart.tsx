/**
 * Horizontal bar chart with error bars, showing each predictor's share of
 * explained variance (median posterior estimate + 5th-95th percentile range).
 */
import { memo } from 'react';
import { BarChart, Bar, ErrorBar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { VarianceExplainedEntry } from '../../../types';

interface VarianceExplainedChartProps {
  data: VarianceExplainedEntry[];
}

function VarianceExplainedChart({ data }: VarianceExplainedChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  const chartData = data
    .map((d) => ({
      name: d.label,
      value: d.median_pct,
      error: [d.median_pct - d.low_pct, d.high_pct - d.median_pct] as [number, number],
    }))
    .sort((a, b) => a.value - b.value);

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 38)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          type="number"
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11 }}
          stroke="#9ca3af"
          width={170}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
          contentStyle={{ fontSize: 11, backgroundColor: 'rgba(255, 255, 255, 0.95)', border: 'none', padding: '8px' }}
          formatter={(value: number) => [`${value.toFixed(1)}%`, 'Variance explained']}
        />
        <Bar dataKey="value" fill="#6b7280">
          <ErrorBar dataKey="error" width={4} strokeWidth={1.5} stroke="#374151" direction="x" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(VarianceExplainedChart);
