"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import type { TablaHistorico } from "@/lib/graficos/types";

type Props = {
  tablas: TablaHistorico[];
  accordion?: boolean;
};

function TablaBlock({ tabla }: { tabla: TablaHistorico }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 text-slate-600">
            {tabla.columnas.map((col) => (
              <th key={col} className="px-3 py-2 font-bold">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((fila, i) => (
            <tr key={`${tabla.titulo}-${i}`} className="border-b border-slate-50">
              {fila.map((cell, j) => (
                <td key={j} className="px-3 py-2 font-semibold text-slate-800 tabular-nums">
                  {typeof cell === "number"
                    ? cell.toLocaleString("es-AR", { maximumFractionDigits: 2 })
                    : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GraficoHistoricoTablas({ tablas, accordion = false }: Props) {
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set(tablas[0] ? [tablas[0].titulo] : []));

  if (!tablas.length) {
    return <p className="text-sm text-slate-400">Sin tablas históricas.</p>;
  }

  if (!accordion) {
    return (
      <div className="space-y-6">
        {tablas.map((t) => (
          <div key={t.titulo} className="overflow-x-auto rounded-2xl border border-slate-100">
            <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-700">
              {t.titulo}
            </p>
            <TablaBlock tabla={t} />
          </div>
        ))}
      </div>
    );
  }

  const toggle = (titulo: string) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(titulo)) next.delete(titulo);
      else next.add(titulo);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Detalle por período</p>
      {tablas.map((t) => {
        const open = openSet.has(t.titulo);
        return (
          <div key={t.titulo} className="overflow-hidden rounded-2xl border border-slate-100">
            <button
              type="button"
              onClick={() => toggle(t.titulo)}
              className="flex w-full items-center justify-between gap-2 bg-slate-50 px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-100"
            >
              <span>{t.titulo}</span>
              <ChevronDown className={clsx("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
            </button>
            {open && <TablaBlock tabla={t} />}
          </div>
        );
      })}
    </div>
  );
}
