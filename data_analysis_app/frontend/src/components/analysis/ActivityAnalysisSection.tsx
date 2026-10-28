/**
 * Activity Analysis Section - Shows 5 visualizations for all activities.
 */
import { useMemo } from 'react';
import ActivityScatterPlot from '../charts/analysis/ActivityScatterPlot';
import HorizontalBarChart from '../charts/analysis/HorizontalBarChart';
import MultiLineChart from '../charts/analysis/MultiLineChart';
import { Activity } from '../../types';
import { formatDistance, formatElevation } from '../../utils/formatters';

interface ActivityAnalysisSectionProps {
  activities: Activity[];
}

function ActivityAnalysisSection({ activities }: ActivityAnalysisSectionProps) {
  // Transform data for top 10 charts
  const topByDistance = useMemo(() => {
    return activities
      .filter(a => a.total_distance_mi && a.total_distance_mi > 0)
      .sort((a, b) => (b.total_distance_mi || 0) - (a.total_distance_mi || 0))
      .slice(0, 10)
      .map(a => ({
        name: a.activity_name || new Date(a.date).toLocaleDateString(),
        value: a.total_distance_mi || 0,
      }));
  }, [activities]);

  const topByElevation = useMemo(() => {
    return activities
      .filter(a => a.total_elevation_gain_ft && a.total_elevation_gain_ft > 0)
      .sort((a, b) => (b.total_elevation_gain_ft || 0) - (a.total_elevation_gain_ft || 0))
      .slice(0, 10)
      .map(a => ({
        name: a.activity_name || new Date(a.date).toLocaleDateString(),
        value: a.total_elevation_gain_ft || 0,
      }));
  }, [activities]);

  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <p className="text-gray-500">No activities found. Upload GPX files to see analysis.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Activity Analysis</h2>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Elevation traces - full width */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Elevation Traces Over Time</h3>
          <MultiLineChart activities={activities} />
        </div>

        {/* 2. Scatter: duration vs distance */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Duration vs Distance</h3>
          <ActivityScatterPlot
            data={activities}
            xKey="total_duration_sec"
            yKey="total_distance_mi"
            xLabel="Duration"
            yLabel="Distance (mi)"
            asymptoteMultiplier={2.5}
          />
        </div>

        {/* 3. Scatter: duration vs elevation */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Duration vs Elevation Gain</h3>
          <ActivityScatterPlot
            data={activities}
            xKey="total_duration_sec"
            yKey="total_elevation_gain_ft"
            xLabel="Duration"
            yLabel="Elevation Gain (ft)"
            asymptoteMultiplier={2.5}
          />
        </div>

        {/* 4. Bar: top 10 by distance */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Top 10 by Distance</h3>
          <HorizontalBarChart
            data={topByDistance}
            dataKey="value"
            label="Distance"
            formatter={formatDistance}
            color="#ea580c"
          />
        </div>

        {/* 5. Bar: top 10 by elevation */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Top 10 by Elevation Gain</h3>
          <HorizontalBarChart
            data={topByElevation}
            dataKey="value"
            label="Elevation Gain"
            formatter={formatElevation}
            color="#16a34a"
          />
        </div>
      </div>
    </div>
  );
}

export default ActivityAnalysisSection;
