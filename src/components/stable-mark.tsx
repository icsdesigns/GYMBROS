"use client";

import { useEffect, useRef, useState } from "react";
import { Anchor, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { STABLE_MARK_MIN_REPS, type StableMark } from "@/lib/stable-mark";

const kg = (w: number) => `${w.toLocaleString("es-ES")} kg`;

/** Estilos de la pastilla: discreta sin verificar, tintada en sky si está verificada. */
const STYLES = {
  pending: "border border-dashed border-muted/50 bg-surface-2 text-muted",
  confirmed: "border border-sky-400/40 bg-sky-500/15 text-sky-500 dark:text-sky-300",
};

/** Texto que explica la marca; sale al pulsar la pastilla y como tooltip en escritorio. */
function markLabel(mark: StableMark) {
  return mark.confirmed
    ? `Marca estable verificada: ${kg(mark.weight)} con ${STABLE_MARK_MIN_REPS}+ reps en todas las series, en ${mark.sessions} entrenos distintos. Peso fiable`
    : `Marca estable: ${kg(mark.weight)} con ${STABLE_MARK_MIN_REPS}+ reps en todas las series. Repítela en otro entreno para verificarla`;
}

/**
 * Pastilla de la marca estable de un ejercicio: el mayor peso con 12+ reps en
 * todas las series de una sesión. Verificada cuando se repite en otra sesión.
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

/**
 * Estado de una marca estable como etiqueta fija (sin pulsar): «Verificada» en
 * sky o «Sin verificar» discreta. Para tarjetas donde el estado va a la vista.
 */
export function StableMarkStatus({ mark, className }: { mark: StableMark; className?: string }) {
  const Icon = mark.confirmed ? ShieldCheck : Anchor;
  return (
    <span
      title={markLabel(mark)}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        mark.confirmed ? STYLES.confirmed : STYLES.pending,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {mark.confirmed ? "Verificada" : "Sin verificar"}
    </span>
  );
}

const SAMPLE: StableMark = {
  weight: 40,
  sessions: 1,
  confirmed: false,
  firstDate: new Date(0),
  lastDate: new Date(0),
};

/**
 * Las dos vías para conseguir una marca estable y cómo se verifica. Texto
 * compartido por la leyenda de info y por el anuncio del primer entreno.
 */
export function StableMarkRules({ className }: { className?: string }) {
  const num =
    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent";
  return (
    <div className={cn("space-y-2 text-[12px] leading-snug text-muted", className)}>
      <p className="font-semibold text-fg">Se consigue de 2 formas</p>
      <ol className="space-y-1.5">
        <li className="flex gap-2">
          <span className={num}>1</span>
          <span>
            Todas las series del ejercicio al <strong className="text-fg">mismo peso</strong> y con
            al menos {STABLE_MARK_MIN_REPS} repeticiones.
          </span>
        </li>
        <li className="flex gap-2">
          <span className={num}>2</span>
          <span>
            Series con <strong className="text-fg">pesos distintos</strong>, pero todas con{" "}
            {STABLE_MARK_MIN_REPS} reps o más: cuenta el menor de esos pesos.
          </span>
        </li>
      </ol>
      <p>
        Se <strong className="text-fg">verifica</strong> al repetirla en 2 entrenos distintos.
      </p>
    </div>
  );
}

/** Leyenda de la marca estable: las dos vías y una mini-tarjeta por estado con su pastilla. */
export function StableMarkLegend({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <StableMarkRules />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-2 p-2.5">
          <StableMarkBadge mark={SAMPLE} />
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Conseguida en un entreno: aún por verificar
          </p>
        </div>
        <div className="rounded-xl bg-sky-500/10 p-2.5">
          <StableMarkBadge mark={{ ...SAMPLE, sessions: 2, confirmed: true }} />
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Verificada en 2 entrenos distintos: el peso es fiable
          </p>
        </div>
      </div>
    </div>
  );
}
