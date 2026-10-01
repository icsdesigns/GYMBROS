"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format, formatDistanceToNowStrict, addMonths, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import {
  Flame,
  Trophy,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Dumbbell,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Lock,
} from "lucide-react";
import { api } from "@/trpc/react";
import { Card, Spinner, Avatar, Stat, Badge, Button } from "@/components/ui";
import { MonthCalendar } from "@/components/month-calendar";
import { PointsBreakdown } from "@/components/points-breakdown";
import { AffinityPanel } from "@/components/affinity-panel";
import { cn } from "@/lib/utils";
import { LEVEL_STYLES } from "@/lib/progress";

/** Sesiones que se comparan a cada lado, a juego con la pestaña Progreso. */
const RECENT_SESSIONS = 2;
const PREVIOUS_SESSIONS = 3;
const MIN_SESSIONS = RECENT_SESSIONS + PREVIOUS_SESSIONS;
/** Margen que se considera estancamiento. */
const FLAT_PCT = 5;

const DIRECTION_ICON = {
  up: ArrowUp,
  flat: ArrowUpDown,
  down: ArrowDown,
  unknown: ArrowUpDown,
} as const;

/** Dirección de una variación según el margen de estancamiento. */
function directionOf(pct: number): "up" | "flat" | "down" {
  return pct > FLAT_PCT ? "up" : pct < -FLAT_PCT ? "down" : "flat";
}

