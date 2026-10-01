"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Check, Copy, LogOut, Plus, Users, KeyRound } from "lucide-react";
import { api } from "@/trpc/react";
import { Button, Card, Spinner, Avatar, Modal, Input, Label } from "@/components/ui";
import { cn } from "@/lib/utils";
import { LEVEL_STYLES } from "@/lib/progress";

/**
 * Miembros del grupo activo, con el selector de grupos encima.
 *
 * El perfil es uno solo y viaja con el usuario: cambiar de grupo no cambia sus
 * rutinas ni sus entrenos, solo con quién los comparte y contra quién compite.
 */
export function GroupView() {
  const utils = api.useUtils();
  const { data: mine } = api.group.mine.useQuery();
  const { data: users, isLoading } = api.user.list.useQuery();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "create" | "join">(null);

  const setActive = api.group.setActive.useMutation({
    onSuccess: async () => {
      setSwitcherOpen(false);
      await utils.invalidate();
    },
  });

  const active = mine?.groups.find((g) => g.isActive);

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{active?.name ?? "El grupo"}</h1>
        <p className="text-sm text-muted">
          Pulsa un miembro para ver su perfil y vuestra afinidad de entrenamiento.
        </p>
      </div>

      {/* Selector de grupo: qué grupo se está mirando y salto a cualquier otro */}
      <Card className="space-y-3">
        <button
          onClick={() => setSwitcherOpen((v) => !v)}
          className="flex w-full items-center gap-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Users className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{active?.name ?? "Sin grupo"}</span>
            <span className="block text-xs text-muted">
              {active
                ? "Código " + active.code + " · " + active.members + " miembros"
                : "Únete a uno para empezar"}
            </span>
          </span>
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted transition", switcherOpen && "rotate-90")} />
        </button>

        {switcherOpen && (
          <div className="space-y-2 border-t border-border pt-3">
            {mine?.groups.map((g) => (
              <div key={g.id} className="flex items-center gap-2">
                <button
                  onClick={() => !g.isActive && setActive.mutate({ groupId: g.id })}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                    g.isActive ? "bg-accent/15 text-accent" : "bg-surface-2 hover:text-accent",
                  )}
                >
                  {g.isActive ? <Check className="h-4 w-4 shrink-0" /> : <span className="w-4 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.name}</span>
                    <span className="block text-xs text-muted">
                      {g.code} · {g.members} {g.members === 1 ? "miembro" : "miembros"}
                      {g.isAdmin && " · administras"}
                    </span>
                  </span>
                </button>
                <CopyCode code={g.code} />
                <LeaveButton groupId={g.id} name={g.name} />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setDialog("join")}>
                <Plus className="h-3.5 w-3.5" /> Unirme a otro
              </Button>
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setDialog("create")}>
                <KeyRound className="h-3.5 w-3.5" /> Crear grupo
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {users?.map((u) => (
          <Link key={u.id} href={"/perfil/" + u.id}>
            <Card className="flex h-full items-center gap-3 transition hover:border-accent/40">
              {/* El contorno lleva el color del progreso general de su rutina */}
              <Avatar
                name={u.name}
                src={u.avatarUrl}
                size={44}
                className={cn(
                  u.progressLevel &&
                    cn("ring-2 ring-offset-2 ring-offset-surface", LEVEL_STYLES[u.progressLevel].ring),
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {u.name}
                  {u.isMe && <span className="ml-1.5 text-xs font-normal text-muted">(tú)</span>}
                </p>
                {u.currentStreak > 0 && (
                  <p className="truncate text-xs text-muted">🔥 racha de {u.currentStreak} sem.</p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
            </Card>
          </Link>
        ))}
      </div>

      <GroupDialog mode={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

/** Copiar el código al portapapeles: es lo que hay que pasarle a la gente. */
function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      title="Copiar el código"
      onClick={() => {
        navigator.clipboard?.writeText(code).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => undefined,
        );
      }}
      className="shrink-0 rounded-xl p-2 text-muted transition hover:text-accent"
    >
      {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function LeaveButton({ groupId, name }: { groupId: string; name: string }) {
  const utils = api.useUtils();
  const leave = api.group.leave.useMutation({ onSuccess: () => utils.invalidate() });
  return (
    <button
      title={"Salir de " + name}
      onClick={() => {
        const ok = confirm(
          "¿Salir de \"" + name + "\"? Tu perfil y tus datos no se borran: dejas de verte en este grupo.",
        );
        if (ok) leave.mutate({ groupId });
      }}
      className="shrink-0 rounded-xl p-2 text-muted transition hover:text-red-400"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}

/** Alta o incorporación a un grupo desde dentro de la app. */
function GroupDialog({ mode, onClose }: { mode: null | "create" | "join"; onClose: () => void }) {
  const utils = api.useUtils();
  const [form, setForm] = useState({ name: "", code: "", masterKey: "" });
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    setForm({ name: "", code: "", masterKey: "" });
    setError(null);
    onClose();
    await utils.invalidate();
  };
  const create = api.group.create.useMutation({ onSuccess: done, onError: (e) => setError(e.message) });
  const join = api.group.join.useMutation({ onSuccess: done, onError: (e) => setError(e.message) });

  const loading = create.isLoading || join.isLoading;
  const submit = () => {
    setError(null);
    if (mode === "create") create.mutate({ name: form.name, code: form.code, masterKey: form.masterKey });
    else join.mutate({ code: form.code });
  };

  return (
    <Modal
      open={mode !== null}
      onClose={onClose}
      title={mode === "create" ? "Crear un grupo" : "Unirme a un grupo"}
      subtitle={
        mode === "create"
          ? "Necesitas la clave maestra. Serás su administrador."
          : "Introduce el código que te hayan pasado."
      }
      footer={
        <Button
          className="w-full"
          loading={loading}
          disabled={
            mode === "create"
              ? !form.name || form.code.length < 4 || !form.masterKey
              : !form.code
          }
          onClick={submit}
        >
          {mode === "create" ? "Crear" : "Unirme"}
        </Button>
      }
    >
      <div className="space-y-3">
        {mode === "create" && (
          <>
            <div>
              <Label>Clave maestra</Label>
              <Input inputMode="numeric" value={form.masterKey}
                onChange={(e) => setForm((f) => ({ ...f, masterKey: e.target.value }))} />
            </div>
            <div>
              <Label>Nombre del grupo</Label>
              <Input maxLength={40} value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
          </>
        )}
        <div>
          <Label>Código {mode === "create" ? "de invitación" : "del grupo"}</Label>
          <Input maxLength={20} value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
        </div>
        <p className="text-xs text-muted">
          Tu perfil es el mismo en todos los grupos: mismas rutinas, mismos entrenos y mismas marcas.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
