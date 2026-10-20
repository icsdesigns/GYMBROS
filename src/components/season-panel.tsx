"use client";

import Link from "next/link";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Trophy, ChevronRight, Swords } from "lucide-react";
import { CountUp } from "@/components/ui";

/**
 * Periodo de una temporada en formato compacto: "15 ago – 14 nov · quedan 33 días".
 *
 * `to` es el límite exclusivo de la temporada (el día en que ya empieza la
 * siguiente), así que el último día que cuenta es el anterior. Los días son los
 * que quedan contando hoy, igual que `daysLeft` del servidor. Si la temporada
 * cruza de año, el año va en las dos fechas para que no haya dudas.
 *
 * Antes de empezar, "empieza el 15 ago · faltan 33 días" (`daysLeft` ya cuenta
 * los días que faltan para el arranque).
 */
export function seasonPeriodLabel(season: {
  started: boolean;
  from: Date;
  to: Date;
  daysLeft: number;
}): string {
  const last = addDays(season.to, -1);
  const crossesYear = season.from.getFullYear() !== last.getFullYear();
  const fmt = (d: Date) => format(d, crossesYear ? "d MMM yyyy" : "d MMM", { locale: es });
  const days = `${season.daysLeft} ${season.daysLeft === 1 ? "día" : "días"}`;
  if (!season.started) {
    return `empieza el ${fmt(season.from)} · ${season.daysLeft === 1 ? "falta" : "faltan"} ${days}`;
  }
  const left = season.daysLeft === 1 ? `queda ${days}` : `quedan ${days}`;
  return `${fmt(season.from)} – ${fmt(last)} · ${left}`;
}

type Season = {
  index: number;
  started: boolean;
  daysLeft: number;
  /** Primer día de la temporada y límite exclusivo del final. */
  from: Date;
  to: Date;
  myPoints: number;
  /** Puesto en la clasificación de la temporada; null si aún no puntuó. */
  position: number | null;
};

/** Una cifra del marcador de temporada. */
function Score({ value, label, className }: { value: React.ReactNode; label: string; className?: string }) {
  return (
    <div className="flex-1 rounded-xl border border-amber-400/25 bg-amber-400/5 px-2 py-1.5 text-center">
      <p className={`text-xl font-black leading-none text-amber-300 ${className ?? ""}`}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-amber-100/75">{label}</p>
    </div>
  );
}

/**
 * Marcador de la temporada en curso: tus puntos, tu puesto y lo que queda.
 * Lleva a Comunidad → Ranking → Temporada, donde está el detalle.
 */
export function SeasonPanel({ season }: { season: Season }) {
  const started = season.started;

  return (
    <Link href="/comunidad?tab=ranking&periodo=season" className="gb-press group block h-full">
      <div className="relative flex h-full flex-col justify-center gap-3 overflow-hidden rounded-2xl border border-gold/40 bg-[#0d0b06] p-3.5 transition-all duration-300 hover:border-gold/70 hover:shadow-[0_0_28px_-6px_rgba(251,191,36,0.45)]">
        {/* Fondo: resplandor y rejilla sutil */}
        <div
          className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(251,191,36,0.35), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(251,191,36,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,.6) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        {/* Cabecera: emblema y temporada */}
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center bg-gradient-to-br from-amber-300 to-amber-600 shadow-[0_0_16px_-2px_rgba(251,191,36,0.8)]"
              style={{ clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
            >
              {started ? (
                <Swords className="h-4 w-4 text-[#2a1c00]" />
              ) : (
                <Trophy className="h-4 w-4 text-[#2a1c00]" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-400">
                {started ? "Temporada en curso" : "Próxima temporada"}
              </p>
              <p className="truncate text-base font-extrabold leading-tight text-amber-100">
                {started ? `Temporada ${season.index}` : "Temporada 1"}
              </p>
              <p className="truncate text-[11px] leading-tight text-amber-100/70">
                {seasonPeriodLabel(season)}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-amber-400/60 transition-transform group-hover:translate-x-0.5" />
        </div>

        {/* Marcador: puntos, puesto y días restantes */}
        <div className="relative flex items-stretch gap-1.5">
          {started ? (
            <>
              <Score
                value={<CountUp value={season.myPoints} />}
                label="tus puntos"
                className="[text-shadow:0_0_14px_rgba(251,191,36,0.5)]"
              />
              <Score value={season.position ? `#${season.position}` : "—"} label="tu puesto" />
              <Score value={<CountUp value={season.daysLeft} duration={500} />} label="días" />
            </>
          ) : (
            <Score value={String(season.daysLeft)} label="días para empezar" />
          )}
        </div>
      </div>
    </Link>
  );
}
