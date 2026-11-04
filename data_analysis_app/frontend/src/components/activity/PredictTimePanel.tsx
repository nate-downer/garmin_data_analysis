/**
 * Predict Time panel - lets the user pick a fitted model run and a hypothetical
 * start time, then shows per-segment and total trip time predictions with
 * Bayesian uncertainty surfaced as distributions.
 */
import { useEffect, useState } from 'react'
import { Activity, ModelRunSummary, PredictionResult } from '../../types'
import { modelsAPI, predictionsAPI } from '../../services/api'
import PredictionDistributionChart from '../charts/analysis/PredictionDistributionChart'
import PredictionCumulativeChart from '../charts/analysis/PredictionCumulativeChart'

interface PredictTimePanelProps {
  activity: Activity
}

const formatMinutes = (value: number) => {
  const hours = Math.floor(value / 60)
  const minutes = Math.round(value % 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

const defaultStartTime = (activity: Activity) =>
  activity.start_time_local ? activity.start_time_local.slice(0, 16) : ''

function PredictTimePanel({ activity }: PredictTimePanelProps) {
  const [runs, setRuns] = useState<ModelRunSummary[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [selectedRunId, setSelectedRunId] = useState<string>('')
  const [startTime, setStartTime] = useState(defaultStartTime(activity))
  const [predicting, setPredicting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PredictionResult | null>(null)

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
    if (!selectedRunId || !startTime) return
    try {
      setPredicting(true)
      setError(null)
      const data = await predictionsAPI.predict(activity.activity_id, {
        run_id: selectedRunId,
        start_time: startTime,
      })
      setResult(data)
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
        <p className="text-xs text-gray-500 mt-1">
          Group size, pack weight, and body weight come from Activity Details above.
        </p>
      </div>

      <button
        type="button"
        onClick={handlePredict}
        disabled={predicting || !selectedRunId || !startTime}
        className="w-full btn-primary disabled:opacity-50"
      >
        {predicting ? 'Predicting...' : 'Predict Time'}
      </button>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {result && (
        <div className="space-y-6 pt-2">
          <div className="text-center">
            <span className="text-sm text-gray-500">Predicted Total Time: </span>
            <span className="text-lg font-semibold text-gray-800">{formatMinutes(result.total_mean_min)}</span>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2 text-gray-700">Total Time Distribution</h4>
            <PredictionDistributionChart draws={result.total_distribution_min} meanMin={result.total_mean_min} />
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2 text-gray-700">Cumulative Time vs. Distance</h4>
            <PredictionCumulativeChart points={result.cumulative_points} />
          </div>

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
