"use client";

import { clsx } from "clsx";
import { RUBRO_TAB_LABELS } from "@/lib/graficos/uiHelpers";
import type { GraficoWorkbookId } from "@/lib/graficos/types";

type Props = {
  rubros: { id: GraficoWorkbookId; titulo: string }[];
  activo: GraficoWorkbookId;
  onChange: (id: GraficoWorkbookId) => void;
};

export function GraficosRubroTabs({ rubros, activo, onChange }: Props) {
  return (
    <div className="sticky top-0 z-20 -mx-6 border-b border-slate-200/80 bg-[#F8FAFC]/95 px-6 py-3 backdrop-blur-sm">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rubros.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            className={clsx(
              "shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition-all sm:px-4 sm:text-sm",
              activo === r.id
                ? "bg-green-600 text-white shadow-lg"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {RUBRO_TAB_LABELS[r.id] ?? r.titulo}
          </button>
        ))}
      </div>
    </div>
  );
}
