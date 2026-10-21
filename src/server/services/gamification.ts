import type { PrismaClient, PointType, NotificationType, FeedType } from "@prisma/client";
import { ACHIEVEMENT_CATALOG } from "@/lib/achievements";
import { ATTENDANCE_DEFAULT_POINTS, DEFAULT_RULES } from "@/lib/points";
import { sendPushToUsers } from "./push";
import {
  allExercisesGreen, confirmedStableMarks, distinctMonths, hasResumedAfterLongStreak,
  sharedTrainingDays, wasFirstOnAMonday, wonASeason,
} from "./achievement-conditions";
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

/**
 * Aviso de un logro conseguido en el chat de cada grupo del autor, como mensaje
 * de sistema, y push a los demás miembros (categoría «system»: sistema y logros).
 * Es un efecto secundario: si falla no debe impedir que el logro quede concedido.
 */
async function announceAchievementInChat(
  db: PrismaClient,
  userId: string,
  userName: string,
  achievement: { icon: string; name: string; description: string },
): Promise<void> {
  const text = `🏆 ${userName} ha desbloqueado el logro ${achievement.icon} ${achievement.name}\n${achievement.description}`;
  const { pushChatMessage } = await import("./chat");
  const memberships = await db.groupMember.findMany({ where: { userId }, select: { groupId: true } });
  // Quien comparte varios grupos con el autor ve el mensaje en cada chat, pero recibe un solo push
  const pushed = new Set<string>();
  for (const { groupId } of memberships) {
    try {
      await db.chatMessage.create({ data: { groupId, text, system: true, userId: null } });
      await pushChatMessage(db, {
        groupId,
        exceptUserId: userId,
        category: "system",
        title: (groupName) => (groupName ? `🏆 Logro de ${userName} · ${groupName}` : `🏆 Logro de ${userName}`),
        body: `${achievement.icon} ${achievement.name}`,
        alreadyNotified: pushed,
      });
    } catch (error) {
      console.error("[logros] no se pudo avisar del logro en el chat", error);
    }
  }
}

/** Concede un logro (si aún no lo tiene) y avisa al usuario, al feed y al chat del grupo. */
export async function grant(db: PrismaClient, userId: string, code: string): Promise<boolean> {
  let achievement = await db.achievement.findUnique({ where: { code } });
  if (!achievement) {
    // El catálogo (lib/achievements) manda: si el logro aún no está en la base de datos, se da de alta
    const def = ACHIEVEMENT_CATALOG.find((a) => a.code === code);
    if (!def) return false;
    const { number: _number, retired: _retired, ...data } = def;
    achievement = await db.achievement.upsert({ where: { code }, update: {}, create: data });
  }
  const exists = await db.userAchievement.findUnique({
    where: { userId_achievementId: { userId, achievementId: achievement.id } },
  });
  if (exists) return false;
  try {
    await db.userAchievement.create({ data: { userId, achievementId: achievement.id } });
  } catch (error) {
    // Dos revisiones a la vez (p. ej. el autocierre lanzado desde dos consultas):
    // la otra ya lo concedió y avisó, así que aquí no se repite nada
    if ((error as { code?: string }).code === "P2002") return false;
    throw error;
  }
  await notify(db, userId, "SYSTEM", `Logro desbloqueado: ${achievement.icon} ${achievement.name}`, achievement.description);
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const name = user?.name ?? "Alguien";
  await addFeed(db, userId, "ACHIEVEMENT", `${name} desbloqueó el logro ${achievement.icon} ${achievement.name}`);
  await announceAchievementInChat(db, userId, name, achievement);
  return true;
}

export type AchievementEvaluation = {
  /** Códigos que el usuario ya tiene en la base de datos. */
  earned: Set<string>;
  /** Códigos cuya condición se cumple ahora (incluye los ya conseguidos salvo que se pida recomprobarlos). */
  met: Set<string>;
};

/**
 * Calcula qué logros cumple el usuario SIN escribir nada.
 *
 * Las comprobaciones baratas (contadores, asistencias, rutinas) se hacen siempre.
 * Las caras —tendencias de Progresos, marcas estables, lunes y temporadas—
 * solo con `heavy` y únicamente mientras el logro siga pendiente y haya datos
 * suficientes. Con `recheckEarned` también se recomprueban los ya conseguidos
 * (para detectar los que se tienen sin cumplir la condición).
 */
