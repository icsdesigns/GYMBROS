import type { PrismaClient, PointType, NotificationType, FeedType } from "@prisma/client";
import { ACHIEVEMENT_CATALOG } from "@/lib/achievements";
import { ATTENDANCE_DEFAULT_POINTS, DEFAULT_RULES } from "@/lib/points";
import { sendPushToUsers } from "./push";
import { categoryEnabled, usersWithCategory, type NotifyCategory } from "./notify-prefs";

/**
 * Servicio central de gamificación: puntos, notificaciones, feed y logros.
 * Todas las acciones relevantes pasan por aquí para que el sistema
 * de puntuación sea configurable desde la tabla PointRule.
 */

/**
 * Regla de un tipo de punto. Si falta y es una de las que siempre deben existir
 * (ver DEFAULT_RULES) se crea con su valor por defecto: así la regla nueva
 * funciona sin depender de que alguien haya lanzado el seed.
 */
export async function ruleFor(db: PrismaClient, type: PointType) {
  const rule = await db.pointRule.findUnique({ where: { type } });
  if (rule) return rule;
  const def = DEFAULT_RULES.find((r) => r.type === type);
  if (!def) return null;
  try {
    return await db.pointRule.create({ data: { type, name: def.name, points: def.points } });
  } catch {
    // Otra petición la creó a la vez
    return db.pointRule.findUnique({ where: { type } });
  }
}

/**
 * Otorga los puntos de una regla. `units` multiplica el valor de la regla para
 * las que puntúan por cantidad (p. ej. las series realizadas) y `bonus` se suma aparte, una sola vez.
 */
export async function awardPoints(
  db: PrismaClient,
  userId: string,
  type: PointType,
  meta?: Record<string, unknown>,
  units = 1,
  bonus = 0,
) {
  const rule = await ruleFor(db, type);
  if (!rule || !rule.enabled || rule.points <= 0) return 0;
  const points = rule.points * Math.max(units, 0) + bonus;
  if (points <= 0) return 0;
  await db.pointEvent.create({
    data: { userId, type, points, meta: meta as object | undefined },
  });
  return points;
}

/**
 * Series que puntúan al completar un entreno: las marcadas como completadas.
 * Si no se marcó ninguna, se cuentan todas las de la sesión (se asume que se
 * hicieron y no se fueron marcando).
 */
export function workoutPointUnits(exercises: Array<{ sets: Array<{ completed: boolean }> }>): number {
  const all = exercises.flatMap((we) => we.sets);
  const done = all.filter((s) => s.completed).length;
  return done > 0 ? done : all.length;
}

/** Puntos fijos por haber entrenado: valor por defecto de la regla de Asistencia. */
export const WORKOUT_BONUS_POINTS = ATTENDANCE_DEFAULT_POINTS;

/**
 * Puntos de un entrenamiento terminado, en dos anotaciones separadas:
 *  - Series (WORKOUT_COMPLETED): valor de la regla por cada serie realizada
 *    (ver workoutPointUnits).
 *  - Asistencia (ATTENDANCE): el valor de su regla, una vez por entrenamiento.
 * `meta.split` las distingue de las antiguas, que juntaban ambas cosas en una.
 */
export async function awardWorkoutPoints(
  db: PrismaClient,
  userId: string,
  workoutId: string,
  exercises: Array<{ sets: Array<{ completed: boolean }> }>,
) {
  const sets = await awardPoints(
    db, userId, "WORKOUT_COMPLETED", { workoutId, split: true }, workoutPointUnits(exercises),
  );
  const attendance = await awardPoints(db, userId, "ATTENDANCE", { workoutId, split: true });
  return sets + attendance;
}

export async function notify(
  db: PrismaClient,
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  category: NotifyCategory = "system",
) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { notifyPrefs: true } });
  if (user && !categoryEnabled(user.notifyPrefs, category)) return;
  await db.notification.create({ data: { userId, type, title, body } });
  await sendPushToUsers(db, [userId], { title, body });
}

/**
 * Notifica a quienes comparten grupo con el autor, menos a él.
 *
 * Con varios grupos, "los demás" ya no son todos los usuarios de la app: son
 * los de SUS grupos, sin repetir a quien coincida en más de uno.
 */
