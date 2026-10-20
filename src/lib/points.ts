/**
 * Sistema de puntos: categorías, etiquetas y reglas por defecto.
 *
 * Fuente única que comparten servidor y cliente (sin imports de Prisma). Los
 * puntos se reparten en cuatro categorías:
 *  - Series: 1 punto por cada serie realizada del entrenamiento.
 *  - Asistencia: +5 por haber entrenado.
 *  - Progreso: cada lunes, el 0,1 % del peso total de la semana de los
 *    ejercicios que están en verde (ver services/weekly-progress).
 *  - Constancia: bonus por semanas seguidas cumpliendo el plan.
 *
 * Los puntos ya concedidos no se tocan: los tipos antiguos (récords, rutinas
 * compartidas…) siguen sumando, asignados a la categoría más parecida.
 */

export type PointCategory = "SERIES" | "ASISTENCIA" | "PROGRESO" | "CONSTANCIA";

export const POINT_CATEGORIES: Array<{ key: PointCategory; title: string; emoji: string; hint: string }> = [
  { key: "SERIES", title: "Series", emoji: "🏋️", hint: "1 punto por cada serie realizada" },
  { key: "ASISTENCIA", title: "Asistencia", emoji: "📍", hint: "Por haber entrenado" },
  { key: "PROGRESO", title: "Progreso", emoji: "📈", hint: "Peso movido en tus ejercicios en verde" },
  { key: "CONSTANCIA", title: "Constancia", emoji: "🔥", hint: "Semanas seguidas cumpliendo tu plan" },
];

/** Puntos fijos por haber entrenado: valor por defecto de la regla ATTENDANCE. */
export const ATTENDANCE_DEFAULT_POINTS = 5;

/**
 * Valor por defecto de la regla de progreso semanal, en milésimas (‰) del peso
 * total de los ejercicios en verde: 1 ‰ = 0,1 %.
 */
export const PROGRESS_DEFAULT_PERMILLE = 1;

/** Categoría de cada tipo de punto (sin contar el desdoblamiento de WORKOUT_COMPLETED histórico). */
export const POINT_TYPE_CATEGORY: Record<string, PointCategory> = {
  WORKOUT_COMPLETED: "SERIES",
  ATTENDANCE: "ASISTENCIA",
  ROUTINE_SHARED: "ASISTENCIA", // legado: participación, lo más parecido a asistir
  PROGRESS_WEEKLY: "PROGRESO",
  NEW_PR: "PROGRESO", // legado: los PR ya no puntúan, los concedidos cuentan como progreso
  GOAL_COMPLETED: "PROGRESO", // legado
  CUSTOM: "PROGRESO", // extras que concede el admin
  STREAK_7: "CONSTANCIA", // legado
  WEEKLY_TARGET: "CONSTANCIA", // legado
  STREAK_WEEK1: "CONSTANCIA",
  STREAK_WEEK2: "CONSTANCIA",
  STREAK_WEEK3: "CONSTANCIA",
  STREAK_MONTH: "CONSTANCIA",
  STREAK_CRACK: "CONSTANCIA",
};

export function categoryOfType(type: string): PointCategory {
  return POINT_TYPE_CATEGORY[type] ?? "PROGRESO";
}

/** Etiqueta de cada anotación (historial por fecha). */
export const POINT_EVENT_LABELS: Record<string, string> = {
  WORKOUT_COMPLETED: "Series realizadas",
  ATTENDANCE: "Asistencia",
  ROUTINE_SHARED: "Rutina compartida (histórico)",
  PROGRESS_WEEKLY: "Progreso de la semana",
  NEW_PR: "Récord personal (histórico)",
  GOAL_COMPLETED: "Objetivo (histórico)",
  CUSTOM: "Puntos extra del admin",
  STREAK_7: "Racha (histórico)",
  WEEKLY_TARGET: "Semana cumplida (histórico)",
  STREAK_WEEK1: "Racha: 1.ª semana",
  STREAK_WEEK2: "Racha: 2 semanas",
  STREAK_WEEK3: "Racha: 3 semanas",
  STREAK_MONTH: "Racha: 4 semanas",
  STREAK_CRACK: "Racha: 5 o más semanas 💎",
};

/**
 * Reglas editables desde el panel de admin (Ajustes › sistema de puntuación),
 * por categoría y en el orden en que se enseñan. `unit` es lo que se muestra
 * tras el número (por defecto «pts»).
 */
