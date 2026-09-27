import { useState, useEffect, useCallback, useRef, startTransition, useMemo, memo } from 'react'
import { Activity, Point, UserSegment } from '../../types'
import { pointsAPI, segmentsAPI, userSegmentsAPI } from '../../services/api'
import ActivityMap from '../map/ActivityMap'
import ElevationChart from '../charts/ElevationChart'
import SpeedChart from '../charts/SpeedChart'
import ActivityMetadataForm from './ActivityMetadataForm'

// Helper function to get segment colors
const getSegmentColors = (segmentType: 'climb' | 'descent' | 'flat' | 'rest') => {
  switch (segmentType) {
    case 'climb':
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-400',
        ring: 'ring-orange-400',
        highlight: '#ea580c', // orange-600
        leftBar: 'border-l-orange-600',
      }
    case 'descent':
      return {
        bg: 'bg-blue-50',
        border: 'border-blue-400',
        ring: 'ring-blue-400',
        highlight: '#2563eb', // blue-600
        leftBar: 'border-l-blue-600',
      }
    case 'rest':
      return {
        bg: 'bg-green-50',
        border: 'border-green-400',
        ring: 'ring-green-400',
        highlight: '#16a34a', // green-600
        leftBar: 'border-l-green-600',
      }
    case 'flat':
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-400',
        ring: 'ring-gray-400',
        highlight: '#6b7280', // gray-500
        leftBar: 'border-l-gray-500',
      }
  }
}

// Helper function to calculate segment metadata
const calculateSegmentMetadata = (points: Point[], startTime: string, endTime: string) => {
  const segmentPoints = points.filter(p => p.time >= startTime && p.time <= endTime)

  if (segmentPoints.length < 2) {
    return { distance: 0, duration: 0, elevationChange: 0 }
  }

  // Calculate distance using haversine
  let totalDistance = 0
  for (let i = 0; i < segmentPoints.length - 1; i++) {
    const p1 = segmentPoints[i]
    const p2 = segmentPoints[i + 1]
    const R = 3959 // Earth's radius in miles
    const dLat = (p2.lat - p1.lat) * Math.PI / 180
    const dLon = (p2.lon - p1.lon) * Math.PI / 180
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    totalDistance += R * c
  }

  // Calculate duration
  const duration = (new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60) // minutes

  // Calculate net elevation change
  const elevationChange = segmentPoints[segmentPoints.length - 1].elevation_ft - segmentPoints[0].elevation_ft

  return { distance: totalDistance, duration, elevationChange }
}

// Accordion section component
const AccordionSection = memo(({
  id,
  title,
  isOpen,
  onToggle,
  children,
  expandContent = false
}: {
  id: string
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
  expandContent?: boolean
}) => {
  return (
    <div className={`border-b border-gray-200 last:border-b-0 ${isOpen && expandContent ? 'flex flex-col flex-1' : ''}`}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className={`px-4 pb-4 ${expandContent ? 'flex-1 overflow-auto' : ''}`}>
          {children}
        </div>
      )}
    </div>
  )
})

