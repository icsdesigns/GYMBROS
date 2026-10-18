"use client";

import type { CSSProperties, ReactNode } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Anchor, Trophy } from "lucide-react";
import { api } from "@/trpc/react";
import { Spinner, EmptyState } from "@/components/ui";
import { StableMarkLegend, StableMarkStatus } from "@/components/stable-mark";
import { STABLE_MARK_MIN_REPS } from "@/lib/stable-mark";
import { cn } from "@/lib/utils";

/** Tope de pasos de la entrada escalonada: con muchos ejercicios el retardo no crece más. */
const MAX_STAGGER = 8;

const kg = (w: number) => `${w.toLocaleString("es-ES")} kg`;
const stagger = (step: number) => ({ "--gb-i": Math.min(step, MAX_STAGGER) }) as CSSProperties;

/** Recuadro de uno de los dos parámetros (PR o marca estable), con la misma jerarquía. */
function Panel({
  icon,
  label,
  tone,
  className,
  children,
}: {
  icon: ReactNode;
  label: string;
  tone?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-surface-2 p-2.5", className)}>
      <p className={cn("flex items-center gap-1 text-[11px] font-medium text-muted", tone)}>
        {icon}
        <span className="truncate">{label}</span>
      </p>
      {children}
    </div>
  );
}

/**
 * Récords personales: para cada rutina, de cada uno de sus ejercicios, el PR
 * (peso, reps de esa serie y peso total de la serie) y la mejor marca estable
 * con su estado de verificación. Todo se detecta solo al terminar un
 * entrenamiento, así que aquí no hay nada que rellenar: solo mirar.
 */
export function PRsView() {
  const { data: groups, isLoading } = api.pr.byRoutine.useQuery();

  if (isLoading) return <Spinner />;

  if (!groups || groups.length === 0) {
    return (
      <EmptyState
        icon="🏆"
        title="Aún no tienes récords"
        subtitle="Entrena y los detectaremos automáticamente al terminar la sesión"
      />
    );
  }

  // Paso de entrada de cada título y tarjeta, correlativo en toda la página
  let step = 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Récords personales</h1>
      <StableMarkLegend />

      {groups.map((group) => {
        const headStep = step++;
        return (
          <section key={group.id} className="space-y-2">
            <h2 className="gb-rise font-semibold" style={stagger(headStep)}>
              {group.emoji} {group.name}
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.records.map((r) => {
                const { pr, mark } = r;
                return (
                  <article
                    key={r.exerciseId}
                    className="gb-rise min-w-0 rounded-2xl border bg-surface p-3"
                    style={{ borderColor: `${group.color}44`, ...stagger(step++) }}
                  >
                    <h3 className="truncate text-sm font-semibold" title={r.name}>
                      {r.name}
                    </h3>
                    <div className={cn("mt-2 grid gap-2", r.noWeight ? "grid-cols-1" : "grid-cols-2")}>
                      <Panel
                        icon={<Trophy className="h-3 w-3 shrink-0" aria-hidden />}
                        label="PR"
                        tone="text-accent"
                      >
                        {!pr ? (
                          <p className="mt-1 text-sm text-muted">Sin PR todavía</p>
                        ) : r.noWeight ? (
                          <>
                            <p className="mt-0.5 text-xl font-bold text-accent">
                              <span className="gb-pop">{pr.reps} reps</span>
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted">
                              {format(pr.date, "d MMM yyyy", { locale: es })}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="mt-0.5 text-xl font-bold text-accent">
                              <span className="gb-pop">{kg(pr.weight)}</span>
                            </p>
                            <p className="text-[11px] text-fg">
                              {pr.reps} {pr.reps === 1 ? "rep" : "reps"}
                              <span className="text-muted"> · serie </span>
                              <span className="font-semibold">{kg(pr.weight * pr.reps)}</span>
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted">
                              {format(pr.date, "d MMM yyyy", { locale: es })}
                            </p>
                          </>
                        )}
                      </Panel>

                      {!r.noWeight && (
                        <Panel
                          icon={<Anchor className="h-3 w-3 shrink-0" aria-hidden />}
                          label="Mejor marca estable"
                          tone={mark?.confirmed ? "text-sky-500 dark:text-sky-300" : undefined}
                        >
                          {mark ? (
                            <>
                              <p
                                className={cn(
                                  "mt-0.5 text-xl font-bold",
                                  mark.confirmed && "text-sky-500 dark:text-sky-300",
                                )}
                              >
                                <span className="gb-pop">{kg(mark.weight)}</span>
                              </p>
                              <StableMarkStatus mark={mark} className="mt-0.5" />
                              <p className="mt-1 text-[11px] text-muted">
                                {STABLE_MARK_MIN_REPS}+ reps · {mark.sessions}{" "}
                                {mark.sessions === 1 ? "entreno" : "entrenos"}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="mt-1 text-sm text-muted">Sin marca estable</p>
                              <p className="mt-0.5 text-[11px] text-muted">
                                {STABLE_MARK_MIN_REPS}+ reps en todas las series
                              </p>
                            </>
                          )}
                        </Panel>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
