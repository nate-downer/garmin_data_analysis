/**
 * Histogram of the route-total predicted trip time, with the mean marked.
 */
import { memo, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

interface PredictionDistributionChartProps {
  draws: number[];
  meanMin: number;
  numBins?: number;
}

const formatMinutes = (value: number) => {
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

function PredictionDistributionChart({ draws, meanMin, numBins = 24 }: PredictionDistributionChartProps) {
  const { bins, excludedCount } = useMemo(() => {
    if (draws.length === 0) return { bins: [], excludedCount: 0 };

    // Draws more than double the mean are rare but throw off bin widths badly,
    // compressing the bulk of the distribution into a sliver of the x-axis.
    const outlierThreshold = meanMin * 2;
    const filtered = draws.filter((v) => v <= outlierThreshold);
    if (filtered.length === 0) return { bins: [], excludedCount: draws.length };

    const min = Math.min(...filtered);
    const max = Math.max(...filtered);
    const width = (max - min) / numBins || 1;

    const counts = new Array(numBins).fill(0);
    filtered.forEach((v) => {
      const idx = Math.min(numBins - 1, Math.floor((v - min) / width));
      counts[idx]++;
    });

    const bins = counts.map((count, i) => ({
      binStart: min + i * width,
      binCenter: min + (i + 0.5) * width,
      count,
    }));

    return { bins, excludedCount: draws.length - filtered.length };
  }, [draws, meanMin, numBins]);

  if (bins.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={bins} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="binCenter"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            label={{ value: 'Total Time', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
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
          <Bar dataKey="count" fill="#6b7280" fillOpacity={0.7} />
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
