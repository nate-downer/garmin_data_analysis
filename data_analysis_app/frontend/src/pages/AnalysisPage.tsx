/**
 * Analysis Page - Shows aggregate visualizations across all activities and climb segments.
 */
import Header from '../components/layout/Header';
import ActivityAnalysisSection from '../components/analysis/ActivityAnalysisSection';
import ClimbSegmentAnalysisSection from '../components/analysis/ClimbSegmentAnalysisSection';
import { useAnalysisData } from '../hooks/useAnalysisData';

function AnalysisPage() {
  const { activities, climbSegments, loading, error } = useAnalysisData();

  if (error) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-2">Error Loading Analysis Data</h2>
            <p className="text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="text-lg text-gray-600">Loading analysis data...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Activity Analysis Section - 5 plots */}
        <div className="bg-gray-50 rounded-lg shadow-md p-6 mb-8">
          <ActivityAnalysisSection activities={activities} />
        </div>

        {/* Climb Segment Analysis Section - 7 plots */}
        <div className="bg-gray-50 rounded-lg shadow-md p-6">
          <ClimbSegmentAnalysisSection segments={climbSegments} />
        </div>
      </main>
    </div>
  );
}

export default AnalysisPage;
