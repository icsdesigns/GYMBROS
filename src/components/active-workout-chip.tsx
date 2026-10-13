"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Acceso al entrenamiento en curso desde cualquier pantalla, integrado en la
 * cabecera de la app (móvil) y en la barra lateral (escritorio).
 *
 * Salir de /entrenar a mirar una rutina o el ranking era un viaje de ida sin
 * vuelta clara; esta etiqueta aparece mientras haya una sesión abierta y
 * desaparece en cuanto se termina o si ya estás en ella. Sustituye al botón
 * flotante y arrastrable de antes, que tapaba contenido.
 */

/** A las 3 horas el servidor cierra el entreno solo: la etiqueta ya no pinta nada. */
const MAX_WORKOUT_MS = 3 * 60 * 60 * 1000;

/** Cada cuánto se refresca el cronómetro. */
const TICK_MS = 30_000;

function elapsedLabel(from: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - from.getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${String(mins % 60).padStart(2, "0")}m`;
}

export function ActiveWorkoutChip({
  variant = "header",
  className,
}: {
  /** "header": píldora compacta para la cabecera. "sidebar": tarjeta pequeña de la barra lateral. */
  variant?: "header" | "sidebar";
  className?: string;
}) {
  const pathname = usePathname();
  const onWorkoutScreen = pathname === "/entrenar";

  // Se refresca sola al volver a la app: si el entreno se cerró en otro
  // dispositivo, la etiqueta no se queda colgada.
  const { data: workout } = api.workout.activeBadge.useQuery(undefined, {
    enabled: !onWorkoutScreen,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!workout) return;
    const id = setInterval(() => forceTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [workout]);

  // Lo que haya en caché puede ser de antes del cierre automático
  const expired = !!workout && Date.now() - workout.startedAt.getTime() > MAX_WORKOUT_MS;
  if (onWorkoutScreen || !workout || expired) return null;

  const pct = workout.totalSets > 0 ? Math.round((workout.doneSets / workout.totalSets) * 100) : 0;
  const name = workout.routine ? `${workout.routine.emoji} ${workout.routine.name}` : "Entreno libre";

  const icon = (
    <span className="relative flex shrink-0 items-center justify-center">
      <Dumbbell className={variant === "header" ? "h-4 w-4" : "h-5 w-5"} />
      {/* Latido que delata que hay algo abierto sin llegar a molestar */}
      <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-accent" />
    </span>
  );

  if (variant === "sidebar") {
    return (
      <Link
        href="/entrenar"
        aria-label="Volver al entrenamiento en curso"
        className={cn(
          "mb-4 block rounded-xl border border-accent/40 bg-accent/10 p-2.5 text-accent transition hover:bg-accent/15",
          className,
        )}
      >
        <span className="flex items-center gap-2">
          {icon}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em]">
              Entreno en curso · {elapsedLabel(workout.startedAt)}
            </span>
            <span className="block truncate text-sm font-bold text-fg">{name}</span>
          </span>
        </span>
        {workout.totalSets > 0 && (
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-accent/20">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href="/entrenar"
      aria-label={`Volver al entrenamiento en curso: ${name}, ${elapsedLabel(workout.startedAt)}`}
      title={`Entreno en curso: ${name}`}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent transition active:scale-95",
        className,
      )}
    >
      {icon}
      <span>{elapsedLabel(workout.startedAt)}</span>
      {workout.totalSets > 0 && <span className="hidden opacity-80 min-[420px]:inline">· {pct}%</span>}
    </Link>
  );
}
