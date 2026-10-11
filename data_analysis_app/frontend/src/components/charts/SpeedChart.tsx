import { memo, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts'
import { Point } from '../../types'

interface SpeedChartProps {
  points: Point[]
  editMode?: boolean
  onPointClick?: (index: number) => void
  isPointSelected?: boolean[]
  highlightSegment?: { start: string; end: string; color: string } | null
  segmentMode?: boolean
  xDomain?: [number | string, number | string]
}

// Haversine distance formula
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

function SpeedChart({ points, editMode = false, onPointClick, isPointSelected = [], highlightSegment = null, segmentMode = false, xDomain = ['dataMin', 'dataMax'] }: SpeedChartProps) {
  // Calculate speed between consecutive points (memoized for performance)
  const data = useMemo(() => {
    const result = []
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]
      const p2 = points[i + 1]

      const distance = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon) // miles
      const time1 = new Date(p1.time).getTime()
      const time2 = new Date(p2.time).getTime()
      const hours = (time2 - time1) / (1000 * 60 * 60)

      const speed = hours > 0 ? distance / hours : 0

      // Cap speed at 20 mph for readability (remove outliers)
      const cappedSpeed = Math.min(speed, 20)

      result.push({
        index: i,
        speed: Number(cappedSpeed.toFixed(2)),
        timestamp: time1,
        time: new Date(p1.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
    }
    return result
  }, [points])

  if (points.length < 2) {
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
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            label={{ value: 'Speed (mph)', angle: -90, position: 'center', dx: -25, style: { fontSize: 14, textAnchor: 'middle' } }}
          />
        <Tooltip
          position={{ y: -15 }}
          contentStyle={{ fontSize: 11, backgroundColor: 'rgba(255, 255, 255, 0.95)', border: 'none', padding: '4px 8px' }}
          formatter={(value: number, name: string, props: any) => {
            const time = new Date(props.payload.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            return [`${value} mph at ${time}`, '']
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
          dataKey="speed"
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

export default memo(SpeedChart)
