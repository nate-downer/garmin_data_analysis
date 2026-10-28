/**
 * Generic scatter plot component for segment metrics.
 */
import { memo, useMemo } from 'react';
import { ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { UserSegmentWithActivity } from '../../../types';
import { fitExponentialDecay, fitExponentialSaturation } from '../../../utils/curveFitting';

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
  curveType?: 'saturation' | 'decay'; // Default: saturation (diminishing returns)
  asymptoteMultiplier?: number; // Controls asymptote height (default 5)
  slopeMultiplier?: number; // Controls initial slope (default 0.1)
  minAsymptoteMultiplier?: number; // Min asymptote bound (default 1.5)
  regularizationStrength?: number; // Regularization strength (default 0.001)
  showTrendline?: boolean; // Whether to show trendline (default true)
}

function SegmentScatterPlot({
  segments,
  xKey,
  yKey,
  xLabel,
  yLabel,
  xFormatter,
  yFormatter,
  curveType = 'saturation',
  asymptoteMultiplier = 5,
  slopeMultiplier = 0.1,
  minAsymptoteMultiplier = 1.5,
  regularizationStrength = 0.001,
  showTrendline = true,
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

  // Split data by technical/non-technical and fit separate curves
  const { technicalTrendline, nonTechnicalTrendline } = useMemo(() => {
    if (!showTrendline) {
      return { technicalTrendline: null, nonTechnicalTrendline: null };
    }

    const technicalData = chartData.filter(d => d.is_technical);
    const nonTechnicalData = chartData.filter(d => !d.is_technical);

    let technicalFit = null;
    let nonTechnicalFit = null;

    if (curveType === 'decay') {
      technicalFit = technicalData.length >= 2 ? fitExponentialDecay(technicalData) : null;
      nonTechnicalFit = nonTechnicalData.length >= 2 ? fitExponentialDecay(nonTechnicalData) : null;
    } else {
      technicalFit = technicalData.length >= 2
        ? fitExponentialSaturation(technicalData, asymptoteMultiplier, slopeMultiplier, minAsymptoteMultiplier, regularizationStrength)
        : null;
      nonTechnicalFit = nonTechnicalData.length >= 2
        ? fitExponentialSaturation(nonTechnicalData, asymptoteMultiplier, slopeMultiplier, minAsymptoteMultiplier, regularizationStrength)
        : null;
    }

    return {
      technicalTrendline: technicalFit,
      nonTechnicalTrendline: nonTechnicalFit,
    };
  }, [chartData, curveType, asymptoteMultiplier, slopeMultiplier, minAsymptoteMultiplier, regularizationStrength, showTrendline]);

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
    <div className="relative">
      {(technicalTrendline || nonTechnicalTrendline) && (
        <div className="absolute top-0 right-0 text-xs bg-white px-2 py-1 rounded border border-gray-200 z-10 space-y-1">
          {technicalTrendline && (
            <div className="flex items-center gap-2">
              <span className="text-orange-600">Tech:</span>
              <span className="text-gray-500">R² = {technicalTrendline.rSquared.toFixed(3)}</span>
            </div>
          )}
          {nonTechnicalTrendline && (
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Non-tech:</span>
              <span className="text-gray-500">R² = {nonTechnicalTrendline.rSquared.toFixed(3)}</span>
            </div>
          )}
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
          {technicalTrendline && (
            <Line
              data={technicalTrendline.curvePoints}
              type="monotone"
              dataKey="y"
              stroke="#ea580c"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              isAnimationActive={false}
            />
          )}
          {nonTechnicalTrendline && (
            <Line
              data={nonTechnicalTrendline.curvePoints}
              type="monotone"
              dataKey="y"
              stroke="#6b7280"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              isAnimationActive={false}
            />
          )}
          <Scatter
            data={chartData}
            fillOpacity={0.6}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(SegmentScatterPlot);
