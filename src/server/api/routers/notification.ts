import { z } from "zod";
import { NotificationType, type Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { COMMUNITY_STREAKS_TITLE } from "@/server/services/community-streaks";

/**
 * Avisos que ya viven en el chat del grupo como mensaje de sistema (rachas de
 * los lunes y «está entrenando»). Se siguen guardando —el de rachas los usa
 * para no repetir el push y los antiguos de entreno ya existen—, pero la
 * bandeja no los lista ni los cuenta: el push al dispositivo se mantiene.
 */
const NOT_IN_CHAT: Prisma.NotificationWhereInput = {
  NOT: [{ title: COMMUNITY_STREAKS_TITLE }, { title: { contains: "está entrenando" } }],
};

export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        onlyUnread: z.boolean().default(false),
        type: z.nativeEnum(NotificationType).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }).optional(),
    )
    .query(({ ctx, input }) =>
      ctx.db.notification.findMany({
        where: {
          userId: ctx.session.user.id,
          ...NOT_IN_CHAT,
          ...(input?.onlyUnread ? { read: false } : {}),
          ...(input?.type ? { type: input.type } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input?.limit ?? 30,
      }),
    ),

  unreadCount: protectedProcedure.query(({ ctx }) =>
    ctx.db.notification.count({ where: { userId: ctx.session.user.id, read: false, ...NOT_IN_CHAT } }),
  ),

  markRead: protectedProcedure
    .input(z.object({ id: z.string().optional() })) // sin id = marcar todas
    .mutation(({ ctx, input }) =>
      ctx.db.notification.updateMany({
        where: { userId: ctx.session.user.id, ...(input.id ? { id: input.id } : {}) },
        data: { read: true },
      }),
    ),
});
