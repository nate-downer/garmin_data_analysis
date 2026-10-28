/**
 * Generic scatter plot component for activity metrics.
 */
import { memo, useMemo } from 'react';
import { ScatterChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, TooltipProps, ComposedChart } from 'recharts';
import { Activity } from '../../../types';
import { formatDuration, formatDistance, formatElevation } from '../../../utils/formatters';
import { fitExponentialSaturation } from '../../../utils/curveFitting';

// Custom tooltip component
const CustomTooltip = ({ active, payload, xLabel, yLabel, formatValue, xKey, yKey }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #e5e7eb',
        borderRadius: '4px',
        padding: '8px 12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        fontSize: '11px',
      }}>
        <p style={{ fontWeight: 'bold', marginBottom: '4px', color: '#374151', margin: '0 0 4px 0' }}>
          {data.name}
        </p>
        <p style={{ margin: '2px 0', color: '#6b7280' }}>
          {xLabel}: {formatValue(data.x, xKey)}
        </p>
        <p style={{ margin: '2px 0', color: '#6b7280' }}>
          {yLabel}: {formatValue(data.y, yKey)}
        </p>
      </div>
    );
  }
  return null;
};

interface ActivityScatterPlotProps {
  data: Activity[];
  xKey: keyof Activity;
  yKey: keyof Activity;
  xLabel: string;
  yLabel: string;
  asymptoteMultiplier?: number; // Controls asymptote height (default 5)
  slopeMultiplier?: number; // Controls initial slope (default 0.1)
}

function ActivityScatterPlot({
  data,
  xKey,
  yKey,
  xLabel,
  yLabel,
  asymptoteMultiplier = 5,
  slopeMultiplier = 0.1
}: ActivityScatterPlotProps) {
  // Transform data to scatter plot format
  const chartData = useMemo(() => {
    return data
      .filter(activity => activity[xKey] != null && activity[yKey] != null)
      .map(activity => ({
        x: activity[xKey] as number,
        y: activity[yKey] as number,
        name: activity.activity_name || `Activity ${new Date(activity.date).toLocaleDateString()}`,
        activityId: activity.activity_id,
      }));
  }, [data, xKey, yKey]);

  // Fit exponential saturation curve (diminishing returns)
  const trendline = useMemo(() => {
    return fitExponentialSaturation(chartData, asymptoteMultiplier, slopeMultiplier, 1.5, 0.001);
  }, [chartData, asymptoteMultiplier, slopeMultiplier]);

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  // Format values based on key type
  const formatValue = (value: number, key: keyof Activity): string => {
    if (key === 'total_duration_sec') return formatDuration(value);
    if (key === 'total_distance_mi') return formatDistance(value);
    if (key.includes('elevation')) return formatElevation(value);
    return value.toFixed(2);
  };

  return (
    <div className="relative">
      {trendline && (
        <div className="absolute top-0 right-0 text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
          R² = {trendline.rSquared.toFixed(3)}
        </div>
      )}
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart margin={{ top: 20, right: 20, bottom: 20, left: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="x"
            type="number"
            name={xLabel}
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            label={{ value: xLabel, position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
            tickFormatter={(value) => formatValue(value, xKey)}
          />
          <YAxis
            dataKey="y"
            type="number"
            name={yLabel}
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: -15, style: { fontSize: 12, textAnchor: 'middle' } }}
            tickFormatter={(value) => formatValue(value, yKey)}
          />
          <Tooltip
            content={<CustomTooltip xLabel={xLabel} yLabel={yLabel} formatValue={formatValue} xKey={xKey} yKey={yKey} />}
            cursor={{ strokeDasharray: '3 3' }}
          />
          {trendline && (
            <Line
              data={trendline.curvePoints}
              type="monotone"
              dataKey="y"
              stroke="#9ca3af"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              isAnimationActive={false}
            />
          )}
          <Scatter
            data={chartData}
            fill="#ea580c"
            fillOpacity={0.6}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(ActivityScatterPlot);
