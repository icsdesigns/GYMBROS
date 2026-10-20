import { PrismaClient } from "@prisma/client";
import { WORKOUT_BONUS_POINTS, workoutPointUnits } from "../src/server/services/gamification";

/**
 * Recalcula los puntos de "Entrenamiento completado" ya repartidos con la
 * fórmula actual: 1 punto por serie realizada + WORKOUT_BONUS_POINTS. Al
 * aplicar, la regla también queda en 1 punto por serie y con su nombre nuevo.
 *
 *   npm run db:recalc-workout-points            → solo muestra lo que cambiaría
 *   npm run db:recalc-workout-points -- --apply → lo aplica
 *
 * Solo toca los eventos antiguos (que juntan series y asistencia en uno): los
 * nuevos, ya separados en Series y Asistencia (`meta.split`), se saltan.
 *
 * Cada evento conserva su fecha, así que nadie cambia de semana ni de
 * temporada: solo se ajusta la cantidad.
 */

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const EXAMPLES = 12;
const PER_SET = 1;
const RULE_NAME = "Entrenamiento completado (por serie, +5 por entrenar)";

async function main() {
  const rule = await prisma.pointRule.findUnique({ where: { type: "WORKOUT_COMPLETED" } });
  if (!rule) throw new Error("No existe la regla WORKOUT_COMPLETED");
  const perSet = PER_SET;
  if (rule.points !== PER_SET) console.log(`La regla vale hoy ${rule.points} por serie: pasará a ${PER_SET}.`);

  const events = (
    await prisma.pointEvent.findMany({
      where: { type: "WORKOUT_COMPLETED" },
      orderBy: { date: "asc" },
      select: { id: true, userId: true, points: true, date: true, meta: true, user: { select: { name: true } } },
    })
  ).filter((e) => (e.meta as { split?: boolean } | null)?.split !== true);

  const workoutIds = events
    .map((e) => (e.meta as { workoutId?: string } | null)?.workoutId)
    .filter((id): id is string => !!id);
  const workouts = await prisma.workout.findMany({
    where: { id: { in: workoutIds } },
    select: {
      id: true,
      startedAt: true,
      routine: { select: { name: true, emoji: true } },
      exercises: { select: { sets: { select: { completed: true } } } },
    },
  });
  const byId = new Map(workouts.map((w) => [w.id, w]));

  type Row = { id: string; user: string; userId: string; when: Date; routine: string; sets: number; before: number; after: number };
  const rows: Row[] = [];
  let orphan = 0;
  for (const e of events) {
    const workoutId = (e.meta as { workoutId?: string } | null)?.workoutId;
    const w = workoutId ? byId.get(workoutId) : undefined;
    if (!w) {
      orphan += 1; // sin sesión asociada: se deja tal cual
      continue;
    }
    const sets = workoutPointUnits(w.exercises);
    rows.push({
      id: e.id,
      user: e.user.name,
      userId: e.userId,
      when: w.startedAt,
      routine: w.routine ? `${w.routine.emoji} ${w.routine.name}` : "Entreno libre",
      sets,
      before: e.points,
      after: perSet * sets + WORKOUT_BONUS_POINTS,
    });
  }

  const changed = rows.filter((r) => r.before !== r.after);
  console.log(`Regla: ${perSet} punto(s) por serie + ${WORKOUT_BONUS_POINTS} por entrenar`);
  console.log(`Eventos: ${events.length} · cambian: ${changed.length} · sin sesión (no se tocan): ${orphan}\n`);

  console.log("Ejemplos (los más recientes):");
  for (const r of changed.slice(-EXAMPLES).reverse()) {
    console.log(
      `  ${r.when.toISOString().slice(0, 10)} · ${r.user} · ${r.routine} · ${r.sets} series: ${r.before} → ${r.after}`,
    );
  }

  const perUser = new Map<string, { name: string; before: number; after: number; n: number }>();
  for (const r of rows) {
    const u = perUser.get(r.userId) ?? { name: r.user, before: 0, after: 0, n: 0 };
    u.before += r.before;
    u.after += r.after;
    u.n += 1;
    perUser.set(r.userId, u);
  }
  console.log("\nTotal por usuario (solo puntos de entrenamientos):");
  for (const u of Array.from(perUser.values()).sort((a, b) => b.after - a.after)) {
    const diff = u.after - u.before;
    console.log(`  ${u.name}: ${u.n} entrenos · ${u.before} → ${u.after} (${diff >= 0 ? "+" : ""}${diff})`);
  }

  if (!APPLY) {
    console.log("\nVista previa: no se ha cambiado nada. Añade --apply para aplicarlo.");
    return;
  }
  await prisma.pointRule.update({ where: { id: rule.id }, data: { points: PER_SET, name: RULE_NAME } });
  for (const r of changed) {
    await prisma.pointEvent.update({ where: { id: r.id }, data: { points: r.after } });
  }
  console.log(`\nAplicado: ${changed.length} eventos actualizados ✅`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
