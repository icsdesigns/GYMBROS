import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { computeStableMarks, type StableMark } from "@/lib/stable-mark";
import {
  finishWorkout, autoCloseStaleWorkouts, notifyWorkoutStartedIfDue, MAX_WORKOUT_MS,
} from "@/server/services/workout-service";
import { applyWorkoutIncident, MAX_INCIDENT_CHANGES } from "@/server/services/workout-incident-service";

/** Cuántas sesiones anteriores se miran para cazar erratas al terminar. */
const SUGGESTION_SAMPLE = 5;

/**
 * Series de la última sesión de un ejercicio, por número de serie.
 *
 * Se proponen tal cual se hicieron, decimales incluidos: con la media de varias
 * sesiones un 42,5 se quedaba en 43 y la sugerencia no era nada que uno hubiera
 * levantado. Si hoy hay más series que entonces, las de más repiten la última.
 */
function lastSessionSets(
  sets: Array<{ setNumber: number; reps: number; weight: number }>,
): (setNumber: number) => { reps: number; weight: number } | undefined {
  const sorted = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  const bySet = new Map(sorted.map((s) => [s.setNumber, s]));
  const last = sorted[sorted.length - 1];
  return (setNumber) => bySet.get(setNumber) ?? last;
}

/**
 * Cuánto tiene que dispararse un valor sobre lo que se venía haciendo para
 * sospechar que es una errata: casi el doble Y al menos 5 kg (o 5 reps) de
 * salto. Las dos condiciones a la vez, porque por separado avisan de más:
 * pasar de 2,5 a 5 kg en un ejercicio pequeño es normal, y +5 kg sobre 100
 * también.
 */
const OUTLIER_RATIO = 1.8;
const OUTLIER_ABS_KG = 5;
const OUTLIER_ABS_REPS = 5;

