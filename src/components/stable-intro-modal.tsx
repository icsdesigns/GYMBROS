"use client";

import { useEffect, useState } from "react";
import { Anchor, ShieldCheck } from "lucide-react";
import { api } from "@/trpc/react";
import { Button, Modal } from "@/components/ui";
import { StableMarkRules } from "@/components/stable-mark";

/**
 * Anuncio de las marcas estables de partida.
 *
 * Sale UNA vez por rutina y usuario, la primera vez que se entrena esa rutina
 * desde que existe este anuncio: avisa de que hay que fijar los pesos estables
 * de partida para poder demostrar un progreso orgánico.
 *
 * Qué rutinas ya lo vieron se recuerda en el propio dispositivo (localStorage,
 * una clave por usuario y rutina): no hay columna en la base de datos para esto
 * y no merece una migración. Si el almacenamiento no está disponible (modo
 * privado, datos bloqueados) el anuncio simplemente no sale, antes que repetirse
 * en cada entreno.
 *
 * Con `preview` se enseña siempre y sin apuntar nada: sirve para revisar el
 * texto con /entrenar?preview-anuncio=1.
 */

const KEY_PREFIX = "gymbros:stable-intro:v1";

const keyFor = (userId: string, routineId: string) => `${KEY_PREFIX}:${userId}:${routineId}`;

/** ¿Este usuario ya vio el anuncio de esta rutina? Si no se puede saber, se da por visto. */
function alreadySeen(userId: string, routineId: string): boolean {
  try {
    return localStorage.getItem(keyFor(userId, routineId)) !== null;
  } catch {
    return true;
  }
}

function markSeen(userId: string, routineId: string) {
  try {
    localStorage.setItem(keyFor(userId, routineId), new Date().toISOString());
  } catch {
    /* sin memoria del dispositivo: no pasa nada */
  }
}

export function StableIntroModal({
  routineId,
  routineName,
  preview = false,
}: {
  /** Rutina del entreno en curso; null si es un entreno libre (no hay anuncio). */
  routineId: string | null;
  routineName?: string | null;
  preview?: boolean;
}) {
  const { data: me } = api.user.me.useQuery();
  const userId = me?.id;
  const [open, setOpen] = useState(false);

  // Depende del id y no del objeto `me`: un refresco de `me` no debe reabrir el anuncio
  useEffect(() => {
    if (preview) {
      setOpen(true);
      return;
    }
    if (!userId || !routineId) return;
    setOpen(!alreadySeen(userId, routineId));
  }, [preview, userId, routineId]);

  function close() {
    if (!preview && userId && routineId) markSeen(userId, routineId);
    setOpen(false);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      placement="center"
      title="Fija tus pesos estables de partida"
      subtitle={routineName ? `Antes de empezar con ${routineName}` : "Antes de empezar con esta rutina"}
      icon={<Anchor className="h-5 w-5 text-accent" />}
      footer={
        <Button size="lg" className="w-full" onClick={close}>
          Entendido
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">
          Para que tu progreso sea <strong className="text-fg">orgánico</strong> es necesario saber
          desde dónde partes. En cada ejercicio, ese punto de partida es tu{" "}
          <strong className="text-fg">marca estable</strong>: el peso que ya dominas con
          repeticiones de sobra.
        </p>

        <div className="rounded-xl border border-accent/25 bg-accent/5 p-3">
          <StableMarkRules />
        </div>

        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden />
          <span>El primer paso es fijar tus marcas.</span>
        </p>
      </div>
    </Modal>
  );
}
