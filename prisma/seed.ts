import { PrismaClient, MuscleGroup, PointType, Rarity } from "@prisma/client";

const prisma = new PrismaClient();

const CATALOG: Array<[string, MuscleGroup]> = [
  // Pecho
  ["Press banca", "PECHO"], ["Press banca inclinado", "PECHO"], ["Press banca declinado", "PECHO"],
  ["Press banca con mancuernas", "PECHO"], ["Aperturas con mancuernas", "PECHO"], ["Cruce de poleas", "PECHO"],
  ["Fondos en paralelas", "PECHO"], ["Press en máquina", "PECHO"], ["Flexiones", "PECHO"],
  // Espalda
  ["Peso muerto", "ESPALDA"], ["Dominadas", "ESPALDA"], ["Dominadas lastradas", "ESPALDA"],
  ["Remo con barra", "ESPALDA"], ["Remo con mancuerna", "ESPALDA"], ["Jalón al pecho", "ESPALDA"],
  ["Remo en polea baja", "ESPALDA"], ["Pullover en polea", "ESPALDA"], ["Remo en máquina", "ESPALDA"],
  ["Hiperextensiones", "ESPALDA"],
  // Hombro
  ["Press militar", "HOMBRO"], ["Press militar con mancuernas", "HOMBRO"], ["Elevaciones laterales", "HOMBRO"],
  ["Elevaciones frontales", "HOMBRO"], ["Pájaros", "HOMBRO"], ["Face pull", "HOMBRO"],
  ["Press Arnold", "HOMBRO"], ["Encogimientos con barra", "HOMBRO"],
  // Bíceps
  ["Curl con barra", "BICEPS"], ["Curl con barra Z", "BICEPS"], ["Curl con mancuernas", "BICEPS"],
  ["Curl martillo", "BICEPS"], ["Curl en banco Scott", "BICEPS"], ["Curl en polea", "BICEPS"],
  ["Curl concentrado", "BICEPS"],
  // Tríceps
  ["Press francés", "TRICEPS"], ["Extensión de tríceps en polea", "TRICEPS"], ["Extensión con cuerda", "TRICEPS"],
  ["Press cerrado", "TRICEPS"], ["Fondos entre bancos", "TRICEPS"], ["Patada de tríceps", "TRICEPS"],
  // Pierna
  ["Sentadilla", "PIERNA"], ["Sentadilla frontal", "PIERNA"], ["Prensa de piernas", "PIERNA"],
  ["Zancadas", "PIERNA"], ["Extensión de cuádriceps", "PIERNA"], ["Curl femoral", "PIERNA"],
  ["Peso muerto rumano", "PIERNA"], ["Sentadilla búlgara", "PIERNA"], ["Elevación de gemelos", "PIERNA"],
  ["Sentadilla hack", "PIERNA"], ["Aductores en máquina", "PIERNA"],
  // Glúteo
  ["Hip thrust", "GLUTEO"], ["Patada de glúteo en polea", "GLUTEO"], ["Abductores en máquina", "GLUTEO"],
  ["Puente de glúteos", "GLUTEO"],
  // Core
  ["Plancha", "CORE"], ["Crunch abdominal", "CORE"], ["Elevación de piernas", "CORE"],
  ["Rueda abdominal", "CORE"], ["Russian twist", "CORE"], ["Crunch en polea", "CORE"],
  // Cardio
  ["Cinta de correr", "CARDIO"], ["Bicicleta estática", "CARDIO"], ["Elíptica", "CARDIO"],
  ["Remo (máquina)", "CARDIO"], ["Comba", "CARDIO"], ["Escaladora", "CARDIO"],
];

/**
 * Ejercicios del catálogo global que no se hacen con peso: en el entreno solo
 * se piden repeticiones y su progreso se mide en reps, no en kg.
 */
const NO_WEIGHT: string[] = [
  "Flexiones", "Fondos en paralelas", "Fondos entre bancos", "Dominadas", "Hiperextensiones",
  "Plancha", "Crunch abdominal", "Elevación de piernas", "Rueda abdominal", "Russian twist",
  "Puente de glúteos", "Zancadas",
  "Cinta de correr", "Bicicleta estática", "Elíptica", "Remo (máquina)", "Comba", "Escaladora",
];

