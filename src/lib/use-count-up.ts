"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// En el servidor useLayoutEffect avisa; allí basta con useEffect
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Número que «sube» hasta su valor con requestAnimationFrame.
 *
 * - La primera vez cuenta desde 0 (o desde `from`); si el valor cambia después,
 *   cuenta desde lo que se estaba viendo hasta el nuevo valor.
 * - Con «reducir movimiento» activo devuelve el valor tal cual, sin animar.
 * - No hay bucle permanente: el rAF se cancela al llegar al final.
 *
 * Devuelve un número entero (o con `decimals` decimales).
 */
export function useCountUp(
  value: number,
  { duration = 700, from = 0, decimals = 0 }: { duration?: number; from?: number; decimals?: number } = {},
): number {
  const [display, setDisplay] = useState(value);
  const shown = useRef(value);
  const first = useRef(true);

  useIsoLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = first.current ? from : shown.current;
    first.current = false;

    if (reduce || start === value || !Number.isFinite(value)) {
      shown.current = value;
      setDisplay(value);
      return;
    }

    const factor = Math.pow(10, decimals);
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / duration);
      const v = start + (value - start) * easeOutCubic(p);
      shown.current = Math.round(v * factor) / factor;
      setDisplay(shown.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    shown.current = start;
    setDisplay(start);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, from, decimals]);

  return display;
}
