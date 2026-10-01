/**
 * Semáforo de progreso por repeticiones.
 *
 * Las repeticiones que salen con un peso dicen si toca subirlo: a partir de 12
 * el peso se ha quedado corto (verde), entre 8 y 11 aún hay trabajo con él
 * (amarillo) y por debajo de 8 pesa demasiado (rojo). Sirve igual para una
 * serie suelta que para la media de un ejercicio, de un entreno o de toda la
 * rutina de alguien.
 *
 * Los ejercicios sin peso no entran: el semáforo habla de subir o bajar kilos.
 */
export type ProgressLevel = "green" | "yellow" | "red";

export function repsLevel(reps: number | null | undefined): ProgressLevel | null {
  if (reps == null || !(reps > 0)) return null;
  if (reps >= 12) return "green";
  if (reps >= 8) return "yellow";
  return "red";
}

/** Media de repeticiones de las series que tienen alguna (las vacías no cuentan). */
export function averageReps(sets: Array<{ reps: number }>): number | null {
  const withReps = sets.filter((s) => s.reps > 0);
  if (withReps.length === 0) return null;
  return withReps.reduce((acc, s) => acc + s.reps, 0) / withReps.length;
}

export const LEVEL_STYLES: Record<
  ProgressLevel,
  {
    border: string;
    ring: string;
    dot: string;
    text: string;
    /** Fondo suave para tarjetas. */
    tint: string;
    /** Pastilla: fondo suave con texto del color. */
    chip: string;
    /** Círculo sólido de color con texto contrastado. */
    solid: string;
    /** Color sólido para barras. */
    bar: string;
  }
> = {
  green: {
    border: "border-emerald-500",
    ring: "ring-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-500",
    tint: "bg-emerald-500/10",
    chip: "bg-emerald-500/15 text-emerald-500",
    solid: "bg-emerald-500 text-black",
    bar: "bg-emerald-500",
  },
  yellow: {
    border: "border-amber-400",
    ring: "ring-amber-400",
    dot: "bg-amber-400",
    text: "text-amber-400",
    tint: "bg-amber-400/10",
    chip: "bg-amber-400/15 text-amber-400",
    solid: "bg-amber-400 text-black",
    bar: "bg-amber-400",
  },
  red: {
    border: "border-red-500",
    ring: "ring-red-500",
    dot: "bg-red-500",
    text: "text-red-500",
    tint: "bg-red-500/10",
    chip: "bg-red-500/15 text-red-500",
    solid: "bg-red-500 text-white",
    bar: "bg-red-500",
  },
};

export const LEVEL_LEGEND: Record<ProgressLevel, { range: string; advice: string }> = {
  green: { range: "12 o más reps", advice: "Apto para subir el peso." },
  yellow: { range: "8 a 11 reps", advice: "Aún falta trabajo con este peso para llegar al verde." },
  red: { range: "Menos de 8 reps", advice: "Mejor bajar el peso para progresar de forma más orgánica." },
};

/** Cifra corta para enseñar una media de reps: 10 o 10,5. */
export function formatReps(reps: number): string {
  return (Math.round(reps * 10) / 10).toLocaleString("es-ES");
}
