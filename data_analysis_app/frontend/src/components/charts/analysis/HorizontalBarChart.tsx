/**
 * Horizontal bar chart component for top 10 lists.
 */
import { memo } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface HorizontalBarChartProps {
  data: Array<{ name: string; value: number; color?: string }>;
  dataKey: string;
  label: string;
  formatter: (value: number) => string;
  color?: string;
}

function HorizontalBarChart({
  data,
  dataKey,
  label,
  formatter,
  color = '#ea580c',
}: HorizontalBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  // Truncate long names for display
  const truncateName = (name: string, maxLength: number = 30) => {
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength - 3) + '...';
  };

  return (
    <ResponsiveContainer width="100%" height={Math.max(250, data.length * 35)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          type="number"
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          tickFormatter={formatter}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11 }}
          stroke="#9ca3af"
          width={140}
          tickFormatter={(value) => truncateName(value, 25)}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
          contentStyle={{ fontSize: 11, backgroundColor: 'rgba(255, 255, 255, 0.95)', border: 'none', padding: '8px' }}
          formatter={(value: number) => [formatter(value), label]}
          labelFormatter={(value) => value}
        />
        <Bar dataKey={dataKey} fill={color}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color || color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(HorizontalBarChart);
