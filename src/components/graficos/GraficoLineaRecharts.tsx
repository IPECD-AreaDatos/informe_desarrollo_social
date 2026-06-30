"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GraficoLinea } from "@/lib/graficos/types";

const SERIE_COLORS = [
  "#719C29",
  "#008275",
  "#1F5D9B",
  "#F36F21",
  "#EA2F09",
  "#6B5CB7",
  "#2E2D2C",
  "#989797",
];

function fmtY(v: number, format?: "ars" | "number"): string {
  if (format === "ars") {
    return `$${v.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
  }
  return v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function GraficoLineaRecharts({ chart }: { chart: GraficoLinea }) {
  return (
    <div className="min-w-0 rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm md:p-6">
      <h4 className="mb-4 text-sm font-black text-slate-800 md:text-base">{chart.titulo}</h4>
      <div className="h-[320px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart.data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
            <XAxis
              dataKey="x"
              tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              tickFormatter={(v) => fmtY(Number(v), chart.formatY)}
              width={90}
            />
            <Tooltip
              formatter={(value) => fmtY(Number(value), chart.formatY)}
              labelFormatter={(label) => String(label)}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                fontSize: 12,
                fontWeight: 600,
              }}
            />
            {chart.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />}
            {chart.series.map((s, i) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name}
                stroke={SERIE_COLORS[i % SERIE_COLORS.length]}
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
