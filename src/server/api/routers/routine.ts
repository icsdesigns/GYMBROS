import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { MuscleGroup } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { MAX_WORKOUT_MS } from "@/server/services/workout-service";
import { syncWeeklyTarget } from "@/server/services/weekly-target";
import { groupMemberIds } from "@/server/services/group";

const routineExerciseInput = z.object({
  exerciseId: z.string(),
  sets: z.number().int().min(1).max(20),
  reps: z.number().int().min(1).max(100),
  targetWeight: z.number().min(0).nullable().optional(),
  restSeconds: z.number().int().min(0).max(600).nullable().optional(),
  notes: z.string().max(200).nullable().optional(),
});

const routineInput = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(300).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#22c55e"),
  emoji: z.string().max(4).default("💪"),
  recommendedDays: z.array(z.number().int().min(0).max(6)).default([]),
  timesPerWeek: z.number().int().min(0).max(7).default(1),
  estimatedMinutes: z.number().int().min(5).max(300).nullable().optional(),
  exercises: z.array(routineExerciseInput).default([]),
});

/** Siguiente hueco al final del plan: las rutinas nuevas se añaden abajo. */
async function nextOrder(db: typeof import("@/lib/db").db, userId: string): Promise<number> {
  const last = await db.routine.findFirst({
    where: { userId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
}

async function assertOwner(db: typeof import("@/lib/db").db, routineId: string, userId: string) {
  const routine = await db.routine.findUnique({ where: { id: routineId } });
  if (!routine) throw new TRPCError({ code: "NOT_FOUND" });
  if (routine.userId !== userId) throw new TRPCError({ code: "FORBIDDEN" });
  return routine;
}

export const routineRouter = createTRPCRouter({
  mine: protectedProcedure.query(({ ctx }) =>
    ctx.db.routine.findMany({
      where: { userId: ctx.session.user.id },
      include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
  ),

  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const routine = await ctx.db.routine.findUnique({
      where: { id: input.id },
      include: {
        exercises: { include: { exercise: true }, orderBy: { order: "asc" } },
        user: { select: { id: true, name: true } },
      },
    });
    if (!routine) throw new TRPCError({ code: "NOT_FOUND" });
    // Las rutinas del grupo son públicas para cualquier usuario autenticado
    // Los pesos son privados: se ocultan si la rutina no es tuya
    if (routine.userId !== ctx.session.user.id) {
      return {
        ...routine,
        exercises: routine.exercises.map((e) => ({ ...e, targetWeight: null, notes: null })),
      };
    }
    return routine;
  }),

  create: protectedProcedure.input(routineInput).mutation(async ({ ctx, input }) => {
    const routine = await ctx.db.routine.create({
      data: {
        userId: ctx.session.user.id,
        order: await nextOrder(ctx.db, ctx.session.user.id),
        name: input.name,
        description: input.description,
        color: input.color,
        emoji: input.emoji,
        recommendedDays: input.recommendedDays,
        timesPerWeek: input.timesPerWeek,
        estimatedMinutes: input.estimatedMinutes,
        exercises: {
          create: input.exercises.map((e, i) => ({ ...e, order: i })),
        },
      },
    });
    await syncWeeklyTarget(ctx.db, ctx.session.user.id);
    return routine;
  }),

  update: protectedProcedure
    .input(routineInput.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx.db, input.id, ctx.session.user.id);
      const { id, exercises, ...data } = input;
      const routine = await ctx.db.routine.update({
        where: { id },
        data: {
          ...data,
          exercises: {
            deleteMany: {},
            create: exercises.map((e, i) => ({ ...e, order: i })),
          },
        },
      });
      await syncWeeklyTarget(ctx.db, ctx.session.user.id);
      return routine;
    }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await assertOwner(ctx.db, input.id, ctx.session.user.id);
    await ctx.db.routine.delete({ where: { id: input.id } });
    await syncWeeklyTarget(ctx.db, ctx.session.user.id);
    return { ok: true };
  }),

  duplicate: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const original = await assertOwner(ctx.db, input.id, ctx.session.user.id);
    const exercises = await ctx.db.routineExercise.findMany({ where: { routineId: input.id } });
    const copy = await ctx.db.routine.create({
      data: {
        userId: ctx.session.user.id,
        order: await nextOrder(ctx.db, ctx.session.user.id),
        name: `${original.name} (copia)`,
        description: original.description,
        color: original.color,
        emoji: original.emoji,
        recommendedDays: original.recommendedDays,
        timesPerWeek: original.timesPerWeek,
        estimatedMinutes: original.estimatedMinutes,
        exercises: {
          create: exercises.map((e) => ({
            exerciseId: e.exerciseId, order: e.order, sets: e.sets, reps: e.reps,
            targetWeight: e.targetWeight, restSeconds: e.restSeconds, notes: e.notes,
          })),
        },
      },
    });
    await syncWeeklyTarget(ctx.db, ctx.session.user.id);
    return copy;
  }),

  // Incluir o excluir la rutina del plan de entrenamiento
  toggleInPlan: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const routine = await assertOwner(ctx.db, input.id, ctx.session.user.id);
    const updated = await ctx.db.routine.update({
      where: { id: input.id },
      data: { inPlan: !routine.inPlan },
    });
    await syncWeeklyTarget(ctx.db, ctx.session.user.id);
    return updated;
  }),

  /**
   * Sube o baja la rutina en el plan de entrenamiento. Los órdenes se reescriben
   * 0..n-1 en la misma transacción, así que son inmunes a huecos o empates.
   */
  move: protectedProcedure
    .input(z.object({ id: z.string(), direction: z.enum(["up", "down"]) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertOwner(ctx.db, input.id, userId);
      const routines = await ctx.db.routine.findMany({
        where: { userId },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      const index = routines.findIndex((r) => r.id === input.id);
      const target = input.direction === "up" ? index - 1 : index + 1;
      if (index === -1 || target < 0 || target >= routines.length) return { ok: true };

      const ids = routines.map((r) => r.id);
      const [moved] = ids.splice(index, 1);
      ids.splice(target, 0, moved!);
      await ctx.db.$transaction(
        ids.map((id, order) => ctx.db.routine.update({ where: { id }, data: { order } })),
      );
      return { ok: true };
    }),

  /**
   * Lo que de verdad cuesta cada rutina, a partir de los entrenos ya hechos:
   * duración, series completadas y kg levantados en promedio.
   *
   * Solo cuentan las sesiones terminadas A MANO: las que cerró el temporizador
   * a las 3 horas no reflejan un entreno real y dispararían las medias.
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const workouts = await ctx.db.workout.findMany({
      where: { userId: ctx.session.user.id, endedAt: { not: null }, routineId: { not: null } },
      select: {
        routineId: true, startedAt: true, endedAt: true,
        totalVolume: true, totalSets: true,
      },
    });

    const acc = new Map<string, { sessions: number; minutes: number; sets: number; volume: number }>();
    for (const w of workouts) {
      const duration = w.endedAt!.getTime() - w.startedAt.getTime();
      if (duration >= MAX_WORKOUT_MS) continue; // cerrada sola a las 3 h
      const a = acc.get(w.routineId!) ?? { sessions: 0, minutes: 0, sets: 0, volume: 0 };
      a.sessions += 1;
      a.minutes += duration / 60_000;
      a.sets += w.totalSets;
      a.volume += w.totalVolume;
      acc.set(w.routineId!, a);
    }

    return Array.from(acc.entries()).map(([routineId, a]) => ({
      routineId,
      sessions: a.sessions,
      avgMinutes: Math.round(a.minutes / a.sessions),
      avgSets: Math.round(a.sets / a.sessions),
      avgVolume: Math.round(a.volume / a.sessions),
    }));
  }),

  // Importar una rutina desde un archivo JSON exportado
  importRoutine: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(60),
        description: z.string().max(300).nullable().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#22c55e"),
        emoji: z.string().max(4).default("💪"),
        recommendedDays: z.array(z.number().int().min(0).max(6)).default([]),
        timesPerWeek: z.number().int().min(0).max(7).default(1),
        estimatedMinutes: z.number().int().min(5).max(300).nullable().optional(),
        exercises: z
          .array(
            z.object({
              name: z.string().min(2).max(60),
              muscleGroup: z.nativeEnum(MuscleGroup).default("OTRO"),
              sets: z.number().int().min(1).max(20).default(3),
              reps: z.number().int().min(1).max(100).default(10),
              targetWeight: z.number().min(0).nullable().optional(),
              restSeconds: z.number().int().min(0).max(600).nullable().optional(),
              notes: z.string().max(200).nullable().optional(),
            }),
          )
          .min(1)
          .max(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // Resolver cada ejercicio por nombre (catálogo o propios); si no existe, se crea
      const exerciseIds: string[] = [];
      for (const e of input.exercises) {
        let exercise = await ctx.db.exercise.findFirst({
          where: {
            name: { equals: e.name, mode: "insensitive" },
            OR: [{ createdById: null }, { createdById: userId }],
          },
        });
        exercise ??= await ctx.db.exercise.create({
          data: { name: e.name, muscleGroup: e.muscleGroup, createdById: userId },
        });
        exerciseIds.push(exercise.id);
      }
      const imported = await ctx.db.routine.create({
        data: {
          userId,
          order: await nextOrder(ctx.db, userId),
          name: input.name,
          description: input.description,
          color: input.color,
          emoji: input.emoji,
          recommendedDays: input.recommendedDays,
          timesPerWeek: input.timesPerWeek,
          estimatedMinutes: input.estimatedMinutes,
          exercises: {
            create: input.exercises.map((e, i) => ({
              exerciseId: exerciseIds[i]!,
              order: i,
              sets: e.sets,
              reps: e.reps,
              targetWeight: e.targetWeight,
              restSeconds: e.restSeconds,
              notes: e.notes,
            })),
          },
        },
      });
      await syncWeeklyTarget(ctx.db, userId);
      return imported;
    }),

  // Rutinas del resto del grupo activo, públicas por defecto (sin pesos: son privados)
  shared: protectedProcedure.query(async ({ ctx }) => {
    const memberIds = (await groupMemberIds(ctx.db, ctx.groupId)).filter((id) => id !== ctx.session.user.id);
    if (memberIds.length === 0) return [];
    const routines = await ctx.db.routine.findMany({
      where: { userId: { in: memberIds } },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        exercises: { include: { exercise: true }, orderBy: { order: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return routines.map((r) => ({
      ...r,
      exercises: r.exercises.map((e) => ({ ...e, targetWeight: null, notes: null })),
    }));
  }),

  // Clonar la rutina de otro usuario (las rutinas del grupo son públicas)
  clone: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const original = await ctx.db.routine.findUnique({
      where: { id: input.id },
      include: { exercises: true, user: { select: { name: true } } },
    });
    if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Rutina no encontrada" });
    const cloned = await ctx.db.routine.create({
      data: {
        userId: ctx.session.user.id,
        order: await nextOrder(ctx.db, ctx.session.user.id),
        name: original.name,
        description: `Clonada de ${original.user.name}`,
        color: original.color,
        emoji: original.emoji,
        recommendedDays: original.recommendedDays,
        timesPerWeek: original.timesPerWeek,
        estimatedMinutes: original.estimatedMinutes,
        clonedFromId: original.id,
        exercises: {
          create: original.exercises.map((e) => ({
            exerciseId: e.exerciseId, order: e.order, sets: e.sets, reps: e.reps,
            // Los pesos del dueño original son privados: el clon empieza sin pesos
            targetWeight: null, restSeconds: e.restSeconds, notes: null,
          })),
        },
      },
    });
    await syncWeeklyTarget(ctx.db, ctx.session.user.id);
    return cloned;
  }),
});
