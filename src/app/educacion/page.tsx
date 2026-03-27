"use client";

import { useEffect, useState } from "react";
import {
    BookOpen,
    GraduationCap,
    School,
    BarChart3,
    Trophy,
    Presentation,
    Library
} from "lucide-react";
import { Header } from "@/components/Header";
import { KPICard } from "@/components/KPICard";
import { DICCIONARIO } from "@/lib/constants";

export default function EducationPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/stats/education`);
            const json = await res.json();
            if (json.success) setData(json.data);
        } catch (error) {
            console.error("Error fetching education data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Lógica para ordenar los niveles de mayor a menor según cantidad
    const sortedLevels = data?.instructionLevels?.sort((a: any, b: any) => b.value - a.value) || [];

    const getInstructionLabel = (code: number) => {
        return (DICCIONARIO.INSTRUCCION as any)[code.toString()] || `Cód. ${code}`;
    };

    const educationKpis = [
        { label: "Personas Relevadas", value: data?.stats?.total_personas?.toString() || "0", icon: School },
        { label: "Nivel Superior C.", value: data?.stats?.nivel_superior_completo?.toString() || "0", icon: GraduationCap },
        { label: "Categorías Ed.", value: data?.instructionLevels?.length?.toString() || "0", icon: Library },
        { label: "Máx. Nivel Reg.", value: getInstructionLabel(data?.instructionLevels?.[0]?.nivel_instruccion || 0), icon: Trophy },
    ];

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-8 bg-[#fdfdfd]">
            <Header hideDatePicker />

            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                    <BookOpen className="text-orange-500" />
                    Educación y Nivel de Instrucción
                </h2>
                <p className="text-slate-500 font-medium">Análisis del capital humano y niveles educativos en la población asistida.</p>
            </div>

            {/* KPI Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {educationKpis.map((kpi, i) => (
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
                {/* Instruction Level Breakdown */}
                <div className="lg:col-span-2 bg-white p-10 rounded-[40px] border border-slate-100 shadow-xl">
                    <div className="mb-10">
                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-3 mb-2">
                            <BarChart3 className="text-orange-500" />
                            Distribución por Nivel Educativo
                        </h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Capital Humano e Instrucción Alcanzada</p>
                    </div>
                    <div className="space-y-6">
                        {sortedLevels.map((inst: any, i: number) => {
                            const maxVal = Math.max(...(data.instructionLevels.map((l: any) => l.value))) || 1;
                            const percentage = (inst.value / maxVal) * 100;
                            const label = getInstructionLabel(inst.nivel_instruccion);
                            return (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-32 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                        {label}
                                    </div>
                                    <div className="flex-1 h-8 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 flex items-center relative group">
                                        <div
                                            className="h-full bg-orange-500/80 transition-all duration-1000 group-hover:bg-orange-500"
                                            style={{ width: `${percentage}%` }}
                                        />
                                        <span className="absolute left-4 text-[10px] font-black text-slate-700 group-hover:text-white transition-colors">{inst.value} Personas</span>
                                    </div>
                                    <div className="text-xs font-black text-slate-400 w-12 text-right">
                                        {((inst.value / (data.stats?.total_personas || 1)) * 100).toFixed(1)}%
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-10 pt-6 border-t border-slate-50 flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                            <BookOpen size={14} className="text-orange-500" />
                        </div>
                        <p className="text-[11px] text-slate-500 font-bold leading-tight">
                            * El relevamiento abarca la instrucción de <span className="text-slate-800 uppercase tracking-tighter">todo el grupo familiar</span> y no se limita al titular individual.
                        </p>
                    </div>
                </div>

                {/* Avg Level by Program */}
                <div className="bg-[#1e293b] p-10 rounded-[40px] text-white space-y-8">
                    <h3 className="text-xl font-black flex items-center gap-3 border-b border-white/10 pb-4">
                        <Presentation className="text-orange-400" />
                        Formación por Programa
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold leading-relaxed uppercase tracking-widest mb-6">Nivel de instrucción predominante por programa ministerial:</p>
                    <div className="space-y-6">
                        {data?.eduByProgram?.slice(0, 8).map((edu: any, i: number) => (
                            <div key={i} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 group border-b border-white/5 pb-4 last:border-0 last:pb-0">
                                <span className="text-xs font-bold text-slate-300 group-hover:text-orange-400 transition-colors leading-relaxed uppercase tracking-tighter flex-1">{edu.name}</span>
                                <div className="text-left sm:text-right shrink-0 bg-white/5 px-3 py-2 rounded-xl">
                                    <p className="text-sm font-black text-white leading-none">{getInstructionLabel(Math.round(edu.avg_level))}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-6 bg-white/5 border border-white/10 rounded-3xl mt-4">
                        <p className="text-xs text-slate-400 leading-normal font-medium">
                            Se calcula asignando un valor a cada escalafón educativo. El texto representa la tendencia de formación predominante del grupo familiar asociado al programa.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
