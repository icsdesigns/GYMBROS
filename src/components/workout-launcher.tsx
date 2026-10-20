"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { Dumbbell, RefreshCw, ChevronRight } from "lucide-react";
import { api } from "@/trpc/react";
import { Button, Modal, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Botón central del flujo de entrenamiento (visible en Panel y Entrenamiento):
 * - Sin sesión activa (verde): abre un modal que obliga a elegir una rutina
 *   guardada y pulsar "Iniciar entrenamiento".
 * - Con sesión activa (naranja): pasa a "Actualizar entrenamiento" y lleva a la
 *   pantalla donde se actualizan pesos/series y se puede finalizar.
 * Si se olvida finalizar, el servidor cierra la sesión a las 3 horas.
 */
export function WorkoutLauncher({ className }: { className?: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: active } = api.workout.active.useQuery();
  const { data: routines } = api.routine.mine.useQuery();
  const { data: plan } = api.plan.get.useQuery();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const start = api.workout.start.useMutation({
    onSuccess: () => {
      utils.workout.active.invalidate();
      utils.dashboard.summary.invalidate();
      setOpen(false);
      router.push("/entrenar");
    },
  });

  if (active) {
    return (
      <button
        onClick={() => router.push("/entrenar")}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-4 text-left text-white shadow-lg transition hover:brightness-110 motion-safe:active:scale-[0.97]",
          className,
        )}
      >
        <span className="flex items-center gap-3">
          <RefreshCw className="h-6 w-6" />
          <span>
            <span className="block font-bold">Actualizar entrenamiento</span>
            <span className="block text-sm text-white/80">
              {active.routine ? `${active.routine.emoji} ${active.routine.name} · ` : ""}
              en curso desde hace {formatDistanceToNowStrict(active.startedAt, { locale: es })}
            </span>
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0" />
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => {
          // Preselecciona la rutina que toca según el plan
          const suggested =
            plan && plan.slots.length > 0 ? plan.slots[plan.position]?.routine?.id ?? null : null;
          setSelected(suggested);
          setOpen(true);
        }}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 px-5 py-4 text-left text-white shadow-lg transition hover:brightness-110 motion-safe:active:scale-[0.97] motion-safe:animate-pulse-glow",
          className,
        )}
      >
        <span className="flex items-center gap-3">
          <Dumbbell className="h-6 w-6" />
          <span className="font-bold">Registrar entrenamiento</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="¿Qué rutina vas a entrenar?"
        footer={
          (routines?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <Button
                size="lg"
                className="w-full"
                disabled={!selected}
                loading={start.isLoading}
                onClick={() => selected && start.mutate({ routineId: selected })}
              >
                Iniciar entrenamiento
              </Button>
              {!selected && (
                <p className="text-center text-xs text-muted">Selecciona una rutina para continuar</p>
              )}
            </div>
          )
        }
      >
        {routines?.length === 0 ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted">
              Todavía no tienes rutinas guardadas. Crea la primera para poder registrar tu entrenamiento.
            </p>
            <Link href="/rutinas/nueva">
              <Button className="w-full">Crear mi primera rutina</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* La altura y el scroll los gestiona el propio modal */}
            <div className="space-y-2">
              {routines?.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border p-3 text-left transition",
                    selected === r.id
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface-2 hover:border-muted",
                  )}
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {r.emoji} {r.name}
                    </span>
                    <span className="text-xs text-muted">
                      {r.exercises.length} ejercicios
                      {r.estimatedMinutes ? ` · ~${r.estimatedMinutes} min` : ""}
                      {plan && plan.slots.length > 0 && plan.slots[plan.position]?.routine?.id === r.id
                        ? " · te toca según tu plan"
                        : ""}
                    </span>
                  </span>
                  {selected === r.id && <Badge className="bg-accent/20 text-accent">✓</Badge>}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
