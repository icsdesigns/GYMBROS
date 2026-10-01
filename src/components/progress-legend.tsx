import { cn } from "@/lib/utils";
import { LEVEL_LEGEND, LEVEL_STYLES, type ProgressLevel } from "@/lib/progress";

const ORDER: ProgressLevel[] = ["green", "yellow", "red"];

/** Leyenda del semáforo de repeticiones: una mini-tarjeta por color con su consejo. */
export function ProgressLegend({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-3", className)}>
      {ORDER.map((level) => (
        <div key={level} className={cn("rounded-xl p-2.5", LEVEL_STYLES[level].tint)}>
          <div className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", LEVEL_STYLES[level].dot)} />
            <span className={cn("text-xs font-semibold", LEVEL_STYLES[level].text)}>
              {LEVEL_LEGEND[level].range}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted">{LEVEL_LEGEND[level].advice}</p>
        </div>
      ))}
    </div>
  );
}
