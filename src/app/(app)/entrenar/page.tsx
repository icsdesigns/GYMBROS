"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Info, Plus, Square, Timer, Lock, LockOpen, Trash2, TriangleAlert } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { api } from "@/trpc/react";
import { Button, Card, Input, Modal, Spinner, EmptyState, ProgressBar } from "@/components/ui";
import { WorkoutLauncher } from "@/components/workout-launcher";
import { RestTimer } from "@/components/rest-timer";
import { PendingSetsReview, type PendingExercise } from "@/components/pending-sets-review";
import { ProgressLegend } from "@/components/progress-legend";
import { StableMarkBadge, StableMarkLegend } from "@/components/stable-mark";
import { cn, MUSCLE_LABELS } from "@/lib/utils";
import { averageReps, repsLevel, LEVEL_STYLES } from "@/lib/progress";

export default function ActiveWorkoutPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: workout, isLoading } = api.workout.active.useQuery();
  const { data: catalog } = api.exercise.list.useQuery();
  const { data: marks } = api.workout.stableMarks.useQuery();
  const [finishOpen, setFinishOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<string[] | null>(null);
  // Desglose de todo lo que ha dado la sesión: series, fijo, PRs y racha
  const [earned, setEarned] = useState<Array<{ label: string; points: number }>>([]);
  // Series que se quedaron sin completar: se enseñan al terminar por si fue un despiste
  const [review, setReview] = useState<{
    workoutId: string;
    pending: PendingExercise[];
  } | null>(null);
  // Lo que cambió al corregirlas (null si no se tocó nada)
  const [corrected, setCorrected] = useState<number | null>(null);
  const [locked, setLocked] = useState(true);
  // Se pone a true cuando el usuario confirma que los valores raros son reales
  const [outliersOk, setOutliersOk] = useState(false);

  // Solo se pide al ir a terminar: hasta entonces los valores aún se están tocando
  const { data: outliers, isLoading: outliersLoading } = api.workout.outliers.useQuery(
    { workoutId: workout?.id ?? "" },
    { enabled: finishOpen && !!workout },
  );

  // Tocar cualquier valor rehace la comprobación y retira la confirmación ya
  // dada: lo confirmado valía para los números de entonces, no para los nuevos.
  const invalidate = () => {
    setOutliersOk(false);
    return Promise.all([utils.workout.active.invalidate(), utils.workout.outliers.invalidate()]);
  };
  const updateSet = api.workout.updateSet.useMutation({ onSuccess: invalidate });
  const addSet = api.workout.addSet.useMutation({ onSuccess: invalidate });
  const removeSet = api.workout.removeSet.useMutation({ onSuccess: invalidate });
  const addExercise = api.workout.addExercise.useMutation({
    onSuccess: () => {
      setAddOpen(false);
      invalidate();
    },
  });
  const cancel = api.workout.cancel.useMutation({
    onSuccess: () => {
      utils.invalidate();
      router.push("/panel");
    },
  });
  const finish = api.workout.finish.useMutation({
    onSuccess: (res) => {
      utils.invalidate();
      setFinishOpen(false);
      setResult(res.newPRs);
      setEarned(res.breakdown);
      setReview(res.pending.length > 0 ? { workoutId: res.workoutId, pending: res.pending } : null);
    },
  });

  if (isLoading) return <Spinner />;

  if (result) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="text-6xl">🎉</div>
        <h1 className="text-2xl font-bold">¡Entrenamiento guardado!</h1>
        {result.length > 0 && (
          <div className="space-y-1">
            <p className="font-medium text-gold">Nuevos PRs detectados:</p>
            {result.map((pr) => (
              <p key={pr} className="text-accent">🏆 {pr}</p>
            ))}
          </div>
        )}
        {earned.length > 0 && (
          <Card className="w-full max-w-md space-y-1.5 text-left text-sm">
            <p className="mb-1 font-semibold">Puntos de la sesión</p>
            {earned.map((l, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-muted">{l.label}</span>
                <span className="font-medium">+{l.points}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-1.5 font-semibold">
              <span>Total para el ranking</span>
              <span className="text-accent">+{earned.reduce((acc, l) => acc + l.points, 0)}</span>
            </div>
          </Card>
        )}
        {corrected !== null && (
          <p className="text-sm text-accent">
            Series corregidas{corrected !== 0 ? ` (${corrected > 0 ? "+" : ""}${corrected} puntos)` : ""}. Quedó
            registrado como la incidencia de esta sesión.
          </p>
        )}
        {review ? (
          <PendingSetsReview
            workoutId={review.workoutId}
            pending={review.pending}
            onDone={(delta) => {
              setReview(null);
              setCorrected(delta);
            }}
          />
        ) : (
          <Link href="/panel">
            <Button size="lg">Volver a inicio</Button>
          </Link>
        )}
      </div>
    );
  }

  if (!workout) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-8">
        <EmptyState
          icon="🏋️"
          title="No hay ningún entrenamiento en curso"
          subtitle="Registra tu entrenamiento eligiendo una de tus rutinas"
        />
        <WorkoutLauncher />
      </div>
    );
  }

  const grouped = (catalog ?? []).reduce<Record<string, NonNullable<typeof catalog>>>((acc, e) => {
    (acc[e.muscleGroup] ??= []).push(e);
    return acc;
  }, {});

  // Progreso del entrenamiento: series completadas sobre el total
  const totalSets = workout.exercises.reduce((acc, we) => acc + we.sets.length, 0);
  const doneSets = workout.exercises.reduce(
    (acc, we) => acc + we.sets.filter((s) => s.completed).length,
    0,
  );
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">
            {workout.routine ? `${workout.routine.emoji} ${workout.routine.name}` : "Entrenamiento libre"}
          </h1>
          <p className="flex items-center gap-1 text-sm text-muted">
            <Timer className="h-3.5 w-3.5" />
            Empezado hace {formatDistanceToNowStrict(workout.startedAt, { locale: es })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setInfoOpen(true)}
            aria-label="Cómo leer el entreno"
            title="Cómo leer el entreno"
            className="rounded-full border border-border bg-surface p-2 text-muted transition hover:border-accent/50 hover:text-accent"
          >
            <Info className="h-4 w-4" />
          </button>
          {/* El candado cierra la estructura del entreno —series y ejercicios—,
              no los datos: pesos, reps y completado se siguen tocando igual.
              Viene puesto: durante la sesión se pulsa a ciegas y era fácil
              añadir una serie de más sin querer. */}
          <Button
            variant={locked ? "primary" : "secondary"}
            size="sm"
            title={locked ? "Desbloquear series y ejercicios" : "Bloquear series y ejercicios"}
            onClick={() => setLocked((v) => !v)}
          >
            {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={locked}
            title={locked ? "Desbloquea el candado para añadir ejercicios" : "Añadir ejercicio"}
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Ejercicio</span>
          </Button>
        </div>
      </div>

      {/* Progreso del entrenamiento: se queda pegado arriba al hacer scroll,
          justo debajo de la cabecera fija del móvil, para no perderlo de vista
          en rutinas largas. El fondo es opaco porque debajo pasa contenido. */}
      <div className="sticky top-[3.5rem] z-30 -mx-4 bg-bg/85 px-4 py-2 backdrop-blur-xl md:top-0 md:-mx-8 md:px-8 md:py-3">
        <Card className="space-y-2 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Progreso</span>
            <span className="text-muted">{doneSets}/{totalSets} series · {pct}%</span>
          </div>
          <ProgressBar value={pct} />
        </Card>
      </div>

      <RestTimer />

      {locked && (
        <p className="flex items-center gap-1.5 text-xs text-accent">
          <Lock className="h-3.5 w-3.5" /> Entreno bloqueado: no se añaden ni se quitan series ni
          ejercicios. Pesos y repeticiones se editan con normalidad.
        </p>
      )}

      {workout.exercises.map((we) => {
        // Los ejercicios sin peso solo piden repeticiones: la columna de kg sobra
        const noWeight = we.exercise.noWeight;
        // El semáforo habla de subir o bajar peso: sin peso no aplica
        const avgReps = noWeight ? null : averageReps(we.sets);
        const exerciseLevel = repsLevel(avgReps);
        // Con el candado abierto aparece una columna más: la papelera
        const cols = noWeight
          ? locked
            ? "grid-cols-[2rem_1fr_2.5rem]"
            : "grid-cols-[2rem_1fr_2.5rem_2rem]"
          : locked
            ? "grid-cols-[2rem_1fr_1fr_2.5rem]"
            : "grid-cols-[2rem_1fr_1fr_2.5rem_2rem]";
        return (
        <Card key={we.id} className="relative space-y-2 overflow-hidden">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">
              {we.exercise.name}
              {noWeight && <span className="ml-2 text-xs font-normal text-muted">sin peso</span>}
            </p>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
              {!noWeight && <StableMarkBadge mark={marks?.[we.exercise.id]} />}
            </div>
          </div>
          <div className={cn("grid items-center gap-2 px-1 text-xs uppercase text-muted", cols)}>
            <span>#</span>{!noWeight && <span>Peso (kg)</span>}<span>Reps</span><span />
            {!locked && <span />}
          </div>
          {we.sets.map((s) => {
            const setLevel = noWeight ? null : repsLevel(s.reps);
            return (
            <div
              key={s.id}
              className={cn(
                "grid items-center gap-2 px-1 py-0.5",
                cols,
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  setLevel ? cn(LEVEL_STYLES[setLevel].solid, "shadow-sm") : "bg-surface-2 text-muted",
                )}
              >
                {s.setNumber}
              </span>
              {!noWeight && (
                <Input
                  type="number" min={0} step="any" defaultValue={s.weight || ""}
                  placeholder="0"
                  className={cn(!s.touched && "italic text-muted")}
                  onBlur={(e) => updateSet.mutate({ setId: s.id, weight: +e.target.value || 0 })}
                />
              )}
              <Input
                type="number" min={0} defaultValue={s.reps || ""}
                placeholder="0"
                className={cn(!s.touched && "italic text-muted")}
                onBlur={(e) => updateSet.mutate({ setId: s.id, reps: +e.target.value || 0 })}
              />
              <button
                onClick={() => updateSet.mutate({ setId: s.id, completed: !s.completed })}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition",
                  s.completed ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                <Check className="h-4 w-4" />
              </button>
              {!locked && (
                <button
                  onClick={() => removeSet.mutate({ setId: s.id })}
                  disabled={we.sets.length <= 1}
                  title="Quitar esta serie"
                  aria-label="Quitar esta serie"
                  className="flex h-9 w-8 items-center justify-center rounded-xl text-muted transition hover:text-red-400 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            );
          })}
          {!locked && (
            <Button size="sm" variant="ghost" onClick={() => addSet.mutate({ workoutExerciseId: we.id })}>
              <Plus className="h-3.5 w-3.5" /> Añadir serie
            </Button>
          )}
          {/* Franja del color de la media. Va al final: con space-y-2 el primer hijo
              no lleva margen y, si fuera ella, la cabecera bajaría 8 px. */}
          {exerciseLevel && (
            <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", LEVEL_STYLES[exerciseLevel].bar)} />
          )}
        </Card>
        );
      })}

      <div className="flex gap-2">
        <Button size="lg" className="flex-1" onClick={() => setFinishOpen(true)}>
          <Square className="h-4 w-4" /> Terminar entrenamiento
        </Button>
        <Button
          size="lg"
          variant="danger"
          onClick={() => {
            if (confirm("¿Descartar este entrenamiento? No se guardará nada.")) {
              cancel.mutate({ workoutId: workout.id });
            }
          }}
        >
          Descartar
        </Button>
      </div>

      {/* Antes de guardar, si alguna serie se dispara sobre lo de siempre se
          pregunta: es el último momento para cazar un 18 que era un 10. */}
      {(() => {
        const pending = (outliers ?? []).length > 0 && !outliersOk;
        return (
          <Modal
            open={finishOpen}
            onClose={() => setFinishOpen(false)}
            title={pending ? "¿Seguro que son estos valores?" : "Terminar entrenamiento"}
            footer={
              pending ? (
                <div className="flex w-full gap-2">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setFinishOpen(false)}
                  >
                    Corregir
                  </Button>
                  <Button size="lg" className="flex-1" onClick={() => setOutliersOk(true)}>
                    Sí, son correctos
                  </Button>
                </div>
              ) : (
                <Button
                  size="lg"
                  className="w-full"
                  loading={finish.isLoading}
                  disabled={outliersLoading}
                  onClick={() => finish.mutate({ workoutId: workout.id, notes: notes || undefined })}
                >
                  Guardar y terminar
                </Button>
              )
            }
          >
            {pending ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 text-sm text-muted">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  Estas series suben mucho respecto a tus últimas sesiones. Si te has colado al
                  teclear, corrígelo ahora: luego se cuela en tus medias y en tus PRs.
                </p>
                {(outliers ?? []).map((o) => (
                  <div
                    key={o.setId}
                    className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span>
                      {o.exercise} <span className="text-muted">· serie {o.setNumber}</span>
                    </span>
                    <span className="shrink-0">
                      <span className="font-semibold text-gold">{o.value} {o.unit}</span>
                      <span className="text-muted"> (antes {o.previous})</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Se guardarán las series marcadas como completadas y se detectarán tus nuevos PRs automáticamente.
                </p>
                <Input
                  value={notes}
                  placeholder="Comentarios (opcional)"
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}
          </Modal>
        );
      })()}

      <Modal open={infoOpen} onClose={() => setInfoOpen(false)} title="Cómo leer el entreno">
        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Semáforo de repeticiones
            </h3>
            {/* Semáforo: cada serie se rodea del color de sus repeticiones y cada
                ejercicio del de su media. Así se ve de un vistazo qué toca subir. */}
            <ProgressLegend />
          </section>
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Mejor marca estable
            </h3>
            <StableMarkLegend />
          </section>
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Valores en gris
            </h3>
            <p className="text-sm text-muted">
              Los valores <span className="italic">en gris</span> son los de tu última sesión; al
              editarlos o completar la serie pasan a esta.
            </p>
          </section>
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Añadir ejercicio">
        {/* El propio modal limita la altura y hace scroll */}
        <div className="space-y-3">
          {Object.entries(grouped).map(([group, exercises]) => (
            <div key={group}>
              <p className="mb-1 text-xs font-semibold uppercase text-muted">
                {MUSCLE_LABELS[group] ?? group}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {exercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => addExercise.mutate({ workoutId: workout.id, exerciseId: ex.id })}
                    className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm hover:bg-accent/20"
                  >
                    {ex.name}
                    {ex.noWeight && <span className="ml-1 text-xs text-muted">· sin peso</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
