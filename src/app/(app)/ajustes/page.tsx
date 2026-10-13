"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { signOut } from "next-auth/react";
import {
  LogOut, Camera, Eye, GraduationCap, User, Bell, ShieldAlert,
  KeyRound, ChevronDown, Trash2,
} from "lucide-react";
import { api } from "@/trpc/react";
import { Button, Card, Input, Label, Spinner, Avatar, Modal } from "@/components/ui";
import { AdminView } from "@/components/views/admin-view";
import { PushSettings } from "@/components/push-settings";
import { useViewAsUser } from "@/lib/use-view-as-user";
import { useTutorialLaunch } from "@/lib/use-tutorial-launch";
import { cn } from "@/lib/utils";

// El `hint` evita la confusión de no saber qué apaga cada interruptor.
// Los avisos y encuestas del administrador NO figuran aquí a propósito: llegan
// siempre, así que ofrecer un interruptor sería mentir.
const NOTIFY_CATEGORIES: Array<{ key: string; label: string; hint: string }> = [
  { key: "prs", label: "PRs del grupo", hint: "Cuando alguien bate un récord" },
  { key: "workouts", label: "Entrenos del grupo", hint: "Cuando alguien empieza a entrenar" },
  { key: "chat", label: "Mensajes del chat", hint: "Aviso en el móvil cuando alguien escribe en el chat del grupo" },
  { key: "streaks", label: "Rachas y semanas", hint: "Tu racha en peligro o cumplida" },
  { key: "reminders", label: "Recordatorios de entreno", hint: "El aviso diario para no fallar" },
  { key: "system", label: "Sistema y logros", hint: "Logros y avisos de la app" },
];

