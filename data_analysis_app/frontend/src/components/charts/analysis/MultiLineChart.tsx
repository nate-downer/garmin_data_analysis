/**
 * Multi-activity elevation time series chart.
 * Shows elevation traces over time for multiple activities.
 */
import { memo, useMemo, useState, useEffect } from 'react';
import { LineChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Point } from '../../../types';
import { pointsAPI } from '../../../services/api';
import { formatElevation, formatDuration } from '../../../utils/formatters';

// No custom tooltip needed - we'll handle it differently

interface MultiLineChartProps {
  activities: Activity[];
  maxActivities?: number;
}

// Use grey for all activity traces
const TRACE_COLOR = '#9ca3af';

function MultiLineChart({ activities, maxActivities = 20 }: MultiLineChartProps) {
  const [pointsData, setPointsData] = useState<Record<string, Point[]>>({});
  const [loading, setLoading] = useState(true);
  const [hoveredActivity, setHoveredActivity] = useState<string | null>(null);

  // Select recent activities with elevation data
  const selectedActivities = useMemo(() => {
    return activities
      .filter(a => a.total_elevation_gain_ft && a.total_elevation_gain_ft > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, maxActivities);
  }, [activities, maxActivities]);

  // Fetch points for selected activities
  useEffect(() => {
    const fetchAllPoints = async () => {
      setLoading(true);
      const pointsMap: Record<string, Point[]> = {};

      try {
        await Promise.all(
          selectedActivities.map(async (activity) => {
            try {
              // Use decimated points for performance
              const points = await pointsAPI.getDecimated(activity.activity_id, 100, false);
              pointsMap[activity.activity_id] = points;
            } catch (err) {
              console.error(`Error fetching points for activity ${activity.activity_id}:`, err);
            }
          })
        );
        setPointsData(pointsMap);
      } finally {
        setLoading(false);
      }
    };

    if (selectedActivities.length > 0) {
      fetchAllPoints();
    } else {
      setLoading(false);
    }
  }, [selectedActivities]);

  // Transform points to chart data format
  const chartData = useMemo(() => {
    if (Object.keys(pointsData).length === 0) return [];

    // Find the maximum duration across all activities to set chart extent
    let maxDuration = 0;
    const activityData: Record<string, Array<{ time: number; elevation: number }>> = {};

    selectedActivities.forEach(activity => {
      const points = pointsData[activity.activity_id];
      if (!points || points.length === 0) return;

      const startTime = new Date(points[0].time).getTime();
      const trace = points.map(point => {
        const elapsedSeconds = (new Date(point.time).getTime() - startTime) / 1000;
        return {
          time: elapsedSeconds,
          elevation: point.elevation_ft,
        };
      });

      activityData[activity.activity_id] = trace;

      const duration = trace[trace.length - 1].time;
      if (duration > maxDuration) maxDuration = duration;
    });

    // Create unified time grid (every 60 seconds)
    const timeStep = 60; // seconds
    const numSteps = Math.ceil(maxDuration / timeStep);
    const timeGrid: number[] = [];
    for (let i = 0; i <= numSteps; i++) {
      timeGrid.push(i * timeStep);
    }

    // Interpolate each activity's elevation at grid points
    const gridData = timeGrid.map(t => {
      const dataPoint: any = { time: t };

      selectedActivities.forEach(activity => {
        const trace = activityData[activity.activity_id];
        if (!trace) return;

        // Find closest points and interpolate
        let elevation: number | null = null;

        if (t <= trace[0].time) {
          elevation = trace[0].elevation;
        } else if (t >= trace[trace.length - 1].time) {
          elevation = null; // Activity ended
        } else {
          // Linear interpolation
          for (let i = 0; i < trace.length - 1; i++) {
            if (trace[i].time <= t && t <= trace[i + 1].time) {
              const ratio = (t - trace[i].time) / (trace[i + 1].time - trace[i].time);
              elevation = trace[i].elevation + ratio * (trace[i + 1].elevation - trace[i].elevation);
              break;
            }
          }
        }

        dataPoint[activity.activity_id] = elevation;
      });

      return dataPoint;
    });

    return gridData;
  }, [pointsData, selectedActivities]);

  // Create data for end points scatter plot
  const endPoints = useMemo(() => {
    const points: Array<{ time: number; elevation: number; name: string }> = [];

    selectedActivities.forEach(activity => {
      const trace = pointsData[activity.activity_id];
      if (!trace || trace.length === 0) return;

      const startTime = new Date(trace[0].time).getTime();
      const lastPoint = trace[trace.length - 1];
      const elapsedSeconds = (new Date(lastPoint.time).getTime() - startTime) / 1000;

      points.push({
        time: elapsedSeconds,
        elevation: lastPoint.elevation_ft,
        name: activity.activity_name || new Date(activity.date).toLocaleDateString(),
      });
    });

    return points;
  }, [pointsData, selectedActivities]);

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">Loading elevation traces...</p>
      </div>
    );
  }

  if (selectedActivities.length === 0 || chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No elevation data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={chartData}
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="time"
          type="number"
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: 'Time', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
          tickFormatter={formatDuration}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: 'Elevation (ft)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
          tickFormatter={(value) => Math.round(value).toString()}
        />
        {selectedActivities.map((activity) => {
          const isHovered = hoveredActivity === activity.activity_id;

          // Custom dot function to only show dot at the last point
          const customDot = (props: any) => {
            const { cx, cy, payload, index } = props;

            // Check if this is the last point for this activity
            const activityValue = payload[activity.activity_id];
            if (activityValue === null || activityValue === undefined) return null;

            // Check if the next point is null (meaning this is the last point)
            const nextIndex = index + 1;
            const nextPoint = chartData[nextIndex];
            const isLastPoint = !nextPoint || nextPoint[activity.activity_id] === null;

            if (!isLastPoint) return null;

            const activityName = activity.activity_name || new Date(activity.date).toLocaleDateString();

            return (
              <g key={`dot-${activity.activity_id}-${index}`}>
                <circle
                  key={`circle-${activity.activity_id}-${index}`}
                  cx={cx}
                  cy={cy}
                  r={6}
                  fill="#ea580c"
                  fillOpacity={0.6}
                  onMouseEnter={() => setHoveredActivity(activity.activity_id)}
                  onMouseLeave={() => setHoveredActivity(null)}
                  style={{ cursor: 'pointer' }}
                />
                {hoveredActivity === activity.activity_id && (
                  <g key={`tooltip-${activity.activity_id}-${index}`}>
                    <rect
                      key={`rect-${activity.activity_id}-${index}`}
                      x={cx + 10}
                      y={cy - 12}
                      width={activityName.length * 7 + 16}
                      height={24}
                      fill="rgba(255, 255, 255, 0.95)"
                      stroke="#e5e7eb"
                      strokeWidth={1}
                      rx={4}
                      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
                    />
                    <text
                      key={`text-${activity.activity_id}-${index}`}
                      x={cx + 18}
                      y={cy + 4}
                      fontSize={12}
                      fontWeight="bold"
                      fill="#374151"
                    >
                      {activityName}
                    </text>
                  </g>
                )}
              </g>
            );
          };

          return (
            <Line
              key={activity.activity_id}
              name={activity.activity_name || new Date(activity.date).toLocaleDateString()}
              type="monotone"
              dataKey={activity.activity_id}
              stroke={isHovered ? '#ea580c' : TRACE_COLOR}
              strokeWidth={isHovered ? 3 : 1.5}
              dot={customDot}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
              opacity={isHovered ? 1 : (hoveredActivity ? 0.2 : 0.6)}
              style={{ transition: 'all 0.2s ease' }}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

export default memo(MultiLineChart);
