import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_RULES, categoryOfType, emptyCategoryTotals, splitPointEvent,
  type CategoryTotals, type PointCategory,
} from "@/lib/points";
import { ruleFor } from "./gamification";

/**
 * Lecturas del sistema de puntos por categoría (Series, Asistencia, Progreso y
 * Constancia). Los eventos antiguos se reparten con `splitPointEvent`, así que
 * la suma de las cuatro categorías siempre cuadra con el total del ranking.
 */

/** Puntos y número de anotaciones del usuario en cada categoría. */
export async function pointsByCategory(
  db: PrismaClient,
  userId: string,
): Promise<{ categories: CategoryTotals; total: number }> {
  const [grouped, workoutEvents] = await Promise.all([
    db.pointEvent.groupBy({
      by: ["type"],
      where: { userId, type: { not: "WORKOUT_COMPLETED" } },
      _sum: { points: true },
      _count: true,
    }),
    // Los de series pueden venir juntos con la asistencia (los antiguos): se miran uno a uno
    db.pointEvent.findMany({
      where: { userId, type: "WORKOUT_COMPLETED" },
      select: { type: true, points: true, meta: true },
    }),
  ]);

  const categories = emptyCategoryTotals();
  for (const g of grouped) {
    const cat = categories[categoryOfType(g.type)];
    cat.points += g._sum.points ?? 0;
    cat.count += g._count;
  }
  for (const e of workoutEvents) {
    for (const line of splitPointEvent(e)) {
      const cat = categories[line.category];
      cat.points += line.points;
      cat.count += 1;
    }
  }
  const total = Object.values(categories).reduce((acc, c) => acc + c.points, 0);
  return { categories, total };
}

export type PointsHistoryLine = {
  id: string;
  category: PointCategory;
  label: string;
  points: number;
  date: Date;
};

/** Historial de puntos agrupado por día, del más reciente al más antiguo. */
export async function pointsHistoryByDay(db: PrismaClient, userId: string, days: number) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days);

  const events = await db.pointEvent.findMany({
    where: { userId, date: { gte: from } },
    select: { id: true, type: true, points: true, date: true, meta: true },
    orderBy: { date: "desc" },
  });

  const byDay = new Map<string, { date: Date; total: number; lines: PointsHistoryLine[] }>();
  for (const e of events) {
    const key = e.date.toISOString().slice(0, 10);
    const day = byDay.get(key) ?? { date: e.date, total: 0, lines: [] };
    splitPointEvent(e).forEach((line, i) => {
      day.total += line.points;
      day.lines.push({ id: `${e.id}:${i}`, ...line, date: e.date });
    });
    byDay.set(key, day);
  }
  return {
    days: Array.from(byDay.entries()).map(([key, d]) => ({ key, ...d })),
    total: events.reduce((acc, e) => acc + e.points, 0),
    sinceDays: days,
  };
}

let defaultsEnsured = false;

/**
 * Se asegura de que existan las reglas de puntos que el sistema necesita (p. ej.
 * Asistencia y Progreso semanal, nuevas). Solo crea las que faltan; nunca pisa
 * lo que el admin haya cambiado. Si alguna no se puede crear (el tipo aún no
 * existe en la base de datos) se salta y se reintenta en la siguiente llamada.
 */
export async function ensureDefaultRules(db: PrismaClient) {
  if (defaultsEnsured) return;
  let ok = true;
  for (const def of DEFAULT_RULES) {
    try {
      await ruleFor(db, def.type as Parameters<typeof ruleFor>[1]);
    } catch {
      ok = false;
    }
  }
  defaultsEnsured = ok;
}
