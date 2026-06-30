"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { Header } from "@/components/Header";
import { GraficosRubroTabs } from "@/components/graficos/GraficosRubroTabs";
import { GraficosWorkbookPanel } from "@/components/graficos/GraficosWorkbookPanel";
import { apiUrl } from "@/lib/apiBase";
import type { GraficoWorkbook, GraficoWorkbookId } from "@/lib/graficos/types";
import { GRAFICOS_ORDEN, isWorkbookConTabs } from "@/lib/graficos/types";
import { normalizeWorkbookForUi } from "@/lib/graficos/uiHelpers";

function defaultVista(wb: GraficoWorkbook): string | null {
  const n = normalizeWorkbookForUi(wb);
  if (isWorkbookConTabs(n)) return n.tabs[0]?.id ?? null;
  return null;
}

function defaultChart(wb: GraficoWorkbook, vistaId: string | null): string | null {
  const n = normalizeWorkbookForUi(wb);
  if (isWorkbookConTabs(n)) {
    const tab = n.tabs.find((t) => t.id === vistaId) ?? n.tabs[0];
    return tab?.charts[0]?.id ?? null;
  }
  return n.charts[0]?.id ?? null;
}

function GraficosPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [workbooks, setWorkbooks] = useState<GraficoWorkbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/comedores/graficos?all=1"))
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setWorkbooks(j.data ?? []);
        else setError(j.error ?? "Error al cargar gráficos");
      })
      .catch(() => setError("Error de red al cargar gráficos"))
      .finally(() => setLoading(false));
  }, []);

  const ordenados = useMemo(() => {
    const map = new Map(workbooks.map((w) => [w.id, w]));
    return GRAFICOS_ORDEN.map((id) => map.get(id)).filter(Boolean) as GraficoWorkbook[];
  }, [workbooks]);

  const rubroParam = searchParams.get("rubro");
  const rubroActivo: GraficoWorkbookId = GRAFICOS_ORDEN.includes(rubroParam as GraficoWorkbookId)
    ? (rubroParam as GraficoWorkbookId)
    : GRAFICOS_ORDEN[0];

  const workbookActivo = ordenados.find((w) => w.id === rubroActivo) ?? ordenados[0];

  const vistaParam = searchParams.get("vista");
  const chartParam = searchParams.get("chart");

  const vistaActiva = useMemo(() => {
    if (!workbookActivo) return null;
    const n = normalizeWorkbookForUi(workbookActivo);
    if (!isWorkbookConTabs(n)) return null;
    const valid = n.tabs.some((t) => t.id === vistaParam);
    return valid && vistaParam ? vistaParam : defaultVista(workbookActivo);
  }, [workbookActivo, vistaParam]);

  const chartActivo = useMemo(() => {
    if (!workbookActivo) return null;
    const n = normalizeWorkbookForUi(workbookActivo);
    let charts;
    if (isWorkbookConTabs(n)) {
      const tab = n.tabs.find((t) => t.id === vistaActiva) ?? n.tabs[0];
      charts = tab?.charts ?? [];
    } else {
      charts = n.charts;
    }
    const valid = charts.some((c) => c.id === chartParam);
    return valid && chartParam ? chartParam : charts[0]?.id ?? null;
  }, [workbookActivo, vistaActiva, chartParam]);

  const updateParams = useCallback(
    (patch: { rubro?: string; vista?: string | null; chart?: string | null }) => {
      const p = new URLSearchParams(searchParams.toString());

      if (patch.rubro !== undefined) {
        p.set("rubro", patch.rubro);
        p.delete("vista");
        p.delete("chart");
      }
      if (patch.vista !== undefined) {
        if (patch.vista) p.set("vista", patch.vista);
        else p.delete("vista");
        p.delete("chart");
      }
      if (patch.chart !== undefined) {
        if (patch.chart) p.set("chart", patch.chart);
        else p.delete("chart");
      }

      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const handleRubroChange = (id: GraficoWorkbookId) => {
    updateParams({ rubro: id });
  };

  const handleVistaChange = (id: string) => {
    updateParams({ vista: id, chart: null });
  };

  const handleChartChange = (id: string) => {
    updateParams({ chart: id });
  };

  const rubroItems = ordenados.map((w) => ({ id: w.id as GraficoWorkbookId, titulo: w.titulo }));

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] space-y-6 bg-[#F8FAFC] p-6">
      <Header hideDatePicker />

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-3 text-2xl font-black tracking-tight text-slate-800 sm:text-3xl">
          <BarChart3 className="shrink-0 text-green-600" />
          Gráficos — Seguridad alimentaria
        </h2>
        <p className="text-sm font-medium italic text-slate-500 md:text-base">
          Evolución de gastos y precios según planillas oficiales en Excel.
        </p>
      </div>

      {loading && (
        <div className="h-64 animate-pulse rounded-[28px] bg-slate-100" />
      )}

      {!loading && error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {!loading && !error && ordenados.length > 0 && (
        <>
          <GraficosRubroTabs
            rubros={rubroItems}
            activo={rubroActivo}
            onChange={handleRubroChange}
          />
          {workbookActivo && (
            <GraficosWorkbookPanel
              key={workbookActivo.id}
              workbook={workbookActivo}
              vistaId={vistaActiva}
              chartId={chartActivo}
              onVistaChange={handleVistaChange}
              onChartChange={handleChartChange}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function GraficosPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto min-w-0 max-w-[1600px] space-y-6 bg-[#F8FAFC] p-6">
          <div className="h-64 animate-pulse rounded-[28px] bg-slate-100" />
        </div>
      }
    >
      <GraficosPageContent />
    </Suspense>
  );
}
