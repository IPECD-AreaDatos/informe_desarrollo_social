"use client";

import { useMemo } from "react";
import { GraficosVistaTabs } from "@/components/graficos/GraficosVistaTabs";
import { GraficoChartPicker } from "@/components/graficos/GraficoChartPicker";
import { GraficoHistoricoTablas } from "@/components/graficos/GraficoHistoricoTablas";
import type { GraficoWorkbook } from "@/lib/graficos/types";
import { isWorkbookConTabs } from "@/lib/graficos/types";
import { normalizeWorkbookForUi } from "@/lib/graficos/uiHelpers";

type Props = {
  workbook: GraficoWorkbook;
  vistaId?: string | null;
  chartId?: string | null;
  onVistaChange: (id: string) => void;
  onChartChange: (id: string) => void;
};

export function GraficosWorkbookPanel({
  workbook,
  vistaId,
  chartId,
  onVistaChange,
  onChartChange,
}: Props) {
  const normalized = useMemo(() => normalizeWorkbookForUi(workbook), [workbook]);

  if (!isWorkbookConTabs(normalized)) {
    return (
      <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm md:p-6">
        <h3 className="mb-6 border-b border-slate-100 pb-3 text-lg font-black text-slate-800 md:text-xl">
          {normalized.titulo}
        </h3>
        <GraficoChartPicker charts={normalized.charts} chartId={chartId} onChartChange={onChartChange} />
      </div>
    );
  }

  const vista =
    normalized.tabs.find((t) => t.id === vistaId) ?? normalized.tabs[0];
  const isHistorico = vista?.id === "historico";

  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm md:p-6">
      <h3 className="mb-4 border-b border-slate-100 pb-3 text-lg font-black text-slate-800 md:text-xl">
        {normalized.titulo}
      </h3>

      <div className="mb-6">
        <GraficosVistaTabs
          tabs={normalized.tabs.map((t) => ({ id: t.id, label: t.label }))}
          activo={vista?.id ?? ""}
          onChange={onVistaChange}
        />
      </div>

      {isHistorico ? (
        <div className="space-y-6">
          <GraficoChartPicker
            charts={vista?.charts ?? []}
            chartId={chartId}
            onChartChange={onChartChange}
          />
          {vista?.tablas && vista.tablas.length > 0 && (
            <GraficoHistoricoTablas tablas={vista.tablas} accordion />
          )}
        </div>
      ) : (
        <GraficoChartPicker
          charts={vista?.charts ?? []}
          chartId={chartId}
          onChartChange={onChartChange}
        />
      )}
    </div>
  );
}
