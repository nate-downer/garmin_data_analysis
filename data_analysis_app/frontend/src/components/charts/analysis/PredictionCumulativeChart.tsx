/**
 * Cumulative distance (x) vs. cumulative time (y) for a predicted route - segments
 * and rest gaps connected end to end, showing elapsed trip time build up over distance.
 */
import { memo } from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { PredictionCumulativePoint } from '../../../types';

interface PredictionCumulativeChartProps {
  points: PredictionCumulativePoint[];
}

const formatMinutes = (value: number) => {
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const formatMiles = (value: number) => `${value.toFixed(1)} mi`;

const KIND_LABELS: Record<string, string> = {
  start: 'Start',
  segment: 'Segment',
  rest: 'Rest',
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const point = payload[0].payload as PredictionCumulativePoint;
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
          {KIND_LABELS[point.kind]}{point.kind === 'segment' ? ` (${point.label})` : ''}
        </p>
        <p style={{ margin: '2px 0', color: '#6b7280' }}>Distance: {formatMiles(point.cumulative_distance_mi)}</p>
        <p style={{ margin: '2px 0', color: '#6b7280' }}>Elapsed: {formatMinutes(point.cumulative_time_min)}</p>
      </div>
    );
  }
  return null;
};

function PredictionCumulativeChart({ points }: PredictionCumulativeChartProps) {
  if (points.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={points} margin={{ top: 20, right: 20, bottom: 20, left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="cumulative_distance_mi"
          type="number"
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: 'Cumulative Distance (mi)', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
          tickFormatter={formatMiles}
        />
        <YAxis
          dataKey="cumulative_time_min"
          type="number"
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: 'Cumulative Time', angle: -90, position: 'insideLeft', offset: -15, style: { fontSize: 12, textAnchor: 'middle' } }}
          tickFormatter={formatMinutes}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
        <Line
          type="linear"
          dataKey="cumulative_time_min"
          stroke="#ea580c"
          strokeWidth={2}
          dot={(props: any) => {
            const kind = props.payload.kind;
            const color = kind === 'rest' ? '#9ca3af' : '#ea580c';
            return <circle key={props.key} cx={props.cx} cy={props.cy} r={kind === 'start' ? 3 : 4} fill={color} />;
          }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default memo(PredictionCumulativeChart);
