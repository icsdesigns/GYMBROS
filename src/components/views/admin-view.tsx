"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Shield, Trash2, Megaphone, MessageSquare, Check, Undo2, BarChart3, Eye, Plus, Lock, LockOpen, MailPlus, ChevronDown, Send, Users, Sparkles, KeyRound, BellRing, BellOff } from "lucide-react";
import { api } from "@/trpc/react";
import { Button, Card, Input, Label, Spinner, Badge, Modal } from "@/components/ui";
import { PollAnswerCard } from "@/components/poll-card";
import { cn } from "@/lib/utils";


/**
 * Estado de las notificaciones de un miembro.
 *
 * El permiso del navegador no se puede consultar desde el servidor, así que se
 * refleja lo equivalente en la práctica: si tiene algún dispositivo dado de
 * alta. Sin ninguno no hay forma de hacerle llegar un push, tanto si nunca
 * aceptó como si lo bloqueó o desinstaló la app.
 */
function PushStatus({
  push,
}: {
  push: { devices: number; since: Date | null; mutedCategories: string[] };
}) {
  const active = push.devices > 0;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
          active ? "bg-accent/15 text-accent" : "bg-red-500/15 text-red-400",
        )}
        title={
          active
            ? "Tiene al menos un dispositivo con el permiso concedido"
            : "No ha concedido el permiso en ningún dispositivo: no recibirá ningún aviso"
        }
      >
        {active ? <BellRing className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
        {active
          ? `Permiso concedido · ${push.devices} ${push.devices === 1 ? "dispositivo" : "dispositivos"}`
          : "Sin permiso de notificaciones"}
      </span>
      {active && push.since && (
        <span className="text-muted">desde {format(push.since, "dd/MM/yyyy")}</span>
      )}
      {push.mutedCategories.length > 0 && (
        <span
          className="text-amber-400"
          title={`Categorías silenciadas: ${push.mutedCategories.join(", ")}`}
        >
          🔕 {push.mutedCategories.length}{" "}
          {push.mutedCategories.length === 1 ? "categoría silenciada" : "categorías silenciadas"}
        </span>
      )}
    </p>
  );
}

/** Sección plegable del panel de administración (cerrada por defecto). */
function AdminSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-semibold">{icon} {title}</span>
        <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-border p-4">{children}</div>
    </details>
  );
}

