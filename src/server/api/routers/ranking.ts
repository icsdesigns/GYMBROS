import { z } from "zod";
import {
  startOfISOWeek, endOfISOWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  subWeeks, subMonths, subYears,
} from "date-fns";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { streaksForUsers } from "@/server/services/streak";
import { seasonAt, seasonRange, SEASON_ANCHOR } from "@/server/services/season";
import { groupMemberIds } from "@/server/services/group";

type Period = "week" | "month" | "season" | "year";

function periodRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  if (period === "week") return { from: startOfISOWeek(now), to: endOfISOWeek(now) };
  if (period === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
  if (period === "season") {
    const s = seasonAt(now);
    return { from: s.started ? s.from : SEASON_ANCHOR, to: s.to };
  }
  return { from: startOfYear(now), to: endOfYear(now) };
}

/**
 * Ventana previa COMPARABLE: el mismo tramo transcurrido, pero del periodo
 * anterior. Así un lunes se compara con el lunes de la semana pasada, no con
 * el domingo completo.
 */
function comparablePreviousRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  const cur = periodRange(period);
  const elapsedMs = now.getTime() - cur.from.getTime();
  let prevFrom: Date;
  if (period === "week") prevFrom = subWeeks(cur.from, 1);
  else if (period === "month") prevFrom = subMonths(cur.from, 1);
  else if (period === "year") prevFrom = subYears(cur.from, 1);
  else {
    const s = seasonAt(now);
    prevFrom = seasonRange(Math.max(1, s.index - 1)).from;
  }
  return { from: prevFrom, to: new Date(prevFrom.getTime() + elapsedMs) };
}

/**
 * Los puntos son del usuario y se ganan una sola vez, estén en el grupo que
 * estén: lo que cambia de un grupo a otro es CONTRA QUIÉN se comparan.
 */
async function computeRanking(
  db: typeof import("@/lib/db").db,
  from: Date,
  to: Date,
  memberIds: string[],
): Promise<Array<{ userId: string; points: number }>> {
  const grouped = await db.pointEvent.groupBy({
    by: ["userId"],
    where: { date: { gte: from, lte: to }, userId: { in: memberIds } },
    _sum: { points: true },
  });
  return grouped
    .map((g) => ({ userId: g.userId, points: g._sum.points ?? 0 }))
    .sort((a, b) => b.points - a.points);
}

export const rankingRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ period: z.enum(["week", "month", "season", "year"]).default("month") }))
    .query(async ({ ctx, input }) => {
      const current = periodRange(input.period);
      // Comparación por tramos equivalentes de tiempo transcurrido
      const previous = comparablePreviousRange(input.period);

      const memberIds = await groupMemberIds(ctx.db, ctx.groupId);
      const [users, currentRanking, previousRanking] = await Promise.all([
        ctx.db.user.findMany({
          where: { id: { in: memberIds } },
          select: {
            id: true, name: true, avatarUrl: true,
            currentStreak: true, lastCompletedWeek: true, weeklyTargetDays: true,
          },
        }),
        computeRanking(ctx.db, current.from, current.to, memberIds),
        computeRanking(ctx.db, previous.from, previous.to, memberIds),
      ]);
      const streaks = await streaksForUsers(ctx.db, users);

      // Veces que ha entrenado cada uno en la semana activa (lunes-domingo),
      // sea cual sea el periodo del ranking: se muestra junto a cada nombre.
      const week = periodRange("week");
      const weekGrouped =
        memberIds.length > 0
          ? await ctx.db.attendance.groupBy({
              by: ["userId"],
              where: { userId: { in: memberIds }, date: { gte: week.from, lte: week.to } },
              _count: { _all: true },
            })
          : [];
      const weekTrainings = new Map(weekGrouped.map((g) => [g.userId, g._count._all]));

      const prevPos = new Map(previousRanking.map((r, i) => [r.userId, i + 1]));
      const pointsByUser = new Map(currentRanking.map((r) => [r.userId, r.points]));

      const rows = users
        .map(({ lastCompletedWeek, weeklyTargetDays, ...u }) => ({
          user: { ...u, currentStreak: streaks.get(u.id) ?? 0 },
          points: pointsByUser.get(u.id) ?? 0,
          weekTrainings: weekTrainings.get(u.id) ?? 0,
        }))
        .sort((a, b) => b.points - a.points)
        .map((row, i) => {
          const position = i + 1;
          const prev = prevPos.get(row.user.id) ?? null;
          return {
            ...row,
            position,
            previousPosition: prev,
            delta: prev === null ? null : prev - position,
            medal: position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : null,
          };
        });

      const myPosition = rows.find((r) => r.user.id === ctx.session.user.id)?.position ?? null;
      const season = seasonAt();
      return {
        rows,
        myPosition,
        from: current.from,
        to: current.to,
        // Info de temporada (solo relevante para el periodo "season")
        season: {
          index: season.index,
          started: season.started,
          daysLeft: season.daysLeft,
          from: season.from,
          to: season.to,
        },
      };
    }),

  myBreakdown: protectedProcedure
    .input(z.object({ period: z.enum(["week", "month", "season", "year"]).default("month") }))
    .query(async ({ ctx, input }) => {
      const { from, to } = periodRange(input.period);
      const grouped = await ctx.db.pointEvent.groupBy({
        by: ["type"],
        where: { userId: ctx.session.user.id, date: { gte: from, lte: to } },
        _sum: { points: true },
        _count: true,
      });
      return grouped.map((g) => ({ type: g.type, points: g._sum.points ?? 0, count: g._count }));
    }),

  // Palmarés: campeones de las temporadas ya terminadas (3 meses, desde 15-ago-2026)
  seasons: protectedProcedure.query(async ({ ctx }) => {
    const memberIds = await groupMemberIds(ctx.db, ctx.groupId);
    const users = await ctx.db.user.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, name: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const currentIndex = seasonAt().index;

    const seasons: Array<{
      label: string;
      champion: { name: string; avatarUrl: string | null } | null;
      podium: Array<{ name: string; avatarUrl: string | null; points: number }>;
    }> = [];
    // Solo temporadas ya terminadas (índice < actual)
    for (let idx = currentIndex - 1; idx >= 1 && seasons.length < 8; idx--) {
      const { from, to } = seasonRange(idx);
      const ranking = await computeRanking(ctx.db, from, to, memberIds);
      if (ranking.length === 0) continue;
      const podium = ranking.slice(0, 3).map((r) => ({
        name: byId.get(r.userId)?.name ?? "¿?",
        avatarUrl: byId.get(r.userId)?.avatarUrl ?? null,
        points: r.points,
      }));
      seasons.push({
        label: `Temporada ${idx}`,
        champion: podium[0] ? { name: podium[0].name, avatarUrl: podium[0].avatarUrl } : null,
        podium,
      });
    }
    return seasons;
  }),
});
