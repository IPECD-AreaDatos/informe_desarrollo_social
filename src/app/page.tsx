"use client";

import { useEffect, useState } from "react";
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
  Search
} from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import { Header } from "@/components/Header";
import { KPICard } from "@/components/KPICard";
import { CategoryCard } from "@/components/CategoryCard";
import { useSearchParams } from "next/navigation";
import { DemographicStackedChart } from "@/components/DemographicStackedChart";

export default function SummaryDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const [logisticsView, setLogisticsView] = useState<'destinos' | 'salidas' | 'recorridos'>('destinos');
  const [logisticsFilter, setLogisticsFilter] = useState('');

  const now = new Date();
  const isEarlyMonth = now.getDate() < 10;
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - (isEarlyMonth ? 1 : 0), 1).toISOString().split('T')[0];
  const defaultTo = new Date(now.getFullYear(), now.getMonth() - (isEarlyMonth ? 1 : 0) + 1, 0).toISOString().split('T')[0];

  const from = searchParams.get("from") || defaultFrom;
  const to = searchParams.get("to") || defaultTo;
  const isAnnual = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24) > 60;

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stats/ministerio?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || "Error desconocido en la API");
      }
    } catch (error: any) {
      console.error("Error fetching ministerio data:", error);
      setError("No se pudo conectar con la base de datos ministerial. Verifique el túnel SSH.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchParams]);

  const ministerioKpis = [
    {
      label: "Personas Asistidas",
      value: data?.total_personas?.toLocaleString() || "0",
      icon: Users,
      description: "Conteo de DNIs únicos con expedientes activos iniciados en el periodo seleccionado.",
      color: "#526928"
    },
    {
      label: "Inversión Ejecutada",
      value: `$${Number(data?.inversion_total || 0).toLocaleString()}`,
      icon: Coins,
      description: "Sumatoria total de montos de subsidios y ayudas financieras otorgadas a titulares.",
      color: "#0284c7"
    },
    {
      label: "Módulos Entregados",
      value: data?.total_modulos?.toLocaleString() || "0",
      icon: Package,
      description: "Cantidad total de módulos alimentarios distribuidos en el periodo.",
      color: "#f59e0b"
    },
    {
      label: "Pasajes Emitidos",
      value: data?.total_pasajes?.toLocaleString() || "0",
      icon: Ticket,
      description: "Sumatoria de pasajes otorgados (adultos + menores) para traslados sociales.",
      color: "#8b5cf6"
    },
  ];

  if (error) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto space-y-10">
        <Header />
        <div className="bg-red-50 border-2 border-red-200 p-12 rounded-[40px] text-center space-y-6">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
            <AlertCircle size={40} />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-red-900">Error de Gestión</h3>
            <p className="text-red-700 font-medium max-w-md mx-auto">{error}</p>
          </div>
          <button
            onClick={fetchData}
            className="bg-red-600 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-red-700 transition-all text-sm"
          >
            Reintentar Conexión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-10 bg-[#F8FAFC]">
      <Header />

      <div className="space-y-6">

        {/* KPI GRID */}
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

      {/* ANNUAL EVOLUTION - MOVED UP */}
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
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest pl-16">Histórico de inversión - Ejes Mensuales {new Date(from).getFullYear()}/{new Date(to).getFullYear()}</p>
            </div>
            <div className="hidden md:block p-4 bg-slate-50 border border-slate-100 rounded-2xl max-w-sm text-right">
              <p className="text-[10px] font-black text-[#526928] uppercase tracking-widest mb-1">Métrica de Gestión</p>
              <p className="text-[10px] text-slate-400 leading-relaxed font-bold">Distribución temporal de subsidios y ayudas sociales ejecutadas.</p>
            </div>
          </div>

          <div className="relative h-[400px] mt-10 flex items-end gap-4 pb-12 pt-10 px-4">
            {/* Y-AXIS LABELS */}
            <div className="absolute left-0 top-0 bottom-12 flex flex-col justify-between text-[10px] font-black text-slate-300 uppercase tracking-tighter pr-4 border-r border-slate-100">
              <span>${Math.round(Math.max(...data?.gasto_mensual?.map((g: any) => g.amount) || [0])).toLocaleString('de-DE')}</span>
              <span>${Math.round(Math.max(...data?.gasto_mensual?.map((g: any) => g.amount) || [0]) / 2).toLocaleString('de-DE')}</span>
              <span>$0</span>
            </div>

            {/* BARS CONTAINER */}
            <div className="flex-1 h-full ml-16 flex items-end justify-around gap-4 relative">
              {/* Subtle Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                <div className="w-full border-t border-slate-50 h-px" />
                <div className="w-full border-t border-slate-50 h-px" />
                <div className="w-full border-t border-slate-100 h-px" />
              </div>
              {data?.gasto_mensual?.map((item: any, i: number) => {
                const maxVal = Math.max(...data.gasto_mensual.map((g: any) => g.amount), 1);
                const height = (item.amount / maxVal) * 100;

                // Helper to format month name in Spanish
                const formatMonth = (monthStr: string) => {
                  try {
                    const [year, month] = monthStr.split('-');
                    const date = new Date(parseInt(year), parseInt(month) - 1);
                    const monthName = date.toLocaleString('es-ES', { month: 'long' });
                    return {
                      month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
                      year: year
                    };
                  } catch (e) {
                    return { month: monthStr, year: '' };
                  }
                };

                const dateParts = formatMonth(item.month);

                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-4 group/item h-full justify-end relative z-10">
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover/item:opacity-100 transition-opacity bg-slate-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-black mb-1 shadow-xl whitespace-nowrap absolute -top-12 z-20">
                      ${Math.round(item.amount).toLocaleString('de-DE')}
                    </div>

                    {/* Bar */}
                    <div
                      className="w-full max-w-[60px] bg-gradient-to-t from-[#526928] to-[#96C156] rounded-t-2xl transition-all duration-1000 relative group-hover/item:brightness-110 group-hover/item:shadow-[0_10px_30px_rgba(150,193,86,0.2)]"
                      style={{ height: `${height}%` }}
                    >
                      {height > 15 && (
                        <div className="absolute top-4 left-0 right-0 text-center">
                          <span className="text-[9px] font-black text-white/40">{Math.round(height)}%</span>
                        </div>
                      )}
                    </div>

                    {/* X-AXIS Label */}
                    <div className="text-center">
                      <p className="text-[10px] font-black text-slate-600 uppercase truncate max-w-[100px]">
                        {dateParts.month}
                      </p>
                      <p className="text-[8px] font-bold text-slate-300 uppercase">
                        {dateParts.year}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-8 grid-cols-1 lg:grid-cols-2">
        <div className="relative group/log lg:col-span-2">
          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm transition-all hover:shadow-xl group">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#CADFAB] rounded-xl flex items-center justify-center text-[#526928]">
                  <TrendingUp size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Logística de Pasajes</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {logisticsView === 'destinos' ? "Destinos más frecuentes" :
                      logisticsView === 'salidas' ? "Puntos de salida frecuentes" :
                        "Recorridos Disponibles (Origen → Destino)"}
                  </p>
                </div>
              </div>

              {!loading && (
                <div className="flex flex-wrap items-center gap-4">
                  {logisticsView === 'recorridos' && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input
                        type="text"
                        placeholder="Buscar origen o destino..."
                        value={logisticsFilter}
                        onChange={(e) => setLogisticsFilter(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#CADFAB] transition-all w-64"
                      />
                    </div>
                  )}
                  <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner">
                    {[
                      { id: 'salidas', label: 'Salida' },
                      { id: 'destinos', label: 'Destino' },
                      { id: 'recorridos', label: 'Recorrido' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setLogisticsView(tab.id as any)}
                        className={clsx(
                          "px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all",
                          logisticsView === tab.id ? "bg-white text-[#526928] shadow-sm" : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
              {(() => {
                const getItems = () => {
                  return logisticsView === 'destinos' ? (data?.logistica?.destinos || []) :
                    logisticsView === 'salidas' ? (data?.logistica?.salidas || []) :
                      (data?.logistica?.recorridos || []);
                };

                const allItems = getItems();
                const filtered = logisticsView === 'recorridos'
                  ? allItems.filter((item: any) => item.name.toLowerCase().includes(logisticsFilter.toLowerCase()))
                  : allItems.slice(0, 5);

                if (filtered.length === 0) {
                  return <p className="col-span-2 text-center py-10 text-slate-400 font-bold text-xs uppercase tracking-widest">No hay resultados</p>;
                }

                const maxVal = Math.max(...allItems.map((i: any) => i.value), 1);

                return filtered.map((item: any, i: number) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                      <span className="text-slate-500">{item.name}</span>
                      <span className="text-slate-800">{item.value.toLocaleString()}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-50 rounded-full border border-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#526928] to-[#96C156] rounded-full transition-all duration-1000"
                        style={{ width: `${(item.value / maxVal) * 100}%` }}
                      />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>

        <CategoryCard
          title="Top Entregas"
          subtitle="Ranking de ayudas y recursos"
          icon={Package}
          items={data?.entregas || []}
          description="Ranking de los 10 recursos más entregados, incluyendo módulos alimentarios, pasajes y otros recursos de relevamientos."
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


      {/* ADDITIONAL IDEAS SECTION */}
      <div className="space-y-8 pt-10 border-t border-slate-200">
        <div className="space-y-2">
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">Módulos Opcionales</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ideas adicionales de gestión para análisis profundo</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "Educación", detail: "Nivel de Instrucción", icon: Building2, href: "/educacion", color: "bg-blue-500" },
            { label: "Vulnerabilidad", detail: "Servicios Básicos", icon: Activity, href: "/vulnerabilidad", color: "bg-orange-500" },
            { label: "Territorial", detail: "Mapa de Impacto", icon: MapPin, href: "/territorial", color: "bg-purple-500" },
          ].map((idea, i) => (
            <Link
              key={i}
              href={idea.href}
              className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-lg transition-all group flex items-center gap-4"
            >
              <div className={clsx("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg", idea.color)}>
                <idea.icon size={24} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-800">{idea.label}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{idea.detail}</p>
              </div>
              <ChevronRight className="ml-auto text-slate-300 group-hover:text-slate-600 transition-colors" size={16} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

