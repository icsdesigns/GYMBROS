import { z } from "zod";
import { Role } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { sendPushToUsers } from "@/server/services/push";
import {
  usersWithCategory, NOTIFY_CATEGORIES, CATEGORY_LABELS,
} from "@/server/services/notify-prefs";
import { RESET_TTL_MINUTES, createResetToken, resetUrl } from "@/server/services/password-reset";
import { groupMemberIds } from "@/server/services/group";
import { ensureDefaultRules } from "@/server/services/points";
import { RULE_INFO } from "@/lib/points";

export const adminRouter = createTRPCRouter({
  users: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      select: {
        id: true, name: true, email: true, role: true, createdAt: true,
        currentStreak: true, notifyPrefs: true,
        _count: {
          select: {
            workouts: true, attendances: true, personalRecords: true,
            pushSubscriptions: true,
          },
        },
        // Alta más reciente, para saber desde cuándo puede recibir avisos
        pushSubscriptions: {
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // El permiso del navegador no se puede consultar desde el servidor: lo que
    // sí sabemos es si el usuario llegó a registrar algún dispositivo, que es
    // justo lo que hace falta para poder enviarle un push.
    return users.map(({ notifyPrefs, pushSubscriptions, ...u }) => {
      const prefs = (notifyPrefs ?? {}) as Record<string, boolean>;
      const mutedCategories = NOTIFY_CATEGORIES.filter((c) => prefs[c] === false);
      return {
        ...u,
        push: {
          devices: u._count.pushSubscriptions,
          since: pushSubscriptions[0]?.createdAt ?? null,
          mutedCategories: mutedCategories.map((c) => CATEGORY_LABELS[c]),
        },
      };
    });
  }),

  setRole: adminProcedure
    .input(z.object({ userId: z.string(), role: z.nativeEnum(Role) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id && input.role === "USER") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes quitarte el rol de admin a ti mismo" });
      }
      return ctx.db.user.update({ where: { id: input.userId }, data: { role: input.role } });
    }),

  deleteUser: adminProcedure.input(z.object({ userId: z.string() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.session.user.id) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes eliminarte a ti mismo" });
    }
    await ctx.db.user.delete({ where: { id: input.userId } });
    return { ok: true };
  }),

  // ---------- Sistema de puntos personalizable ----------

  // Solo las reglas vigentes (ver RULE_INFO): los PR ya no puntúan y no aparecen
  listRules: adminProcedure.query(async ({ ctx }) => {
    await ensureDefaultRules(ctx.db);
    // Se filtra aquí y no en la consulta: un tipo que aún no exista en el enum de
    // la base de datos (p. ej. PROGRESS_WEEKLY sin migrar) haría fallar el IN entero
    const rules = await ctx.db.pointRule.findMany({ where: { type: { not: null } } });
    return rules.filter((r) => r.type && RULE_INFO[r.type]);
  }),

  updateRule: adminProcedure
    .input(
      z.object({
        id: z.string(),
        points: z.number().int().min(0).max(1000).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.pointRule.update({ where: { id }, data });
    }),

  deleteFeedItem: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) =>
    ctx.db.feedItem.delete({ where: { id: input.id } }),
  ),

  // Plantillas de notificación (disparadores fijos, contenido editable)
  notificationTemplates: adminProcedure.query(({ ctx }) =>
    ctx.db.notificationTemplate.findMany({ orderBy: { code: "asc" } }),
  ),

  updateTemplate: adminProcedure
    .input(
      z.object({
        code: z.string(),
        title: z.string().min(2).max(160).optional(),
        body: z.string().max(400).nullable().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { code, ...data } = input;
      return ctx.db.notificationTemplate.update({ where: { code }, data });
    }),

  // Notificación de prueba: se envía solo al admin que la lanza
  testNotification: adminProcedure
    .input(
      z.object({
        code: z.string().optional(), // plantilla concreta
        title: z.string().max(160).optional(),
        body: z.string().max(400).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      let title = input.title ?? "Notificación de prueba 🔔";
      let body = input.body ?? "Si ves esto, las notificaciones funcionan correctamente.";
      if (input.code) {
        const t = await ctx.db.notificationTemplate.findUnique({ where: { code: input.code } });
        if (t) {
          // Rellena los comodines con datos de ejemplo
          const vars: Record<string, string> = {
            name: ctx.session.user.name ?? "Alguien",
            count: "2 nuevos",
            exercises: "Press banca, Sentadilla",
            routine: "💪 Push",
            days: "3",
            target: "4",
            missing: "1",
            streak: "3",
            points: "+35 puntos",
            milestone: "¡Racha de 3 semanas! 🔥",
          };
          const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
          title = `[PRUEBA] ${fill(t.title)}`;
          body = t.body ? fill(t.body) : "";
        }
      }
      // Se salta las preferencias: es una prueba explícita del admin
      await ctx.db.notification.create({ data: { userId, type: "SYSTEM", title, body } });
      const { sendPushToUsers } = await import("@/server/services/push");
      await sendPushToUsers(ctx.db, [userId], { title, body });
      return { ok: true };
    }),

  broadcast: adminProcedure
    .input(z.object({ title: z.string().min(1).max(120), body: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      // Los avisos del admin llegan a todo el grupo activo sin excepción: no
      // existe preferencia que los silencie, porque son la vía para comunicar
      // cosas que nadie debería perderse.
      const recipients = await groupMemberIds(ctx.db, ctx.groupId);
      if (recipients.length === 0) return { sent: 0, skipped: 0 };
      await ctx.db.notification.createMany({
        data: recipients.map((id) => ({ userId: id, type: "SYSTEM" as const, title: input.title, body: input.body })),
      });
      await sendPushToUsers(ctx.db, recipients, { title: input.title, body: input.body });
      return { sent: recipients.length, skipped: 0 };
    }),

  /**
   * Enlace de recuperación para quien no puede recibirlo por push (iPhone sin
   * la app instalada, permisos denegados, móvil nuevo). El admin se lo pasa
   * por WhatsApp; caduca igual que los que se envían solos.
   */
  resetLink: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { id: true, name: true },
      });
      const token = await createResetToken(ctx.db, user.id);
      return { url: resetUrl(token), expiresInMinutes: RESET_TTL_MINUTES, name: user.name };
    }),
});
