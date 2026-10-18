import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { computeStableMarks, type StableMark } from "@/lib/stable-mark";
import { awardPoints, addFeed, checkAchievements } from "@/server/services/gamification";

export const prRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        exerciseId: z.string(),
        weight: z.number().min(0).max(1000),
        reps: z.number().int().min(1).max(100).default(1),
        date: z.date().optional(),
        notes: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const exercise = await ctx.db.exercise.findUnique({ where: { id: input.exerciseId } });
      if (!exercise) throw new TRPCError({ code: "NOT_FOUND" });

      const pr = await ctx.db.personalRecord.create({
        data: { userId, ...input, date: input.date ?? new Date() },
      });

      const best = await ctx.db.personalRecord.findFirst({
        where: { userId, exerciseId: input.exerciseId, id: { not: pr.id } },
        orderBy: { weight: "desc" },
      });
      const isNewBest = !best || input.weight > best.weight;
      if (isNewBest) {
        await awardPoints(ctx.db, userId, "NEW_PR", { exerciseId: input.exerciseId, weight: input.weight });
        const user = await ctx.db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
        // Público: el evento del PR. Privado: el peso alcanzado.
        await addFeed(ctx.db, userId, "PR", `${user.name} consiguió un nuevo PR en ${exercise.name} 🎉`);
        const { notifyGroupFromTemplate } = await import("@/server/services/notify-templates");
        await notifyGroupFromTemplate(ctx.db, userId, "FRIEND_PR", "prs", {
          name: user.name, count: "1 nuevo", exercises: exercise.name,
        }, "FRIEND_PR");
        await checkAchievements(ctx.db, userId);
      }
      return { pr, isNewBest };
    }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const pr = await ctx.db.personalRecord.findUnique({ where: { id: input.id } });
    if (!pr || pr.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" });
    await ctx.db.personalRecord.delete({ where: { id: input.id } });
    return { ok: true };
  }),

  recent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }).optional())
    .query(({ ctx, input }) =>
      ctx.db.personalRecord.findMany({
        where: { userId: ctx.session.user.id },
        include: { exercise: true },
        orderBy: { date: "desc" },
        take: input?.limit ?? 10,
      }),
    ),

  // Mejor marca por ejercicio
  bests: protectedProcedure.query(async ({ ctx }) => {
    const prs = await ctx.db.personalRecord.findMany({
      where: { userId: ctx.session.user.id },
      include: { exercise: true },
      orderBy: [{ weight: "desc" }, { date: "asc" }],
    });
    const seen = new Set<string>();
    return prs.filter((pr) => {
      if (seen.has(pr.exerciseId)) return false;
      seen.add(pr.exerciseId);
      return true;
    });
  }),

  /**
   * Marcas agrupadas por rutina: para cada ejercicio de cada rutina, su PR
   * (peso, reps de esa serie y fecha) y su mejor marca estable (ver
   * lib/stable-mark). Aparecen los ejercicios que tengan al menos una de las
   * dos cosas; los que no tienen ninguna se omiten. Los ejercicios con PR que
   * ya no están en ninguna rutina se recogen en un último grupo para que no se
   * pierdan de vista. Los ejercicios sin peso solo tienen PR (en repeticiones).
   */
  byRoutine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [routines, prs, workouts] = await Promise.all([
      ctx.db.routine.findMany({
        where: { userId },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true, name: true, emoji: true, color: true,
          exercises: {
            orderBy: { order: "asc" },
            select: { exercise: { select: { id: true, name: true, noWeight: true } } },
          },
        },
      }),
      ctx.db.personalRecord.findMany({
        where: { userId },
        include: { exercise: { select: { id: true, name: true, noWeight: true } } },
      }),
      // Mismo origen que workout.stableMarks: entrenos terminados, solo ejercicios con peso
      ctx.db.workout.findMany({
        where: { userId, endedAt: { not: null } },
        select: {
          startedAt: true,
          exercises: {
            where: { exercise: { noWeight: false } },
            select: {
              exerciseId: true,
              sets: { select: { reps: true, weight: true, completed: true } },
            },
          },
        },
      }),
    ]);
    const marks = computeStableMarks(workouts);

    // PR por ejercicio: el peso manda, salvo en los ejercicios sin peso, donde
    // el récord son las repeticiones de una serie.
    type Pr = { weight: number; reps: number; date: Date };
    const prInfo = new Map<string, { name: string; noWeight: boolean; pr: Pr }>();
    for (const pr of prs) {
      const current = prInfo.get(pr.exerciseId)?.pr;
      const better = !current
        ? true
        : pr.exercise.noWeight
          ? pr.reps > current.reps
          : pr.weight > current.weight || (pr.weight === current.weight && pr.reps > current.reps);
      if (better) {
        prInfo.set(pr.exerciseId, {
          name: pr.exercise.name,
          noWeight: pr.exercise.noWeight,
          pr: { weight: pr.weight, reps: pr.reps, date: pr.date },
        });
      }
    }

    type Entry = {
      exerciseId: string;
      name: string;
      noWeight: boolean;
      pr: Pr | null;
      mark: StableMark | null;
    };
    const entryFor = (ex: { id: string; name: string; noWeight: boolean }): Entry | null => {
      const pr = prInfo.get(ex.id)?.pr ?? null;
      const mark = ex.noWeight ? null : (marks[ex.id] ?? null);
      if (!pr && !mark) return null;
      return { exerciseId: ex.id, name: ex.name, noWeight: ex.noWeight, pr, mark };
    };

    const grouped = new Set<string>();
    const groups = routines
      .map((r) => {
        const records = r.exercises
          .map((re) => entryFor(re.exercise))
          .filter((x): x is Entry => x !== null);
        records.forEach((x) => grouped.add(x.exerciseId));
        return { id: r.id, name: r.name, emoji: r.emoji, color: r.color, records };
      })
      .filter((g) => g.records.length > 0);

    const orphans = Array.from(prInfo, ([id, info]) => entryFor({ id, name: info.name, noWeight: info.noWeight }))
      .filter((x): x is Entry => x !== null && !grouped.has(x.exerciseId));
    if (orphans.length > 0) {
      groups.push({
        id: "otros",
        name: "Otros ejercicios",
        emoji: "🏋️",
        color: "#64748b",
        records: orphans.sort((a, b) => a.name.localeCompare(b.name, "es")),
      });
    }
    return groups;
  }),

  // Evolución de un ejercicio para la gráfica
  history: protectedProcedure
    .input(z.object({ exerciseId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.personalRecord.findMany({
        where: { userId: ctx.session.user.id, exerciseId: input.exerciseId },
        include: { exercise: true },
        orderBy: { date: "asc" },
      }),
    ),
});
