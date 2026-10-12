import { useState } from 'react'
import { Activity, TERRAIN_FACTORS } from '../../types'
import { activitiesAPI } from '../../services/api'

interface ActivityMetadataFormProps {
  activity: Activity
  onActivityUpdated?: () => void
}

function ActivityMetadataForm({ activity, onActivityUpdated }: ActivityMetadataFormProps) {
  const [activityName, setActivityName] = useState(activity.activity_name || '')
  const [bodyWeight, setBodyWeight] = useState(activity.body_weight_lbs || '')
  const [weightCarried, setWeightCarried] = useState(activity.weight_carried_lbs || '')
  const [terrainFactor, setTerrainFactor] = useState(activity.terrain_factor || 1.1)
  const [partySize, setPartySize] = useState(activity.party_size || '')
  const [notes, setNotes] = useState(activity.notes || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage(null)

      await activitiesAPI.update(activity.activity_id, {
        activity_name: activityName || undefined,
        body_weight_lbs: bodyWeight ? Number(bodyWeight) : undefined,
        weight_carried_lbs: weightCarried ? Number(weightCarried) : undefined,
        terrain_factor: terrainFactor,
        party_size: partySize ? Number(partySize) : undefined,
        notes: notes || undefined,
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
      {/* Read-only Timezone Info */}
      {activity.timezone && (
        <div className="grid grid-cols-2 gap-3 pb-4 border-b border-gray-200">
          <div>
            <span className="text-xs font-medium text-gray-500">Timezone</span>
            <p className="text-sm text-gray-700">{activity.timezone}</p>
          </div>
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

        {/* Body Weight and Pack Weight - side by side */}
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

        {/* Default Terrain Factor and Party Size - side by side */}
        <div className="grid grid-cols-2 gap-3">
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
            </p>
          </div>

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
        </div>

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

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full btn-primary disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Metadata'}
      </button>

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
