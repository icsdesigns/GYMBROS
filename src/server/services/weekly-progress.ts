import type { PrismaClient } from "@prisma/client";
import { addWeeks, format, startOfISOWeek, subWeeks } from "date-fns";
import { ruleFor } from "./gamification";
import { routineTrendsFor } from "./routine-trends";

/**
 * Puntos de PROGRESO: se calculan al cerrar la semana (lunes, en el cron de
 * rachas) sobre la semana ISO anterior, lunes a domingo.
 *
 * Por cada ejercicio en verde de la tabla de Progresos (tendencia al alza) de
 * cualquiera de las rutinas del usuario, se toma el volumen que muestra su
 * etiqueta (kg × reps de su última sesión, si fue esa semana). Se suman todos
 * los ejercicios, se aplica el porcentaje de la regla PROGRESS_WEEKLY (en
 * milésimas: 1 ‰ = 0,1 %) y el resultado se redondea a puntos enteros.
 *
 * Es idempotente: cada semana se concede una sola vez por usuario (la semana
 * va en `meta.week`), así que repetir el cron no duplica nada.
 */

export type WeeklyProgress = {
  /** Puntos que corresponden (ya redondeados, antes de aplicar la regla activa/desactivada). */
  points: number;
  /** Peso total de los ejercicios en verde (kg × reps). */
  weight: number;
  /** Ejercicios en verde que han sumado. */
  exercises: number;
};

/**
 * Cálculo puro de la semana de un usuario. No escribe nada.
 *
 * Usa exactamente los datos de la tabla de Progresos (routineTrendsFor): un
 * ejercicio con peso está "en verde" si su tendencia es al alza, y su peso es
 * el volumen de su última sesión (el que se ve en la etiqueta). Solo cuenta si
 * esa última sesión cae dentro de la semana que se cierra, para no volver a
 * puntuar el mismo entreno la semana siguiente. Un ejercicio presente en varias
 * rutinas se cuenta una sola vez.
 */
export async function computeWeeklyProgress(
  db: PrismaClient,
  userId: string,
  weekStart: Date,
  permille: number,
): Promise<WeeklyProgress> {
  const weekEnd = addWeeks(weekStart, 1); // lunes siguiente
  // Tabla de Progresos tal como estaba al cerrar la semana: si no, quien entrena
  // el lunes antes del cron perdería esa semana y su tendencia incluiría el lunes
  const trends = await routineTrendsFor(db, userId, weekEnd);
  const seen = new Set<string>();
  let weight = 0;
  let exercises = 0;
  for (const routine of trends) {
    for (const ex of routine.exercises) {
      if (seen.has(ex.exerciseId)) continue;
      if (ex.unit !== "kg" || ex.direction !== "up" || !ex.last || !ex.lastDate) continue;
      if (ex.lastDate < weekStart || ex.lastDate >= weekEnd) continue;
      seen.add(ex.exerciseId);
      weight += ex.last;
      exercises += 1;
    }
  }
  return { points: Math.round((weight * permille) / 1000), weight, exercises };
}



/**
 * Concede los puntos de progreso de una semana a un usuario, si no se le
 * habían concedido ya. Devuelve los puntos otorgados (0 si no tocaba nada).
 */
export async function awardWeeklyProgress(
  db: PrismaClient,
  userId: string,
  weekStart: Date,
): Promise<number> {
  const rule = await ruleFor(db, "PROGRESS_WEEKLY");
  if (!rule || !rule.enabled || rule.points <= 0) return 0;

  const week = format(weekStart, "yyyy-MM-dd");
  const already = await db.pointEvent.findFirst({
    where: { userId, type: "PROGRESS_WEEKLY", meta: { path: ["week"], equals: week } },
    select: { id: true },
  });
  if (already) return 0;

  const result = await computeWeeklyProgress(db, userId, weekStart, rule.points);
  if (result.points <= 0) return 0;
  await db.pointEvent.create({
    data: {
      userId,
      type: "PROGRESS_WEEKLY",
      points: result.points,
      meta: { week, weight: Math.round(result.weight), exercises: result.exercises, permille: rule.points },
    },
  });
  return result.points;
}

/**
 * Cierre de la semana pasada para toda la comunidad (lo llama el cron del
 * lunes). Solo mira a quien entrenó esa semana.
 */
export async function awardWeeklyProgressForAll(db: PrismaClient, now: Date = new Date()) {
  const weekStart = subWeeks(startOfISOWeek(now), 1);
  const weekEnd = startOfISOWeek(now);
  const trained = await db.workout.findMany({
    where: {
      endedAt: { not: null },
      startedAt: { gte: weekStart, lt: weekEnd },
      user: { deletionRequestedAt: null },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  let awarded = 0;
  let points = 0;
  for (const { userId } of trained) {
    try {
      const p = await awardWeeklyProgress(db, userId, weekStart);
      if (p > 0) {
        awarded += 1;
        points += p;
      }
    } catch (e) {
      // Un usuario con problemas no debe dejar sin puntos al resto
      console.error("weekly-progress", userId, e);
    }
  }
  return { week: format(weekStart, "yyyy-MM-dd"), candidates: trained.length, awarded, points };
}