const POINT_RULES: Array<{ type: PointType; name: string; points: number }> = [
  // Por serie realizada (si no se marcó ninguna, por serie de la sesión), más
  // 5 fijos por haber entrenado (WORKOUT_BONUS_POINTS, en gamification.ts)
  { type: "WORKOUT_COMPLETED", name: "Entrenamiento completado (por serie, +5 por entrenar)", points: 1 },
  { type: "NEW_PR", name: "Nuevo PR", points: 15 },
  { type: "STREAK_WEEK1", name: "Racha: 1 semana cumplida", points: 15 },
  { type: "STREAK_WEEK2", name: "Racha: 2 semanas seguidas", points: 25 },
  { type: "STREAK_WEEK3", name: "Racha: 3 semanas seguidas", points: 35 },
  { type: "STREAK_MONTH", name: "Racha: 1 mes seguido", points: 45 },
  { type: "STREAK_CRACK", name: "Crack: semana extra tras 1 mes", points: 45 },
];

const ACHIEVEMENTS: Array<{ code: string; name: string; description: string; icon: string; rarity: Rarity }> = [
  // Uno por cada regla del sistema de puntos
  { code: "FIRST_ATTENDANCE", name: "Primera asistencia", description: "Registra tu primer día de gimnasio", icon: "📍", rarity: "COMUN" },
  { code: "ATTENDANCE_25", name: "25 asistencias", description: "Ve al gimnasio 25 veces", icon: "🎽", rarity: "RARO" },
  { code: "SHARE_FIRST", name: "Espíritu de equipo", description: "Comparte con el grupo tu primera rutina creada", icon: "🤝", rarity: "COMUN" },
  { code: "STREAK_WEEK", name: "Primera semana cumplida", description: "Cumple tu plan semanal por primera vez", icon: "✅", rarity: "COMUN" },
  { code: "STREAK_CRACK", name: "Modo crack", description: "Supera el mes cumpliendo tu plan (5+ semanas seguidas)", icon: "💎", rarity: "EPICO" },
  { code: "FIRST_WORKOUT", name: "Primer entrenamiento", description: "Completa tu primer entrenamiento", icon: "🎯", rarity: "COMUN" },
  { code: "WORKOUTS_10", name: "10 entrenamientos", description: "Completa 10 entrenamientos", icon: "🔟", rarity: "COMUN" },
  { code: "WORKOUTS_100", name: "100 entrenamientos", description: "Completa 100 entrenamientos", icon: "💯", rarity: "EPICO" },
  { code: "FIRST_PR", name: "Primer PR", description: "Registra tu primer récord personal", icon: "🏋️", rarity: "COMUN" },
  { code: "PR_10", name: "10 PRs", description: "Consigue 10 récords personales", icon: "📈", rarity: "RARO" },
  { code: "STREAK_7", name: "Racha de 1 mes", description: "Cumple tu plan 4 semanas seguidas", icon: "🔥", rarity: "RARO" },
  { code: "STREAK_30", name: "Racha de 6 meses", description: "Cumple tu plan 26 semanas seguidas", icon: "🌋", rarity: "LEGENDARIO" },
  { code: "VOLUME_1000", name: "1.000 kg levantados", description: "Acumula 1.000 kg de volumen total", icon: "🏗️", rarity: "COMUN" },
  { code: "VOLUME_10000", name: "10.000 kg levantados", description: "Acumula 10.000 kg de volumen total", icon: "🚛", rarity: "EPICO" },
  { code: "ATTENDANCE_100", name: "100 asistencias", description: "Ve al gimnasio 100 veces", icon: "🏛️", rarity: "EPICO" },
];

