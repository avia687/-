"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"];

const axis = { fontSize: 11, stroke: "hsl(var(--muted-foreground))" };

export function RevenueChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }}
          formatter={(v: number) => [`₪${v.toLocaleString()}`, "הכנסה"]}
        />
        <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#rev)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function JobsChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }}
          formatter={(v: number) => [v, "עבודות"]}
          cursor={{ fill: "hsl(var(--secondary))" }}
        />
        <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DistributionChart({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) {
    return <p className="py-16 text-center text-sm text-muted-foreground">אין נתונים עדיין</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
