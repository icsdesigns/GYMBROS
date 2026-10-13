import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

/**
 * Deshacer los cambios de estructura de un entreno en curso (series y
 * ejercicios añadidos o quitados). Es la otra mitad de `addSet`, `removeSet` y
 * `addExercise` de `workout`, que solo saben ir hacia delante.
 *
 * Solo toca entrenos SIN terminar del propio usuario: lo ya guardado se corrige
 * con una incidencia, no con esto.
 */
async function ownOpenWorkoutExercise(
  db: typeof import("@/lib/db").db,
  workoutExerciseId: string,
  userId: string,
) {
  const we = await db.workoutExercise.findUnique({
    where: { id: workoutExerciseId },
    include: { workout: { select: { userId: true, endedAt: true } } },
  });
  if (!we || we.workout.userId !== userId || we.workout.endedAt !== null) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return we;
}

export const workoutEditRouter = createTRPCRouter({
  /** Quita del entreno en curso un ejercicio entero, con todas sus series. */
  removeExercise: protectedProcedure
    .input(z.object({ workoutExerciseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ownOpenWorkoutExercise(ctx.db, input.workoutExerciseId, ctx.session.user.id);
      // Las series caen en cascada con el ejercicio
      await ctx.db.workoutExercise.delete({ where: { id: input.workoutExerciseId } });
      return { ok: true };
    }),

  /**
   * Devuelve una serie quitada a su sitio: las que iban de ese número en
   * adelante se desplazan una posición, que es justo lo inverso de `removeSet`.
   */
  restoreSet: protectedProcedure
    .input(
      z.object({
        workoutExerciseId: z.string(),
        setNumber: z.number().int().min(1).max(200),
        reps: z.number().int().min(0).max(200),
        weight: z.number().min(0).max(1000),
        completed: z.boolean(),
        touched: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const we = await ownOpenWorkoutExercise(ctx.db, input.workoutExerciseId, ctx.session.user.id);
      const { workoutExerciseId, setNumber, ...values } = input;
      await ctx.db.$transaction(async (tx) => {
        await tx.workoutSet.updateMany({
          where: { workoutExerciseId: we.id, setNumber: { gte: setNumber } },
          data: { setNumber: { increment: 1 } },
        });
        await tx.workoutSet.create({ data: { workoutExerciseId: we.id, setNumber, ...values } });
      });
      return { ok: true };
    }),
});
