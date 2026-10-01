import type { PrismaClient } from "@prisma/client";
import type { ProgressLevel } from "@/lib/progress";
import { FLAT_PCT, MIN_SESSIONS, routineTrendsFor, type TrendDirection } from "@/server/services/routine-trends";

export type RoutineProgress = {
  id: string;
  name: string;
  emoji: string;
  direction: TrendDirection;
  /** Variación del volumen en % (null si aún no se puede medir). */
  changePct: number | null;
  /** Sesiones terminadas de la rutina. */
  sessions: number;
  level: ProgressLevel | null;
};

export type UserProgress = {
  /** En el mismo orden que la pestaña Progreso. */
  routines: RoutineProgress[];
  /** Media de la variación de las rutinas que ya se pueden medir. */
  changePct: number | null;
  level: ProgressLevel | null;
};

const DIRECTION_LEVEL: Record<TrendDirection, ProgressLevel | null> = {
  up: "green",
  flat: "yellow",
  down: "red",
  unknown: null,
};

/**
 * Regla de desbloqueo: solo se ve el progreso de los demás cuando el propio ya
 * es visible, es decir, cuando alguna rutina propia llega a `MIN_SESSIONS`
 * sesiones. `sessionsMissing` son las sesiones que le faltan a su rutina más
 * avanzada (MIN_SESSIONS si aún no tiene rutinas).
 */
export function progressUnlock(progress: UserProgress | undefined): {
  unlocked: boolean;
  sessionsMissing: number;
} {
  const best = Math.max(0, ...(progress?.routines ?? []).map((r) => r.sessions));
  const sessionsMissing = Math.max(0, MIN_SESSIONS - best);
  return { unlocked: sessionsMissing === 0, sessionsMissing };
}

/**
 * Progreso de cada rutina de uno o varios usuarios: exactamente el mismo
 * cálculo que la pestaña Entrenamiento › Progreso (`routineTrendsFor`), para
 * que el perfil de un compañero y el propio enseñen lo mismo.
 *
 * El total del usuario es la media de la variación de sus rutinas medibles,
 * para que una rutina con muchas sesiones no pese más que otra con pocas.
 *
 * Solo se exponen direcciones, porcentajes y número de sesiones: los volúmenes
 * y los pesos siguen siendo privados.
 */
export async function trainingProgress(
  db: PrismaClient,
  userIds: string[],
): Promise<Map<string, UserProgress>> {
  const entries = await Promise.all(
    userIds.map(async (userId) => {
      const trends = await routineTrendsFor(db, userId);
      const routines: RoutineProgress[] = trends.map((r) => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        direction: r.overall.direction,
        changePct: r.overall.changePct,
        sessions: r.overall.sessions,
        level: DIRECTION_LEVEL[r.overall.direction],
      }));
      const measured = routines.flatMap((r) => (r.changePct !== null ? [r.changePct] : []));
      const changePct =
        measured.length > 0 ? measured.reduce((a, b) => a + b, 0) / measured.length : null;
      const level: ProgressLevel | null =
        changePct === null ? null : changePct > FLAT_PCT ? "green" : changePct < -FLAT_PCT ? "red" : "yellow";
      return [userId, { routines, changePct, level }] as const;
    }),
  );
  return new Map(entries);
}
