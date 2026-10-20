import type { PrismaClient } from "@prisma/client";
import { addDays, getISODay, startOfDay, startOfISOWeek, subWeeks } from "date-fns";
import { computeStableMarks } from "@/lib/stable-mark";
import { routineTrendsFor } from "./routine-trends";
import { seasonAt, seasonRange } from "./season";
import { groupMemberIds } from "./group";

/**
 * Condiciones de los logros que necesitan algo más que un contador. Cada función
 * es independiente y solo se llama desde `checkAchievements` cuando el logro
 * sigue pendiente, para no repetir consultas caras una vez conseguido.
 */

/** Meses naturales distintos (año + mes) que contienen alguna de las fechas. */
export function distinctMonths(dates: Date[]): number {
  return new Set(dates.map((d) => `${d.getFullYear()}-${d.getMonth()}`)).size;
}

/**
 * ¿Hay una racha rota de 4+ semanas seguidas con el plan cumplido y, después,
 * otra semana cumplida? Se reconstruye desde las asistencias igual que
 * `recomputeStreak` (una semana cuenta si llega a los días planificados), así
 * que el historial de rachas no necesita guardarse aparte. Cada tramo de
 * semanas consecutivas cumplidas es una racha; cualquiera que no sea la última
 * terminó en una semana fallada y se retomó después.
 */
export function hasResumedAfterLongStreak(
  attendanceDates: Date[],
  weeklyTargetDays: number,
  minWeeks = 4,
): boolean {
  if (weeklyTargetDays <= 0) return false;
  const perWeek = new Map<number, number>();
  for (const d of attendanceDates) {
    const k = startOfISOWeek(d).getTime();
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
  }
  const completed = Array.from(perWeek.entries())
    .filter(([, count]) => count >= weeklyTargetDays)
    .map(([k]) => k)
    .sort((a, b) => a - b);

  const runs: number[] = [];
  let prev: number | null = null;
  for (const wk of completed) {
    if (prev !== null && startOfISOWeek(subWeeks(new Date(wk), 1)).getTime() === prev) {
      runs[runs.length - 1]! += 1;
    } else {
      runs.push(1);
    }
    prev = wk;
  }
  return runs.slice(0, -1).some((len) => len >= minWeeks);
}

