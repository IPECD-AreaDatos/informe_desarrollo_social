"use client";

import { useEffect, useState, Suspense } from "react";
import {
  UtensilsCrossed,
  Users,
  Flame,
  Sparkles,
  Carrot,
  MapPin,
  BarChart3,
  ChevronDown,
  X,
  Phone,
  User,
  ClipboardList,
} from "lucide-react";
import { Header } from "@/components/Header";
import { KPICard } from "@/components/KPICard";
import { clsx } from "clsx";

type RankingTipo = "beneficiarios" | "gas" | "limpieza" | "frescos" | "responsables";

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
  comedores_por_zona_capital: { zona: string; cantidad: number }[];
  comedores_por_interior: { departamento: string; localidad: string | null; cantidad: number }[];
}

interface RankingRow {
  comedor_id: number;
  nombre: string;
  zona_nombre: string | null;
  ambito: string;
  responsable_nombre: string | null;
  valor: number;
  unidad?: string;
}

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
}

const RANKING_TABS: { key: RankingTipo; label: string }[] = [
  { key: "beneficiarios", label: "Beneficiarios (Interior)" },
  { key: "gas", label: "Gas" },
  { key: "limpieza", label: "Limpieza" },
  { key: "frescos", label: "Frescos" },
  { key: "responsables", label: "Responsables" },
];

