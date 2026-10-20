"use client";

import { usePathname } from "next/navigation";

/**
 * Entrada suave de cada pantalla.
 *
 * Antes había aquí una secuencia con tiempos fijos (salida → cargador →
 * entrada) que se disparaba en cada cambio de ruta. El problema es que
 * `usePathname` solo cambia cuando la nueva pantalla YA está montada: el
 * cargador llegaba tarde y tapaba un contenido que estaba listo desde el
 * principio, de ahí el parpadeo «contenido → cargador → contenido».
 *
 * Ahora la transición es solo un fundido de entrada (fill-mode `backwards`: al
 * terminar no deja ninguna capa de composición sobre toda la pantalla): si la pantalla está lista
 * al momento, no se ve ningún cargador. Cuando la navegación sí tarda de
 * verdad, quien muestra el cargador es el `loading.tsx` de la ruta, que es el
 * único que conoce el estado real de la carga.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    // La clave reinicia la animación en cada pantalla
    <div key={pathname} className="gb-page">
      {children}
      <style jsx>{`
        .gb-page {
          animation: gb-page-in 0.26s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }
        @keyframes gb-page-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .gb-page { animation: none; }
        }
      `}</style>
    </div>
  );
}
