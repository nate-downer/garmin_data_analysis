/**
 * Climb Segment Analysis Section - Shows 7 visualizations for climb segments.
 */
import { useMemo } from 'react';
import SegmentScatterPlot from '../charts/analysis/SegmentScatterPlot';
import HorizontalBarChart from '../charts/analysis/HorizontalBarChart';
import { UserSegmentWithActivity } from '../../types';
import { formatDistance, formatElevation, formatSpeed, formatGrade } from '../../utils/formatters';

interface ClimbSegmentAnalysisSectionProps {
  segments: UserSegmentWithActivity[];
}

function ClimbSegmentAnalysisSection({ segments }: ClimbSegmentAnalysisSectionProps) {
  // Transform data for top 10 charts
  const topByClimbRate = useMemo(() => {
    return segments
      .filter(s => s.climb_rate_ft_per_hr && s.climb_rate_ft_per_hr > 0)
      .sort((a, b) => (b.climb_rate_ft_per_hr || 0) - (a.climb_rate_ft_per_hr || 0))
      .slice(0, 10)
      .map(s => ({
        name: `${s.activity_name || 'Unnamed'} (${new Date(s.activity_date).toLocaleDateString()})`,
        value: s.climb_rate_ft_per_hr || 0,
        color: s.is_technical ? '#ea580c' : '#6b7280', // Orange for technical, grey for non-technical
      }));
  }, [segments]);

  const topByElevation = useMemo(() => {
    return segments
      .filter(s => s.elevation_gain_ft && s.elevation_gain_ft > 0)
      .sort((a, b) => (b.elevation_gain_ft || 0) - (a.elevation_gain_ft || 0))
      .slice(0, 10)
      .map(s => ({
        name: `${s.activity_name || 'Unnamed'} (${new Date(s.activity_date).toLocaleDateString()})`,
        value: s.elevation_gain_ft || 0,
        color: s.is_technical ? '#ea580c' : '#6b7280', // Orange for technical, grey for non-technical
      }));
  }, [segments]);

  // Format functions for scatter plots
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatClimbRate = (ftPerHr: number) => `${ftPerHr.toFixed(0)} ft/hr`;

  const formatPower = (watts: number) => `${watts.toFixed(0)} W`;

  const formatEnergy = (kcal: number) => `${kcal.toFixed(0)} kcal`;

  if (segments.length === 0) {
    return (
      <div>
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Climb Segment Analysis</h2>
        </div>
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-500">
            No climb segments found. Create climb segments on your activities to see analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Climb Segment Analysis</h2>
      </div>

      {/* Two-column grid - 8 plots */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Scatter: duration vs distance */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Duration vs Distance</h3>
          <SegmentScatterPlot
            segments={segments}
            xKey="duration_sec"
            yKey="distance_mi"
            xLabel="Duration"
            yLabel="Distance (mi)"
            xFormatter={formatDuration}
            yFormatter={formatDistance}
          />
        </div>

        {/* 2. Scatter: duration vs elevation */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Duration vs Elevation Gain</h3>
          <SegmentScatterPlot
            segments={segments}
            xKey="duration_sec"
            yKey="elevation_gain_ft"
            xLabel="Duration"
            yLabel="Elevation Gain (ft)"
            xFormatter={formatDuration}
            yFormatter={formatElevation}
          />
        </div>

        {/* 3. Bar: top 10 by climb rate */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Top 10 by Climb Rate</h3>
          <HorizontalBarChart
            data={topByClimbRate}
            dataKey="value"
            label="Climb Rate"
            formatter={formatClimbRate}
            color="#6b7280"
          />
        </div>

        {/* 4. Bar: top 10 by elevation */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Top 10 by Elevation Gain</h3>
          <HorizontalBarChart
            data={topByElevation}
            dataKey="value"
            label="Elevation Gain"
            formatter={formatElevation}
            color="#6b7280"
          />
        </div>

        {/* 5. Scatter: grade vs speed */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Average Grade vs Average Speed</h3>
          <SegmentScatterPlot
            segments={segments}
            xKey="avg_grade_percent"
            yKey="avg_speed_mph"
            xLabel="Grade (%)"
            yLabel="Speed (mph)"
            xFormatter={formatGrade}
            yFormatter={formatSpeed}
            curveType="decay"
          />
        </div>

        {/* 6. Scatter: power vs climb rate */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Average Power vs Climb Rate</h3>
          <SegmentScatterPlot
            segments={segments}
            xKey="avg_power_watts"
            yKey="climb_rate_ft_per_hr"
            xLabel="Power (W)"
            yLabel="Climb Rate (ft/hr)"
            xFormatter={formatPower}
            yFormatter={formatClimbRate}
            showTrendline={false}
          />
        </div>

        {/* 7. Scatter: total energy vs elevation gain */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Total Energy vs Elevation Gain</h3>
          <SegmentScatterPlot
            segments={segments}
            xKey="total_energy_kcal"
            yKey="elevation_gain_ft"
            xLabel="Energy (kcal)"
            yLabel="Elevation Gain (ft)"
            xFormatter={formatEnergy}
            yFormatter={formatElevation}
            showTrendline={false}
          />
        </div>

        {/* 8. Scatter: distance vs climb rate */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Distance vs Climb Rate</h3>
          <SegmentScatterPlot
            segments={segments}
            xKey="distance_mi"
            yKey="climb_rate_ft_per_hr"
            xLabel="Distance (mi)"
            yLabel="Climb Rate (ft/hr)"
            xFormatter={formatDistance}
            yFormatter={formatClimbRate}
            showTrendline={false}
          />
        </div>
      </div>
    </div>
  );
}

export default ClimbSegmentAnalysisSection;