/** Miembros (sin repetir) de todos los grupos del usuario, sin contarlo a él. */
export async function coMemberIds(db: PrismaClient, userId: string): Promise<string[]> {
  const others = await db.groupMember.findMany({
    where: {
      userId: { not: userId },
      user: { deletionRequestedAt: null },
      group: { members: { some: { userId } } },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  return others.map((o) => o.userId);
}

/** Días distintos en los que el usuario ha registrado asistencia a la vez que algún compañero de grupo. */
export async function sharedTrainingDays(
  db: PrismaClient,
  userId: string,
  attendanceDates: Date[],
): Promise<number> {
  if (attendanceDates.length === 0) return 0;
  const mates = await coMemberIds(db, userId);
  if (mates.length === 0) return 0;
  const shared = await db.attendance.findMany({
    where: { userId: { in: mates }, date: { in: attendanceDates } },
    select: { date: true },
    distinct: ["date"],
  });
  return shared.length;
}

/** Cuántos lunes recientes se miran como máximo (acota la consulta al grupo). */
const MONDAYS_LOOKBACK = 30;

/**
 * ¿Ha empezado el usuario un entreno terminado, un lunes, antes que cualquier
 * otro miembro de sus grupos que entrenara ese mismo lunes? Hace falta que
 * coincida al menos otro miembro: ser el único que entrena no es «llegar
 * primero». Se compara la hora de INICIO de los entrenos (los de los demás,
 * terminados o no) dentro de los últimos lunes en los que el usuario entrenó.
 */
export async function wasFirstOnAMonday(db: PrismaClient, userId: string): Promise<boolean> {
  const mine = await db.workout.findMany({
    where: { userId, endedAt: { not: null } },
    select: { startedAt: true },
    orderBy: { startedAt: "desc" },
    take: 200,
  });
  // Primer inicio del usuario en cada lunes
  const firstByMonday = new Map<number, Date>();
  for (const w of mine) {
    if (getISODay(w.startedAt) !== 1) continue;
    const day = startOfDay(w.startedAt).getTime();
    const current = firstByMonday.get(day);
    if (!current || w.startedAt < current) firstByMonday.set(day, w.startedAt);
  }
  const mondays = Array.from(firstByMonday.keys()).sort((a, b) => b - a).slice(0, MONDAYS_LOOKBACK);
  if (mondays.length === 0) return false;

  const mates = await coMemberIds(db, userId);
  if (mates.length === 0) return false;

  const others = await db.workout.findMany({
    where: {
      userId: { in: mates },
      OR: mondays.map((t) => ({ startedAt: { gte: new Date(t), lt: addDays(new Date(t), 1) } })),
    },
    select: { startedAt: true },
  });
  // Primer inicio de los demás cada lunes
  const firstOthers = new Map<number, number>();
  for (const w of others) {
    const day = startOfDay(w.startedAt).getTime();
    const t = w.startedAt.getTime();
    const current = firstOthers.get(day);
    if (current === undefined || t < current) firstOthers.set(day, t);
  }
  return mondays.some((day) => {
    const theirs = firstOthers.get(day);
    return theirs !== undefined && firstByMonday.get(day)!.getTime() < theirs;
  });
}

/**
 * Marcas estables verificadas (confirmadas en 2+ sesiones) de ejercicios
 * distintos. Mismo origen y cálculo que `workout.stableMarks`.
 */
export async function confirmedStableMarks(db: PrismaClient, userId: string): Promise<number> {
  const workouts = await db.workout.findMany({
    where: { userId, endedAt: { not: null } },
    select: {
      startedAt: true,
      exercises: {
        where: { exercise: { noWeight: false } },
        select: {
          exerciseId: true,
          sets: { select: { reps: true, weight: true, completed: true } },
        },
      },
    },
  });
  return Object.values(computeStableMarks(workouts)).filter((m) => m.confirmed).length;
}

/**
 * «Todo en verde»: todos los ejercicios de todas las rutinas del usuario están
 * en tendencia «up» en la tabla de Progresos (`routineTrendsFor`). Exige al
 * menos un ejercicio y que ninguno esté en otro estado; «unknown» (sin las
 * sesiones necesarias para medir) cuenta como no cumplido. Las rutinas sin
 * ejercicios no aportan nada.
 */
export async function allExercisesGreen(db: PrismaClient, userId: string): Promise<boolean> {
  const routines = await routineTrendsFor(db, userId);
  const exercises = routines.flatMap((r) => r.exercises);
  return exercises.length > 0 && exercises.every((e) => e.direction === "up");
}

/** Temporadas terminadas que se revisan como máximo. */
const SEASONS_LOOKBACK = 8;

/**
 * ¿Ha ganado el usuario alguna temporada ya terminada en alguno de sus grupos?
 * No hay registro de ganadores: se calcula igual que el palmarés (puntos de
 * cada miembro dentro del rango de la temporada). Hace falta tener puntos y
 * competir con al menos otro miembro; un empate en cabeza cuenta como victoria.
 */
export async function wonASeason(db: PrismaClient, userId: string): Promise<boolean> {
  const currentIndex = seasonAt().index;
  if (currentIndex <= 1) return false; // aún no ha terminado ninguna

  const memberships = await db.groupMember.findMany({ where: { userId }, select: { groupId: true } });
  if (memberships.length === 0) return false;
  const groups = (
    await Promise.all(memberships.map((m) => groupMemberIds(db, m.groupId)))
  ).filter((ids) => ids.length >= 2 && ids.includes(userId));
  if (groups.length === 0) return false;

  for (let idx = currentIndex - 1; idx >= 1 && idx >= currentIndex - SEASONS_LOOKBACK; idx--) {
    const { from, to } = seasonRange(idx);
    const mine = await db.pointEvent.aggregate({
      where: { userId, date: { gte: from, lte: to } },
      _sum: { points: true },
    });
    const myPoints = mine._sum.points ?? 0;
    if (myPoints <= 0) continue;
    for (const memberIds of groups) {
      const grouped = await db.pointEvent.groupBy({
        by: ["userId"],
        where: { date: { gte: from, lte: to }, userId: { in: memberIds } },
        _sum: { points: true },
      });
      const best = Math.max(...grouped.map((g) => g._sum.points ?? 0));
      if (myPoints >= best) return true;
    }
  }
  return false;
}
