"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FloatingTimerBanner, useRestTimer } from "@/components/rest-timer-provider";

/**
 * Avisos flotantes del entrenamiento.
 *
 * Hoy solo queda el temporizador de descanso, abajo, donde está la mano. El
 * acceso al "entreno en curso" ya no flota: vive en la cabecera de la app
 * (`<ActiveWorkoutChip>`, en nav.tsx).
 *
 * El carril no intercepta el ratón (`pointer-events-none`); cada tarjeta lo
 * recupera por su cuenta.
 */
export function FloatingDock() {
  const { floatingVisible } = useRestTimer();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <>
      {/* Carril inferior: temporizador de descanso */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-start gap-2 px-4 md:bottom-6 md:left-60 md:px-8">
        {floatingVisible && <FloatingTimerBanner />}
      </div>
    </>,
    document.body,
  );
}