function resizeImage(file: File, size = 192): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const side = Math.min(img.width, img.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Sección plegable, cerrada por defecto. */
function Section({ icon, title, children, defaultOpen = false }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-semibold">{icon} {title}</span>
        <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-border p-4">{children}</div>
    </details>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${on ? "bg-accent" : "bg-border"}`}
    >
      <span className={`block h-5 w-5 rounded-full bg-bg transition-transform ${on ? "translate-x-5" : ""}`} />
    </button>
  );
}

export default function SettingsPage() {
  const utils = api.useUtils();
  const { data: me, isLoading } = api.user.me.useQuery();
  const [form, setForm] = useState({ name: "", avatarUrl: "", gymStartDate: "" });
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewAsUser, setViewAsUser] = useViewAsUser();
  // Borrado de cuenta: la palabra la decide el servidor y hay que teclearla
  const [deletion, setDeletion] = useState<{ word: string; graceDays: number } | null>(null);
  const [deletionTyped, setDeletionTyped] = useState("");
  const [, setTutorial] = useTutorialLaunch();

  useEffect(() => {
    if (me) {
      setForm({
        name: me.name,
        avatarUrl: me.avatarUrl ?? "",
        gymStartDate: me.gymStartDate ? format(me.gymStartDate, "yyyy-MM-dd") : "",
      });
    }
  }, [me]);

  const update = api.user.updateProfile.useMutation({
    onSuccess: () => { utils.user.me.invalidate(); setMessage("Guardado ✅"); },
    // p. ej. «Ya hay alguien con ese nombre»
    onError: (e) => setMessage(e.message),
  });
  const changePassword = api.user.changePassword.useMutation({
    onSuccess: () => { setPasswords({ current: "", next: "" }); setMessage("Contraseña cambiada ✅"); },
    onError: (e) => setMessage(e.message),
  });
  const resetData = api.user.resetData.useMutation({
    onSuccess: () => { utils.invalidate(); setMessage("Perfil reseteado ✅"); },
    onError: (e) => setMessage(e.message),
  });
  const deletionChallenge = api.user.deletionChallenge.useMutation({
    onSuccess: (d) => { setDeletion(d); setDeletionTyped(""); },
    onError: (e) => setMessage(e.message),
  });
  // Al confirmar se cierra la sesión: el perfil ya no se ve en los grupos
  const requestDeletion = api.user.requestDeletion.useMutation({
    onSuccess: () => signOut({ callbackUrl: "/login" }),
    onError: (e) => setMessage(e.message),
  });
  const cancelDeletion = api.user.cancelDeletion.useMutation({
    onSuccess: () => { utils.user.me.invalidate(); setMessage("Borrado cancelado ✅"); },
  });

  if (isLoading || !me) return <Spinner />;

  const prefs = (me.notifyPrefs ?? {}) as Record<string, boolean>;

  return (
    <div className="space-y-8">
      <div className="max-w-lg space-y-3">
        <h1 className="text-2xl font-bold">Ajustes</h1>

        {/* Perfil */}
        <Section icon={<User className="h-4 w-4" />} title="Perfil">
          <div className="flex items-center gap-4">
            <Avatar name={form.name || me.name} src={form.avatarUrl || null} size={64} />
            <div className="flex-1 space-y-2">
              <input
                ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try { const url = await resizeImage(file); setForm((f) => ({ ...f, avatarUrl: url })); }
                  catch { setMessage("No se pudo procesar la imagen"); }
                  e.target.value = "";
                }}
              />
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="h-4 w-4" /> Subir foto
                </Button>
                {form.avatarUrl && (
                  <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setForm((f) => ({ ...f, avatarUrl: "" }))}>
                    Quitar
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label>Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>Fecha de inicio en el gimnasio</Label>
            <Input type="date" value={form.gymStartDate} onChange={(e) => setForm((f) => ({ ...f, gymStartDate: e.target.value }))} />
          </div>
          <Button
            loading={update.isLoading}
            onClick={() => update.mutate({
              name: form.name,
              avatarUrl: form.avatarUrl || null,
              gymStartDate: form.gymStartDate ? new Date(form.gymStartDate) : null,
            })}
          >
            Guardar cambios
          </Button>
        </Section>

        {/* Notificaciones */}
        <Section icon={<Bell className="h-4 w-4" />} title="Notificaciones">
          <PushSettings />
          <div className="space-y-2">
            <p className="text-sm font-medium">Categorías (todas activas por defecto)</p>
            <p className="text-xs text-muted">
              Los avisos y encuestas del administrador llegan siempre y no se pueden desactivar.
            </p>
            {NOTIFY_CATEGORIES.map((c) => {
              const on = prefs[c.key] !== false;
              return (
                <div key={c.key} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className={cn("block text-sm", on ? "text-fg" : "text-muted")}>{c.label}</span>
                    <span className="block text-xs text-muted/80">{c.hint}</span>
                  </span>
                  <Toggle on={on} onClick={() => update.mutate({ notifyPrefs: { ...prefs, [c.key]: !on } })} />
                </div>
              );
            })}
          </div>
        </Section>

        {/* Cuenta */}
        <Section icon={<KeyRound className="h-4 w-4" />} title="Cuenta">
          <div>
            <Label>Contraseña actual</Label>
            <Input type="password" autoComplete="current-password" value={passwords.current}
              onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))} />
          </div>
          <div>
            <Label>Nueva contraseña (mínimo 8 caracteres)</Label>
            <Input type="password" autoComplete="new-password" value={passwords.next}
              onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))} />
          </div>
          <Button variant="secondary" disabled={!passwords.current || passwords.next.length < 8}
            loading={changePassword.isLoading} onClick={() => changePassword.mutate(passwords)}>
            Cambiar contraseña
          </Button>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <span className="text-sm text-muted">Cerrar sesión en este dispositivo</span>
            <Button variant="secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </Button>
          </div>
          <p className="text-xs text-muted">Cuenta creada el {format(me.createdAt, "dd/MM/yyyy")} · {me.email}</p>
        </Section>

        {/* Ayuda */}
        <Section icon={<GraduationCap className="h-4 w-4" />} title="Ayuda">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">Repasa el tutorial de bienvenida.</span>
            <Button variant="secondary" size="sm" onClick={() => setTutorial(true)}>Ver tutorial</Button>
          </div>
        </Section>

        {/* Administración: ver como usuario */}
        {me.role === "ADMIN" && (
          <Section icon={<Eye className="h-4 w-4" />} title="Vista de administrador">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted">Ver la app como un usuario estándar (oculta la administración).</span>
              <Toggle on={viewAsUser} onClick={() => setViewAsUser(!viewAsUser)} />
            </div>
          </Section>
        )}

        {/* Zona peligrosa */}
        <Section icon={<ShieldAlert className="h-4 w-4 text-red-400" />} title="Zona peligrosa">
          <p className="text-sm text-muted">
            Resetear el perfil elimina <strong>todos</strong> tus registros. Se conservan tu cuenta y tus rutinas. No se puede deshacer.
          </p>
          <Button variant="danger" loading={resetData.isLoading}
            onClick={() => {
              const a = prompt('Escribe RESET para borrar todos tus registros de forma permanente:');
              if (a === "RESET") resetData.mutate({ confirmation: "RESET" });
              else if (a !== null) setMessage("Reset cancelado");
            }}>
            Resetear mi perfil
          </Button>

          <div className="space-y-2 border-t border-border pt-3">
            {me.deletionRequestedAt ? (
              <>
                <p className="text-sm text-red-400">
                  Tu cuenta está pendiente de borrado desde el{" "}
                  {format(me.deletionRequestedAt, "dd/MM/yyyy")}. Se eliminará definitivamente 15 días
                  después. Puedes cancelarlo ahora o simplemente volviendo a iniciar sesión.
                </p>
                <Button variant="secondary" loading={cancelDeletion.isLoading}
                  onClick={() => cancelDeletion.mutate()}>
                  Cancelar el borrado
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Borrar la cuenta cierra la sesión y te saca de todos tus grupos al instante, pero tu
                  información se conserva <strong>15 días</strong>. Si vuelves a entrar dentro de ese
                  plazo, el borrado se cancela y tu perfil reaparece tal cual estaba. Pasados los 15
                  días se elimina todo sin vuelta atrás.
                </p>
                <Button variant="danger" loading={deletionChallenge.isLoading}
                  onClick={() => deletionChallenge.mutate()}>
                  <Trash2 className="h-4 w-4" /> Borrar mi cuenta
                </Button>
              </>
            )}
          </div>
        </Section>

        {/* Confirmación del borrado: hay que teclear una palabra aleatoria,
            justo para que no se haga en piloto automático */}
        <Modal
          open={deletion !== null}
          onClose={() => setDeletion(null)}
          title="Borrar mi cuenta"
          subtitle="Esto cierra la sesión y te saca de tus grupos"
          footer={
            <Button
              variant="danger"
              className="w-full"
              disabled={deletionTyped.trim().toLowerCase() !== deletion?.word}
              loading={requestDeletion.isLoading}
              onClick={() => requestDeletion.mutate({ word: deletionTyped.trim() })}
            >
              Borrar definitivamente
            </Button>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Tienes <strong>{deletion?.graceDays ?? 15} días</strong> para arrepentirte: durante ese
              plazo basta con volver a iniciar sesión para recuperarlo todo. Después, tu información se
              eliminará de forma definitiva.
            </p>
            <div>
              <Label>Escribe <span className="font-mono text-red-400">{deletion?.word}</span> para confirmar</Label>
              <Input value={deletionTyped} autoCapitalize="none" autoCorrect="off"
                onChange={(e) => setDeletionTyped(e.target.value)} />
            </div>
          </div>
        </Modal>

        {message && <p className="px-1 text-sm text-accent">{message}</p>}
      </div>

      {me.role === "ADMIN" && !viewAsUser && (
        <div className="border-t border-border pt-6">
          <AdminView />
        </div>
      )}
    </div>
  );
}
