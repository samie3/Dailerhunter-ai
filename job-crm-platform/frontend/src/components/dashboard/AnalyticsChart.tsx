"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format } from "date-fns";

interface DailyRecord {
  date: string;
  sent: number;
  opened: number;
  replied: number;
}

export function AnalyticsChart({ data }: { data: DailyRecord[] }) {
  const formatted = data.map((d) => ({
    ...d,
    day: format(new Date(d.date), "MMM d"),
  }));

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        No data yet — start a sequence to see activity
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="sent" fill="#3b82f6" name="Sent" radius={[3, 3, 0, 0]} />
        <Bar dataKey="opened" fill="#22c55e" name="Opened" radius={[3, 3, 0, 0]} />
        <Bar dataKey="replied" fill="#a855f7" name="Replied" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
