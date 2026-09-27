import { SummaryStats as SummaryStatsType } from '../../types'
import { formatDistance, formatElevation, formatRelativeTime } from '../../utils/formatters'

interface SummaryStatsProps {
  stats: SummaryStatsType | null
  loading: boolean
}

function SummaryStats({ stats, loading }: SummaryStatsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="text-center animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-24 mx-auto mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-32 mx-auto"></div>
          </div>
        ))}
      </div>
    )
  }

  if (!stats) {
    return null
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* Total Activities */}
      <div className="text-center">
        <div className="stat-value">{stats.total_activities}</div>
        <div className="stat-label">Total Activities</div>
      </div>

      {/* Total Distance */}
      <div className="text-center">
        <div className="stat-value">{formatDistance(stats.total_distance_mi)}</div>
        <div className="stat-label">Total Distance</div>
      </div>

      {/* Total Elevation Gain */}
      <div className="text-center">
        <div className="stat-value">{formatElevation(stats.total_elevation_gain_ft)}</div>
        <div className="stat-label">Total Elevation Gain</div>
      </div>

      {/* Days Since Last Activity */}
      <div className="text-center">
        <div className="stat-value">{formatRelativeTime(stats.days_since_last_activity)}</div>
        <div className="stat-label">Last Activity</div>
      </div>
    </div>
  )
}

export default SummaryStats