// Inline segment editor (for both create and edit)
const SegmentEditor = memo(({
  timeRange,
  points,
  editingSegment,
  onSave,
  onCancel,
  onDelete,
  onUpdateTimeRange
}: {
  timeRange: { start: string; end: string } | null
  points: Point[]
  editingSegment?: UserSegment
  onSave: (data: {
    timeRange: { start: string; end: string },
    terrainType: 'rest' | 'non-technical' | 'technical',
    difficulty?: string,
    pitchCount?: number
  }) => void
  onCancel: () => void
  onDelete?: () => void
  onUpdateTimeRange?: (timeRange: { start: string; end: string }) => void
}) => {
  const [terrainType, setTerrainType] = useState<'rest' | 'non-technical' | 'technical'>(
    editingSegment
      ? editingSegment.segment_type === 'rest'
        ? 'rest'
        : editingSegment.is_technical
        ? 'technical'
        : 'non-technical'
      : 'non-technical'
  )

  // Technical climb metadata
  const [difficulty, setDifficulty] = useState(editingSegment?.difficulty || '')
  const [pitchCount, setPitchCount] = useState<number>(editingSegment?.pitch_count || 0)

  // Initialize time range from editing segment if present
  const effectiveTimeRange = timeRange || (editingSegment ? { start: editingSegment.start_time, end: editingSegment.end_time } : null)

  // Calculate segment metadata - MUST be called before any conditional returns
  const metadata = useMemo(() => {
    if (!effectiveTimeRange) return null
    try {
      if (!effectiveTimeRange) return null
      if (!points || points.length === 0) return null

      // Filter points in time range
      const segmentPoints = points.filter(p =>
        p && p.time && p.time >= effectiveTimeRange.start && p.time <= effectiveTimeRange.end
      )

      if (segmentPoints.length < 2) {
        return null
      }

    // Calculate distance
    let totalDistance = 0
    for (let i = 0; i < segmentPoints.length - 1; i++) {
      const p1 = segmentPoints[i]
      const p2 = segmentPoints[i + 1]
      const R = 3959 // Earth's radius in miles
      const dLat = (p2.lat - p1.lat) * Math.PI / 180
      const dLon = (p2.lon - p1.lon) * Math.PI / 180
      const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
      totalDistance += R * c
    }

    // Calculate elevation change
    const elevationChange = segmentPoints[segmentPoints.length - 1].elevation_ft - segmentPoints[0].elevation_ft
    let elevationGain = 0
    let elevationLoss = 0
    for (let i = 0; i < segmentPoints.length - 1; i++) {
      const delta = segmentPoints[i + 1].elevation_ft - segmentPoints[i].elevation_ft
      if (delta > 0) elevationGain += delta
      else elevationLoss += Math.abs(delta)
    }

    // Calculate duration and speed
    const startTime = new Date(segmentPoints[0].time).getTime()
    const endTime = new Date(segmentPoints[segmentPoints.length - 1].time).getTime()
    const durationHours = (endTime - startTime) / (1000 * 60 * 60)
    const avgSpeed = durationHours > 0 ? totalDistance / durationHours : 0

    // Auto-detect segment type based on elevation
    let segmentType: 'climb' | 'descent' | 'flat'
    if (elevationGain > 50 && elevationGain > elevationLoss * 1.5) {
      segmentType = 'climb'
    } else if (elevationLoss > 50 && elevationLoss > elevationGain * 1.5) {
      segmentType = 'descent'
    } else {
      segmentType = 'flat'
    }

      return {
        distance: totalDistance,
        elevationGain,
        elevationLoss,
        elevationChange,
        avgSpeed,
        segmentType,
        duration: durationHours * 60 // minutes
      }
    } catch (err) {
      console.error('Error calculating segment metadata:', err)
      return null
    }
  }, [timeRange, editingSegment?.start_time, editingSegment?.end_time, points])

  // Early return if no time range selected yet
  if (!effectiveTimeRange) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
        <p className="text-sm text-blue-800 font-medium">Select Points</p>
        <p className="text-xs text-blue-600 mt-1">Click start point, then end point on either chart below</p>
      </div>
    )
  }

  // Early return if not enough points
  if (!metadata) {
    return (
      <div className="text-sm text-gray-500">
        Not enough points in selected range
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Metadata Display */}
      <div className="bg-gray-50 rounded-md p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Type:</span>
            <span className="font-medium text-gray-900 capitalize">{metadata.segmentType}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Distance:</span>
            <span className="font-medium text-gray-900">{metadata.distance.toFixed(2)} mi</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Duration:</span>
            <span className="font-medium text-gray-900">{Math.round(metadata.duration)} min</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Elevation Gain:</span>
            <span className="font-medium text-gray-900">{Math.round(metadata.elevationGain)} ft</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Elevation Loss:</span>
            <span className="font-medium text-gray-900">{Math.round(metadata.elevationLoss)} ft</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Avg Speed:</span>
            <span className="font-medium text-gray-900">{metadata.avgSpeed.toFixed(1)} mph</span>
          </div>
        </div>

        {/* Terrain Type Slider */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Terrain Type</label>
        <input
          type="range"
          min="0"
          max="2"
          step="1"
          value={terrainType === 'rest' ? 0 : terrainType === 'non-technical' ? 1 : 2}
          onChange={(e) => {
            const val = Number(e.target.value)
            setTerrainType(val === 0 ? 'rest' : val === 1 ? 'non-technical' : 'technical')
          }}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-600 mt-2">
          <span className={terrainType === 'rest' ? 'font-semibold text-gray-900' : ''}>Rest</span>
          <span className={terrainType === 'non-technical' ? 'font-semibold text-gray-900' : ''}>Non-technical</span>
          <span className={terrainType === 'technical' ? 'font-semibold text-gray-900' : ''}>Technical</span>
        </div>
      </div>

      {/* Technical Climb Metadata - only shown for technical climbs */}
      {metadata && metadata.segmentType === 'climb' && terrainType === 'technical' && (
        <div className="space-y-3 pt-3 border-t border-gray-200">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Difficulty</label>
            <input
              type="text"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              placeholder="e.g. 5.10a"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of Pitches</label>
            <input
              type="number"
              min="0"
              value={pitchCount}
              onChange={(e) => setPitchCount(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={() => onSave({
            timeRange: effectiveTimeRange,
            terrainType,
            difficulty: difficulty || undefined,
            pitchCount: pitchCount > 0 ? pitchCount : undefined
          })}
          className="w-full px-4 py-2 bg-accent-600 text-white rounded-md font-medium hover:bg-accent-700 text-sm"
        >
          {editingSegment ? 'Update' : 'Save'}
        </button>

        {/* Delete button - only show when editing existing segment */}
        {editingSegment && onDelete && (
          <button
            onClick={onDelete}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700 text-sm"
          >
            Delete Segment
          </button>
        )}
      </div>
    </div>
  )
})

// View Segments component
const ViewSegments = memo(({
  segments,
  points,
  selectedSegmentId,
  editingSegmentId,
  creatingSegment,
  segmentEditor,
  onStartCreating,
  onDeleteSegment,
  onSelectSegment
}: {
  segments: UserSegment[]
  points: Point[]
  selectedSegmentId: number | null
  editingSegmentId: number | null
  creatingSegment: boolean
  segmentEditor: React.ReactNode
  onStartCreating: () => void
  onDeleteSegment: (id: number) => void
  onSelectSegment: (id: number) => void
}) => {
  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Create Button */}
      {!creatingSegment && (
        <button
          onClick={onStartCreating}
          className="w-full px-4 py-2 bg-accent-600 text-white rounded-md font-medium hover:bg-accent-700"
        >
          Create Segment
        </button>
      )}

      {/* New Segment Editor (shown when creating) */}
      {creatingSegment && (
        <div className="border border-blue-300 rounded-md p-3 bg-blue-50">
          {segmentEditor}
        </div>
      )}

      {/* Segments List */}
      {segments.length > 0 ? (
        <div className="space-y-2 flex-1 overflow-y-auto">
          {segments.map((segment) => {
            const isEditing = editingSegmentId === segment.id
            const isHighlighted = selectedSegmentId === segment.id && !isEditing
            const colors = getSegmentColors(segment.segment_type)
            const metadata = calculateSegmentMetadata(points, segment.start_time, segment.end_time)

            return (
              <div
                key={segment.id}
                className={`border-l-4 ${colors.leftBar} pl-3 py-2 transition-all ${
                  isEditing || isHighlighted ? 'bg-gray-50' : ''
                }`}
              >
                {/* Segment Header - always visible */}
                <div
                  onClick={() => onSelectSegment(segment.id)}
                  className="cursor-pointer hover:opacity-75 transition-opacity"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-900 uppercase">
                          {segment.segment_type}
                        </span>
                        {segment.is_technical && (
                          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                            Technical
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600">
                        <div className="flex gap-3">
                          <span>{metadata.distance.toFixed(2)} mi</span>
                          <span>{Math.round(metadata.duration)} min</span>
                          <span>{metadata.elevationChange > 0 ? '+' : ''}{Math.round(metadata.elevationChange)} ft</span>
                        </div>
                      </div>
                    </div>
                    {/* Expand/collapse indicator */}
                    <svg
                      className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ml-2 ${isEditing ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Editor - shown when segment is being edited */}
                {isEditing && (
                  <div className="p-3">
                    {segmentEditor}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No segments yet. Create your first segment by drawing on the charts below.</p>
      )}
    </div>
  )
})

// Separate component for edit controls to isolate re-renders
const EditControls = memo(({
  selectedPointIndices,
  removing,
  onRemoveSelectedPoints,
  onClearSelection,
  onRestoreAll,
  pointSpeeds,
  onApplyMaxSpeed
}: {
  selectedPointIndices: number[]
  removing: boolean
  onRemoveSelectedPoints: () => void
  onClearSelection: () => void
  onRestoreAll: () => void
  pointSpeeds: number[]
  onApplyMaxSpeed: (threshold: number) => void
}) => {
  const [sliderSpeed, setSliderSpeed] = useState<number>(20)
  const [maxSpeed, setMaxSpeed] = useState<number>(20)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleSliderChange = (value: number) => {
    setSliderSpeed(value)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      setMaxSpeed(value)
    }, 150)
  }

  const pointsAboveMaxSpeed = useMemo(() => {
    return pointSpeeds.filter(s => s > maxSpeed).length
  }, [pointSpeeds, maxSpeed])

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Speed: {sliderSpeed} mph
            </label>
            <input
              type="range"
              min="1"
              max="30"
              step="0.5"
              value={sliderSpeed}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              className="w-full h-2 bg-steel-200 rounded-lg appearance-none cursor-pointer accent-steel-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 mph</span>
              <span>30 mph</span>
            </div>
            <p className="text-xs text-gray-600 text-center mt-2">
              {pointsAboveMaxSpeed} point{pointsAboveMaxSpeed !== 1 ? 's' : ''} above threshold
            </p>
          </div>
          <button
            onClick={() => onApplyMaxSpeed(maxSpeed)}
            className="w-full px-4 py-2 bg-steel-400 text-white rounded-md font-medium hover:bg-steel-500"
          >
            Mark Points Above Max Speed
          </button>
        </div>

      {selectedPointIndices.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={onClearSelection}
            className="w-full px-4 py-2 bg-steel-400 text-white rounded-md font-medium hover:bg-steel-500"
          >
            Clear Selection
          </button>
          <button
            onClick={onRemoveSelectedPoints}
            disabled={removing}
            className="w-full px-4 py-2 bg-primary-700 text-white rounded-md font-medium hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {removing ? 'Removing...' : `Remove ${selectedPointIndices.length} Point${selectedPointIndices.length > 1 ? 's' : ''}`}
          </button>
          <p className="text-xs text-gray-600 text-center">
            {selectedPointIndices.length} point{selectedPointIndices.length > 1 ? 's' : ''} selected
          </p>
        </div>
      )}

      {selectedPointIndices.length === 0 && (
        <p className="text-xs text-gray-500 text-center">
          Click points to select, or Shift+drag on map for box selection
        </p>
      )}

      <button
        onClick={onRestoreAll}
        disabled={removing}
        className="w-full px-4 py-2 bg-gray-400 text-white rounded-md font-medium hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {removing ? 'Restoring...' : 'Restore Original Waypoints'}
      </button>
    </div>
  )
})

interface ActivityEditorProps {
  activity: Activity
}

function ActivityEditor({ activity }: ActivityEditorProps) {
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [selectedPointIndices, setSelectedPointIndices] = useState<number[]>([])
  const [removing, setRemoving] = useState(false)
  const [activePanel, setActivePanel] = useState<'metadata' | 'waypoints' | 'segments'>('metadata')

  // Segment creation/editing state
  const [creatingSegment, setCreatingSegment] = useState(false)
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null)
  const [segmentTimeRange, setSegmentTimeRange] = useState<{ start: string; end: string } | null>(null)
  const [userSegments, setUserSegments] = useState<UserSegment[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null)

  // Auto-enter edit mode when Clean Waypoints panel is opened
  useEffect(() => {
    const shouldBeInEditMode = activePanel === 'waypoints'
    if (editMode !== shouldBeInEditMode) {
      setEditMode(shouldBeInEditMode)
      setSelectedPointIndices([])  // Clear selection when toggling
    }
  }, [activePanel])

  // Clear segment selection and editing state when leaving segments panel
  useEffect(() => {
    if (activePanel !== 'segments') {
      setSelectedSegmentId(null)
      setEditingSegmentId(null)
      setCreatingSegment(false)
      setSegmentTimeRange(null)
    }
  }, [activePanel])

  useEffect(() => {
    fetchActivityData()
    fetchUserSegments()
  }, [activity.activity_id, editMode])  // Re-fetch when edit mode changes

  const fetchUserSegments = async () => {
    try {
      const segments = await userSegmentsAPI.list(activity.activity_id)
      setUserSegments(segments)
      console.log('Fetched user segments:', segments)
    } catch (err) {
      console.error('Error fetching user segments:', err)
    }
  }

  const fetchActivityData = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('Fetching points with include_removed=false')

      // In edit mode, fetch ALL points (no decimation) to prevent re-sampling issues
      // In normal mode, use decimated points for performance
      const pointsData = editMode
        ? await pointsAPI.list(activity.activity_id, false)
        : await pointsAPI.getDecimated(activity.activity_id, 1500, false)

      console.log('Fetched points:', pointsData.length, 'points', editMode ? '(all)' : '(decimated)')
      console.log('First point time:', pointsData[0]?.time)
      console.log('Last point time:', pointsData[pointsData.length - 1]?.time)

      setPoints(pointsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity data')
      console.error('Error loading activity data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveSelectedPoints = async () => {
    if (selectedPointIndices.length === 0) return

    try {
      setRemoving(true)

      console.log(`Removing ${selectedPointIndices.length} selected points`)

      // Get all selected points
      const selectedPoints = selectedPointIndices.map(i => points[i]).filter(p => p)

      // Remove each point individually (same start and end time)
      for (const point of selectedPoints) {
        await pointsAPI.remove(activity.activity_id, {
          time_range: {
            start: point.time,
            end: point.time,
          },
        })
      }

      console.log(`Removed ${selectedPoints.length} points`)

      // Recalculate segments
      await segmentsAPI.recalculate(activity.activity_id)

      // Refresh points data
      await fetchActivityData()

      // Clear selection
      setSelectedPointIndices([])

      console.log('Points removed successfully!')
    } catch (err) {
      console.error('Error removing points:', err)
      alert(`Failed to remove points: ${err}`)
    } finally {
      setRemoving(false)
    }
  }

  const handleRestoreAll = async () => {
    if (!confirm('Restore all removed waypoints? This will undo all your edits.')) {
      return
    }

    try {
      setRemoving(true)

      console.log('Restoring all removed points')

      // Call restore with empty array to restore ALL removed points
      await pointsAPI.restore(activity.activity_id, { point_ids: [] })

      // Recalculate segments
      await segmentsAPI.recalculate(activity.activity_id)

      // Refresh points data
      await fetchActivityData()

      // Clear selection
      setSelectedPointIndices([])

      console.log('All points restored successfully!')
      alert('Original waypoints restored!')
    } catch (err) {
      console.error('Error restoring points:', err)
      alert(`Failed to restore points: ${err}`)
    } finally {
      setRemoving(false)
    }
  }

  const handleStartCreatingSegment = () => {
    setCreatingSegment(true)
    setEditingSegmentId(null)
    setSegmentTimeRange(null)
  }

  const handleCancelSegmentEditor = () => {
    setCreatingSegment(false)
    setEditingSegmentId(null)
    setSegmentTimeRange(null)
  }

  const handleChartClick = useCallback((index: number) => {
    try {
      if (!creatingSegment && !editingSegmentId) return
      if (!points || points.length === 0) return
      if (index < 0 || index >= points.length) return

      const clickedTime = points[index]?.time
      if (!clickedTime) return

      if (!segmentTimeRange) {
        // First click - set start time
        setSegmentTimeRange({ start: clickedTime, end: clickedTime })
      } else {
        // Second click - set end time (stays in editor, user can adjust)
        const start = segmentTimeRange.start
        const end = clickedTime

        // Ensure start is before end
        const sortedRange = start <= end
          ? { start, end }
          : { start: end, end: start }

        setSegmentTimeRange(sortedRange)
      }
    } catch (err) {
      console.error('Error handling chart click:', err)
    }
  }, [creatingSegment, editingSegmentId, segmentTimeRange, points])

  const handleSaveSegment = async (data: {
    timeRange: { start: string; end: string },
    terrainType: 'rest' | 'non-technical' | 'technical',
    difficulty?: string,
    pitchCount?: number
  }) => {
    const { timeRange, terrainType, difficulty, pitchCount } = data

    try {
      // Determine segment_type and is_technical based on terrain selection
      let segmentType: 'climb' | 'descent' | 'flat' | 'rest'
      let isTechnical: boolean

      if (terrainType === 'rest') {
        segmentType = 'rest'
        isTechnical = false
      } else {
        // Auto-detect climb/descent/flat
        const segmentPoints = points.filter(p => p.time >= timeRange.start && p.time <= timeRange.end)
        let elevationGain = 0
        let elevationLoss = 0
        for (let i = 0; i < segmentPoints.length - 1; i++) {
          const delta = segmentPoints[i + 1].elevation_ft - segmentPoints[i].elevation_ft
          if (delta > 0) elevationGain += delta
          else elevationLoss += Math.abs(delta)
        }

        if (elevationGain > 50 && elevationGain > elevationLoss * 1.5) {
          segmentType = 'climb'
        } else if (elevationLoss > 50 && elevationLoss > elevationGain * 1.5) {
          segmentType = 'descent'
        } else {
          segmentType = 'flat'
        }

        isTechnical = terrainType === 'technical'
      }

      if (editingSegmentId) {
        // Update existing segment
        await userSegmentsAPI.update(editingSegmentId, {
          segment_type: segmentType,
          start_time: timeRange.start,
          end_time: timeRange.end,
          is_technical: isTechnical,
          difficulty: difficulty || undefined,
          pitch_count: pitchCount
        })
        alert('Segment updated successfully!')
      } else {
        // Create new segment
        await userSegmentsAPI.create(activity.activity_id, {
          segment_type: segmentType,
          start_time: timeRange.start,
          end_time: timeRange.end,
          is_technical: isTechnical,
          difficulty: difficulty || undefined,
          pitch_count: pitchCount
        })
        alert('Segment created successfully!')
      }

      // Refresh segments list
      await fetchUserSegments()

      // Reset state
      setCreatingSegment(false)
      setEditingSegmentId(null)
      setSegmentTimeRange(null)
    } catch (err) {
      console.error('Error saving segment:', err)
      alert(`Failed to save segment: ${err}`)
    }
  }

  const handleDeleteSegment = async (segmentId: number) => {
    if (!confirm('Delete this segment?')) return

    try {
      await userSegmentsAPI.delete(segmentId)
      await fetchUserSegments()
      if (selectedSegmentId === segmentId) {
        setSelectedSegmentId(null)
      }
      alert('Segment deleted successfully!')
    } catch (err) {
      console.error('Error deleting segment:', err)
      alert(`Failed to delete segment: ${err}`)
    }
  }

  const handleSelectSegment = (segmentId: number) => {
    // Clicking a segment enters edit mode for that segment
    if (editingSegmentId === segmentId) {
      // If already editing this segment, close the editor
      setEditingSegmentId(null)
      setSegmentTimeRange(null)
      setSelectedSegmentId(null)
    } else {
      // Start editing this segment
      setEditingSegmentId(segmentId)
      setCreatingSegment(false)
      const segment = userSegments.find(s => s.id === segmentId)
      if (segment) {
        setSegmentTimeRange({ start: segment.start_time, end: segment.end_time })
        setSelectedSegmentId(segmentId)
      }
    }
  }

  // Haversine distance formula
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959 // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  // Calculate speed for each point (mph) - memoized for performance
  const pointSpeeds = useMemo((): number[] => {
    const speeds: number[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]
      const p2 = points[i + 1]
      const distance = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon) // miles
      const time1 = new Date(p1.time).getTime()
      const time2 = new Date(p2.time).getTime()
      const hours = (time2 - time1) / (1000 * 60 * 60)
      const speed = hours > 0 ? distance / hours : 0
      speeds.push(speed)
    }
    // Last point gets same speed as previous
    if (speeds.length > 0) {
      speeds.push(speeds[speeds.length - 1])
    }
    return speeds
  }, [points])

  // Create O(1) lookup bitmask for selected points
  const isPointSelected = useMemo(() => {
    const bitmask = new Array(points.length).fill(false)
    selectedPointIndices.forEach(i => {
      if (i >= 0 && i < points.length) {
        bitmask[i] = true
      }
    })
    return bitmask
  }, [selectedPointIndices, points.length])

  // Get selected segment's time range and color for highlighting
  const selectedSegmentHighlight = useMemo(() => {
    if (!selectedSegmentId) return null
    const segment = userSegments.find(s => s.id === selectedSegmentId)
    if (!segment) return null
    const colors = getSegmentColors(segment.segment_type)
    return {
      start: segment.start_time,
      end: segment.end_time,
      color: colors.highlight
    }
  }, [selectedSegmentId, userSegments])

  // Find points above max speed threshold
  const handleApplyMaxSpeed = useCallback((threshold: number) => {
    const aboveThreshold: number[] = []
    pointSpeeds.forEach((speed, index) => {
      if (speed > threshold) {
        aboveThreshold.push(index)
      }
    })
    startTransition(() => {
      setSelectedPointIndices(aboveThreshold)
    })
  }, [pointSpeeds])

  const handleTogglePoint = useCallback((index: number) => {
    try {
      if (!editMode) return
      if (!points || points.length === 0) return
      if (index < 0 || index >= points.length) return

      // Use startTransition to make the update non-blocking
      startTransition(() => {
        setSelectedPointIndices(prev => {
          if (prev.includes(index)) {
            // Deselect if already selected
            return prev.filter(i => i !== index)
          } else {
            // Add to selection
            return [...prev, index]
          }
        })
      })
    } catch (err) {
      console.error('Error toggling point:', err)
    }
  }, [editMode, points])

  const handleBoxSelect = useCallback((indices: number[]) => {
    // Add box-selected points to existing selection
    startTransition(() => {
      setSelectedPointIndices(prev => {
        const combined = [...prev, ...indices]
        // Remove duplicates
        return Array.from(new Set(combined))
      })
    })
  }, [])

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4 relative">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-80 z-50 flex items-center justify-center rounded-lg">
          <div className="text-lg text-gray-600 font-medium">Loading activity data...</div>
        </div>
      )}

      {/* Map and Charts */}
      <div className={`relative min-h-[600px] ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
        {/* Background Map Layer - fills entire area */}
        <div className="absolute inset-0 rounded-lg overflow-hidden z-0">
          <ActivityMap
            points={points}
            isPointSelected={isPointSelected}
            editMode={editMode}
            onPointClick={
              creatingSegment || editingSegmentId !== null
                ? handleChartClick
                : editMode
                ? handleTogglePoint
                : undefined
            }
            onBoxSelect={editMode && !creatingSegment && !editingSegmentId ? handleBoxSelect : undefined}
            highlightSegment={selectedSegmentHighlight}
            segmentMode={activePanel === 'segments'}
          />
        </div>

        {/* Floating Content Grid - on top of map */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 pointer-events-none">
        {/* Left Column - Charts (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Empty space in top-left for map visibility - increased for more map space */}
          <div className="h-[500px]"></div>

          {/* Charts - floating white box */}
          <div className="bg-white rounded-lg shadow-lg p-4 space-y-6 pointer-events-auto">
            {/* Elevation Chart */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Elevation</h3>
              <ElevationChart
                points={points}
                editMode={editMode || creatingSegment || editingSegmentId !== null}
                isPointSelected={isPointSelected}
                onPointClick={
                  creatingSegment || editingSegmentId !== null
                    ? handleChartClick
                    : editMode
                    ? handleTogglePoint
                    : undefined
                }
                highlightSegment={selectedSegmentHighlight}
                segmentMode={activePanel === 'segments'}
              />
            </div>

            {/* Speed Chart */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Speed</h3>
              <SpeedChart
                points={points}
                editMode={editMode || creatingSegment || editingSegmentId !== null}
                isPointSelected={isPointSelected}
                onPointClick={
                  creatingSegment || editingSegmentId !== null
                    ? handleChartClick
                    : editMode
                    ? handleTogglePoint
                    : undefined
                }
                highlightSegment={selectedSegmentHighlight}
                segmentMode={activePanel === 'segments'}
              />
            </div>
          </div>
        </div>

        {/* Right Column - Accordion Panel (1/3 width) */}
        <div className="flex flex-col space-y-6">
          {/* Accordion Panel - floating white box */}
          <div className="bg-white rounded-lg shadow-lg pointer-events-auto overflow-hidden flex-1 flex flex-col">
            <AccordionSection
              id="metadata"
              title="Activity Details"
              isOpen={activePanel === 'metadata'}
              onToggle={() => setActivePanel('metadata')}
            >
              <ActivityMetadataForm activity={activity} />
            </AccordionSection>

            <AccordionSection
              id="segments"
              title="View Segments"
              isOpen={activePanel === 'segments'}
              onToggle={() => setActivePanel('segments')}
              expandContent={true}
            >
              <ViewSegments
                segments={userSegments}
                points={points}
                selectedSegmentId={selectedSegmentId}
                editingSegmentId={editingSegmentId}
                creatingSegment={creatingSegment}
                segmentEditor={
                  <SegmentEditor
                    timeRange={segmentTimeRange}
                    points={points}
                    editingSegment={editingSegmentId ? userSegments.find(s => s.id === editingSegmentId) : undefined}
                    onSave={handleSaveSegment}
                    onCancel={handleCancelSegmentEditor}
                    onDelete={editingSegmentId ? () => handleDeleteSegment(editingSegmentId) : undefined}
                  />
                }
                onStartCreating={handleStartCreatingSegment}
                onDeleteSegment={handleDeleteSegment}
                onSelectSegment={handleSelectSegment}
              />
            </AccordionSection>

            <AccordionSection
              id="waypoints"
              title="Clean Waypoints"
              isOpen={activePanel === 'waypoints'}
              onToggle={() => setActivePanel('waypoints')}
            >
              <EditControls
                selectedPointIndices={selectedPointIndices}
                removing={removing}
                onRemoveSelectedPoints={handleRemoveSelectedPoints}
                onClearSelection={() => setSelectedPointIndices([])}
                onRestoreAll={handleRestoreAll}
                pointSpeeds={pointSpeeds}
                onApplyMaxSpeed={handleApplyMaxSpeed}
              />
            </AccordionSection>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

export default ActivityEditor