const NOTIFICATION_TEMPLATES: Array<{ code: string; title: string; body: string }> = [
  { code: "REMINDER_WEEK_LEFT", title: "¡Te queda 1 día para cumplir tu semana! 🎯", body: "Un entreno más y mantienes la racha." },
  { code: "REMINDER_INACTIVE", title: "Te echamos de menos 😴", body: "Hace días que no entrenas. ¡Hoy es buen día para volver!" },
  { code: "FRIEND_WORKOUT_START", title: "{name} está entrenando 🏋️", body: "Ha empezado {routine}. Es su {weekWorkout} entreno de la semana." },
  { code: "FRIEND_PR", title: "¡{name} ha hecho {count} PR! 🎉", body: "Acaba de superar su récord en {exercises}." },
  { code: "WEEK_COMPLETED", title: "{milestone}", body: "Has cumplido tus {target} días esta semana. {points}" },
];

async function main() {
  // Retirar reglas de puntos legadas. "Ir al gimnasio" y "Compartir rutina"
  // salieron del sistema: los puntos ya otorgados se conservan, pero la regla
  // desaparece del panel de admin y no vuelve a dar puntos.
  await prisma.pointRule.deleteMany({
    where: {
      type: {
        in: ["STREAK_7", "WEEKLY_TARGET", "GOAL_COMPLETED", "ATTENDANCE", "ROUTINE_SHARED"],
      },
    },
  });

  for (const [name, muscleGroup] of CATALOG) {
    const noWeight = NO_WEIGHT.includes(name);
    const existing = await prisma.exercise.findFirst({ where: { name, createdById: null } });
    if (!existing) {
      await prisma.exercise.create({ data: { name, muscleGroup, noWeight } });
    } else if (noWeight && !existing.noWeight) {
      // Marca los ejercicios sin peso también en catálogos ya creados
      await prisma.exercise.update({ where: { id: existing.id }, data: { noWeight: true } });
    }
  }
  // "Completar rutina" pasó de puntos fijos a puntos por serie: la regla antigua
  // (15 fijos) se convierte una sola vez; después manda lo que ponga el admin.
  await prisma.pointRule.updateMany({
    where: { type: "WORKOUT_COMPLETED", name: "Completar rutina" },
    data: { name: "Completar rutina (por serie)", points: 1 },
  });
  // Y después cambió de nombre a "Entrenamiento completado" (los puntos se respetan)
  await prisma.pointRule.updateMany({
    where: { type: "WORKOUT_COMPLETED", name: "Completar rutina (por serie)" },
    data: { name: "Entrenamiento completado (por serie, +5 por entrenar)" },
  });

  for (const rule of POINT_RULES) {
    await prisma.pointRule.upsert({
      where: { type: rule.type },
      update: {},
      create: rule,
    });
  }
  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: a.code },
      update: { name: a.name, description: a.description, icon: a.icon, rarity: a.rarity },
      create: a,
    });
  }
  // Textos antiguos que deben migrarse a la versión con nombre del protagonista
  const LEGACY_TITLES: Record<string, string[]> = {
    FRIEND_PR: ["¡Nuevo PR en el grupo! 🎉"],
    FRIEND_WORKOUT_START: ["¡Alguien está entrenando! 🏋️"],
    // Texto fijo anterior: no decía ni la racha ni los puntos
    WEEK_COMPLETED: ["¡Semana completada! ✅"],
  };
  // Cuerpos antiguos que se sustituyen por la versión nueva
  const LEGACY_BODIES: Record<string, string[]> = {
    // No decía qué entreno de la semana era
    FRIEND_WORKOUT_START: ["Ha empezado {routine}."],
  };
  for (const t of NOTIFICATION_TEMPLATES) {
    const existing = await prisma.notificationTemplate.findUnique({ where: { code: t.code } });
    if (!existing) {
      await prisma.notificationTemplate.create({ data: t });
      continue;
    }
    // Solo se actualiza si el admin no lo ha personalizado
    if (
      (LEGACY_TITLES[t.code] ?? []).includes(existing.title) ||
      (LEGACY_BODIES[t.code] ?? []).includes(existing.body ?? "")
    ) {
      await prisma.notificationTemplate.update({
        where: { code: t.code },
        data: { title: t.title, body: t.body },
      });
    }
  }
  console.log("Seed completado ✅");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
