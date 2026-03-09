"use client";

import { useEffect, useState } from "react";
import { HeartPulse, ShieldAlert, Activity, Users, FilePlus2, AlertCircle } from "lucide-react";
import { Header } from "@/components/Header";
import { KPICard } from "@/components/KPICard";

export default function HealthPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/stats/health`);
            const json = await res.json();
            if (json.success) setData(json.data);
        } catch (error) {
            console.error("Error fetching health data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const totalCobertura = data?.cobertura?.reduce((acc: number, curr: any) => acc + curr.count, 0) || 0;
    const sinCobertura = data?.sinCobertura || 0;
    const totalPersonas = totalCobertura + sinCobertura;
    const porcentajeCobertura = totalPersonas > 0 ? Math.round((totalCobertura / totalPersonas) * 100) : 0;

    const healthKpis = [
        { label: "Personas Relevadas", value: totalPersonas.toString(), icon: Users },
        { label: "Cobertura Médica", value: `${porcentajeCobertura}%`, icon: HeartPulse },
        { label: "Sin Cobertura (NBI)", value: sinCobertura.toString(), icon: ShieldAlert },
        { label: "Entidades de Salud", value: data?.cobertura?.length?.toString() || "0", icon: Activity },
    ];

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-8 bg-[#fdfdfd]">
            <Header hideDatePicker />

            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                    <HeartPulse className="text-red-500" />
                    Reporte Sanitario y Cobertura Médica
                </h2>
                <p className="text-slate-500 font-medium">Análisis de la situación sanitaria y cobertura social de la población asistida.</p>
            </div>

            {/* KPI Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {healthKpis.map((kpi, i) => (
                    <KPICard
                        key={i}
                        label={kpi.label}
                        value={kpi.value}
                        icon={kpi.icon}
                        loading={loading}
                    />
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Obras Sociales Breakdown */}
                <div className="lg:col-span-2 bg-white p-10 rounded-[40px] border border-slate-100 shadow-xl">
                    <h3 className="text-xl font-black text-slate-800 mb-10 flex items-center gap-3">
                        <FilePlus2 className="text-red-500" />
                        Distribución por Obra Social
                    </h3>
                    <div className="space-y-6">
                        {data?.cobertura?.map((os: any, i: number) => {
                            const maxVal = Math.max(...(data.cobertura.map((c: any) => c.count))) || 1;
                            const percentage = (os.count / maxVal) * 100;
                            return (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-48 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none truncate">
                                        {os.name}
                                    </div>
                                    <div className="flex-1 h-8 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 flex items-center relative group">
                                        <div
                                            className="h-full bg-red-400/80 transition-all duration-1000 group-hover:bg-red-500"
                                            style={{ width: `${percentage}%` }}
                                        />
                                        <span className="absolute left-4 text-[10px] font-black text-slate-700 group-hover:text-white transition-colors">{os.count} Personas</span>
                                    </div>
                                    <div className="text-xs font-black text-slate-400 w-12 text-right">
                                        {((os.count / (totalPersonas || 1)) * 100).toFixed(1)}%
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Summary Info */}
                <div className="bg-[#1e293b] p-10 rounded-[40px] text-white space-y-8 flex flex-col justify-between">
                    <div>
                        <h3 className="text-xl font-black flex items-center gap-3 border-b border-white/10 pb-4">
                            <ShieldAlert className="text-red-400" />
                            Atención Prioritaria
                        </h3>
                        <p className="text-xs text-slate-400 font-bold leading-relaxed uppercase tracking-widest mt-8">
                            Población en situación de vulnerabilidad sanitaria sin cobertura médica registrada.
                        </p>

                        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl mt-4">
                            <p className="text-xs text-red-100 leading-normal font-medium mb-4">
                                Es crítico considerar que el <strong>{100 - porcentajeCobertura}%</strong> de la población relevada depende exclusivamente del <strong>sistema de salud pública</strong> para su atención.
                            </p>
                            <div className="flex justify-between items-end border-t border-red-500/10 pt-4 mt-6">
                                <AlertCircle className="text-red-400 opacity-50" size={32} />
                                <div className="text-right">
                                    <p className="text-3xl font-black text-red-400 leading-none mb-1">{sinCobertura}</p>
                                    <p className="text-[9px] font-black text-red-300/60 uppercase tracking-widest">Ciudadanos Sin O.S.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
