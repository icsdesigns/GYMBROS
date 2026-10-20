"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, Info } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { api } from "@/trpc/react";
import type { AppRouter } from "@/server/api/root";
import { Spinner, EmptyState, Modal } from "@/components/ui";
import { cn } from "@/lib/utils";

type Direction = "up" | "flat" | "down" | "unknown";

/** Sesiones que se comparan a cada lado, a juego con el cálculo del servidor. */
const RECENT_SESSIONS = 2;
const PREVIOUS_SESSIONS = 3;
const MIN_SESSIONS = RECENT_SESSIONS + PREVIOUS_SESSIONS;
/** Margen que se considera estancamiento. */
const FLAT_PCT = 5;

const STYLES: Record<Direction, { card: string; text: string; icon: typeof ArrowUp }> = {
  up: { card: "border-accent/50 bg-accent/10", text: "text-accent", icon: ArrowUp },
  flat: { card: "border-amber-400/50 bg-amber-400/10", text: "text-amber-400", icon: ArrowUpDown },
  down: { card: "border-red-500/50 bg-red-500/15", text: "text-red-400", icon: ArrowDown },
  unknown: { card: "border-border bg-surface", text: "text-muted", icon: ArrowUpDown },
};

const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
/** Incremento junto al volumen: un decimal, con signo explícito (+3,2% / −1,5%). */
const pctNf = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/** Incremento del volumen respecto a la sesión anterior: verde si sube, rojo si baja. */
function DeltaPct({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const rounded = Math.round(pct * 10) / 10;
  return (
    <span
      title="Respecto a la sesión anterior"
      className={cn(
        "font-semibold",
        rounded > 0 ? "text-emerald-500" : rounded < 0 ? "text-red-400" : "text-muted",
      )}
    >
      {" "}
      ({rounded === 0 ? "0%" : `${pctNf.format(rounded).replace("-", "−")}%`})
    </span>
  );
}

type RoutineTrend = inferRouterOutputs<AppRouter>["stats"]["routineTrends"][number];
type ExerciseTrend = RoutineTrend["exercises"][number];

/**
 * Etiqueta de progreso: título, el porcentaje en grande con su flecha y, en
 * pequeño, el volumen de la última sesión. Nada más: de un vistazo se ve si
 * eso sube, baja o se queda donde estaba.
 */
function TrendLabel({
  title,
  direction,
  changePct,
  volume,
  volumeChangePct,
  unit,
  sessions,
  size = "md",
}: {
  title: string;
  direction: Direction;
  changePct: number | null;
  volume: number | null;
  /** Incremento del volumen de la última sesión respecto a la anterior (%). */
  volumeChangePct: number | null;
  unit: "kg" | "reps";
  sessions: number;
  size?: "md" | "lg";
}) {
  const style = STYLES[direction];
  const Icon = style.icon;
  const enough = sessions >= MIN_SESSIONS;

  return (
    <div className={cn("rounded-2xl border p-3", style.card, size === "lg" && "p-4")}>
      <p
        className={cn(
          "truncate font-bold leading-tight",
          size === "lg" ? "text-lg" : "text-xs",
        )}
      >
        {title}
      </p>

      {enough ? (
        <>
          <div className={cn("mt-1 flex items-center gap-1", style.text)}>
            <span className={cn("font-black leading-none", size === "lg" ? "text-4xl" : "text-2xl")}>
              {changePct === null ? "—" : `${changePct > 0 ? "+" : ""}${changePct.toFixed(0)}%`}
            </span>
            <Icon className={cn("shrink-0", size === "lg" ? "h-9 w-9" : "h-6 w-6")} strokeWidth={2.75} />
          </div>
          <p className={cn("mt-0.5 truncate text-muted", size === "lg" ? "text-xs" : "text-[10px]")}>
            {volume === null ? (
              "sin volumen"
            ) : (
              <>
                {nf.format(volume)} {unit === "kg" ? "kg" : "reps"}
                <DeltaPct pct={volumeChangePct} />
              </>
            )}
          </p>
        </>
      ) : (
        <p className={cn("mt-1 text-muted", size === "lg" ? "text-sm" : "text-[10px]")}>
          Faltan {MIN_SESSIONS - sessions}{" "}
          {MIN_SESSIONS - sessions === 1 ? "sesión" : "sesiones"}
        </p>
      )}
    </div>
  );
}

/** Una fórmula del panel de ayuda: qué se calcula y cómo. */
function Formula({ label, expression, note }: { label: string; expression: string; note?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="rounded-xl bg-surface-2 p-3 font-mono text-xs text-fg">{expression}</p>
      {note && <p className="text-[11px] text-muted">{note}</p>}
    </div>
  );
}

/**
 * Progreso de entrenamiento: la rutina completa y, debajo, cada ejercicio.
 * Se compara la media de las 2 últimas sesiones con la de las 3 anteriores, así
 * que hasta la quinta sesión no hay nada que enseñar.
 */
export function ProgressView() {
  const { data: routines, isLoading } = api.stats.routineTrends.useQuery();
  const [selected, setSelected] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  if (isLoading) return <Spinner />;

  if (!routines || routines.length === 0) {
    return (
      <EmptyState
        icon="📈"
        title="Todavía no hay nada que analizar"
        subtitle={`Crea una rutina y entrénala ${MIN_SESSIONS} veces para ver tu progreso`}
      />
    );
  }

  const routine = routines.find((r) => r.id === selected) ?? routines[0]!;
  const overall = routine.overall;
  const enough = overall.sessions >= MIN_SESSIONS;

  return (
    <div className="gb-stagger space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold">Progreso</h1>
          <p className="text-sm text-muted">
            Media de volumen de las {RECENT_SESSIONS} últimas sesiones frente a las{" "}
            {PREVIOUS_SESSIONS} anteriores.
          </p>
        </div>
        <button
          onClick={() => setHelpOpen(true)}
          aria-label="Cómo se calcula el progreso"
          title="Cómo se calcula el progreso"
          className="shrink-0 rounded-full border border-border bg-surface p-2 text-muted transition hover:border-accent/50 hover:text-accent"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {/* Selector de rutina */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {routines.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition",
              r.id === routine.id
                ? "border-accent bg-accent/15 font-medium text-accent"
                : "border-border bg-surface text-muted hover:text-fg",
            )}
          >
            {r.emoji} {r.name}
          </button>
        ))}
      </div>

      {enough ? (
        <>
          <TrendLabel
            title={`${routine.emoji} ${routine.name}`}
            direction={overall.direction as Direction}
            changePct={overall.changePct}
            volume={overall.last}
            volumeChangePct={overall.lastChangePct}
            unit={overall.unit}
            sessions={overall.sessions}
            size="lg"
          />

          {routine.exercises.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {routine.exercises.map((ex: ExerciseTrend) => (
                <TrendLabel
                  key={ex.id}
                  title={ex.name}
                  direction={ex.direction as Direction}
                  changePct={ex.changePct}
                  volume={ex.last}
                  volumeChangePct={ex.lastChangePct}
                  unit={ex.unit}
                  sessions={ex.sessions}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon="⏳"
          title={`Te faltan ${MIN_SESSIONS - overall.sessions} ${
            MIN_SESSIONS - overall.sessions === 1 ? "sesión" : "sesiones"
          }`}
          subtitle={`Hacen falta ${MIN_SESSIONS} sesiones de esta rutina para medir el progreso. Llevas ${overall.sessions}.`}
        />
      )}

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Cómo se calcula el progreso">
        <div className="space-y-4 text-sm">
          <Formula
            label="Volumen de una serie"
            expression="peso × repeticiones"
            note="En los ejercicios «sin peso» el volumen son las repeticiones."
          />
          <Formula
            label="Volumen de una sesión"
            expression="Σ volumen de las series completadas"
          />
          <Formula
            label="Volumen de la rutina"
            expression="Σ volumen de todos sus ejercicios"
          />
          <Formula
            label="Progreso"
            expression={`Δ% = (A − B) ÷ B × 100`}
            note={`A = media de las ${RECENT_SESSIONS} últimas sesiones · B = media de las ${PREVIOUS_SESSIONS} anteriores`}
          />
          <Formula
            label="Incremento junto al volumen"
            expression="(V₁ − V₀) ÷ V₀ × 100"
            note="V₁ = volumen de la última sesión · V₀ = volumen de la sesión anterior. Verde si sube, rojo si baja."
          />
          <Formula
            label="Sesiones necesarias"
            expression={`${RECENT_SESSIONS} + ${PREVIOUS_SESSIONS} = ${MIN_SESSIONS}`}
          />
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Etiquetas</p>
            <div className="space-y-1 rounded-xl bg-surface-2 p-3 font-mono text-xs">
              <p className="text-accent">Δ% &gt; +{FLAT_PCT}% → ↑ subes</p>
              <p className="text-amber-400">−{FLAT_PCT}% ≤ Δ% ≤ +{FLAT_PCT}% → ↕ te mantienes</p>
              <p className="text-red-400">Δ% &lt; −{FLAT_PCT}% → ↓ bajas</p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
