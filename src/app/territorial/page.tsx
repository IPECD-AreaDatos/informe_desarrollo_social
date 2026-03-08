"use client";

import { useEffect, useState } from "react";
import {
    Truck,
    Box,
    Plane,
    MapPin,
    History,
    TrendingUp,
    LayoutGrid,
    Navigation,
    PackageCheck
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { KPICard } from "@/components/KPICard";

export default function TerritorialPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const searchParams = useSearchParams();

    // Default dates (current month)
    const now = new Date();
    const isEarlyMonth = now.getDate() < 10;
    const defaultFrom = new Date(now.getFullYear(), now.getMonth() - (isEarlyMonth ? 1 : 0), 1).toISOString().split('T')[0];
    const defaultTo = new Date(now.getFullYear(), now.getMonth() - (isEarlyMonth ? 1 : 0) + 1, 0).toISOString().split('T')[0];

    const from = searchParams.get("from") || defaultFrom;
    const to = searchParams.get("to") || defaultTo;

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/stats/territorial?from=${from}&to=${to}`);
            const json = await res.json();
            if (json.success) setData(json.data);
        } catch (error) {
            console.error("Error fetching territorial data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [searchParams, from, to]);

    const territorialKpis = [
        {
            label: "Módulos Entregados",
            value: data?.modulos?.[0]?.total_entregado?.toLocaleString() || "0",
            icon: Box,
            description: "Cantidad total de módulos alimentarios despachados y registrados en el sistema."
        },
        {
            label: "Pasajes Emitidos",
            value: data?.pasajes?.toLocaleString() || "0",
            icon: Plane,
            description: "Total de pasajes sociales emitidos para traslados de ciudadanos vulnerables."
        },
        {
            label: "Puntos de Entrega",
            value: data?.territory?.length.toString() || "0",
            icon: MapPin,
            description: "Número de localidades o municipios que han recibido asistencia en el periodo."
        },
    ];

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-8 bg-[#FDFDFD]">
            <Header />

            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                    <Navigation className="text-green-600" />
                    Gestión Territorial e Insumos
                </h2>
                <p className="text-slate-500 font-medium italic">Distribución de recursos y cobertura prestacional en la provincia.</p>
            </div>

            {/* KPI Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {territorialKpis.map((kpi, i) => (
                    <KPICard
                        key={i}
                        label={kpi.label}
                        value={kpi.value}
                        icon={kpi.icon}
                        description={kpi.description}
                        loading={loading}
                    />
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Desglose de Inventario - ENHANCED */}
                <div className="lg:col-span-2 bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm relative overflow-hidden">
                    <Box className="absolute -right-8 -top-8 text-slate-50 opacity-10" size={240} />
                    <h3 className="text-xl font-black text-slate-800 mb-10 flex items-center gap-2 border-b pb-4 relative z-10">
                        <PackageCheck className="text-green-600" />
                        Detalle de Asistencia e Insumos
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                        {/* Módulos */}
                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col justify-between group hover:bg-white hover:shadow-xl transition-all">
                            <div>
                                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-green-600 mb-4">
                                    <Box size={20} />
                                </div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Stock Entregado</p>
                                <p className="text-sm font-black text-slate-800">Módulos Alimentarios</p>
                            </div>
                            <div className="mt-8 flex justify-between items-end">
                                <p className="text-3xl font-black text-slate-900">{data?.modulos?.[0]?.total_entregado || 0}</p>
                                <span className="text-[10px] font-bold text-green-600 uppercase">Unidades</span>
                            </div>
                        </div>

                        {/* Pasajes */}
                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col justify-between group hover:bg-white hover:shadow-xl transition-all">
                            <div>
                                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-4">
                                    <Plane size={20} />
                                </div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Traslados Sociales</p>
                                <p className="text-sm font-black text-slate-800">Pasajes Emitidos</p>
                            </div>
                            <div className="mt-8 flex justify-between items-end">
                                <p className="text-3xl font-black text-slate-900">{data?.pasajes || 0}</p>
                                <span className="text-[10px] font-bold text-blue-600 uppercase">Emitidos</span>
                            </div>
                        </div>

                        {/* Otros Recursos */}
                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col justify-between group hover:bg-white hover:shadow-xl transition-all">
                            <div>
                                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 mb-4">
                                    <Truck size={20} />
                                </div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Diversas Ayudas</p>
                                <p className="text-sm font-black text-slate-800">Recursos Varios</p>
                            </div>
                            <div className="mt-8 flex justify-between items-end">
                                <p className="text-3xl font-black text-slate-900">
                                    {data?.recursos?.reduce((acc: number, r: any) => acc + Number(r.total), 0).toLocaleString() || "0"}
                                </p>
                                <span className="text-[10px] font-bold text-purple-600 uppercase">Entregados</span>
                            </div>
                        </div>
                    </div>

                    {/* Breakdown of and diverse resources */}
                    <div className="mt-10 pt-8 border-t border-slate-50">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Top Recursos de Ayuda Directa</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                            {data?.recursos?.map((r: any, i: number) => (
                                <div key={i} className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
                                    <span className="font-bold text-slate-600 uppercase tracking-tighter">{r.descripcion}</span>
                                    <span className="font-black text-slate-800">{r.total}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Territorial Distribution */}
                <div className="bg-[#1e293b] p-10 rounded-[40px] shadow-2xl text-white">
                    <h3 className="text-xl font-black mb-10 flex items-center gap-2 border-b border-white/10 pb-4">
                        <LayoutGrid className="text-green-400" />
                        Presencia en Territorio
                    </h3>
                    <div className="space-y-6">
                        {data?.territory?.map((loc: any, i: number) => {
                            const maxValue = data.territory[0]?.value || 1;
                            const percentage = (loc.value / maxValue) * 100;
                            return (
                                <div key={i} className="space-y-2">
                                    <div className="flex justify-between text-xs font-bold uppercase">
                                        <span className="text-slate-400">{loc.name}</span>
                                        <span className="text-green-400">{loc.value} Acciones</span>
                                    </div>
                                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-green-500 rounded-full transition-all duration-1000"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
