"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

const BLUE = "#1545a2";
const ACCENT = "#0d2f6e";
const LEAF = "#22c55e";
const MUTED = "#8a8a8a";

type Point = { date: string; value: number };

export function ChartCard({
  title,
  subtitle,
  children,
  className,
  empty,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  empty?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}>
      <div className="mb-3">
        <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-text-secondary">{subtitle}</p> : null}
      </div>
      {empty ? (
        <div className="flex h-48 items-center justify-center text-sm text-text-hint">
          Insufficient data
        </div>
      ) : (
        <div className="h-48 w-full">{children}</div>
      )}
    </section>
  );
}

function axisDate(v: string) {
  if (!v) return "";
  const parts = v.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : v;
}

export function SeriesAreaChart({
  data,
  color = BLUE,
  name = "Value",
}: {
  data: Point[];
  color?: string;
  name?: string;
}) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={axisDate}
          tick={{ fontSize: 10, fill: MUTED }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 10, fill: MUTED }}
          axisLine={false}
          tickLine={false}
          width={36}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #ebebeb",
            fontSize: 12,
          }}
          labelFormatter={(l) => String(l)}
        />
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke={color}
          fill={color}
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DualLineChart({
  data,
  aKey,
  bKey,
  aName,
  bName,
}: {
  data: Record<string, string | number>[];
  aKey: string;
  bKey: string;
  aName: string;
  bName: string;
}) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={axisDate}
          tick={{ fontSize: 10, fill: MUTED }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #ebebeb", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey={aKey} name={aName} stroke={BLUE} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey={bKey} name={bName} stroke={LEAF} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({
  data,
  dataKey = "value",
  nameKey = "label",
  color = ACCENT,
}: {
  data: Record<string, string | number>[];
  dataKey?: string;
  nameKey?: string;
  color?: string;
}) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" vertical={false} />
        <XAxis dataKey={nameKey} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #ebebeb", fontSize: 12 }} />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
