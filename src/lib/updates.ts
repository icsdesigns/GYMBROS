/**
 * ============================================================================
 *  NOVEDADES DE LA APP — registro central
 * ============================================================================
 *
 * Cada entrada de esta lista se muestra UNA sola vez a cada usuario, en una
 * ventana emergente centrada, con dos botones de reacción (👍 / 🫠).
 *
 * CÓMO AÑADIR UNA NOVEDAD
 * -----------------------
 *  1. Añade un objeto NUEVO al PRINCIPIO de APP_UPDATES (el orden manda: se
 *     muestra siempre la más reciente que el usuario no haya visto).
 *  2. Elige un `id` estable y único, con el formato `vX.Y-tema`. Ese id es lo
 *     que se guarda en la base de datos para saber quién la ha visto ya:
 *     NUNCA lo cambies después de publicar, o la ventana reaparecerá a todo
 *     el mundo. Si te equivocaste en el texto, corrige el texto y deja el id.
 *  3. `title` es la actualización en cuestión: corto y concreto.
 *     `description` la resume en dos o tres frases, sin tecnicismos.
 *     `emoji` encabeza la ventana; uno solo, que represente el cambio.
 *  4. No hace falta tocar la base de datos ni desplegar nada más.
 *
 * CUÁNDO SE MUESTRA
 * -----------------
 *  Solo a quien YA tenga concedidos los permisos de notificación, para no
 *  encadenar ventanas a quien acaba de entrar. Las encuestas pendientes
 *  también tienen prioridad. Ver src/components/updates-gate.tsx.
 *
 * QUÉ PASA CON LAS REACCIONES
 * ---------------------------
 *  Se guardan en la tabla UpdateSeen (LIKE / MEH). Sirven para saber si un
 *  cambio ha gustado; el usuario no ve los votos de nadie.
 */

export type AppUpdate = {
  /** Identificador estable. Se guarda en BD: no cambiarlo tras publicar. */
  id: string;
  /** Fecha de publicación (solo informativa, formato ISO). */
  date: string;
  /** Emoji que encabeza la ventana. */
  emoji: string;
  /** La actualización en cuestión, en pocas palabras. */
  title: string;
  /** Descripción breve de qué cambia para el usuario. */
  description: string;
};

/** De la más reciente a la más antigua. */
export const APP_UPDATES: AppUpdate[] = [
  {
    id: "v4.2-semaforo-progreso",
    date: "2026-10-02",
    emoji: "🚦",
    title: "Semáforo en tus entrenos y progreso de cada gymbro",
    description:
      "Durante el entreno, el número de cada serie se pinta de verde (12 reps o más: toca subir el peso), amarillo (de 8 a 11: sigue trabajando ese peso) o rojo (menos de 8: mejor bajarlo), y cada ejercicio lleva el color de su media. Además, en Comunidad ya puedes ver el progreso de cada gymbro en su perfil y en el contorno de color de su foto. Se desbloquea cuando completas 5 sesiones de una de tus rutinas. ¡A ponerse en verde! 💪",
  },
  {
    id: "v4.1-sistema-puntos",
    date: "2026-09-26",
    emoji: "📊",
    title: "Sistema de puntos actualizado",
    description:
      "Hemos renovado cómo se ganan los puntos: ahora cada entrenamiento suma según las series que hagas, y hemos recalculado todo el historial para que el ranking sea justo. ¿Quieres saber cuánto vale cada cosa? Toca el icono ⓘ en Inicio → Mis puntos. ¡A sumar! 💪",
  },
  {
    id: "v3.16-interfaz-progreso-gym",
    date: "2026-09-20",
    emoji: "✨",
    title: "Interfaz nueva, progreso a la vista y tu gym",
    description:
      "Hemos reorganizado la app: Inicio va al grano y Entrenamiento se queda en tres pestañas (tu plan con el historial, progreso y récords). En Progreso ves de un vistazo si subes, te mantienes o bajas en cada rutina y ejercicio. Y el apartado Inversión pasa a llamarse Gym: ya puedes fijar tu gimnasio y su ubicación… que de ahí se vienen cositas 👀",
  },
  {
    id: "temporadas-trimestrales",
    date: "2026-08-17",
    emoji: "🏆",
    title: "¡Ya hay temporadas de entrenamiento!",
    description:
      "Cada tres meses se cierra una temporada y se reparten dos títulos: el ganador, que acumule más puntos, y el pancetas 🥓, para quien se quede el último. Sigue la clasificación en Comunidad → Ranking → Temporada. ¡Todos listos para entrenar!",
  },
];

/** La novedad más reciente que el usuario todavía no ha visto. */
export function nextUpdateFor(seenIds: string[]): AppUpdate | null {
  const seen = new Set(seenIds);
  return APP_UPDATES.find((u) => !seen.has(u.id)) ?? null;
}
