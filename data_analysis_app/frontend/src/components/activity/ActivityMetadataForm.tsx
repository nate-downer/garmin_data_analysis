import { useState } from 'react'
import { Activity, TERRAIN_FACTORS, EXPERIENCE_LEVELS, ACTIVITY_TYPES } from '../../types'
import { activitiesAPI } from '../../services/api'
import { formatActivityType } from '../../utils/formatters'
import { useAuth } from '../../context/AuthContext'

interface ActivityMetadataFormProps {
  activity: Activity
  onActivityUpdated?: () => void
  onDeleted?: () => void
}

function ActivityMetadataForm({ activity, onActivityUpdated, onDeleted }: ActivityMetadataFormProps) {
  const { isAdmin } = useAuth()
  const [activityName, setActivityName] = useState(activity.activity_name || '')
  const [activityType, setActivityType] = useState(activity.activity_type || 'mountaineering')
  const [bodyWeight, setBodyWeight] = useState(activity.body_weight_lbs || '')
  const [weightCarried, setWeightCarried] = useState(activity.weight_carried_lbs || '')
  const [terrainFactor, setTerrainFactor] = useState(activity.terrain_factor || 1.1)
  const [experienceLevel, setExperienceLevel] = useState(activity.experience_level || 'New Route - Familiar Skills')
  const [partySize, setPartySize] = useState(activity.party_size || '')
  const [notes, setNotes] = useState(activity.notes || '')
  const [isPublic, setIsPublic] = useState(activity.is_public)
  const [startTimeLocal, setStartTimeLocal] = useState(activity.start_time_local ? activity.start_time_local.slice(0, 16) : '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const handleDelete = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    if (!isAdmin) {
      alert('This feature is disabled in Viewer mode')
      return
    }

    const label = activity.activity_name || activity.activity_id
    if (!window.confirm(`Delete "${label}"? This permanently removes the activity and all its points and segments. This cannot be undone.`)) {
      return
    }

    try {
      setDeleting(true)
      setMessage(null)
      await activitiesAPI.delete(activity.activity_id)
      if (onDeleted) {
        onDeleted()
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete activity' })
      console.error('Error deleting activity:', error)
      setDeleting(false)
    }
  }

  const handleSave = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    if (!isAdmin) {
      alert('This feature is disabled in Viewer mode')
      return
    }

    try {
      setSaving(true)
      setMessage(null)

      await activitiesAPI.update(activity.activity_id, {
        activity_name: activityName || undefined,
        activity_type: activityType,
        terrain_factor: terrainFactor,
        notes: notes || undefined,
        is_public: isPublic,
        ...(activity.is_planned
          ? (startTimeLocal ? { start_time_local: startTimeLocal } : {})
          : {
              body_weight_lbs: bodyWeight ? Number(bodyWeight) : undefined,
              weight_carried_lbs: weightCarried ? Number(weightCarried) : undefined,
              party_size: partySize ? Number(partySize) : undefined,
              experience_level: experienceLevel,
            }),
      })

      setMessage({ type: 'success', text: 'Saved successfully!' })
      setTimeout(() => setMessage(null), 3000)

      // Refresh stats after successful save
      if (onActivityUpdated) {
        onActivityUpdated()
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save' })
      console.error('Error saving metadata:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Public/Private - at the top since it governs who can see this activity at all.
          Hidden entirely in Viewer mode, not just disabled - a viewer has no business
          knowing this control exists at all. */}
      {isAdmin && (
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div>
            <span className="block text-sm font-medium text-gray-700">
              {isPublic ? 'Public' : 'Private'}
            </span>
            <span className="text-xs text-gray-500">
              {isPublic ? 'Visible to anyone viewing the site' : 'Hidden from view-only visitors'}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isPublic}
            onClick={() => setIsPublic(!isPublic)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 ${
              isPublic ? 'bg-accent-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                isPublic ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {/* Start Time / Timezone - editable start time for planned routes, read-only for recorded ones */}
      {activity.is_planned ? (
        <div className="pb-4 border-b border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Time
          </label>
          <input
            type="datetime-local"
            value={startTimeLocal}
            onChange={(e) => setStartTimeLocal(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Hypothetical start time for this planned route - shifts all its points and segments.
          </p>
        </div>
      ) : activity.timezone && (
        <div className="grid grid-cols-2 gap-3 pb-4 border-b border-gray-200">
          {activity.start_time_local && (
            <div>
              <span className="text-xs font-medium text-gray-500">Start Time (Local)</span>
              <p className="text-sm text-gray-700">
                {new Date(activity.start_time_local).toLocaleString([], {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })}
              </p>
            </div>
          )}
          <div>
            <span className="text-xs font-medium text-gray-500">Timezone</span>
            <p className="text-sm text-gray-700 break-words">{activity.timezone}</p>
          </div>
        </div>
      )}

      {/* Editable Fields */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Activity Name
          </label>
          <input
            type="text"
            value={activityName}
            onChange={(e) => setActivityName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            placeholder="Enter activity name..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Activity Type
          </label>
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {formatActivityType(type)}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Used by the time-prediction model - fix this if the auto-detected default doesn't match what this activity actually was.
          </p>
        </div>

        {/* Body Weight and Pack Weight - side by side (not for planned routes - set per-prediction in the Predict Time panel instead) */}
        {!activity.is_planned && (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Body Weight (lbs)
                </label>
                <input
                  type="number"
                  value={bodyWeight}
                  onChange={(e) => setBodyWeight(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pack Weight (lbs)
                </label>
                <input
                  type="number"
                  value={weightCarried}
                  onChange={(e) => setWeightCarried(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                  placeholder="0"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Required for energy calculations
            </p>
          </div>
        )}

        {/* Default Terrain Factor and Party Size - side by side (Party Size moves to Predict Time for planned routes) */}
        <div className={activity.is_planned ? '' : 'grid grid-cols-2 gap-3'}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Terrain Factor
            </label>
            <select
              value={terrainFactor}
              onChange={(e) => setTerrainFactor(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              {Object.entries(TERRAIN_FACTORS).map(([name, value]) => (
                <option key={name} value={value}>
                  {name} ({value})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Default for all segments
              {activity.is_planned && ' — body weight, pack weight, and party size are set per-prediction in the Predict Time panel below.'}
            </p>
          </div>

          {!activity.is_planned && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Party Size
              </label>
              <input
                type="number"
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                placeholder="1"
              />
            </div>
          )}
        </div>

        {/* Experience Level - not for planned routes, set per-prediction in the Predict Time panel instead */}
        {!activity.is_planned && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Experience Level
            </label>
            <select
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              How familiar you are with this route and the skills it requires - used by the time-prediction model.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            placeholder="Add notes about this activity..."
          />
        </div>
      </div>

      {/* Save / Delete Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || deleting}
          className={`flex-1 btn-primary disabled:opacity-50 ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {saving ? 'Saving...' : 'Save Metadata'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving || deleting}
          className={`flex-1 px-4 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {deleting ? 'Deleting...' : 'Delete Activity'}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`text-sm text-center ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </div>
      )}
    </div>
  )
}

export default ActivityMetadataForm
