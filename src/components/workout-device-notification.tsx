"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/trpc/react";
import { ACTIVE_WORKOUT_TAG, WORKOUT_IDLE_MS, WORKOUT_REMINDER_TAG } from "@/lib/workout-notification";

/**
 * Notificación del sistema mientras hay un entreno en curso, y recordatorio
 * local si se queda parado.
 *
 * 1. Aviso fijo. Con permiso de notificaciones concedido, al empezar un entreno
 *    se muestra una notificación con etiqueta fija (así se actualiza en lugar
 *    de apilarse), silenciosa y que pide interacción para cerrarse. Se retira
 *    sola al terminar o cancelar el entreno. Al pulsarla abre /entrenar.
 *
 *    Límite real de la web: no existen las notificaciones «en curso» de verdad
 *    (las que Android no deja descartar, como un cronómetro nativo). Una web
 *    solo puede pedir `requireInteraction`, que respeta Chrome de escritorio;
 *    en Android el usuario puede quitarla con el dedo y en iOS (PWA instalada,
 *    16.4+) vive en el centro de notificaciones sin quedarse fija. Por eso se
 *    vuelve a mostrar al volver a la app o al cambiar el estado del entreno.
 *    Tampoco se puede actualizar sola con la app cerrada: se refresca mientras
 *    la app está abierta.
 *
 * 2. Recordatorio local. Si pasan 15 minutos sin tocar series con la app aún
 *    viva (abierta o recién pasada a segundo plano), se avisa en el momento.
 *    Con la app cerrada o congelada no hay temporizador que valga: ahí lo hace
 *    el push del servidor (/api/cron/idle-workouts), con la MISMA etiqueta, de
 *    modo que si llegan los dos al mismo dispositivo no se duplican.
 */

const URL_TARGET = "/entrenar";

/** Mutaciones que abren o cierran el entreno: refrescan el estado al momento. */
const LIFECYCLE = new Set(["workout.start", "workout.finish", "workout.cancel"]);
/** Mutaciones que cuentan como «actividad» (anotar series y ejercicios). */
const EDITS = new Set(["workout.updateSet", "workout.addSet", "workout.removeSet", "workout.addExercise"]);

