/**
 * Generic scatter plot component for segment metrics.
 */
import { memo, useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { UserSegmentWithActivity } from '../../../types';

// Custom tooltip component
const CustomTooltip = ({ active, payload, xLabel, yLabel, formatX, formatY }: any) => {
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
        <p style={{ fontSize: '10px', margin: '0 0 4px 0', color: '#9ca3af' }}>
          {data.date}
        </p>
        <p style={{ margin: '2px 0', color: '#6b7280' }}>
          {xLabel}: {formatX(data.x)}
        </p>
        <p style={{ margin: '2px 0', color: '#6b7280' }}>
          {yLabel}: {formatY(data.y)}
        </p>
      </div>
    );
  }
  return null;
};

interface SegmentScatterPlotProps {
  segments: UserSegmentWithActivity[];
  xKey: keyof UserSegmentWithActivity;
  yKey: keyof UserSegmentWithActivity;
  xLabel: string;
  yLabel: string;
  xFormatter?: (value: number) => string;
  yFormatter?: (value: number) => string;
}

function SegmentScatterPlot({
  segments,
  xKey,
  yKey,
  xLabel,
  yLabel,
  xFormatter,
  yFormatter,
}: SegmentScatterPlotProps) {
  // Transform data to scatter plot format
  const chartData = useMemo(() => {
    return segments
      .filter(segment => segment[xKey] != null && segment[yKey] != null)
      .map(segment => ({
        x: segment[xKey] as number,
        y: segment[yKey] as number,
        name: segment.activity_name || 'Unnamed',
        date: new Date(segment.activity_date).toLocaleDateString(),
        segmentId: segment.id,
        is_technical: segment.is_technical,
        fill: segment.is_technical ? '#ea580c' : '#6b7280', // Orange for technical, grey for non-technical
      }));
  }, [segments, xKey, yKey]);

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  const defaultFormatter = (value: number) => value.toFixed(2);
  const formatX = xFormatter || defaultFormatter;
  const formatY = yFormatter || defaultFormatter;

  return (
    <ResponsiveContainer width="100%" height={250}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="x"
          type="number"
          name={xLabel}
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: xLabel, position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
          tickFormatter={formatX}
        />
        <YAxis
          dataKey="y"
          type="number"
          name={yLabel}
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: -15, style: { fontSize: 12, textAnchor: 'middle' } }}
          tickFormatter={formatY}
        />
        <Tooltip
          content={<CustomTooltip xLabel={xLabel} yLabel={yLabel} formatX={formatX} formatY={formatY} />}
          cursor={{ strokeDasharray: '3 3' }}
        />
        <Scatter
          data={chartData}
          fillOpacity={0.6}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export default memo(SegmentScatterPlot);
