/**
 * Recalcula los logros de cada usuario con las condiciones REALES del catálogo
 * (lib/achievements + services/gamification) y los compara con los que tiene.
 *
 *   npm run db:backfill-achievements              -> --dry-run (por defecto): solo imprime
 *   npm run db:backfill-achievements -- --apply   -> concede los que faltan
 *
 * Por usuario muestra:
 *   + logros que GANARÍA (los cumple y aún no los tiene)
 *   ! logros que TIENE SIN CUMPLIR la condición (no se retiran nunca, solo se avisa)
 *
 * Con --apply cada logro concedido pasa por el mismo `grant` que usa la app:
 * aviso personal, feed y mensaje en el chat de cada grupo del usuario (con push
 * a los demás). Cuidado: con muchos logros atrasados eso son muchos mensajes.
 * Es idempotente: se puede lanzar varias veces.
 */
import { PrismaClient } from "@prisma/client";
import { ACHIEVEMENT_CATALOG } from "../src/lib/achievements";
import { evaluateAchievements, grant } from "../src/server/services/gamification";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

const byCode = new Map(ACHIEVEMENT_CATALOG.map((a) => [a.code, a]));
const label = (code: string) => {
  const a = byCode.get(code);
  return a ? `${a.number}. ${a.icon} ${a.name}` : code;
};
const order = (codes: string[]) =>
  [...codes].sort((a, b) => (byCode.get(a)?.number ?? 999) - (byCode.get(b)?.number ?? 999));

async function main() {
  console.log(apply ? "MODO --apply: se conceden los logros que faltan\n" : "MODO --dry-run: no se escribe nada\n");

  const users = await db.user.findMany({
    where: { deletionRequestedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let totalWon = 0;
  let totalHeldUnmet = 0;

  for (const user of users) {
    const { earned, met } = await evaluateAchievements(db, user.id, { heavy: true, recheckEarned: true });
    const retiredCodes = new Set(ACHIEVEMENT_CATALOG.filter((a) => a.retired).map((a) => a.code));
    const wins = order(Array.from(met).filter((c) => !earned.has(c)));
    // Los retirados (legado) no se evalúan: tenerlos no es una incoherencia
    const heldUnmet = order(Array.from(earned).filter((c) => !met.has(c) && !retiredCodes.has(c)));

    console.log(`${user.name}  (tiene ${earned.size})`);
    if (wins.length === 0 && heldUnmet.length === 0) console.log("   sin cambios");
    for (const c of wins) console.log(`   + ganaría: ${label(c)}`);
    for (const c of heldUnmet) console.log(`   ! tiene sin cumplir: ${label(c)}`);
    totalWon += wins.length;
    totalHeldUnmet += heldUnmet.length;

    if (apply && wins.length > 0) {
      // Coleccionista al final: depende de los demás
      for (const c of wins.filter((c) => c !== "COLLECTOR")) await grant(db, user.id, c);
      if (wins.includes("COLLECTOR")) await grant(db, user.id, "COLLECTOR");
      console.log(`   -> concedidos ${wins.length}`);
    }
  }

  console.log(
    `\n${users.length} usuarios · ${totalWon} logros ${apply ? "concedidos" : "que se ganarían"} · ${totalHeldUnmet} tenidos sin cumplir`,
  );
  if (!apply) console.log("(dry-run: no se ha escrito nada; usa --apply para conceder)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
