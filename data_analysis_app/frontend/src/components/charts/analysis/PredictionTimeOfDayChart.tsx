/**
 * Histogram of a time-of-day distribution (minutes since midnight) - e.g. summit
 * time or finish time across posterior draws - with the mean marked. Each bar's
 * category (red/blue/grey) comes from a caller-supplied rule since summit/finish
 * each care about different time windows; the light/dark variant within a category
 * is fixed here - dark inside 1 SD of the mean, light outside it.
 */
import { memo, useMemo } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

export type TimeCategory = 'red' | 'blue' | 'grey';

interface PredictionTimeOfDayChartProps {
  values: number[];
  meanValue: number;
  actualValue?: number | null;
  categoryForBin: (binCenterMinutes: number) => TimeCategory;
  numBins?: number;
  height?: number;
  xAxisLabel?: string;
}

// Dark variant = bar is within 1 SD of the mean; light variant = everything else.
const CATEGORY_COLORS: Record<TimeCategory, { light: string; dark: string }> = {
  red: { light: '#fca5a5', dark: '#b91c1c' },
  blue: { light: '#93c5fd', dark: '#1d4ed8' },
  grey: { light: '#d1d5db', dark: '#4b5563' },
};

const formatTimeOfDay = (minutes: number) => {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(wrapped / 60);
  const mins = Math.round(wrapped % 60);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${mins.toString().padStart(2, '0')} ${period}`;
};

function PredictionTimeOfDayChart({
  values, meanValue, actualValue, categoryForBin, numBins = 24, height = 250, xAxisLabel = 'Time of Day',
}: PredictionTimeOfDayChartProps) {
  const { bins, domain } = useMemo(() => {
    if (values.length === 0) return { bins: [], domain: undefined as [number, number] | undefined };

    const min = Math.min(...values);
    const max = Math.max(...values);
    const width = (max - min) / numBins || 1;

    const variance = values.reduce((sum, v) => sum + (v - meanValue) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);

    const counts = new Array(numBins).fill(0);
    values.forEach((v) => {
      const idx = Math.min(numBins - 1, Math.floor((v - min) / width));
      counts[idx]++;
    });

    const bins = counts.map((count, i) => {
      const binCenter = min + (i + 0.5) * width;
      const withinOneSd = Math.abs(binCenter - meanValue) <= std;
      const color = CATEGORY_COLORS[categoryForBin(binCenter)][withinOneSd ? 'dark' : 'light'];
      return { binCenter, count, color };
    });

    // Widen the axis domain so the "actual" reference line is never clipped off-chart
    // when the real value falls outside the predicted draws' own range.
    const domain: [number, number] = [
      actualValue != null ? Math.min(min, actualValue) : min,
      actualValue != null ? Math.max(max, actualValue) : max,
    ];

    return { bins, domain };
  }, [values, numBins, categoryForBin, meanValue, actualValue]);

  if (bins.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  return (
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
          tickFormatter={formatTimeOfDay}
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
          labelFormatter={(value: number) => formatTimeOfDay(value)}
        />
        <ReferenceLine x={meanValue} stroke="#ea580c" strokeWidth={2} label={{ value: `Mean: ${formatTimeOfDay(meanValue)}`, position: 'top', fill: '#ea580c', fontSize: 12 }} />
        {actualValue != null && (
          <ReferenceLine x={actualValue} stroke="#000000" strokeWidth={2} />
        )}
        <Bar dataKey="count" fillOpacity={0.8}>
          {bins.map((bin, i) => (
            <Cell key={i} fill={bin.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(PredictionTimeOfDayChart);
