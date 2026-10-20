"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Dumbbell, Users, Building2, Bell, Settings, AlertTriangle, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { Logo } from "@/components/logo";
import { ActiveWorkoutChip } from "@/components/active-workout-chip";

const NAV = [
  { href: "/panel", label: "Inicio", icon: LayoutDashboard, match: /^\/panel/ },
  { href: "/entrenamiento", label: "Entrenamiento", icon: Dumbbell, match: /^\/(entrenamiento|rutinas|entrenar|asistencia|prs)/ },
  { href: "/comunidad", label: "Comunidad", icon: Users, match: /^\/(comunidad|ranking|perfil)/ },
  { href: "/inversion", label: "Gym", icon: Building2, match: /^\/inversion/ },
  { href: "/ajustes", label: "Ajustes", icon: Settings, match: /^\/(ajustes|admin)/ },
];

/**
 * Icono del chat del grupo: burbuja de conversación con fondo tintado y, si hay
 * mensajes sin leer, una alerta (badge) con su número pegada al icono.
 */
function ChatIcon({ unread, className }: { unread: number; className?: string }) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <MessagesSquare className="h-5 w-5" />
      {unread > 0 && (
        <span
          aria-label={`${unread} mensajes sin leer`}
          className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-fg ring-2 ring-bg"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </span>
  );
}

/** Estado compartido de la navegación: apartados y alerta del gimnasio. */
function useNavState() {
  const { data: subStatus } = api.subscription.status.useQuery(undefined, {
    refetchInterval: 5 * 60_000,
  });
  // Alerta: la suscripción terminó y no está en modo automático
  const investmentAlert = subStatus?.expired === true;
  return { items: NAV, investmentAlert };
}

export function Sidebar() {
  const pathname = usePathname();
  const { items, investmentAlert } = useNavState();
  const { data: unread } = api.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const { data: unreadChat } = api.chat.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const withNotifications = [
    ...items.slice(0, items.length - 1),
    { href: "/notificaciones", label: "Notificaciones", icon: Bell, match: /^\/notificaciones/ },
    { href: "/comunidad?tab=chat", label: "Chat", icon: MessagesSquare, match: /^\/__nunca__/ },
    ...items.slice(items.length - 1),
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface p-4 md:flex">
      <Link href="/panel" className="mb-6 flex items-center gap-2 px-2 text-xl font-extrabold">
        <Logo size={28} />
        <span>Gym<span className="text-accent">Bros</span></span>
      </Link>
      {/* Entreno en curso: acceso directo mientras haya una sesión abierta */}
      <ActiveWorkoutChip variant="sidebar" />
      <nav className="flex-1 space-y-1">
        {withNotifications.map(({ href, label, icon: Icon, match }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition motion-safe:active:scale-[0.97]",
              match.test(pathname)
                ? "bg-accent/10 font-medium text-accent"
                : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {href === "/comunidad?tab=chat" ? (
              // El número de sin leer va pegado al icono (no al final de la fila)
              <ChatIcon unread={unreadChat ?? 0} className="[&>svg]:h-4 [&>svg]:w-4" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
            {label}
            {href === "/notificaciones" && (unread ?? 0) > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                {unread}
              </span>
            )}
            {href === "/inversion" && investmentAlert && (
              <AlertTriangle className="ml-auto h-4 w-4 text-amber-400" aria-label="Suscripción caducada" />
            )}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { items, investmentAlert } = useNavState();
  const bottomItems = items.filter((item) => item.href !== "/ajustes");
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border/60 bg-surface/80 backdrop-blur-xl md:hidden">
      {bottomItems.map(({ href, label, icon: Icon, match }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "gb-press flex flex-1 flex-col items-center gap-0.5 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-[10px]",
            match.test(pathname) ? "text-accent" : "text-muted",
          )}
        >
          <span className="relative">
            <Icon className="h-5 w-5" />
            {href === "/inversion" && investmentAlert && (
              <span className="absolute -right-1.5 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-black">
                !
              </span>
            )}
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileHeader() {
  const { data: unread } = api.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const { data: unreadChat } = api.chat.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  return (
    // El relleno superior suma el área segura del sistema: sin ella, en los
    // móviles con notch la cabecera se solapaba con la hora y la batería.
    <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-border/60 bg-bg/80 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl md:hidden">
      <Link href="/panel" className="flex min-w-0 items-center gap-2 text-lg font-extrabold">
        <Logo size={24} />
        {/* En pantallas muy estrechas, con el entreno en curso, el nombre cede sitio */}
        <span className="truncate">Gym<span className="text-accent">Bros</span></span>
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        {/* Entreno en curso: compacto, entre el logo y los iconos */}
        <ActiveWorkoutChip variant="header" className="mr-1" />
        <Link
          href="/comunidad?tab=chat"
          className="rounded-full bg-accent/10 p-2 text-accent transition hover:bg-accent/20"
          aria-label={(unreadChat ?? 0) > 0 ? `Chat del grupo, ${unreadChat} sin leer` : "Chat del grupo"}
        >
          <ChatIcon unread={unreadChat ?? 0} />
        </Link>
        <Link href="/notificaciones" className="relative rounded-full p-2 text-muted hover:text-fg" aria-label="Notificaciones">
          <Bell className="h-5 w-5" />
          {(unread ?? 0) > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {(unread ?? 0) > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        <Link href="/ajustes" className="rounded-full p-2 text-muted hover:text-fg" aria-label="Ajustes">
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}
