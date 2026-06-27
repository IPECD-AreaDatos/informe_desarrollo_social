"use client";

import { useEffect, useState, Suspense } from "react";
import {
  Users,
  Coins,
  Package,
  MapPin,
  AlertCircle,
  BarChart3,
  TrendingUp,
  BookOpen
} from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import { Header } from "@/components/Header";
import { KPICard } from "@/components/KPICard";
import { CategoryCard } from "@/components/CategoryCard";
import { useSearchParams } from "next/navigation";
import { DemographicStackedChart } from "@/components/DemographicStackedChart";
import { apiUrl } from "@/lib/apiBase";

function SummaryDashboardContent() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const now = new Date();
  const isEarlyMonth = now.getDate() < 10;
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - (isEarlyMonth ? 1 : 0), 1).toISOString().split('T')[0];
  const defaultTo = new Date(now.getFullYear(), now.getMonth() - (isEarlyMonth ? 1 : 0) + 1, 0).toISOString().split('T')[0];

  const from = searchParams.get("from") || defaultFrom;
  const to = searchParams.get("to") || defaultTo;
  const isAnnual = from && to && from.substring(0, 4) === to.substring(0, 4) && from.endsWith("-01-01") && to.endsWith("-12-31");
  const [logisticsTab, setLogisticsTab] = useState<"destinos" | "salidas" | "recorridos">("destinos");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/stats/ministerio?from=${from}&to=${to}`));
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

  // Colores exactos del sistema de diseño unificado del IPECD
  const ministerioKpis = [
    {
      label: "Expedientes Gestionados",
      value: data?.total_expedientes?.toLocaleString() || "0",
      icon: BookOpen,
      description: "Volumen total de registros administrativos y carátulas generadas en el periodo.",
      color: "#719C29"
    },
    {
      label: "Atención con Expediente",
      value: data?.personas_con_expediente?.toLocaleString() || "0",
      icon: Users,
      description: "Cantidad de ciudadanos únicos que cuentan con respaldo de expediente administrativo.",
      color: "#1F5D9B"
    },
    {
      label: "Atención sin Expediente",
      value: data?.personas_sin_expediente?.toLocaleString() || "0",
      icon: Users,
      description: "Ciudadanos asistidos mediante atención directa o emergencias territoriales (CDC).",
      color: "#FACD05"
    },
    {
      label: "Inversión Ejecutada",
      value: `$${Number(data?.inversion_total || 0).toLocaleString()}`,
      icon: Coins,
      description: "Monto total de subsidios y ayudas financieras liquidadas en el periodo.",
      color: "#6B5CB7"
    },
  ];

  if (error) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto space-y-10">
        <div className="bg-red-50 p-6 rounded-2xl border border-red-100 flex items-center gap-4 text-red-600 font-barlow">
          <AlertCircle size={24} />
          <p className="font-bold">Error al cargar datos: {error}</p>
        </div>
      </div>
    );
  }

  const hasNoData = !loading && data && (Number(data.total_expedientes) === 0 || Number(data.personas_atendidas_total) === 0);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 bg-[#F8FAFC]">
      <Header />

      {hasNoData && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-900 p-6 rounded-3xl flex items-center gap-4 animate-fade-in font-barlow">
          <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-600 shrink-0">
            <AlertCircle size={24} />
          </div>
          <div className="space-y-1">
            <p className="font-black text-sm uppercase tracking-wider text-amber-800">Aún no existen datos registrados para este período</p>
            <p className="text-xs text-amber-700 font-bold">
              Última carga en la base de datos: <span className="font-extrabold text-amber-900 underline">{data?.latest_data_date || 'Sin datos'}</span>.
            </p>
          </div>
        </div>
      )}

      {/* Grilla flexible para evitar superposiciones en pantallas de notebooks */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-6 hover:cursor-default">
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
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#719C29]/10 rounded-2xl flex items-center justify-center text-[#719C29] shrink-0">
                    <BarChart3 size={24} />
                </div>
                <div>
                    <h3 className="font-barlow-semicondensed font-extrabold text-2xl text-[#2e2d2c] tracking-tight">Evolución de Inversión Anual</h3>
                    <p className="text-[10px] font-barlow font-bold text-[#989797] uppercase tracking-widest mt-0.5">Histórico de inversión asociados a expedientes.</p>
                </div>
            </div>
          </div>

          {/* Contenedor Principal con padding extra abajo para el nombre del eje X */}
          <div className="relative h-[380px] mt-10 flex flex-col gap-2">
            {(() => {
              const gastoMensual = data?.gasto_mensual || [];
              if (gastoMensual.length === 0) {
                return <p className="w-full text-center text-slate-400">No hay datos de inversión para el año seleccionado.</p>;
              }
              const maxVal = Math.max(...gastoMensual.map((g: any) => g.amount), 1);
              const formatCompact = (n: number) => {
                if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
                if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
                return `$${n}`;
              };

              return (
                <>
                  {/* Área del Gráfico + Eje Y */}
                  <div className="flex-1 flex gap-4 h-[340px]">
                    
                    {/* EJE Y: Nombre Rotado + Valores */}
                    <div className="flex items-center gap-2 h-full pr-1 border-r border-slate-100">
                      {/* Nombre del Eje Y */}
                      <span className="text-[10px] font-barlow font-bold text-[#989797] uppercase tracking-widest -rotate-90 origin-center whitespace-nowrap -mx-4">
                        Inversión
                      </span>
                      
                      {/* Valores numéricos */}
                      <div className="h-full flex flex-col justify-between text-right text-[10px] font-bold text-slate-400 min-w-[45px]">
                        <span>{formatCompact(maxVal)}</span>
                        <span>{formatCompact(maxVal / 2)}</span>
                        <span>$0</span>
                      </div>
                    </div>

                    {/* Gráfico de Barras */}
                    <div className="flex-1 grid grid-cols-12 gap-2 relative">
                      {/* Líneas de guía */}
                      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                        <div className="h-1/2 border-b border-dashed border-slate-200/80"></div>
                        <div className="h-1/2 border-b border-dashed border-slate-200/80"></div>
                      </div>

                      {gastoMensual.map((item: any, i: number) => {
                        const height = (item.amount / maxVal) * 100;
                        return (
                          <div key={i} className="flex flex-col items-center justify-end gap-2 group/item relative">
                            <div 
                              className="w-full max-w-[40px] bg-gradient-to-t from-[#719C29] to-[#A3D460] rounded-t-lg transition-all duration-500 hover:opacity-100 opacity-80"
                              style={{ height: `${height}%` }}
                              title={`${item.month}: $${item.amount.toLocaleString()}`}
                            />
                            <span className="text-[10px] font-barlow font-bold text-[#989797]">{item.month}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* EJE X: Contenedor inferior para la etiqueta del período */}
                  <div className="flex justify-center w-full pl-[70px] mt-1">
                    <span className="text-[10px] font-barlow font-bold text-[#989797] uppercase tracking-widest">
                      Período
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Sección Inferior de Reportes Gráficos */}
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Tarjeta de Logística de Pasajes */}
          <div>
            <CategoryCard
              title="Logística de Pasajes"
              subtitle={`${logisticsTab === 'recorridos' ? 'Mapas de calor de' : 'Principales'} ${logisticsTab}`}
              icon={TrendingUp}
              items={data?.logistica?.[logisticsTab] || []}
              description={`Resumen de pasajes emitidos agrupados por ${logisticsTab}.`}
              loading={loading}
              headerActions={
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 shadow-xs w-full">
                  {(["destinos", "salidas", "recorridos"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setLogisticsTab(tab)}
                      className={clsx(
                        "flex-1 py-1.5 text-[9px] font-barlow font-extrabold uppercase tracking-wider rounded-md transition-all cursor-pointer text-center",
                        logisticsTab === tab
                          ? "bg-white text-[#2e2d2c] shadow-xs border border-slate-200/30"
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              }
            />
          </div>
          
        {/* Tarjeta de Recursos */}
          <div>
            <CategoryCard
              title="Recursos"
              subtitle="Ranking de ayudas y recursos"
              icon={Package}
              items={data?.entregas || []}
              description="Ranking de los recursos más solicitados."
              loading={loading}
            />
          </div>
        </div>
        {/* Sexo por Edad */}
        <div>
          <DemographicStackedChart
            title="Sexo por Edad"
            subtitle="Distribución por Rango Etario"
            icon={BarChart3}
            data={data?.demografia?.piramide || []}
            loading={loading}
          />
        </div>
      </div>

      {/* Enlaces de Acceso Rápido */}
      <div className="space-y-6 pt-6 border-t border-slate-200">
        <div className="space-y-2">
          <h3 className="text-2xl font-barlow-semicondensed font-extrabold text-[#2e2d2c] tracking-tight">Acceso Rápido</h3>
          <p className="text-[10px] font-barlow font-bold text-[#989797] uppercase tracking-widest">Otras secciones de interés</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/vulnerabilidad" className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all font-barlow font-bold text-[#2e2d2c] text-sm">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-white">
              <Users size={20} />
            </div>
            <span>Vulnerabilidad</span>
          </Link>
          <Link href="/territorial" className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all font-barlow font-bold text-[#2e2d2c] text-sm">
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center text-white">
              <MapPin size={20} />
            </div>
            <span>Territorial</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SummaryDashboard() {
  return (
    <Suspense fallback={<div className="p-8 max-w-[1600px] mx-auto space-y-10 bg-[#F8FAFC] font-barlow font-bold text-slate-500">Cargando Dashboard...</div>}>
      <SummaryDashboardContent />
    </Suspense>
  );
}