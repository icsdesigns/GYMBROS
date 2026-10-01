"use client";

import { useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { createPortal } from "react-dom";
import { api } from "@/trpc/react";
import { Modal } from "@/components/ui";
import { pushSupported } from "@/lib/push";

/** Lo que dura el desvanecimiento del aviso final. */
const FAREWELL_MS = 3000;
/** Margen para que no se solape con la pantalla de carga. */
const DELAY_MS = 1800;

/**
 * Ventana de novedades de la app.
 *
 * Muestra la actualización pendiente más reciente (ver src/lib/updates.ts),
 * una sola vez por usuario, y recoge su reacción. Solo aparece si el usuario
 * YA concedió los permisos de notificación: así nunca se encadena con el aviso
 * que los pide. Las encuestas pendientes también van por delante.
 */
export function UpdatesGate() {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [farewell, setFarewell] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const { data: polls } = api.poll.listActive.useQuery();
  const pollPending = (polls ?? []).some((p) => p.myVote === null);
  const { data: update } = api.update.pending.useQuery(undefined, { enabled: allowed });
  const ack = api.update.ack.useMutation({
    onSettled: () => utils.update.pending.invalidate(),
  });

  // Requisito de entrada: permisos de notificación ya concedidos
  useEffect(() => {
    if (!pushSupported()) return;
    setAllowed(Notification.permission === "granted");
  }, []);

  useEffect(() => {
    if (!allowed || pollPending || !update) return;
    const timer = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [allowed, pollPending, update]);

  function close(reaction: "LIKE" | "MEH") {
    if (update) ack.mutate({ updateId: update.id, reaction });
    setOpen(false);
    setFarewell(true);
    setTimeout(() => setFarewell(false), FAREWELL_MS);
  }

  return (
    <>
      <Modal
        open={open && !!update}
        onClose={() => close("MEH")}
        placement="center"
        size="sm"
        dismissible={false}
      >
        <div className="space-y-4 py-1 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            Novedad en GymBros
          </p>

          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-4xl">
            {update?.emoji}
          </span>

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold leading-tight">{update?.title}</h2>
            <p className="whitespace-pre-line text-sm leading-snug text-muted">{update?.description}</p>
          </div>

          <div className="flex gap-2 pt-1">
            <ReactionButton emoji="👍" label="¡Me gusta!" onClick={() => close("LIKE")} />
            <ReactionButton emoji="🫠" label="Sin más" onClick={() => close("MEH")} />
          </div>
        </div>
      </Modal>

      {farewell && <FarewellToast />}
    </>
  );
}

function ReactionButton({
  emoji,
  label,
  onClick,
}: {
  emoji: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-1 rounded-2xl border border-border bg-surface-2 py-3 transition hover:border-accent/50 hover:bg-accent/10 active:scale-[0.97]"
    >
      <span className="text-2xl leading-none">{emoji}</span>
      <span className="text-xs font-medium text-muted">{label}</span>
    </button>
  );
}

/**
 * Aviso de despedida: recuerda dónde se piden nuevas mejoras y se desvanece
 * solo en 3 segundos, sin bloquear la app.
 */
function FarewellToast() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="gb-farewell pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="flex max-w-xs items-center gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15">
          <MessageSquarePlus className="h-4 w-4 text-accent" />
        </span>
        <p className="text-sm leading-snug">
          ¿Se te ocurre algo? Pide nuevas mejoras desde el botón de{" "}
          <strong className="text-accent">feedback</strong>.
        </p>
      </div>
    </div>,
    document.body,
  );
}
