"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import {
  UtensilsCrossed,
  Users,
  Flame,
  Sparkles,
  Carrot,
  MapPin,
  ChevronDown,
  X,
  Phone,
  User,
  ClipboardList,
  Search,
  Beef,
  HandCoins,
  Info,
} from "lucide-react";
import { Header } from "@/components/Header";
import { KPICard } from "@/components/KPICard";
import { clsx } from "clsx";

type RankingTipo =
  | "raciones"
  | "becados"
  | "refrigerio_comida"
  | "carnes"
  | "otros_recursos"
  | "promedio_beneficiario";

interface SummaryData {
  total_comedores: number;
  por_ambito: { ambito: string; cantidad: number }[];
  total_beneficiarios_interior: number;
  total_beneficiarios_capital?: number;
  racion?: {
    total_raciones: number;
    por_tipo_servicio: { tipo_servicio: string; cantidad: number }[];
  };
  recursos_globales: {
    gas_kg_equiv: number;
    gas_desglose?: { garrafas_10: number; garrafas_15: number; garrafas_45: number };
    limpieza_total_articulos: number;
    limpieza_desglose?: Record<string, number>;
    frescos_kg: number;
    frescos_desglose?: Record<string, number>;
    fumigacion_count: number;
  };
  montos: {
    monto_invertido_total: number;
    monto_invertido_cantidad: number;
    becados_monto: number;
    becados_cantidad: number;
    becados_capital?: number;
    becados_interior?: number;
    refrigerio_comida_monto: number;
    refrigerio_verduras_kg: number;
    refrigerio_frutas_unidades: number;
    carnes_monto: number;
    carnes_cantidad: number;
    otros_recursos_monto: number;
    otros_limpieza_cantidad: number;
    otros_gas_cantidad: number;
  };
  comedores_por_zona_capital: { zona: string; cantidad: number }[];
  comedores_por_interior: {
    departamento: string;
    localidad: string | null;
    cantidad: number;
    tipos?: { tipo: string; subtipo: string | null; cantidad: number }[];
  }[];
  comedores_por_tipo?: { tipo: string; subtipo: string | null; cantidad: number }[];
}

interface RankingRow {
  comedor_id: number;
  nombre: string;
  zona_nombre: string | null;
  ambito: string;
  responsable_nombre: string | null;
  valor: number;
  beneficiarios?: number;
  unidad?: string;
}

type SortKey = "nombre" | "monto" | "benef";
type RankingAmbitoFilter = "TODOS" | "CAPITAL" | "INTERIOR";

interface ComedorDetailData {
  comedor_id: number;
  nombre: string;
  domicilio: string | null;
  zona_nombre: string | null;
  ambito: string;
  departamento: string | null;
  localidad: string | null;
  tipo_nombre: string | null;
  organismo_nombre: string | null;
  responsable_nombre: string | null;
  telefono: string | null;
  link_google_maps: string | null;
  coordenadas_lat: number | null;
  coordenadas_lng: number | null;
  beneficiarios: number | null;
  recursos: {
    gas: { garrafas_10: number; garrafas_15: number; garrafas_45: number };
    limpieza: Record<string, number>;
    frescos_kg: number;
    frescos_desglose?: Record<string, number>;
    fumigacion: boolean;
  };
  composicion_gasto?: {
    raciones: number;
    becados: number;
    refrigerio_comida: number;
    carnes: number;
    otros_recursos: number;
    gasto_total_comedor?: number;
    gasto_total_global?: number;
  };
  presupuesto_desglose?: {
    rubro: string;
    subrubro: string | null;
    monto: number;
    cantidad: number;
    unidad: string | null;
  }[];
}

const RANKING_TABS: { key: RankingTipo; label: string }[] = [
  { key: "raciones", label: "Raciones" },
  { key: "becados", label: "Becados" },
  { key: "refrigerio_comida", label: "Refrigerios / Comidas" },
  { key: "carnes", label: "Carnes" },
  { key: "otros_recursos", label: "Otros recursos" },
  { key: "promedio_beneficiario", label: "Promedio por beneficiario" },
];

const RANKING_TOOLTIP: Record<RankingTipo, string> = {
  raciones:
    "Monto = (beneficiarios_dep / total_beneficiarios) × monto_mensual_teknofood. Total mensual = raciones_diarias × $1.600 × 30 días.",
  becados:
    "Monto prorrateado del presupuesto total de becados según cantidad de becarios por dependencia.",
  refrigerio_comida:
    "Monto = (kg_dep / total_kg) × $107.989.875,73 (presupuesto frutas y verduras).",
  carnes:
    "Monto = (kg_semanal × precio_tipo × 4,33) escalado al total de $137.123.110,80. Precios: vacuna $13.380/kg, pollo $7.679/kg, cerdo $8.420/kg.",
  otros_recursos:
    "Suma de gas + limpieza + fumigación por dependencia. Frecuencia: limpieza cada 2 meses (bimestral) y fumigación cada 3 meses (trimestral). Gas: $11.570.000, Limpieza: $13.311.798, Fumigación: $2.600.000.",
  promedio_beneficiario:
    "Promedio = (suma de todos los rubros de la dependencia) / cantidad de beneficiarios de la dependencia.",
};

