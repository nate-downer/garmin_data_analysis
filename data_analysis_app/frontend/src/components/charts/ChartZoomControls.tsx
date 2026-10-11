import { memo, useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, Brush, ResponsiveContainer } from 'recharts'
import { Point } from '../../types'

interface ChartZoomControlsProps {
  points: Point[]
  onZoomChange: (domain: [number, number] | null) => void
}

function ChartZoomControls({ points, onZoomChange }: ChartZoomControlsProps) {
  const [brushIndexes, setBrushIndexes] = useState<{ startIndex: number; endIndex: number } | null>(null)

  // Prepare minimal data for the overview chart (just timestamps)
  const data = useMemo(() => {
    return points.map((point) => ({
      timestamp: new Date(point.time).getTime(),
      value: 1, // Dummy value for area chart
    }))
  }, [points])

  if (points.length === 0) return null

  const handleBrushChange = (newBrushIndexes: any) => {
    // Recharts Brush onChange provides {startIndex, endIndex}
    if (newBrushIndexes && newBrushIndexes.startIndex !== undefined && newBrushIndexes.endIndex !== undefined) {
      const startIndex = Math.max(0, Math.floor(newBrushIndexes.startIndex))
      const endIndex = Math.min(data.length - 1, Math.ceil(newBrushIndexes.endIndex))

      setBrushIndexes({ startIndex, endIndex })

      if (startIndex < data.length && endIndex < data.length && startIndex !== endIndex) {
        const startTime = data[startIndex].timestamp
        const endTime = data[endIndex].timestamp
        onZoomChange([startTime, endTime])
      }
    }
  }

  const handleResetZoom = () => {
    setBrushIndexes(null)
    onZoomChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Time Range</span>
        <button
          onClick={handleResetZoom}
          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
        >
          Reset Zoom
        </button>
      </div>

      <ResponsiveContainer width="100%" height={50}>
        <AreaChart data={data}>
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin', 'dataMax']}
            hide
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="none"
            fill="#e5e7eb"
            fillOpacity={0.3}
            isAnimationActive={false}
          />
          <Brush
            dataKey="timestamp"
            height={40}
            stroke="#9ca3af"
            fill="#f9fafb"
            onChange={handleBrushChange}
            tickFormatter={(timestamp) => {
              const date = new Date(timestamp)
              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }}
            travellerWidth={8}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default memo(ChartZoomControls)
