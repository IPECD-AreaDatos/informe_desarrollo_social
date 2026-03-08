"use client";

import { useEffect, useState } from "react";
import {
    Users,
    AlertTriangle,
    Briefcase,
} from "lucide-react";
import { DICCIONARIO } from "@/lib/constants";
import { Header } from "@/components/Header";

export default function VulnerabilityPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/stats/vulnerability`);
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

    // Helpers to map DB codes to labels using global dictionary
    const getSexoLabel = (code: number) => (DICCIONARIO.SEXO as any)[code.toString()] || `Cód. ${code}`;
    const getSituacionLabel = (code: number) => (DICCIONARIO.SITUACION as any)[code.toString()] || `Cód. ${code}`;


    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-8 bg-[#F8FAFC]">
            <Header hideDatePicker />

            {/* HACINAMIENTO REAL */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start mb-8 border-b pb-4">
                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        <AlertTriangle className="text-red-500" />
                        Hacinamiento Crítico Real
                    </h3>
                    <div className="text-center">
                        <p className="text-2xl font-black text-red-600">{data?.crowding?.critico || 0}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase">Hogares NBI</p>
                    </div>
                </div>
                <div className="space-y-6 text-center max-w-2xl mx-auto">
                    <p className="text-sm font-medium text-slate-500 leading-relaxed">
                        Cálculo basado en la relación entre <span className="font-bold text-slate-700 text-base">v.habitantes / v.dormitorios</span> superiores a 3.0 por unidad habitacional.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-5 bg-red-50 rounded-2xl border border-red-100">
                            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Nivel Crítico (+3)</p>
                            <p className="text-2xl font-black text-red-600">{data?.crowding?.critico}</p>
                        </div>
                        <div className="p-5 bg-orange-50 rounded-2xl border border-orange-100">
                            <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Medio (2-3)</p>
                            <p className="text-2xl font-black text-orange-600">{data?.crowding?.medio}</p>
                        </div>
                    </div>
                </div>
            </div>


            <div className="grid grid-cols-1 gap-8">
                {/* BLOQUE DEMOGRÁFICO REAL */}
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
                    <div className="flex justify-between items-center border-b pb-4">
                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <Users className="text-green-500" />
                            Caracterización del Ciudadano (NBI_persona)
                        </h3>
                        <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-full uppercase">Total: {data?.infrastructure?.total || 0} Hogares</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        {/* Situación Laboral Real - PRIORITIZED */}
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Ocupación / Situación Laboral</p>
                            <div className="space-y-4">
                                {data?.demographics?.laboral?.slice(0, 4).map((l: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <Briefcase size={14} className="text-slate-400" />
                                            <span className="text-xs font-bold text-slate-600">{getSituacionLabel(l.situacion_laboral)}</span>
                                        </div>
                                        <span className="text-sm font-black text-slate-800">{l.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Distribución por Sexo */}
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Género Relevado</p>
                            <div className="space-y-4">
                                {data?.demographics?.sexo?.map((s: any, i: number) => (
                                    <div key={i} className="space-y-1">
                                        <div className="flex justify-between text-xs font-bold">
                                            <span>{getSexoLabel(s.sexo)}</span>
                                            <span>{s.count} personas</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-100 rounded-full">
                                            <div
                                                className="h-full bg-green-500 rounded-full"
                                                style={{ width: `${(s.count / (data.infrastructure?.total || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

            </div>

        </div>
    );
}
