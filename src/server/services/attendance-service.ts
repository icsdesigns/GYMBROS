import type { PrismaClient, PointType } from "@prisma/client";
import {
  startOfDay, endOfDay, addDays, startOfISOWeek, endOfISOWeek, subWeeks, isSameDay, format,
} from "date-fns";
import { awardPoints, addFeed, checkAchievements } from "./gamification";
import { notifyUserFromTemplate } from "./notify-templates";

/** Tipos de punto ligados a cumplir una semana de racha. */
const STREAK_POINT_TYPES: PointType[] = [
  "STREAK_WEEK1", "STREAK_WEEK2", "STREAK_WEEK3", "STREAK_MONTH", "STREAK_CRACK",
];

/** Nivel de recompensa según las semanas consecutivas cumplidas. */
function streakLevel(weeks: number): { type: PointType; title: string } {
  if (weeks === 1) return { type: "STREAK_WEEK1", title: "¡Racha de 1 semana! 🔥" };
  if (weeks === 2) return { type: "STREAK_WEEK2", title: "¡Racha de 2 semanas! 🔥" };
  if (weeks === 3) return { type: "STREAK_WEEK3", title: "¡Racha de 3 semanas! 🔥" };
  if (weeks === 4) return { type: "STREAK_MONTH", title: "¡Racha de 1 mes! 🔥🔥" };
  return { type: "STREAK_CRACK", title: `¡CRACK! ${weeks} semanas seguidas 💎` };
}

/**
 * Registra la asistencia de un día (si no existe), otorga puntos y
 * actualiza la racha semanal. Lo usan el botón de Asistencia y el
 * cierre de entrenamientos (asistencia automática al entrenar).
 */
export async function registerAttendance(
  db: PrismaClient,
  userId: string,
  rawDate: Date = new Date(),
  extra?: { gymName?: string; notes?: string },
) {
  const date = startOfDay(rawDate);

  const existing = await db.attendance.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (existing) return { attendance: existing, alreadyRegistered: true, weekStreak: null as number | null };

  const attendance = await db.attendance.create({
    data: { userId, date, gymName: extra?.gymName, notes: extra?.notes },
  });

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { lastAttendanceDate: date } });

  // --- Racha semanal: se cumple la semana al alcanzar los días planificados ---
  let weekStreak: number | null = null;
  if (user.weeklyTargetDays > 0) {
    const weekStart = startOfISOWeek(date);
    const alreadyCounted =
      user.lastCompletedWeek && isSameDay(startOfISOWeek(user.lastCompletedWeek), weekStart);

    if (!alreadyCounted) {
      const weekCount = await db.attendance.count({
        where: { userId, date: { gte: weekStart, lte: endOfISOWeek(date) } },
      });
      if (weekCount >= user.weeklyTargetDays) {
        const previousWeek = subWeeks(weekStart, 1);
        const continues =
          user.lastCompletedWeek &&
          isSameDay(startOfISOWeek(user.lastCompletedWeek), previousWeek);
        weekStreak = continues ? user.currentStreak + 1 : 1;

        const level = streakLevel(weekStreak);
        const points = await awardPoints(db, userId, level.type, {
          week: format(weekStart, "yyyy-MM-dd"),
          streak: weekStreak,
        });

        await db.user.update({
          where: { id: userId },
          data: {
            currentStreak: weekStreak,
            bestStreak: Math.max(user.bestStreak, weekStreak),
            lastCompletedWeek: weekStart,
            // Semana salvada: los avisos vuelven a quedar disponibles
            streakWarnedWeek: null,
            streakLostWeek: null,
          },
        });

        // Texto editable por el admin (plantilla WEEK_COMPLETED). Si la
        // desactiva no se manda nada: para eso está el interruptor.
        await notifyUserFromTemplate(
          db, userId, "WEEK_COMPLETED", "streaks",
          {
            name: user.name,
            milestone: level.title,
            streak: weekStreak,
            target: user.weeklyTargetDays,
            points: points > 0 ? `+${points} puntos` : "",
          },
          "STREAK",
        );
        if (weekStreak >= 4) {
          await addFeed(db, userId, "STREAK", `${user.name} lleva ${weekStreak} semanas cumpliendo su plan 💎`);
        } else {
          await addFeed(db, userId, "STREAK", `${user.name} cumplió su semana de entreno (racha de ${weekStreak}) ✅`);
        }
      }
    }
  }

  await checkAchievements(db, userId);
  return { attendance, alreadyRegistered: false, weekStreak };
}

/**
 * Recalcula desde cero la racha semanal de un usuario a partir de sus
 * asistencias (tras borrar un día, por ejemplo). Una semana cuenta si
 * alcanza los días planificados.
 */
