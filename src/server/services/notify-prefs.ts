import type { PrismaClient } from "@prisma/client";

/**
 * Categorías generales de notificación que cada usuario puede activar/desactivar.
 *
 * Lo que manda el administrador —difusiones y encuestas— NO está aquí a
 * propósito: son comunicaciones del grupo que deben llegar a todo el mundo, así
 * que no pasan por ningún filtro de preferencias.
 */
export const NOTIFY_CATEGORIES = [
  "prs", "workouts", "streaks", "reminders", "system", "chat",
] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<NotifyCategory, string> = {
  prs: "PRs del grupo",
  workouts: "Entrenos del grupo",
  streaks: "Rachas y semanas",
  reminders: "Recordatorios de entreno",
  system: "Sistema y logros",
  chat: "Mensajes del chat",
};

/** Por defecto todas están activas: solo se desactiva si el usuario lo pone en false. */
export function categoryEnabled(prefs: unknown, category: NotifyCategory): boolean {
  const p = (prefs ?? {}) as Record<string, boolean>;
  return p[category] !== false;
}

/** Filtra una lista de usuarios dejando los que tienen activa esa categoría. */
export async function usersWithCategory(
  db: PrismaClient,
  userIds: string[],
  category: NotifyCategory,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, notifyPrefs: true },
  });
  return users.filter((u) => categoryEnabled(u.notifyPrefs, category)).map((u) => u.id);
}

/**
 * Rellena {placeholders} de una plantilla.
 *
 * Un comodín sin valor desaparece sin dejar rastro: si el texto queda con
 * espacios de más (o acaba en uno), se limpia. Así una plantilla que termina
 * en «{points}» se sigue leyendo bien cuando no hay puntos que contar.
 */
export function fillTemplate(text: string, vars: Record<string, string | number>): string {
  return text
    .replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
