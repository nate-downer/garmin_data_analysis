import { memo, useMemo, useState, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceArea, ReferenceLine, Dot } from 'recharts'
import { Point } from '../../types'

interface ElevationChartProps {
  points: Point[]
  editMode?: boolean
  onPointClick?: (index: number) => void
  isPointSelected?: boolean[]
  highlightSegment?: { start: string; end: string; color: string } | null
  segmentMode?: boolean
}

function ElevationChart({ points, editMode = false, onPointClick, isPointSelected = [], highlightSegment = null, segmentMode = false }: ElevationChartProps) {
  const [hoveredData, setHoveredData] = useState<{ elevation: number; time: string; timestamp: number } | null>(null)
  const lastUpdateRef = useRef<number>(0)

  // Prepare data for chart - use timestamp for x-axis (memoized for performance)
  const data = useMemo(() => {
    return points.map((point, index) => ({
      index, // Keep index for click handling
      elevation: Math.round(point.elevation_ft),
      timestamp: new Date(point.time).getTime(),
      time: new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }))
  }, [points])

  if (points.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data</p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Title with live data */}
      <div className="absolute top-0 left-0 text-xs font-medium text-gray-700 z-10 pl-2">
        Elevation
        {hoveredData && (
          <span className="ml-2 text-gray-600">
            - {hoveredData.elevation} ft at {hoveredData.time}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={150}>
        <LineChart
          data={data}
          margin={{ top: 20, right: 5, left: 10, bottom: 5 }}
          onClick={(e: any) => {
            if (editMode && e && e.activeTooltipIndex !== undefined && onPointClick) {
              onPointClick(e.activeTooltipIndex)
            }
          }}
          onMouseMove={(e: any) => {
            if (e && e.activeTooltipIndex !== undefined && data[e.activeTooltipIndex]) {
              const now = Date.now()
              if (now - lastUpdateRef.current > 50) { // Throttle to 50ms
                lastUpdateRef.current = now
                const point = data[e.activeTooltipIndex]
                setHoveredData({
                  elevation: point.elevation,
                  time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  timestamp: point.timestamp
                })
              }
            }
          }}
          onMouseLeave={() => setHoveredData(null)}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            tickFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            scale="time"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            label={{ value: 'Elevation (ft)', angle: -90, position: 'center', dx: -25, style: { fontSize: 12, textAnchor: 'middle' } }}
          />
        {highlightSegment && (
          <ReferenceArea
            x1={new Date(highlightSegment.start).getTime()}
            x2={new Date(highlightSegment.end).getTime()}
            fill={highlightSegment.color}
            fillOpacity={0.15}
            stroke={highlightSegment.color}
            strokeWidth={2}
            strokeOpacity={0.3}
          />
        )}
        {hoveredData && (
          <ReferenceLine
            x={hoveredData.timestamp}
            stroke="#6b7280"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        <Line
          type="monotone"
          dataKey="elevation"
          stroke={segmentMode ? "#9ca3af" : "#ea580c"}
          strokeWidth={2}
          dot={(props: any) => {
            // Show selected points in edit mode
            if (editMode && isPointSelected && isPointSelected[props.index]) {
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={6}
                  fill="#ef4444"
                  stroke="#fff"
                  strokeWidth={2}
                />
              )
            }
            // Show hovered point
            if (hoveredData && props.payload.timestamp === hoveredData.timestamp) {
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={5}
                  fill="#6b7280"
                  stroke="#fff"
                  strokeWidth={2}
                />
              )
            }
            return null
          }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  )
}

export default memo(ElevationChart)
