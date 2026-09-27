import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Point } from '../../types'

interface CombinedChartProps {
  points: Point[]
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

function CombinedChart({ points }: CombinedChartProps) {
  if (points.length < 2) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data</p>
      </div>
    )
  }

  // Prepare combined data with both elevation and speed
  const data = points.map((point, index) => {
    let speed = 0
    if (index > 0) {
      const p1 = points[index - 1]
      const p2 = point
      const distance = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon)
      const time1 = new Date(p1.time).getTime()
      const time2 = new Date(p2.time).getTime()
      const hours = (time2 - time1) / (1000 * 60 * 60)
      speed = hours > 0 ? Math.min(distance / hours, 20) : 0
    }

    return {
      index,
      elevation: Math.round(point.elevation_ft),
      speed: Number(speed.toFixed(2)),
      time: new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  })

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 5, right: 45, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="index"
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          tickFormatter={(value) => data[value]?.time || ''}
          interval="preserveStartEnd"
        />

        {/* Left Y-axis for Elevation */}
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 12 }}
          stroke="#ea580c"
          label={{ value: 'Elevation (ft)', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#ea580c' } }}
        />

        {/* Right Y-axis for Speed */}
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 12 }}
          stroke="#3b82f6"
          label={{ value: 'Speed (mph)', angle: 90, position: 'insideRight', style: { fontSize: 12, fill: '#3b82f6' } }}
        />

        <Tooltip
          contentStyle={{ fontSize: 12, backgroundColor: 'white', border: '1px solid #e5e7eb' }}
          formatter={(value: number, name: string) => {
            if (name === 'elevation') return [`${value} ft`, 'Elevation']
            if (name === 'speed') return [`${value} mph`, 'Speed']
            return [value, name]
          }}
          labelFormatter={(label) => data[label]?.time || ''}
        />

        <Legend
          wrapperStyle={{ fontSize: 12 }}
          iconType="line"
        />

        {/* Elevation line (orange) */}
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="elevation"
          name="Elevation"
          stroke="#ea580c"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />

        {/* Speed line (blue) */}
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="speed"
          name="Speed"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default CombinedChart
