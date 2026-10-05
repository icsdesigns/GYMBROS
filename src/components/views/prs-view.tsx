"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { api } from "@/trpc/react";
import { Spinner, EmptyState } from "@/components/ui";
import { StableMarkBadge, StableMarkLegend } from "@/components/stable-mark";

/**
 * Récords personales: para cada rutina, la mejor marca de cada uno de sus
 * ejercicios. Las marcas se detectan solas al terminar un entrenamiento, así
 * que aquí no hay nada que rellenar: solo mirar.
 */
export function PRsView() {
  const { data: groups, isLoading } = api.pr.byRoutine.useQuery();
  const { data: marks } = api.workout.stableMarks.useQuery();

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Récords personales</h1>
      <StableMarkLegend />

      {groups.map((group) => (
        <section key={group.id} className="space-y-2">
          <h2 className="font-semibold">
            {group.emoji} {group.name}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {group.records.map((r) => (
              <div
                key={r.exerciseId}
                className="rounded-2xl border bg-surface p-3"
                style={{ borderColor: `${group.color}44` }}
              >
                <p className="truncate text-xs font-medium text-muted" title={r.name}>
                  {r.name}
                </p>
                <p className="text-xl font-bold text-accent">
                  {r.noWeight ? `${r.reps} reps` : `${r.weight} kg`}
                </p>
                <p className="text-[11px] text-muted">
                  {r.noWeight ? "" : `× ${r.reps} · `}
                  {format(r.date, "d MMM yyyy", { locale: es })}
                </p>
                {!r.noWeight && marks?.[r.exerciseId] && (
                  <StableMarkBadge mark={marks[r.exerciseId]} className="mt-1.5" inline />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
