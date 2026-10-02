"use client";

import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Trophy, AlertTriangle } from "lucide-react";
import { api } from "@/trpc/react";
import { Card, Spinner } from "@/components/ui";
import { MonthBrowser } from "@/components/month-browser";
import { PointsBreakdown } from "@/components/points-breakdown";
import { PointsInfo } from "@/components/points-info";
import { StreakProgress } from "@/components/streak-progress";
import { SeasonPanel } from "@/components/season-panel";
import { YearSummary } from "@/components/year-summary";
import { WorkoutLauncher } from "@/components/workout-launcher";


export default function DashboardPage() {
  const { data, isLoading } = api.dashboard.summary.useQuery();

  if (isLoading || !data) return <Spinner />;

  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hola, {data.user.name.split(" ")[0]} 👋</h1>
          <p className="text-sm capitalize text-muted">
            {format(now, "EEEE, d 'de' MMMM", { locale: es })}
          </p>
        </div>

      </div>

      {/* Botón central: registrar / actualizar entrenamiento */}
      <WorkoutLauncher />

      {/* Aviso cuando la racha se juega los últimos días de la semana */}
      {data.streak.atRisk && data.streak.missing >= data.streak.daysLeft && (
        <Card className="flex items-center gap-3 border-amber-400/40 bg-amber-400/5 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-sm">
            <strong>Racha en peligro.</strong>{" "}
            Te {data.streak.missing === 1 ? "queda" : "quedan"} {data.streak.missing}{" "}
            {data.streak.missing === 1 ? "entreno" : "entrenos"} y {data.streak.daysLeft}{" "}
            {data.streak.daysLeft === 1 ? "día" : "días"} de semana para no perder tus{" "}
            {data.user.currentStreak} {data.user.currentStreak === 1 ? "semana" : "semanas"}.
          </p>
        </Card>
      )}

      {/* Temporada y racha */}
      <div className="grid items-stretch gap-4 md:grid-cols-2">
        <SeasonPanel season={data.season} />
        <StreakProgress streak={data.user.currentStreak} rules={data.streakRules} />
      </div>

      {/* Constancia del último año */}
      <YearSummary workouts={data.yearAttendances} monthlyAvg={data.monthlyAvgWorkouts} />

      <div className="grid gap-6 md:grid-cols-2">

        {/* Calendario del mes */}
        <Card>
          <MonthBrowser
            currentMonthDates={data.monthAttendanceDates}
            firstAttendanceDate={data.firstAttendanceDate}
          />
        </Card>

        {/* Desglose de puntos */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Trophy className="h-4 w-4 text-gold" /> Mis puntos
              <PointsInfo />
            </h2>
            <Link href="/comunidad?tab=ranking" className="text-xs text-accent hover:underline">
              Ver ranking
            </Link>
          </div>
          <PointsBreakdown items={data.pointsBreakdown} total={data.totalPoints} />
        </Card>

      </div>


    </div>
  );
}
