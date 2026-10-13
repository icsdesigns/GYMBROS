"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Search, Globe, Lock, ArrowUp, ArrowDown, Undo2 } from "lucide-react";
import { api } from "@/trpc/react";
import { Button, Card, Input, Label, Modal } from "@/components/ui";
import { MUSCLE_LABELS, cn } from "@/lib/utils";
import { matchesExercise } from "@/lib/exercise-search";
import type { MuscleGroup } from "@prisma/client";

const COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#ef4444", "#f59e0b", "#ec4899", "#14b8a6"];
const EMOJIS = ["💪", "🏋️", "🦵", "🔥", "⚡", "🐻", "🦍", "🚀"];

export type RoutineFormExercise = {
  exerciseId: string;
  name: string;
  /** El ejercicio no lleva carga: solo se registran repeticiones. */
  noWeight?: boolean;
  sets: number | null; // null = casilla vacía (se marca en rojo y no deja guardar)
  reps: number | null;
  targetWeight: number | null;
  restSeconds: number | null;
  notes: string | null;
};

export type RoutineFormValue = {
  name: string;
  description: string;
  color: string;
  emoji: string;
  recommendedDays: number[];
  timesPerWeek: number;
  estimatedMinutes: number | null;
  exercises: RoutineFormExercise[];
};

/** Rutina en blanco: punto de partida de "Nueva rutina". */
const BLANK_ROUTINE: RoutineFormValue = {
  name: "", description: "", color: "#22c55e", emoji: "💪",
  recommendedDays: [], timesPerWeek: 1, estimatedMinutes: 60, exercises: [],
};

