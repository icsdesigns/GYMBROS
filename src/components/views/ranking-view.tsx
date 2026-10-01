"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Crown } from "lucide-react";
import { api } from "@/trpc/react";
import { Card, Spinner, Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { LEVEL_STYLES } from "@/lib/progress";

const PERIODS = [
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "season", label: "Temporada" },
  { key: "year", label: "Año" },
] as const;

const POINT_LABELS: Record<string, string> = {
  ATTENDANCE: "Asistencias (legado)",
  WORKOUT_COMPLETED: "Entrenamientos completados",
  NEW_PR: "Nuevos PRs",
  STREAK_7: "Rachas de 7 días",
  ROUTINE_SHARED: "Rutinas compartidas (legado)",
  STREAK_WEEK1: "Racha: 1.ª semana",
  STREAK_WEEK2: "Racha: 2 semanas",
  STREAK_WEEK3: "Racha: 3 semanas",
  STREAK_MONTH: "Racha: 1 mes",
  STREAK_CRACK: "Semanas crack 💎",
  WEEKLY_TARGET: "Semanas cumplidas (legado)",
  CUSTOM: "Puntos extra del admin",
};

type Period = (typeof PERIODS)[number]["key"];

export function RankingView() {
  const params = useSearchParams();
  const [period, setPeriod] = useState<Period>("week");

  // Permite entrar directamente a un periodo concreto, p. ej. desde el panel
  // de temporada de Inicio: /comunidad?tab=ranking&periodo=season
  const requested = params.get("periodo");
  useEffect(() => {
    if (PERIODS.some((p) => p.key === requested)) setPeriod(requested as Period);
  }, [requested]);

  const { data, isLoading } = api.ranking.get.useQuery({ period });
  const { data: breakdown } = api.ranking.myBreakdown.useQuery({ period });
  // Nivel de progreso por usuario (ya precargado en Comunidad); sin nivel, sin contorno
  const { data: users } = api.user.list.useQuery();
  const levelById = new Map(users?.map((u) => [u.id, u.progressLevel]));
  const ringFor = (id: string) => {
    const level = levelById.get(id);
    return level ? cn("ring-2 ring-offset-2 ring-offset-surface", LEVEL_STYLES[level].ring) : undefined;
  };
  const { data: seasons } = api.ranking.seasons.useQuery(undefined, {
    enabled: period === "season",
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Ranking</h1>
        <div className="mx-auto flex w-full max-w-md justify-center gap-1 rounded-xl bg-surface p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-sm transition",
                period === p.key ? "bg-accent font-medium text-accent-fg" : "text-muted hover:text-fg",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          {/* Estado de la temporada */}
          {period === "season" && (
            <Card className="flex items-center justify-between gap-3 border-gold/30 bg-gold/5 py-3">
              {data.season.started ? (
                <>
                  <div>
                    <p className="font-semibold">🏆 Temporada {data.season.index}</p>
                    <p className="text-xs text-muted">Al campeón le espera el título de la temporada.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gold">{data.season.daysLeft}</p>
                    <p className="text-xs text-muted">días para el final</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="font-semibold">La temporada 1 aún no ha empezado</p>
                    <p className="text-xs text-muted">Arranca el 15 de agosto de 2026.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gold">{data.season.daysLeft}</p>
                    <p className="text-xs text-muted">días para empezar</p>
                  </div>
                </>
              )}
            </Card>
          )}

          {/* Podio top 3 */}
          {data.rows.length >= 2 && (
            <div className="flex items-end justify-center gap-3">
              {[1, 0, 2].map((idx) => {
                const row = data.rows[idx];
                if (!row) return null;
                const isFirst = idx === 0;
                return (
                  <motion.div
                    key={row.user.id}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx === 0 ? 0.2 : 0.05 * idx, type: "spring" }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-4",
                      isFirst ? "w-32 pb-8 border-gold/40 animate-pulse-glow" : "w-28",
                    )}
                  >
                    {isFirst && (
                      <motion.div
                        animate={{ rotate: [0, -8, 8, 0] }}
                        transition={{ repeat: Infinity, duration: 2.5 }}
                      >
                        <Crown className="h-6 w-6 text-gold" />
                      </motion.div>
                    )}
                    <Link href={`/perfil/${row.user.id}`} className="flex flex-col items-center gap-2 transition hover:opacity-80">
                      <Avatar name={row.user.name} src={row.user.avatarUrl} size={isFirst ? 56 : 44} className={ringFor(row.user.id)} />
                      <p className="max-w-full truncate text-sm font-medium">{row.user.name}</p>
                    </Link>
                    <p className={cn("text-lg font-bold", isFirst ? "text-gold" : "text-accent")}>
                      {row.points} pts
                    </p>
                    <span className="text-2xl">{row.medal}</span>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Tabla completa */}
          <Card className="divide-y divide-border p-0">
            {data.rows.map((row) => (
              <div
                key={row.user.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  row.position === data.myPosition && "bg-accent/5",
                )}
              >
                <span className="w-8 text-center font-bold text-muted">
                  {row.medal ?? row.position}
                </span>
                <Link href={`/perfil/${row.user.id}`} className="flex min-w-0 flex-1 items-center gap-3 transition hover:opacity-80">
                  <Avatar name={row.user.name} src={row.user.avatarUrl} size={36} className={ringFor(row.user.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.user.name}</p>
                    {row.user.currentStreak > 0 && (
                      <p className="text-xs text-muted">🔥 racha de {row.user.currentStreak} sem.</p>
                    )}
                  </div>
                </Link>
                {row.delta !== null && row.delta !== 0 && (
                  <Badge className={row.delta > 0 ? "text-accent" : "text-red-400"}>
                    {row.delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(row.delta)}
                  </Badge>
                )}
                {row.delta === 0 && <Minus className="h-3 w-3 text-muted" />}
                <span className="w-16 text-right font-bold">{row.points} pts</span>
              </div>
            ))}
          </Card>

          {/* Palmarés de temporadas pasadas */}
          {period === "season" && (seasons?.length ?? 0) > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold">🏆 Palmarés</h2>
              <div className="space-y-2">
                {seasons?.map((s) => (
                  <div key={s.label} className="rounded-xl bg-surface-2 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold">{s.label}</span>
                      {s.champion && (
                        <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">
                          👑 Campeón: {s.champion.name}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted">
                      {s.podium.map((p, i) => (
                        <span key={i}>{["🥇", "🥈", "🥉"][i]} {p.name} ({p.points})</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Mi desglose */}
          {(breakdown?.length ?? 0) > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold">Mis puntos este periodo</h2>
              <p className="mb-2 text-xs text-muted">La flecha compara con el mismo tramo transcurrido del periodo anterior.</p>
              <div className="space-y-2">
                {breakdown?.map((b) => (
                  <div key={b.type} className="flex justify-between text-sm">
                    <span className="text-muted">
                      {POINT_LABELS[b.type] ?? b.type} × {b.count}
                    </span>
                    <span className="font-medium text-accent">+{b.points}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
