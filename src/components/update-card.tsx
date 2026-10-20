"use client";

import { Sparkles } from "lucide-react";
import { CountUp } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { AppUpdate } from "@/lib/updates";

/**
 * Ventana de novedades: piezas compartidas por la ventana que ven los usuarios
 * (updates-gate.tsx) y la vista previa del admin.
 *
 * Orden fijo: etiqueta «Novedad» + fecha → título → visual → cuerpo; las
 * reacciones van en el pie del Modal (<UpdateReactions>). Espaciados en escala
 * de 4/8 px. Las animaciones usan las clases gb-* (solo opacity/transform y
 * desactivadas con «reducir movimiento»).
 */
export function UpdateBody({ update }: { update: AppUpdate }) {
  const hasVisual = update.visual === "points";
  const text = hasVisual && update.visualText ? update.visualText : update.description;
  const blocks = parseBody(text);
  // Cascada: etiqueta → título → visual → cuerpo (el cuerpo espera a que el
  // visual casi haya terminado de entrar)
  const visualDelay = 120;
  const bodyDelay = hasVisual ? 400 : 260;

  return (
    <article className="text-left">
      <header>
        {/* pr-8: deja sitio a la X flotante del Modal cuando la hay */}
        <div className="gb-fade-up flex items-center gap-2 pr-8">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.12em] text-accent">
            <Sparkles className="h-3 w-3" />
            Novedad
          </span>
          <time dateTime={update.date} className="text-xs text-muted">
            {formatUpdateDate(update.date)}
          </time>
        </div>

        <h2
          className="gb-fade-up mt-3 text-balance text-[22px] font-bold leading-[1.15] tracking-tight text-fg"
          style={{ animationDelay: "60ms" }}
        >
          {update.title}
        </h2>
      </header>

      <div className="mt-4">
        {hasVisual ? <PointsVisual baseDelay={visualDelay} /> : <EmojiHero emoji={update.emoji} baseDelay={visualDelay} />}
      </div>

      <div className="mt-4 space-y-3">
        {blocks.map((block, bi) =>
          block.kind === "p" ? (
            <p
              key={bi}
              className="gb-fade-up text-sm leading-relaxed text-muted"
              style={{ animationDelay: `${bodyDelay + Math.min(block.index, 6) * 50}ms` }}
            >
              {block.text}
            </p>
          ) : (
            <ul key={bi} className="space-y-2">
              {block.items.map((item) => (
                <li
                  key={item.index}
                  className="gb-fade-up flex gap-3"
                  style={{ animationDelay: `${bodyDelay + Math.min(item.index, 6) * 50}ms` }}
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-base leading-none"
                  >
                    {item.icon}
                  </span>
                  <p className="flex min-h-8 items-center text-sm leading-snug">
                    <span>
                      {item.lead && <strong className="font-semibold text-fg">{item.lead}: </strong>}
                      <span className={item.lead ? "text-muted" : "text-fg"}>{item.text}</span>
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          ),
        )}
      </div>
    </article>
  );
}

/** Botones de reacción, para el pie del Modal. Mismo peso visual para los dos: no inclinan el voto. */
export function UpdateReactions({ onReact }: { onReact: (reaction: "LIKE" | "MEH") => void }) {
  return (
    <div className="space-y-2">
      <p className="text-center text-xs text-muted">¿Qué te parece?</p>
      <div className="grid grid-cols-2 gap-2">
        <ReactionButton emoji="👍" label="¡Me gusta!" onClick={() => onReact("LIKE")} />
        <ReactionButton emoji="🫠" label="Sin más" onClick={() => onReact("MEH")} />
      </div>
    </div>
  );
}

function ReactionButton({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "gb-press flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 text-sm font-semibold text-fg",
        "hover:border-accent/40 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
      )}
    >
      <span className="text-xl leading-none">{emoji}</span>
      {label}
    </button>
  );
}

// ---------- Visuales de cabecera ----------

/** Cabecera por defecto: el emoji de la novedad sobre un halo del color de acento. */
function EmojiHero({ emoji, baseDelay }: { emoji: string; baseDelay: number }) {
  return (
    <div
      className="gb-fade-up relative flex h-28 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-2"
      style={{ animationDelay: `${baseDelay}ms` }}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ background: "radial-gradient(90% 100% at 50% 0%, hsl(var(--accent) / 0.16), transparent 70%)" }}
      />
      <span
        aria-hidden
        className="gb-ring-in absolute h-24 w-24 rounded-full border border-accent/15"
        style={{ animationDelay: `${baseDelay + 120}ms` }}
      />
      <span
        aria-hidden
        className="gb-ring-in absolute h-16 w-16 rounded-full border border-accent/25 bg-accent/10"
        style={{ animationDelay: `${baseDelay + 60}ms` }}
      />
      <span className="gb-pop-in relative text-5xl leading-none" style={{ animationDelay: `${baseDelay + 100}ms` }}>
        {emoji}
      </span>
    </div>
  );
}

