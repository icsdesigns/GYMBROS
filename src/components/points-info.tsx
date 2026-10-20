"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { api } from "@/trpc/react";
import { Modal, Spinner } from "@/components/ui";

/** Etapas de la racha, en el orden en que se van alcanzando. */
const STREAK_STEPS: Array<{ type: string; label: string }> = [
  { type: "STREAK_WEEK1", label: "1 semana cumplida" },
  { type: "STREAK_WEEK2", label: "2 semanas seguidas" },
  { type: "STREAK_WEEK3", label: "3 semanas seguidas" },
  { type: "STREAK_MONTH", label: "4 semanas seguidas" },
  { type: "STREAK_CRACK", label: "5 o más semanas seguidas 💎" },
];

/** 1 → «0,1», 25 → «2,5»: el ‰ de la regla de progreso, expresado en %. */
function permilleAsPercent(permille: number): string {
  return (permille / 10).toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

/**
 * Botón ⓘ del cartel de puntos: abre el esquema del sistema de puntos con los
 * valores reales de las reglas (el admin puede cambiarlos o desactivarlas, y
 * aquí solo aparecen las activas), organizado en sus cuatro categorías.
 */
export function PointsInfo() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = api.dashboard.pointRules.useQuery(undefined, { enabled: open });
  const value = (type: string) => data?.rules.find((r) => r.type === type)?.points;

  const perSet = value("WORKOUT_COMPLETED");
  const attendance = value("ATTENDANCE");
  const progress = value("PROGRESS_WEEKLY");
  const streak = STREAK_STEPS.map((s) => ({ ...s, points: value(s.type) })).filter((s) => s.points);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cómo se consiguen los puntos"
        title="Cómo se consiguen los puntos"
        className="text-muted transition hover:text-fg"
      >
        <Info className="h-4 w-4" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Sistema de puntos" subtitle="Así se suman puntos para el ranking">
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <div className="space-y-5 text-sm">
            {perSet !== undefined && (
              <section className="space-y-1.5">
                <h3 className="font-semibold">🏋️ Series</h3>
                <Row label="Por cada serie realizada" points={`+${perSet}`} />
                <p className="text-xs text-muted">
                  Cuentan las series que marcas como hechas; si no marcas ninguna, todas las del entreno.
                </p>
              </section>
            )}

            {attendance !== undefined && (
              <section className="space-y-1.5">
                <h3 className="font-semibold">📍 Asistencia</h3>
                <Row label="Por haber entrenado" points={`+${attendance}`} />
              </section>
            )}

            {progress !== undefined && (
              <section className="space-y-1.5">
                <h3 className="font-semibold">📈 Progreso</h3>
                <Row label="Peso total de tus ejercicios en verde" points={`${permilleAsPercent(progress)} %`} />
                <p className="text-xs text-muted">
                  Cada lunes se cierra la semana anterior: de cada ejercicio de tus rutinas que esté en
                  verde en Progresos se suma ese porcentaje del volumen que muestra su etiqueta (kg ×
                  repeticiones de la última sesión) y el total se redondea a puntos enteros.
                </p>
              </section>
            )}

            {streak.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="font-semibold">🔥 Constancia</h3>
                {streak.map((s) => (
                  <Row key={s.type} label={s.label} points={`+${s.points}`} />
                ))}
                <p className="text-xs text-muted">
                  Una semana se cumple al llegar a tus días de entreno objetivo. Si fallas una, la racha
                  vuelve a empezar.
                </p>
              </section>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function Row({ label, points }: { label: string; points: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 font-semibold text-accent">{points}</span>
    </div>
  );
}
