"use client";

import Link from "next/link";
import { Anchor, ChevronRight } from "lucide-react";

type Overview = {
  /** Ejercicios con peso de las rutinas del usuario. */
  total: number;
  /** Con marca estable (verificada o no). */
  withMark: number;
  /** Con la marca verificada: el mismo peso logrado en 2 entrenos distintos. */
  verified: number;
  /** Los que aún necesitan verificarla. */
  pending: number;
};

/** Una cifra del cartel. */
function Score({
  value,
  total,
  label,
  highlight = false,
}: {
  value: number;
  total?: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex-1 rounded-xl border px-2 py-1.5 text-center ${
        highlight ? "border-amber-400/40 bg-amber-400/10" : "border-sky-400/25 bg-sky-400/5"
      }`}
    >
      <p className={`text-xl font-black leading-none ${highlight ? "text-amber-300" : "text-sky-300"}`}>
        {value}
        {total !== undefined && <span className="text-xs font-bold opacity-60">/{total}</span>}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-sky-100/75">{label}</p>
    </div>
  );
}

/**
 * Cartel de marcas estables de Inicio: cuántos ejercicios de tus rutinas ya
 * tienen marca, cuántos la tienen verificada y cuántos faltan. Solo se pinta
 * mientras quede algún ejercicio por verificar; con todo verificado no hay nada
 * que pedir. Lleva a Entrenamiento → Récords, donde está cada marca.
 */
export function StableMarksPanel({ overview }: { overview: Overview }) {
  if (overview.total === 0 || overview.pending === 0) return null;

  return (
    <Link href="/entrenamiento?tab=prs" className="group block">
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-sky-400/40 bg-[#050a0d] p-3.5 transition-all duration-300 hover:border-sky-400/70 hover:shadow-[0_0_28px_-6px_rgba(56,189,248,0.45)]">
        {/* Fondo: resplandor y rejilla sutil, como Temporada y Racha */}
        <div
          className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.3), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.6) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center bg-gradient-to-br from-sky-300 to-sky-600 shadow-[0_0_16px_-2px_rgba(56,189,248,0.8)]"
              style={{ clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
            >
              <Anchor className="h-4 w-4 text-[#031a26]" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-400">
                Marcas estables
              </p>
              <p className="truncate text-base font-extrabold leading-tight text-sky-100">
                {overview.pending === 1
                  ? "1 ejercicio por verificar"
                  : `${overview.pending} ejercicios por verificar`}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-sky-400/60 transition-transform group-hover:translate-x-0.5" />
        </div>

        <div className="relative flex items-stretch gap-1.5">
          <Score value={overview.withMark} total={overview.total} label="con marca" />
          <Score value={overview.verified} total={overview.total} label="verificadas" />
          <Score value={overview.pending} label="por verificar" highlight />
        </div>
      </div>
    </Link>
  );
}