export function AdminView() {
  const utils = api.useUtils();
  const { data: users, isLoading } = api.admin.users.useQuery();
  const { data: rules } = api.admin.listRules.useQuery();
  const { data: feedbacks } = api.feedback.listAll.useQuery();
  const { data: updateReactions } = api.update.reactions.useQuery();

  const [broadcast, setBroadcast] = useState({ title: "", body: "" });
  const [sent, setSent] = useState<{ sent: number; skipped: number } | null>(null);
  const [poll, setPoll] = useState({ title: "", description: "", options: ["", ""], schedule: "now" as "now" | "h22" | "h10" });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pollSent, setPollSent] = useState(false);
  const { data: pollResults } = api.poll.results.useQuery();

  const updateRule = api.admin.updateRule.useMutation({
    onSuccess: () => utils.admin.listRules.invalidate(),
  });
  const setRole = api.admin.setRole.useMutation({ onSuccess: () => utils.admin.users.invalidate() });
  const deleteUser = api.admin.deleteUser.useMutation({ onSuccess: () => utils.admin.users.invalidate() });

  // Enlace de rescate para quien no puede recibirlo por push. Se muestra una
  // sola vez: el token no vuelve a estar disponible en claro.
  const [recoverLink, setRecoverLink] = useState<{ url: string; name: string; minutes: number } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const resetLink = api.admin.resetLink.useMutation({
    onSuccess: (r) => {
      setRecoverLink({ url: r.url, name: r.name, minutes: r.expiresInMinutes });
      setLinkCopied(false);
    },
  });
  const setFeedbackStatus = api.feedback.setStatus.useMutation({
    onSuccess: () => utils.feedback.listAll.invalidate(),
  });
  const deleteFeedback = api.feedback.delete.useMutation({
    onSuccess: () => utils.feedback.listAll.invalidate(),
  });
  const createPoll = api.poll.create.useMutation({
    onSuccess: () => {
      utils.poll.invalidate();
      setPoll({ title: "", description: "", options: ["", ""], schedule: "now" });
      setPreviewOpen(false);
      setPollSent(true);
    },
  });
  const setPollClosed = api.poll.setClosed.useMutation({ onSuccess: () => utils.poll.invalidate() });
  const deletePoll = api.poll.delete.useMutation({ onSuccess: () => utils.poll.invalidate() });
  const { data: templates } = api.admin.notificationTemplates.useQuery();
  const [testSent, setTestSent] = useState<string | null>(null);
  const testNotification = api.admin.testNotification.useMutation({
    onSuccess: (_d, vars) => {
      setTestSent(vars.code ?? "generic");
      setTimeout(() => setTestSent(null), 2500);
    },
  });
  const updateTemplate = api.admin.updateTemplate.useMutation({
    onSuccess: () => utils.admin.notificationTemplates.invalidate(),
  });
  const sendBroadcast = api.admin.broadcast.useMutation({
    onSuccess: (result) => {
      setBroadcast({ title: "", body: "" });
      setSent(result);
      // La notificación también llega al propio admin: refrescar su campanita al momento
      utils.notification.invalidate();
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="max-w-lg space-y-3">
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <Shield className="h-5 w-5 text-accent" /> Administración
      </h2>

      {/* Usuarios */}
      <AdminSection icon={<Users className="h-4 w-4" />} title="Usuarios">
        <div className="space-y-2">
          {users?.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 p-3">
              <div>
                <p className="text-sm font-medium">
                  {u.name} {u.role === "ADMIN" && <Badge className="ml-1 bg-accent/15 text-accent">admin</Badge>}
                </p>
                <p className="text-xs text-muted">
                  {u.email} · desde {format(u.createdAt, "dd/MM/yyyy")} · {u._count.attendances} asistencias,{" "}
                  {u._count.workouts} entrenos, {u._count.personalRecords} PRs
                </p>
                <PushStatus push={u.push} />
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm" variant="secondary"
                  loading={resetLink.isLoading && resetLink.variables?.userId === u.id}
                  onClick={() => resetLink.mutate({ userId: u.id })}
                  title="Generar enlace para restablecer su contraseña"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm" variant="secondary"
                  onClick={() => setRole.mutate({ userId: u.id, role: u.role === "ADMIN" ? "USER" : "ADMIN" })}
                >
                  {u.role === "ADMIN" ? "Quitar admin" : "Hacer admin"}
                </Button>
                <Button
                  size="sm" variant="danger"
                  onClick={() => {
                    if (confirm(`¿Eliminar a ${u.name} y TODOS sus datos? Esta acción no se puede deshacer.`))
                      deleteUser.mutate({ userId: u.id });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </AdminSection>

      {/* Sistema de puntos */}
      <AdminSection icon={<BarChart3 className="h-4 w-4" />} title="Sistema de puntos">
        <div className="space-y-1">
          <p className="text-xs text-muted">
            Cada regla se otorga automáticamente. Puedes cambiar los puntos o desactivarlas.
          </p>
        </div>
        <div className="space-y-2">
          {rules?.map((r) => (
            <div
              key={r.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-2.5",
                !r.enabled && "opacity-50",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <button
                  title={r.enabled ? "Desactivar" : "Activar"}
                  onClick={() => updateRule.mutate({ id: r.id, enabled: !r.enabled })}
                  className={cn(
                    "h-5 w-9 shrink-0 rounded-full p-0.5 transition",
                    r.enabled ? "bg-accent" : "bg-border",
                  )}
                >
                  <span
                    className={cn(
                      "block h-4 w-4 rounded-full bg-bg transition-transform",
                      r.enabled && "translate-x-4",
                    )}
                  />
                </button>
                <span className="truncate text-sm">{r.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Input
                  type="number" min={0} defaultValue={r.points} className="h-8 w-20 text-center"
                  onBlur={(e) => {
                    const v = +e.target.value;
                    if (v !== r.points && v >= 0) updateRule.mutate({ id: r.id, points: v });
                  }}
                />
                <span className="text-xs text-muted">pts</span>
              </div>
            </div>
          ))}
        </div>
      </AdminSection>

      {/* Encuestas */}
      <AdminSection icon={<BarChart3 className="h-4 w-4" />} title="Encuestas">
        <div className="space-y-1">
          <p className="text-xs text-muted">Pregunta al grupo; los resultados se ven aquí abajo.</p>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input value={poll.title} placeholder="¿Cambiamos el horario de los sábados?"
              onChange={(e) => setPoll((p) => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <Label>Descripción (opcional)</Label>
            <Input value={poll.description}
              onChange={(e) => setPoll((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div>
            <Label>Opciones</Label>
            <div className="space-y-2">
              {poll.options.map((option, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={option}
                    placeholder={`Opción ${i + 1}`}
                    onChange={(e) =>
                      setPoll((p) => ({
                        ...p,
                        options: p.options.map((o, j) => (j === i ? e.target.value : o)),
                      }))
                    }
                  />
                  {poll.options.length > 2 && (
                    <Button
                      size="sm" variant="ghost" className="text-red-400 self-center"
                      onClick={() =>
                        setPoll((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {poll.options.length < 6 && (
                <Button size="sm" variant="secondary"
                  onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ""] }))}>
                  <Plus className="h-3.5 w-3.5" /> Añadir opción
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label>Envío</Label>
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: "now", label: "Inmediatamente" },
                { key: "h22", label: "A las 22:00" },
                { key: "h10", label: "A las 10:00" },
              ] as const).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setPoll((p) => ({ ...p, schedule: s.key }))}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm transition",
                    poll.schedule === s.key
                      ? "bg-accent font-medium text-accent-fg"
                      : "bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {poll.schedule !== "now" && (
              <p className="mt-1 text-xs text-muted">Del siguiente día disponible (hoy si aún no ha pasado la hora).</p>
            )}
          </div>
          <Button
            variant="secondary"
            disabled={poll.title.trim().length < 2 || poll.options.filter((o) => o.trim()).length < 2}
            onClick={() => {
              setPollSent(false);
              setPreviewOpen(true);
            }}
          >
            <Eye className="h-4 w-4" /> Previsualizar y enviar
          </Button>
          {pollSent && <p className="text-sm text-accent">Encuesta enviada a todo el grupo ✅</p>}
        </div>

        {(pollResults?.length ?? 0) > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium">Resultados</p>
            {pollResults?.map((p) => (
              <div key={p.id} className="space-y-1.5 rounded-xl bg-surface-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    {p.title}{" "}
                    {p.closed && <Badge className="ml-1">cerrada</Badge>}
                    {p.pending && (
                      <Badge className="ml-1 bg-amber-400/15 text-amber-400">
                        programada · {format(p.publishAt, "d MMM HH:mm")}
                      </Badge>
                    )}
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm" variant="ghost"
                      title={p.closed ? "Reabrir" : "Cerrar votación"}
                      onClick={() => setPollClosed.mutate({ id: p.id, closed: !p.closed })}
                    >
                      {p.closed ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="text-red-400" title="Eliminar"
                      onClick={() => {
                        if (confirm("¿Eliminar la encuesta y sus votos?")) deletePoll.mutate({ id: p.id });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {p.options.map((option, i) => {
                  const count = p.counts[i] ?? 0;
                  const pct = p.total > 0 ? Math.round((count / p.total) * 100) : 0;
                  const voters = p.votersByOption?.[i] ?? [];
                  return (
                    <div key={i} className="space-y-1 rounded-lg bg-bg/40 p-1.5">
                      <div className="relative overflow-hidden rounded px-1 py-0.5 text-xs">
                        <span className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${pct}%` }} />
                        <span className="relative flex justify-between">
                          <span>{option}</span>
                          <span className="text-muted">{count} · {pct}%</span>
                        </span>
                      </div>
                      {voters.length > 0 && (
                        <p className="pl-1 text-[11px] text-muted">
                          {voters.map((v) => v.name).join(", ")}
                        </p>
                      )}
                    </div>
                  );
                })}
                <p className="text-xs text-muted">{p.total} {p.total === 1 ? "voto" : "votos"}</p>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      {/* Previsualización: así la verán los miembros */}
      <Modal
        open={!!recoverLink}
        onClose={() => setRecoverLink(null)}
        title="Enlace de recuperación"
        icon={<KeyRound className="h-5 w-5 text-accent" />}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Pásale este enlace a <strong className="text-fg">{recoverLink?.name}</strong>. Le deja
            elegir una contraseña nueva, solo funciona una vez y caduca en {recoverLink?.minutes}{" "}
            minutos.
          </p>
          <p className="break-all rounded-xl bg-surface-2 p-3 font-mono text-xs">{recoverLink?.url}</p>
          <Button
            className="w-full"
            onClick={() => {
              if (recoverLink) void navigator.clipboard.writeText(recoverLink.url);
              setLinkCopied(true);
            }}
          >
            {linkCopied ? <><Check className="h-4 w-4" /> Copiado</> : "Copiar enlace"}
          </Button>
        </div>
      </Modal>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Así la recibirá el grupo">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface-2/50 p-4">
            <PollAnswerCard
              preview
              selected={null}
              poll={{
                id: "preview",
                title: poll.title.trim(),
                description: poll.description.trim() || null,
                options: poll.options.map((o) => o.trim()).filter(Boolean),
              }}
            />
          </div>
          <p className="text-xs text-muted">
            Los miembros la verán en un aviso obligatorio: solo podrán responder o posponer 30 min
            (máximo 3 veces).
            {poll.schedule === "now"
              ? " Se enviará inmediatamente."
              : ` Se enviará a las ${poll.schedule === "h22" ? "22:00" : "10:00"} del siguiente día disponible.`}
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              loading={createPoll.isLoading}
              onClick={() =>
                createPoll.mutate({
                  title: poll.title.trim(),
                  description: poll.description.trim() || undefined,
                  options: poll.options.map((o) => o.trim()).filter(Boolean),
                  schedule: poll.schedule,
                })
              }
            >
              {poll.schedule === "now" ? "Enviar a todos" : "Programar envío"}
            </Button>
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              Seguir editando
            </Button>
          </div>
        </div>
      </Modal>

      {/* Feedback */}
      <AdminSection icon={<MessageSquare className="h-4 w-4" />} title="Feedback">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <MessageSquare className="h-4 w-4" /> Feedback de los usuarios ({feedbacks?.length ?? 0})
        </h3>
        {feedbacks?.length === 0 ? (
          <p className="text-sm text-muted">Nadie ha enviado comentarios todavía.</p>
        ) : (
          <div className="space-y-2">
            {feedbacks?.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-xl bg-surface-2 p-3",
                  f.status === "RESOLVED" && "opacity-60",
                )}
              >
                <div>
                  <p className={cn("text-sm", f.status === "RESOLVED" && "line-through")}>{f.text}</p>
                  <p className="mt-1 text-xs text-muted">
                    {f.user.name} · {format(f.createdAt, "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm" variant="ghost"
                    title={f.status === "OPEN" ? "Marcar resuelto" : "Reabrir"}
                    onClick={() =>
                      setFeedbackStatus.mutate({ id: f.id, status: f.status === "OPEN" ? "RESOLVED" : "OPEN" })
                    }
                  >
                    {f.status === "OPEN" ? <Check className="h-3.5 w-3.5" /> : <Undo2 className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="text-red-400" title="Eliminar"
                    onClick={() => deleteFeedback.mutate({ id: f.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      {/* Plantillas de notificación (disparador fijo, contenido editable) */}
      <AdminSection icon={<MailPlus className="h-4 w-4" />} title="Plantillas de notificación">
        <div className="space-y-1">
          <p className="text-xs text-muted">
            Los disparadores son fijos; puedes editar el texto o desactivarlos. Un comodín sin
            valor desaparece del mensaje. Comodines disponibles:{" "}
            <code className="text-accent">{"{name}"}</code> (protagonista),{" "}
            <code className="text-accent">{"{count}"}</code>,{" "}
            <code className="text-accent">{"{exercises}"}</code>,{" "}
            <code className="text-accent">{"{routine}"}</code>,{" "}
            <code className="text-accent">{"{weekWorkout}"}</code> (1er, 2º… entreno de la semana),{" "}
            <code className="text-accent">{"{days}"}</code>,{" "}
            <code className="text-accent">{"{target}"}</code>,{" "}
            <code className="text-accent">{"{missing}"}</code>,{" "}
            <code className="text-accent">{"{streak}"}</code>,{" "}
            <code className="text-accent">{"{points}"}</code> (p. ej. «+35 puntos») y{" "}
            <code className="text-accent">{"{milestone}"}</code> (el hito de racha de la semana).
          </p>
        </div>
        <div className="space-y-3">
          {templates?.map((t) => (
            <div key={t.code} className={`space-y-2 rounded-xl bg-surface-2 p-3 ${!t.enabled ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t.code}</span>
                <button
                  onClick={() => updateTemplate.mutate({ code: t.code, enabled: !t.enabled })}
                  className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition ${t.enabled ? "bg-accent" : "bg-border"}`}
                >
                  <span className={`block h-4 w-4 rounded-full bg-bg transition-transform ${t.enabled ? "translate-x-4" : ""}`} />
                </button>
              </div>
              <Input
                defaultValue={t.title}
                onBlur={(e) => { if (e.target.value.trim() && e.target.value !== t.title) updateTemplate.mutate({ code: t.code, title: e.target.value.trim() }); }}
              />
              <Input
                defaultValue={t.body ?? ""}
                placeholder="Mensaje (opcional)"
                onBlur={(e) => { if (e.target.value !== (t.body ?? "")) updateTemplate.mutate({ code: t.code, body: e.target.value || null }); }}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" loading={testNotification.isLoading}
                  onClick={() => testNotification.mutate({ code: t.code })}>
                  <Send className="h-3.5 w-3.5" /> Probar
                </Button>
                {testSent === t.code && <span className="text-xs text-accent">Enviada a ti ✅</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button size="sm" variant="secondary" loading={testNotification.isLoading}
            onClick={() => testNotification.mutate({})}>
            <Send className="h-3.5 w-3.5" /> Enviar notificación de prueba
          </Button>
          {testSent === "generic" && <span className="text-xs text-accent">Enviada ✅</span>}
        </div>
      </AdminSection>

      {/* Aviso al grupo */}
      <AdminSection icon={<Megaphone className="h-4 w-4" />} title="Notificación a todo el grupo">
        <div>
          <Label>Título</Label>
          <Input value={broadcast.title} onChange={(e) => setBroadcast((b) => ({ ...b, title: e.target.value }))} />
        </div>
        <div>
          <Label>Mensaje</Label>
          <Input value={broadcast.body} onChange={(e) => setBroadcast((b) => ({ ...b, body: e.target.value }))} />
        </div>
        <Button
          disabled={!broadcast.title}
          loading={sendBroadcast.isLoading}
          onClick={() => sendBroadcast.mutate({ title: broadcast.title, body: broadcast.body || undefined })}
        >
          Enviar a todos
        </Button>
        <p className="text-xs text-muted">
          Llega a quien tenga activada la categoría «Avisos del administrador» en sus ajustes.
        </p>
        {sent && (
          <p className="text-sm text-accent">
            Enviada a {sent.sent} {sent.sent === 1 ? "persona" : "personas"} ✅
            {sent.skipped > 0 && (
              <span className="text-muted">
                {" "}· {sent.skipped} {sent.skipped === 1 ? "la tiene" : "las tienen"} silenciada
              </span>
            )}
          </p>
        )}
      </AdminSection>

      {/* Cómo ha sentado cada novedad */}
      <AdminSection icon={<Sparkles className="h-4 w-4" />} title="Reacciones a las novedades">
        <p className="text-xs text-muted">
          Recuento anónimo: se ve cuánta gente ha reaccionado, pero nunca quién ha votado qué.
          Las novedades se dan de alta en <code className="text-fg">src/lib/updates.ts</code>.
        </p>
        {(updateReactions?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No hay ninguna novedad publicada.</p>
        ) : (
          <div className="space-y-3">
            {updateReactions?.map((u) => (
              <div key={u.id} className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {u.emoji} {u.title}
                    </p>
                    <p className="text-xs text-muted">
                      {format(new Date(u.date), "d MMM yyyy")} ·{" "}
                      {u.seen === 0
                        ? "sin reacciones todavía"
                        : `${u.seen} ${u.seen === 1 ? "respuesta" : "respuestas"}`}
                      {u.pending > 0 && ` · ${u.pending} sin ver`}
                    </p>
                  </div>
                  {u.likePct !== null && (
                    <span
                      className={cn(
                        "shrink-0 text-lg font-bold",
                        u.likePct >= 50 ? "text-accent" : "text-amber-400",
                      )}
                    >
                      {u.likePct}%
                    </span>
                  )}
                </div>

                {u.seen > 0 && (
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface">
                    <span className="bg-accent" style={{ width: `${(u.like / u.seen) * 100}%` }} />
                    <span className="bg-amber-400" style={{ width: `${(u.meh / u.seen) * 100}%` }} />
                  </div>
                )}

                <div className="flex gap-4 text-xs">
                  <span className="text-accent">👍 {u.like}</span>
                  <span className="text-amber-400">🫠 {u.meh}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSection>
    </div>
  );
}
