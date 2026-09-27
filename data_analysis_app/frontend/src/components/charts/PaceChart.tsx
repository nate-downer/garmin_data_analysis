import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Segment } from '../../types'

interface PaceChartProps {
  segments: Segment[]
}

function PaceChart({ segments }: PaceChartProps) {
  if (segments.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data</p>
      </div>
    )
  }

  // Prepare data for chart - cap pace at 60 min/mile for readability
  const data = segments.map((segment, index) => ({
    index,
    pace: segment.pace_min_per_mi ? Math.min(Number(segment.pace_min_per_mi.toFixed(2)), 60) : 0,
    time: new Date(segment.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="index"
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          tickFormatter={(value) => data[value]?.time || ''}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          label={{ value: 'Pace (min/mi)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
          reversed
        />
        <Tooltip
          contentStyle={{ fontSize: 12, backgroundColor: 'white', border: '1px solid #e5e7eb' }}
          formatter={(value: number) => {
            const mins = Math.floor(value)
            const secs = Math.round((value - mins) * 60)
            return [`${mins}:${secs.toString().padStart(2, '0')}/mi`, 'Pace']
          }}
          labelFormatter={(label) => data[label]?.time || ''}
        />
        <Line
          type="monotone"
          dataKey="pace"
          stroke="#ea580c"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default PaceChart
