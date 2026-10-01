import type { PrismaClient } from "@prisma/client";

/** Sesiones recientes que forman la media «de ahora». */
export const RECENT_SESSIONS = 2;
/** Sesiones anteriores contra las que se compara. */
export const PREVIOUS_SESSIONS = 3;
/** Sin estas sesiones no hay tendencia que calcular. */
export const MIN_SESSIONS = RECENT_SESSIONS + PREVIOUS_SESSIONS;
/** Umbral (en %) por debajo del cual se considera que el volumen se mantiene. */
export const FLAT_PCT = 5;

export type TrendDirection = "up" | "flat" | "down" | "unknown";

/**
 * Tendencia de un ejercicio: media de volumen de las 2 últimas sesiones frente
 * a la media de las 3 anteriores. Sin esas 5 sesiones no se calcula nada: una
 * ventana más corta daría un porcentaje que cambia de signo con cualquier día
 * flojo, y eso no es progreso, es ruido.
 */
function computeTrend(volumes: number[]): { direction: TrendDirection; changePct: number | null } {
  if (volumes.length < MIN_SESSIONS) return { direction: "unknown", changePct: null };
  const recent = volumes.slice(-RECENT_SESSIONS);
  const previous = volumes.slice(-MIN_SESSIONS, -RECENT_SESSIONS);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const before = avg(previous);
  const after = avg(recent);
  if (before <= 0) return { direction: after > 0 ? "up" : "unknown", changePct: null };
  const changePct = ((after - before) / before) * 100;
  const direction: TrendDirection =
    changePct > FLAT_PCT ? "up" : changePct < -FLAT_PCT ? "down" : "flat";
  return { direction, changePct };
}

/**
 * Tendencia de una rutina completa: mismo cálculo que por ejercicio, pero sobre
 * el volumen total de cada sesión de esa rutina.
 *
 * La unidad se elige según lo que haya: si en alguna sesión se levantó peso se
 * mide en kg, y si la rutina es solo de ejercicios sin peso (dominadas,
 * plancha…) se cae a repeticiones, que si no todas las sesiones valdrían 0.
 */
function routineTrend(sessions: Map<string, { date: Date; kg: number; reps: number }> | undefined) {
  const list = Array.from(sessions?.values() ?? []).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const useKg = list.some((s) => s.kg > 0);
  const volumes = list.map((s) => (useKg ? s.kg : s.reps));
  const { direction, changePct } = computeTrend(volumes);
  return {
    unit: useKg ? ("kg" as const) : ("reps" as const),
    sessions: list.length,
    last: volumes.at(-1) ?? null,
    best: volumes.length > 0 ? Math.max(...volumes) : null,
    lastDate: list.at(-1)?.date ?? null,
    direction,
    changePct,
  };
}

/**
 * Tendencia del volumen de entrenamiento de cada ejercicio de cada rutina de un
 * usuario. El volumen de una sesión son los kg levantados (peso × reps de las
 * series completadas); en los ejercicios sin peso son las repeticiones totales.
 *
 * Lo usan la pestaña Progreso (del propio usuario) y el perfil de los demás
 * miembros, para que ambos enseñen exactamente lo mismo.
 */
export async function routineTrendsFor(db: PrismaClient, userId: string) {
  const [routines, workoutExercises] = await Promise.all([
    db.routine.findMany({
      where: { userId },
      select: {
        id: true, name: true, emoji: true, color: true,
        exercises: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            exercise: { select: { id: true, name: true, muscleGroup: true, noWeight: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.workoutExercise.findMany({
      where: { workout: { userId, endedAt: { not: null } } },
      select: {
        exerciseId: true,
        workout: { select: { id: true, startedAt: true, routineId: true } },
        sets: { select: { reps: true, weight: true, completed: true } },
      },
      orderBy: { workout: { startedAt: "asc" } },
    }),
  ]);

  // Historial por ejercicio, una entrada por sesión (kg levantados y reps)
  const history = new Map<string, Array<{ date: Date; kg: number; reps: number }>>();
  // Y el mismo dato agregado por sesión completa de cada rutina, para poder
  // medir si la rutina entera avanza aunque algún ejercicio suelto no lo haga.
  const routineSessions = new Map<string, Map<string, { date: Date; kg: number; reps: number }>>();
  for (const we of workoutExercises) {
    let kg = 0;
    let reps = 0;
    for (const s of we.sets) {
      if (!s.completed) continue;
      kg += s.weight * s.reps;
      reps += s.reps;
    }
    if (reps === 0) continue; // sesión sin nada completado de este ejercicio
    const list = history.get(we.exerciseId) ?? [];
    list.push({ date: we.workout.startedAt, kg, reps });
    history.set(we.exerciseId, list);

    const routineId = we.workout.routineId;
    if (!routineId) continue; // entreno libre: no cuenta para ninguna rutina
    const sessions = routineSessions.get(routineId) ?? new Map();
    const acc = sessions.get(we.workout.id) ?? { date: we.workout.startedAt, kg: 0, reps: 0 };
    acc.kg += kg;
    acc.reps += reps;
    sessions.set(we.workout.id, acc);
    routineSessions.set(routineId, sessions);
  }

  return routines.map((routine) => ({
    id: routine.id,
    name: routine.name,
    emoji: routine.emoji,
    color: routine.color,
    overall: routineTrend(routineSessions.get(routine.id)),
    exercises: routine.exercises.map((re) => {
      const noWeight = re.exercise.noWeight;
      const sessions = history.get(re.exercise.id) ?? [];
      // Sin peso el progreso se mide en repeticiones totales; con peso, en kg
      const volumes = sessions.map((s) => (noWeight ? s.reps : s.kg));
      const { direction, changePct } = computeTrend(volumes);
      return {
        id: re.id,
        exerciseId: re.exercise.id,
        name: re.exercise.name,
        muscleGroup: re.exercise.muscleGroup,
        unit: noWeight ? ("reps" as const) : ("kg" as const),
        sessions: sessions.length,
        last: volumes.at(-1) ?? null,
        best: volumes.length > 0 ? Math.max(...volumes) : null,
        lastDate: sessions.at(-1)?.date ?? null,
        direction,
        changePct,
      };
    }),
  }));
}
