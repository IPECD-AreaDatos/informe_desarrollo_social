"use client";

import { clsx } from "clsx";

type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  activo: string;
  onChange: (id: string) => void;
};

export function GraficosVistaTabs({ tabs, activo, onChange }: Props) {
  if (tabs.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={clsx(
            "rounded-lg px-3 py-1.5 text-xs font-bold transition-all sm:text-sm",
            activo === t.id
              ? "bg-slate-700 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
