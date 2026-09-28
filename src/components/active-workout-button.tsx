"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Acceso rápido al entrenamiento en curso desde cualquier pantalla.
 *
 * Salir de /entrenar a mirar una rutina o el ranking era un viaje de ida sin
 * vuelta clara; este botón aparece mientras haya una sesión abierta y
 * desaparece en cuanto se termina o si ya estás en ella.
 *
 * No se coloca solo: <FloatingDock> lo centra arriba, bajo la cabecera. Desde
 * ahí se puede arrastrar con el dedo o el ratón a donde estorbe menos, y el
 * sitio elegido se recuerda en el propio dispositivo.
 */

/** A las 3 horas el servidor cierra el entreno solo: el botón ya no pinta nada. */
const MAX_WORKOUT_MS = 3 * 60 * 60 * 1000;

/** Cada cuánto se refresca el cronómetro del botón. */
const TICK_MS = 30_000;

/** Dónde se guarda el desplazamiento elegido. */
const POS_KEY = "gymbros:active-workout-pos";

/** A partir de este arrastre ya no se considera un toque, sino un movimiento. */
const DRAG_THRESHOLD_PX = 5;

/** Aire mínimo entre el botón y los bordes de la pantalla. */
const MARGIN_PX = 8;

type Offset = { x: number; y: number };

function elapsedLabel(from: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - from.getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${String(mins % 60).padStart(2, "0")}m`;
}

export function ActiveWorkoutButton() {
  const pathname = usePathname();
  const onWorkoutScreen = pathname === "/entrenar";

  // Se refresca sola al volver a la app: si el entreno se cerró en otro
  // dispositivo, el botón no se queda colgado.
  const { data: workout } = api.workout.activeBadge.useQuery(undefined, {
    enabled: !onWorkoutScreen,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!workout) return;
    const id = setInterval(() => forceTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [workout]);

  // --- Arrastre ---
  // El botón vive en un carril fijo; lo que se guarda es el desplazamiento
  // respecto a ese sitio, no una posición absoluta: así sigue quedando bien
  // aunque cambie el tamaño de la ventana o la altura de la cabecera.
  const ref = useRef<HTMLAnchorElement>(null);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  // El arrastre acaba en un "click" del navegador: este aviso lo descarta para
  // no navegar a /entrenar cada vez que se mueve el botón de sitio.
  const movedRef = useRef(false);
  const dragRef = useRef<{ pointerX: number; pointerY: number; from: Offset } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(POS_KEY);
      if (saved) setOffset(JSON.parse(saved) as Offset);
    } catch {
      /* sin memoria del sitio: se queda donde nace */
    }
  }, []);

  /** Recorta el desplazamiento para que el botón no se salga de la pantalla. */
  const clamp = useCallback((next: Offset, current: Offset): Offset => {
    const el = ref.current;
    if (!el) return next;
    const rect = el.getBoundingClientRect();
    // Posición "de origen": la que tendría sin desplazamiento ninguno
    const baseLeft = rect.left - current.x;
    const baseTop = rect.top - current.y;
    const minX = MARGIN_PX - baseLeft;
    const maxX = window.innerWidth - MARGIN_PX - rect.width - baseLeft;
    const minY = MARGIN_PX - baseTop;
    const maxY = window.innerHeight - MARGIN_PX - rect.height - baseTop;
    return {
      x: Math.min(Math.max(next.x, minX), Math.max(minX, maxX)),
      y: Math.min(Math.max(next.y, minY), Math.max(minY, maxY)),
    };
  }, []);

  // El sitio guardado puede haber quedado fuera de una pantalla más pequeña:
  // en cuanto el botón existe de verdad, se recorta a lo que se ve.
  // Lo que haya en caché puede ser de antes del cierre automático
  const expired = !!workout && Date.now() - workout.startedAt.getTime() > MAX_WORKOUT_MS;
  const visible = Boolean(workout) && !onWorkoutScreen && !expired;
  useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(() => setOffset((current) => clamp(current, current)));
    return () => cancelAnimationFrame(id);
  }, [visible, clamp]);

  // Al girar el móvil o cambiar el tamaño, el botón vuelve a entrar en pantalla
  useEffect(() => {
    const onResize = () => setOffset((current) => clamp(current, current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    movedRef.current = false;
    dragRef.current = { pointerX: e.clientX, pointerY: e.clientY, from: offset };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.pointerX;
    const dy = e.clientY - drag.pointerY;
    if (!movedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    movedRef.current = true;
    setOffset((current) => clamp({ x: drag.from.x + dx, y: drag.from.y + dy }, current));
  };

  const endDrag = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (movedRef.current) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(offset));
      } catch {
        /* sin memoria del sitio: no pasa nada */
      }
    }
  };

  if (onWorkoutScreen || !workout || expired) return null;

  const pct =
    workout.totalSets > 0 ? Math.round((workout.doneSets / workout.totalSets) * 100) : 0;

  return (
    <Link
      ref={ref}
      href="/entrenar"
      aria-label="Volver al entrenamiento en curso"
      draggable={false}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(e) => {
        if (movedRef.current) e.preventDefault();
      }}
      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
      className={cn(
        // Relleno sólido de acento: sobre el fondo oscuro y sobre las tarjetas
        // se lee igual de bien, que en semitransparente casi desaparecía.
        "pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4",
        "bg-accent text-accent-fg shadow-lg shadow-accent/30 ring-1 ring-accent/50 ring-offset-2 ring-offset-bg",
        // touch-action: el dedo arrastra el botón, no la página
        "touch-none select-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        !dragging && "transition hover:brightness-110 active:scale-95",
      )}
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-fg/15">
        <Dumbbell className="h-4 w-4" />
        {/* Latido que delata que hay algo abierto sin llegar a molestar */}
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-accent-fg" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[11px] font-medium opacity-80">
          Entreno en curso · {elapsedLabel(workout.startedAt)}
        </span>
        <span className="block max-w-[12rem] truncate text-sm font-bold">
          {workout.routine ? `${workout.routine.emoji} ${workout.routine.name}` : "Entreno libre"}
          {workout.totalSets > 0 && <span className="ml-1 font-semibold opacity-80">{pct}%</span>}
        </span>
      </span>
    </Link>
  );
}
