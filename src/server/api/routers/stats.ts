import { subMonths, startOfMonth, format } from "date-fns";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { routineTrendsFor } from "@/server/services/routine-trends";

export const statsRouter = createTRPCRouter({
  /**
   * Tendencia del volumen de entrenamiento de cada ejercicio de una rutina
   * (ver `routineTrendsFor`).
   */
  routineTrends: protectedProcedure.query(({ ctx }) =>
    routineTrendsFor(ctx.db, ctx.session.user.id),
  ),

  // Series mensuales de los últimos 12 meses para las gráficas
  monthly: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const from = startOfMonth(subMonths(new Date(), 11));

    const [attendances, workouts, prs] = await Promise.all([
      ctx.db.attendance.findMany({ where: { userId, date: { gte: from } }, select: { date: true } }),
      ctx.db.workout.findMany({
        where: { userId, endedAt: { not: null }, startedAt: { gte: from } },
        select: { startedAt: true, totalVolume: true },
      }),
      ctx.db.personalRecord.findMany({ where: { userId, date: { gte: from } }, select: { date: true } }),
    ]);

    const months: Record<string, { month: string; asistencias: number; entrenos: number; volumen: number; prs: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const key = format(subMonths(new Date(), i), "yyyy-MM");
      months[key] = { month: key, asistencias: 0, entrenos: 0, volumen: 0, prs: 0 };
    }
    for (const a of attendances) {
      const key = format(a.date, "yyyy-MM");
      if (months[key]) months[key].asistencias++;
    }
    for (const w of workouts) {
      const key = format(w.startedAt, "yyyy-MM");
      if (months[key]) {
        months[key].entrenos++;
        months[key].volumen += w.totalVolume;
      }
    }
    for (const p of prs) {
      const key = format(p.date, "yyyy-MM");
      if (months[key]) months[key].prs++;
    }
    return Object.values(months);
  }),
});