/** Porcentaje sin decimales, con el mismo redondeo que la pestaña Progreso. */
function formatPct(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const [cursor, setCursor] = useState(new Date());
  const { data, isLoading } = api.user.publicProfile.useQuery({ userId: params.id });
  const { data: calendarDates } = api.user.memberCalendar.useQuery({
    userId: params.id,
    year: cursor.getFullYear(),
    month: cursor.getMonth(),
  });

  if (isLoading || !data) return <Spinner />;

  // Null mientras el que mira no tenga desbloqueado su propio progreso
  const progress = data.progress;
  const lock = data.progressLock;

  return (
    <div className="space-y-6">
      <Card className="flex items-center gap-4">
        <Avatar
          name={data.user.name}
          src={data.user.avatarUrl}
          size={72}
          className={cn(
            "shrink-0",
            progress?.level &&
              cn("ring-[3px] ring-offset-2 ring-offset-surface", LEVEL_STYLES[progress.level].ring),
          )}
        />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{data.user.name}</h1>
          <Badge
            className={
              data.user.gymName
                ? "my-1 max-w-full bg-accent/15 text-accent"
                : "my-1 max-w-full bg-surface-2 text-muted"
            }
          >
            <Dumbbell className="h-3 w-3 shrink-0" />
            <span className="truncate">{data.user.gymName ?? "Gimnasio sin indicar"}</span>
          </Badge>
          <p className="text-sm text-muted">
            {data.user.gymStartDate
              ? `Entrenando desde hace ${formatDistanceToNowStrict(data.user.gymStartDate, { locale: es })}`
              : `En GymBros desde ${format(data.user.createdAt, "MMM yyyy", { locale: es })}`}
          </p>
        </div>
      </Card>

      {/* Afinidad de entrenamiento con este miembro */}
      <AffinityPanel
        affinity={data.affinity}
        detail={data.affinityDetail}
        name={data.user.name}
        myProfileEmpty={data.myProfileEmpty}
        theirProfileEmpty={data.theirProfileEmpty}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Racha semanal"
          value={
            <span className="flex items-center gap-1">
              {data.user.currentStreak} <Flame className="h-5 w-5 text-orange-400" />
            </span>
          }
          sub={`Mejor: ${data.user.bestStreak} semanas`}
        />
        <Stat label="Asistencias" value={data.attendances} />
        <Stat label="Entrenamientos" value={data.workouts} />
        <Stat label="Puntos históricos" value={data.totalPoints} />
      </div>

      {/* Progreso por entrenamiento: variación del volumen de las 2 últimas
          sesiones frente a las 3 anteriores, igual que la pestaña Progreso */}
      {lock ? (
        <Card className="space-y-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <TrendingUp className="h-4 w-4 text-accent" /> Progreso
          </h2>
          <p className="flex items-start gap-2 text-sm text-muted">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Completa {lock.sessionsMissing} {lock.sessionsMissing === 1 ? "sesión" : "sesiones"} más de una de
              tus rutinas para ver el progreso de los demás.
            </span>
          </p>
          <Link href="/entrenamiento?tab=progreso" className="inline-block text-xs text-muted underline">
            Ver mi progreso
          </Link>
        </Card>
      ) : (
        progress &&
        progress.routines.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <TrendingUp className="h-4 w-4 text-accent" /> Progreso
            </h2>
            {progress.changePct !== null && (
              <span
                className={cn(
                  "flex items-center gap-1 text-sm font-bold",
                  progress.level ? LEVEL_STYLES[progress.level].text : "text-muted",
                )}
              >
                {formatPct(progress.changePct)}
                {(() => {
                  const Icon = DIRECTION_ICON[directionOf(progress.changePct)];
                  return <Icon className="h-4 w-4" strokeWidth={2.75} />;
                })()}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {progress.routines.map((r) => {
              const Icon = DIRECTION_ICON[r.direction];
              const missing = MIN_SESSIONS - r.sessions;
              return (
                <div key={r.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      r.level ? LEVEL_STYLES[r.level].dot : "bg-surface-2",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {r.emoji} {r.name}
                  </span>
                  {missing > 0 ? (
                    <span className="shrink-0 text-xs text-muted">
                      faltan {missing} {missing === 1 ? "sesión" : "sesiones"}
                    </span>
                  ) : r.changePct === null ? (
                    // Igual que la pestaña: con sesiones de sobra pero sin volumen previo
                    <span className="shrink-0 text-xs text-muted">—</span>
                  ) : (
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-0.5 text-xs font-semibold",
                        r.level ? LEVEL_STYLES[r.level].text : "text-muted",
                      )}
                    >
                      {formatPct(r.changePct)}
                      <Icon className="h-3 w-3" strokeWidth={2.75} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <details className="group border-t border-border pt-2">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted [&::-webkit-details-marker]:hidden">
              Qué significan los colores
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-1 pt-2 text-xs text-muted">
              <p className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", LEVEL_STYLES.green.dot)} />
                Verde: sube más de un {FLAT_PCT} %
              </p>
              <p className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", LEVEL_STYLES.yellow.dot)} />
                Amarillo: se mantiene (±{FLAT_PCT} %)
              </p>
              <p className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", LEVEL_STYLES.red.dot)} />
                Rojo: baja más de un {FLAT_PCT} %
              </p>
              <p className="pt-1">
                Se comparan las {RECENT_SESSIONS} últimas sesiones con las {PREVIOUS_SESSIONS} anteriores.
              </p>
            </div>
          </details>
        </Card>
        )
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Calendario de entrenos del miembro */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setCursor((c) => subMonths(c, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="font-semibold capitalize">
              {format(cursor, "MMMM yyyy", { locale: es })}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setCursor((c) => addMonths(c, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <MonthCalendar
            year={cursor.getFullYear()}
            month={cursor.getMonth()}
            trainedDates={calendarDates ?? []}
          />
          <p className="mt-3 text-center text-sm text-muted">
            {calendarDates?.length ?? 0} días entrenados este mes
          </p>
        </Card>

        {/* Desglose de puntos */}
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Trophy className="h-4 w-4 text-gold" /> Puntos
          </h2>
          <PointsBreakdown
            items={data.pointsBreakdown}
            total={data.totalPoints}
            userId={params.id}
          />
        </Card>
      </div>

      {/* Rutinas del miembro */}
      <section>
        <h2 className="mb-3 font-semibold">Sus rutinas ({data.routines.length})</h2>
        {data.routines.length === 0 ? (
          <p className="text-sm text-muted">Todavía no ha creado ninguna rutina.</p>
        ) : (
          <div className="space-y-3">
            {data.routines.map((r) => (
              <details key={r.id} className="group rounded-2xl border border-border bg-surface">
                <summary className="flex cursor-pointer list-none items-center justify-between p-4 [&::-webkit-details-marker]:hidden">
                  <div>
                    <p className="font-medium">
                      {r.emoji} {r.name}
                      {r.isShared && <Badge className="ml-2 bg-accent/15 text-accent">compartida</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {r.exercises.length} ejercicios
                      {r.estimatedMinutes ? ` · ~${r.estimatedMinutes} min` : ""}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-1.5 border-t border-border p-4 pt-3">
                  {r.exercises.map((e) => (
                    <div key={e.id} className="flex justify-between text-sm">
                      <span>{e.exercise.name}</span>
                      <span className="text-muted">{e.sets}×{e.reps}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* Logros */}
      {data.achievements.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Logros</h2>
          <div className="flex flex-wrap gap-2">
            {data.achievements.map((ua) => (
              <Badge key={ua.achievementId} title={ua.achievement.description}>
                {ua.achievement.icon} {ua.achievement.name}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
