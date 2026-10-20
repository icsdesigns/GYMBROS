"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  Plus, Copy, Trash2, Download, FileDown, FileUp, Power, ArrowUp, ArrowDown,
} from "lucide-react";
import { api } from "@/trpc/react";
import { Button, Card, Spinner, EmptyState, Avatar } from "@/components/ui";
import { formatKg } from "@/lib/utils";

type ExportedRoutine = {
  gymbros: number;
  name: string;
  description: string | null;
  color: string;
  emoji: string;
  recommendedDays: number[];
  timesPerWeek?: number;
  estimatedMinutes: number | null;
  exercises: Array<{
    name: string;
    muscleGroup: string;
    sets: number;
    reps: number;
    targetWeight: number | null;
    restSeconds: number | null;
    notes: string | null;
  }>;
};

/**
 * Mi plan de entrenamiento: las rutinas en el orden en que se van encadenando.
 * El orden se fija aquí mismo con las flechas —no hay pantalla de plan aparte—
 * y cada rutina aparece en el plan tantas veces como sus «veces por semana».
 *
 * La duración, las series y los kg que muestra cada tarjeta son la MEDIA de las
 * sesiones terminadas a mano; mientras no haya ninguna, se enseña lo planificado.
 */
export function RoutinesView() {
  const utils = api.useUtils();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const { data: mine, isLoading } = api.routine.mine.useQuery();
  const { data: shared } = api.routine.shared.useQuery();
  const { data: stats } = api.routine.stats.useQuery();

  const invalidate = () => {
    utils.routine.invalidate();
    utils.plan.get.invalidate();
    utils.dashboard.summary.invalidate();
    utils.user.me.invalidate();
  };
  // Actualiza al instante un campo de una rutina en la lista «mías» y devuelve el estado previo para revertir
  const optimisticPatch = async (id: string, patch: Partial<NonNullable<typeof mine>[number]>) => {
    await utils.routine.mine.cancel();
    const previous = utils.routine.mine.getData();
    if (previous) {
      utils.routine.mine.setData(
        undefined,
        previous.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
    }
    return { previous };
  };
  const rollbackMine = (context?: { previous?: ReturnType<typeof utils.routine.mine.getData> }) => {
    if (context?.previous) utils.routine.mine.setData(undefined, context.previous);
  };

  const duplicate = api.routine.duplicate.useMutation({ onSuccess: invalidate });
  const remove = api.routine.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.routine.mine.cancel();
      const previous = utils.routine.mine.getData();
      if (previous) utils.routine.mine.setData(undefined, previous.filter((r) => r.id !== id));
      return { previous };
    },
    onError: (_err, _vars, context) => rollbackMine(context),
    onSettled: invalidate,
  });
  const clone = api.routine.clone.useMutation({ onSuccess: invalidate });
  const toggleInPlan = api.routine.toggleInPlan.useMutation({
    onMutate: ({ id }) => {
      const current = utils.routine.mine.getData()?.find((r) => r.id === id);
      return optimisticPatch(id, { inPlan: !current?.inPlan });
    },
    onError: (_err, _vars, context) => rollbackMine(context),
    onSettled: invalidate,
  });
  // Reordenación optimista: la lista se mueve al instante y el servidor confirma detrás
  const move = api.routine.move.useMutation({
    onMutate: async ({ id, direction }) => {
      await utils.routine.mine.cancel();
      const previous = utils.routine.mine.getData();
      if (previous) {
        const next = [...previous];
        const index = next.findIndex((r) => r.id === id);
        const target = direction === "up" ? index - 1 : index + 1;
        if (index !== -1 && target >= 0 && target < next.length) {
          const [moved] = next.splice(index, 1);
          next.splice(target, 0, moved!);
          utils.routine.mine.setData(undefined, next);
        }
      }
      return { previous };
    },
    onError: (_err, _vars, context) => rollbackMine(context),
    onSettled: invalidate,
  });
  const importRoutine = api.routine.importRoutine.useMutation({
    onSuccess: invalidate,
    onError: (e) => setImportError(e.message),
  });

  function exportRoutine(r: NonNullable<typeof mine>[number]) {
    const data: ExportedRoutine = {
      gymbros: 1,
      name: r.name,
      description: r.description,
      color: r.color,
      emoji: r.emoji,
      recommendedDays: r.recommendedDays,
      timesPerWeek: r.timesPerWeek,
      estimatedMinutes: r.estimatedMinutes,
      exercises: r.exercises.map((e) => ({
        name: e.exercise.name,
        muscleGroup: e.exercise.muscleGroup,
        sets: e.sets,
        reps: e.reps,
        targetWeight: e.targetWeight,
        restSeconds: e.restSeconds,
        notes: e.notes,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rutina-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(file: File) {
    setImportError(null);
    try {
      const parsed = JSON.parse(await file.text()) as Partial<ExportedRoutine>;
      if (!parsed.name || !Array.isArray(parsed.exercises) || parsed.exercises.length === 0) {
        throw new Error("El archivo no parece una rutina exportada de GymBros");
      }
      importRoutine.mutate({
        name: parsed.name,
        description: parsed.description ?? null,
        color: /^#[0-9a-fA-F]{6}$/.test(parsed.color ?? "") ? parsed.color! : "#22c55e",
        emoji: parsed.emoji ?? "💪",
        recommendedDays: (parsed.recommendedDays ?? []).filter((d) => d >= 0 && d <= 6),
        timesPerWeek: Math.min(7, Math.max(0, parsed.timesPerWeek ?? 1)),
        estimatedMinutes: parsed.estimatedMinutes ?? null,
        exercises: parsed.exercises.map((e) => ({
          name: String(e.name ?? "Ejercicio"),
          muscleGroup: (e.muscleGroup ?? "OTRO") as never,
          sets: e.sets ?? 3,
          reps: e.reps ?? 10,
          targetWeight: e.targetWeight ?? null,
          restSeconds: e.restSeconds ?? null,
          notes: e.notes ?? null,
        })),
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Archivo no válido");
    }
  }

  if (isLoading) return <Spinner />;

  const routines = mine ?? [];
  const statsOf = (routineId: string) => stats?.find((s) => s.routineId === routineId);
  // Días de la semana que ocupa el plan y los que quedan de descanso
  const trainingDays = Math.min(7, routines.reduce((acc, r) => acc + (r.inPlan ? r.timesPerWeek : 0), 0));
  const restDays = 7 - trainingDays;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold">Mi plan de entrenamiento</h1>
          <p className="text-sm text-muted">
            {trainingDays === 0
              ? "Sin días de entreno: pon «veces por semana» en tus rutinas."
              : `${trainingDays} ${trainingDays === 1 ? "día" : "días"} de entreno · ${restDays} de descanso 😴`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="secondary" title="Importar rutina"
            onClick={() => importInputRef.current?.click()}
            loading={importRoutine.isLoading}
          >
            <FileUp className="h-4 w-4" /> <span className="hidden sm:inline">Importar</span>
          </Button>
          <Link href="/rutinas/nueva">
            <Button title="Nueva rutina">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nueva rutina</span>
            </Button>
          </Link>
        </div>
      </div>

      {importError && <p className="text-sm text-red-400">Error al importar: {importError}</p>}

      {routines.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Todavía no tienes rutinas"
          subtitle="Crea tu primera rutina o clona una del grupo"
          action={
            <Link href="/rutinas/nueva">
              <Button>Crear rutina</Button>
            </Link>
          }
        />
      ) : (
        <div className="gb-stagger space-y-2">
          {routines.map((r, i) => {
            const s = statsOf(r.id);
            const real = (s?.sessions ?? 0) > 0;
            const minutes = real ? s!.avgMinutes : r.estimatedMinutes;
            const sets = real ? s!.avgSets : r.exercises.reduce((acc, e) => acc + e.sets, 0);
            return (
              <Card
                key={r.id}
                className="flex items-center gap-2 p-2.5"
                style={{ borderColor: `${r.color}44` }}
              >
                {/* Orden dentro del plan */}
                <div className="flex shrink-0 flex-col">
                  <button
                    title="Subir en el plan"
                    disabled={i === 0}
                    onClick={() => move.mutate({ id: r.id, direction: "up" })}
                    className="rounded-md px-1 text-muted transition hover:text-fg disabled:opacity-25"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Bajar en el plan"
                    disabled={i === routines.length - 1}
                    onClick={() => move.mutate({ id: r.id, direction: "down" })}
                    className="rounded-md px-1 text-muted transition hover:text-fg disabled:opacity-25"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <Link href={`/rutinas/${r.id}`} className="block">
                    <p className="flex items-center gap-1.5 truncate font-semibold leading-tight">
                      <span className="truncate">{r.emoji} {r.name}</span>
                    </p>
                    {r.description && (
                      <p className="truncate text-xs text-muted">{r.description}</p>
                    )}
                    <p
                      className="truncate text-xs text-muted"
                      title={
                        real
                          ? `Media de tus ${s!.sessions} ${s!.sessions === 1 ? "sesión terminada" : "sesiones terminadas"} a mano`
                          : "Valores planificados: aún no hay sesiones terminadas a mano"
                      }
                    >
                      {r.exercises.length} ejercicios
                      {r.timesPerWeek > 0 && ` · ×${r.timesPerWeek}/sem`}
                      {minutes ? ` · ${real ? "" : "~"}${minutes} min` : ""}
                      {sets > 0 && ` · ${sets} series`}
                      {real && s!.avgVolume > 0 && ` · ${formatKg(s!.avgVolume)}`}
                    </p>
                  </Link>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    title={r.inPlan ? "Deshabilitar: sacarla del plan" : "Habilitar: incluirla en el plan"}
                    onClick={() => toggleInPlan.mutate({ id: r.id })}
                    className={`mr-1 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition ${
                      r.inPlan
                        ? "border-accent/40 bg-accent/15 text-accent hover:bg-accent/25"
                        : "border-border bg-surface-2 text-muted hover:text-fg"
                    }`}
                  >
                    <Power className="h-3 w-3" />
                    <span className="hidden sm:inline">{r.inPlan ? "En el plan" : "Fuera"}</span>
                  </button>
                  <Button size="sm" variant="ghost" title="Duplicar" onClick={() => duplicate.mutate({ id: r.id })}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" title="Exportar a archivo" onClick={() => exportRoutine(r)}>
                    <FileDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Eliminar"
                    className="text-red-400"
                    onClick={() => {
                      if (confirm(`¿Eliminar la rutina "${r.name}"?`)) remove.mutate({ id: r.id });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {(shared?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Rutinas del grupo</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {shared?.map((r) => (
              <Card key={r.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">
                      {r.emoji} {r.name}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <Avatar name={r.user.name} src={r.user.avatarUrl} size={18} />
                      {r.user.name} · {r.exercises.length} ejercicios
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => clone.mutate({ id: r.id })}
                  loading={clone.isLoading}
                >
                  <Download className="h-3.5 w-3.5" /> Clonar a mis rutinas
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
