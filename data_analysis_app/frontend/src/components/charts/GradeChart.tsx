import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Segment } from '../../types'

interface GradeChartProps {
  segments: Segment[]
}

function GradeChart({ segments }: GradeChartProps) {
  if (segments.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data</p>
      </div>
    )
  }

  // Prepare data for chart
  const data = segments.map((segment, index) => ({
    index,
    grade: segment.grade_percent ? Number(segment.grade_percent.toFixed(1)) : 0,
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
          label={{ value: 'Grade (%)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, backgroundColor: 'white', border: '1px solid #e5e7eb' }}
          formatter={(value: number) => [`${value > 0 ? '+' : ''}${value}%`, 'Grade']}
          labelFormatter={(label) => data[label]?.time || ''}
        />
        {/* Reference line at 0% */}
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="grade"
          stroke="#ea580c"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default GradeChart