export const workoutRouter = createTRPCRouter({
  // Iniciar sesión de entrenamiento (opcionalmente desde una rutina)
  start: protectedProcedure
    .input(z.object({ routineId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await autoCloseStaleWorkouts(ctx.db, ctx.session.user.id);
      const active = await ctx.db.workout.findFirst({
        where: { userId: ctx.session.user.id, endedAt: null },
      });
      if (active) return active; // ya hay una sesión en curso

      let exercisesData: { exerciseId: string; order: number; sets: { setNumber: number; reps: number; weight: number }[] }[] = [];
      if (input.routineId) {
        const routine = await ctx.db.routine.findUnique({
          where: { id: input.routineId },
          include: { exercises: { orderBy: { order: "asc" } } },
        });
        if (!routine) throw new TRPCError({ code: "NOT_FOUND" });
        if (routine.userId !== ctx.session.user.id && !routine.isShared) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        // Precargar pesos y reps con los de la ÚLTIMA sesión en la que se
        // completó alguna serie de cada ejercicio (si no hay historial, se usa
        // el objetivo de la rutina). touched=false hasta que se editen.
        exercisesData = await Promise.all(
          routine.exercises.map(async (re) => {
            const last = await ctx.db.workoutExercise.findFirst({
              where: {
                exerciseId: re.exerciseId,
                workout: { userId: ctx.session.user.id, endedAt: { not: null } },
                sets: { some: { completed: true } },
              },
              orderBy: { workout: { startedAt: "desc" } },
              select: {
                sets: {
                  where: { completed: true },
                  select: { setNumber: true, reps: true, weight: true },
                },
              },
            });
            const previous = lastSessionSets(last?.sets ?? []);
            return {
              exerciseId: re.exerciseId,
              order: re.order,
              sets: Array.from({ length: re.sets }, (_, i) => {
                const prev = previous(i + 1);
                return {
                  setNumber: i + 1,
                  reps: prev?.reps ?? re.reps,
                  weight: prev?.weight ?? re.targetWeight ?? 0,
                };
              }),
            };
          }),
        );
      }

      return ctx.db.workout.create({
        data: {
          userId: ctx.session.user.id,
          routineId: input.routineId,
          exercises: {
            create: exercisesData.map((e) => ({
              exerciseId: e.exerciseId,
              order: e.order,
              sets: { create: e.sets },
            })),
          },
        },
      });
    }),

  active: protectedProcedure.query(async ({ ctx }) => {
    // Autocierre: si hay una sesión con más de 3 horas, se finaliza sola
    await autoCloseStaleWorkouts(ctx.db, ctx.session.user.id);
    // Aviso al grupo si el entreno lleva más de 20 min
    await notifyWorkoutStartedIfDue(ctx.db, ctx.session.user.id);
    return ctx.db.workout.findFirst({
      where: { userId: ctx.session.user.id, endedAt: null },
      include: {
        routine: true,
        exercises: {
          orderBy: { order: "asc" },
          include: { exercise: true, sets: { orderBy: { setNumber: "asc" } } },
        },
      },
    });
  }),

  /**
   * Versión ligera de `active` para el botón flotante, que se consulta en
   * TODAS las pantallas: devuelve solo lo que se pinta y no arrastra las series
   * ni dispara los efectos de autocierre.
   *
   * Un entreno de más de 3 horas ya no cuenta como en curso aunque aún no se
   * haya cerrado: el cierre lo hace otra consulta que puede ir en paralelo con
   * esta, y si esta llegaba antes el botón se quedaba colgado sobre una sesión
   * que ya estaba cerrada.
   */
  activeBadge: protectedProcedure.query(async ({ ctx }) => {
    const workout = await ctx.db.workout.findFirst({
      where: {
        userId: ctx.session.user.id,
        endedAt: null,
        startedAt: { gt: new Date(Date.now() - MAX_WORKOUT_MS) },
      },
      select: {
        id: true,
        startedAt: true,
        routine: { select: { name: true, emoji: true } },
      },
    });
    if (!workout) return null;

    const [totalSets, doneSets] = await Promise.all([
      ctx.db.workoutSet.count({ where: { workoutExercise: { workoutId: workout.id } } }),
      ctx.db.workoutSet.count({
        where: { workoutExercise: { workoutId: workout.id }, completed: true },
      }),
    ]);
    return { ...workout, totalSets, doneSets };
  }),

  /**
   * Series del entreno en curso que se salen mucho de lo registrado hasta
   * ahora. Se consulta al ir a terminar la rutina para poder preguntar
   * "¿seguro que son 18 y no 10?": teclear con prisa en el gimnasio produce
   * erratas y, una vez guardadas, contaminan medias, PRs y gráficas.
   *
   * Solo mira series completadas (las únicas que se guardan) y compara con el
   * máximo de las últimas sesiones del mismo ejercicio. Sin historial no hay
   * con qué comparar, así que no se avisa de nada.
   */
  outliers: protectedProcedure
    .input(z.object({ workoutId: z.string() }))
    .query(async ({ ctx, input }) => {
      const workout = await ctx.db.workout.findUnique({
        where: { id: input.workoutId },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: { exercise: true, sets: { orderBy: { setNumber: "asc" } } },
          },
        },
      });
      if (!workout || workout.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const found: Array<{
        setId: string;
        exercise: string;
        setNumber: number;
        unit: "kg" | "reps";
        value: number;
        previous: number;
      }> = [];

      await Promise.all(
        workout.exercises.map(async (we) => {
          const done = we.sets.filter((s) => s.completed);
          if (done.length === 0) return;

          const history = await ctx.db.workoutExercise.findMany({
            where: {
              exerciseId: we.exerciseId,
              workoutId: { not: workout.id },
              workout: { userId: ctx.session.user.id, endedAt: { not: null } },
            },
            orderBy: { workout: { startedAt: "desc" } },
            take: SUGGESTION_SAMPLE,
            select: { sets: { select: { reps: true, weight: true, completed: true } } },
          });

          const noWeight = we.exercise.noWeight;
          const previous = Math.max(
            0,
            ...history.flatMap((h) =>
              h.sets.filter((s) => s.completed).map((s) => (noWeight ? s.reps : s.weight)),
            ),
          );
          if (previous <= 0) return; // sin historial no hay errata que detectar

          const minJump = noWeight ? OUTLIER_ABS_REPS : OUTLIER_ABS_KG;
          for (const s of done) {
            const value = noWeight ? s.reps : s.weight;
            if (value >= previous * OUTLIER_RATIO && value - previous >= minJump) {
              found.push({
                setId: s.id,
                exercise: we.exercise.name,
                setNumber: s.setNumber,
                unit: noWeight ? "reps" : "kg",
                value,
                previous,
              });
            }
          }
        }),
      );

      return found.sort(
        (a, b) => a.exercise.localeCompare(b.exercise) || a.setNumber - b.setNumber,
      );
    }),

  updateSet: protectedProcedure
    .input(
      z.object({
        setId: z.string(),
        reps: z.number().int().min(0).max(200).optional(),
        weight: z.number().min(0).max(1000).optional(),
        completed: z.boolean().optional(),
        notes: z.string().max(200).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const set = await ctx.db.workoutSet.findUnique({
        where: { id: input.setId },
        include: { workoutExercise: { include: { workout: true } } },
      });
      if (!set || set.workoutExercise.workout.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const { setId, ...data } = input;
      // Editar o completar una serie la marca como "de esta sesión"
      return ctx.db.workoutSet.update({ where: { id: setId }, data: { ...data, touched: true } });
    }),

  addSet: protectedProcedure
    .input(z.object({ workoutExerciseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const we = await ctx.db.workoutExercise.findUnique({
        where: { id: input.workoutExerciseId },
        include: { workout: true, sets: { orderBy: { setNumber: "desc" }, take: 1 } },
      });
      if (!we || we.workout.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      const last = we.sets[0];
      return ctx.db.workoutSet.create({
        data: {
          workoutExerciseId: we.id,
          setNumber: (last?.setNumber ?? 0) + 1,
          reps: last?.reps ?? 10,
          weight: last?.weight ?? 0,
        },
      });
    }),

  /**
   * Quitar una serie del entreno en curso. La última de un ejercicio no se
   * puede borrar: un ejercicio sin series no significa nada, para eso está
   * simplemente no completarlo.
   */
  removeSet: protectedProcedure
    .input(z.object({ setId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const set = await ctx.db.workoutSet.findUnique({
        where: { id: input.setId },
        include: {
          workoutExercise: {
            include: { workout: true, sets: { orderBy: { setNumber: "asc" } } },
          },
        },
      });
      if (!set || set.workoutExercise.workout.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (set.workoutExercise.sets.length <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El ejercicio necesita al menos una serie" });
      }
      await ctx.db.workoutSet.delete({ where: { id: set.id } });
      // Las que iban detrás suben un número: la lista no deja huecos
      const after = set.workoutExercise.sets.filter((x) => x.setNumber > set.setNumber);
      await Promise.all(
        after.map((x) =>
          ctx.db.workoutSet.update({ where: { id: x.id }, data: { setNumber: x.setNumber - 1 } }),
        ),
      );
      return { ok: true };
    }),

  addExercise: protectedProcedure
    .input(z.object({ workoutId: z.string(), exerciseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const workout = await ctx.db.workout.findUnique({
        where: { id: input.workoutId },
        include: { exercises: { orderBy: { order: "desc" }, take: 1 } },
      });
      if (!workout || workout.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.db.workoutExercise.create({
        data: {
          workoutId: workout.id,
          exerciseId: input.exerciseId,
          order: (workout.exercises[0]?.order ?? -1) + 1,
          sets: { create: [{ setNumber: 1, reps: 10, weight: 0 }] },
        },
      });
    }),

  cancel: protectedProcedure.input(z.object({ workoutId: z.string() })).mutation(async ({ ctx, input }) => {
    const workout = await ctx.db.workout.findUnique({ where: { id: input.workoutId } });
    if (!workout || workout.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" });
    await ctx.db.workout.delete({ where: { id: input.workoutId } });
    return { ok: true };
  }),

  // Finalizar: calcula totales, detecta PRs y otorga puntos (ver workout-service)
  finish: protectedProcedure
    .input(z.object({ workoutId: z.string(), notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const workout = await ctx.db.workout.findUnique({ where: { id: input.workoutId } });
      if (!workout || workout.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      return finishWorkout(ctx.db, input.workoutId, { notes: input.notes });
    }),

  /**
   * Incidencia sobre una sesión ya guardada: corrige los valores mal anotados
   * —la sesión entera si hace falta—, marca las series que se hicieron y se
   * quedaron sin apuntar, añade las que faltaban y rehace lo que aquellos
   * números provocaron (totales, PRs automáticos y sus puntos). Solo se admite
   * UNA incidencia por sesión. Ver workout-incident-service.
   */
  reportIncident: protectedProcedure
    .input(
      z.object({
        workoutId: z.string(),
        reason: z.string().max(200).optional(),
        changes: z
          .array(
            z.object({
              setId: z.string(),
              reps: z.number().int().min(0).max(200).optional(),
              weight: z.number().min(0).max(1000).optional(),
              completed: z.boolean().optional(),
            }),
          )
          .max(MAX_INCIDENT_CHANGES) // techo de seguridad, no regla de producto
          .default([]),
        // Series que no se llegaron a apuntar en la sesión
        additions: z
          .array(
            z.object({
              workoutExerciseId: z.string(),
              reps: z.number().int().min(0).max(200),
              weight: z.number().min(0).max(1000).optional(),
              completed: z.boolean().optional(),
            }),
          )
          .max(MAX_INCIDENT_CHANGES)
          .default([]),
      }).refine((v) => v.changes.length + v.additions.length > 0, {
        message: "No hay nada que corregir",
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const already = await ctx.db.workoutIncident.count({
        where: { workoutId: input.workoutId, userId: ctx.session.user.id },
      });
      if (already > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esta sesión ya se corrigió: solo se admite una incidencia por entrenamiento.",
        });
      }
      const result = await applyWorkoutIncident(
        ctx.db,
        ctx.session.user.id,
        input.workoutId,
        input.changes,
        input.reason,
        input.additions,
      );
      if (!result) throw new TRPCError({ code: "FORBIDDEN" });
      return result;
    }),

  /**
   * Mejor marca estable de cada ejercicio con peso del usuario (ver
   * lib/stable-mark): clave = exerciseId.
   */
  stableMarks: protectedProcedure.query(async ({ ctx }): Promise<Record<string, StableMark>> => {
    const workouts = await ctx.db.workout.findMany({
      where: { userId: ctx.session.user.id, endedAt: { not: null } },
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
    });
    return computeStableMarks(workouts);
  }),

  history: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }).optional())
    .query(({ ctx, input }) =>
      ctx.db.workout.findMany({
        where: { userId: ctx.session.user.id, endedAt: { not: null } },
        include: {
          routine: true,
          exercises: {
            orderBy: { order: "asc" },
            include: { exercise: true, sets: { orderBy: { setNumber: "asc" } } },
          },
          incidents: { orderBy: { createdAt: "desc" } },
        },
        orderBy: { startedAt: "desc" },
        take: input?.limit ?? 20,
      }),
    ),
});