function totalRubroForRanking(tipo: RankingTipo, m: SummaryData["montos"] | undefined): number {
  if (!m) return 0;
  switch (tipo) {
    case "raciones":
      return m.monto_invertido_total ?? 0;
    case "becados":
      return m.becados_monto ?? 0;
    case "refrigerio_comida":
      return m.refrigerio_comida_monto ?? 0;
    case "carnes":
      return m.carnes_monto ?? 0;
    case "otros_recursos":
      return m.otros_recursos_monto ?? 0;
    default:
      return 0;
  }
}

function ComedoresPageContent() {
  const [periodos, setPeriodos] = useState<{ valor: string; etiqueta: string }[]>([]);
  const [periodo, setPeriodo] = useState("");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [rankingTipo, setRankingTipo] = useState<RankingTipo>("raciones");
  const [rankingAmbito, setRankingAmbito] = useState<RankingAmbitoFilter>("TODOS");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("monto");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ComedorDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const rankingFetchLimit = searchTerm.trim() ? 2000 : 50;

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/comedores/periodos`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data?.length) {
          setPeriodos(j.data);
          setPeriodo(j.data[0]?.valor ?? "");
        }
      })
      .catch(() => setPeriodos([{ valor: "", etiqueta: "Todos" }]));
  }, []);

  useEffect(() => {
    if (periodo === undefined) return;
    setLoadingSummary(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/comedores/summary?periodo=${encodeURIComponent(periodo)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setSummary(j.data);
      })
      .finally(() => setLoadingSummary(false));
  }, [periodo]);

  useEffect(() => {
    setLoadingRankings(true);
    const ambitoParam = rankingAmbito === "TODOS" ? "" : `&ambito=${rankingAmbito}`;
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL || ""}/api/comedores/rankings?periodo=${encodeURIComponent(periodo)}&tipo=${rankingTipo}&limit=${rankingFetchLimit}${ambitoParam}`
    )
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setRankings(j.data ?? []);
      })
      .finally(() => setLoadingRankings(false));
  }, [periodo, rankingTipo, rankingAmbito, rankingFetchLimit]);

  const rankingRows = useMemo(() => {
    const totalMontoInvertido = summary?.montos?.monto_invertido_total ?? 0;
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const rows = rankings
      .map((r) => {
        const benef = Number(r.beneficiarios ?? 0);
        const monto = Number(r.valor ?? 0);
        const pctParticipacionRelativa =
          rankingTipo !== "promedio_beneficiario" && totalMontoInvertido > 0
            ? (monto / totalMontoInvertido) * 100
            : null;
        const promBenef = benef > 0 ? monto / benef : null;
        return { ...r, benef, monto, pctParticipacionRelativa, promBenef };
      })
      .filter((r) => {
        if (!normalizedSearch) return true;
        const bag = `${r.nombre} ${r.responsable_nombre || ""} ${r.zona_nombre || ""} ${r.ambito}`.toLowerCase();
        return bag.includes(normalizedSearch);
      })
      .filter((r) => {
        const montoPositivo = Number(r.monto ?? 0) > 0;
        const benefPositivo = Number(r.benef ?? 0) > 0;
        const pctPositivo = Number(r.pctParticipacionRelativa ?? 0) > 0;
        const promPositivo = Number(r.promBenef ?? 0) > 0;
        return montoPositivo || benefPositivo || pctPositivo || promPositivo;
      });

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "nombre") cmp = a.nombre.localeCompare(b.nombre);
      if (sortKey === "monto") cmp = a.monto - b.monto;
      if (sortKey === "benef") cmp = a.benef - b.benef;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [rankings, rankingTipo, searchTerm, sortDir, sortKey, summary?.montos]);

  const sinPromedioDatos =
    rankingTipo === "promedio_beneficiario" &&
    !loadingRankings &&
    (!rankings.length ||
      rankings.every((r) => Number(r.beneficiarios ?? 0) <= 0 || Number(r.valor ?? 0) <= 0));

  const presupuestoFvCantidades = useMemo(() => {
    const v = summary?.montos?.refrigerio_verduras_kg ?? 0;
    const f = summary?.montos?.refrigerio_frutas_unidades ?? 0;
    return `${v.toLocaleString("es-AR", { maximumFractionDigits: 0 })} kg verd.\n${f.toLocaleString("es-AR", { maximumFractionDigits: 0 })} u. de frutas`;
  }, [summary]);

  const otrosRecursosCantidades = useMemo(() => {
    const m = summary?.montos;
    if (!m) return "";
    const l = m.otros_limpieza_cantidad ?? 0;
    const g = m.otros_gas_cantidad ?? 0;
    return `Limpieza: ${l.toLocaleString("es-AR")} u.\nGas: ${g.toLocaleString("es-AR")} garrafas`;
  }, [summary]);

  const totalDependenciasTooltip = useMemo(() => {
    const rows = summary?.comedores_por_tipo ?? [];
    if (!rows.length) {
      const total = summary?.total_comedores ?? 0;
      return `Total: ${total.toLocaleString("es-AR")} dependencias. Sin desglose por tipo disponible.`;
    }
    const total = summary?.total_comedores ?? 0;
    const detalle = rows
      .slice(0, 8)
      .map((r) => `${r.subtipo ? `${r.tipo} - ${r.subtipo}` : r.tipo}: ${r.cantidad.toLocaleString("es-AR")}`)
      .join(" | ");
    return `Total: ${total.toLocaleString("es-AR")} dependencias. Tipos: ${detalle}`;
  }, [summary]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "nombre" ? "asc" : "desc");
  };

  const formatPeriodoLabel = (label: string) => {
    if (label.trim().toLowerCase() === "plan verano 2026") {
      return "Plan Verano 2026 (enero y febrero)";
    }
    return label;
  };

  useEffect(() => {
    if (detailId == null) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL || ""}/api/comedores/${detailId}?periodo=${encodeURIComponent(periodo)}`
    )
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setDetail(j.data);
        else setDetail(null);
      })
      .finally(() => setLoadingDetail(false));
  }, [detailId, periodo]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6 lg:space-y-8 bg-[var(--background)] min-w-0">
      <Header hideDatePicker />

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
          <UtensilsCrossed className="text-green-600 shrink-0" />
          Dependencia y recursos
        </h2>
        <p className="text-slate-500 font-medium italic text-sm sm:text-base">
          Estadísticas por periodo enfocadas en montos de Seguridad Alimentaria.
        </p>
      </div>

      {/* Periodo selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Periodo</span>
        <div className="relative">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="appearance-none bg-white px-4 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-green-500/30 focus:border-green-500"
          >
            {periodos.length ? periodos.map((p) => (
              <option key={p.valor} value={p.valor}>{formatPeriodoLabel(p.etiqueta || "Todos")}</option>
            )) : (
              <option value="">Cargando...</option>
            )}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <KPICard
          label="Total dependencias"
          value={summary?.total_comedores?.toLocaleString() ?? "0"}
          icon={UtensilsCrossed}
          loading={loadingSummary}
          description={totalDependenciasTooltip}
        />
        <KPICard
          label="Costo de Teknofood"
          value={`$${(summary?.montos?.monto_invertido_total ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          secondaryValue={(summary?.montos?.monto_invertido_cantidad ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          secondaryLabel="Cantidad"
          icon={HandCoins}
          loading={loadingSummary}
          color="#0d9488"
          description="Comprende a los recursos qué son adquiridos de TeknoFoot"
        />
        <KPICard
          label="Becados"
          value={`$${(summary?.montos?.becados_monto ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          secondaryValue={(summary?.montos?.becados_cantidad ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          secondaryLabel="Cantidad"
          noteText={
            (summary?.montos?.becados_capital ?? 0) > 0 || (summary?.montos?.becados_interior ?? 0) > 0
              ? `Capital: ${summary?.montos?.becados_capital ?? 0} · Interior: ${summary?.montos?.becados_interior ?? 0}`
              : undefined
          }
          icon={Users}
          loading={loadingSummary}
          color="#0369a1"
          description="Se divide en 3 categorías: cocinero, auxiliar y encargado."
        />
        <KPICard
          label="Refrigerio / Comida"
          value={`$${(summary?.montos?.refrigerio_comida_monto ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          secondaryValue={presupuestoFvCantidades}
          secondaryLabel="Cantidades"
          icon={ClipboardList}
          loading={loadingSummary}
          color="#f97316"
          description="Solo frutas (unidades) y verduras (kg). Monto y cantidades del presupuesto marzo (no incluye carnes)."
        />
        <KPICard
          label="Carnes"
          value={`$${(summary?.montos?.carnes_monto ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          secondaryValue={(summary?.montos?.carnes_cantidad ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          secondaryLabel="Cantidad (kg)"
          icon={Beef}
          loading={loadingSummary}
          color="#dc2626"
          description="Presupuesto carnes: vacuna, pollo y cerdo (kg)."
        />
        <KPICard
          label="Otros recursos"
          value={`$${(summary?.montos?.otros_recursos_monto ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          secondaryValue={otrosRecursosCantidades}
          secondaryLabel="Cantidades"
          icon={Sparkles}
          loading={loadingSummary}
          color="#7c3aed"
          description="Monto: limpieza + gas + fumigación. Frecuencia: limpieza cada 2 meses (bimestral) y fumigación cada 3 meses (trimestral). Cantidades mostradas: solo artículos de limpieza y garrafas."
        />
      </div>

      {/* Interior breakdown */}
      <div className="grid grid-cols-1 min-w-0">
        <div className="bg-white p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[40px] border border-slate-100 shadow-sm min-w-0">
          <h3 className="text-lg sm:text-xl font-black text-slate-800 mb-4 sm:mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
            <MapPin className="text-green-600 shrink-0" />
            Dependencias por departamento/localidad (Interior, top 15)
          </h3>
          <div className="space-y-3 max-h-64 overflow-y-auto min-w-0">
            {summary?.comedores_por_interior?.map((d, i) => {
              const departamentoLimpio = String(d.departamento ?? "")
                .replace(/^dto\.?\s*de\s+/i, "")
                .replace(/^departamento\s*de\s+/i, "")
                .trim();
              const totalInterior = Math.max(
                (summary.comedores_por_interior ?? []).reduce((acc, x) => acc + Number(x.cantidad ?? 0), 0),
                1
              );
              const pct = (d.cantidad / totalInterior) * 100;
              const label = [departamentoLimpio, d.localidad].filter(Boolean).join(" / ") || "Sin nombre";
              const tiposTooltip = (d.tipos ?? []).slice(0, 8);
              return (
                <div key={i} className="flex justify-between items-center gap-2 sm:gap-4 min-w-0">
                  <span className="text-xs sm:text-sm font-bold text-slate-600 flex-1 min-w-0 truncate">{label}</span>
                  <div className="shrink-0 relative group">
                    <div className="w-24 sm:w-32 h-5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all flex items-center justify-end pr-1"
                        style={{ width: `${pct}%` }}
                      >
                        {pct >= 18 && (
                          <span className="text-[10px] font-black text-white leading-none">
                            {pct.toLocaleString("es-AR", { maximumFractionDigits: 0 })}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 w-[300px] max-w-[90vw] rounded-lg bg-slate-800 text-white text-[11px] leading-snug font-normal p-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                      <p className="font-bold">{label}</p>
                      <p className="mt-1">
                        Dependencias: {d.cantidad.toLocaleString("es-AR")} ({pct.toLocaleString("es-AR", { maximumFractionDigits: 0 })}%)
                      </p>
                      {tiposTooltip.length > 0 && (
                        <p className="mt-1">
                          Tipos:{" "}
                          {tiposTooltip
                            .map((t) => `${t.subtipo ? `${t.tipo} - ${t.subtipo}` : t.tipo}: ${t.cantidad}`)
                            .join(" | ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs sm:text-sm font-black text-slate-800 w-16 sm:w-20 text-right shrink-0">
                    {pct.toLocaleString("es-AR", { maximumFractionDigits: 0 })}%
                  </span>
                </div>
              );
            })}
            {!summary?.comedores_por_interior?.length && !loadingSummary && (
              <p className="text-slate-400 text-sm">Sin datos</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[40px] border border-slate-100 shadow-sm min-w-0">
        <h3 className="text-lg sm:text-xl font-black text-slate-800 mb-4 sm:mb-6 border-b border-slate-100 pb-4">
          Resumen territorial y tipo de dependencia
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-slate-50">
            <p className="text-xs uppercase font-black tracking-wider text-slate-500 mb-2">Capital / Interior</p>
            <p className="text-slate-700 font-bold">Capital: 212</p>
            <p className="text-slate-700 font-bold">Interior: 170</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50">
            <p className="text-xs uppercase font-black tracking-wider text-slate-500 mb-2">Cantidad de zonas/localidades</p>
            <p className="text-slate-700 font-bold">Zonas Capital: {summary?.comedores_por_zona_capital?.length ?? 0}</p>
            <p className="text-slate-700 font-bold">Localidades Interior: {summary?.comedores_por_interior?.length ?? 0}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-xs uppercase font-black tracking-wider text-slate-500 mb-2">Por tipo de dependencia</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto text-sm">
              {(summary?.comedores_por_tipo ?? []).map((row, i) => {
                const label = row.subtipo ? `${row.tipo} · ${row.subtipo}` : row.tipo;
                return (
                  <div key={`${label}-${i}`} className="flex justify-between gap-2 text-slate-800 font-semibold">
                    <span className="truncate min-w-0" title={label}>{label}</span>
                    <span className="shrink-0 font-black">{row.cantidad.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
            {!summary?.comedores_por_tipo?.length && !loadingSummary && (
              <p className="text-slate-400 text-sm mt-1">Sin datos de tipo</p>
            )}
          </div>
        </div>
      </div>

      {/* Rankings */}
      <div className="bg-white p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[40px] border border-slate-100 shadow-sm min-w-0">
        <h3 className="text-lg sm:text-xl font-black text-slate-800 mb-4 sm:mb-6 border-b border-slate-100 pb-4">Ranking por gastos</h3>
        <div className="flex flex-wrap gap-2 mb-4 sm:mb-6">
          {RANKING_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setRankingTipo(tab.key)}
              className={clsx(
                "px-3 sm:px-4 py-2 min-h-[44px] sm:min-h-0 rounded-xl text-xs sm:text-sm font-bold transition-all",
                rankingTipo === tab.key
                  ? "bg-green-600 text-white shadow-lg"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {(["TODOS", "CAPITAL", "INTERIOR"] as const).map((amb) => (
            <button
              key={amb}
              onClick={() => setRankingAmbito(amb)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                rankingAmbito === amb
                  ? "bg-slate-700 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {amb === "TODOS" ? "Todos" : amb === "CAPITAL" ? "Capital" : "Interior"}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mb-3 sm:mb-4 flex items-start gap-1.5 leading-relaxed">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{RANKING_TOOLTIP[rankingTipo]}</span>
        </p>
        <div className="mb-4 sm:mb-6 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por dependencia, responsable o zona..."
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
          />
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs sm:text-sm min-w-[400px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 font-bold uppercase tracking-wider">
                <th className="pb-3 pr-2 sm:pr-4">#</th>
                <th className="pb-3 pr-2 sm:pr-4">
                  <button className="hover:text-slate-700" onClick={() => onSort("nombre")}>Dependencia</button>
                </th>
                <th className="pb-3 pr-2 sm:pr-4">Zona / Ámbito</th>
                <th className="pb-3 pr-2 sm:pr-4 text-right">
                  <span className="inline-flex items-center gap-1">
                    <button className="hover:text-slate-700" onClick={() => onSort("monto")}>Monto</button>
                    <span className="relative group">
                      <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                      <span className="pointer-events-none absolute right-0 top-full mt-2 w-64 rounded-lg bg-slate-800 text-white text-[11px] leading-snug font-normal normal-case tracking-normal p-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                        {RANKING_TOOLTIP[rankingTipo]}
                      </span>
                    </span>
                  </span>
                </th>
                <th className="pb-3 pr-2 sm:pr-4 text-right hidden md:table-cell">
                  <span title="Participación sobre el total de monto invertido">Participación relativa</span>
                </th>
                <th className="pb-3 pr-2 sm:pr-4 text-right hidden lg:table-cell">
                  Monto prom./benef.
                </th>
                <th className="pb-3 pr-2 sm:pr-4 text-right">
                  <button className="hover:text-slate-700" onClick={() => onSort("benef")}>Benef.</button>
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingRankings ? (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">Cargando...</td></tr>
              ) : sinPromedioDatos ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 text-sm font-medium">
                    Sin datos de monto o beneficiarios en presupuesto (Teknofood) para calcular el promedio.
                  </td>
                </tr>
              ) : !rankingRows.length ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 text-sm font-medium">
                    Sin datos con monto o beneficiarios para mostrar.
                  </td>
                </tr>
              ) : (
                rankingRows.map((r, i) => {
                  const puedeDetalle = r.comedor_id > 0;
                  return (
                  <tr
                    key={r.comedor_id || `row-${i}`}
                    onClick={() => puedeDetalle && setDetailId(r.comedor_id)}
                    title={
                      puedeDetalle
                        ? undefined
                        : "Sin vínculo con el padrón de comedores: el nombre del presupuesto no coincide con un registro en COMEDOR, por eso no hay detalle."
                    }
                    className={clsx(
                      "border-b border-slate-50 transition-colors",
                      puedeDetalle ? "hover:bg-green-50/50 cursor-pointer" : "cursor-default opacity-85"
                    )}
                  >
                    <td className="py-3 pr-2 sm:pr-4 font-mono text-slate-400">{i + 1}</td>
                    <td className="py-3 pr-2 sm:pr-4 font-bold text-slate-800 truncate max-w-[120px] sm:max-w-none">{r.nombre}</td>
                    <td className="py-3 pr-2 sm:pr-4 text-slate-600 truncate max-w-[80px] sm:max-w-none">{r.zona_nombre || r.ambito}</td>
                    <td className="py-3 pr-2 sm:pr-4 text-right font-black text-slate-800 whitespace-nowrap">
                      ${r.monto.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-3 pr-2 sm:pr-4 text-right text-slate-600 whitespace-nowrap hidden md:table-cell">
                      {r.pctParticipacionRelativa != null
                        ? `${r.pctParticipacionRelativa.toLocaleString("es-AR", { maximumFractionDigits: 0 })}%`
                        : "—"}
                    </td>
                    <td className="py-3 pr-2 sm:pr-4 text-right text-slate-600 whitespace-nowrap hidden lg:table-cell">
                      {r.promBenef != null ? `$${r.promBenef.toLocaleString("es-AR", { maximumFractionDigits: 0 })}` : "—"}
                    </td>
                    <td className="py-3 pr-2 sm:pr-4 text-right font-black text-slate-700 whitespace-nowrap">
                      {r.benef.toLocaleString()}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detailId != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50"
          onClick={() => setDetailId(null)}
        >
          <div
            className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-start">
              <h3 className="text-lg sm:text-xl font-black text-slate-800">Detalle de la dependencia</h3>
              <button onClick={() => setDetailId(null)} className="p-2 rounded-xl hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-0 sm:min-w-0">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6">
              {loadingDetail ? (
                <div className="h-40 animate-pulse bg-slate-100 rounded-2xl" />
              ) : detail ? (
                <>
                  <div className="min-w-0">
                    <p className="text-base sm:text-lg font-black text-slate-800 break-words">{detail.nombre}</p>
                    {detail.domicilio && <p className="text-sm text-slate-600 mt-1 break-words">{detail.domicilio}</p>}
                    <p className="text-xs text-slate-500 mt-1">{detail.zona_nombre || detail.ambito} {detail.departamento && ` · ${detail.departamento}`} {detail.localidad && ` · ${detail.localidad}`}</p>
                  </div>
                  {(detail.link_google_maps || (detail.coordenadas_lat != null && detail.coordenadas_lng != null)) && (
                    <div className="space-y-2">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5" /> Ubicación
                      </p>
                      {detail.coordenadas_lat != null && detail.coordenadas_lng != null && (
                        <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-video min-h-[200px]">
                          <iframe
                            title={`Mapa ${detail.nombre}`}
                            src={`https://www.openstreetmap.org/export/embed.html?bbox=${detail.coordenadas_lng - 0.01},${detail.coordenadas_lat - 0.01},${detail.coordenadas_lng + 0.01},${detail.coordenadas_lat + 0.01}&layer=mapnik&marker=${detail.coordenadas_lat},${detail.coordenadas_lng}`}
                            className="w-full h-full min-h-[200px] border-0"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                      {detail.link_google_maps && (
                        <a
                          href={detail.link_google_maps}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-bold text-green-600 hover:text-green-700 hover:underline"
                        >
                          <MapPin className="w-4 h-4 shrink-0" />
                          Abrir en Google Maps
                        </a>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {detail.tipo_nombre && <span className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">{detail.tipo_nombre}</span>}
                    {detail.organismo_nombre && <span className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">{detail.organismo_nombre}</span>}
                  </div>
                  {(detail.responsable_nombre || detail.telefono) && (
                    <div className="flex flex-col gap-1 text-sm">
                      {detail.responsable_nombre && (
                        <p className="flex items-center gap-2 text-slate-700"><User className="w-4 h-4 shrink-0" /> <span className="break-all">{detail.responsable_nombre}</span></p>
                      )}
                      {detail.telefono && (
                        <p className="flex items-center gap-2 text-slate-700"><Phone className="w-4 h-4 shrink-0" /> <span className="break-all">{detail.telefono}</span></p>
                      )}
                    </div>
                  )}
                  {detail.beneficiarios != null && detail.beneficiarios > 0 && (
                    <p className="text-sm"><span className="font-bold text-slate-500">Beneficiarios:</span> <span className="font-black text-slate-800">{detail.beneficiarios}</span></p>
                  )}
                  <div className="pt-4 border-t border-slate-100 space-y-3">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Programas y cantidades</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Incluye todos los rubros del presupuesto cargado (raciones, becados, refrigerio/comidas, carnes, gas, limpieza, fumigación, etc.), según existan datos en Anexo histórico o en la carga de marzo.
                    </p>
                    {detail.presupuesto_desglose && detail.presupuesto_desglose.length > 0 && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 overflow-x-auto">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Presupuesto por programa (esta dependencia)</p>
                        <table className="w-full text-xs text-left min-w-[320px]">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-200">
                              <th className="pb-1 pr-2 font-bold">Programa</th>
                              <th className="pb-1 pr-2 font-bold">Detalle</th>
                              <th className="pb-1 pr-2 font-bold text-right">Monto</th>
                              <th className="pb-1 font-bold text-right">Cant.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.presupuesto_desglose.map((row, idx) => {
                              const rubroLabel =
                                row.rubro === "monto_invertido"
                                  ? "Raciones / monto invertido"
                                  : row.rubro === "becados"
                                    ? "Becados"
                                    : row.rubro === "refrigerio_comida"
                                      ? "Refrigerio / comidas"
                                      : row.rubro === "carnes"
                                        ? "Carnes"
                                        : row.rubro === "otros_recursos"
                                          ? "Otros recursos"
                                          : row.rubro;
                              const sub = row.subrubro?.trim() || "—";
                              return (
                                <tr key={`${row.rubro}-${row.subrubro}-${idx}`} className="border-b border-slate-100/80">
                                  <td className="py-1.5 pr-2 font-semibold text-slate-700">{rubroLabel}</td>
                                  <td className="py-1.5 pr-2 text-slate-600">{sub}</td>
                                  <td className="py-1.5 pr-2 text-right font-mono text-slate-800">
                                    ${row.monto.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                                  </td>
                                  <td className="py-1.5 text-right text-slate-600">
                                    {row.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                                    {row.unidad ? ` ${row.unidad}` : ""}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div className="p-3 bg-violet-50 rounded-xl sm:col-span-2">
                        <span className="font-bold text-violet-800">Limpieza (entrega bimestral)</span>
                        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-violet-900">
                          {Object.entries(detail.recursos.limpieza).filter(([, v]) => v > 0).map(([k, v]) => {
                            const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                            return <li key={k}>{label}: {v}</li>;
                          })}
                        </ul>
                        {Object.values(detail.recursos.limpieza).every((v) => v === 0) && (
                          <p className="mt-1 text-xs text-violet-700">Sin cantidades cargadas para este comedor en el periodo.</p>
                        )}
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl sm:col-span-2">
                        <span className="font-bold text-emerald-800">Frutas, verduras (u.) y carnes (kg)</span>
                        {(() => {
                          const d = detail.recursos.frescos_desglose;
                          const kgVer =
                            (d?.cebolla_kg ?? 0) +
                            (d?.zanahoria_kg ?? 0) +
                            (d?.zapallo_kg ?? 0) +
                            (d?.papa_kg ?? 0) +
                            (d?.acelga_kg ?? 0);
                          const kgCar =
                            (d?.carne_vacuna_kg ?? 0) + (d?.pollo_kg ?? 0) + (d?.cerdo_kg ?? 0);
                          const frut = d?.frutas_unidades ?? 0;
                          const tieneAny = kgVer > 0 || kgCar > 0 || frut > 0;
                          const resumenPartes = [
                            kgVer > 0
                              ? `Verduras: ${kgVer.toLocaleString("es-AR", { maximumFractionDigits: 0 })} kg`
                              : null,
                            kgCar > 0
                              ? `Carnes: ${kgCar.toLocaleString("es-AR", { maximumFractionDigits: 0 })} kg`
                              : null,
                            frut > 0
                              ? `Frutas: ${frut.toLocaleString("es-AR", { maximumFractionDigits: 0 })} u.`
                              : null,
                          ].filter(Boolean) as string[];
                          const verdurasRows = d
                            ? (["cebolla_kg", "zanahoria_kg", "zapallo_kg", "papa_kg", "acelga_kg"] as const)
                                .map((k) => ({ k, v: Number(d[k] ?? 0) }))
                                .filter((row) => row.v > 0)
                            : [];
                          const carnesRows = d
                            ? (["carne_vacuna_kg", "pollo_kg", "cerdo_kg"] as const)
                                .map((k) => ({ k, v: Number(d[k] ?? 0) }))
                                .filter((row) => row.v > 0)
                            : [];
                          return (
                            <div className="mt-2 space-y-2 text-emerald-900 text-sm">
                              {resumenPartes.length > 0 && (
                                <p className="font-semibold text-emerald-950">{resumenPartes.join(" · ")}</p>
                              )}
                              {!tieneAny && (
                                <p className="text-xs text-emerald-700">Sin cantidades cargadas para este comedor en el periodo.</p>
                              )}
                              {d ? (
                                <>
                                  {verdurasRows.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-bold text-emerald-800/80 uppercase">Verduras — detalle (kg)</p>
                                    <ul className="mt-0.5 space-y-0.5">
                                      {verdurasRows.map(({ k, v }) => {
                                        const label = k.replace(/_kg$/, "").replace(/_/g, " ");
                                        return (
                                          <li key={k}>
                                            {label}: {Number(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })} kg
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                  )}
                                  <div>
                                    <p className="text-[10px] font-bold text-emerald-800/80 uppercase">Frutas (u.)</p>
                                    {Number(d.frutas_unidades ?? 0) > 0 && (
                                      <p className="mt-0.5">Unidades: {Number(d.frutas_unidades ?? 0).toLocaleString("es-AR")}</p>
                                    )}
                                  </div>
                                  {carnesRows.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-bold text-emerald-800/80 uppercase">Carnes — detalle (kg)</p>
                                    <ul className="mt-0.5 space-y-0.5">
                                      {carnesRows.map(({ k, v }) => {
                                        const label = k === "carne_vacuna_kg" ? "Carne vacuna" : k === "pollo_kg" ? "Pollo" : "Cerdo";
                                        return (
                                          <li key={k}>
                                            {label}: {Number(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })} kg
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                  )}
                                </>
                              ) : (
                                detail.recursos.frescos_kg > 0 && (
                                  <p className="mt-1">{detail.recursos.frescos_kg.toLocaleString("es-AR", { maximumFractionDigits: 0 })} kg total (sin desglose)</p>
                                )
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="p-3 bg-amber-50 rounded-xl sm:col-span-2">
                        <span className="font-bold text-amber-800">Gas</span>
                        {detail.recursos.gas.garrafas_10 === 0 &&
                        detail.recursos.gas.garrafas_15 === 0 &&
                        detail.recursos.gas.garrafas_45 === 0 ? (
                          <p className="mt-1 text-xs text-amber-900">Sin cantidades cargadas para este comedor en el periodo.</p>
                        ) : (
                          <ul className="mt-1 space-y-0.5 text-amber-900">
                            <li>10 kg: {detail.recursos.gas.garrafas_10}</li>
                            <li>15 kg: {detail.recursos.gas.garrafas_15}</li>
                            <li>45 kg: {detail.recursos.gas.garrafas_45}</li>
                          </ul>
                        )}
                      </div>
                      {detail.recursos.fumigacion && <div className="p-3 bg-slate-50 rounded-xl sm:col-span-2"><span className="font-bold text-slate-700">Fumigación (servicio trimestral):</span> Sí</div>}
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-100 space-y-3">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Composición del gasto</p>
                    {(() => {
                      const comp = detail.composicion_gasto || {
                        raciones: 0,
                        becados: 0,
                        refrigerio_comida: 0,
                        carnes: 0,
                        otros_recursos: 0,
                      };
                      const comedorTot = comp.gasto_total_comedor ??
                        comp.raciones + comp.becados + comp.refrigerio_comida + comp.carnes + comp.otros_recursos;
                      const fmtArs = (n: number) =>
                        `$${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                      const pctPresupuestoPropio = (n: number) => (comedorTot > 0 ? (n / comedorTot) * 100 : 0);
                      const items = [
                        { key: "raciones", label: "Raciones / monto invertido (p. ej. Teknofood)", value: comp.raciones },
                        { key: "becados", label: "Becados", value: comp.becados },
                        { key: "refrigerio_comida", label: "Refrigerio y comidas (frutas/verduras)", value: comp.refrigerio_comida },
                        { key: "carnes", label: "Carnes", value: comp.carnes },
                        {
                          key: "otros_recursos",
                          label: "Otros recursos (gas, limpieza bimestral, fumigación trimestral, etc.)",
                          value: comp.otros_recursos,
                        },
                      ];
                      return (
                        <>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Vista por <strong>grandes programas</strong>: raciones, becados, refrigerio/comidas, carnes y otros recursos. Cada fila es el monto de <strong>esta dependencia</strong> y su porcentaje respecto del{" "}
                            <strong>presupuesto propio de la dependencia</strong>.
                            {comedorTot > 0 && (
                              <>
                                {" "}
                                Presupuesto de esta dependencia: <strong>{fmtArs(comedorTot)}</strong>.
                              </>
                            )}
                            {comedorTot <= 0 && <span className="text-amber-700"> Sin presupuesto cargado para esta dependencia.</span>}
                          </p>
                          <div className="space-y-3 text-sm">
                            {items.map((item) => {
                              const pg = pctPresupuestoPropio(item.value);
                              return (
                                <div key={item.key}>
                                  <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 mb-1">
                                    <span className="font-semibold text-slate-600">{item.label}</span>
                                    <span className="font-black text-slate-800 text-right">
                                      {fmtArs(item.value)}
                                      {comedorTot > 0 && (
                                        <span className="text-slate-500 font-semibold ml-1">
                                          ({pg.toFixed(0)}% del presupuesto propio)
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                      className="h-full bg-green-500 rounded-full transition-all"
                                      style={{ width: `${Math.min(100, pg)}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              ) : (
                <p className="text-slate-500">No se encontró el comedor.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComedoresPage() {
  return (
    <Suspense fallback={<div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 bg-[var(--background)]">Cargando...</div>}>
      <ComedoresPageContent />
    </Suspense>
  );
}
