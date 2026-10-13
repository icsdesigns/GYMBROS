"use client";

import { useEffect } from "react";
import { api } from "@/trpc/react";

/** Cada cuánto se avisa al servidor de que la app sigue abierta y a la vista. */
const PING_MS = 2 * 60_000;

/**
 * Latido de presencia: mientras la app está a la vista se anota cada pocos
 * minutos en `User.lastSeenAt`.
 *
 * Con un entreno en curso el servidor lo ignora: ahí `lastSeenAt` solo lo
 * mueven los cambios en las series, que es lo que mira el aviso de «¿Sigues
 * entrenando?» (ver `notifyIdleWorkouts` y `user.ping`).
 */
export function PresencePing() {
  const ping = api.user.ping.useMutation();
  const { mutate } = ping;

  useEffect(() => {
    let last = 0;
    function beat() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      // Al volver a la app se late enseguida, pero no más de uno por minuto
      if (now - last < 60_000) return;
      last = now;
      mutate();
    }
    beat();
    const id = setInterval(beat, PING_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [mutate]);

  return null;
}