function ComedoresPageContent() {
  const [periodos, setPeriodos] = useState<{ valor: string; etiqueta: string }[]>([]);
  const [periodo, setPeriodo] = useState("");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [rankingTipo, setRankingTipo] = useState<RankingTipo>("gas");
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ComedorDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetch("/api/comedores/periodos")
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
    fetch(`/api/comedores/summary?periodo=${encodeURIComponent(periodo)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setSummary(j.data);
      })
      .finally(() => setLoadingSummary(false));
  }, [periodo]);

  useEffect(() => {
    setLoadingRankings(true);
    fetch(
      `/api/comedores/rankings?periodo=${encodeURIComponent(periodo)}&tipo=${rankingTipo}&limit=50`
    )
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setRankings(j.data ?? []);
      })
      .finally(() => setLoadingRankings(false));
  }, [periodo, rankingTipo]);

  useEffect(() => {
    if (detailId == null) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(
      `/api/comedores/${detailId}?periodo=${encodeURIComponent(periodo)}`
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
          Comedores y Recursos
        </h2>
        <p className="text-slate-500 font-medium italic text-sm sm:text-base">
          Estadísticas por periodo, distribución Capital/Interior y rankings.
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
              <option key={p.valor} value={p.valor}>{p.etiqueta || "Todos"}</option>
            )) : (
              <option value="">Cargando...</option>
            )}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 sm:gap-6">
        <KPICard
          label="Total comedores"
          value={summary?.total_comedores?.toLocaleString() ?? "0"}
          icon={UtensilsCrossed}
          loading={loadingSummary}
          description="Capital + Interior"
        />
        <KPICard
          label="Raciones"
          value={summary?.racion?.total_raciones?.toLocaleString() ?? "0"}
          icon={ClipboardList}
          loading={loadingSummary}
          color="#0d9488"
        />
        <KPICard
          label="Beneficiarios (Interior)"
          value={summary?.total_beneficiarios_interior?.toLocaleString() ?? "0"}
          icon={Users}
          loading={loadingSummary}
          color="#0284c7"
          description="Suma de la columna BENEF del padrón Interior (Excel Anexo II Comedores, hoja PADRON INTERIOR). Una fila por centro de entrega; cada una se guarda en RACIÓN con cantidad_beneficiarios. Este KPI filtra por período seleccionado."
        />
        {/* KPI Beneficiarios (Capital) deshabilitado: no hay datos en BD por el momento
        <KPICard
          label="Beneficiarios (Capital)"
          value={summary?.total_beneficiarios_capital?.toLocaleString() ?? "0"}
          icon={Users}
          loading={loadingSummary}
          color="#0369a1"
          description="Misma lógica que Interior pero para comedores con zona Capital."
        />
        */}
        <KPICard
          label="Gas (kg eq.)"
          value={summary?.recursos_globales?.gas_kg_equiv?.toLocaleString() ?? "0"}
          icon={Flame}
          loading={loadingSummary}
          color="#f59e0b"
        />
        <KPICard
          label="Limpieza (un.)"
          value={summary?.recursos_globales?.limpieza_total_articulos?.toLocaleString() ?? "0"}
          icon={Sparkles}
          loading={loadingSummary}
          color="#8b5cf6"
        />
        <KPICard
          label="Frescos (kg)"
          value={summary?.recursos_globales?.frescos_kg?.toLocaleString() ?? "0"}
          icon={Carrot}
          loading={loadingSummary}
          color="#059669"
        />
      </div>

      {/* Ración por tipo de servicio */}
      {summary?.racion?.por_tipo_servicio?.length ? (
        <div className="bg-white p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[40px] border border-slate-100 shadow-sm min-w-0">
          <h3 className="text-lg sm:text-xl font-black text-slate-800 mb-4 sm:mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
            <ClipboardList className="text-teal-600 shrink-0" />
            Ración por tipo de servicio
          </h3>
          <div className="flex flex-wrap gap-4 sm:gap-6">
            {summary.racion.por_tipo_servicio.map((t, i) => {
              const max = Math.max(...summary.racion!.por_tipo_servicio.map((x) => x.cantidad), 1);
              const pct = (t.cantidad / max) * 100;
              const label = t.tipo_servicio === "AMBOS" ? "Comida + Refrigerio" : t.tipo_servicio === "COMIDA" ? "Comida" : "Refrigerio";
              return (
                <div key={i} className="flex-1 min-w-[140px]">
                  <div className="flex justify-between items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-600">{label}</span>
                    <span className="text-sm font-black text-slate-800">{t.cantidad}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Desglose de recursos (gas, limpieza, frescos) */}
      {(summary?.recursos_globales?.gas_desglose || summary?.recursos_globales?.limpieza_desglose || summary?.recursos_globales?.frescos_desglose) && (
        <div className="bg-white p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[40px] border border-slate-100 shadow-sm min-w-0">
          <h3 className="text-lg sm:text-xl font-black text-slate-800 mb-4 sm:mb-6 border-b border-slate-100 pb-4">
            Desglose de recursos
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {summary.recursos_globales.gas_desglose && (
              <div className="space-y-2">
                <p className="text-xs font-black text-amber-700 uppercase tracking-wider">Gas (garrafas)</p>
                <ul className="text-sm space-y-1">
                  <li className="flex justify-between"><span>10 kg</span><span className="font-bold">{summary.recursos_globales.gas_desglose.garrafas_10.toLocaleString()}</span></li>
                  <li className="flex justify-between"><span>15 kg</span><span className="font-bold">{summary.recursos_globales.gas_desglose.garrafas_15.toLocaleString()}</span></li>
                  <li className="flex justify-between"><span>45 kg</span><span className="font-bold">{summary.recursos_globales.gas_desglose.garrafas_45.toLocaleString()}</span></li>
                </ul>
              </div>
            )}
            {summary.recursos_globales.limpieza_desglose && (
              <div className="space-y-2">
                <p className="text-xs font-black text-violet-700 uppercase tracking-wider">Limpieza (un.)</p>
                <ul className="text-sm space-y-1">
                  {Object.entries(summary.recursos_globales.limpieza_desglose).map(([k, v]) => {
                    if (v === 0) return null;
                    const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <li key={k} className="flex justify-between"><span className="truncate">{label}</span><span className="font-bold shrink-0 ml-2">{v.toLocaleString()}</span></li>
                    );
                  })}
                </ul>
              </div>
            )}
            {summary.recursos_globales.frescos_desglose && (
              <div className="space-y-2">
                <p className="text-xs font-black text-emerald-700 uppercase tracking-wider">Frescos</p>
                <ul className="text-sm space-y-1">
                  {Object.entries(summary.recursos_globales.frescos_desglose).map(([k, v]) => {
                    if (v === 0) return null;
                    const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    const unit = k === "frutas_unidades" ? " un." : " kg";
                    return (
                      <li key={k} className="flex justify-between"><span className="truncate">{label}</span><span className="font-bold shrink-0 ml-2">{v.toLocaleString()}{unit}</span></li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Capital vs Interior breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 min-w-0">
        <div className="bg-white p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[40px] border border-slate-100 shadow-sm min-w-0">
          <h3 className="text-lg sm:text-xl font-black text-slate-800 mb-4 sm:mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
            <BarChart3 className="text-green-600 shrink-0" />
            Comedores por zona (Capital)
          </h3>
          <div className="space-y-3">
            {summary?.comedores_por_zona_capital?.map((z, i) => {
              const max = Math.max(...(summary.comedores_por_zona_capital?.map((x) => x.cantidad) ?? [1]), 1);
              const pct = (z.cantidad / max) * 100;
              return (
                <div key={i} className="flex justify-between items-center gap-2 sm:gap-4 min-w-0">
                  <span className="text-xs sm:text-sm font-bold text-slate-600 w-28 sm:w-40 truncate">{z.zona}</span>
                  <div className="flex-1 min-w-0 h-5 sm:h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs sm:text-sm font-black text-slate-800 w-8 sm:w-12 text-right shrink-0">{z.cantidad}</span>
                </div>
              );
            })}
            {!summary?.comedores_por_zona_capital?.length && !loadingSummary && (
              <p className="text-slate-400 text-sm">Sin datos</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[40px] border border-slate-100 shadow-sm min-w-0">
          <h3 className="text-lg sm:text-xl font-black text-slate-800 mb-4 sm:mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
            <MapPin className="text-green-600 shrink-0" />
            Comedores por departamento/localidad (Interior, top 15)
          </h3>
          <div className="space-y-3 max-h-64 overflow-y-auto min-w-0">
            {summary?.comedores_por_interior?.map((d, i) => {
              const max = Math.max(...(summary.comedores_por_interior?.map((x) => x.cantidad) ?? [1]), 1);
              const pct = (d.cantidad / max) * 100;
              const label = [d.departamento, d.localidad].filter(Boolean).join(" / ") || "Sin nombre";
              return (
                <div key={i} className="flex justify-between items-center gap-2 sm:gap-4 min-w-0">
                  <span className="text-xs sm:text-sm font-bold text-slate-600 flex-1 min-w-0 truncate" title={label}>{label}</span>
                  <div className="w-16 sm:w-24 h-5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs sm:text-sm font-black text-slate-800 w-8 sm:w-10 text-right shrink-0">{d.cantidad}</span>
                </div>
              );
            })}
            {!summary?.comedores_por_interior?.length && !loadingSummary && (
              <p className="text-slate-400 text-sm">Sin datos</p>
            )}
          </div>
        </div>
      </div>

      {/* Rankings */}
      <div className="bg-white p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[40px] border border-slate-100 shadow-sm min-w-0">
        <h3 className="text-lg sm:text-xl font-black text-slate-800 mb-4 sm:mb-6 border-b border-slate-100 pb-4">Rankings (mayor a menor)</h3>
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
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs sm:text-sm min-w-[400px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 font-bold uppercase tracking-wider">
                <th className="pb-3 pr-2 sm:pr-4">#</th>
                <th className="pb-3 pr-2 sm:pr-4">Nombre</th>
                <th className="pb-3 pr-2 sm:pr-4">Zona / Ámbito</th>
                <th className="pb-3 pr-2 sm:pr-4 hidden sm:table-cell">Responsable</th>
                <th className="pb-3 pr-2 sm:pr-4 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {loadingRankings ? (
                <tr><td colSpan={5} className="py-8 text-center text-slate-400">Cargando...</td></tr>
              ) : (
                rankings.map((r, i) => (
                  <tr
                    key={r.comedor_id || i}
                    onClick={() => r.comedor_id && setDetailId(r.comedor_id)}
                    className={clsx(
                      "border-b border-slate-50 hover:bg-green-50/50 transition-colors",
                      r.comedor_id && "cursor-pointer"
                    )}
                  >
                    <td className="py-3 pr-2 sm:pr-4 font-mono text-slate-400">{i + 1}</td>
                    <td className="py-3 pr-2 sm:pr-4 font-bold text-slate-800 truncate max-w-[120px] sm:max-w-none">{r.nombre}</td>
                    <td className="py-3 pr-2 sm:pr-4 text-slate-600 truncate max-w-[80px] sm:max-w-none">{r.zona_nombre || r.ambito}</td>
                    <td className="py-3 pr-2 sm:pr-4 text-slate-600 hidden sm:table-cell truncate max-w-[100px]">{r.responsable_nombre || "—"}</td>
                    <td className="py-3 pr-2 sm:pr-4 text-right font-black text-slate-800 whitespace-nowrap">
                      {r.valor.toLocaleString()}{r.unidad ? ` ${r.unidad}` : ""}
                    </td>
                  </tr>
                ))
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
              <h3 className="text-lg sm:text-xl font-black text-slate-800">Detalle del comedor</h3>
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
                    <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Recursos (periodo)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div className="p-3 bg-violet-50 rounded-xl sm:col-span-2">
                        <span className="font-bold text-violet-800">Limpieza</span>
                        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-violet-900">
                          {Object.entries(detail.recursos.limpieza).filter(([, v]) => v > 0).map(([k, v]) => {
                            const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                            return <li key={k}>{label}: {v}</li>;
                          })}
                        </ul>
                        {Object.values(detail.recursos.limpieza).every((v) => v === 0) && (
                          <p className="mt-1 text-violet-700">0 un. total</p>
                        )}
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl">
                        <span className="font-bold text-emerald-800">Frescos</span>
                        {detail.recursos.frescos_desglose ? (
                          <ul className="mt-1 space-y-0.5 text-emerald-900">
                            {Object.entries(detail.recursos.frescos_desglose).filter(([, v]) => v > 0).map(([k, v]) => {
                              const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                              const unit = k === "frutas_unidades" ? " un." : " kg";
                              return <li key={k}>{label}: {v}{unit}</li>;
                            })}
                          </ul>
                        ) : (
                          <p className="mt-1 text-emerald-900">{detail.recursos.frescos_kg} kg total</p>
                        )}
                      </div>
                      <div className="p-3 bg-amber-50 rounded-xl">
                        <span className="font-bold text-amber-800">Gas</span>
                        <ul className="mt-1 space-y-0.5 text-amber-900">
                          <li>10 kg: {detail.recursos.gas.garrafas_10}</li>
                          <li>15 kg: {detail.recursos.gas.garrafas_15}</li>
                          <li>45 kg: {detail.recursos.gas.garrafas_45}</li>
                        </ul>
                      </div>
                      {detail.recursos.fumigacion && <div className="p-3 bg-slate-50 rounded-xl sm:col-span-2"><span className="font-bold text-slate-700">Fumigación:</span> Sí</div>}
                    </div>
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