export async function evaluateAchievements(
  db: PrismaClient,
  userId: string,
  opts: { heavy?: boolean; recheckEarned?: boolean } = {},
): Promise<AchievementEvaluation> {
  const [workouts, prs, attendances, user, volume, routines, earnedRows] = await Promise.all([
    db.workout.count({ where: { userId, endedAt: { not: null } } }),
    db.personalRecord.count({ where: { userId } }),
    db.attendance.count({ where: { userId } }),
    db.user.findUnique({
      where: { id: userId },
      select: { currentStreak: true, bestStreak: true, weeklyTargetDays: true },
    }),
    db.workout.aggregate({ where: { userId }, _sum: { totalVolume: true } }),
    db.routine.count({ where: { userId } }),
    db.userAchievement.findMany({ where: { userId }, select: { achievement: { select: { code: true } } } }),
  ]);
  const totalVolume = volume._sum.totalVolume ?? 0;
  const bestStreak = user?.bestStreak ?? 0;

  const earned = new Set(earnedRows.map((r) => r.achievement.code));
  const met = new Set<string>();
  // Se evalúa si está pendiente o si se piden recomprobar también los conseguidos
  const todo = (code: string) => opts.recheckEarned || !earned.has(code);
  if (!opts.recheckEarned) earned.forEach((c) => met.add(c));
  const check = (code: string, condition: boolean) => {
    if (condition) met.add(code);
  };

  // Fechas de asistencia: solo se leen si algún logro que las usa se evalúa
  let attendanceDates: Promise<Date[]> | null = null;
  const loadAttendanceDates = () =>
    (attendanceDates ??= db.attendance
      .findMany({ where: { userId }, select: { date: true }, orderBy: { date: "asc" } })
      .then((rows) => rows.map((r) => r.date)));

  check("FIRST_ATTENDANCE", attendances >= 1);
  check("ATTENDANCE_25", attendances >= 25);
  // SHARE_FIRST está retirado (ver lib/achievements): ya no se concede
  check("STREAK_WEEK", bestStreak >= 1);
  check("STREAK_CRACK", bestStreak >= 5);
  check("FIRST_WORKOUT", workouts >= 1);
  check("WORKOUTS_10", workouts >= 10);
  check("WORKOUTS_100", workouts >= 100);
  check("FIRST_PR", prs >= 1);
  check("PR_10", prs >= 10);
  check("STREAK_7", bestStreak >= 4); // 1 mes (4 semanas)
  check("STREAK_30", bestStreak >= 26); // 6 meses (26 semanas)
  check("VOLUME_1000", totalVolume >= 1000);
  check("VOLUME_10000", totalVolume >= 10000);
  check("VOLUME_100000", totalVolume >= 100000);
  check("ATTENDANCE_100", attendances >= 100);
  check("ROUTINES_3", routines >= 3);

  // Asistencia: 12 meses distintos, volver tras una racha perdida y coincidir con el grupo
  if (todo("YEAR_OF_IRON") && attendances >= 12) {
    check("YEAR_OF_IRON", distinctMonths(await loadAttendanceDates()) >= 12);
  }
  if (todo("COMEBACK") && bestStreak >= 4 && (user?.weeklyTargetDays ?? 0) > 0) {
    check("COMEBACK", hasResumedAfterLongStreak(await loadAttendanceDates(), user!.weeklyTargetDays));
  }
  if (todo("WORKOUT_BUDDY") && attendances >= 10) {
    check("WORKOUT_BUDDY", (await sharedTrainingDays(db, userId, await loadAttendanceDates())) >= 10);
  }

  if (opts.heavy) {
    // Con menos de 5 sesiones ningún ejercicio llega a tener tendencia. Las marcas
    // se confirman en 2 sesiones, pero una sesión puede validar varias a la vez:
    // con 2 entrenos ya podrían salir las 10. Las cuatro van en paralelo.
    const [green, marks, monday, season] = await Promise.all([
      todo("ALL_GREEN") && workouts >= 5 ? allExercisesGreen(db, userId) : false,
      todo("STABLE_MARKS_10") && workouts >= 2 ? confirmedStableMarks(db, userId) : 0,
      todo("FIRST_ON_MONDAY") && workouts >= 1 ? wasFirstOnAMonday(db, userId) : false,
      todo("SEASON_CHAMPION") && workouts >= 1 ? wonASeason(db, userId) : false,
    ]);
    check("ALL_GREEN", green);
    check("STABLE_MARKS_10", marks >= 10);
    check("FIRST_ON_MONDAY", monday);
    check("SEASON_CHAMPION", season);
  }

  // Coleccionista: todos los logros no retirados del catálogo salvo él mismo
  const required = ACHIEVEMENT_CATALOG.filter((a) => !a.retired && a.code !== "COLLECTOR");
  check("COLLECTOR", required.every((a) => met.has(a.code)));

  return { earned, met };
}

/** Revisa y otorga logros según el estado actual del usuario (ver `evaluateAchievements`). */
export async function checkAchievements(
  db: PrismaClient,
  userId: string,
  opts: { heavy?: boolean } = {},
) {
  const { earned, met } = await evaluateAchievements(db, userId, opts);
  // Coleccionista al final: cuenta también los que se acaban de conseguir
  const codes = Array.from(met).filter((c) => !earned.has(c) && c !== "COLLECTOR");
  for (const code of codes) await grant(db, userId, code);
  if (met.has("COLLECTOR") && !earned.has("COLLECTOR")) await grant(db, userId, "COLLECTOR");
}
