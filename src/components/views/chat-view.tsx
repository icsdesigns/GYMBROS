"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import { api } from "@/trpc/react";
import { Avatar, Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useViewAsUser } from "@/lib/use-view-as-user";

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
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [viewAsUser] = useViewAsUser();

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

  const remove = api.chat.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.chat.list.cancel();
      const previous = utils.chat.list.getData();
      if (previous) utils.chat.list.setData(undefined, previous.filter((m) => m.id !== id));
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
  const canDelete = session?.user.role === "ADMIN" && !viewAsUser;

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
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <button
          onClick={() => router.replace("/comunidad?tab=ranking", { scroll: false })}
          aria-label="Volver a Comunidad"
          className="rounded-xl p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-semibold">Chat del grupo</h1>
      </div>

      {isLoading ? (
        <div className="flex-1"><Spinner /></div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages?.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              Nadie ha escrito todavía. ¡Rompe el hielo! 💬
            </p>
          )}
          {messages?.map((m) => {
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
            // reacciones. Puede llevar varias líneas (título y cuerpo)
            if (m.system || !m.user) {
              return (
                <div key={m.id} className="space-y-1">
                  <div className="group flex items-center justify-center gap-1.5">
                    <p className="max-w-[85%] whitespace-pre-line break-words rounded-2xl bg-surface-2/60 px-3 py-1 text-center text-xs text-muted">
                      {m.text}
                    </p>
                    {canDelete && (
                      <button
                        title="Borrar aviso"
                        onClick={() => remove.mutate({ id: m.id })}
                        className="text-muted/50 transition hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {seenBy}
                </div>
              );
            }

            const author = m.user;
            const mine = author.id === myId;
            return (
              <div key={m.id} className="space-y-1">
                <div className={cn("group flex items-end gap-2", mine && "flex-row-reverse")}>
                  {!mine && (
                    <Link href={`/perfil/${author.id}`} className="shrink-0 transition hover:opacity-80">
                      <Avatar name={author.name} src={avatarOf(author.id)} size={28} />
                    </Link>
                  )}
                  <div className={cn("max-w-[75%]", mine && "flex flex-col items-end")}>
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
                      <p className="mt-0.5 text-right text-[10px] text-muted">
                        {format(m.createdAt, "d MMM · HH:mm", { locale: es })}
                      </p>
                    </button>
                    {(m.reactions.length > 0 || pickerFor === m.id) && (
                      <div className="mt-1 flex flex-wrap gap-1">
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
                      </div>
                    )}
                  </div>
                  {(mine || canDelete) && (
                    <button
                      title="Borrar mensaje"
                      onClick={() => remove.mutate({ id: m.id })}
                      className="text-muted/50 transition hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
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
        className="flex shrink-0 gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length > 0) send.mutate({ text: text.trim() });
        }}
      >
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
