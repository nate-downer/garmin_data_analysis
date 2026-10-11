import { memo, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts'
import { Point } from '../../types'

interface ElevationChartProps {
  points: Point[]
  editMode?: boolean
  onPointClick?: (index: number) => void
  isPointSelected?: boolean[]
  highlightSegment?: { start: string; end: string; color: string } | null
  segmentMode?: boolean
  xDomain?: [number | string, number | string]
}

function ElevationChart({ points, editMode = false, onPointClick, isPointSelected = [], highlightSegment = null, segmentMode = false, xDomain = ['dataMin', 'dataMax'] }: ElevationChartProps) {
  // Prepare data for chart - use timestamp for x-axis (memoized for performance)
  const data = useMemo(() => {
    return points.map((point, index) => ({
      index, // Keep index for click handling
      elevation: Math.round(point.elevation_ft),
      timestamp: new Date(point.time).getTime(),
      time: new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }))
  }, [points])

  // Calculate elevation range with 5% padding for better y-axis scaling
  const elevationDomain = useMemo(() => {
    if (data.length === 0) return ['auto', 'auto']

    const elevations = data.map(d => d.elevation)
    const minElev = Math.min(...elevations)
    const maxElev = Math.max(...elevations)
    const range = maxElev - minElev
    const padding = range * 0.05 // 5% padding

    return [Math.floor(minElev - padding), Math.ceil(maxElev + padding)]
  }, [data])

  if (points.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={150}>
        <LineChart
          data={data}
          margin={{ top: 20, right: 5, left: 10, bottom: 5 }}
          onClick={(e: any) => {
            if (editMode && e && e.activeTooltipIndex !== undefined && onPointClick) {
              onPointClick(e.activeTooltipIndex)
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={xDomain}
            allowDataOverflow={true}
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            tickFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            scale="time"
          />
          <YAxis
            domain={elevationDomain}
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            label={{ value: 'Elevation (ft)', angle: -90, position: 'center', dx: -25, style: { fontSize: 14, textAnchor: 'middle' } }}
          />
        <Tooltip
          position={{ y: -15 }}
          contentStyle={{ fontSize: 11, backgroundColor: 'rgba(255, 255, 255, 0.95)', border: 'none', padding: '4px 8px' }}
          formatter={(value: number, name: string, props: any) => {
            const time = new Date(props.payload.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            return [`${value} ft at ${time}`, '']
          }}
          labelFormatter={() => ''}
          separator=""
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
                  key={`selected-${props.index}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={6}
                  fill="#ef4444"
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
  )
}

export default memo(ElevationChart)
