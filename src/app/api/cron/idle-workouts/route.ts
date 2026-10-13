import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyIdleWorkouts } from "@/server/services/workout-service";

export const dynamic = "force-dynamic";

/**
 * Entrenos activos sin cambios en pesos ni repeticiones desde hace 15 minutos:
 * manda un push «¿Sigues entrenando?». Necesita llamarse cada pocos minutos,
 * así que lo dispara un programador externo (Vercel Hobby solo permite crons
 * diarios, por eso no está en vercel.json). Se protege con CRON_SECRET: el
 * programador debe enviar la cabecera `Authorization: Bearer <CRON_SECRET>`.
 * Cada llamada es idempotente (un aviso por parón), así que se puede lanzar
 * cada 5 minutos sin riesgo de avisar de más.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sent = await notifyIdleWorkouts(db);
  return NextResponse.json({ ok: true, sent });
}
