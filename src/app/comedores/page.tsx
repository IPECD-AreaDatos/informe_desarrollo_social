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
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  X,
  Phone,
  User,
  ClipboardList,
  Search,
  Beef,
  HandCoins,
  Info,
} from "lucide-react";
import { apiUrl } from "@/lib/apiBase";
import { ETIQUETA_EQUIVALENTE_MENSUAL_FRESCOS_CARNES } from "@/lib/presupuestoCantidadesSemanalMensual";
import { Header } from "@/components/Header";
import { KPICard } from "@/components/KPICard";
import { clsx } from "clsx";

/** Pestañas visibles del ranking por gastos (coinciden con `tipo` de la API). */
type GastosRankingTipo = "raciones_consolidado" | "otros_recursos" | "promedio_beneficiario";

/** Coincide con el tope del endpoint `/api/comedores/rankings` (máx. filas que se cargan del servidor). */
const RANKING_FETCH_LIMIT = 2000;

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
  comedores_por_tipo_capital?: { tipo: string; subtipo: string | null; cantidad: number }[];
  comedores_por_departamento_interior?: { departamento: string; cantidad: number }[];
}

interface RankingRow {
  comedor_id: string;
  nombre: string;
  zona_nombre: string | null;
  ambito: string;
  responsable_nombre: string | null;
  valor: number;
  beneficiarios?: number;
  unidad?: string;
  gasto_total_mensual?: number;
  monto_teknofood?: number;
  cantidad_raciones?: number;
}

/** Fila del ranking con campos derivados para la tabla. */
type RankingTablaRow = RankingRow & {
  benef: number;
  /** Monto total del rubro o consolidado (fila), según pestaña. */
  valorLinea: number;
  /** Gasto total mensual de la fila (en promedio viene de la API; en el resto coincide con valorLinea). */
  gastoTotalMensual: number;
  pctParticipacionRelativa: number | null;
  montoMensualPorBeneficiario: number | null;
  cantRaciones: number;
  montoParaOrden: number;
};

type SortKey = "nombre" | "monto_total" | "monto_por_beneficiario" | "beneficiarios";
type RankingAmbitoFilter = "TODOS" | "CAPITAL" | "INTERIOR";

function cmpNullableNumberRaw(a: number | null | undefined, b: number | null | undefined): number {
  const ok = (v: number | null | undefined) => v != null && Number.isFinite(Number(v));
  const aN = ok(a) ? Number(a) : null;
  const bN = ok(b) ? Number(b) : null;
  if (aN == null && bN == null) return 0;
  if (aN == null) return 1;
  if (bN == null) return -1;
  return aN - bN;
}

function RankingSortHeader({
  label,
  columnKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  columnKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = activeKey === columnKey;
  return (
    <button
      type="button"
      title={
        active
          ? dir === "desc"
            ? "Orden: mayor a menor. Clic para invertir."
            : "Orden: menor a mayor. Clic para invertir."
          : "Clic para ordenar (montos: mayor a menor por defecto; dependencia: A-Z por defecto)."
      }
      onClick={() => onSort(columnKey)}
      className={clsx(
        "inline-flex max-w-full items-center gap-1 rounded-md font-bold normal-case transition-colors hover:text-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600",
        active ? "text-green-700" : "text-slate-700"
      )}
    >
      <span className="leading-snug">{label}</span>
      <span className="inline-flex shrink-0 flex-col text-slate-500" aria-hidden>
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-4 w-4" strokeWidth={2.5} />
          ) : (
            <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-80" strokeWidth={2} />
        )}
      </span>
    </button>
  );
}

