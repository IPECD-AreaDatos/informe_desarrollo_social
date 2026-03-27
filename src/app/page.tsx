"use client";

import { useEffect, useState, Suspense } from "react";
import {
  Users,
  Coins,
  Package,
  Ticket,
  ChevronRight,
  ArrowUpRight,
  Building2,
  Calendar,
  Activity,
  MapPin,
  ArrowRight,
  AlertCircle,
  PieChart,
  BarChart3,
  TrendingUp,
  Search,
  HeartPulse,
  BookOpen,
  FileCheck,
  ArrowRightLeft,
  ChevronDown,
  HelpCircle
} from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import { Header } from "@/components/Header";
import { KPICard } from "@/components/KPICard";
import { CategoryCard } from "@/components/CategoryCard";
import { useSearchParams } from "next/navigation";
import { DemographicStackedChart } from "@/components/DemographicStackedChart";

function SummaryDashboardContent() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const isAnnual = from && to && from.substring(0, 4) === to.substring(0, 4) && from.endsWith("-01-01") && to.endsWith("-12-31");
  const [logisticsTab, setLogisticsTab] = useState<"destinos" | "salidas" | "recorridos">("destinos");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/stats/ministerio?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Error fetching data");
      const d = await res.json();
      setData(d.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchParams]);

  const ministerioKpis = [
    {
      label: "Expedientes Gestionados",
      value: data?.total_expedientes?.toLocaleString() || "0",
      icon: BookOpen,
      description: "Volumen total de registros administrativos y carátulas generadas en el periodo.",
      color: "#526928"
    },
    {
      label: "Atención con Expediente",
      value: data?.personas_con_expediente?.toLocaleString() || "0",
      icon: Users,
      description: "Cantidad de ciudadanos únicos que cuentan con respaldo de expediente administrativo.",
      color: "#0284c7"
    },
    {
      label: "Atención sin Expediente",
      value: data?.personas_sin_expediente?.toLocaleString() || "0",
      icon: Users,
      description: "Ciudadanos asistidos mediante atención directa o emergencias territoriales (CDC).",
      color: "#f59e0b"
    },
    {
      label: "Inversión Ejecutada",
      value: `$${Number(data?.inversion_total || 0).toLocaleString()}`,
      icon: Coins,
      description: "Monto total de subsidios y ayudas financieras liquidadas en el periodo.",
      color: "#8b5cf6"
    },
  ];

  // For reference in tooltips/context
  const totalAtendidos = data?.personas_atendidas_total?.toLocaleString() || "0";






  if (error) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto space-y-10">
        <div className="bg-red-50 p-6 rounded-2xl border border-red-100 flex items-center gap-4 text-red-600">
          <AlertCircle size={24} />
          <p className="font-bold">Error al cargar datos: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-10 bg-[#F8FAFC]">
      <Header />

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 hover:cursor-default">
          {ministerioKpis.map((kpi, i) => (
            <KPICard
              key={i}
              label={kpi.label}
              value={kpi.value}
              icon={kpi.icon}
              description={kpi.description}
              color={kpi.color}
              loading={loading}
            />
          ))}
        </div>

      </div>



      {isAnnual && (
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-12 group transition-all hover:shadow-xl">
          <div className="flex justify-between items-end border-b border-slate-50 pb-8">
            <div className="space-y-2">
              <h3 className="text-3xl font-black tracking-tight text-slate-800 flex items-center gap-4">
                <div className="w-12 h-12 bg-[#CADFAB] rounded-2xl flex items-center justify-center text-[#526928]">
                  <BarChart3 size={28} />
                </div>
                Evolución de Inversión Anual
              </h3>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest pl-16">Histórico de inversión asociados a expedientes.</p>
            </div>
          </div>

          <div className="relative h-[400px] mt-10">
             {/* Chart implementation simplified for brevity but functional */}
             <div className="flex items-end justify-around gap-4 h-full pt-10 px-4">
                {data?.gasto_mensual?.map((item: any, i: number) => {
                  const maxVal = Math.max(...data.gasto_mensual.map((g: any) => g.amount), 1);
                  const height = (item.amount / maxVal) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group/item relative">
                       <div className="opacity-0 group-hover/item:opacity-100 absolute -top-10 bg-slate-800 text-white px-2 py-1 rounded text-[10px]">
                        ${item.amount.toLocaleString()}
                       </div>
                       <div 
                         className="w-full max-w-[40px] bg-gradient-to-t from-[#526928] to-[#96C156] rounded-t-xl transition-all"
                         style={{ height: `${height}%` }}
                       />
                       <span className="text-[10px] font-bold text-slate-500">{item.month}</span>
                    </div>
                  );
                })}
             </div>
          </div>
        </div>
      )}

      <div className="grid gap-8 grid-cols-1 lg:grid-cols-2">
        <div className="relative group/log">
          <div className="absolute right-8 top-10 z-20 flex bg-slate-50 p-1 rounded-xl border border-slate-100 shadow-inner">
            {(["destinos", "salidas", "recorridos"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLogisticsTab(tab)}
                className={clsx(
                  "px-3 py-1.5 text-[9px] font-black uppercase tracking-tighter rounded-lg transition-all",
                  logisticsTab === tab
                    ? "bg-white text-slate-800 shadow-sm border border-slate-100"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <CategoryCard
            title="Logística de Pasajes"
            subtitle={`${logisticsTab === 'recorridos' ? 'Mapas de calor de' : 'Principales'} ${logisticsTab}`}
            icon={TrendingUp}
            items={data?.logistica?.[logisticsTab] || []}
            description={`Resumen de pasajes emitidos agrupados por ${logisticsTab}.`}
            loading={loading}
          />
        </div>

        <CategoryCard
          title="Recursos"
          subtitle="Ranking de ayudas y recursos"
          icon={Package}
          items={data?.entregas || []}
          description="Ranking de los recursos más solicitados."
          loading={loading}
        />

        <DemographicStackedChart
          title="Sexo por Edad"
          subtitle="Distribución por Rango Etario"
          icon={BarChart3}
          data={data?.demografia?.piramide || []}
          loading={loading}
        />
      </div>

      <div className="space-y-8 pt-10 border-t border-slate-200">
        <div className="space-y-2">
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">Acceso Rápido</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Otras secciones de interés</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/vulnerabilidad" className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-white"><Users size={20}/></div>
            <span className="font-bold text-slate-800 text-sm">Vulnerabilidad</span>
          </Link>
          <Link href="/territorial" className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all">
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center text-white"><MapPin size={20}/></div>
            <span className="font-bold text-slate-800 text-sm">Territorial</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SummaryDashboard() {
  return (
    <Suspense fallback={<div className="p-8 max-w-[1600px] mx-auto space-y-10 bg-[#F8FAFC]">Cargando Dashboard...</div>}>
      <SummaryDashboardContent />
    </Suspense>
  );
}
