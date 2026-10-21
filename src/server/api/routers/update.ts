import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { UpdateReaction } from "@prisma/client";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "@/server/api/trpc";
import { APP_UPDATES, nextUpdateFor } from "@/lib/updates";

/**
 * Novedades de la app. El catálogo vive en src/lib/updates.ts; la base de
 * datos guarda cuáles están publicadas (UpdatePublication) y quién ha visto
 * cada una con qué reacción. Una novedad sin publicar es un borrador.
 */
export const updateRouter = createTRPCRouter({
  // La novedad pendiente de ver, o null si está todo al día
  pending: protectedProcedure.query(async ({ ctx }) => {
    const [seen, published] = await Promise.all([
      ctx.db.updateSeen.findMany({ where: { userId: ctx.session.user.id }, select: { updateId: true } }),
      ctx.db.updatePublication.findMany({ select: { updateId: true } }),
    ]);
    return nextUpdateFor(
      seen.map((s) => s.updateId),
      published.map((p) => p.updateId),
    );
  }),

  // Marcar como vista con la reacción elegida. Idempotente: si ya estaba
  // marcada, se conserva la primera reacción.
  ack: protectedProcedure
    .input(z.object({ updateId: z.string(), reaction: z.nativeEnum(UpdateReaction) }))
    .mutation(async ({ ctx, input }) => {
      if (!APP_UPDATES.some((u) => u.id === input.updateId)) return { ok: false };
      const published = await ctx.db.updatePublication.findUnique({ where: { updateId: input.updateId } });
      if (!published) return { ok: false };
      await ctx.db.updateSeen.upsert({
        where: { userId_updateId: { userId: ctx.session.user.id, updateId: input.updateId } },
        update: {},
        create: { userId: ctx.session.user.id, ...input },
      });
      return { ok: true };
    }),

  /**
   * Cómo ha sentado cada novedad. Es ANÓNIMO a propósito: solo se devuelven
   * recuentos agregados, nunca quién ha votado qué.
   */
  reactions: adminProcedure.query(async ({ ctx }) => {
    const [grouped, totalUsers, publications] = await Promise.all([
      ctx.db.updateSeen.groupBy({ by: ["updateId", "reaction"], _count: { _all: true } }),
      ctx.db.user.count(),
      ctx.db.updatePublication.findMany({ select: { updateId: true, publishedAt: true } }),
    ]);
    const publishedAt = new Map(publications.map((p) => [p.updateId, p.publishedAt]));
    return APP_UPDATES.map((u) => {
      const like = grouped.find((g) => g.updateId === u.id && g.reaction === "LIKE")?._count._all ?? 0;
      const meh = grouped.find((g) => g.updateId === u.id && g.reaction === "MEH")?._count._all ?? 0;
      const seen = like + meh;
      return {
        id: u.id,
        title: u.title,
        emoji: u.emoji,
        date: u.date,
        publishedAt: publishedAt.get(u.id) ?? null,
        like,
        meh,
        seen,
        // Un borrador no tiene a nadie pendiente: aún no se ha mostrado
        pending: publishedAt.has(u.id) ? Math.max(0, totalUsers - seen) : 0,
        likePct: seen > 0 ? Math.round((like / seen) * 100) : null,
      };
    });
  }),

  /**
   * Publica una novedad del catálogo: desde ese momento la ven todos los
   * usuarios. Idempotente: si ya estaba publicada, no se cambia la fecha.
   */
  publish: adminProcedure.input(z.object({ updateId: z.string() })).mutation(async ({ ctx, input }) => {
    if (!APP_UPDATES.some((u) => u.id === input.updateId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Esa novedad no existe en el catálogo." });
    }
    const row = await ctx.db.updatePublication.upsert({
      where: { updateId: input.updateId },
      update: {},
      create: { updateId: input.updateId, publishedById: ctx.session.user.id },
    });
    return { publishedAt: row.publishedAt };
  }),
});
