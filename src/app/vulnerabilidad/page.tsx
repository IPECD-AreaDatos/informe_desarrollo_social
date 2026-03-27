"use client";

import { useEffect, useState } from "react";
import {
    Users,
    AlertTriangle,
    Briefcase,
    Droplets,
    Zap,
    Waves,
    Wifi,
    Building,
    Coins,
    BookOpen,
    HeartPulse,
    ArrowRight,
    TrendingDown,
    Activity,
    Smartphone,
    HelpCircle
} from "lucide-react";
import Link from "next/link";
import { DICCIONARIO } from "@/lib/constants";
import { Header } from "@/components/Header";
import { clsx } from "clsx";

// Custom Donut Chart Component
const DonutChart = ({ percent, label, value, color = "#8b5cf6" }: { percent: number, label: string, value: string | number, color?: string }) => {
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    return (
        <div className="flex flex-col items-center justify-center p-4 bg-white rounded-3xl border border-slate-100 shadow-sm">
            <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                        cx="64"
                        cy="64"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="transparent"
                        className="text-slate-50"
                    />
                    <circle
                        cx="64"
                        cy="64"
                        r={radius}
                        stroke={color}
                        strokeWidth="8"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        fill="transparent"
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-800">{percent}%</span>
                </div>
            </div>
            <div className="text-center mt-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                <p className="text-sm font-bold text-slate-700">{value}</p>
            </div>
        </div>
    );
};

