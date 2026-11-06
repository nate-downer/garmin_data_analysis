/**
 * Scatter plot of model-predicted vs. actual duration, with a 45-degree
 * reference line marking a perfect prediction.
 */
import { memo, useMemo } from 'react';
import { ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { PredictedVsActualPoint } from '../../../types';

interface PredictedVsActualChartProps {
  data: PredictedVsActualPoint[];
  color?: string;
}

const formatMinutes = (value: number) => `${value.toFixed(1)} min`;

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const point = payload[0].payload;
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
          {point.activityName}
        </p>
        <p style={{ margin: '2px 0', color: '#6b7280' }}>Predicted: {formatMinutes(point.y)}</p>
        <p style={{ margin: '2px 0', color: '#6b7280' }}>Actual: {formatMinutes(point.x)}</p>
      </div>
    );
  }
  return null;
};

function PredictedVsActualChart({ data, color = '#ea580c' }: PredictedVsActualChartProps) {
  const { points, referenceLine, maxValue } = useMemo(() => {
    const pts = data.map((d) => ({ x: d.actual_min, y: d.predicted_min, label: d.label, activityName: d.activity_name }));
    const max = pts.reduce((m, p) => Math.max(m, p.x, p.y), 0) * 1.05 || 1;
    return {
      points: pts,
      referenceLine: [{ x: 0, y: 0 }, { x: max, y: max }],
      maxValue: max,
    };
  }, [data]);

  if (points.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={375}>
      <ComposedChart margin={{ top: 20, right: 20, bottom: 20, left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="x"
          type="number"
          domain={[0, maxValue]}
          name="Actual"
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: 'Actual (min)', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
          tickFormatter={formatMinutes}
        />
        <YAxis
          dataKey="y"
          type="number"
          domain={[0, maxValue]}
          name="Predicted"
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: 'Predicted (min)', angle: -90, position: 'insideLeft', offset: -15, style: { fontSize: 12, textAnchor: 'middle' } }}
          tickFormatter={formatMinutes}
        />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={<CustomTooltip />}
        />
        <Line
          data={referenceLine}
          dataKey="y"
          stroke="#9ca3af"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
          legendType="none"
        />
        <Scatter data={points} fill={color} fillOpacity={0.6} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default memo(PredictedVsActualChart);
