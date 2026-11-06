/**
 * Two side-by-side horizontal-bar facets sharing one category (Y) axis, sorted
 * most-impactful-first:
 * - Left: each predictor's share of explained variance (median posterior
 *   estimate + 5th-95th percentile range).
 * - Right: that predictor's own coefficient (or, for composite terms like
 *   tod_modifier/activity_offset/effort_factor, a representative effect-size
 *   proxy) - dark grey when it increases predicted time, light grey when it
 *   decreases it. Hidden entirely for older runs fitted before this field
 *   existed.
 */
import { memo } from 'react';
import { BarChart, Bar, Cell, ErrorBar, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { VarianceExplainedEntry } from '../../../types';

interface VarianceExplainedChartProps {
  data: VarianceExplainedEntry[];
}

const INCREASES_TIME_COLOR = '#4b5563'; // dark grey
const DECREASES_TIME_COLOR = '#d1d5db'; // light grey
const sharedMargin = { top: 5, right: 20, bottom: 5, left: 10 };

function VarianceExplainedChart({ data }: VarianceExplainedChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  const hasCoefficients = data.some((d) => d.coefficient_median !== undefined);

  const chartData = data
    .map((d) => ({
      name: d.label,
      value: d.median_pct,
      error: [d.median_pct - d.low_pct, d.high_pct - d.median_pct] as [number, number],
      coef: d.coefficient_median ?? 0,
      coefError: [
        (d.coefficient_median ?? 0) - (d.coefficient_low ?? 0),
        (d.coefficient_high ?? 0) - (d.coefficient_median ?? 0),
      ] as [number, number],
    }))
    .sort((a, b) => b.value - a.value); // most impactful at top

  const height = Math.max(220, chartData.length * 38);

  return (
    <div className="flex gap-1">
      <div className={hasCoefficients ? 'flex-[2] min-w-0' : 'flex-1 min-w-0'}>
        {hasCoefficients && (
          <p className="text-xs text-gray-400 text-center mb-1">% Contribution</p>
        )}
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={chartData} layout="vertical" margin={sharedMargin}>
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
      </div>

      {hasCoefficients && (
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 text-center mb-1">Coefficient</p>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={chartData} layout="vertical" margin={sharedMargin}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                domain={['auto', 'auto']}
                tick={{ fontSize: 12 }}
                stroke="#9ca3af"
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={false}
                axisLine={false}
                tickLine={false}
                width={1}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                contentStyle={{ fontSize: 11, backgroundColor: 'rgba(255, 255, 255, 0.95)', border: 'none', padding: '8px' }}
                formatter={(value: number) => [value.toFixed(3), 'Coefficient']}
              />
              <ReferenceLine x={0} stroke="#9ca3af" strokeWidth={1.5} />
              <Bar dataKey="coef">
                <ErrorBar dataKey="coefError" width={4} strokeWidth={1.5} stroke="#374151" direction="x" />
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.coef >= 0 ? INCREASES_TIME_COLOR : DECREASES_TIME_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default memo(VarianceExplainedChart);