interface ComedorDetailData {
  comedor_id: string;
  nombre: string;
  domicilio: string | null;
  zona_nombre: string | null;
  ambito: string;
  departamento: string | null;
  localidad: string | null;
  tipo_nombre: string | null;
  subtipo_nombre: string | null;
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

const RANKING_TABS: { key: GastosRankingTipo; label: string }[] = [
  {
    key: "raciones_consolidado",
    label: "Raciones (refrigerio, carnes, comidas)",
  },
  { key: "otros_recursos", label: "Otros recursos" },
  { key: "promedio_beneficiario", label: "Promedio por beneficiario" },
];

const RANKING_TOOLTIP: Record<GastosRankingTipo, string> = {
  raciones_consolidado:
    "Monto total mensual = carnes + frutas/verduras (presupuesto en BD) + Teknofood (raciones × $1.600 × 30 días). Cantidad de raciones = raciones Teknofood del periodo. Monto mensual por ración = monto total ÷ cantidad de raciones.",
  otros_recursos:
    "Monto total = suma en BD de gas + limpieza + fumigación (rubro otros_recursos). Cantidad de beneficiarios = raciones Teknofood del periodo (comidas + refrigerios). Monto mensual por beneficiario = monto total ÷ cantidad de beneficiarios.",
  promedio_beneficiario:
    "Monto total = mismo cálculo que Raciones (carnes + frescos + Teknofood raciones × $1.600 × 30) + mismo total que Otros recursos (gas + limpieza + fumigación en BD). Monto mensual por beneficiario = monto total ÷ beneficiarios del periodo.",
};

const MESES_SLUG_A_NOMBRE: Record<string, string> = {
  enero: "Enero",
  febrero: "Febrero",
  marzo: "Marzo",
  abril: "Abril",
  mayo: "Mayo",
  junio: "Junio",
  julio: "Julio",
  agosto: "Agosto",
  septiembre: "Septiembre",
  octubre: "Octubre",
  noviembre: "Noviembre",
  diciembre: "Diciembre",
};

function formatPeriodoLabel(label: string) {
  if (label.trim().toLowerCase() === "plan verano 2026") {
    return "Plan Verano 2026 (enero y febrero)";
  }
  return label;
}

/** "Marzo 2026" o etiqueta especial; vacío → todos los periodos. */
function mesAnioParaTarjetas(periodoValor: string, lista: { valor: string; etiqueta: string }[]): string {
  const slug = String(periodoValor ?? "").trim();
  if (!slug) return "Todos los periodos";
  const m = slug.match(/^(.+)-(\d{4})$/i);
  if (m) {
    const key = m[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const mes = MESES_SLUG_A_NOMBRE[key] ?? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    return `${mes} ${m[2]}`;
  }
  const et = lista.find((p) => p.valor === slug)?.etiqueta;
  return formatPeriodoLabel((et || slug).trim());
}

function etiquetaKpiConPeriodo(tituloBase: string, periodoValor: string, lista: { valor: string; etiqueta: string }[]) {
  const suf = mesAnioParaTarjetas(periodoValor, lista);
  if (suf === "Todos los periodos") return `${tituloBase} (${suf})`;
  return `${tituloBase} ${suf}`;
}

/** Total del resumen usado como denominador de participación relativa (misma base que los KPI del periodo). */
function totalRankingDenominador(tipo: GastosRankingTipo, m: SummaryData["montos"] | undefined): number {
  if (!m) return 0;
  if (tipo === "raciones_consolidado") {
    return (m.monto_invertido_total ?? 0) + (m.refrigerio_comida_monto ?? 0) + (m.carnes_monto ?? 0);
  }
  if (tipo === "otros_recursos") return m.otros_recursos_monto ?? 0;
  return 0;
}

/** Suma de todos los rubros del resumen del periodo (participación en ranking «Promedio por beneficiario»). */
function totalGastoPresupuestoResumen(m: SummaryData["montos"] | undefined): number {
  if (!m) return 0;
  return (
    (m.monto_invertido_total ?? 0) +
    (m.becados_monto ?? 0) +
    (m.refrigerio_comida_monto ?? 0) +
    (m.carnes_monto ?? 0) +
    (m.otros_recursos_monto ?? 0)
  );
}

function limpiarDepartamentoEtiqueta(s: string) {
  return String(s ?? "")
    .replace(/^dto\.?\s*de\s+/i, "")
    .replace(/^departamento\s*de\s+/i, "")
    .trim();
}

/** Etiquetas de artículos de limpieza sin abreviaturas (coinciden con claves de BENEFICIO_LIMPIEZA / PRESUPUESTO_ITEM). */
const LIMPIEZA_ARTICULO_ETIQUETA: Record<string, string> = {
  lavandina_4lt: "Lavandina 4 litros",
  detergente_45lt: "Detergente 45 litros",
  desengrasante_5lt: "Desengrasante 5 litros",
  trapo_piso: "Trapos de piso",
  trapo_rejilla: "Trapos de rejilla",
  virulana: "Virulana",
  esponja: "Esponjas",
  escobillon: "Escobillones",
  escurridor: "Escurridores de platos",
};

const VERDURA_ITEM_ETIQUETA: Record<string, string> = {
  cebolla_kg: "Cebolla",
  zanahoria_kg: "Zanahoria",
  zapallo_kg: "Zapallo",
  papa_kg: "Papa",
  acelga_kg: "Acelga",
};

const AMBITO_ETIQUETA: Record<string, string> = {
  CAPITAL: "Capital",
  INTERIOR: "Interior",
};

function etiquetaAmbito(ambito: string | null | undefined): string {
  const k = String(ambito ?? "").toUpperCase();
  return AMBITO_ETIQUETA[k] ?? (ambito ? String(ambito) : "Sin ámbito");
}

function lineaDireccionCompleta(d: ComedorDetailData): string {
  const dom = (d.domicilio || "").trim();
  const dept = limpiarDepartamentoEtiqueta(d.departamento || "");
  const loc = (d.localidad || "").trim();
  const partes: string[] = [];
  if (dom) partes.push(dom);
  else partes.push("Sin domicilio registrado");
  if (dept) partes.push(`Departamento ${dept}`);
  if (loc) partes.push(loc);
  return partes.join(" - ");
}

function hayCantidadesFrescos(d: ComedorDetailData["recursos"]["frescos_desglose"] | undefined): boolean {
  if (!d) return false;
  const n = (k: string) => Number((d as Record<string, number>)[k] ?? 0);
  return (
    n("frutas_unidades") > 0 ||
    n("cebolla_kg") + n("zanahoria_kg") + n("zapallo_kg") + n("papa_kg") + n("acelga_kg") > 0 ||
    n("carne_vacuna_kg") + n("pollo_kg") + n("cerdo_kg") > 0
  );
}

/** Lista legible de tipos de programa con presupuesto o entregas en el periodo. */
function textoTiposPrograma(d: ComedorDetailData): string {
  const c = d.composicion_gasto;
  if (!c) return "No corresponde";
  const partes: string[] = [];
  if (c.raciones > 0) partes.push("Teknofood");
  if (c.becados > 0) partes.push("Becados");
  if (c.refrigerio_comida > 0 || hayCantidadesFrescos(d.recursos.frescos_desglose)) {
    partes.push("Productos frescos y refrigerio");
  }
  if (c.carnes > 0) partes.push("Carnes");
  if (c.otros_recursos > 0) partes.push("Otros recursos");
  if (!partes.length) return "No corresponde";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

function fraseLimpiezaDetalle(limpieza: Record<string, number>): string {
  const entries = Object.entries(limpieza).filter(([, v]) => Number(v) > 0);
  if (!entries.length) return "";
  return entries
    .map(([k, v]) => {
      const etiqueta = LIMPIEZA_ARTICULO_ETIQUETA[k] ?? k.replace(/_/g, " ");
      const unidad = v === 1 ? "unidad" : "unidades";
      return `${Number(v).toLocaleString("es-AR")} ${unidad} de ${etiqueta.toLowerCase()}`;
    })
    .join(", ");
}

function rubroPresupuestoEtiquetaLarga(rubro: string): string {
  switch (rubro) {
    case "monto_invertido":
      return "Raciones y monto invertido (Teknofood)";
    case "becados":
      return "Becados";
    case "refrigerio_comida":
      return "Refrigerio y comidas";
    case "carnes":
      return "Carnes";
    case "otros_recursos":
      return "Otros recursos";
    default:
      return rubro.replace(/_/g, " ");
  }
}

function subrubroPresupuestoEtiqueta(sub: string | null | undefined): string {
  const s = String(sub ?? "").trim();
  if (!s) return "—";
  const map: Record<string, string> = {
    teknofood: "Teknofood",
    limpieza: "Limpieza",
    gas: "Gas",
    fumigacion: "Fumigación",
    frutas_verduras: "Frutas y verduras",
    carne: "Carne",
  };
  return map[s] ?? s.replace(/_/g, " ");
}

type TerritorialBarDatum = {
  key: string;
  label: string;
  etiquetaEje: string;
  cantidad: number;
  pct: number;
};

function VerticalTerritorialBars({
  titulo,
  data,
  loading,
  barClassName,
}: {
  titulo: string;
  data: TerritorialBarDatum[];
  loading?: boolean;
  barClassName: string;
}) {
  const maxPct = Math.max(...data.map((d) => d.pct), 0.01);
  const BAR_MAX = 120;
  if (loading) {
    return (
      <div className="min-w-0 space-y-2">
        <h4 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-2">{titulo}</h4>
        <div className="h-[200px] rounded-xl bg-slate-100 animate-pulse" />
      </div>
    );
  }
  if (!data.length) {
    return (
      <div className="min-w-0 space-y-2">
        <h4 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-2">{titulo}</h4>
        <p className="text-slate-400 text-sm py-6">Sin datos</p>
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-2">
      <h4 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-2">{titulo}</h4>
      <div className="flex items-stretch gap-2 sm:gap-2.5 overflow-x-auto pb-1 pt-2 min-h-[200px] [scrollbar-width:thin]">
        {data.map((row) => {
          const hPx = Math.max(6, (row.pct / maxPct) * BAR_MAX);
          const pctTxt =
            row.pct < 0.95
              ? "<1%"
              : `${row.pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
          return (
            <div
              key={row.key}
              className="group flex shrink-0 flex-col items-center w-12 sm:w-14 md:w-16"
            >
              <div className="relative flex w-full min-h-[168px] flex-1 flex-col items-center">
                <span className="text-[10px] font-black text-slate-600 tabular-nums mb-1">{pctTxt}</span>
                <div className="mt-auto flex h-[120px] w-full flex-col justify-end items-center">
                  <div
                    title={`${row.label}: ${row.cantidad.toLocaleString("es-AR")} (${row.pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%)`}
                    className={clsx("w-[78%] rounded-t-md shadow-sm transition-transform group-hover:scale-[1.02]", barClassName)}
                    style={{ height: `${hPx}px` }}
                  />
                </div>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[min(240px,70vw)] -translate-x-1/2 rounded-lg bg-slate-800 px-2.5 py-2 text-left text-[10px] font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  <p className="font-bold">{row.label}</p>
                  <p className="mt-1 opacity-95">
                    {row.cantidad.toLocaleString("es-AR")} dependencias (
                    {row.pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%)
                  </p>
                </div>
              </div>
              <span
                className="mt-2 line-clamp-3 w-full break-words text-center text-[9px] font-bold leading-tight text-slate-600 sm:text-[10px]"
                title={row.label}
              >
                {row.etiquetaEje}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComedoresPageContent() {
  const [periodos, setPeriodos] = useState<{ valor: string; etiqueta: string }[]>([]);
  const [periodo, setPeriodo] = useState("");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [rankingTipo, setRankingTipo] = useState<GastosRankingTipo>("raciones_consolidado");
  const [rankingAmbito, setRankingAmbito] = useState<RankingAmbitoFilter>("TODOS");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("monto_total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ComedorDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rankingPage, setRankingPage] = useState(1);
  const [rankingPageSize, setRankingPageSize] = useState(50);

  useEffect(() => {
    fetch(apiUrl("/api/comedores/periodos"))
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
    fetch(apiUrl(`/api/comedores/summary?periodo=${encodeURIComponent(periodo)}`))
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
      apiUrl(
        `/api/comedores/rankings?periodo=${encodeURIComponent(periodo)}&tipo=${rankingTipo}&limit=${RANKING_FETCH_LIMIT}${ambitoParam}`
      )
    )
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setRankings(j.data ?? []);
      })
      .finally(() => setLoadingRankings(false));
  }, [periodo, rankingTipo, rankingAmbito]);

  useEffect(() => {
    setRankingPage(1);
  }, [periodo, rankingTipo, rankingAmbito, searchTerm]);

  const rankingRows = useMemo(() => {
    const usaDenominadorFilas =
      (rankingTipo === "raciones_consolidado" ||
        rankingTipo === "otros_recursos" ||
        rankingTipo === "promedio_beneficiario") &&
      rankings.length > 0;
    const totalRubro = usaDenominadorFilas
      ? rankings.reduce(
          (s, r) =>
            s +
            (rankingTipo === "promedio_beneficiario"
              ? Number(r.gasto_total_mensual ?? 0)
              : Number(r.valor ?? 0)),
          0
        )
      : totalRankingDenominador(rankingTipo, summary?.montos);
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const esProm = rankingTipo === "promedio_beneficiario";
    const esRaciones = rankingTipo === "raciones_consolidado";
    const esOtros = rankingTipo === "otros_recursos";
    const dividePorTekno = esRaciones || esOtros;

    const rows: RankingTablaRow[] = rankings
      .map((r) => {
        const benef = Number(r.beneficiarios ?? 0);
        const valorApi = Number(r.valor ?? 0);
        const gastoTotalMensual = esProm ? Number(r.gasto_total_mensual ?? 0) : valorApi;
        const valorLinea = valorApi;
        const totalGastoResumen = totalGastoPresupuestoResumen(summary?.montos);
        const pctParticipacionRelativa =
          totalRubro > 0
            ? (gastoTotalMensual / totalRubro) * 100
            : esProm && totalGastoResumen > 0
              ? (gastoTotalMensual / totalGastoResumen) * 100
              : null;
        const cantRaciones = Number(r.cantidad_raciones ?? 0);
        const montoMensualPorBeneficiario = dividePorTekno
          ? cantRaciones > 0
            ? gastoTotalMensual / cantRaciones
            : null
          : benef > 0
            ? gastoTotalMensual / benef
            : null;
        const montoParaOrden = esProm ? gastoTotalMensual : valorLinea;
        return {
          ...r,
          benef,
          valorLinea,
          gastoTotalMensual,
          pctParticipacionRelativa,
          montoMensualPorBeneficiario,
          cantRaciones,
          montoParaOrden,
        };
      })
      .filter((r) => {
        if (!normalizedSearch) return true;
        const bag = `${r.nombre} ${r.responsable_nombre || ""} ${r.zona_nombre || ""} ${r.ambito}`.toLowerCase();
        return bag.includes(normalizedSearch);
      })
      .filter((r) => {
        const montoPositivo = r.gastoTotalMensual > 0 || r.valorLinea > 0;
        const benefPositivo = r.benef > 0;
        const racionesPositivo = r.cantRaciones > 0;
        const pctPositivo = Number(r.pctParticipacionRelativa ?? 0) > 0;
        const promPositivo = Number(r.montoMensualPorBeneficiario ?? 0) > 0;
        const cantidadPositiva = dividePorTekno ? racionesPositivo : benefPositivo;
        return (
          montoPositivo ||
          (esProm && benefPositivo && (r.gastoTotalMensual > 0 || r.valorLinea > 0)) ||
          cantidadPositiva ||
          pctPositivo ||
          promPositivo
        );
      });

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "nombre") cmp = a.nombre.localeCompare(b.nombre, "es");
      if (sortKey === "monto_total") cmp = a.montoParaOrden - b.montoParaOrden;
      if (sortKey === "monto_por_beneficiario") {
        cmp = cmpNullableNumberRaw(a.montoMensualPorBeneficiario, b.montoMensualPorBeneficiario);
      }
      if (sortKey === "beneficiarios") {
        cmp = dividePorTekno ? a.cantRaciones - b.cantRaciones : a.benef - b.benef;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [rankings, rankingTipo, searchTerm, sortDir, sortKey, summary?.montos]);

  useEffect(() => {
    const paginas = Math.max(1, Math.ceil(rankingRows.length / rankingPageSize));
    setRankingPage((prev) => Math.min(prev, paginas));
  }, [rankingRows.length, rankingPageSize]);

  const rankingPaginasTotal = Math.max(1, Math.ceil(rankingRows.length / rankingPageSize));
  const rankingPageClamped = Math.min(Math.max(1, rankingPage), rankingPaginasTotal);
  const rankingRowsPagina = useMemo(() => {
    const start = (rankingPageClamped - 1) * rankingPageSize;
    return rankingRows.slice(start, start + rankingPageSize);
  }, [rankingRows, rankingPageClamped, rankingPageSize]);

  const sinPromedioDatos =
    rankingTipo === "promedio_beneficiario" &&
    !loadingRankings &&
    (!rankings.length ||
      rankings.every(
        (r) =>
          Number(r.beneficiarios ?? 0) <= 0 ||
          (Number(r.gasto_total_mensual ?? 0) <= 0 && Number(r.valor ?? 0) <= 0)
      ));

  const promedioExtremosTarjetas = useMemo(() => {
    if (rankingTipo !== "promedio_beneficiario" || !rankings.length) return null;
    const list: { nombre: string; prom: number }[] = [];
    for (const r of rankings) {
      const benef = Number(r.beneficiarios ?? 0);
      const gasto = Number(r.gasto_total_mensual ?? 0);
      if (benef <= 0 || gasto <= 0) continue;
      const prom = gasto / benef;
      if (prom > 0) list.push({ nombre: String(r.nombre || "Sin nombre").trim() || "Sin nombre", prom });
    }
    if (!list.length) return null;
    let min = list[0];
    let max = list[0];
    for (const x of list) {
      if (x.prom < min.prom) min = x;
      if (x.prom > max.prom) max = x;
    }
    return { min, max };
  }, [rankingTipo, rankings]);

  const rankingTablaColumnas = 6;
  const rankingTablaMinAncho = "min-w-[860px]";
  const presupuestoFvCantidades = useMemo(() => {
    const v = summary?.montos?.refrigerio_verduras_kg ?? 0;
    const f = summary?.montos?.refrigerio_frutas_unidades ?? 0;
    return `${v.toLocaleString("es-AR", { maximumFractionDigits: 0 })} kg verd.\n${f.toLocaleString("es-AR", { maximumFractionDigits: 0 })} u. de frutas`;
  }, [summary]);

  const mesAnioActual = useMemo(() => mesAnioParaTarjetas(periodo, periodos), [periodo, periodos]);

  const labelsKpiConPeriodo = useMemo(
    () => ({
      dependencias: etiquetaKpiConPeriodo("Total de dependencias", periodo, periodos),
      teknofood: etiquetaKpiConPeriodo("Costo de Teknofood", periodo, periodos),
      becados: etiquetaKpiConPeriodo("Becados", periodo, periodos),
      refrigerio: etiquetaKpiConPeriodo("Productos frescos", periodo, periodos),
      carnes: etiquetaKpiConPeriodo("Carnes", periodo, periodos),
      otros: etiquetaKpiConPeriodo("Otros recursos", periodo, periodos),
    }),
    [periodo, periodos]
  );

  const descripcionRefrigerioFv = useMemo(() => {
    if (mesAnioActual === "Todos los periodos") {
      return "Solo frutas (unidades) y verduras (kg). Monto y cantidades consolidadas (no incluye carnes).";
    }
    return `Solo frutas (unidades) y verduras (kg). Monto y cantidades del presupuesto ${mesAnioActual} (no incluye carnes).`;
  }, [mesAnioActual]);

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

  const dependenciasPorAmbitoNote = useMemo(() => {
    const rows = summary?.por_ambito;
    if (!rows?.length) return undefined;
    const cant = (amb: string) =>
      Number(rows.find((r) => String(r.ambito).toUpperCase() === amb)?.cantidad ?? 0);
    const cap = cant("CAPITAL");
    const int = cant("INTERIOR");
    return `Capital: ${cap.toLocaleString("es-AR")}\nInterior: ${int.toLocaleString("es-AR")}`;
  }, [summary?.por_ambito]);

  const capitalTotalDeps = useMemo(
    () =>
      Number(
        summary?.por_ambito?.find((r) => String(r.ambito).toUpperCase() === "CAPITAL")?.cantidad ?? 0
      ),
    [summary?.por_ambito]
  );
  const interiorTotalDeps = useMemo(
    () =>
      Number(
        summary?.por_ambito?.find((r) => String(r.ambito).toUpperCase() === "INTERIOR")?.cantidad ?? 0
      ),
    [summary?.por_ambito]
  );

  const capitalTipoBarras = useMemo((): TerritorialBarDatum[] => {
    const rows = summary?.comedores_por_tipo_capital;
    if (!rows?.length) return [];
    const total =
      capitalTotalDeps > 0 ? capitalTotalDeps : rows.reduce((a, r) => a + r.cantidad, 0) || 1;
    return rows.map((r, i) => {
      const label = r.subtipo ? `${r.tipo} — ${r.subtipo}` : r.tipo;
      const cantidad = r.cantidad;
      const pct = (cantidad / total) * 100;
      const etiquetaEje = label.length > 18 ? `${label.slice(0, 16)}…` : label;
      return { key: `cap-tipo-${i}-${label}`, label, etiquetaEje, cantidad, pct };
    });
  }, [summary?.comedores_por_tipo_capital, capitalTotalDeps]);

  const interiorDepartamentoBarras = useMemo((): TerritorialBarDatum[] => {
    const rows = summary?.comedores_por_departamento_interior;
    if (!rows?.length) return [];
    const total =
      interiorTotalDeps > 0
        ? interiorTotalDeps
        : rows.reduce((a, r) => a + r.cantidad, 0) || 1;
    return rows.map((r, i) => {
      const label = limpiarDepartamentoEtiqueta(r.departamento) || "Sin departamento";
      const cantidad = r.cantidad;
      const pct = (cantidad / total) * 100;
      const etiquetaEje = label.length > 18 ? `${label.slice(0, 16)}…` : label;
      return { key: `int-dpto-${i}-${label}`, label, etiquetaEje, cantidad, pct };
    });
  }, [summary?.comedores_por_departamento_interior, interiorTotalDeps]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "nombre" ? "asc" : "desc");
  };

  useEffect(() => {
    if (detailId == null) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(
      apiUrl(`/api/comedores/${encodeURIComponent(detailId)}?periodo=${encodeURIComponent(periodo)}`)
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
          label={labelsKpiConPeriodo.dependencias}
          value={summary?.total_comedores?.toLocaleString() ?? "0"}
          icon={UtensilsCrossed}
          loading={loadingSummary}
          color="#719C29"
          description={totalDependenciasTooltip}
          noteText={dependenciasPorAmbitoNote}
        />
        <KPICard
          label={labelsKpiConPeriodo.teknofood}
          value={`$${(summary?.montos?.monto_invertido_total ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          secondaryValue={(summary?.montos?.monto_invertido_cantidad ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          secondaryLabel="Cantidad de raciones"
          icon={HandCoins}
          loading={loadingSummary}
          color="#008275"
          description="Comprende a los recursos qué son adquiridos de TeknoFoot"
        />
        <KPICard
          label={labelsKpiConPeriodo.becados}
          value={`$${(5_361_571).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          secondaryValue={(summary?.montos?.becados_cantidad ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          secondaryLabel="Cantidad de personas"
          noteText="Montos correspondientes a becados del interior."
          icon={Users}
          loading={loadingSummary}
          color="#1F5D9B"
          description="Se divide en 3 categorías: cocinero, auxiliar y encargado."
        />
        <KPICard
          label={labelsKpiConPeriodo.refrigerio}
          value={`$${(summary?.montos?.refrigerio_comida_monto ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          secondaryValue={presupuestoFvCantidades}
          secondaryLabel="Cantidades"
          icon={ClipboardList}
          loading={loadingSummary}
          color="#F36F21"
          description={descripcionRefrigerioFv}
        />
        <KPICard
          label={labelsKpiConPeriodo.carnes}
          value={`$${(summary?.montos?.carnes_monto ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          secondaryValue={(summary?.montos?.carnes_cantidad ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          secondaryLabel="Cantidad (kg)"
          icon={Beef}
          loading={loadingSummary}
          color="#EA2F09"
          description="Presupuesto carnes: vacuna, pollo y cerdo (kg)."
        />
        <KPICard
          label={labelsKpiConPeriodo.otros}
          value={`$${(summary?.montos?.otros_recursos_monto ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
          icon={Sparkles}
          loading={loadingSummary}
          color="#6B5CB7"
          description="Monto: limpieza + gas + fumigación. Frecuencia: limpieza cada 2 meses (bimestral) y fumigación cada 3 meses (trimestral)."
        />
      </div>

      <div className="min-w-0 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:rounded-[40px] sm:p-8 lg:p-10">
        <h3 className="mb-6 flex items-center gap-2 border-b border-slate-100 pb-4 text-lg font-black tracking-tight text-slate-800 sm:text-xl">
          <MapPin className="h-5 w-5 shrink-0 text-green-600 sm:h-6 sm:w-6" />
          Resumen territorial y tipo de dependencia.
        </h3>
        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
          <div className="min-w-0 space-y-5 lg:border-r lg:border-slate-100 lg:pr-8">
            <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm sm:p-8">
              <p className="text-3xl font-black tracking-tight text-slate-800 sm:text-4xl">
                Capital: {loadingSummary ? "—" : capitalTotalDeps.toLocaleString("es-AR")}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Cantidad de zonas:{" "}
                {(summary?.comedores_por_zona_capital?.length ?? 0).toLocaleString("es-AR")}
              </p>
            </div>
            <VerticalTerritorialBars
              titulo="Tipo de dependencia"
              data={capitalTipoBarras}
              loading={loadingSummary}
              barClassName="bg-emerald-600"
            />
          </div>
          <div className="min-w-0 space-y-5">
            <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm sm:p-8">
              <p className="text-3xl font-black tracking-tight text-slate-800 sm:text-4xl">
                Interior: {loadingSummary ? "—" : interiorTotalDeps.toLocaleString("es-AR")}
              </p>
            </div>
            <VerticalTerritorialBars
              titulo="Dependencia por departamento"
              data={interiorDepartamentoBarras}
              loading={loadingSummary}
              barClassName="bg-blue-600"
            />
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
        {rankingTipo === "promedio_beneficiario" && promedioExtremosTarjetas && !loadingRankings && !sinPromedioDatos && (
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 via-white to-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-black uppercase tracking-wider text-emerald-800">Menor costo por beneficiario</p>
              <p className="mt-3 text-base font-bold leading-snug text-slate-700">
                Dependencia:{" "}
                <span className="font-black text-slate-900">{promedioExtremosTarjetas.min.nombre}</span>
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                Monto por beneficiario:{" "}
                <span className="font-black text-emerald-800">
                  ${promedioExtremosTarjetas.min.prom.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                </span>
              </p>
            </div>
            <div className="rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50/90 via-white to-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-black uppercase tracking-wider text-rose-800">Mayor costo por beneficiario</p>
              <p className="mt-3 text-base font-bold leading-snug text-slate-700">
                Dependencia:{" "}
                <span className="font-black text-slate-900">{promedioExtremosTarjetas.max.nombre}</span>
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                Monto por beneficiario:{" "}
                <span className="font-black text-rose-800">
                  ${promedioExtremosTarjetas.max.prom.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                </span>
              </p>
            </div>
          </div>
        )}
        <div className="overflow-x-auto -mx-1">
          <table className={clsx("w-full text-left text-xs sm:text-sm", rankingTablaMinAncho)}>
            <thead>
              <tr className="border-b border-slate-200 text-slate-700">
                <th className="pb-3 pr-3 align-bottom font-bold normal-case">
                  <RankingSortHeader
                    label="Dependencia"
                    columnKey="nombre"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={onSort}
                  />
                </th>
                <th className="pb-3 pr-3 align-bottom font-bold normal-case">Zona / ámbito</th>
                <th className="pb-3 pr-3 align-bottom text-right font-bold normal-case">
                  <div className="inline-flex items-start justify-end gap-1.5">
                    <RankingSortHeader
                      label={
                        rankingTipo === "otros_recursos"
                          ? "Monto total (gas, fumigación y limpieza)"
                          : rankingTipo === "promedio_beneficiario"
                            ? "Monto total (raciones + otros recursos)"
                            : "Monto total mensual"
                      }
                      columnKey="monto_total"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                    />
                    <span className="relative group shrink-0 pt-0.5">
                      <Info className="h-3.5 w-3.5 shrink-0 cursor-help text-slate-400" />
                      <span className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-72 max-w-[85vw] rounded-lg bg-slate-800 p-2.5 text-left text-[11px] font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        {RANKING_TOOLTIP[rankingTipo]}
                      </span>
                    </span>
                  </div>
                </th>
                <th className="pb-3 pr-3 text-right align-bottom font-bold normal-case">Participación relativa</th>
                <th className="pb-3 pr-3 text-right align-bottom font-bold normal-case">
                  <div className="flex justify-end">
                    <RankingSortHeader
                      label={
                        rankingTipo === "raciones_consolidado"
                          ? "Monto mensual por ración"
                          : "Monto mensual por beneficiario"
                      }
                      columnKey="monto_por_beneficiario"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                    />
                  </div>
                </th>
                <th className="pb-3 pr-3 text-right align-bottom font-bold normal-case">
                  <div className="flex justify-end">
                    <RankingSortHeader
                      label={
                        rankingTipo === "raciones_consolidado"
                          ? "Cantidad de raciones"
                          : "Cantidad de beneficiarios"
                      }
                      columnKey="beneficiarios"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingRankings ? (
                <tr>
                  <td
                    colSpan={rankingTablaColumnas}
                    className="py-8 text-center text-slate-400"
                  >
                    Cargando...
                  </td>
                </tr>
              ) : sinPromedioDatos ? (
                <tr>
                  <td
                    colSpan={rankingTablaColumnas}
                    className="py-8 text-center text-sm font-medium text-slate-500"
                  >
                    Sin datos de presupuesto o beneficiarios para calcular el promedio por beneficiario.
                  </td>
                </tr>
              ) : !rankingRows.length ? (
                <tr>
                  <td
                    colSpan={rankingTablaColumnas}
                    className="py-8 text-center text-sm font-medium text-slate-500"
                  >
                    Sin datos con monto o beneficiarios para mostrar.
                  </td>
                </tr>
              ) : (
                rankingRowsPagina.map((r, i) => {
                  const puedeDetalle = Boolean(r.comedor_id?.trim());
                  const zonaAmbito = [r.zona_nombre, r.ambito].filter(Boolean).join(" · ") || "—";
                  const decMonto = rankingTipo === "promedio_beneficiario" ? 2 : 0;
                  const decProm =
                    rankingTipo === "promedio_beneficiario"
                      ? 2
                      : rankingTipo === "raciones_consolidado"
                        ? 0
                        : 0;
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
                        puedeDetalle ? "cursor-pointer hover:bg-green-50/50" : "cursor-default opacity-90"
                      )}
                    >
                      <td className="max-w-[220px] py-3 pr-3 font-bold break-words text-slate-800 sm:max-w-[280px]">
                        {r.nombre}
                      </td>
                      <td className="max-w-[200px] py-3 pr-3 break-words text-slate-600 sm:max-w-[240px]">{zonaAmbito}</td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right font-black text-slate-800">
                        $
                        {r.gastoTotalMensual.toLocaleString("es-AR", {
                          maximumFractionDigits: decMonto,
                        })}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right text-slate-600">
                        {r.pctParticipacionRelativa != null
                          ? `${r.pctParticipacionRelativa.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right text-slate-600">
                        {r.montoMensualPorBeneficiario != null
                          ? `$${r.montoMensualPorBeneficiario.toLocaleString("es-AR", { maximumFractionDigits: decProm })}`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right font-semibold text-slate-800">
                        {rankingTipo === "raciones_consolidado" || rankingTipo === "otros_recursos"
                          ? r.cantRaciones.toLocaleString("es-AR")
                          : r.benef.toLocaleString("es-AR")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loadingRankings && rankingRows.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-slate-700">
                {(rankingPageClamped - 1) * rankingPageSize + 1} —{" "}
                {Math.min(rankingPageClamped * rankingPageSize, rankingRows.length)} de{" "}
                {rankingRows.length.toLocaleString("es-AR")} en la tabla
              </span>
              {rankings.length >= RANKING_FETCH_LIMIT && (
                <span className="text-xs font-medium text-amber-800">
                  Se cargaron como máximo {RANKING_FETCH_LIMIT} filas del servidor.
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                Filas por página
                <select
                  value={rankingPageSize}
                  onChange={(e) => {
                    setRankingPageSize(Number(e.target.value));
                    setRankingPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold text-slate-700"
                >
                  {[25, 50, 100, 200].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Página anterior"
                  disabled={rankingPageClamped <= 1}
                  onClick={() =>
                    setRankingPage((p) => {
                      const maxP = Math.max(1, Math.ceil(rankingRows.length / rankingPageSize));
                      const cur = Math.min(Math.max(1, p), maxP);
                      return Math.max(1, cur - 1);
                    })
                  }
                  className={clsx(
                    "inline-flex h-10 w-10 items-center justify-center rounded-lg border text-slate-700 transition-colors",
                    rankingPageClamped <= 1
                      ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                      : "border-slate-200 bg-white hover:bg-slate-50 hover:border-green-400"
                  )}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="min-w-[5.5rem] text-center text-xs font-black text-slate-800">
                  {rankingPageClamped} / {rankingPaginasTotal}
                </span>
                <button
                  type="button"
                  aria-label="Página siguiente"
                  disabled={rankingPageClamped >= rankingPaginasTotal}
                  onClick={() =>
                    setRankingPage((p) => {
                      const maxP = Math.max(1, Math.ceil(rankingRows.length / rankingPageSize));
                      const cur = Math.min(Math.max(1, p), maxP);
                      return Math.min(maxP, cur + 1);
                    })
                  }
                  className={clsx(
                    "inline-flex h-10 w-10 items-center justify-center rounded-lg border text-slate-700 transition-colors",
                    rankingPageClamped >= rankingPaginasTotal
                      ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                      : "border-slate-200 bg-white hover:bg-slate-50 hover:border-green-400"
                  )}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailId != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50"
          onClick={() => setDetailId(null)}
        >
          <div
            className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-start gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-bold tracking-wide text-slate-500">
                  * TODOS LOS DATOS SON MENSUALES (SEGÚN EL PERIODO SELECCIONADO) *
                </p>
                <h3 className="text-lg sm:text-xl font-black text-slate-800 leading-tight">
                  Detalle de la dependencia — {mesAnioActual}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className="p-2 rounded-xl hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0 sm:min-h-0 sm:min-w-0"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6">
              {loadingDetail ? (
                <div className="h-40 animate-pulse bg-slate-100 rounded-2xl" />
              ) : detail ? (
                <>
                  <div className="min-w-0 space-y-4">
                    <h4 className="text-xl sm:text-2xl font-black text-slate-900 break-words leading-snug">{detail.nombre}</h4>
                    <dl className="space-y-3 text-sm text-slate-800">
                      <div>
                        <dt className="font-bold text-slate-600">Dirección</dt>
                        <dd className="mt-0.5 break-words leading-relaxed">{lineaDireccionCompleta(detail)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold text-slate-600">Zona / ámbito</dt>
                        <dd className="mt-0.5 break-words">
                          {(detail.zona_nombre || "Sin zona").trim()} — {etiquetaAmbito(detail.ambito)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold text-slate-600">Organismo</dt>
                        <dd className="mt-0.5 break-words">{detail.organismo_nombre?.trim() || "No corresponde"}</dd>
                      </div>
                      <div>
                        <dt className="font-bold text-slate-600">Tipo de dependencia</dt>
                        <dd className="mt-0.5 break-words">
                          {(() => {
                            const t = detail.tipo_nombre?.trim();
                            const s = detail.subtipo_nombre?.trim();
                            if (t && s) return `${t} (${s})`;
                            if (t) return t;
                            if (s) return s;
                            return "No corresponde";
                          })()}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold text-slate-600">Cantidad de beneficiarios</dt>
                        <dd className="mt-0.5 font-semibold">
                          {detail.beneficiarios != null && detail.beneficiarios > 0
                            ? detail.beneficiarios.toLocaleString("es-AR")
                            : "No corresponde"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold text-slate-600">Tipo de programa</dt>
                        <dd className="mt-0.5 leading-relaxed">{textoTiposPrograma(detail)}</dd>
                      </div>
                    </dl>
                  </div>
                  {(detail.link_google_maps || (detail.coordenadas_lat != null && detail.coordenadas_lng != null)) && (
                    <div className="space-y-2">
                      <p className="text-xs font-black text-slate-600 tracking-wide flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 shrink-0" /> Ubicación en mapa
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
                  {(detail.responsable_nombre || detail.telefono) && (
                    <div className="flex flex-col gap-2 text-sm border-t border-slate-100 pt-4">
                      <p className="text-xs font-bold text-slate-600">Contacto</p>
                      {detail.responsable_nombre && (
                        <p className="flex items-center gap-2 text-slate-700"><User className="w-4 h-4 shrink-0" /> <span className="break-all">{detail.responsable_nombre}</span></p>
                      )}
                      {detail.telefono && (
                        <p className="flex items-center gap-2 text-slate-700"><Phone className="w-4 h-4 shrink-0" /> <span className="break-all">{detail.telefono}</span></p>
                      )}
                    </div>
                  )}
                  <div className="pt-4 border-t border-slate-100 space-y-3">
                    <p className="text-sm font-black text-slate-800">Presupuesto y entregas del periodo</p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Montos y cantidades según la carga de presupuesto para esta dependencia. Si un ítem no tiene monto ni
                      cantidad en el periodo, no se lista en la tabla. En refrigerio y carnes, las cantidades (kg o
                      unidades) se muestran en equivalente mensual (origen semanal × 4 semanas), en línea con los montos
                      mensuales.
                    </p>
                    {(() => {
                      const filasPresupuesto = (detail.presupuesto_desglose ?? []).filter(
                        (row) => row.monto > 0 || row.cantidad > 0
                      );
                      return filasPresupuesto.length > 0 ? (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 overflow-x-auto">
                          <p className="text-xs font-bold text-slate-700 mb-2">Desglose presupuestario por rubro (esta dependencia)</p>
                          <table className="w-full text-xs text-left min-w-[340px]">
                            <thead>
                              <tr className="text-slate-600 border-b border-slate-200">
                                <th className="pb-2 pr-2 font-bold align-bottom">Programa</th>
                                <th className="pb-2 pr-2 font-bold align-bottom">Detalle</th>
                                <th
                                  className="pb-2 pr-2 font-bold text-right align-bottom"
                                  title="Costo total de cada rubro o subrubro presupuestado para esta dependencia en el periodo seleccionado."
                                >
                                  <span className="inline-flex items-center justify-end gap-1">
                                    Monto
                                    <Info className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
                                  </span>
                                </th>
                                <th
                                  className="pb-2 font-bold text-right align-bottom"
                                  title="Cantidades de refrigerio/carnes en equivalente mensual (origen semanal × 4 semanas)."
                                >
                                  Cantidad
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {filasPresupuesto.map((row, idx) => {
                                const rubroLabel = rubroPresupuestoEtiquetaLarga(row.rubro);
                                const sub = subrubroPresupuestoEtiqueta(row.subrubro);
                                const montoStr =
                                  row.monto > 0
                                    ? `$${row.monto.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
                                    : "No corresponde";
                                const cantStr =
                                  row.cantidad > 0
                                    ? `${row.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 0 })}${row.unidad ? ` ${row.unidad}` : ""}`
                                    : row.monto > 0
                                      ? "No corresponde"
                                      : "No corresponde";
                                return (
                                  <tr key={`${row.rubro}-${row.subrubro}-${idx}`} className="border-b border-slate-100/80">
                                    <td className="py-2 pr-2 font-semibold text-slate-800">{rubroLabel}</td>
                                    <td className="py-2 pr-2 text-slate-700">{sub}</td>
                                    <td
                                      className="py-2 pr-2 text-right text-slate-900"
                                      title={`${rubroLabel}${sub !== "—" ? ` — ${sub}` : ""}: costo en pesos argentinos para ${mesAnioActual}.`}
                                    >
                                      {montoStr}
                                    </td>
                                    <td className="py-2 text-right text-slate-700">{cantStr}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-600">No hay líneas de presupuesto con monto o cantidad en el periodo.</p>
                      );
                    })()}
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="p-4 bg-violet-50 rounded-xl border border-violet-100">
                        <p className="font-bold text-violet-900">Limpieza (entrega bimestral)</p>
                        {(() => {
                          const frase = fraseLimpiezaDetalle(detail.recursos.limpieza);
                          return frase ? (
                            <p className="mt-2 text-violet-950 leading-relaxed">{frase}.</p>
                          ) : (
                            <p className="mt-2 text-violet-800">No corresponde.</p>
                          );
                        })()}
                      </div>
                      <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                        <p className="font-bold text-emerald-900">Frutas, verduras y carnes</p>
                        <p className="text-[11px] font-semibold text-emerald-800/90 mt-1 leading-snug">
                          {ETIQUETA_EQUIVALENTE_MENSUAL_FRESCOS_CARNES}
                        </p>
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
                            <div className="mt-2 space-y-3 text-emerald-950 leading-relaxed">
                              {kgVer > 0 && (
                                <p>
                                  <span className="font-semibold">Verduras (kilogramos en total):</span>{" "}
                                  {kgVer.toLocaleString("es-AR", { maximumFractionDigits: 0 })} kilogramos.
                                </p>
                              )}
                              {frut > 0 && (
                                <p>
                                  <span className="font-semibold">Frutas (unidades):</span>{" "}
                                  {frut.toLocaleString("es-AR", { maximumFractionDigits: 0 })} unidades.
                                </p>
                              )}
                              {kgCar > 0 && (
                                <p>
                                  <span className="font-semibold">Carnes (kilogramos en total):</span>{" "}
                                  {kgCar.toLocaleString("es-AR", { maximumFractionDigits: 0 })} kilogramos.
                                </p>
                              )}
                              {!tieneAny && (
                                <p className="text-emerald-800">No corresponde.</p>
                              )}
                              {d && verdurasRows.length > 0 && (
                                <div>
                                  <p className="text-xs font-bold text-emerald-900">Detalle de verduras (kilogramos)</p>
                                  <ul className="mt-1 list-disc pl-5 space-y-0.5">
                                    {verdurasRows.map(({ k, v }) => (
                                      <li key={k}>
                                        {VERDURA_ITEM_ETIQUETA[k] ?? k}:{" "}
                                        {Number(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })} kilogramos
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {d && carnesRows.length > 0 && (
                                <div>
                                  <p className="text-xs font-bold text-emerald-900">Detalle de carnes (kilogramos)</p>
                                  <ul className="mt-1 list-disc pl-5 space-y-0.5">
                                    {carnesRows.map(({ k, v }) => {
                                      const label =
                                        k === "carne_vacuna_kg" ? "Carne vacuna" : k === "pollo_kg" ? "Pollo" : "Cerdo";
                                      return (
                                        <li key={k}>
                                          {label}: {Number(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })} kilogramos
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              )}
                              {!d && detail.recursos.frescos_kg > 0 && (
                                <p>
                                  Total consolidado:{" "}
                                  {detail.recursos.frescos_kg.toLocaleString("es-AR", { maximumFractionDigits: 0 })}{" "}
                                  kilogramos (sin desglose por ítem).
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                        <p className="font-bold text-amber-900">Gas</p>
                        {(() => {
                          const g10 = detail.recursos.gas.garrafas_10;
                          const g15 = detail.recursos.gas.garrafas_15;
                          const g45 = detail.recursos.gas.garrafas_45;
                          const total = g10 + g15 + g45;
                          if (total <= 0) {
                            return <p className="mt-2 text-amber-950">No corresponde.</p>;
                          }
                          return (
                            <div className="mt-2 space-y-2 text-amber-950">
                              <p>
                                <span className="font-semibold">Cantidad total de garrafas:</span>{" "}
                                {total.toLocaleString("es-AR")}
                              </p>
                              <ul className="list-disc pl-5 space-y-0.5">
                                {g10 > 0 && (
                                  <li>
                                    Garrafas de 10 kilogramos: {g10.toLocaleString("es-AR")}
                                  </li>
                                )}
                                {g15 > 0 && (
                                  <li>
                                    Garrafas de 15 kilogramos: {g15.toLocaleString("es-AR")}
                                  </li>
                                )}
                                {g45 > 0 && (
                                  <li>
                                    Garrafas de 45 kilogramos: {g45.toLocaleString("es-AR")}
                                  </li>
                                )}
                              </ul>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="font-bold text-slate-800">Fumigación (servicio trimestral)</p>
                        <p className="mt-2 text-slate-800">
                          {detail.recursos.fumigacion ? "Registra servicio o presupuesto en el periodo." : "No corresponde."}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-100 space-y-3">
                    <p className="text-sm font-black text-slate-800">Composición del gasto mensual</p>
                    {(() => {
                      const comp = detail.composicion_gasto || {
                        raciones: 0,
                        becados: 0,
                        refrigerio_comida: 0,
                        carnes: 0,
                        otros_recursos: 0,
                      };
                      const comedorTot =
                        comp.gasto_total_comedor ??
                        comp.raciones + comp.becados + comp.refrigerio_comida + comp.carnes + comp.otros_recursos;
                      const fmtArs = (n: number) =>
                        `$${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                      const pctPresupuestoPropio = (n: number) => (comedorTot > 0 ? (n / comedorTot) * 100 : 0);
                      const items = [
                        {
                          key: "raciones",
                          label: "Raciones y monto invertido (Teknofood)",
                          tooltip: `Costo total de raciones y Teknofood presupuestado para esta dependencia en ${mesAnioActual}.`,
                          value: comp.raciones,
                        },
                        {
                          key: "becados",
                          label: "Becados",
                          tooltip: `Costo total de becados presupuestado para esta dependencia en ${mesAnioActual}.`,
                          value: comp.becados,
                        },
                        {
                          key: "refrigerio_comida",
                          label: "Refrigerio y comidas (frutas y verduras)",
                          tooltip: `Costo total de refrigerio y comidas presupuestado para esta dependencia en ${mesAnioActual}.`,
                          value: comp.refrigerio_comida,
                        },
                        {
                          key: "carnes",
                          label: "Carnes",
                          tooltip: `Costo total de carnes presupuestado para esta dependencia en ${mesAnioActual}.`,
                          value: comp.carnes,
                        },
                        {
                          key: "otros_recursos",
                          label: "Otros recursos (gas, limpieza, fumigación y similares)",
                          tooltip: `Costo total de otros recursos presupuestado para esta dependencia en ${mesAnioActual}.`,
                          value: comp.otros_recursos,
                        },
                      ];
                      return (
                        <>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Cada rubro muestra el monto mensual de <strong>esta dependencia</strong> y, si hay presupuesto cargado, su participación dentro del total de la dependencia. Pase el cursor sobre el nombre del rubro para ver la descripción del costo.
                            {comedorTot > 0 && (
                              <>
                                {" "}
                                Total presupuestario de la dependencia en el periodo: <strong>{fmtArs(comedorTot)}</strong>.
                              </>
                            )}
                            {comedorTot <= 0 && (
                              <span className="text-amber-800"> No corresponde: sin presupuesto cargado para esta dependencia en el periodo.</span>
                            )}
                          </p>
                          <div className="space-y-4 text-sm">
                            {items.map((item) => {
                              const pg = pctPresupuestoPropio(item.value);
                              const tiene = item.value > 0;
                              return (
                                <div key={item.key}>
                                  <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 mb-1">
                                    <span
                                      className="font-semibold text-slate-700 cursor-help border-b border-dotted border-slate-300"
                                      title={item.tooltip}
                                    >
                                      {item.label}
                                    </span>
                                    <span className="font-black text-slate-900 text-right">
                                      {tiene ? (
                                        <>
                                          {fmtArs(item.value)}
                                          {comedorTot > 0 && (
                                            <span className="text-slate-500 font-semibold ml-1">
                                              ({pg.toLocaleString("es-AR", { maximumFractionDigits: 1 })}% del total de la dependencia)
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <span className="text-slate-500 font-semibold">No corresponde</span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                      className="h-full bg-green-500 rounded-full transition-all"
                                      style={{ width: tiene ? `${Math.min(100, pg)}%` : "0%" }}
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
