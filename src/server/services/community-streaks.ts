import type { PrismaClient } from "@prisma/client";
import { startOfISOWeek, subWeeks } from "date-fns";
import { usersWithCategory } from "./notify-prefs";
import { sendPushToUsers } from "./push";

export const COMMUNITY_STREAKS_TITLE = "Despancetizados de la semana";

/**
 * Prefijo del anuncio de rachas en el chat. Sirve para no duplicarlo: en el chat
 * hay otros mensajes de sistema (p. ej. «está entrenando») que no cuentan.
 */
const STREAKS_CHAT_PREFIX = "🔥 Rachas de la semana";

/** "Ana", "Ana y Luis", "Ana, Luis y Marta" */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * Aviso de los lunes por la mañana: quién cumplió la semana que acaba de
 * terminar (racha de 1, 2, 3, 4 o más semanas).
 *
 * Cada persona recibe los nombres de SU gente —los que comparten algún grupo
 * con ella, ella incluida—, en un único aviso aunque esté en varios grupos.
 * Si nadie de su entorno cumplió, no se le manda nada.
 */
export async function notifyCommunityStreaks(db: PrismaClient, now: Date = new Date()) {
  const weekStart = startOfISOWeek(now);
  const lastWeek = subWeeks(weekStart, 1);

  // Cumplió la semana pasada: su última semana cumplida es justo esa
  const achievers = await db.user.findMany({
    where: {
      deletionRequestedAt: null,
      currentStreak: { gte: 1 },
      lastCompletedWeek: { gte: lastWeek, lt: weekStart },
    },
    select: {
      id: true,
      name: true,
      currentStreak: true,
      memberships: { select: { groupId: true } },
    },
    orderBy: { currentStreak: "desc" },
  });
  if (achievers.length === 0) return { recipients: 0, achievers: 0, announced: 0 };

  const achieverGroups = achievers.map((a) => ({
    name: a.name,
    streak: a.currentStreak,
    groups: new Set(a.memberships.map((m) => m.groupId)),
  }));
  const groupIds = Array.from(new Set(achievers.flatMap((a) => a.memberships.map((m) => m.groupId))));

  // Anuncio en el chat de cada grupo (no depende de quién tenga activas las notificaciones)
  const announced = await announceInGroupChats(db, groupIds, achieverGroups, weekStart);

  const members = await db.groupMember.findMany({
    where: { groupId: { in: groupIds }, user: { deletionRequestedAt: null } },
    select: { userId: true, groupId: true },
  });
  const groupsByUser = new Map<string, Set<string>>();
  for (const m of members) {
    if (!groupsByUser.has(m.userId)) groupsByUser.set(m.userId, new Set());
    groupsByUser.get(m.userId)!.add(m.groupId);
  }

  const recipients = await usersWithCategory(db, Array.from(groupsByUser.keys()), "streaks");
  // Un solo aviso por semana aunque el cron se repita
  const already = await db.notification.findMany({
    where: { userId: { in: recipients }, title: COMMUNITY_STREAKS_TITLE, createdAt: { gte: weekStart } },
    select: { userId: true },
  });
  const done = new Set(already.map((n) => n.userId));

  let sent = 0;
  for (const userId of recipients) {
    if (done.has(userId)) continue;
    const mine = groupsByUser.get(userId)!;
    const names = achieverGroups
      .filter((a) => Array.from(a.groups).some((g) => mine.has(g)))
      .map((a) => a.name);
    if (names.length === 0) continue;
    const body = `¡${joinNames(names)} ${names.length === 1 ? "ha" : "han"} obtenido una racha!`;
    await db.notification.create({
      data: { userId, type: "STREAK", title: COMMUNITY_STREAKS_TITLE, body },
    });
    await sendPushToUsers(db, [userId], { title: COMMUNITY_STREAKS_TITLE, body, url: "/ranking" });
    sent++;
  }
  return { recipients: sent, achievers: achievers.length, announced };
}

/** "1 semana" / "3 semanas" */
function weeksLabel(n: number): string {
  return `${n} ${n === 1 ? "semana" : "semanas"}`;
}

/**
 * Deja un mensaje de sistema en el chat de cada grupo con algún miembro que
 * cumplió la semana pasada: «Ana (3 semanas), Luis y Marta (1 semana)».
 * No manda push de chat. Si el cron se repite no duplica el mensaje.
 */
async function announceInGroupChats(
  db: PrismaClient,
  groupIds: string[],
  achievers: { name: string; streak: number; groups: Set<string> }[],
  weekStart: Date,
): Promise<number> {
  const already = await db.chatMessage.findMany({
    where: {
      groupId: { in: groupIds },
      system: true,
      text: { startsWith: STREAKS_CHAT_PREFIX },
      createdAt: { gte: weekStart },
    },
    select: { groupId: true },
  });
  const done = new Set(already.map((m) => m.groupId));

  let announced = 0;
  for (const groupId of groupIds) {
    if (done.has(groupId)) continue;
    // Ya vienen ordenados por racha descendente; se agrupan los que comparten racha
    const mine = achievers.filter((a) => a.groups.has(groupId));
    if (mine.length === 0) continue;
    const byStreak = new Map<number, string[]>();
    for (const a of mine) {
      if (!byStreak.has(a.streak)) byStreak.set(a.streak, []);
      byStreak.get(a.streak)!.push(a.name);
    }
    const parts = Array.from(byStreak.entries()).map(
      ([streak, names]) => `${joinNames(names)} (${weeksLabel(streak)})`,
    );
    const text = `${STREAKS_CHAT_PREFIX}: ¡${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}` : parts[0]} ${mine.length === 1 ? "ha cumplido" : "han cumplido"}!`;
    await db.chatMessage.create({ data: { groupId, text, system: true, userId: null } });
    announced++;
  }
  return announced;
}
