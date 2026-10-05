"use client";

import { useEffect, useRef, useState } from "react";
import { Anchor, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { STABLE_MARK_MIN_REPS, type StableMark } from "@/lib/stable-mark";

const kg = (w: number) => `${w.toLocaleString("es-ES")} kg`;

/** Estilos de la pastilla: discreta sin confirmar, tintada en sky si está confirmada. */
const STYLES = {
  pending: "border border-dashed border-muted/50 bg-surface-2 text-muted",
  confirmed: "border border-sky-400/40 bg-sky-500/15 text-sky-500 dark:text-sky-300",
};

/** Texto que explica la marca; sale al pulsar la pastilla y como tooltip en escritorio. */
function markLabel(mark: StableMark) {
  return mark.confirmed
    ? `Marca estable confirmada: ${kg(mark.weight)} con ${STABLE_MARK_MIN_REPS}+ reps en todas las series en ${mark.sessions} sesiones. Peso fiable`
    : `Marca estable: ${kg(mark.weight)} con ${STABLE_MARK_MIN_REPS}+ reps en todas las series. Repítela en otra sesión para confirmarla`;
}

/**
 * Pastilla de la marca estable de un ejercicio: el mayor peso con 12+ reps en
 * todas las series de una sesión. Confirmada cuando se repite en otra sesión.
 * Al pulsarla explica qué es: en flotante bajo la pastilla o, con `inline`, como
 * texto en el flujo (para tarjetas estrechas donde un flotante se saldría).
 */
export function StableMarkBadge({
  mark,
  className,
  inline = false,
}: {
  mark: StableMark | undefined;
  className?: string;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Un toque fuera la cierra
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (!mark) return null;

  const label = markLabel(mark);
  const Icon = mark.confirmed ? ShieldCheck : Anchor;
  const note = (
    <p
      role="status"
      className={cn(
        "text-[11px] leading-snug",
        inline
          ? "mt-1 text-muted"
          : "absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-border bg-surface-2 p-2.5 text-left font-normal text-fg shadow-lg",
      )}
    >
      {label}
    </p>
  );

  return (
    <div ref={ref} className={cn(inline ? "" : "relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={label}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
          mark.confirmed ? STYLES.confirmed : STYLES.pending,
        )}
      >
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        {kg(mark.weight)}
      </button>
      {open && note}
    </div>
  );
}

const SAMPLE: StableMark = {
  weight: 40,
  sessions: 1,
  confirmed: false,
  firstDate: new Date(0),
  lastDate: new Date(0),
};

/** Leyenda de la marca estable: una mini-tarjeta por estado con su pastilla. */
export function StableMarkLegend({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      <div className="rounded-xl bg-surface-2 p-2.5">
        <StableMarkBadge mark={SAMPLE} />
        <p className="mt-1 text-[11px] leading-snug text-muted">
          Mejor peso con {STABLE_MARK_MIN_REPS}+ reps en todas las series de una sesión
        </p>
      </div>
      <div className="rounded-xl bg-sky-500/10 p-2.5">
        <StableMarkBadge mark={{ ...SAMPLE, sessions: 2, confirmed: true }} />
        <p className="mt-1 text-[11px] leading-snug text-muted">
          Conseguida en 2 sesiones: el peso es fiable
        </p>
      </div>
    </div>
  );
}