type ActiveWorkout = {
  id: string;
  startedAt: Date;
  routine: { name: string; emoji: string } | null;
  totalSets: number;
  doneSets: number;
};

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return null;
    if (!("serviceWorker" in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

async function closeByTag(tag: string) {
  const reg = await registration();
  if (!reg) return;
  try {
    (await reg.getNotifications({ tag })).forEach((n) => n.close());
  } catch {
    /* getNotifications no existe en todos los navegadores */
  }
}

async function hasNotification(tag: string): Promise<boolean> {
  const reg = await registration();
  if (!reg) return true; // sin permiso o soporte no hay nada que volver a mostrar
  try {
    return (await reg.getNotifications({ tag })).length > 0;
  } catch {
    return true; // si no se puede consultar, no se insiste
  }
}

async function showActive(w: ActiveWorkout) {
  const reg = await registration();
  if (!reg) return;
  const name = w.routine ? `${w.routine.emoji} ${w.routine.name}` : "Entrenamiento";
  const progress =
    w.totalSets > 0 ? `${w.doneSets}/${w.totalSets} series` : "sin series todavía";
  try {
    await reg.showNotification(`Entrenando · ${name}`, {
      body: `${progress}. Toca para volver al entreno.`,
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: ACTIVE_WORKOUT_TAG,
      renotify: false, // actualizar el contenido no debe volver a sonar ni vibrar
      silent: true,
      requireInteraction: true, // no se retira sola (Chrome de escritorio)
      timestamp: new Date(w.startedAt).getTime(), // Android enseña desde cuándo
      data: { url: URL_TARGET },
    } as NotificationOptions);
  } catch {
    /* sin notificaciones: no pasa nada */
  }
}

async function showReminder() {
  const reg = await registration();
  if (!reg) return;
  try {
    await reg.showNotification("¿Sigues entrenando? ⏱️", {
      body: "Llevas 15 minutos sin cambios en el entreno. Entra para seguir apuntando o darle a Finalizar.",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: WORKOUT_REMINDER_TAG,
      renotify: false,
      data: { url: URL_TARGET },
    } as NotificationOptions);
  } catch {
    /* ídem */
  }
}

export function WorkoutDeviceNotification() {
  const utils = api.useUtils();
  const queryClient = useQueryClient();

  // Misma consulta ligera que el botón flotante; se refresca sola cada minuto
  // y al volver a la app, por si el entreno se cerró desde otro dispositivo.
  const { data } = api.workout.activeBadge.useQuery(undefined, {
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const workout = data as ActiveWorkout | null | undefined;
  const workoutRef = useRef(workout);
  workoutRef.current = workout;

  // Última vez que se tocó el entreno en ESTA sesión de la app, y para cuál
  // se ha lanzado ya el recordatorio local (uno por parón).
  const lastEditRef = useRef(Date.now());
  const remindedForRef = useRef<number | null>(null);

  // ---------- Aviso fijo: mostrar / actualizar / retirar ----------

  const id = workout?.id;

  // Firma de lo que se pinta: la notificación solo se vuelve a emitir cuando
  // cambia. `data` no vale como dependencia: `startedAt` es un Date y React
  // Query no lo comparte entre consultas, así que cada refresco (uno por
  // minuto) traería un objeto nuevo y se re-emitiría sin motivo.
  const signature =
    data === undefined
      ? undefined // aún cargando: no se toca nada
      : workout
        ? `${workout.id}|${workout.doneSets}|${workout.totalSets}|${workout.routine?.emoji ?? ""}${workout.routine?.name ?? ""}`
        : null;

  useEffect(() => {
    if (signature === undefined) return;
    if (signature === null || !workoutRef.current) {
      void closeByTag(ACTIVE_WORKOUT_TAG);
      void closeByTag(WORKOUT_REMINDER_TAG);
      return;
    }
    void showActive(workoutRef.current);
  }, [signature]);

  // Si la quitaron con el dedo o al tocarla (que la cierra), vuelve a ponerse
  // al regresar a la app
  useEffect(() => {
    async function restore() {
      if (document.visibilityState !== "visible") return;
      const w = workoutRef.current;
      if (w && !(await hasNotification(ACTIVE_WORKOUT_TAG))) await showActive(w);
    }
    document.addEventListener("visibilitychange", restore);
    window.addEventListener("focus", restore);
    return () => {
      document.removeEventListener("visibilitychange", restore);
      window.removeEventListener("focus", restore);
    };
  }, []);

  // ---------- Reacción inmediata a lo que hace el usuario ----------

  const refreshSoon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(
    (delay: number) => {
      if (refreshSoon.current) clearTimeout(refreshSoon.current);
      refreshSoon.current = setTimeout(() => void utils.workout.activeBadge.invalidate(), delay);
    },
    [utils],
  );

  useEffect(() => {
    return queryClient.getMutationCache().subscribe((event) => {
      if (event?.type !== "updated" || event.action.type !== "success") return;
      const key = event.mutation.options.mutationKey?.[0];
      const path = Array.isArray(key) ? key.join(".") : "";
      if (LIFECYCLE.has(path)) {
        lastEditRef.current = Date.now();
        remindedForRef.current = null;
        refresh(0);
      } else if (EDITS.has(path)) {
        lastEditRef.current = Date.now();
        remindedForRef.current = null;
        void closeByTag(WORKOUT_REMINDER_TAG); // ya está entrenando: el aviso sobra
        refresh(4000); // agrupa ráfagas de cambios en una sola consulta
      }
    });
  }, [queryClient, refresh]);

  useEffect(
    () => () => {
      if (refreshSoon.current) clearTimeout(refreshSoon.current);
    },
    [],
  );

  // ---------- Recordatorio local de entreno parado ----------

  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => {
      const idleFor = Date.now() - lastEditRef.current;
      if (idleFor < WORKOUT_IDLE_MS) return;
      if (remindedForRef.current === lastEditRef.current) return;
      remindedForRef.current = lastEditRef.current;
      void showReminder();
    }, 30_000);
    return () => clearInterval(timer);
  }, [id]);

  return null;
}