export async function recomputeStreak(db: PrismaClient, userId: string): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { weeklyTargetDays: true },
  });
  const attendances = await db.attendance.findMany({
    where: { userId },
    select: { date: true },
    orderBy: { date: "asc" },
  });
  const lastDate = attendances.length > 0 ? attendances[attendances.length - 1]!.date : null;

  if (user.weeklyTargetDays <= 0 || attendances.length === 0) {
    await db.user.update({
      where: { id: userId },
      data: { currentStreak: 0, bestStreak: 0, lastCompletedWeek: null, lastAttendanceDate: lastDate },
    });
    return;
  }

  // Contar asistencias por semana ISO
  const perWeek = new Map<number, number>();
  for (const a of attendances) {
    const k = startOfISOWeek(a.date).getTime();
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
  }
  const completedWeeks = Array.from(perWeek.entries())
    .filter(([, count]) => count >= user.weeklyTargetDays)
    .map(([k]) => k)
    .sort((a, b) => a - b);

  // Retirar los puntos de racha de semanas que ya no están cumplidas
  await purgeStreakPoints(db, userId, new Set(completedWeeks.map((k) => format(new Date(k), "yyyy-MM-dd"))));

  // Mejor racha = tramo más largo de semanas consecutivas cumplidas
  let best = 0;
  let current = 0;
  let lastCompleted: number | null = null;
  let prev: number | null = null;
  for (const wk of completedWeeks) {
    if (prev !== null && startOfISOWeek(subWeeks(new Date(wk), 1)).getTime() === prev) {
      current += 1;
    } else {
      current = 1;
    }
    best = Math.max(best, current);
    lastCompleted = wk;
    prev = wk;
  }

  await db.user.update({
    where: { id: userId },
    data: {
      currentStreak: current,
      bestStreak: best,
      lastCompletedWeek: lastCompleted ? new Date(lastCompleted) : null,
      lastAttendanceDate: lastDate,
      // Los avisos de racha vuelven a estar disponibles tras recalcular
      streakWarnedWeek: null,
      streakLostWeek: null,
    },
  });
}

/** Borra los puntos de racha cuyas semanas ya no están cumplidas. */
async function purgeStreakPoints(db: PrismaClient, userId: string, keepWeeks: Set<string>) {
  const events = await db.pointEvent.findMany({
    where: { userId, type: { in: STREAK_POINT_TYPES } },
    select: { id: true, meta: true },
  });
  const stale = events
    .filter((e) => {
      const week = (e.meta as { week?: string } | null)?.week;
      return !week || !keepWeeks.has(week);
    })
    .map((e) => e.id);
  if (stale.length > 0) await db.pointEvent.deleteMany({ where: { id: { in: stale } } });
}

/**
 * Borra por completo un día de entrenamiento: la asistencia, los entrenos de
 * ese día y TODO lo que generaron (puntos de asistencia, de series y de PR
 * históricos, los PRs autodetectados y las publicaciones del feed). Después
 * recalcula la racha, lo que a su vez retira los puntos de las semanas que
 * dejan de estar cumplidas.
 */
export async function deleteTrainingDay(db: PrismaClient, userId: string, rawDate: Date) {
  const date = startOfDay(rawDate);
  const dayEnd = endOfDay(rawDate);
  // Un entreno cerrado automáticamente puede registrar sus puntos ya de
  // madrugada del día siguiente: se da un día de margen al buscarlos.
  const pointsUntil = addDays(dayEnd, 1);

  const [workouts, autoPRs] = await Promise.all([
    db.workout.findMany({
      where: { userId, startedAt: { gte: date, lte: dayEnd } },
      select: { id: true },
    }),
    db.personalRecord.findMany({
      where: { userId, isAuto: true, date: { gte: date, lte: dayEnd } },
      select: { id: true, exerciseId: true, weight: true },
    }),
  ]);

  // Puntos de asistencia del día (los antiguos van por fecha)
  await db.pointEvent.deleteMany({
    where: { userId, type: "ATTENDANCE", meta: { path: ["date"], equals: date.toISOString() } },
  });
  // Puntos de cada entreno: series y asistencia (o ambos juntos, en los antiguos)
  for (const w of workouts) {
    await db.pointEvent.deleteMany({
      where: {
        userId,
        type: { in: ["WORKOUT_COMPLETED", "ATTENDANCE"] },
        meta: { path: ["workoutId"], equals: w.id },
      },
    });
  }
  // Puntos de los PRs detectados en esos entrenos, de cuando aún puntuaban (los PRs añadidos a mano se respetan)
  for (const pr of autoPRs) {
    await db.pointEvent.deleteMany({
      where: {
        userId,
        type: "NEW_PR",
        date: { gte: date, lte: pointsUntil },
        AND: [
          { meta: { path: ["exerciseId"], equals: pr.exerciseId } },
          { meta: { path: ["weight"], equals: pr.weight } },
        ],
      },
    });
  }

  await db.$transaction([
    db.personalRecord.deleteMany({ where: { id: { in: autoPRs.map((p) => p.id) } } }),
    db.workout.deleteMany({ where: { id: { in: workouts.map((w) => w.id) } } }),
    db.attendance.deleteMany({ where: { userId, date } }),
    // Publicaciones del feed generadas ese día por el entreno, los PRs o la racha
    db.feedItem.deleteMany({
      where: {
        userId,
        type: { in: ["WORKOUT", "PR", "STREAK"] },
        createdAt: { gte: date, lte: pointsUntil },
      },
    }),
  ]);

  await recomputeStreak(db, userId);
  return { deletedWorkouts: workouts.length, deletedPRs: autoPRs.length };
}
