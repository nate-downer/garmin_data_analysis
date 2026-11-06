/**
 * Shared list+select+accordion-edit layout used by both the "Edit Activities"
 * (real activities) and "Plan Routes" (planned routes) pages - identical UI,
 * just filtered to a different subset of activities.
 */
import { useState } from 'react'
import Header from '../layout/Header'
import SummaryStats from '../layout/SummaryStats'
import ActivityListItem from './ActivityListItem'
import { useActivities } from '../../hooks/useActivities'
import { useSummaryStats } from '../../hooks/useSummaryStats'

interface ActivityListPageProps {
  isPlanned: boolean
  title: string
  initialSelectedActivityId?: string | null
}

function ActivityListPage({ isPlanned, title, initialSelectedActivityId }: ActivityListPageProps) {
  const { activities: allActivities, loading: activitiesLoading, error: activitiesError, refetch: refetchActivities } = useActivities()
  const { stats, loading: statsLoading, refetch: refetchStats } = useSummaryStats()
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(initialSelectedActivityId ?? null)

  const activities = allActivities
    .filter((activity) => Boolean(activity.is_planned) === isPlanned)
    .sort((a, b) => {
      // Planned routes sort alphabetically by name; real activities keep the
      // backend's date-descending order (stable sort preserves it below).
      if (!isPlanned) return 0
      const nameA = (a.activity_name || a.activity_id).toLowerCase()
      const nameB = (b.activity_name || b.activity_id).toLowerCase()
      return nameA.localeCompare(nameB)
    })

  const handleActivityChange = async () => {
    // Save current scroll position
    const scrollY = window.scrollY

    // Silent: a loading-toggling refetch would unmount/remount the whole list
    // mid-refresh, wiping any open accordion's local state (e.g. an in-progress
    // Predict Time form). This updates the underlying data in place instead.
    await Promise.all([refetchActivities(true), refetchStats()])

    // Restore scroll position after a brief delay to allow re-render
    setTimeout(() => {
      window.scrollTo(0, scrollY)
    }, 0)
  }

  const handleActivityDeleted = async () => {
    setSelectedActivityId(null)
    await handleActivityChange()
  }

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
      <Header onActivityUploaded={handleActivityChange} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mt-0">
          {/* Header Box with Summary Stats (real activities only - stats are global totals) */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 relative z-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">{title}</h2>
            {!isPlanned && <SummaryStats stats={stats} loading={statsLoading} />}
          </div>

          {activitiesLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-lg text-gray-600">Loading activities...</div>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500">
                {isPlanned
                  ? 'No planned routes found. Click "Add Activity" to plan one.'
                  : 'No activities found. Upload a GPX file to get started!'}
              </p>
            </div>
          ) : (
            <div className="relative pl-16">
              {/* Left vertical line - extends up to header box, behind it */}
              <div className="absolute left-8 bottom-0 w-1 bg-accent-400 z-0" style={{ top: '-7.5rem' }}></div>

              <div className="space-y-6">
                {activities.map((activity) => (
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
                    onActivityUpdated={handleActivityChange}
                    onDeleted={handleActivityDeleted}
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

export default ActivityListPage
