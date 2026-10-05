/**
 * Mejor marca estable por ejercicio.
 *
 * Es el mayor peso con el que alguien ha hecho al menos 12 repeticiones en
 * TODAS las series completadas de un ejercicio, dentro de una misma sesión
 * terminada. Regla por sesión y ejercicio (se agrupan todas sus apariciones
 * en el entreno):
 *  - Se miran las series completadas. Si no hay ninguna, la sesión no cuenta.
 *  - Si alguna serie completada tiene menos de 12 reps o peso 0, la sesión
 *    no cuenta.
 *  - Si cuenta, la sesión valida el peso MÍNIMO de esas series: con al menos
 *    ese peso se hicieron 12 reps o más en todas.
 *
 * La marca es el mayor de esos pesos entre todas las sesiones. Se confirma
 * cuando se ha repetido en 2 sesiones o más. Si luego se logra un peso mayor,
 * la marca pasa a él con una sola sesión y vuelve a estar sin confirmar.
 *
 * Los ejercicios sin peso no deben llegar aquí: el llamador los excluye.
 */
export const STABLE_MARK_MIN_REPS = 12;

export type StableMark = {
  weight: number;
  sessions: number;
  confirmed: boolean;
  firstDate: Date;
  lastDate: Date;
};

export function computeStableMarks(
  workouts: Array<{
    startedAt: Date;
    exercises: Array<{
      exerciseId: string;
      sets: Array<{ reps: number; weight: number; completed: boolean }>;
    }>;
  }>,
): Record<string, StableMark> {
  // Por ejercicio: peso validado en cada sesión que cuenta
  const validated = new Map<string, Array<{ weight: number; date: Date }>>();

  for (const w of workouts) {
    const byExercise = new Map<string, Array<{ reps: number; weight: number }>>();
    for (const we of w.exercises) {
      const list = byExercise.get(we.exerciseId) ?? [];
      for (const s of we.sets) if (s.completed) list.push(s);
      byExercise.set(we.exerciseId, list);
    }
    for (const [exerciseId, sets] of Array.from(byExercise)) {
      if (sets.length === 0) continue;
      // Una serie completada sin peso o con menos de 12 reps tumba la sesión
      if (sets.some((s) => s.weight <= 0 || s.reps < STABLE_MARK_MIN_REPS)) continue;
      const weight = Math.min(...sets.map((s) => s.weight));
      const list = validated.get(exerciseId) ?? [];
      list.push({ weight, date: w.startedAt });
      validated.set(exerciseId, list);
    }
  }

  const result: Record<string, StableMark> = {};
  for (const [exerciseId, list] of Array.from(validated)) {
    const best = Math.max(...list.map((v) => v.weight));
    const top = list.filter((v) => v.weight >= best);
    const times = top.map((v) => v.date.getTime());
    result[exerciseId] = {
      weight: best,
      sessions: top.length,
      confirmed: top.length >= 2,
      firstDate: new Date(Math.min(...times)),
      lastDate: new Date(Math.max(...times)),
    };
  }
  return result;
}
