import type { PrismaClient } from "@prisma/client";
import { usersWithCategory, type NotifyCategory } from "./notify-prefs";
import { sendPushToUsers } from "./push";

/** Quien ha leído el chat hace menos de esto se considera que lo tiene abierto (la vista sondea cada 5 s). */
const CHAT_OPEN_WINDOW_MS = 30_000;
/** Ruta donde vive el chat del grupo. */
export const CHAT_URL = "/comunidad?tab=chat";

/**
 * Push de un mensaje del chat a los demás miembros del grupo (nunca al autor ni
 * a quien pidió borrar su cuenta), filtrando por la categoría de avisos que
 * corresponda: «chat» para los mensajes de los miembros, «workouts» para el
 * aviso de entreno. Quien tiene el chat abierto ya lo está viendo: sin aviso.
 *
 * El título recibe el nombre del grupo (si se encuentra) para poder ponerlo.
 * El `tag` es el del chat del grupo: un aviso nuevo reemplaza al anterior en el
 * dispositivo. Es un efecto secundario: quien lo llame decide qué hacer si falla.
 */
export async function pushChatMessage(
  db: PrismaClient,
  opts: {
    groupId: string;
    /** Autor del mensaje; no recibe el aviso. */
    exceptUserId?: string;
    category: NotifyCategory;
    title: (groupName: string | null) => string;
    body?: string;
    /**
     * Quienes ya recibieron este mismo aviso desde otro grupo: se saltan y se
     * añaden los nuevos destinatarios. Así un aviso que se publica en varios
     * chats (el de «está entrenando») no llega repetido a quien comparte
     * varios grupos con el autor.
     */
    alreadyNotified?: Set<string>;
  },
): Promise<void> {
  const [members, group] = await Promise.all([
    db.groupMember.findMany({
      where: {
        groupId: opts.groupId,
        ...(opts.exceptUserId ? { userId: { not: opts.exceptUserId } } : {}),
        user: { deletionRequestedAt: null },
      },
      select: { userId: true, lastChatReadAt: true },
    }),
    db.group.findUnique({ where: { id: opts.groupId }, select: { name: true } }),
  ]);
  const openSince = Date.now() - CHAT_OPEN_WINDOW_MS;
  const candidates = members
    .filter((m) => !m.lastChatReadAt || m.lastChatReadAt.getTime() < openSince)
    .map((m) => m.userId)
    .filter((id) => !opts.alreadyNotified?.has(id));
  const recipients = await usersWithCategory(db, candidates, opts.category);
  if (recipients.length === 0) return;
  recipients.forEach((id) => opts.alreadyNotified?.add(id));
  await sendPushToUsers(db, recipients, {
    title: opts.title(group?.name ?? null),
    body: opts.body,
    url: CHAT_URL,
    tag: `chat-${opts.groupId}`,
  });
}
