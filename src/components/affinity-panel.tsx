"use client";

import { useState } from "react";
import { CalendarRange, ChevronDown, Layers, PieChart, HeartHandshake } from "lucide-react";
import { Card } from "@/components/ui";
import { cn, MUSCLE_LABELS } from "@/lib/utils";

type Affinity = { total: number; frequency: number; volume: number; muscles: number };
type Detail = {
  frequency: { mine: number; theirs: number };
  exercises: { mine: number; theirs: number };
  sets: { mine: number; theirs: number };
  muscles: Array<{ group: string; mine: number; theirs: number; gap: number }>;
};

/** A partir de este parecido ya no tiene sentido buscarle diferencias. */
const IDENTICAL_PCT = 95;

function styleFor(pct: number) {
  if (pct >= IDENTICAL_PCT) return { text: "text-accent", bar: "bg-accent" };
  if (pct >= 70) return { text: "text-accent", bar: "bg-accent" };
  if (pct >= 45) return { text: "text-lime-400", bar: "bg-lime-400" };
  if (pct >= 25) return { text: "text-amber-400", bar: "bg-amber-400" };
  return { text: "text-red-400", bar: "bg-red-400" };
}

/** Una de las tres patas, con los dos valores comparados. */
function Row({
  icon: Icon,
  label,
  pct,
  mine,
  theirs,
}: {
  icon: typeof CalendarRange;
  label: string;
  pct: number;
  mine?: string;
  theirs?: string;
}) {
  const style = styleFor(pct);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />
        <span className="text-xs font-medium">{label}</span>
        <span className={cn("ml-auto text-xs font-bold tabular-nums", style.text)}>{pct}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("gb-bar h-full w-full rounded-full", style.bar)}
          style={{ transform: `translateX(${pct - 100}%)` }}
        />
      </div>
      {mine && theirs && (
        <p className="text-[11px] text-muted">
          Tú: {mine} · {theirs}
        </p>
      )}
    </div>
  );
}

/**
 * Afinidad de entrenamiento con el miembro cuyo perfil se está viendo.
 * Además del porcentaje, explica EN QUÉ se diferencian las dos formas de
 * entrenar; solo cuando el parecido es casi total se dice que entrenáis igual.
 * Compacto: plegado por defecto muestra solo el porcentaje; el detalle se despliega.
 */
export function AffinityPanel({
  affinity,
  detail,
  name,
  myProfileEmpty,
  theirProfileEmpty,
}: {
  affinity: Affinity | null;
  detail: Detail | null;
  name: string;
  myProfileEmpty: boolean;
  theirProfileEmpty: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!affinity || !detail) {
    return (
      <Card className="flex items-center gap-3 py-3 text-sm text-muted">
        <HeartHandshake className="h-4 w-4 shrink-0 text-muted" />
        {myProfileEmpty
          ? "Crea alguna rutina con ejercicios para ver tu afinidad de entrenamiento."
          : theirProfileEmpty
            ? `${name} todavía no tiene rutinas con ejercicios que comparar.`
            : "No hay datos suficientes para calcular la afinidad."}
      </Card>
    );
  }

  const style = styleFor(affinity.total);
  const firstName = name.split(" ")[0];

  // Diferencias concretas, de la más llamativa a la menos
  const differences: string[] = [];
  for (const m of detail.muscles) {
    const label = (MUSCLE_LABELS[m.group] ?? m.group).toLowerCase();
    differences.push(
      m.gap > 0
        ? `Tú dedicas más a ${label} (${m.mine}% de tus ejercicios frente al ${m.theirs}%)`
        : `${firstName} dedica más a ${label} (${m.theirs}% de sus ejercicios frente a tu ${m.mine}%)`,
    );
  }
  const freqGap = detail.frequency.mine - detail.frequency.theirs;
  if (Math.abs(freqGap) >= 1) {
    differences.push(
      freqGap > 0
        ? `Entrenas ${Math.abs(freqGap)} ${Math.abs(freqGap) === 1 ? "día" : "días"} más por semana`
        : `${firstName} entrena ${Math.abs(freqGap)} ${Math.abs(freqGap) === 1 ? "día" : "días"} más por semana`,
    );
  }
  const setsGap = detail.sets.mine - detail.sets.theirs;
  if (Math.abs(setsGap) >= 3) {
    differences.push(
      setsGap > 0
        ? `Tus rutinas son más largas: ${detail.sets.mine} series frente a ${detail.sets.theirs}`
        : `Las rutinas de ${firstName} son más largas: ${detail.sets.theirs} series frente a tus ${detail.sets.mine}`,
    );
  }

  const identical = affinity.total >= IDENTICAL_PCT;
  // Pie de la barra muscular: el grupo donde más os separáis
  const top = detail.muscles[0];
  const topGroupCaption = top
    ? `mayor desvío en ${(MUSCLE_LABELS[top.group] ?? top.group).toLowerCase()}`
    : undefined;

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="affinity-detail"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2">
          <HeartHandshake className={cn("h-4 w-4", style.text)} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Afinidad de entrenamiento</h2>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn("gb-bar h-full w-full rounded-full", style.bar)}
              style={{ transform: `translateX(${affinity.total - 100}%)` }}
            />
          </div>
        </div>
        <span className={cn("shrink-0 text-2xl font-extrabold leading-none", style.text)}>
          {affinity.total}%
        </span>
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      <div id="affinity-detail" hidden={!open} className="space-y-3 border-t border-border px-4 pb-4 pt-3">
        <p className="text-xs text-muted">Días por semana, tamaño de rutina y reparto muscular</p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Row
            icon={PieChart}
            label="Grupos musculares"
            pct={affinity.muscles}
            mine={topGroupCaption ? "reparto propio" : undefined}
            theirs={topGroupCaption}
          />
          <Row
            icon={CalendarRange}
            label="Días por semana"
            pct={affinity.frequency}
            mine={`${detail.frequency.mine}`}
            theirs={`${firstName}: ${detail.frequency.theirs}`}
          />
          <Row
            icon={Layers}
            label="Tamaño de rutina"
            pct={affinity.volume}
            mine={`${detail.exercises.mine} ej · ${detail.sets.mine} series`}
            theirs={`${firstName}: ${detail.exercises.theirs} ej · ${detail.sets.theirs} series`}
          />
        </div>

        <div className="rounded-xl bg-surface-2 p-3">
          {identical ? (
            <p className="text-sm text-accent">
              Entrenáis igual: mismos días, mismo tamaño de rutina y mismo reparto muscular 💪
            </p>
          ) : differences.length === 0 ? (
            <p className="text-sm text-muted">
              No hay diferencias destacables entre vuestras rutinas, solo pequeños matices.
            </p>
          ) : (
            <>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                En qué os diferenciáis
              </p>
              <ul className="space-y-1">
                {differences.map((d) => (
                  <li key={d} className="flex gap-2 text-sm">
                    <span className="text-muted">·</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
