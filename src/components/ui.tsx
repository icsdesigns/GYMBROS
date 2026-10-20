"use client";

import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import { GymLoader } from "@/components/gym-loader";
import { useCountUp } from "@/lib/use-count-up";
import { forwardRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";

// ---------- Button ----------

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        "disabled:opacity-50 disabled:pointer-events-none motion-safe:active:scale-[0.97]",
        variant === "primary" && "bg-accent text-accent-fg hover:brightness-110",
        variant === "secondary" && "bg-surface-2 text-fg hover:bg-border",
        variant === "ghost" && "text-muted hover:text-fg hover:bg-surface-2",
        variant === "danger" && "bg-red-500/15 text-red-400 hover:bg-red-500/25",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

// ---------- Card ----------

/** `pressable`: la tarjeta se hunde un poco al pulsarla (úsalo cuando es un enlace o botón). */
export function Card({
  className,
  pressable,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { pressable?: boolean }) {
  return (
    <div
      className={cn("rounded-2xl border border-border bg-surface p-4", pressable && "gb-press", className)}
      {...props}
    />
  );
}

// ---------- Input / Label ----------

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg",
        "placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm text-muted", className)} {...props} />;
}

// ---------- Badge ----------

export function Badge({
  className,
  color,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
      style={color ? { backgroundColor: `${color}22`, color } : undefined}
      {...props}
    />
  );
}

// ---------- Avatar ----------

export function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className={cn("rounded-full object-cover", className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-accent/15 font-semibold text-accent",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

// ---------- Progreso ----------

/**
 * Barra de progreso. El relleno mide siempre el 100 % y se desplaza con
 * translateX (solo transform): al montarse se desliza desde la izquierda y al
 * cambiar el valor se mueve a la nueva posición.
 */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div
        className="gb-bar h-full w-full rounded-full bg-accent"
        style={{ transform: `translateX(${pct - 100}%)` }}
      />
    </div>
  );
}

/**
 * Número que sube hasta su valor al aparecer (y al cambiar). Ver `useCountUp`:
 * respeta «reducir movimiento». Cifras tabulares para que el ancho no baile.
 */
export function CountUp({
  value,
  duration,
  decimals,
  className,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  className?: string;
}) {
  const shown = useCountUp(value, { duration, decimals });
  return (
    <span className={cn("tabular-nums", className)}>
      {decimals
        ? shown.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : shown}
    </span>
  );
}

// ---------- Estados ----------

/**
 * Cargador de contenido. Igual que en las rutas, tarda un poco en hacerse
 * visible para que una consulta rápida no provoque un parpadeo.
 */
export function Spinner({ className }: { className?: string }) {
  return <GymLoader className={className} delayMs={200} />;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      {icon && <div className="text-4xl">{icon}</div>}
      <p className="font-medium">{title}</p>
      {subtitle && <p className="max-w-xs text-sm text-muted">{subtitle}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ---------- Modal ----------

const MODAL_SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
} as const;

/**
 * Ventana emergente de la app. En móvil se comporta como hoja inferior y en
 * pantallas grandes como diálogo centrado.
 *
 * Todas las secciones comparten el mismo margen lateral (px-5) y el mismo
 * ritmo vertical, así que cabecera, contenido y acciones quedan alineados sin
 * que cada pantalla tenga que inventarse sus espaciados. Solo el contenido
 * hace scroll: la cabecera y el pie permanecen siempre a la vista.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  footer,
  size = "md",
  dismissible = true,
  placement = "sheet",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Acciones fijas al pie, separadas del contenido por una línea. */
  footer?: React.ReactNode;
  size?: keyof typeof MODAL_SIZES;
  /** A false, no se cierra ni con Escape ni pulsando fuera (diálogos obligatorios). */
  dismissible?: boolean;
  /** "sheet": hoja inferior en móvil. "center": centrado en cualquier pantalla. */
  placement?: "sheet" | "center";
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Bloquear el scroll del fondo mientras el modal está abierto
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Cerrar con Escape, como cualquier diálogo del sistema
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (!open || !mounted) return null;

  const hasHeader = Boolean(title || dismissible);
  const centered = placement === "center";

  // Portal en <body>: si se renderizara dentro de la página, un ancestro con
  // `transform` haría que el fondo fijo no cubriera toda la pantalla.
  return createPortal(
    <div
      className={cn(
        "gb-modal-overlay fixed inset-0 z-[60] flex justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4",
        centered ? "items-center p-4" : "items-end",
      )}
      onClick={dismissible ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "gb-modal-panel flex max-h-[88dvh] w-full flex-col overflow-hidden border border-border bg-surface shadow-2xl sm:rounded-2xl",
          centered ? "gb-modal-centered rounded-2xl" : "rounded-t-2xl",
          MODAL_SIZES[size],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Asa de la hoja inferior: solo tiene sentido en móvil */}
        {!centered && (
          <div className="flex justify-center pt-2 sm:hidden">
            <span className="h-1 w-9 rounded-full bg-border" />
          </div>
        )}

        {hasHeader && (
          <div className="flex items-start gap-3 px-5 pb-4 pt-4">
            {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
            <div className="min-w-0 flex-1 space-y-0.5">
              {title && <h2 className="text-lg font-semibold leading-tight">{title}</h2>}
              {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
            </div>
            {dismissible && (
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="-mr-1.5 -mt-1 shrink-0 rounded-xl p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        <div
          className={cn(
            "flex-1 overflow-y-auto px-5",
            hasHeader ? "" : "pt-5",
            footer ? "pb-5" : "pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5",
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="border-t border-border px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Stat ----------

export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </Card>
  );
}
