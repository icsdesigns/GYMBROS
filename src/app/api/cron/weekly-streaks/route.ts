import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyCommunityStreaks } from "@/server/services/community-streaks";
import { awardWeeklyProgressForAll } from "@/server/services/weekly-progress";

export const dynamic = "force-dynamic";

/**
 * Lunes por la mañana (Vercel Cron, ver vercel.json): cierre de la semana
 * anterior. Anuncia las rachas de la comunidad y concede los puntos de progreso.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await notifyCommunityStreaks(db);
  // Idempotente: repetir el cron no concede dos veces la misma semana. Si falla
  // (p. ej. el tipo de punto aún no existe en la base de datos) no tumba lo anterior.
  const progress = await awardWeeklyProgressForAll(db).catch((e) => {
    console.error("weekly-progress", e);
    return { error: e instanceof Error ? e.message : String(e) };
  });
  return NextResponse.json({ ok: true, ...result, progress });
}
