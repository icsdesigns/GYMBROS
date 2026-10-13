"use client";

import { useState } from "react";
import { format, differenceInMinutes, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, Check, Trash2, Wrench, Info } from "lucide-react";
import { api } from "@/trpc/react";
import { Button, Card, Badge, Modal, EmptyState, Spinner } from "@/components/ui";
import { cn, formatKg } from "@/lib/utils";
import { repsLevel, LEVEL_STYLES } from "@/lib/progress";
import { ProgressLegend } from "@/components/progress-legend";
import { WorkoutIncidentModal } from "@/components/workout-incident-modal";

/**
 * Historial de entrenamientos: cada sesión terminada, desplegable, con sus
 * series. Desde aquí también se borra un día completo (entreno, puntos, PRs
 * automáticos y publicaciones que generó), que es la única vía que queda tras
 * retirar el apartado de asistencia.
 *
 * Cada serie completada lleva el color del semáforo de repeticiones (el mismo
 * de Entrenar). No hay media de reps por ejercicio: en Entrenar la sustituyó
 * la marca estable. Los ejercicios sin peso no entran: el semáforo habla de
 * subir o bajar kilos.
 */
export function WorkoutHistoryView() {
  const utils = api.useUtils();
  const [dayDetail, setDayDetail] = useState<Date | null>(null);
  // Sesión sobre la que se está abriendo una incidencia
  const [incident, setIncident] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const { data: workouts, isLoading } = api.workout.history.useQuery({ limit: 30 });
  const { data: day, isFetching: dayLoading } = api.attendance.day.useQuery(
    { date: dayDetail ?? new Date() },
    { enabled: dayDetail !== null },
  );

  const deleteDay = api.attendance.deleteDay.useMutation({
    onSuccess: () => {
      utils.attendance.invalidate();
      utils.workout.history.invalidate();
      utils.dashboard.summary.invalidate();
      utils.routine.stats.invalidate();
      utils.stats.invalidate();
      utils.pr.invalidate();
      setDayDetail(null);
    },
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Historial de entrenamientos</h2>
        <button
          onClick={() => setLegendOpen(true)}
          aria-label="Qué significan los colores de las series"
          title="Qué significan los colores de las series"
          className="shrink-0 rounded-full border border-border bg-surface p-2 text-muted transition hover:border-accent/50 hover:text-accent"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : workouts?.length === 0 ? (
        <EmptyState
          icon="📖"
          title="Aún no hay entrenamientos"
          subtitle="Cuando termines tu primera sesión aparecerá aquí"
        />
      ) : (
        workouts?.map((w) => (
          <details key={w.id} className="group rounded-2xl border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {w.routine ? `${w.routine.emoji} ${w.routine.name}` : "Entrenamiento libre"}
                </p>
                <p className="text-xs capitalize text-muted">
                  {format(w.startedAt, "EEEE d MMM yyyy", { locale: es })}
                  {w.endedAt ? ` · ${differenceInMinutes(w.endedAt, w.startedAt)} min` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {w.incidents.length > 0 && (
                  <Badge className="text-gold" title="Sesión corregida por incidencia">
                    <Wrench className="h-3 w-3" /> corregida
                  </Badge>
                )}
                <Badge>{formatKg(w.totalVolume)}</Badge>
                <Badge>{w.totalSets} series</Badge>
                <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
              </div>
            </summary>
            <div className="space-y-3 border-t border-border p-4 pt-3">
              {w.exercises.map((we) => (
                  <div key={we.id}>
                    <p className="mb-1 text-sm font-medium">{we.exercise.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {we.sets.map((s) => {
                        const level = we.exercise.noWeight || !s.completed ? null : repsLevel(s.reps);
                        return (
                          <span
                            key={s.id}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs",
                              !s.completed
                                ? "bg-surface-2 text-muted line-through"
                                : level
                                  ? cn(LEVEL_STYLES[level].chip, "ring-1 ring-inset", LEVEL_STYLES[level].ring)
                                  : "bg-accent/15 text-accent",
                            )}
                          >
                            {!we.exercise.noWeight && s.weight > 0 ? `${s.weight} kg × ` : ""}
                            {s.reps}
                            {s.completed && <Check className="h-3 w-3" />}
                          </span>
                        );
                      })}
                    </div>
                  </div>
              ))}
              {w.notes && <p className="text-xs text-muted">📝 {w.notes}</p>}
              {/* Lo que se corrigió, para que la sesión no cambie sin explicación */}
              {w.incidents.map((inc) => (
                <p key={inc.id} className="text-xs text-muted">
                  🔧 Corregida el {format(inc.createdAt, "d MMM yyyy", { locale: es })}
                  {inc.reason ? `: ${inc.reason}` : ""}
                  {inc.pointsDelta !== 0 && ` (${inc.pointsDelta > 0 ? "+" : ""}${inc.pointsDelta} puntos)`}
                </p>
              ))}
              <div className="flex flex-wrap gap-2">
                {/* Una incidencia por sesión: si ya la usó, el botón se apaga */}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={w.incidents.length > 0}
                  title={
                    w.incidents.length > 0
                      ? "Esta sesión ya se corrigió: solo se admite una incidencia"
                      : "Corregir lo que se anotó mal en esta sesión"
                  }
                  onClick={() => setIncident(w.id)}
                >
                  <Wrench className="h-3.5 w-3.5" /> Incidencia
                </Button>
                <Button
                  size="sm" variant="ghost" className="text-red-400"
                  onClick={() => setDayDetail(w.startedAt)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Borrar este día
                </Button>
              </div>
              {incident === w.id && (
                <WorkoutIncidentModal workout={w} open onClose={() => setIncident(null)} />
              )}
            </div>
          </details>
        ))
      )}

      <Modal open={legendOpen} onClose={() => setLegendOpen(false)} title="Semáforo de repeticiones">
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Cada serie completada de un ejercicio con peso se colorea según sus repeticiones.
            Los ejercicios sin peso no se colorean.
          </p>
          <ProgressLegend />
        </div>
      </Modal>

      <Modal
        open={dayDetail !== null}
        onClose={() => setDayDetail(null)}
        title={dayDetail ? format(dayDetail, "EEEE d 'de' MMMM yyyy", { locale: es }) : undefined}
        subtitle={isSameDay(dayDetail ?? new Date(), new Date()) ? "Es el día de hoy" : undefined}
        footer={
          <Button
            variant="danger"
            className="w-full"
            loading={deleteDay.isLoading}
            disabled={!day?.attendance && (day?.workouts.length ?? 0) === 0}
            onClick={() => {
              if (!dayDetail) return;
              if (confirm("¿Borrar este día y todo lo que generó? No se puede deshacer.")) {
                deleteDay.mutate({ date: dayDetail });
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Borrar el día y sus puntos
          </Button>
        }
      >
        {dayLoading && !day ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            {day?.attendance ? (
              <p className="text-sm text-muted">Día registrado como entrenado.</p>
            ) : (
              <p className="text-sm text-muted">Este día no tiene asistencia registrada.</p>
            )}

            {(day?.workouts.length ?? 0) === 0 ? (
              <p className="text-sm text-muted">Sin entrenamientos guardados en este día.</p>
            ) : (
              day?.workouts.map((w) => (
                <Card key={w.id} className="space-y-2 py-3">
                  <p className="text-sm font-medium">
                    {w.routine ? `${w.routine.emoji} ${w.routine.name}` : "Entrenamiento libre"}
                  </p>
                  <p className="text-xs text-muted">
                    {formatKg(w.totalVolume)} · {w.totalSets} series · {w.totalReps} reps
                  </p>
                  {w.exercises.map((we) => {
                    const done = we.sets.filter((s) => s.completed);
                    return (
                      <p key={we.id} className="text-xs text-muted">
                        {we.exercise.name}:{" "}
                        {done.length === 0
                          ? "sin series completadas"
                          : done.map((s, i) => {
                              const level = we.exercise.noWeight ? null : repsLevel(s.reps);
                              return (
                                <span key={s.id}>
                                  {i > 0 && " · "}
                                  <span className={cn(level && cn("font-semibold", LEVEL_STYLES[level].text))}>
                                    {we.exercise.noWeight ? `${s.reps}` : `${s.weight}×${s.reps}`}
                                  </span>
                                </span>
                              );
                            })}
                      </p>
                    );
                  })}
                </Card>
              ))
            )}

            <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-muted">
              Al borrar el día se eliminan la asistencia, sus entrenamientos y todo lo que
              generaron: puntos de asistencia, de entreno y de PR, los récords detectados
              automáticamente y las publicaciones del grupo. La racha se recalcula.
            </p>
          </div>
        )}
      </Modal>
    </section>
  );
}