type PointTile = {
  emoji: string;
  label: string;
  value: number;
  decimals?: number;
  /** Texto pequeño delante de la cifra (p. ej. «hasta»). */
  before?: string;
  sign?: string;
  unit?: string;
  detail: string;
  /** Mini barras crecientes (las 4 semanas de racha). */
  steps?: number[];
};

// Lo que cuenta cada tarjeta ya no se repite en el texto de la novedad (visualText)
const POINT_TILES: PointTile[] = [
  { emoji: "💪", label: "Series", value: 1, sign: "+", detail: "punto por cada serie del entreno" },
  { emoji: "📅", label: "Asistencia", value: 5, sign: "+", detail: "por entrenar" },
  {
    emoji: "📈",
    label: "Progreso",
    value: 0.1,
    decimals: 1,
    unit: "%",
    detail: "cada lunes, del volumen en verde",
  },
  {
    emoji: "🔥",
    label: "Constancia",
    value: 45,
    before: "hasta",
    sign: "+",
    // Espacios duros: cada «semanas +puntos» va siempre junto en la misma línea
    detail: "1 semana +15 · 2 +25 · 3 +35 · 4+ +45",
    steps: [15, 25, 35, 45],
  },
];

/** Las 4 categorías de puntos entrando en cascada, con su cifra contando hacia arriba. */
function PointsVisual({ baseDelay }: { baseDelay: number }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {POINT_TILES.map((t, i) => {
        const delay = baseDelay + i * 70;
        return (
          <div
            key={t.label}
            className="gb-tile-in flex flex-col rounded-2xl border border-border bg-gradient-to-b from-surface-2 to-surface p-3"
            style={{ animationDelay: `${delay}ms` }}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="gb-pop-in flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-base leading-none"
                style={{ animationDelay: `${delay + 100}ms` }}
              >
                {t.emoji}
              </span>
              <span className="text-[13px] font-semibold text-fg">{t.label}</span>
            </div>

            <div className="mt-2 flex items-end justify-between gap-2">
              <p className="text-[22px] font-bold leading-none tracking-tight text-accent">
                {t.before && <span className="mr-1 text-xs font-semibold text-muted">{t.before}</span>}
                {t.sign}
                <CountUp value={t.value} decimals={t.decimals} duration={800} delay={delay + 120} />
                {t.unit && <span className="ml-0.5 text-sm">{t.unit}</span>}
              </p>
              {t.steps && <StepBars steps={t.steps} delay={delay + 200} />}
            </div>

            <p className="mt-1 text-[11px] leading-snug text-muted">{t.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Barras que crecen una tras otra: más semanas de racha, más puntos. */
function StepBars({ steps, delay }: { steps: number[]; delay: number }) {
  const max = Math.max(...steps);
  return (
    <span aria-hidden className="flex h-5 items-end gap-0.5">
      {steps.map((s, i) => (
        <span
          key={i}
          className="gb-grow-y w-1.5 rounded-full bg-accent"
          style={{
            height: `${(s / max) * 100}%`,
            opacity: 0.4 + (0.6 * (i + 1)) / steps.length,
            animationDelay: `${delay + i * 50}ms`,
          }}
        />
      ))}
    </span>
  );
}

// ---------- Texto ----------

type BodyItem = { index: number; icon: string; lead?: string; text: string };
type BodyBlock = { kind: "p"; index: number; text: string } | { kind: "list"; items: BodyItem[] };

// Línea que empieza por un emoji (con variantes, tonos de piel y uniones ZWJ)
const EMOJI_LINE = new RegExp(
  "^((?:\\p{Extended_Pictographic}|\\p{Regional_Indicator})(?:\\uFE0F|\\p{Emoji_Modifier}|\\u200D\\p{Extended_Pictographic})*)\\s*(.+)$",
  "u",
);
// «Algo corto: resto» → «Algo corto» en negrita
const LEAD = /^([^:]{2,32}):\s+(.+)$/;

/**
 * Convierte el texto de la novedad en bloques: párrafos normales y listas
 * (las líneas que empiezan por emoji, con el emoji como icono). `index` es la
 * posición global de cada pieza, para la cascada de entrada.
 */
function parseBody(text: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  let index = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = EMOJI_LINE.exec(line);
    if (m?.[1] && m[2]) {
      const lead = LEAD.exec(m[2]);
      const item: BodyItem = lead?.[1] && lead[2]
        ? { index, icon: m[1], lead: lead[1], text: lead[2] }
        : { index, icon: m[1], text: m[2] };
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
    } else {
      blocks.push({ kind: "p", index, text: line });
    }
    index++;
  }
  return blocks;
}

/** «20 oct» (con el año si no es el actual). */
function formatUpdateDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d
    .toLocaleDateString("es-ES", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })
    .replace(".", "");
}