export function RoutineForm({
  initial,
  routineId,
}: {
  initial?: RoutineFormValue;
  routineId?: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: catalog } = api.exercise.list.useQuery();
  const { data: me } = api.user.me.useQuery();

  // Estado de partida: lo guardado al editar, o en blanco al crear. Es a lo que
  // vuelve "Descartar cambios" y con lo que se mide si hay algo sin guardar.
  const baseline = initial ?? BLANK_ROUTINE;
  const [form, setForm] = useState<RoutineFormValue>(baseline);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const draftKey = `gymbros-routine-draft-${routineId ?? "nueva"}`;
  const draftLoaded = useRef(false);

  // Recuperar el borrador si se cerró la app o se cambió de apartado a mitad
  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as RoutineFormValue;
        // Un borrador idéntico al estado de partida no es un cambio que recuperar
        if (
          draft && typeof draft.name === "string" && Array.isArray(draft.exercises) &&
          JSON.stringify(draft) !== JSON.stringify(baseline)
        ) {
          setForm(draft);
          setDraftRestored(true);
        }
      }
    } catch {
      /* borrador ilegible: se ignora */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoguardado del borrador con cada cambio
  useEffect(() => {
    if (!draftLoaded.current) return;
    const t = setTimeout(() => {
      try {
        // Sin cambios no se guarda borrador: así no queda uno idéntico al original
        if (JSON.stringify(form) === JSON.stringify(baseline)) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify(form));
      } catch {
        /* almacenamiento lleno: se ignora */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form, draftKey]);

  // ¿Hay cambios sin guardar respecto al estado de partida?
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  /** Devuelve la rutina a como estaba antes de editarla, sin guardar nada. */
  function discardChanges() {
    if (dirty && !confirm("¿Descartar los cambios? La rutina vuelve a como estaba antes de editarla.")) return;
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* sin memoria del dispositivo: no hay borrador que borrar */
    }
    setForm(baseline);
    setDraftRestored(false);
  }

  const [newExercise, setNewExercise] = useState({
    name: "",
    muscleGroup: "PECHO" as MuscleGroup,
    noWeight: false,
  });

  const onSuccess = async () => {
    localStorage.removeItem(draftKey);
    await Promise.all([
      utils.routine.invalidate(),
      utils.plan.get.invalidate(),
      utils.dashboard.summary.invalidate(),
      utils.user.me.invalidate(),
    ]);
    router.push("/rutinas");
  };
  const create = api.routine.create.useMutation({ onSuccess });
  const update = api.routine.update.useMutation({ onSuccess });
  const createExercise = api.exercise.create.useMutation({
    onSuccess: async (created) => {
      await utils.exercise.list.invalidate();
      addExercise(created.id, created.name, created.noWeight);
      setNewExercise({ name: "", muscleGroup: "PECHO", noWeight: false });
    },
  });
  // Marcar un ejercicio como "sin peso" afecta al catálogo, así que se refleja
  // al momento en todas las filas que lo usan.
  const setNoWeight = api.exercise.setNoWeight.useMutation({
    onSuccess: (updated) => {
      void utils.exercise.list.invalidate();
      setForm((f) => ({
        ...f,
        exercises: f.exercises.map((e) =>
          e.exerciseId === updated.id
            ? { ...e, noWeight: updated.noWeight, targetWeight: updated.noWeight ? null : e.targetWeight }
            : e,
        ),
      }));
    },
  });

  function addExercise(exerciseId: string, name: string, noWeight = false) {
    setForm((f) => ({
      ...f,
      exercises: [
        ...f.exercises,
        { exerciseId, name, noWeight, sets: 3, reps: 10, targetWeight: null, restSeconds: 90, notes: null },
      ],
    }));
    setPickerOpen(false);
  }

  function moveExercise(index: number, direction: "up" | "down") {
    setForm((f) => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= f.exercises.length) return f;
      const exercises = [...f.exercises];
      const [moved] = exercises.splice(index, 1);
      exercises.splice(target, 0, moved!);
      return { ...f, exercises };
    });
  }

  function updateExercise(index: number, patch: Partial<RoutineFormExercise>) {
    setForm((f) => ({
      ...f,
      exercises: f.exercises.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    }));
  }

  function submit() {
    const payload = {
      name: form.name,
      description: form.description || null,
      color: form.color,
      emoji: form.emoji,
      recommendedDays: form.recommendedDays,
      timesPerWeek: form.timesPerWeek,
      estimatedMinutes: form.estimatedMinutes,
      exercises: form.exercises.map((e) => ({
        exerciseId: e.exerciseId, sets: e.sets ?? 1, reps: e.reps ?? 1,
        targetWeight: e.targetWeight, restSeconds: e.restSeconds, notes: e.notes,
      })),
    };
    if (routineId) update.mutate({ id: routineId, ...payload });
    else create.mutate(payload);
  }

  // El catálogo manda sobre lo guardado en el borrador: si el ejercicio se
  // marcó como "sin peso" después, la fila se entera igualmente.
  const catalogById = new Map((catalog ?? []).map((e) => [e.id, e]));
  const isNoWeight = (exerciseId: string, fallback?: boolean) =>
    catalogById.get(exerciseId)?.noWeight ?? fallback ?? false;
  const canEditNoWeight = (exerciseId: string) => {
    const ex = catalogById.get(exerciseId);
    if (!ex) return false;
    return ex.createdById !== null || me?.role === "ADMIN";
  };

  const filteredCatalog = (catalog ?? []).filter((e) => matchesExercise(e.name, search));
  const grouped = filteredCatalog.reduce<Record<string, typeof catalog>>((acc, e) => {
    (acc[e.muscleGroup] ??= [] as NonNullable<typeof catalog>).push(e);
    return acc;
  }, {});

  // Qué falta para poder guardar la rutina
  const missing: string[] = [];
  if (form.name.trim().length < 2) missing.push("el nombre de la rutina (mínimo 2 caracteres)");
  if (form.exercises.length === 0) missing.push("añadir al menos un ejercicio");
  if (form.exercises.some((e) => e.sets === null || e.reps === null))
    missing.push("completar las series y repeticiones marcadas en rojo");
  const mutationError = create.error ?? update.error;

  return (
    <div className="space-y-5">
      {draftRestored && (
        <Card className="flex items-center justify-between gap-3 border-amber-400/40 bg-amber-400/5 py-3">
          <p className="text-sm">Se recuperó un borrador sin guardar.</p>
          <Button size="sm" variant="ghost" onClick={discardChanges}>
            <Undo2 className="h-3.5 w-3.5" /> Descartar cambios
          </Button>
        </Card>
      )}

      {/* Transparencia: qué ve el grupo y qué no */}
      <Card className="flex flex-col gap-1.5 border-accent/20 bg-accent/5 py-3 text-xs">
        <p className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span><strong>Público:</strong> ejercicios, series y repeticiones.</span>
        </p>
        <p className="flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span><strong>Privado:</strong> pesos, notas y volumen.</span>
        </p>
      </Card>

      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Nombre</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Push día 1, Pierna, Full body…"
            />
          </div>
          <div>
            <Label>Duración estimada (min)</Label>
            <Input
              type="number"
              min={5}
              value={form.estimatedMinutes ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, estimatedMinutes: e.target.value ? +e.target.value : null }))
              }
            />
          </div>
          <div>
            <Label>Veces por semana</Label>
            <select
              value={form.timesPerWeek}
              onChange={(e) => setForm((f) => ({ ...f, timesPerWeek: +e.target.value }))}
              className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm"
            >
              {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "No cuenta para el plan" : `${n} ${n === 1 ? "día" : "días"} / semana`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Se añade a tu plan automáticamente; ordénala en Entrenamiento → Plan.
            </p>
          </div>
        </div>
        <div>
          <Label>Descripción</Label>
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Opcional"
          />
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <Label>Color</Label>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={cn("h-7 w-7 rounded-full transition", form.color === c && "ring-2 ring-fg ring-offset-2 ring-offset-surface")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <Label>Icono</Label>
            <div className="flex gap-1">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, emoji: e }))}
                  className={cn("rounded-lg p-1.5 text-xl transition", form.emoji === e ? "bg-accent/20" : "hover:bg-surface-2")}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold">Ejercicios ({form.exercises.length})</h2>

        {form.exercises.map((e, i) => (
          <Card key={`${e.exerciseId}-${i}`} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{i + 1}. {e.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" disabled={i === 0} title="Subir"
                  onClick={() => moveExercise(i, "up")}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" disabled={i === form.exercises.length - 1} title="Bajar"
                  onClick={() => moveExercise(i, "down")}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400"
                  title="Quitar ejercicio"
                  onClick={() =>
                    setForm((f) => ({ ...f, exercises: f.exercises.filter((_, j) => j !== i) }))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label>Series</Label>
                <Input
                  type="number" min={1} value={e.sets ?? ""}
                  className={cn(e.sets === null && "border-red-500 focus:ring-red-500/60")}
                  onChange={(ev) =>
                    updateExercise(i, { sets: ev.target.value === "" ? null : Math.max(1, Math.floor(+ev.target.value) || 1) })
                  }
                />
              </div>
              <div>
                <Label>Reps</Label>
                <Input
                  type="number" min={1} value={e.reps ?? ""}
                  className={cn(e.reps === null && "border-red-500 focus:ring-red-500/60")}
                  onChange={(ev) =>
                    updateExercise(i, { reps: ev.target.value === "" ? null : Math.max(1, Math.floor(+ev.target.value) || 1) })
                  }
                />
              </div>
              <div>
                <Label>Peso (kg) — opcional</Label>
                {isNoWeight(e.exerciseId, e.noWeight) ? (
                  <p className="flex h-10 items-center rounded-xl border border-dashed border-border px-3 text-sm text-muted">
                    Sin peso
                  </p>
                ) : (
                  <Input type="number" min={0} step="0.5" value={e.targetWeight ?? ""}
                    placeholder="—"
                    onChange={(ev) => updateExercise(i, { targetWeight: ev.target.value ? +ev.target.value : null })} />
                )}
              </div>
              <div>
                <Label>Descanso (s) — opcional</Label>
                <Input type="number" min={0} step={15} value={e.restSeconds ?? ""}
                  placeholder="—"
                  onChange={(ev) => updateExercise(i, { restSeconds: ev.target.value ? +ev.target.value : null })} />
              </div>
            </div>
            <label
              className="flex items-center gap-2 text-xs text-muted"
              title={
                canEditNoWeight(e.exerciseId)
                  ? "Los ejercicios sin peso solo piden repeticiones y su progreso se mide en reps"
                  : "Solo un admin puede cambiarlo en los ejercicios del catálogo general"
              }
            >
              <input
                type="checkbox"
                checked={isNoWeight(e.exerciseId, e.noWeight)}
                disabled={!canEditNoWeight(e.exerciseId) || setNoWeight.isLoading}
                onChange={(ev) => setNoWeight.mutate({ id: e.exerciseId, noWeight: ev.target.checked })}
                className="h-3.5 w-3.5 accent-[hsl(var(--accent))] disabled:opacity-40"
              />
              Este ejercicio no se hace con peso (solo repeticiones)
            </label>
            <Input
              value={e.notes ?? ""}
              placeholder="Notas (opcional)"
              onChange={(ev) => updateExercise(i, { notes: ev.target.value || null })}
            />
          </Card>
        ))}

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => { setSearch(""); setPickerOpen(true); }}
        >
          <Plus className="h-4 w-4" /> Añadir ejercicio
        </Button>
      </div>

      <div className="space-y-2">
        {missing.length > 0 && (
          <p className="text-sm text-amber-400">
            Para {routineId ? "guardar" : "crear"} la rutina falta: {missing.join(" y ")}.
          </p>
        )}
        {mutationError && (
          <p className="text-sm text-red-400">Error al guardar: {mutationError.message}</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={missing.length > 0}
            loading={create.isLoading || update.isLoading}
            onClick={submit}
          >
            {routineId ? "Guardar cambios" : "Crear rutina"}
          </Button>
          {/* Solo aparece si se ha tocado algo: sin cambios no hay nada que descartar */}
          {dirty && (
            <Button
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={create.isLoading || update.isLoading}
              onClick={discardChanges}
            >
              <Undo2 className="h-4 w-4" /> Descartar cambios
            </Button>
          )}
        </div>
      </div>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Añadir ejercicio">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              autoFocus
              value={search}
              placeholder="Buscar en español o inglés: banca, squat, curl…"
              className="pl-9"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {filteredCatalog.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">
                Sin resultados para «{search}». Puedes crearlo abajo. 👇
              </p>
            )}
            {Object.entries(grouped).map(([group, exercises]) => (
              <div key={group}>
                <p className="mb-1 text-xs font-semibold uppercase text-muted">
                  {MUSCLE_LABELS[group] ?? group}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {exercises?.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => addExercise(ex.id, ex.name, ex.noWeight)}
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
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-sm font-medium">¿No está en la lista? Créalo:</p>
            <div className="flex gap-2">
              <Input
                value={newExercise.name}
                placeholder="Nombre del ejercicio"
                onChange={(e) => setNewExercise((n) => ({ ...n, name: e.target.value }))}
              />
              <select
                value={newExercise.muscleGroup}
                onChange={(e) => setNewExercise((n) => ({ ...n, muscleGroup: e.target.value as MuscleGroup }))}
                className="h-10 rounded-xl border border-border bg-surface-2 px-2 text-sm"
              >
                {Object.entries(MUSCLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <Button
                size="md"
                disabled={newExercise.name.length < 2}
                loading={createExercise.isLoading}
                onClick={() => createExercise.mutate(newExercise)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={newExercise.noWeight}
                onChange={(e) => setNewExercise((n) => ({ ...n, noWeight: e.target.checked }))}
                className="h-3.5 w-3.5 accent-[hsl(var(--accent))]"
              />
              No se hace con peso (dominadas, plancha, cardio…)
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
