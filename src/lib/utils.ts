import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKg(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`;
}

export const MUSCLE_LABELS: Record<string, string> = {
  PECHO: "Pecho",
  ESPALDA: "Espalda",
  HOMBRO: "Hombro",
  BICEPS: "Bíceps",
  TRICEPS: "Tríceps",
  PIERNA: "Pierna",
  GLUTEO: "Glúteo",
  CORE: "Core",
  CARDIO: "Cardio",
  OTRO: "Otro",
};

export const DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];

export const POINT_LABELS: Record<string, string> = {
  ATTENDANCE: "Asistencias (legado)",
  WORKOUT_COMPLETED: "Series realizadas",
  PROGRESS_WEEKLY: "Progreso semanal",
  NEW_PR: "Nuevos PRs",
  ROUTINE_SHARED: "Rutinas compartidas (legado)",
  STREAK_WEEK1: "Racha: 1.ª semana",
  STREAK_WEEK2: "Racha: 2 semanas",
  STREAK_WEEK3: "Racha: 3 semanas",
  STREAK_MONTH: "Racha: 1 mes",
  STREAK_CRACK: "Semanas crack 💎",
  STREAK_7: "Rachas (legado)",
  WEEKLY_TARGET: "Semanas cumplidas (legado)",
  GOAL_COMPLETED: "Objetivos (legado)",
  CUSTOM: "Puntos extra del admin",
};

/**
 * Techo de series que admite una incidencia. Una incidencia puede corregir el
 * entrenamiento entero, así que esto no es una regla de producto: solo evita
 * peticiones absurdas (ninguna sesión tiene trescientas series).
 */
export const MAX_INCIDENT_CHANGES = 300;
