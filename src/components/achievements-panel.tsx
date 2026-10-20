"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Award } from "lucide-react";
import { api } from "@/trpc/react";
import { Card } from "@/components/ui";
import { ACHIEVEMENT_CATALOG, type AchievementRarity } from "@/lib/achievements";
import { cn } from "@/lib/utils";

/** Anillo de cada rareza (el común no lleva color: es lo normal). */
const RARITY_RING: Record<AchievementRarity, string> = {
  COMUN: "ring-border",
  RARO: "ring-sky-400/70",
  EPICO: "ring-purple-400/70",
  LEGENDARIO: "ring-amber-400",
};

const RARITY_LABEL: Record<AchievementRarity, string> = {
  COMUN: "Común",
  RARO: "Raro",
  EPICO: "Épico",
  LEGENDARIO: "Legendario",
};

/**
 * Panel de logros de Inicio: una casilla por logro del catálogo, a color los
 * conseguidos y apagados los pendientes (primero los conseguidos, el más
 * reciente delante). Al tocar una casilla se lee qué pide y, si ya lo tienes,
 * cuándo lo conseguiste.
 */
export function AchievementsPanel() {
  const { data: earned } = api.dashboard.achievements.useQuery();
  const [selected, setSelected] = useState<string | null>(null);

  if (!earned) return null;

  const earnedAt = new Map(earned.map((e) => [e.code, e.earnedAt]));
  // Los logros retirados solo se muestran a quien ya los tiene
  const rows = ACHIEVEMENT_CATALOG.filter((a) => !a.retired || earnedAt.has(a.code)).sort((a, b) => {
    const ea = earnedAt.get(a.code);
    const eb = earnedAt.get(b.code);
    if (ea && eb) return eb.getTime() - ea.getTime();
    if (ea || eb) return ea ? -1 : 1;
    return a.number - b.number;
  });
  const done = rows.filter((a) => earnedAt.has(a.code)).length;
  const current = rows.find((a) => a.code === selected);
  const currentAt = current ? earnedAt.get(current.code) : undefined;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Award className="h-4 w-4 text-gold" /> Logros
        </h2>
        <span className="text-xs text-muted">
          {done} de {rows.length}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
        {rows.map((a) => {
          const got = earnedAt.has(a.code);
          return (
            <button
              key={a.code}
              type="button"
              onClick={() => setSelected(selected === a.code ? null : a.code)}
              aria-label={`${a.name}${got ? "" : " (pendiente)"}`}
              aria-pressed={selected === a.code}
              className={cn(
                "flex aspect-square items-center justify-center rounded-xl bg-surface-2 text-2xl ring-1 ring-inset transition",
                got ? RARITY_RING[a.rarity] : "ring-transparent grayscale",
                !got && "opacity-35",
                selected === a.code && "ring-2 ring-accent",
              )}
            >
              <span aria-hidden>{a.icon}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 min-h-[2.5rem] text-xs text-muted">
        {current ? (
          <>
            <strong className="text-fg">{current.icon} {current.name}</strong> · {RARITY_LABEL[current.rarity]}
            <br />
            {current.description}
            {currentAt ? ` · Conseguido el ${format(currentAt, "dd/MM/yyyy")}` : " · Pendiente"}
          </>
        ) : (
          "Toca un logro para ver qué pide."
        )}
      </p>
    </Card>
  );
}
