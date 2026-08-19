import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

/**
 * Quiz score trend across attempts. Reference lines mark the classification
 * thresholds (60 / 80) so a student can see which band each attempt landed in.
 */
export default function ProgressChart({ history }) {
  if (!history || history.length === 0) {
    return <p className="text-sm text-slate-400">No completed attempts yet.</p>;
  }

  const data = history.map((a, i) => ({
    name: `Attempt ${i + 1}`,
    percentage: a.percentage ?? 0,
    score: `${a.score}/${a.total_questions}`,
    date: a.completed_date ? new Date(a.completed_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : '',
  }));

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" />
          <ReferenceLine y={80} stroke="#10b981" strokeDasharray="4 4"
            label={{ value: 'Strong', position: 'insideTopRight', fontSize: 10, fill: '#10b981' }} />
          <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="4 4"
            label={{ value: 'Developing', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(value, _key, entry) => [`${value}% (${entry.payload.score})`, 'Score']}
            labelFormatter={(label, payload) => {
              const d = payload?.[0]?.payload?.date;
              return d ? `${label} · ${d}` : label;
            }}
          />
          <Line type="monotone" dataKey="percentage" stroke="#4f46e5" strokeWidth={2.5}
            dot={{ r: 4, fill: '#4f46e5' }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
