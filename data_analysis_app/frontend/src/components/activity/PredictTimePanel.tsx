/**
 * Predict Time panel - lets the user pick a fitted model run, a hypothetical
 * start time, and trip parameters, then shows per-segment time predictions.
 * The distribution/cumulative charts themselves render in the main plot window
 * (see ActivityEditor), not here - this panel just drives the prediction and
 * shows the numeric summary.
 */
import { useEffect, useState } from 'react'
import { Activity, ModelRunSummary, PredictionResult, EXPERIENCE_LEVELS } from '../../types'
import { modelsAPI, predictionsAPI } from '../../services/api'

interface PredictTimePanelProps {
  activity: Activity
  result: PredictionResult | null
  onResultChange: (result: PredictionResult | null) => void
  onActivityUpdated?: () => void
}

const formatMinutes = (value: number) => {
  const hours = Math.floor(value / 60)
  const minutes = Math.round(value % 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

const formatTimeOfDay = (isoTime: string) =>
  new Date(isoTime).toLocaleTimeString([], { timeStyle: 'short' })

const defaultStartTime = (activity: Activity) =>
  activity.start_time_local ? activity.start_time_local.slice(0, 16) : ''

function PredictTimePanel({ activity, result, onResultChange, onActivityUpdated }: PredictTimePanelProps) {
  const [runs, setRuns] = useState<ModelRunSummary[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [selectedRunId, setSelectedRunId] = useState<string>('')
  const [startTime, setStartTime] = useState(defaultStartTime(activity))
  const [bodyWeight, setBodyWeight] = useState(activity.body_weight_lbs ? String(activity.body_weight_lbs) : '')
  const [packWeight, setPackWeight] = useState(activity.weight_carried_lbs ? String(activity.weight_carried_lbs) : '')
  const [partySize, setPartySize] = useState(activity.party_size ? String(activity.party_size) : '1')
  const [experienceLevel, setExperienceLevel] = useState(activity.experience_level || 'New Route - Familiar Skills')
  const [predicting, setPredicting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canPredict = Boolean(selectedRunId && startTime && bodyWeight && packWeight && partySize)

  useEffect(() => {
    modelsAPI.getRuns().then((allRuns) => {
      const predictable = allRuns.filter((r) => r.is_predictable)
      setRuns(predictable)
      if (predictable.length > 0) {
        setSelectedRunId(predictable[0].run_id)
      }
      setRunsLoading(false)
    }).catch(() => setRunsLoading(false))
  }, [])

  const handlePredict = async () => {
    if (!canPredict) return
    try {
      setPredicting(true)
      setError(null)
      const data = await predictionsAPI.predict(activity.activity_id, {
        run_id: selectedRunId,
        start_time: startTime,
        body_weight_lbs: Number(bodyWeight),
        pack_weight_lbs: Number(packWeight),
        party_size: Number(partySize),
        experience_level: experienceLevel,
      })
      onResultChange(data)

      // The backend saves the full result (and the list view's summary field)
      // as part of handling the predict request - just refresh the list in the
      // background so the collapsed box picks up the new projected time.
      onActivityUpdated?.()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate prediction')
      console.error('Prediction error:', err)
    } finally {
      setPredicting(false)
    }
  }

  if (runsLoading) {
    return <p className="text-sm text-gray-500">Loading available models...</p>
  }

  if (runs.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No fitted models available yet. Go to "Build Model" and click "Fit Models" first.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Model Run</label>
        <select
          value={selectedRunId}
          onChange={(e) => setSelectedRunId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
        >
          {runs.map((run) => (
            <option key={run.run_id} value={run.run_id}>
              {new Date(run.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              {' '}({run.n_activities_total} activities)
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
        <input
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Body Weight (lbs)</label>
          <input
            type="number"
            value={bodyWeight}
            onChange={(e) => setBodyWeight(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pack Weight (lbs)</label>
          <input
            type="number"
            value={packWeight}
            onChange={(e) => setPackWeight(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Party Size</label>
          <input
            type="number"
            value={partySize}
            onChange={(e) => setPartySize(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            placeholder="1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Experience Level</label>
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
        </div>
      </div>
      <p className="text-xs text-gray-500 -mt-2">
        These apply to this prediction only - try different combinations freely.
      </p>

      <button
        type="button"
        onClick={handlePredict}
        disabled={predicting || !canPredict}
        className="w-full btn-primary disabled:opacity-50"
      >
        {predicting ? 'Predicting...' : 'Predict Time'}
      </button>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {result && (
        <div className="space-y-4 pt-2">
          <div className="text-center">
            <div className="text-xs text-gray-500">Predicted Total Time</div>
            <div className="text-2xl font-semibold text-gray-800">{formatMinutes(result.total_mean_min)}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-xs text-gray-500">Predicted Active Time</div>
              <div className="text-base font-medium text-gray-700">{formatMinutes(result.active_mean_min)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Predicted Finish Time</div>
              <div className="text-base font-medium text-gray-700">{formatTimeOfDay(result.finish_time)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Predicted Rest Time</div>
              <div className="text-base font-medium text-gray-700">{formatMinutes(result.rest_mean_min)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Predicted Summit Time</div>
              <div className="text-base font-medium text-gray-700">
                {result.summit_time !== null ? formatTimeOfDay(result.summit_time) : 'No climbing segments'}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center">
            See the distribution and cumulative-time charts in the plot window above.
          </p>

          <div>
            <h4 className="text-sm font-semibold mb-2 text-gray-700">Per-Segment Predictions</h4>
            <div className="space-y-1">
              {result.segments.map((seg, i) => (
                <div key={seg.segment_id} className="flex justify-between text-sm py-1 border-b border-gray-100">
                  <span className="text-gray-600">
                    {i + 1}. {seg.segment_type_5.replace(/_/g, ' ')} ({seg.distance_mi.toFixed(1)} mi, {Math.round(seg.elevation_gain_ft)} ft)
                  </span>
                  <span className="font-medium text-gray-800">{formatMinutes(seg.mean_predicted_min)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PredictTimePanel