export default function VulnerabilityPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/stats/vulnerability`);
            const json = await res.json();
            if (json.success) setData(json.data);
        } catch (error) {
            console.error("Error fetching vulnerability data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const getSexoLabel = (code: number) => (DICCIONARIO.SEXO as any)[code.toString()] || `Cód. ${code}`;
    const getSituacionLabel = (code: number) => (DICCIONARIO.SITUACION as any)[code.toString()] || `Cód. ${code}`;

    if (loading) {
        return <div className="p-8 max-w-[1600px] mx-auto space-y-8 bg-[#F8FAFC]">Cargando información estratégica...</div>;
    }

    const nbiSanitarioPercent = data?.infrastructure?.total ? Math.round(((data.infrastructure.total - data.infrastructure.con_cloaca) / data.infrastructure.total) * 100) : 0;
    const nbiEscolarPercent = data?.infrastructure?.total ? Math.round((data.asistenciaEscolar / data.infrastructure.total) * 100) : 0;
    const nbiSubsistenciaPercent = data?.infrastructure?.total ? Math.round((data.subsistencia / data.infrastructure.total) * 100) : 0;

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-10 bg-[#F8FAFC]">
            <Header hideDatePicker />

            {/* SECCIÓN 1: KPI CRÍTICOS (Impacto Inmediato) */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Activity size={18} className="text-red-500" />
                    <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Indicadores de Vulnerabilidad (NBI)</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* NBI Sanitarias */}
                    <div className="bg-white p-6 rounded-[32px] border border-red-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                        <div className="flex flex-col h-full justify-between gap-4 relative z-10">
                            <div className="space-y-1">
                                <div className="flex justify-between items-start">
                                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">NBI Sanitarias</p>
                                    <div className="group/tip relative">
                                        <HelpCircle size={14} className="text-slate-300 hover:text-red-400 cursor-help transition-colors" />
                                        <div className="absolute right-0 top-6 w-48 p-3 bg-slate-800 text-white text-[10px] font-bold rounded-xl opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl border border-slate-700">
                                            Hogares sin red cloacal o retrete instalado.
                                        </div>
                                    </div>
                                </div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">Condiciones</h3>
                            </div>
                            <div className="flex items-end justify-between">
                                <div className="text-4xl font-black text-red-600 tracking-tighter">
                                    {nbiSanitarioPercent}%
                                </div>
                                <Waves size={24} className="text-red-200 mb-1" />
                            </div>
                        </div>
                    </div>

                    {/* Hacinamiento Crítico */}
                    <div className="bg-white p-6 rounded-[32px] border border-red-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                        <div className="flex flex-col h-full justify-between gap-4 relative z-10">
                            <div className="space-y-1">
                                <div className="flex justify-between items-start">
                                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Crítico</p>
                                    <div className="group/tip relative">
                                        <HelpCircle size={14} className="text-slate-300 hover:text-red-400 cursor-help transition-colors" />
                                        <div className="absolute right-0 top-6 w-48 p-3 bg-slate-800 text-white text-[10px] font-bold rounded-xl opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl border border-slate-700">
                                            Viviendas con +3 personas por dormitorio relevado.
                                        </div>
                                    </div>
                                </div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">Hacinamiento</h3>
                            </div>
                            <div className="flex items-end justify-between">
                                <div className="text-4xl font-black text-red-600 tracking-tighter">
                                    {data?.crowding?.critico || 0}
                                </div>
                                <AlertTriangle size={24} className="text-red-200 mb-1" />
                            </div>
                        </div>
                    </div>

                    {/* NBI Inasistencia Escolar */}
                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                        <div className="flex flex-col h-full justify-between gap-4 relative z-10">
                            <div className="space-y-1">
                                <div className="flex justify-between items-start">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NBI Educación</p>
                                    <div className="group/tip relative">
                                        <HelpCircle size={14} className="text-slate-300 hover:text-slate-400 cursor-help transition-colors" />
                                        <div className="absolute right-0 top-6 w-48 p-3 bg-slate-800 text-white text-[10px] font-bold rounded-xl opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl border border-slate-700">
                                            Niños de 6 a 12 años que no asisten a la escuela.
                                        </div>
                                    </div>
                                </div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">Inasistencia</h3>
                            </div>
                            <div className="flex items-end justify-between">
                                <div className={clsx("text-4xl font-black tracking-tighter", nbiEscolarPercent === 0 ? "text-green-600" : "text-slate-800")}>
                                    {nbiEscolarPercent}%
                                </div>
                                <BookOpen size={24} className={clsx("mb-1", nbiEscolarPercent === 0 ? "text-green-200" : "text-slate-200")} />
                            </div>
                        </div>
                    </div>

                    {/* NBI Capacidad Subsistencia */}
                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                        <div className="flex flex-col h-full justify-between gap-4 relative z-10">
                            <div className="space-y-1">
                                <div className="flex justify-between items-start">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NBI Subsistencia</p>
                                    <div className="group/tip relative">
                                        <HelpCircle size={14} className="text-slate-300 hover:text-slate-400 cursor-help transition-colors" />
                                        <div className="absolute right-0 top-6 w-48 p-3 bg-slate-800 text-white text-[10px] font-bold rounded-xl opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 pointer-events-none shadow-xl border border-slate-700">
                                            Baja escolaridad del jefe y alta carga familiar.
                                        </div>
                                    </div>
                                </div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">Capacidad</h3>
                            </div>
                            <div className="flex items-end justify-between">
                                <div className="text-4xl font-black text-slate-800 tracking-tighter">
                                    {nbiSubsistenciaPercent}%
                                </div>
                                <Coins size={24} className="text-slate-200 mb-1" />
                            </div>
                        </div>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mt-8">
                
                {/* SECCIÓN 2: INVERSIÓN (Bloque Izquierdo - Dominante) */}
                <div className="lg:col-span-7 space-y-6 h-full">
                    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm h-full flex flex-col">
                        <div className="flex justify-between items-center border-b border-slate-50 pb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600">
                                    <TrendingDown size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-800 tracking-tight">Consumo Presupuestario</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ejecución Real por Programa</p>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto mt-6">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-slate-50">
                                        <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Programa / Descripción Completa</th>
                                        <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Monto</th>
                                        <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right px-4">Peso</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {data?.programs?.slice(0, 10).map((p: any, i: number) => {
                                        const totalInversion = data.programs.reduce((acc: number, cur: any) => acc + Number(cur.total_monto), 0) || 1;
                                        const pesoPercent = Math.round((Number(p.total_monto) / totalInversion) * 100);
                                        return (
                                            <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                                                <td className="py-4 pr-6">
                                                    <p className="text-[11px] font-black text-slate-700 uppercase tracking-tight leading-tight">{p.descripcion}</p>
                                                </td>
                                                <td className="py-4 text-right whitespace-nowrap">
                                                    <p className="text-sm font-black text-slate-800">${Number(p.total_monto).toLocaleString('es-AR')}</p>
                                                </td>
                                                <td className="py-4 text-right pl-6">
                                                   <div className="flex items-center justify-end gap-3">
                                                        <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-slate-800 rounded-full" style={{ width: `${pesoPercent}%` }} />
                                                        </div>
                                                        <span className="text-[10px] font-black text-slate-400 w-6">{pesoPercent}%</span>
                                                   </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* COLUMNA DERECHA: CARACTERIZACIÓN + DIGITAL */}
                <div className="lg:col-span-5 space-y-8">
                    {/* SECCIÓN 3: CARACTERIZACIÓN (Bloque Superior Derecho) */}
                    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
                        <div className="flex items-center gap-3 border-b border-slate-50 pb-6">
                            <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600">
                                <Users size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">Caracterización Poblacional</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Perfíl de Titulares</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Empleo */}
                            <div className="space-y-4">
                                {data?.demographics?.laboral?.slice(0, 4).map((l: any, i: number) => {
                                    const totalLaboral = data.demographics.laboral.reduce((acc: number, cur: any) => acc + cur.count, 0) || 1;
                                    const percent = (l.count / totalLaboral) * 100;
                                    return (
                                        <div key={i} className="space-y-1.5 text-slate-600">
                                            <div className="flex justify-between text-[11px] font-bold uppercase tracking-tighter">
                                                <span>{getSituacionLabel(l.situacion_laboral)}</span>
                                                <span className="text-slate-800 font-black">{l.count}</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                                                <div
                                                    className="h-full bg-slate-600 rounded-full transition-all duration-1000"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Género */}
                            <div className="pt-6 border-t border-slate-50 space-y-4">
                                <div className="flex h-5 w-full bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
                                    {data?.demographics?.sexo?.map((s: any, i: number) => {
                                        const total = data.demographics.sexo.reduce((acc: number, cur: any) => acc + cur.count, 0) || 1;
                                        const percent = (s.count / total) * 100;
                                        const colors = ["bg-slate-800", "bg-slate-400", "bg-slate-200"];
                                        return (
                                            <div 
                                                key={i} 
                                                className={clsx("h-full transition-all hover:opacity-80", colors[i] || "bg-slate-500")}
                                                style={{ width: `${percent}%` }}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="flex justify-center gap-6">
                                    {data?.demographics?.sexo?.map((s: any, i: number) => {
                                        const colors = ["bg-slate-800", "bg-slate-400", "bg-slate-200"];
                                        return (
                                            <div key={i} className="flex items-center gap-1.5">
                                                <div className={clsx("w-2 h-2 rounded-full", colors[i])} />
                                                <span className="text-[10px] font-black text-slate-500 uppercase">{getSexoLabel(s.sexo)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN 4: ACCESO DIGITAL (Bloque Inferior Derecho) */}
                    <div className="bg-slate-900 p-8 rounded-[40px] shadow-xl border border-slate-800 flex items-center justify-between text-white relative overflow-hidden group">
                        <div className="absolute right-0 top-0 opacity-5 -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-700">
                            <Wifi size={200} />
                        </div>
                        <div className="relative z-10 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-700">
                                    <Smartphone size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black tracking-tight">Acceso Digital</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Brecha de Conectividad</p>
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black text-white">{data?.infrastructure?.con_internet || 0}</span>
                                <span className="text-[10px] font-black text-slate-500 uppercase">Hogares Conectados</span>
                            </div>
                        </div>
                        <div className="relative z-10">
                            <DonutChart 
                                percent={data?.infrastructure?.total ? Math.round((data.infrastructure.con_internet / data.infrastructure.total) * 100) : 0} 
                                label="" 
                                value=""
                                color="#f8fafc"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* SECCIÓN 5: NAVEGACIÓN */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-slate-200">
                <Link
                    href="/educacion"
                    className="group bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-6"
                >
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-slate-800 group-hover:text-white transition-all">
                        <BookOpen size={28} />
                    </div>
                    <div>
                        <h4 className="text-lg font-black text-slate-800">Análisis Educativo</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Capital Humano e Instrucción</p>
                    </div>
                    <ArrowRight className="ml-auto text-slate-300 group-hover:text-slate-800 transition-colors" />
                </Link>

                <Link
                    href="/salud"
                    className="group bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-6"
                >
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-slate-800 group-hover:text-white transition-all">
                        <HeartPulse size={28} />
                    </div>
                    <div>
                        <h4 className="text-lg font-black text-slate-800">Reporte de Salud</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cobertura y Situación Sanitaria</p>
                    </div>
                    <ArrowRight className="ml-auto text-slate-300 group-hover:text-slate-800 transition-colors" />
                </Link>
            </div>
        </div>
    );
}

