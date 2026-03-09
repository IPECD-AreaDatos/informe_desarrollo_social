"use client";

import { Calendar, ChevronDown, Check } from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { clsx } from "clsx";

const getDynamicPeriods = () => {
    const now = new Date();
    const months: { label: string, from: string, to: string }[] = [];
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    // Ultimos 6 meses
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}${i === 0 ? " (Actual)" : ""}`;
        months.push({
            label,
            from: d.toISOString().split('T')[0],
            to: lastDay.toISOString().split('T')[0]
        });
    }

    const currentYear = now.getFullYear();
    const annual: { label: string, from: string, to: string }[] = [
        { label: `Año ${currentYear} (Actual)`, from: `${currentYear}-01-01`, to: `${currentYear}-12-31` },
        { label: `Año ${currentYear - 1} (Completo)`, from: `${currentYear - 1}-01-01`, to: `${currentYear - 1}-12-31` },
        { label: `Año ${currentYear - 2} (Histórico)`, from: `${currentYear - 2}-01-01`, to: `${currentYear - 2}-12-31` }
    ];

    return { mensual: months, anual: annual };
};

const periods = getDynamicPeriods();

function HeaderContent({ hideDatePicker = false }: { hideDatePicker?: boolean }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'mensual' | 'anual' | 'all'>('mensual');

    // Default to either current month or previous month if current month is early
    const defaultPeriod = new Date().getDate() < 10 ? periods.mensual[1] : periods.mensual[0];
    const [selectedLabel, setSelectedLabel] = useState(defaultPeriod.label);

    useEffect(() => {
        const from = searchParams.get("from");
        const allList = [...periods.mensual, ...periods.anual, { label: "Todo el Periodo", from: "2024-01-01", to: `${new Date().getFullYear()}-12-31` }];
        const found = allList.find(p => p.from === from);
        if (found) {
            setSelectedLabel(found.label);
            if (periods.anual.some(p => p.from === from)) setActiveTab('anual');
            else if (periods.mensual.some(p => p.from === from)) setActiveTab('mensual');
        } else {
            // If no match but we have a date in URL, check if we can format it
            if (from) {
                const date = new Date(from + 'T12:00:00');
                if (!isNaN(date.getTime())) {
                    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
                    setSelectedLabel(`${monthNames[date.getMonth()]} ${date.getFullYear()}`);
                }
            } else {
                setSelectedLabel(defaultPeriod.label);
            }
        }
    }, [searchParams, defaultPeriod]);

    const handleSelect = (period: { label: string, from: string, to: string }) => {
        setSelectedLabel(period.label);
        setIsOpen(false);

        const params = new URLSearchParams(searchParams.toString());
        params.set("from", period.from);
        params.set("to", period.to);

        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <header className="flex justify-between items-center mb-10">
            <div className="space-y-1">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                    Tablero Ejecutivo Provincial
                </h2>
                <div className="flex items-center gap-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Ministerio de Desarrollo Social - Corrientes</p>
                    {!hideDatePicker && (
                        <>
                            <div className="w-1 h-1 rounded-full bg-slate-300" />
                            <p className="text-[10px] font-black text-[#526928] uppercase tracking-[0.2em]">{selectedLabel}</p>
                        </>
                    )}
                </div>
            </div>

            {!hideDatePicker && (
                <div className="flex items-center gap-4 relative">
                    <div
                        onClick={() => setIsOpen(!isOpen)}
                        className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:bg-slate-50 transition-all group"
                    >
                        <Calendar size={18} className="text-[#526928]" />
                        <span className="text-xs font-black text-slate-600 uppercase tracking-widest">{selectedLabel}</span>
                        <div className="w-px h-4 bg-slate-200 mx-2" />
                        <ChevronDown className={clsx("text-slate-400 transition-transform", isOpen && "rotate-180")} size={16} />
                    </div>

                    {isOpen && (
                        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2">
                            {/* TABS */}
                            <div className="flex border-b border-slate-100 bg-slate-50/50 p-1">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setActiveTab('mensual'); }}
                                    className={clsx(
                                        "flex-1 py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all",
                                        activeTab === 'mensual' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    Mensual
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setActiveTab('anual'); }}
                                    className={clsx(
                                        "flex-1 py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all",
                                        activeTab === 'anual' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    Anual
                                </button>
                            </div>

                            {/* LIST */}
                            <div className="py-2 max-h-80 overflow-y-auto">
                                {(activeTab === 'mensual' ? periods.mensual : periods.anual).map((p, i) => (
                                    <div
                                        key={i}
                                        onClick={() => handleSelect(p)}
                                        className="px-6 py-3 hover:bg-slate-50 flex justify-between items-center cursor-pointer group"
                                    >
                                        <span className={clsx(
                                            "text-xs font-bold transition-colors",
                                            selectedLabel === p.label ? "text-[#526928]" : "text-slate-500 group-hover:text-slate-800"
                                        )}>
                                            {p.label}
                                        </span>
                                        {selectedLabel === p.label && <Check size={14} className="text-[#526928]" />}
                                    </div>
                                ))}

                                <div className="p-2 border-t border-slate-50">
                                    <div
                                        onClick={() => handleSelect({ label: "Todo el Periodo", from: "2024-01-01", to: `${new Date().getFullYear()}-12-31` })}
                                        className="px-4 py-3 rounded-xl hover:bg-slate-50 flex justify-between items-center cursor-pointer group text-center bg-slate-50/30"
                                    >
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 w-full group-hover:text-[#526928]">Ver Todo el Periodo</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </header>
    );
}

export function Header(props: { hideDatePicker?: boolean }) {
    return (
        <Suspense fallback={<div className="h-20 animate-pulse bg-slate-100 rounded-2xl mb-10"></div>}>
            <HeaderContent {...props} />
        </Suspense>
    );
}

