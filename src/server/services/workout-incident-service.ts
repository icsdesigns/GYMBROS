import type { PrismaClient } from "@prisma/client";
import { startOfDay } from "date-fns";
import { awardWorkoutPoints } from "./gamification";
import { syncRoutineFromWorkout } from "./workout-service";
import { MAX_INCIDENT_CHANGES } from "@/lib/utils";

/**
 * Incidencias: corregir valores de una sesión YA guardada.
 *
 * Un peso mal tecleado no se queda quieto: infla el volumen, se cuela como PR,
 * reparte puntos y sube en el ranking. Por eso corregir una serie no es un
 * simple UPDATE, hay que rehacer todo lo que aquel número generó.
 *
 * Cada sesión admite UNA incidencia y solo una: corrige lo que haga falta —el
 * entreno entero si hace falta— pero no se puede volver sobre ella. Un
 * historial que se puede reescribir a voluntad no es un historial, y el
 * ranking sale de ahí. Lo que queda después es borrar el día.
 */

export { MAX_INCIDENT_CHANGES };

export type IncidentChange = {
  setId: string;
  reps?: number;
  weight?: number;
  /** Marcar o desmarcar la serie: una serie que se hizo y se quedó sin apuntar. */
  completed?: boolean;
};

/** Serie que faltaba por completo en la sesión y se añade al corregirla. */
export type IncidentAddition = {
  workoutExerciseId: string;
  reps: number;
  weight?: number;
  completed?: boolean;
};

/**
 * Deshace un PR automático. Los PR ya no dan puntos y los que se concedieron
 * en su día se conservan, así que aquí solo se retira el récord.
 */
async function removeAutoPR(db: PrismaClient, pr: { id: string }) {
  await db.personalRecord.delete({ where: { id: pr.id } });
}

/**
 * Rehace los PRs automáticos de un ejercicio desde una fecha en adelante.
 *
 * Se recorren las sesiones en orden, como si se estuvieran terminando otra vez:
 * así un 180 que en realidad era 80 deja de tapar los PRs que vinieron después.
 * No se publica nada en el feed ni se avisa al grupo (la sesión es vieja y el
 * grupo ya recibió su aviso en su día). Los PR no mueven puntos: ni se dan
 * nuevos ni se retiran los ya concedidos.
 */
async function recomputeAutoPRs(
  db: PrismaClient,
  userId: string,
  exerciseId: string,
  since: Date,
): Promise<{ created: string[]; removed: number }> {
  const from = startOfDay(since);
  const exercise = await db.exercise.findUniqueOrThrow({
    where: { id: exerciseId },
    select: { name: true, noWeight: true },
  });

  const stale = await db.personalRecord.findMany({
    where: { userId, exerciseId, isAuto: true, date: { gte: from } },
    select: { id: true, exerciseId: true, weight: true, date: true },
  });
  for (const pr of stale) await removeAutoPR(db, pr);

  // Punto de partida: la mejor marca anterior a la sesión corregida, sea
  // automática o puesta a mano. Si no hay ninguna, el primer entreno del tramo
  // vuelve a ser la "marca inicial" silenciosa, sin puntos, igual que en su día.
  const previous = await db.personalRecord.findMany({
    where: { userId, exerciseId, date: { lt: from } },
    select: { weight: true, reps: true },
  });
  let best =
    previous.length === 0
      ? null
      : previous.reduce(
          (acc, p) => ({ weight: Math.max(acc.weight, p.weight), reps: Math.max(acc.reps, p.reps) }),
          { weight: 0, reps: 0 },
        );

  const sessions = await db.workoutExercise.findMany({
    where: {
      exerciseId,
      workout: { userId, endedAt: { not: null }, startedAt: { gte: from } },
    },
    orderBy: { workout: { startedAt: "asc" } },
    select: {
      workout: { select: { startedAt: true } },
      sets: { select: { reps: true, weight: true, completed: true } },
    },
  });

  const created: string[] = [];
  for (const we of sessions) {
    const done = we.sets.filter((s) => s.completed && (exercise.noWeight ? s.reps > 0 : s.weight > 0));
    const top = exercise.noWeight
      ? done.sort((a, b) => b.reps - a.reps)[0]
      : done.sort((a, b) => b.weight - a.weight)[0];
    if (!top) continue;

    if (!best) {
      await db.personalRecord.create({
        data: {
          userId, exerciseId, weight: top.weight, reps: top.reps, date: we.workout.startedAt,
          isAuto: true, notes: "Marca inicial (primera sesión con este ejercicio)",
        },
      });
      best = { weight: top.weight, reps: top.reps };
      continue;
    }

    const isBetter = exercise.noWeight ? top.reps > best.reps : top.weight > best.weight;
    if (!isBetter) continue;

    await db.personalRecord.create({
      data: {
        userId, exerciseId, weight: top.weight, reps: top.reps, date: we.workout.startedAt,
        isAuto: true, notes: "Recalculado tras corregir una incidencia",
      },
    });
    created.push(`${exercise.name}: ${exercise.noWeight ? `${top.reps} reps` : `${top.weight} kg`}`);
    best = { weight: Math.max(best.weight, top.weight), reps: Math.max(best.reps, top.reps) };
  }

  return { created, removed: stale.length };
}

