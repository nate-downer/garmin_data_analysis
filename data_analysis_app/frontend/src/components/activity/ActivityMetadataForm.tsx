import { useState } from 'react'
import { Activity } from '../../types'
import { activitiesAPI } from '../../services/api'

interface ActivityMetadataFormProps {
  activity: Activity
  onActivityUpdated?: () => void
}

function ActivityMetadataForm({ activity, onActivityUpdated }: ActivityMetadataFormProps) {
  const [activityName, setActivityName] = useState(activity.activity_name || '')
  const [weightCarried, setWeightCarried] = useState(activity.weight_carried_lbs || '')
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
        weight_carried_lbs: weightCarried ? Number(weightCarried) : undefined,
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
        <div className="space-y-2 pb-4 border-b border-gray-200">
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
          <div>
            <span className="text-xs font-medium text-gray-500">Start Time (UTC)</span>
            <p className="text-sm text-gray-700">
              {new Date(activity.start_time_utc).toLocaleString([], {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'UTC'
              })} UTC
            </p>
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
            Weight Carried (lbs)
          </label>
          <input
            type="number"
            value={weightCarried}
            onChange={(e) => setWeightCarried(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            placeholder="0"
          />
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
