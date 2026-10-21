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
  /** Cabecera animada propia de la novedad (ver components/update-card.tsx). Sin ella, se usa el emoji. */
  visual?: "points";
  /**
   * Texto que se muestra EN LUGAR de `description` cuando hay `visual`: solo lo
   * que la animación no enseña, para no repetirlo. `description` sigue siendo
   * el texto completo y se usa si falta este campo.
   */
  visualText?: string;
};

/*
 * Formato del texto (description / visualText): cada "\n" es una línea nueva.
 * Las líneas que EMPIEZAN por un emoji se muestran como lista, con el emoji de
 * icono; si además llevan "Algo corto: resto", "Algo corto" va en negrita.
 */

/** De la más reciente a la más antigua. */
export const APP_UPDATES: AppUpdate[] = [
  {
    id: "v4.5-logros",
    date: "2026-10-21",
    emoji: "🏅",
    title: "¡Llegan los logros!",
    description:
      "Ahora cada entreno, racha y récord puede desbloquear un logro. Hay de entrenos, asistencia, constancia, récords, volumen, marcas estables y temporadas.\n\n🏠 Dónde verlos: en Inicio, en el panel de logros. Toca uno para ver cómo se consigue.\n🔔 Cada logro se anuncia al grupo en el chat.\n🧩 El último: conseguirlos todos. ¿Te atreves?",
  },
  {
    id: "v4.4-puntos-simplificados",
    date: "2026-10-20",
    emoji: "🏆",
    title: "Puntos más simples: 4 categorías",
    visual: "points",
    visualText:
      "🏅 Los PR siguen siendo récord, pero ya no dan puntos.\n👉 Mira tu desglose en Inicio › Mis puntos.",
    description:
      "Hemos simplificado el sistema de puntos. Ahora se gana en 4 categorías:\n\n💪 Series: 1 punto por cada serie del entreno.\n📅 Asistencia: +5 por entrenar.\n📈 Progreso: cada lunes, el 0,1 % del volumen de tus ejercicios en verde.\n🔥 Constancia: 1 semana +15, 2 +25, 3 +35, 4 o más +45.\n\nLos PR siguen siendo récord, pero ya no dan puntos. Mira tu desglose en Inicio › Mis puntos.",
  },
  {
    id: "v4.3-marca-estable",
    date: "2026-10-13",
    emoji: "🎯",
    title: "Nueva: tu mejor marca estable",
    description:
      "Es el peso que de verdad dominas en cada ejercicio, y sirve para medir tu progreso real.\n\n✅ Se consigue de 2 formas: todas las series al mismo peso con 12 reps o más, o con pesos distintos y todas a 12 reps o más (en ese caso cuenta el menor).\n\n🔒 Se verifica cuando la repites en 2 entrenos distintos.\n\nMira las tuyas en Inicio y en Entrenamiento › Récords. ¿A qué esperas para fijar la tuya? 💪",
  },
  {
    id: "v4.2-semaforo-progreso",
    date: "2026-10-02",
    emoji: "🚦",
    title: "Semáforo y progresos públicos",
    description:
      "🚦 Sistema semáforo: una nueva función para guiar tu progreso en las rutinas. Cada serie se marca en verde (toca subir el peso), amarillo (sigue con ese peso) o rojo (mejor bajarlo).\n\n📈 Progresos públicos: ya puedes ver el progreso de cada gymbro desde Comunidad. Se desbloquea al completar 5 sesiones de una de tus rutinas.",
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