export const RULE_INFO: Record<string, { category: PointCategory; label: string; unit?: string; hint?: string; order: number }> = {
  WORKOUT_COMPLETED: {
    category: "SERIES", label: "Serie realizada", unit: "pts por serie", order: 1,
    hint: "Por cada serie marcada como hecha; si no se marcó ninguna, cuentan todas las del entreno.",
  },
  ATTENDANCE: {
    category: "ASISTENCIA", label: "Asistencia", order: 2,
    hint: "Puntos fijos por cada entrenamiento terminado.",
  },
  PROGRESS_WEEKLY: {
    category: "PROGRESO", label: "Progreso semanal", unit: "‰ del peso", order: 3,
    hint: "Cada lunes: este ‰ del peso total (kg × reps) de la semana de los ejercicios en verde. 1 = 0,1 %.",
  },
  STREAK_WEEK1: { category: "CONSTANCIA", label: "Racha: 1 semana cumplida", order: 4 },
  STREAK_WEEK2: { category: "CONSTANCIA", label: "Racha: 2 semanas seguidas", order: 5 },
  STREAK_WEEK3: { category: "CONSTANCIA", label: "Racha: 3 semanas seguidas", order: 6 },
  STREAK_MONTH: { category: "CONSTANCIA", label: "Racha: 4 semanas seguidas", order: 7 },
  STREAK_CRACK: {
    category: "CONSTANCIA", label: "Racha: 5 o más semanas seguidas", order: 8,
    hint: "Cada semana extra a partir de la quinta.",
  },
};

/** Reglas que deben existir siempre (si falta alguna se crea con estos valores). */
export const DEFAULT_RULES: Array<{ type: string; name: string; points: number }> = [
  { type: "WORKOUT_COMPLETED", name: "Series realizadas (por serie)", points: 1 },
  { type: "ATTENDANCE", name: "Asistencia (por entrenar)", points: ATTENDANCE_DEFAULT_POINTS },
  { type: "PROGRESS_WEEKLY", name: "Progreso semanal (‰ del peso de los ejercicios en verde)", points: PROGRESS_DEFAULT_PERMILLE },
  { type: "STREAK_WEEK1", name: "Racha: 1 semana cumplida", points: 15 },
  { type: "STREAK_WEEK2", name: "Racha: 2 semanas seguidas", points: 25 },
  { type: "STREAK_WEEK3", name: "Racha: 3 semanas seguidas", points: 35 },
  { type: "STREAK_MONTH", name: "Racha: 4 semanas seguidas", points: 45 },
  { type: "STREAK_CRACK", name: "Racha: 5 o más semanas seguidas", points: 45 },
];

/** Tipos cuya regla ya no existe (los puntos concedidos se conservan). */
export const RETIRED_RULE_TYPES = [
  "NEW_PR", "STREAK_7", "WEEKLY_TARGET", "GOAL_COMPLETED", "ROUTINE_SHARED",
] as const;

/**
 * Una anotación de puntos repartida en líneas por categoría. Casi siempre es
 * una sola; la excepción son los «Entrenamiento completado» antiguos, que
 * llevaban dentro las series y los 5 puntos por entrenar: se separan en
 * Series y Asistencia sin cambiar el total. Los nuevos ya se guardan por
 * separado y se marcan con `meta.split`.
 */
export function splitPointEvent(e: {
  type: string;
  points: number;
  meta?: unknown;
}): Array<{ category: PointCategory; label: string; points: number }> {
  const meta = (e.meta ?? {}) as { split?: boolean };
  if (e.type === "WORKOUT_COMPLETED" && meta.split !== true) {
    const bonus = Math.min(ATTENDANCE_DEFAULT_POINTS, Math.max(e.points, 0));
    const lines: Array<{ category: PointCategory; label: string; points: number }> = [{ category: "SERIES", label: POINT_EVENT_LABELS.WORKOUT_COMPLETED!, points: e.points - bonus }];
    if (bonus > 0) lines.push({ category: "ASISTENCIA", label: POINT_EVENT_LABELS.ATTENDANCE!, points: bonus });
    return lines;
  }
  return [{ category: categoryOfType(e.type), label: POINT_EVENT_LABELS[e.type] ?? e.type, points: e.points }];
}

export type CategoryTotals = Record<PointCategory, { points: number; count: number }>;

export function emptyCategoryTotals(): CategoryTotals {
  return {
    SERIES: { points: 0, count: 0 },
    ASISTENCIA: { points: 0, count: 0 },
    PROGRESO: { points: 0, count: 0 },
    CONSTANCIA: { points: 0, count: 0 },
  };
}
