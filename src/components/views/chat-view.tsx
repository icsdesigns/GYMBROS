"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { format, isSameDay, isSameYear, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Check, Pencil, Send, X } from "lucide-react";
import { api } from "@/trpc/react";
import { Avatar, Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Chat del grupo a pantalla completa.
 *
 * Se pinta en un portal fijo sobre la página: la cabecera y el cuadro de
 * escribir se quedan quietos y lo único que se desplaza es la conversación
 * —antes se movía la interfaz entera y el campo de texto se iba de la vista—.
 * La barra inferior y la lateral quedan por encima, así que se puede salir del
 * chat sin volver atrás.
 */
export function ChatView() {
  const router = useRouter();
  const { data: session } = useSession();
  const utils = api.useUtils();
  const { data: messages, isLoading } = api.chat.list.useQuery(undefined, {
    refetchInterval: 5_000, // casi tiempo real sin websockets
  });
  // Quién ha leído hasta dónde: mismo sondeo que la conversación
  const { data: readMarkers } = api.chat.readMarkers.useQuery(undefined, {
    refetchInterval: 5_000,
  });
  const { data: users } = api.user.list.useQuery();
  const [text, setText] = useState("");
  // Mensaje pulsado: muestra sus reacciones y, si es mío, el botón de editar
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // Mensaje que se está editando y su texto
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const myId = session?.user.id;

  // Envío optimista: el mensaje aparece al instante con un id temporal y el servidor confirma detrás
  const send = api.chat.send.useMutation({
    onMutate: async ({ text: newText }) => {
      await utils.chat.list.cancel();
      const previous = utils.chat.list.getData();
      setText("");
      if (previous && myId) {
        const optimistic = {
          id: `temp-${Date.now()}`,
          userId: myId,
          groupId: null as string | null,
          text: newText,
          createdAt: new Date(),
          user: { id: myId, name: session?.user.name ?? "" },
          reactions: [] as { userId: string; emoji: string }[],
          system: false,
        };
        utils.chat.list.setData(undefined, [...previous, optimistic]);
      }
      return { previous, newText };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) utils.chat.list.setData(undefined, context.previous);
      if (context?.newText) setText(context.newText); // devolver el texto para reintentar
    },
    onSettled: () => {
      void utils.chat.list.invalidate();
      void utils.chat.readMarkers.invalidate();
    },
  });
  const sendError = send.error?.message ?? null;

  // Los mensajes se pueden editar pero no borrar. La edición es optimista: el texto cambia al
  // instante y el servidor confirma detrás.
  const edit = api.chat.edit.useMutation({
    onMutate: async ({ id, text: newText }) => {
      await utils.chat.list.cancel();
      const previous = utils.chat.list.getData();
      if (previous) {
        utils.chat.list.setData(undefined, previous.map((m) => (m.id === id ? { ...m, text: newText } : m)));
      }
      setEditing(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) utils.chat.list.setData(undefined, context.previous);
    },
    onSettled: () => utils.chat.list.invalidate(),
  });

  // Reacción optimista: se pinta/despinta al toque y se confirma detrás
  const react = api.chat.toggleReaction.useMutation({
    onMutate: async ({ messageId, emoji }) => {
      setPickerFor(null);
      await utils.chat.list.cancel();
      const previous = utils.chat.list.getData();
      if (previous && myId) {
        utils.chat.list.setData(
          undefined,
          previous.map((m) => {
            if (m.id !== messageId) return m;
            const mine = m.reactions.some((r) => r.emoji === emoji && r.userId === myId);
            return {
              ...m,
              reactions: mine
                ? m.reactions.filter((r) => !(r.emoji === emoji && r.userId === myId))
                : [...m.reactions, { userId: myId, emoji }],
            };
          }),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) utils.chat.list.setData(undefined, context.previous);
    },
    onSettled: () => utils.chat.list.invalidate(),
  });

  useEffect(() => setMounted(true), []);

  // Mientras el chat ocupa la pantalla, la página de debajo no se mueve
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  if (!mounted) return null;

  const avatarOf = (userId: string) => users?.find((u) => u.id === userId)?.avatarUrl ?? null;

  // Cada lector queda anclado al último mensaje que ya había llegado cuando leyó;
  // quien no ha leído nada no aparece.
  const readersByMessage = new Map<string, Array<{ userId: string; name: string }>>();
  if (messages && readMarkers) {
    for (const r of readMarkers) {
      const readAt = new Date(r.lastReadAt).getTime();
      let anchor: string | null = null;
      for (const m of messages) {
        if (new Date(m.createdAt).getTime() <= readAt) anchor = m.id;
        else break;
      }
      if (!anchor) continue;
      const list = readersByMessage.get(anchor) ?? [];
      list.push({ userId: r.userId, name: r.name });
      readersByMessage.set(anchor, list);
    }
  }

  // Separador de día: la fecha va fuera de los mensajes, centrada, una vez por día
  const dayLabel = (d: Date) =>
    isToday(d)
      ? "Hoy"
      : isYesterday(d)
        ? "Ayer"
        : format(d, isSameYear(d, new Date()) ? "EEEE d 'de' MMMM" : "EEEE d 'de' MMMM 'de' yyyy", { locale: es });

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-30 flex flex-col bg-bg",
        // Hueco para la cabecera y la barra inferior del móvil; en escritorio,
        // para la barra lateral.
        "pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(3.5rem+env(safe-area-inset-bottom))]",
        "md:left-60 md:pb-0 md:pt-0",
      )}
    >
      {isLoading ? (
        <div className="flex-1"><Spinner /></div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages?.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              Nadie ha escrito todavía. ¡Rompe el hielo! 💬
            </p>
          )}
          {messages?.map((m, i) => {
            const prev = i > 0 ? messages[i - 1] : null;
            const dayDivider = (!prev || !isSameDay(prev.createdAt, m.createdAt)) && (
              <p className="py-1 text-center text-xs font-medium capitalize text-muted">{dayLabel(m.createdAt)}</p>
            );
            const readers = readersByMessage.get(m.id);
            const seenLabel = readers ? `Visto por ${readers.map((r) => r.name).join(", ")}` : "";
            const seenBy = readers && readers.length > 0 && (
              <div className="flex justify-end pr-1 opacity-60" title={seenLabel} aria-label={seenLabel}>
                <div className="flex -space-x-1">
                  {readers.slice(0, 4).map((r) => (
                    <span key={r.userId} className="rounded-full ring-2 ring-bg">
                      <Avatar name={r.name} src={avatarOf(r.userId)} size={15} />
                    </span>
                  ))}
                </div>
                {readers.length > 4 && (
                  <span className="ml-1 self-center text-[10px] text-muted">+{readers.length - 4}</span>
                )}
              </div>
            );

            // Aviso del sistema (rachas del lunes, «está entrenando»): sin autor ni
            // reacciones. Puede llevar varias líneas (título y cuerpo); lleva la hora
            if (m.system || !m.user) {
              return (
                <div key={m.id} className="space-y-1">
                  {dayDivider}
                  <div className="flex items-center justify-center">
                    <div className="max-w-[85%] rounded-2xl bg-surface-2/60 px-3 py-1 text-center text-xs text-muted">
                      <p className="whitespace-pre-line break-words">{m.text}</p>
                      <p className="mt-0.5 text-[10px] opacity-70">{format(m.createdAt, "HH:mm")}</p>
                    </div>
                  </div>
                  {seenBy}
                </div>
              );
            }

            const author = m.user;
            const mine = author.id === myId;
            const isEditing = editing?.id === m.id;
            // Solo los míos y ya confirmados por el servidor (los optimistas aún tienen id temporal)
            const canEdit = mine && !m.id.startsWith("temp-");
            return (
              <div key={m.id} className="space-y-1">
                {dayDivider}
                <div className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                  {!mine && (
                    <Link href={`/perfil/${author.id}`} className="shrink-0 transition hover:opacity-80">
                      <Avatar name={author.name} src={avatarOf(author.id)} size={28} />
                    </Link>
                  )}
                  <div className={cn("max-w-[75%]", mine && "flex flex-col items-end")}>
                    {isEditing ? (
                      <form
                        className="w-full space-y-1.5 rounded-2xl rounded-br-md bg-accent/20 p-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const t = editing.text.trim();
                          if (t.length === 0) return;
                          if (t === m.text) setEditing(null);
                          else edit.mutate({ id: m.id, text: t });
                        }}
                      >
                        <textarea
                          autoFocus
                          value={editing.text}
                          onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                          maxLength={1000}
                          rows={2}
                          className="w-full resize-none rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-base text-fg focus:outline-none focus:ring-2 focus:ring-accent/60"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            aria-label="Cancelar la edición"
                            className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted transition hover:text-fg"
                          >
                            <X className="inline h-3.5 w-3.5" /> Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={editing.text.trim().length === 0}
                            className="rounded-lg bg-accent px-2 py-1 text-xs font-medium text-accent-fg disabled:opacity-50"
                          >
                            <Check className="inline h-3.5 w-3.5" /> Guardar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPickerFor((p) => (p === m.id ? null : m.id))}
                        className={cn(
                          "block w-full rounded-2xl px-3 py-2 text-left",
                          mine ? "rounded-br-md bg-accent/20" : "rounded-bl-md bg-surface-2",
                        )}
                      >
                        {!mine && <p className="text-xs font-semibold text-accent">{author.name}</p>}
                        <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
                        <p className="mt-0.5 text-right text-[10px] text-muted">{format(m.createdAt, "HH:mm")}</p>
                      </button>
                    )}
                    {!isEditing && (m.reactions.length > 0 || pickerFor === m.id) && (
                      <div className={cn("mt-1 flex flex-wrap items-center gap-1", mine && "justify-end")}>
                        {(["👍", "💪", "🔥"] as const).map((emoji) => {
                          const count = m.reactions.filter((r) => r.emoji === emoji).length;
                          const iReacted = m.reactions.some((r) => r.emoji === emoji && r.userId === myId);
                          if (count === 0 && pickerFor !== m.id) return null;
                          return (
                            <button
                              key={emoji}
                              onClick={() => react.mutate({ messageId: m.id, emoji })}
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs transition",
                                iReacted ? "bg-accent/25" : "bg-surface-2 hover:bg-accent/15",
                                count === 0 && "opacity-60",
                              )}
                            >
                              {emoji}{count > 0 ? ` ${count}` : ""}
                            </button>
                          );
                        })}
                        {/* Editar aparece al pulsar el mensaje (no hay opción de borrar) */}
                        {canEdit && pickerFor === m.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setPickerFor(null);
                              setEditing({ id: m.id, text: m.text });
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted transition hover:bg-accent/15 hover:text-fg"
                          >
                            <Pencil className="h-3 w-3" aria-hidden /> Editar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {seenBy}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {sendError && (
        <p className="shrink-0 border-t border-border px-3 pt-2 text-xs text-red-400">
          No se pudo enviar: {sendError}
        </p>
      )}
      <form
        className="flex shrink-0 items-center gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length > 0) send.mutate({ text: text.trim() });
        }}
      >
        {/* Sin cabecera propia: la flecha de volver vive junto al cuadro de escribir */}
        <button
          type="button"
          onClick={() => router.replace("/comunidad?tab=ranking", { scroll: false })}
          aria-label="Volver a Comunidad"
          title="Volver a Comunidad"
          className="shrink-0 rounded-xl p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un mensaje…"
          maxLength={1000}
          className="h-11 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-base text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60"
        />
        <Button type="submit" disabled={text.trim().length === 0} loading={send.isLoading}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>,
    document.body,
  );
}
