/**
 * Catálogo de logros: FUENTE ÚNICA.
 *
 * Cada logro lleva un número fijo para poder referirse a él ("el 7", "el 12").
 * El número no se reutiliza ni se reordena: si un logro se retira, su hueco se
 * queda vacío. `code` es el que guarda la base de datos (tabla Achievement); el
 * seed y `grant` la rellenan desde aquí, así que añadir un logro es añadirlo a
 * ACHIEVEMENT_CATALOG y darle su condición en `checkAchievements`.
 *
 * Los logros SUGERIDOS no están activos: son datos de muestra para decidir
 * cuáles implementar. Su numeración continúa la del catálogo.
 */

export type AchievementRarity = "COMUN" | "RARO" | "EPICO" | "LEGENDARIO";

export type AchievementDef = {
  number: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  /**
   * Logro retirado (legado): ya no se puede conseguir, pero se conserva en el
   * catálogo y en la base de datos para quien ya lo tiene. Si no lo tienes, no
   * se muestra en tu panel de logros. No se manda a la base de datos.
   */
  retired?: boolean;
};

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  // Entrenamientos
  { number: 1, code: "FIRST_WORKOUT", name: "Primer entrenamiento", description: "Completa tu primer entrenamiento", icon: "🎯", rarity: "COMUN" },
  { number: 2, code: "WORKOUTS_10", name: "10 entrenamientos", description: "Completa 10 entrenamientos", icon: "🔟", rarity: "COMUN" },
  { number: 3, code: "WORKOUTS_100", name: "100 entrenamientos", description: "Completa 100 entrenamientos", icon: "💯", rarity: "EPICO" },
  // Asistencia
  { number: 4, code: "FIRST_ATTENDANCE", name: "Primera asistencia", description: "Registra tu primer día de gimnasio", icon: "📍", rarity: "COMUN" },
  { number: 5, code: "ATTENDANCE_25", name: "25 asistencias", description: "Ve al gimnasio 25 veces", icon: "🎽", rarity: "RARO" },
  { number: 6, code: "ATTENDANCE_100", name: "100 asistencias", description: "Ve al gimnasio 100 veces", icon: "🏛️", rarity: "EPICO" },
  // Constancia
  { number: 7, code: "STREAK_WEEK", name: "Primera semana cumplida", description: "Cumple tu plan semanal por primera vez", icon: "✅", rarity: "COMUN" },
  { number: 8, code: "STREAK_7", name: "Racha de 1 mes", description: "Cumple tu plan 4 semanas seguidas", icon: "🔥", rarity: "RARO" },
  { number: 9, code: "STREAK_CRACK", name: "Modo crack", description: "Supera el mes cumpliendo tu plan (5+ semanas seguidas)", icon: "💎", rarity: "EPICO" },
  { number: 10, code: "STREAK_30", name: "Racha de 6 meses", description: "Cumple tu plan 26 semanas seguidas", icon: "🌋", rarity: "LEGENDARIO" },
  // Récords
  { number: 11, code: "FIRST_PR", name: "Primer PR", description: "Registra tu primer récord personal", icon: "🏋️", rarity: "COMUN" },
  { number: 12, code: "PR_10", name: "10 PRs", description: "Consigue 10 récords personales", icon: "📈", rarity: "RARO" },
  // Volumen
  { number: 13, code: "VOLUME_1000", name: "1.000 kg levantados", description: "Acumula 1.000 kg de volumen total", icon: "🏗️", rarity: "COMUN" },
  { number: 14, code: "VOLUME_10000", name: "10.000 kg levantados", description: "Acumula 10.000 kg de volumen total", icon: "🚛", rarity: "EPICO" },
  // Social (retirado: las rutinas ya son públicas por defecto, no hay nada que compartir)
  { number: 15, code: "SHARE_FIRST", name: "Espíritu de equipo", description: "Retirado: se daba al compartir con el grupo tu primera rutina", icon: "🤝", rarity: "COMUN", retired: true },
];

/** Logro propuesto, aún sin implementar ni sembrar. */
export type AchievementSuggestion = Omit<AchievementDef, "code"> & { code?: string };

