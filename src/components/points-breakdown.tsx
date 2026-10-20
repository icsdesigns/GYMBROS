"use client";

import { useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown } from "lucide-react";
import { api } from "@/trpc/react";
import { CountUp, Spinner } from "@/components/ui";
import { POINT_CATEGORIES, type CategoryTotals } from "@/lib/points";

const CATEGORY_EMOJI = Object.fromEntries(POINT_CATEGORIES.map((c) => [c.key, c.emoji]));

/** Cabecera legible de un día: «Hoy», «Ayer» o la fecha completa. */
function dayLabel(date: Date): string {
  if (isToday(date)) return "Hoy";
  if (isYesterday(date)) return "Ayer";
  return format(date, "EEEE d 'de' MMMM", { locale: es });
}

/**
 * Cartel de puntos (Inicio y perfiles): un cuadro por categoría —Series,
 * Asistencia, Progreso y Constancia— con sus puntos, y debajo un desplegable
 * con los puntos obtenidos por fecha.
 *
 * Las categorías vienen ya calculadas en Inicio; en un perfil ajeno se piden
 * aquí. El histórico por fecha se pide solo al desplegarlo: es información
 * secundaria y no merece una consulta extra en cada carga.
 */
export function PointsBreakdown({
  total,
  userId,
  categories,
}: {
  /** Desglose por tipo de punto (ya no se usa para pintar: las categorías lo sustituyen). */
  items?: Array<{ type: string; points: number; count: number }>;
  total: number;
  /** Perfil que se está mirando. Sin valor, el del propio usuario. */
  userId?: string;
  /** Puntos por categoría, si el llamador ya los tiene. */
  categories?: CategoryTotals;
}) {
  const [open, setOpen] = useState(false);
  const { data } = api.dashboard.pointsByCategory.useQuery({ userId }, { enabled: !categories });
  const totals = categories ?? data?.categories;

  if (!totals) return <Spinner />;
  if (total === 0) {
    return <p className="text-sm text-muted">Aún sin puntos. ¡Entrena para sumar! 💪</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {POINT_CATEGORIES.map((c) => (
          <div key={c.key} className="min-w-0 rounded-xl bg-surface-2 p-3" title={c.hint}>
            <p className="text-xs text-muted">
              <span aria-hidden>{c.emoji}</span> {c.title}
            </p>
            <p className="mt-1 text-xl font-bold leading-none text-accent">
              <CountUp value={totals[c.key].points} />
              <span className="ml-1 text-xs font-medium text-muted">pts</span>
            </p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
        <span>Total</span>
        <span className="text-accent"><CountUp value={total} /> pts</span>
      </div>

      <details
        className="gb-reveal group rounded-xl border border-border"
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Puntos por fecha
          <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border p-3">{open && <PointsTimeline userId={userId} />}</div>
      </details>
    </div>
  );
}

/** Historial día a día, con el detalle de cada día y su categoría. */
function PointsTimeline({ userId }: { userId?: string }) {
  const { data, isLoading } = api.dashboard.pointsHistory.useQuery({ userId, days: 90 });

  if (isLoading) return <Spinner />;
  if (!data || data.days.length === 0) {
    return <p className="text-sm text-muted">Sin puntos en los últimos 90 días.</p>;
  }

  // El servidor agrupa por día UTC; aquí se reagrupa por día local para que un
  // entreno de madrugada no parta «Hoy» en dos cabeceras
  const days: Array<{ key: string; date: Date; total: number; lines: (typeof data.days)[number]["lines"] }> = [];
  for (const line of data.days.flatMap((d) => d.lines)) {
    const key = format(line.date, "yyyy-MM-dd");
    let day = days.find((d) => d.key === key);
    if (!day) {
      day = { key, date: line.date, total: 0, lines: [] };
      days.push(day);
    }
    day.total += line.points;
    day.lines.push(line);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Últimos {data.sinceDays} días · {data.total} pts
      </p>
      {/* Alto limitado: se ven unas cuantas anotaciones y el resto llega con scroll */}
      <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
        {days.map((day) => (
          <div key={day.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1">
              <span className="min-w-0 text-xs font-semibold capitalize">{dayLabel(day.date)}</span>
              <span className="shrink-0 text-xs font-bold text-accent">+{day.total}</span>
            </div>
            {day.lines.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0 text-muted">
                  <span aria-hidden>{CATEGORY_EMOJI[l.category]}</span> {l.label}
                </span>
                <span className="shrink-0 text-muted">
                  {format(l.date, "HH:mm")} <span className="font-medium text-accent">+{l.points}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
