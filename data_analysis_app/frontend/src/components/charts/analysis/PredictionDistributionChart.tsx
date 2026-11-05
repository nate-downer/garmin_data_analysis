/**
 * Histogram of a predicted-time distribution (total or active-only), with the mean
 * marked. Bars within 1 SD of the mean are dark grey; bars beyond 1 SD are light grey.
 */
import { memo, useMemo } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

interface PredictionDistributionChartProps {
  draws: number[];
  meanMin: number;
  actualMin?: number | null;
  numBins?: number;
  height?: number;
  xAxisLabel?: string;
}

const formatMinutes = (value: number) => {
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const COLOR_WITHIN_1SD = '#6b7280'; // gray-500
const COLOR_BEYOND_1SD = '#d1d5db'; // gray-300

function PredictionDistributionChart({ draws, meanMin, actualMin, numBins = 24, height = 250, xAxisLabel = 'Total Time' }: PredictionDistributionChartProps) {
  const { bins, excludedCount, domain } = useMemo(() => {
    if (draws.length === 0) return { bins: [], excludedCount: 0, domain: undefined as [number, number] | undefined };

    // Draws more than double the mean are rare but throw off bin widths badly,
    // compressing the bulk of the distribution into a sliver of the x-axis.
    const outlierThreshold = meanMin * 2;
    const filtered = draws.filter((v) => v <= outlierThreshold);
    if (filtered.length === 0) return { bins: [], excludedCount: draws.length, domain: undefined };

    const mean = filtered.reduce((sum, v) => sum + v, 0) / filtered.length;
    const variance = filtered.reduce((sum, v) => sum + (v - mean) ** 2, 0) / filtered.length;
    const std = Math.sqrt(variance);

    const min = Math.min(...filtered);
    const max = Math.max(...filtered);
    const width = (max - min) / numBins || 1;

    const counts = new Array(numBins).fill(0);
    filtered.forEach((v) => {
      const idx = Math.min(numBins - 1, Math.floor((v - min) / width));
      counts[idx]++;
    });

    const bins = counts.map((count, i) => {
      const binCenter = min + (i + 0.5) * width;
      return {
        binStart: min + i * width,
        binCenter,
        count,
        color: Math.abs(binCenter - mean) > std ? COLOR_BEYOND_1SD : COLOR_WITHIN_1SD,
      };
    });

    // Widen the axis domain so the "actual" reference line is never clipped off-chart
    // when the real value falls outside the predicted draws' own range.
    const domain: [number, number] = [
      actualMin != null ? Math.min(min, actualMin) : min,
      actualMin != null ? Math.max(max, actualMin) : max,
    ];

    return { bins, excludedCount: draws.length - filtered.length, domain };
  }, [draws, meanMin, actualMin, numBins]);

  if (bins.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={bins} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="binCenter"
            type="number"
            domain={domain ?? ['dataMin', 'dataMax']}
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            label={{ value: xAxisLabel, position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
            tickFormatter={formatMinutes}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            label={{ value: 'Frequency', angle: -90, position: 'insideLeft', style: { fontSize: 12, textAnchor: 'middle' } }}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
            formatter={(value: number) => [value, 'Draws']}
            labelFormatter={(value: number) => formatMinutes(value)}
          />
          <ReferenceLine x={meanMin} stroke="#ea580c" strokeWidth={2} label={{ value: `Mean: ${formatMinutes(meanMin)}`, position: 'top', fill: '#ea580c', fontSize: 12 }} />
          {actualMin != null && (
            <ReferenceLine x={actualMin} stroke="#000000" strokeWidth={2} />
          )}
          <Bar dataKey="count" fillOpacity={0.7}>
            {bins.map((bin, i) => (
              <Cell key={i} fill={bin.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {excludedCount > 0 && (
        <p className="text-xs text-gray-400 text-center mt-1">
          {excludedCount} outlier draw{excludedCount === 1 ? '' : 's'} (&gt;2x mean) excluded from this plot
        </p>
      )}
    </div>
  );
}

export default memo(PredictionDistributionChart);
