"use client";

import { getISODay } from "date-fns";
import { Anchor, CalendarRange, Flame, Swords, Trophy, AlertTriangle } from "lucide-react";
import { api } from "@/trpc/react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

const WEEK_DAYS = ["L", "M", "X", "J", "V", "S", "D"] as const;

/** Mini-tarjeta con una cifra y su contexto. */
function Tile({
  icon,
  label,
  value,
  sub,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  className?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-2.5">
      <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className={cn("mt-0.5 truncate text-lg font-bold leading-tight", className)}>{value}</p>
      {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

/**
 * Resumen estilo Inicio de un miembro del grupo: su semana (días entrenados
 * frente al objetivo), racha, temporada, último año y marcas estables. Solo
 * cifras: ningún peso sale del servidor.
 */
export function MemberHome({ userId, name }: { userId: string; name: string }) {
  const { data } = api.user.memberHome.useQuery({ userId });
  if (!data) return null;

  const firstName = name.split(" ")[0];
  const { week, streak, season, marks } = data;
  const trained = new Set(week.dates.map((d) => getISODay(d)));
  const done = week.dates.length;
  const target = week.target;
  const weekDone = target > 0 && done >= target;

  return (
    <Card className="space-y-3">
      {/* Semana en curso */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarRange className="h-4 w-4 text-accent" /> Su semana
          </h2>
          <span className={cn("text-sm font-bold", weekDone ? "text-accent" : "text-fg")}>
            {done}
            {target > 0 && <span className="text-muted">/{target}</span>}{" "}
            <span className="text-xs font-normal text-muted">{done === 1 ? "entreno" : "entrenos"}</span>
          </span>
        </div>
        <div className="gb-stagger grid grid-cols-7 gap-1">
          {WEEK_DAYS.map((label, i) => {
            const on = trained.has(i + 1);
            return (
              <div
                key={label}
                className={cn(
                  "flex h-8 items-center justify-center rounded-lg text-xs font-semibold",
                  on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
                )}
                aria-label={`${label}: ${on ? "entrenó" : "sin entreno"}`}
              >
                {label}
              </div>
            );
          })}
        </div>
        {streak.atRisk && streak.missing >= streak.daysLeft && (
          <p className="flex items-start gap-1.5 text-xs text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Racha en peligro: a {firstName} le {streak.missing === 1 ? "queda" : "quedan"} {streak.missing}{" "}
            {streak.missing === 1 ? "entreno" : "entrenos"} y {streak.daysLeft}{" "}
            {streak.daysLeft === 1 ? "día" : "días"} de semana.
          </p>
        )}
      </div>

      <div className="gb-stagger grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile
          icon={<Flame className="h-3 w-3 shrink-0 text-orange-400" />}
          label="Racha"
          value={`${streak.current} sem.`}
          sub={`Mejor: ${streak.best} ${streak.best === 1 ? "semana" : "semanas"}`}
          className="text-orange-400"
        />
        {season.started ? (
          <Tile
            icon={<Swords className="h-3 w-3 shrink-0 text-gold" />}
            label={`Temporada ${season.index}`}
            value={`${season.points} pts`}
            sub={season.position ? `Puesto #${season.position} de ${season.players}` : "Aún sin puntos"}
            className="text-gold"
          />
        ) : (
          <Tile
            icon={<Trophy className="h-3 w-3 shrink-0 text-gold" />}
            label="Temporada"
            value="Sin empezar"
            sub={`Faltan ${season.daysLeft} ${season.daysLeft === 1 ? "día" : "días"}`}
          />
        )}
        <Tile
          icon={<CalendarRange className="h-3 w-3 shrink-0" />}
          label="Último año"
          value={`${data.yearAttendances} ${data.yearAttendances === 1 ? "entreno" : "entrenos"}`}
          sub={`${data.monthlyAvgWorkouts.toLocaleString("es-ES", { maximumFractionDigits: 1 })} al mes`}
        />
        <Tile
          icon={<Anchor className="h-3 w-3 shrink-0 text-sky-500 dark:text-sky-300" />}
          label="Marcas estables"
          value={marks.total > 0 ? `${marks.verified}/${marks.total}` : "—"}
          sub={
            marks.total > 0
              ? `verificadas · ${marks.withMark} con marca`
              : "Sin ejercicios con peso"
          }
          className="text-sky-500 dark:text-sky-300"
        />
      </div>
    </Card>
  );
}
