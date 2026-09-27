import { Activity } from '../../types'
import {
  formatDate,
  formatDuration,
  formatDistance,
  formatElevation,
  formatActivityType,
} from '../../utils/formatters'
import ActivityEditor from './ActivityEditor'

interface ActivityListItemProps {
  activity: Activity
  isSelected: boolean
  onClick: () => void
}

function ActivityListItem({ activity, isSelected, onClick }: ActivityListItemProps) {
  return (
    <div className="relative">
      {/* Connector dot - centered on the vertical line */}
      <div className="absolute top-8 w-5 h-5 rounded-full bg-white border-accent-500 shadow-md z-10 -translate-x-1/2"
           style={{ borderWidth: '3px', left: 'calc(-2rem + 2px)' }}></div>

      {/* Horizontal connector line from dot to box */}
      <div className="absolute top-[2.625rem] h-0.5 bg-accent-400"
           style={{ left: 'calc(-2rem + 2px)', width: 'calc(2rem - 2px)' }}></div>

      {/* Activity Box */}
      <div
        className={`bg-white rounded-lg shadow-md p-6 cursor-pointer transition-all duration-200 hover:shadow-lg ${
          isSelected ? 'ring-2 ring-accent-500' : ''
        }`}
        onClick={onClick}
      >
        <div className="flex items-center justify-between">
          {/* Activity info */}
          <div className="flex-1">
            <div className="flex items-center space-x-3 flex-wrap">
              <div className="text-sm text-gray-500">{formatDate(activity.date)}</div>
              <div className="h-4 w-px bg-gray-300"></div>
              <div className="text-lg font-semibold text-gray-900">
                {activity.activity_name || activity.activity_id}
              </div>
              <div className="text-sm text-gray-500 uppercase tracking-wide">
                {formatActivityType(activity.activity_type)}
              </div>
            </div>

            {/* Stats row */}
            <div className="mt-3 flex space-x-6 text-sm flex-wrap">
              <div>
                <span className="text-gray-500">Time:</span>{' '}
                <span className="font-medium text-gray-900">
                  {formatDuration(activity.total_duration_sec)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Distance:</span>{' '}
                <span className="font-medium text-gray-900">
                  {formatDistance(activity.total_distance_mi)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Elevation Gain:</span>{' '}
                <span className="font-medium text-gray-900">
                  {formatElevation(activity.total_elevation_gain_ft)}
                </span>
              </div>
            </div>
          </div>

          {/* Expand indicator */}
          <div className="ml-4">
            <svg
              className={`w-6 h-6 text-gray-400 transition-transform duration-200 ${
                isSelected ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        {/* Expanded content - Activity Editor */}
        {isSelected && (
          <div
            className="mt-6 pt-6 border-t border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <ActivityEditor activity={activity} />
          </div>
        )}
      </div>
    </div>
  )
}

export default ActivityListItem
