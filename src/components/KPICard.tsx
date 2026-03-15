import { LucideIcon, HelpCircle } from "lucide-react";
import { clsx } from "clsx";
import { useState } from "react";

interface KPICardProps {
    label: string;
    value: string | number;
    secondaryValue?: string | number;
    secondaryLabel?: string;
    icon: LucideIcon;
    description?: string;
    loading?: boolean;
    color?: string; // Optional custom color
}

export function KPICard({ 
    label, 
    value, 
    secondaryValue, 
    secondaryLabel, 
    icon: Icon, 
    description, 
    loading, 
    color 
}: KPICardProps) {
    const [showTooltip, setShowTooltip] = useState(false);

    const themeColor = color || "#526928"; // Default Ministerio Green

    return (
        <div className="bg-white p-7 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-500 group relative">
            {/* Background Accent */}
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-slate-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700 pointer-events-none" />

            <div className="flex justify-between items-start relative z-10">
                <div className={clsx(
                    "p-3.5 rounded-2xl text-white shadow-lg shadow-green-900/10",
                    !color && "bg-gradient-to-br from-[#526928] to-[#96C156]"
                )} style={color ? { backgroundColor: color } : {}}>
                    <Icon size={24} />
                </div>

                {description && (
                    <div className="relative">
                        <button
                            onMouseEnter={() => setShowTooltip(true)}
                            onMouseLeave={() => setShowTooltip(false)}
                            className="text-slate-300 hover:text-slate-500 transition-colors p-1"
                        >
                            <HelpCircle size={16} />
                        </button>

                        {/* Custom Tooltip - Positioned ABOVE */}
                        {showTooltip && (
                            <div className="absolute right-0 bottom-full mb-3 w-56 bg-slate-800 text-white text-[11px] p-4 rounded-2xl shadow-2xl z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
                                <div className="absolute -bottom-1 right-2 w-3 h-3 bg-slate-800 rotate-45" />
                                <p className="font-bold leading-relaxed">{description}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="space-y-1 mt-6 relative z-10">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</p>
                {loading ? (
                    <div className="h-10 w-3/4 bg-slate-100 animate-pulse rounded-lg mt-2" />
                ) : (
                    <div className="flex flex-col">
                        <h3 className="text-4xl font-black text-slate-800 tracking-tighter mt-2">
                            {value}
                        </h3>
                        {secondaryValue && (
                            <p className="text-[11px] font-bold text-slate-400 mt-1 flex items-center gap-1.5 uppercase tracking-wide">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                {secondaryLabel || 'de'} <span className="text-slate-600 font-black">{secondaryValue}</span>
                            </p>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-6 h-1 w-full bg-slate-50 rounded-full overflow-hidden relative z-10">
                <div
                    className="h-full bg-gradient-to-r from-[#526928] to-[#96C156] transition-all duration-1000 ease-out"
                    style={{
                        width: loading ? '0%' : '100%',
                        backgroundColor: color
                    }}
                />
            </div>
        </div>
    );
}
