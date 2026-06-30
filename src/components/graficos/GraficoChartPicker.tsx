"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { GraficoLineaRecharts } from "@/components/graficos/GraficoLineaRecharts";
import type { GraficoLinea } from "@/lib/graficos/types";
import { needsChartPicker, shortChartLabel } from "@/lib/graficos/uiHelpers";

type Props = {
  charts: GraficoLinea[];
  chartId?: string | null;
  onChartChange?: (id: string) => void;
};

export function GraficoChartPicker({ charts, chartId, onChartChange }: Props) {
  const picker = needsChartPicker(charts);
  const [localId, setLocalId] = useState(charts[0]?.id ?? "");

  const activoId = chartId && charts.some((c) => c.id === chartId) ? chartId : localId;
  const idx = Math.max(0, charts.findIndex((c) => c.id === activoId));
  const chart = charts[idx] ?? charts[0];

  useEffect(() => {
    if (chartId && charts.some((c) => c.id === chartId)) {
      setLocalId(chartId);
    } else if (charts[0] && !charts.some((c) => c.id === localId)) {
      setLocalId(charts[0].id);
    }
  }, [chartId, charts, localId]);

  const select = (id: string) => {
    setLocalId(id);
    onChartChange?.(id);
  };

  const prev = () => select(charts[Math.max(0, idx - 1)]!.id);
  const next = () => select(charts[Math.min(charts.length - 1, idx + 1)]!.id);

  if (!charts.length) {
    return <p className="text-sm text-slate-400">Sin gráficos en esta vista.</p>;
  }

  if (!picker) {
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {charts.map((c) => (
          <GraficoLineaRecharts key={c.id} chart={c} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={prev}
          disabled={idx === 0}
          className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-30 sm:hidden"
          aria-label="Gráfico anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {charts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => select(c.id)}
              className={clsx(
                "shrink-0 rounded-lg px-3 py-1.5 text-left text-xs font-bold transition-all sm:text-sm",
                activoId === c.id
                  ? "bg-green-600 text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
              title={c.titulo}
            >
              {shortChartLabel(c.titulo)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={next}
          disabled={idx >= charts.length - 1}
          className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-30 sm:hidden"
          aria-label="Gráfico siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {chart && <GraficoLineaRecharts chart={chart} />}
    </div>
  );
}
