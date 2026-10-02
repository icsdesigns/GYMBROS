"use client";

import { useState } from "react";
import { format, addMonths, subMonths, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui";
import { MonthCalendar } from "@/components/month-calendar";
import { cn } from "@/lib/utils";

/**
 * Calendario de Inicio con navegación por meses: del mes actual hacia atrás
 * hasta el mes del primer entreno. El mes actual usa los datos del resumen;
 * el resto se piden bajo demanda.
 */
export function MonthBrowser({
  currentMonthDates,
  firstAttendanceDate,
}: {
  currentMonthDates: Date[];
  firstAttendanceDate: Date | null;
}) {
  const thisMonth = startOfMonth(new Date());
  const [cursor, setCursor] = useState(thisMonth);

  // Límites: no hay futuro, y el pasado llega hasta el primer entreno.
  const earliest = firstAttendanceDate ? startOfMonth(firstAttendanceDate) : thisMonth;
  const isCurrent = cursor.getTime() === thisMonth.getTime();
  const canGoBack = cursor.getTime() > earliest.getTime();

  const { data, isFetching } = api.attendance.month.useQuery(
    { year: cursor.getFullYear(), month: cursor.getMonth() },
    { enabled: !isCurrent, keepPreviousData: true },
  );

  // Sin datos aún (primera carga de otro mes): calendario vacío y atenuado
  // para que la tarjeta no cambie de altura.
  const dates = isCurrent ? currentMonthDates : (data?.attendances.map((a) => a.date) ?? []);
  const loading = !isCurrent && isFetching;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canGoBack}
          onClick={() => setCursor((c) => subMonths(c, 1))}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-semibold capitalize">
          {format(cursor, "MMMM yyyy", { locale: es })}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={isCurrent}
          onClick={() => setCursor((c) => addMonths(c, 1))}
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <MonthCalendar
        year={cursor.getFullYear()}
        month={cursor.getMonth()}
        trainedDates={dates}
        className={cn("transition-opacity", loading && "opacity-50")}
      />
    </>
  );
}