/**
 * Aplica la incidencia de una sesión terminada: corrige los valores indicados
 * (hasta la sesión completa), recalcula sus totales y rehace los PRs y los
 * puntos que dependían de ellos. Devuelve el resumen para contárselo al
 * usuario, o null si la sesión no es suya, sigue en curso o ya se corrigió.
 */
export async function applyWorkoutIncident(
  db: PrismaClient,
  userId: string,
  workoutId: string,
  changes: IncidentChange[],
  reason?: string,
  additions: IncidentAddition[] = [],
) {
  const workout = await db.workout.findUnique({
    where: { id: workoutId },
    include: { exercises: { include: { exercise: true, sets: true } } },
  });
  if (!workout || workout.userId !== userId) return null;
  if (!workout.endedAt) return null; // el entreno en curso se edita en su propia pantalla

  // Una única oportunidad por sesión: si ya hay incidencia, no se abre otra
  const previousIncidents = await db.workoutIncident.count({ where: { workoutId } });
  if (previousIncidents > 0) return null;

  const setIndex = new Map(
    workout.exercises.flatMap((we) => we.sets.map((s) => [s.id, { set: s, we }] as const)),
  );

  const applied: Array<Record<string, unknown>> = [];
  const touchedExercises = new Set<string>();
  for (const change of changes) {
    const entry = setIndex.get(change.setId);
    if (!entry) continue; // serie de otra sesión: se ignora en vez de tumbar la incidencia
    const { set, we } = entry;
    const reps = change.reps ?? set.reps;
    // En los ejercicios sin peso el kilaje no se toca: no significa nada
    const weight = we.exercise.noWeight ? set.weight : change.weight ?? set.weight;
    // Una serie que se hizo y se quedó sin marcar (o al revés) también se corrige
    const completed = change.completed ?? set.completed;
    if (reps === set.reps && weight === set.weight && completed === set.completed) {
      continue; // sin cambio real
    }

    await db.workoutSet.update({
      where: { id: set.id },
      data: { reps, weight, completed, touched: true },
    });
    applied.push({
      setId: set.id,
      exercise: we.exercise.name,
      setNumber: set.setNumber,
      from: { reps: set.reps, weight: set.weight, completed: set.completed },
      to: { reps, weight, completed },
    });
    touchedExercises.add(we.exerciseId);
  }

  // Series que faltaban enteras: se añaden al final de su ejercicio
  const addedPerExercise = new Map<string, number>();
  for (const addition of additions) {
    const we = workout.exercises.find((x) => x.id === addition.workoutExerciseId);
    if (!we) continue; // ejercicio de otra sesión: se ignora
    const reps = addition.reps;
    const weight = we.exercise.noWeight ? 0 : addition.weight ?? 0;
    const completed = addition.completed ?? true;
    const alreadyAdded = addedPerExercise.get(we.id) ?? 0;
    const lastNumber = we.sets.reduce((max, x) => Math.max(max, x.setNumber), 0);
    const setNumber = lastNumber + 1 + alreadyAdded;
    addedPerExercise.set(we.id, alreadyAdded + 1);

    const created = await db.workoutSet.create({
      data: { workoutExerciseId: we.id, setNumber, reps, weight, completed, touched: true },
    });
    applied.push({
      setId: created.id,
      exercise: we.exercise.name,
      setNumber,
      from: null, // no existía: la serie se apuntó al corregir
      to: { reps, weight, completed },
    });
    touchedExercises.add(we.exerciseId);
  }

  if (applied.length === 0) return { changed: 0, pointsDelta: 0, newPRs: [], removedPRs: 0 };

  // Totales de la sesión con los valores buenos (solo cuentan las completadas)
  const fresh = await db.workoutExercise.findMany({
    where: { workoutId },
    select: { sets: { select: { reps: true, weight: true, completed: true } } },
  });
  let totalVolume = 0;
  let totalSets = 0;
  let totalReps = 0;
  for (const we of fresh) {
    for (const s of we.sets) {
      if (!s.completed) continue;
      totalVolume += s.weight * s.reps;
      totalSets += 1;
      totalReps += s.reps;
    }
  }
  await db.workout.update({
    where: { id: workoutId },
    data: { totalVolume, totalSets, totalReps },
  });

  let pointsDelta = 0;

  // Los puntos del entreno van por serie y por asistencia (o juntos, en los
  // antiguos): se rehacen con las series corregidas
  const oldWorkoutPoints = await db.pointEvent.findMany({
    where: {
      userId,
      type: { in: ["WORKOUT_COMPLETED", "ATTENDANCE"] },
      meta: { path: ["workoutId"], equals: workoutId },
    },
    select: { id: true, points: true, date: true },
    orderBy: { date: "asc" },
  });
  if (oldWorkoutPoints.length > 0) {
    await db.pointEvent.deleteMany({ where: { id: { in: oldWorkoutPoints.map((e) => e.id) } } });
    pointsDelta -= oldWorkoutPoints.reduce((acc, e) => acc + e.points, 0);
    const awarded = await awardWorkoutPoints(db, userId, workoutId, fresh);
    // Conserva la fecha original para que no salte de semana ni de temporada
    if (awarded > 0) {
      await db.pointEvent.updateMany({
        where: {
          userId,
          type: { in: ["WORKOUT_COMPLETED", "ATTENDANCE"] },
          meta: { path: ["workoutId"], equals: workoutId },
        },
        data: { date: oldWorkoutPoints[0]!.date },
      });
    }
    pointsDelta += awarded;
  }

  const newPRs: string[] = [];
  let removedPRs = 0;
  for (const exerciseId of Array.from(touchedExercises)) {
    const res = await recomputeAutoPRs(db, userId, exerciseId, workout.startedAt);
    newPRs.push(...res.created);
    removedPRs += res.removed;
  }

  // La rutina sigue a la realidad, igual que al terminar un entreno. Solo si
  // esta es la última sesión de esa rutina: corregir una de hace un mes no
  // puede reescribir el plan con datos viejos.
  if (workout.routineId) {
    const latest = await db.workout.findFirst({
      where: { userId, routineId: workout.routineId, endedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    if (latest?.id === workoutId) {
      const corrected = await db.workout.findUnique({
        where: { id: workoutId },
        select: {
          userId: true,
          routineId: true,
          exercises: {
            select: {
              exerciseId: true,
              exercise: { select: { noWeight: true } },
              sets: { select: { reps: true, weight: true, completed: true } },
            },
          },
        },
      });
      if (corrected) await syncRoutineFromWorkout(db, corrected);
    }
  }

  await db.workoutIncident.create({
    data: { workoutId, userId, reason, changes: applied as object, pointsDelta },
  });

  return { changed: applied.length, pointsDelta, newPRs, removedPRs };
}
