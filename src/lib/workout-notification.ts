/**
 * Constantes compartidas (servidor y cliente) de los avisos del entreno en
 * curso. Viven aparte de workout-service.ts porque ese archivo importa Prisma
 * y no puede entrar en el bundle del navegador.
 */

/** Notificación fija mientras hay un entreno activo (se cierra al terminarlo). */
export const ACTIVE_WORKOUT_TAG = "gymbros-active-workout";

/**
 * «¿Sigues entrenando?»: la misma etiqueta la usan el push del servidor y el
 * aviso local del cliente, así que si llegan los dos en el mismo dispositivo
 * el segundo sustituye al primero en vez de apilarse.
 */
export const WORKOUT_REMINDER_TAG = "gymbros-workout-reminder";

/** Tiempo sin tocar pesos ni repeticiones antes de recordarlo. */
export const WORKOUT_IDLE_MS = 15 * 60 * 1000;