/**
 * Sugerencias para el largo plazo. NO están activas: no existen en la base de
 * datos ni se otorgan. La numeración sigue a la del catálogo para poder
 * referirse a ellas por número.
 */
export const ACHIEVEMENT_SUGGESTIONS: AchievementSuggestion[] = [
  { number: 16, name: "Madrugador", description: "Termina 10 entrenamientos que empezaron antes de las 8:00", icon: "🌅", rarity: "RARO" },
  { number: 17, name: "Noctámbulo", description: "Termina 10 entrenamientos que empezaron después de las 21:00", icon: "🌙", rarity: "RARO" },
  { number: 18, name: "Semana perfecta", description: "Cumple todos los días de tu plan 4 semanas distintas", icon: "🗓️", rarity: "RARO" },
  { number: 19, name: "Año de hierro", description: "Entrena durante 12 meses distintos", icon: "⚙️", rarity: "EPICO" },
  { number: 20, name: "En verde", description: "Ten 5 ejercicios en verde a la vez", icon: "🟢", rarity: "COMUN" },
  { number: 21, name: "Todo en verde", description: "Ten en verde todos los ejercicios de una rutina", icon: "🌿", rarity: "EPICO" },
  { number: 22, name: "Marca estable", description: "Verifica tu primera marca estable", icon: "🧱", rarity: "COMUN" },
  { number: 23, name: "Diez marcas estables", description: "Verifica 10 marcas estables distintas", icon: "🏰", rarity: "EPICO" },
  { number: 24, name: "100.000 kg levantados", description: "Acumula 100.000 kg de volumen total", icon: "🚢", rarity: "LEGENDARIO" },
  { number: 25, name: "Mil series", description: "Completa 1.000 series en total", icon: "🔁", rarity: "EPICO" },
  { number: 26, name: "Maratón de volumen", description: "Mueve más de 5.000 kg en un solo entrenamiento", icon: "🏔️", rarity: "RARO" },
  { number: 27, name: "Rutinero", description: "Crea 3 rutinas propias", icon: "📋", rarity: "COMUN" },
  { number: 28, name: "Inspirador", description: "Que alguien del grupo copie una rutina que compartiste", icon: "💡", rarity: "RARO" },
  { number: 29, name: "Primero en llegar", description: "Sé el primero del grupo en entrenar un lunes", icon: "🚩", rarity: "COMUN" },
  { number: 30, name: "Pico de temporada", description: "Acaba una temporada en el podio del ranking", icon: "🥇", rarity: "EPICO" },
  { number: 31, name: "Campeón de temporada", description: "Gana una temporada del ranking", icon: "🏆", rarity: "LEGENDARIO" },
  { number: 32, name: "Vuelta al ruedo", description: "Retoma el plan tras perder una racha de 4 semanas o más", icon: "♻️", rarity: "COMUN" },
  { number: 33, name: "Sin excusas", description: "Entrena en 3 festivos distintos", icon: "🎉", rarity: "RARO" },
  { number: 34, name: "Compañero de batalla", description: "Entrena el mismo día que otro miembro 10 veces", icon: "🤜", rarity: "RARO" },
  { number: 35, name: "Polivalente", description: "Entrena los 8 grupos musculares en un mismo mes", icon: "🧬", rarity: "RARO" },
  { number: 36, name: "Racha de 1 año", description: "Cumple tu plan 52 semanas seguidas", icon: "👑", rarity: "LEGENDARIO" },
  { number: 37, name: "Corrector de rumbo", description: "Usa una incidencia para corregir un entreno y mantén la racha", icon: "🛠️", rarity: "COMUN" },
  { number: 38, name: "Cartel completo", description: "Consigue puntos en las 4 categorías en una misma semana", icon: "🎴", rarity: "RARO" },
  { number: 39, name: "Récord de semana", description: "Bate tu mejor semana de puntos", icon: "⚡", rarity: "RARO" },
  { number: 40, name: "Coleccionista", description: "Consigue 20 logros", icon: "🧩", rarity: "LEGENDARIO" },
];
