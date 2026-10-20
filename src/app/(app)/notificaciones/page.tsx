"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { api } from "@/trpc/react";
import { Card, Spinner, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { NotificationType } from "@prisma/client";

const FILTERS: Array<{ key: NotificationType | "ALL"; label: string }> = [
  { key: "ALL", label: "Todas" },
  { key: "FRIEND_PR", label: "PRs del grupo" },
  { key: "STREAK", label: "Rachas" },
  { key: "SYSTEM", label: "Sistema" },
];

export default function NotificationsPage() {
  const utils = api.useUtils();
  const [filter, setFilter] = useState<NotificationType | "ALL">("ALL");
  const { data: notifications, isLoading } = api.notification.list.useQuery({
    type: filter === "ALL" ? undefined : filter,
    limit: 50,
  });
  const markRead = api.notification.markRead.useMutation();
  const marked = useRef(false);

  // Entrar en el apartado marca todas como leídas (solo se refresca el contador
  // del menú; la lista conserva el resaltado de las nuevas durante la visita)
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    markRead.mutate(
      {},
      { onSuccess: () => utils.notification.unreadCount.invalidate() },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Notificaciones</h1>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition",
              filter === f.key ? "bg-accent font-medium text-accent-fg" : "bg-surface text-muted hover:text-fg",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : notifications?.length === 0 ? (
        <EmptyState icon="🔔" title="Nada por aquí" subtitle="Cuando pase algo en el grupo, lo verás aquí" />
      ) : (
        <div className="gb-stagger space-y-2">
          {notifications?.map((n) => (
            <Card key={n.id} className={cn("py-3", !n.read && "border-accent/30 bg-accent/5")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={cn("text-sm", !n.read && "font-medium")}>{n.title}</p>
                  {n.body && <p className="text-xs text-muted">{n.body}</p>}
                </div>
                <span className="whitespace-nowrap text-xs text-muted">
                  hace {formatDistanceToNowStrict(n.createdAt, { locale: es })}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
