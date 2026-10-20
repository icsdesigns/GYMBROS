/**
 * Catálogo de logros: FUENTE ÚNICA.
 *
 * Cada logro lleva un número fijo para poder referirse a él ("el 7", "el 12").
 * El número no se reutiliza ni se reordena: si un logro se retira, su hueco se
 * queda vacío. `code` es el que guarda la base de datos (tabla Achievement); el
 * seed y `grant` la rellenan desde aquí, así que añadir un logro es añadirlo a
 * ACHIEVEMENT_CATALOG y darle su condición en `checkAchievements`.
 *
 * Los logros SUGERIDOS (ver abajo) no están activos: sirven para decidir
 * cuáles implementar. Hoy no queda ninguno.
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
  // Los números 16-18, 20, 22, 25-26, 28, 30, 33 y 35-39 quedan vacíos: eran ideas descartadas.
  { number: 19, code: "YEAR_OF_IRON", name: "Año de hierro", description: "Entrena durante 12 meses distintos", icon: "⚙️", rarity: "EPICO" },
  { number: 21, code: "ALL_GREEN", name: "Todo en verde", description: "Ten en verde todos los ejercicios de todas tus rutinas", icon: "🌿", rarity: "EPICO" },
  { number: 23, code: "STABLE_MARKS_10", name: "Diez marcas estables", description: "Verifica 10 marcas estables distintas", icon: "🏰", rarity: "EPICO" },
  { number: 24, code: "VOLUME_100000", name: "100.000 kg levantados", description: "Acumula 100.000 kg de volumen total", icon: "🚢", rarity: "LEGENDARIO" },
  { number: 27, code: "ROUTINES_3", name: "Rutinero", description: "Crea 3 rutinas propias", icon: "📋", rarity: "COMUN" },
  { number: 29, code: "FIRST_ON_MONDAY", name: "Primero en llegar", description: "Sé el primero del grupo en entrenar un lunes", icon: "🚩", rarity: "COMUN" },
  { number: 31, code: "SEASON_CHAMPION", name: "Campeón de temporada", description: "Gana una temporada del ranking", icon: "🏆", rarity: "LEGENDARIO" },
  { number: 32, code: "COMEBACK", name: "Vuelta al ruedo", description: "Retoma el plan tras perder una racha de 4 semanas o más", icon: "♻️", rarity: "COMUN" },
  { number: 34, code: "WORKOUT_BUDDY", name: "Compañero de batalla", description: "Entrena el mismo día que otro miembro 10 veces", icon: "🤜", rarity: "RARO" },
  { number: 40, code: "COLLECTOR", name: "Coleccionista", description: "Consigue todos los logros", icon: "🧩", rarity: "LEGENDARIO" },
];

/** Logro propuesto, aún sin implementar ni sembrar. */
export type AchievementSuggestion = Omit<AchievementDef, "code"> & { code?: string };

/**
 * Sugerencias para el largo plazo. Ahora mismo no hay ninguna pendiente: las
 * elegidas pasaron al catálogo (conservando su número) y el resto se descartó.
 * Si se añaden, NO están activas: no existen en la base de datos ni se otorgan.
 */
export const ACHIEVEMENT_SUGGESTIONS: AchievementSuggestion[] = [];
