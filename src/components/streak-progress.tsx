"use client";

import { Flame, Gem } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ui";

type Rule = { type: string; points: number; enabled: boolean };

/** Racha de semanas cumplidas. Solo el titular: cuántas llevas ahora mismo. */
export function StreakProgress({ streak, rules }: { streak: number; rules: Rule[] }) {
  const crackPoints = rules.find((r) => r.type === "STREAK_CRACK")?.points ?? 0;
  const isCrack = streak >= 5;

  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-2xl border border-orange-500/40 bg-[#0d0805] p-3.5">
      {/* Resplandor y rejilla */}
      <div
        className="pointer-events-none absolute -left-10 -top-14 h-40 w-40 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(249,115,22,0.35), transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(249,115,22,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,.6) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center bg-gradient-to-br shadow-[0_0_16px_-2px_rgba(249,115,22,0.8)]",
              isCrack ? "from-violet-300 to-violet-600" : "from-orange-300 to-orange-600",
            )}
            style={{ clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
          >
            {isCrack ? (
              <Gem className="h-4 w-4 text-[#1a0a2a]" />
            ) : (
              <Flame className="h-4 w-4 text-[#2a1200]" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-400">
              {isCrack ? "Nivel crack" : "Racha semanal"}
            </p>
            <p className="truncate text-base font-extrabold leading-tight text-orange-100">
              <CountUp value={streak} duration={500} /> {streak === 1 ? "semana" : "semanas"}
            </p>
          </div>
        </div>
        {isCrack && (
          <span className="shrink-0 rounded-full border border-violet-400/40 bg-violet-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-300">
            +{crackPoints}/sem 💎
          </span>
        )}
      </div>
    </div>
  );
}
