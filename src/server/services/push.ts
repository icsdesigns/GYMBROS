import type { PrismaClient } from "@prisma/client";
import webpush from "web-push";

let configured = false;

function ensureConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false; // push no configurado: se ignora silenciosamente
  if (!configured) {
    webpush.setVapidDetails("mailto:ivacuaano@gmail.com", publicKey, privateKey);
    configured = true;
  }
  return true;
}

/**
 * Envía una notificación push a todos los dispositivos de los usuarios dados.
 * Las suscripciones caducadas (410/404) se eliminan automáticamente.
 */
export type PushResult = {
  /** Dispositivos a los que se aceptó el envío. */
  delivered: number;
  /** Dispositivos que fallaron sin llegar a caducar. */
  failed: number;
  /** Suscripciones caducadas que se han eliminado. */
  expired: number;
};

export async function sendPushToUsers(
  db: PrismaClient,
  userIds: string[],
  payload: {
    title: string;
    body?: string;
    url?: string;
    /** Con etiqueta, un aviso nuevo REEMPLAZA al anterior con la misma en el dispositivo. */
    tag?: string;
  },
): Promise<PushResult> {
  const result: PushResult = { delivered: 0, failed: 0, expired: 0 };
  if (userIds.length === 0 || !ensureConfigured()) return result;
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
        result.delivered += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          result.expired += 1;
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          result.failed += 1;
        }
      }
    }),
  );
  return result;
}
