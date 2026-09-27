import { useState } from 'react'
import Header from '../components/layout/Header'
import SummaryStats from '../components/layout/SummaryStats'
import ActivityListItem from '../components/activity/ActivityListItem'
import { useActivities } from '../hooks/useActivities'
import { useSummaryStats } from '../hooks/useSummaryStats'

function HomePage() {
  const { activities, loading: activitiesLoading, error: activitiesError } = useActivities()
  const { stats, loading: statsLoading } = useSummaryStats()
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  if (activitiesError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">Error Loading Activities</h2>
          <p className="text-gray-600">{activitiesError}</p>
          <p className="text-sm text-gray-500 mt-4">
            Make sure the backend API is running at http://localhost:8000
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Activity List */}
        <div className="mt-0">
          {/* Activities Header Box with Summary Stats */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 relative z-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Activities</h2>
            <SummaryStats stats={stats} loading={statsLoading} />
          </div>

          {activitiesLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-lg text-gray-600">Loading activities...</div>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500">No activities found. Upload a GPX file to get started!</p>
            </div>
          ) : (
            <div className="relative pl-16">
              {/* Left vertical line - extends up to header box, behind it */}
              <div className="absolute left-8 bottom-0 w-1 bg-accent-400 z-0" style={{ top: '-7.5rem' }}></div>

              {/* Activities */}
              <div className="space-y-6">
                {activities.map((activity, index) => (
                  <ActivityListItem
                    key={activity.id}
                    activity={activity}
                    isSelected={selectedActivityId === activity.activity_id}
                    onClick={() => {
                      setSelectedActivityId(
                        selectedActivityId === activity.activity_id
                          ? null
                          : activity.activity_id
                      )
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default HomePage
