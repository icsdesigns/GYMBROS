import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { subYears } from "date-fns";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { isGroupAdmin, requireGroup } from "@/server/services/group";
import { usersWithCategory } from "@/server/services/notify-prefs";
import { sendPushToUsers } from "@/server/services/push";

/** Quien ha leído el chat hace menos de esto se considera que lo tiene abierto (la vista sondea cada 5 s). */
const CHAT_OPEN_WINDOW_MS = 30_000;
/** Ruta donde vive el chat del grupo. */
const CHAT_URL = "/comunidad?tab=chat";

export const chatRouter = createTRPCRouter({
  // Últimos 100 mensajes, en orden cronológico.
  // No incluye avatares: la vista los resuelve con user.list (mucho más ligero).
  list: protectedProcedure.query(async ({ ctx }) => {
    // Los mensajes con más de 1 año se eliminan automáticamente
    await ctx.db.chatMessage.deleteMany({
      where: { createdAt: { lt: subYears(new Date(), 1) } },
    });
    if (!ctx.groupId) return [];
    // La marca de lectura se toma ANTES de leer: un mensaje que llegue mientras
    // tanto no cuenta como visto (ni lo ancla el «visto por» de los demás).
    const now = new Date();
    const messages = await ctx.db.chatMessage.findMany({
      where: { groupId: ctx.groupId },
      include: {
        user: { select: { id: true, name: true } },
        reactions: { select: { userId: true, emoji: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    // Abrir el chat marca todo como leído: en el usuario (respaldo del contador)
    // y en su pertenencia al grupo actual (lo que ven los demás).
    await ctx.db.user.update({
      where: { id: ctx.session.user.id },
      data: { lastChatReadAt: now },
    });
    await ctx.db.groupMember.updateMany({
      where: { groupId: ctx.groupId, userId: ctx.session.user.id },
      data: { lastChatReadAt: now },
    });
    return messages.reverse();
  }),

  // Hasta dónde ha leído el chat cada compañero del grupo actual.
  readMarkers: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.groupId) return [];
    const members = await ctx.db.groupMember.findMany({
      where: {
        groupId: ctx.groupId,
        userId: { not: ctx.session.user.id },
        lastChatReadAt: { not: null },
        user: { deletionRequestedAt: null },
      },
      select: { userId: true, lastChatReadAt: true, user: { select: { name: true } } },
    });
    return members.flatMap((m) =>
      m.lastChatReadAt ? [{ userId: m.userId, name: m.user.name, lastReadAt: m.lastChatReadAt }] : [],
    );
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.groupId) return 0;
    const [member, me] = await Promise.all([
      ctx.db.groupMember.findUnique({
        where: { groupId_userId: { groupId: ctx.groupId, userId: ctx.session.user.id } },
        select: { lastChatReadAt: true },
      }),
      ctx.db.user.findUniqueOrThrow({
        where: { id: ctx.session.user.id },
        select: { lastChatReadAt: true },
      }),
    ]);
    // Los mensajes propios no cuentan (los de sistema, que no tienen autor, sí)
    return ctx.db.chatMessage.count({
      where: {
        groupId: ctx.groupId,
        OR: [{ userId: null }, { userId: { not: ctx.session.user.id } }],
        createdAt: { gt: member?.lastChatReadAt ?? me.lastChatReadAt ?? new Date(0) },
      },
    });
  }),

  toggleReaction: protectedProcedure
    .input(z.object({ messageId: z.string(), emoji: z.enum(["👍", "💪", "🔥"]) }))
    .mutation(async ({ ctx, input }) => {
      const key = { messageId: input.messageId, userId: ctx.session.user.id, emoji: input.emoji };
      const existing = await ctx.db.chatReaction.findUnique({
        where: { messageId_userId_emoji: key },
      });
      if (existing) {
        await ctx.db.chatReaction.delete({ where: { messageId_userId_emoji: key } });
        return { reacted: false };
      }
      await ctx.db.chatReaction.create({ data: key });
      return { reacted: true };
    }),

  send: protectedProcedure
    .input(z.object({ text: z.string().trim().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const groupId = requireGroup(ctx.groupId);
      const message = await ctx.db.chatMessage.create({
        data: { userId: ctx.session.user.id, text: input.text, groupId },
      });

      // Push a los demás miembros con la categoría «chat» activa. Es un efecto
      // secundario: si falla, el mensaje ya está enviado y no debe fallar el envío.
      try {
        const [members, group, sender] = await Promise.all([
          ctx.db.groupMember.findMany({
            where: {
              groupId,
              userId: { not: ctx.session.user.id },
              user: { deletionRequestedAt: null },
            },
            select: { userId: true, lastChatReadAt: true },
          }),
          ctx.db.group.findUnique({ where: { id: groupId }, select: { name: true } }),
          ctx.db.user.findUnique({ where: { id: ctx.session.user.id }, select: { name: true } }),
        ]);
        // Quien tiene el chat abierto ya lo está viendo: sin aviso
        const openSince = Date.now() - CHAT_OPEN_WINDOW_MS;
        const candidates = members
          .filter((m) => !m.lastChatReadAt || m.lastChatReadAt.getTime() < openSince)
          .map((m) => m.userId);
        const recipients = await usersWithCategory(ctx.db, candidates, "chat");
        const senderName = sender?.name ?? "Chat";
        await sendPushToUsers(ctx.db, recipients, {
          title: group ? `${senderName} · ${group.name}` : senderName,
          body: input.text.length > 120 ? `${input.text.slice(0, 117).trimEnd()}…` : input.text,
          url: CHAT_URL,
          tag: `chat-${groupId}`,
        });
      } catch (error) {
        console.error("[chat] no se pudo enviar el push", error);
      }

      return message;
    }),

  // Cada uno puede borrar sus mensajes; el admin del grupo, cualquiera
  // (los de sistema no tienen autor: solo el admin)
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const message = await ctx.db.chatMessage.findUnique({ where: { id: input.id } });
    if (!message || message.groupId !== ctx.groupId) throw new TRPCError({ code: "NOT_FOUND" });
    const isAdmin =
      ctx.session.user.role === "ADMIN" ||
      (await isGroupAdmin(ctx.db, ctx.groupId, ctx.session.user.id));
    if ((message.system || message.userId !== ctx.session.user.id) && !isAdmin) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    await ctx.db.chatMessage.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
