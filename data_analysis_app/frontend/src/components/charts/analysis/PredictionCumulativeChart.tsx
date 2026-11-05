/**
 * Generic "path over time" chart for a predicted route - cumulative time (x) vs. a
 * configurable y metric (cumulative distance, or elevation), with segments and rest
 * gaps connected end to end. Each connector is colored by the segment type it leads
 * into (matching the colors used elsewhere in the app: orange=climb, blue=descent,
 * grey=flat, green=rest).
 */
import { memo } from 'react';
import { ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { PredictionCumulativePoint, ActualCumulativePoint } from '../../../types';

interface PredictionCumulativeChartProps {
  points: PredictionCumulativePoint[];
  actualPoints?: ActualCumulativePoint[] | null;
  yKey: 'cumulative_distance_mi' | 'elevation_ft';
  yLabel: string;
  yFormatter: (value: number) => string;
  height?: number;
}

const formatMinutes = (value: number) => {
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const KIND_LABELS: Record<string, string> = {
  start: 'Start',
  segment: 'Segment',
  rest: 'Rest',
};

// Matches ActivityEditor.tsx's getSegmentColors() so climb/descent/flat/rest read
// consistently across the whole app.
const BASE_TYPE_COLORS: Record<string, string> = {
  climb: '#ea580c', // orange-600
  descent: '#2563eb', // blue-600
  flat: '#6b7280', // gray-500
  rest: '#16a34a', // green-600
  start: '#374151', // gray-700 - neutral, not a real segment type
};

const colorForPoint = (point: PredictionCumulativePoint): string => {
  if (point.kind === 'start') return BASE_TYPE_COLORS.start;
  if (point.kind === 'rest') return BASE_TYPE_COLORS.rest;
  if (point.label.includes('climb')) return BASE_TYPE_COLORS.climb;
  if (point.label.includes('descent')) return BASE_TYPE_COLORS.descent;
  return BASE_TYPE_COLORS.flat;
};

function PredictionCumulativeChart({ points, actualPoints, yKey, yLabel, yFormatter, height = 250 }: PredictionCumulativeChartProps) {
  if (points.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

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
          <p style={{ margin: '2px 0', color: '#6b7280' }}>{yLabel}: {yFormatter(point[yKey])}</p>
          <p style={{ margin: '2px 0', color: '#6b7280' }}>Elapsed: {formatMinutes(point.cumulative_time_min)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart margin={{ top: 20, right: 20, bottom: 20, left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="cumulative_time_min"
          type="number"
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: 'Cumulative Time', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
          tickFormatter={formatMinutes}
        />
        <YAxis
          dataKey={yKey}
          type="number"
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: -15, style: { fontSize: 12, textAnchor: 'middle' } }}
          tickFormatter={yFormatter}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />

        {/* Actual recorded path, rendered first (behind) the predicted-mean path below */}
        {actualPoints && actualPoints.length > 1 && (
          <Line
            data={actualPoints}
            type="linear"
            dataKey="cumulative_distance_mi"
            stroke="#000000"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            legendType="none"
          />
        )}

        {/* One 2-point line per connector, colored by the segment type it leads into */}
        {points.slice(0, -1).map((point, i) => {
          const nextPoint = points[i + 1];
          return (
            <Line
              key={i}
              data={[point, nextPoint]}
              type="linear"
              dataKey={yKey}
              stroke={colorForPoint(nextPoint)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
          );
        })}

        {/* Point markers, colored the same way as the connector leading into them */}
        <Scatter
          data={points}
          dataKey={yKey}
          shape={(props: any) => {
            const point = props.payload as PredictionCumulativePoint;
            return <circle cx={props.cx} cy={props.cy} r={point.kind === 'start' ? 3 : 4} fill={colorForPoint(point)} />;
          }}
          isAnimationActive={false}
          legendType="none"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default memo(PredictionCumulativeChart);
