import {
  startOfDay, startOfISOWeek, endOfISOWeek, startOfMonth, endOfMonth,
  subYears, differenceInCalendarMonths,
} from "date-fns";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { autoCloseStaleWorkouts } from "@/server/services/workout-service";
import { weekStreakState } from "@/server/services/streak";
import { reconcilePlan } from "@/server/services/plan-service";
import { seasonAt } from "@/server/services/season";
import { groupMemberIds } from "@/server/services/group";
import { WORKOUT_BONUS_POINTS } from "@/server/services/gamification";

export const dashboardRouter = createTRPCRouter({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    // Ambas comprueban primero con una consulta barata y salen si no hay nada que hacer
    await Promise.all([autoCloseStaleWorkouts(ctx.db, userId), reconcilePlan(ctx.db, userId)]);
    const now = new Date();

    const [user, weekAttendances, monthAttendances, yearAttendances, firstAttendance] =
      await Promise.all([
        ctx.db.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            name: true, avatarUrl: true, currentStreak: true, bestStreak: true,
            lastCompletedWeek: true, weeklyTargetDays: true,
          },
        }),
        ctx.db.attendance.count({
          where: { userId, date: { gte: startOfISOWeek(now), lte: endOfISOWeek(now) } },
        }),
        ctx.db.attendance.findMany({
          where: { userId, date: { gte: startOfMonth(now), lte: endOfMonth(now) } },
          select: { date: true },
        }),
        ctx.db.attendance.count({ where: { userId, date: { gte: subYears(now, 1) } } }),
        ctx.db.attendance.findFirst({
          where: { userId },
          orderBy: { date: "asc" },
          select: { date: true },
        }),
      ]);

    // Promedio mensual del último año. A quien lleve menos de doce meses se le
    // divide entre los que lleva: si no, su promedio saldría siempre por los suelos.
    const monthsTracked = firstAttendance
      ? Math.min(12, Math.max(1, differenceInCalendarMonths(now, firstAttendance.date) + 1))
      : 1;
    const monthlyAvgWorkouts = Math.round((yearAttendances / monthsTracked) * 10) / 10;

    // Desglose de puntos del usuario por categoría (histórico)
    const breakdownRaw = await ctx.db.pointEvent.groupBy({
      by: ["type"],
      where: { userId },
      _sum: { points: true },
      _count: true,
    });
    const pointsBreakdown = breakdownRaw.map((g) => ({
      type: g.type,
      points: g._sum.points ?? 0,
      count: g._count,
    }));
    const totalPoints = pointsBreakdown.reduce((acc, b) => acc + b.points, 0);

    // Puntos configurados de las etapas de racha
    const streakRulesRaw = await ctx.db.pointRule.findMany({
      where: { type: { in: ["STREAK_WEEK1", "STREAK_WEEK2", "STREAK_WEEK3", "STREAK_MONTH", "STREAK_CRACK"] } },
      select: { type: true, points: true, enabled: true },
    });
    const streakRules = streakRulesRaw
      .filter((r): r is typeof r & { type: NonNullable<typeof r.type> } => r.type !== null)
      .map((r) => ({ type: r.type as string, points: r.points, enabled: r.enabled }));

    /**
     * Temporada actual: puntos y puesto del usuario. Se mide contra los miembros
     * de su grupo activo, igual que el ranking, para que el puesto que enseña el
     * panel sea exactamente el mismo que el de Comunidad → Ranking.
     */
    const season = seasonAt(now);
    const memberIds = season.started ? await groupMemberIds(ctx.db, ctx.groupId) : [];
    const seasonAgg = season.started
      ? await ctx.db.pointEvent.groupBy({
          by: ["userId"],
          where: { date: { gte: season.from, lte: season.to }, userId: { in: memberIds } },
          _sum: { points: true },
        })
      : [];
    const seasonSorted = seasonAgg
      .map((g) => ({ userId: g.userId, points: g._sum.points ?? 0 }))
      .sort((a, b) => b.points - a.points);
    const seasonIndex = seasonSorted.findIndex((r) => r.userId === userId);

    const streak = weekStreakState({
      currentStreak: user.currentStreak,
      lastCompletedWeek: user.lastCompletedWeek,
      weeklyTargetDays: user.weeklyTargetDays,
      weekCount: weekAttendances,
      now,
    });

    return {
      user: { ...user, currentStreak: streak.streak },
      streak: {
        atRisk: streak.atRisk,
        lost: streak.lost,
        missing: streak.missing,
        daysLeft: streak.daysLeft,
        bestStreak: user.bestStreak,
      },
      weekAttendances,
      monthAttendanceDates: monthAttendances.map((a) => a.date),
      // Inicio lo usa como límite para navegar a meses anteriores.
      firstAttendanceDate: firstAttendance?.date ?? null,
      pointsBreakdown,
      totalPoints,
      streakRules,
      season: {
        index: season.index,
        started: season.started,
        daysLeft: season.daysLeft,
        from: season.from,
        to: season.to,
        myPoints: seasonIndex >= 0 ? seasonSorted[seasonIndex]?.points ?? 0 : 0,
        topPoints: Math.max(1, ...seasonSorted.map((r) => r.points)),
        position: seasonIndex >= 0 ? seasonIndex + 1 : null,
        players: seasonSorted.length,
      },
      yearAttendances,
      monthlyAvgWorkouts,
    };
  }),

  /**
   * Esquema del sistema de puntos para el botón de información de Inicio: las
   * reglas automáticas activas con sus valores reales (los que fija el admin).
   */
  pointRules: protectedProcedure.query(async ({ ctx }) => {
    const rules = await ctx.db.pointRule.findMany({
      where: { type: { not: null }, enabled: true },
      select: { type: true, points: true },
    });
    return {
      rules: rules.map((r) => ({ type: r.type as string, points: r.points })),
      workoutBonus: WORKOUT_BONUS_POINTS,
    };
  }),
});