export async function notifyOthers(
  db: PrismaClient,
  exceptUserId: string,
  type: NotificationType,
  title: string,
  body?: string,
  category: NotifyCategory = "system",
) {
  const others = await db.groupMember.findMany({
    where: {
      userId: { not: exceptUserId },
      user: { deletionRequestedAt: null },
      group: { members: { some: { userId: exceptUserId } } },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  const recipients = await usersWithCategory(db, others.map((u) => u.userId), category);
  if (recipients.length === 0) return;
  await db.notification.createMany({
    data: recipients.map((id) => ({ userId: id, type, title, body })),
  });
  await sendPushToUsers(db, recipients, { title, body });
}

export async function addFeed(
  db: PrismaClient,
  userId: string,
  type: FeedType,
  message: string,
  meta?: Record<string, unknown>,
) {
  await db.feedItem.create({ data: { userId, type, message, meta: meta as object | undefined } });
}

async function grant(db: PrismaClient, userId: string, code: string) {
  let achievement = await db.achievement.findUnique({ where: { code } });
  if (!achievement) {
    // El catálogo (lib/achievements) manda: si el logro aún no está en la base de datos, se da de alta
    const def = ACHIEVEMENT_CATALOG.find((a) => a.code === code);
    if (!def) return;
    const { number: _number, retired: _retired, ...data } = def;
    achievement = await db.achievement.upsert({ where: { code }, update: {}, create: data });
  }
  const exists = await db.userAchievement.findUnique({
    where: { userId_achievementId: { userId, achievementId: achievement.id } },
  });
  if (exists) return;
  await db.userAchievement.create({ data: { userId, achievementId: achievement.id } });
  await notify(db, userId, "SYSTEM", `Logro desbloqueado: ${achievement.icon} ${achievement.name}`, achievement.description);
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await addFeed(db, userId, "ACHIEVEMENT", `${user?.name ?? "Alguien"} desbloqueó el logro ${achievement.icon} ${achievement.name}`);
}

/** Revisa y otorga logros según el estado actual del usuario. */
export async function checkAchievements(db: PrismaClient, userId: string) {
  const [workouts, prs, attendances, user, volume] = await Promise.all([
    db.workout.count({ where: { userId, endedAt: { not: null } } }),
    db.personalRecord.count({ where: { userId } }),
    db.attendance.count({ where: { userId } }),
    db.user.findUnique({ where: { id: userId }, select: { currentStreak: true, bestStreak: true } }),
    db.workout.aggregate({ where: { userId }, _sum: { totalVolume: true } }),
  ]);
  const totalVolume = volume._sum.totalVolume ?? 0;

  if (attendances >= 1) await grant(db, userId, "FIRST_ATTENDANCE");
  if (attendances >= 25) await grant(db, userId, "ATTENDANCE_25");
  // SHARE_FIRST está retirado (ver lib/achievements): ya no se concede
  if ((user?.bestStreak ?? 0) >= 1) await grant(db, userId, "STREAK_WEEK");
  if ((user?.bestStreak ?? 0) >= 5) await grant(db, userId, "STREAK_CRACK");
  if (workouts >= 1) await grant(db, userId, "FIRST_WORKOUT");
  if (workouts >= 10) await grant(db, userId, "WORKOUTS_10");
  if (workouts >= 100) await grant(db, userId, "WORKOUTS_100");
  if (prs >= 1) await grant(db, userId, "FIRST_PR");
  if (prs >= 10) await grant(db, userId, "PR_10");
  if ((user?.bestStreak ?? 0) >= 4) await grant(db, userId, "STREAK_7"); // 1 mes (4 semanas)
  if ((user?.bestStreak ?? 0) >= 26) await grant(db, userId, "STREAK_30"); // 6 meses (26 semanas)
  if (totalVolume >= 1000) await grant(db, userId, "VOLUME_1000");
  if (totalVolume >= 10000) await grant(db, userId, "VOLUME_10000");
  if (attendances >= 100) await grant(db, userId, "ATTENDANCE_100");
}
