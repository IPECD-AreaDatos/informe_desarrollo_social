"use client";

interface DataPoint {
    label: string;
    value: number;
}

interface AreaChartProps {
    title: string;
    data?: DataPoint[];
    loading?: boolean;
}

export function AreaChart({ title, data, loading }: AreaChartProps) {
    // Generate SVG path from data
    const generatePath = (points: DataPoint[], isArea = false) => {
        if (!points || points.length === 0) return "";
        const width = 800;
        const height = 200;
        const max = Math.max(...points.map(p => p.value)) * 1.2 || 1;

        const coords = points.map((p, i) => ({
            x: (i * (width / (points.length - 1))),
            y: height - (p.value / max) * height
        }));

        let d = `M ${coords[0].x} ${coords[0].y}`;
        for (let i = 1; i < coords.length; i++) {
            const prev = coords[i - 1];
            const curr = coords[i];
            const cpX = (prev.x + curr.x) / 2;
            d += ` Q ${cpX} ${prev.y}, ${curr.x} ${curr.y}`;
        }

        if (isArea) {
            d += ` V ${height + 56} H 0 Z`;
        }
        return d;
    };

    return (
        <div className="bg-white p-8 rounded-[12px] border border-[var(--border)] shadow-sm h-full">
            <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-bold text-[var(--foreground)] tracking-tight">{title}</h3>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[var(--primary)]" />
                        <span className="text-xs font-medium text-slate-500">Expedientes</span>
                    </div>
                </div>
            </div>

            <div className="relative h-64 w-full">
                {loading ? (
                    <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl flex items-center justify-center">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Cargando Tendencias...</span>
                    </div>
                ) : (
                    <>
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 800 256">
                            <defs>
                                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                                </linearGradient>
                            </defs>

                            {/* Grid lines */}
                            {[0, 1, 2, 3, 4].map((i) => (
                                <line
                                    key={i}
                                    x1="0"
                                    y1={i * 64}
                                    x2="800"
                                    y2={i * 64}
                                    stroke="var(--border)"
                                    strokeWidth="1"
                                    strokeDasharray="4 4"
                                />
                            ))}

                            {/* Area fill */}
                            <path
                                d={generatePath(data || [], true)}
                                fill="url(#areaGradient)"
                                className="transition-all duration-1000"
                            />

                            {/* Line Chart */}
                            <path
                                d={generatePath(data || [])}
                                fill="none"
                                stroke="var(--primary)"
                                strokeWidth="4"
                                strokeLinecap="round"
                                className="transition-all duration-1000"
                            />
                        </svg>

                        <div className="flex justify-between mt-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                            {data?.map((p, i) => (
                                <span key={i}>{p.label}</span>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
