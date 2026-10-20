import { PrismaClient, MuscleGroup, PointType } from "@prisma/client";
import { ACHIEVEMENT_CATALOG } from "../src/lib/achievements";
import { DEFAULT_RULES, RETIRED_RULE_TYPES } from "../src/lib/points";

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

// Sistema de puntos en cuatro categorías (Series, Asistencia, Progreso y
// Constancia): las reglas por defecto viven en src/lib/points.ts. Los PR ya no
// puntúan (su regla se retira, los puntos concedidos se conservan).
const POINT_RULES = DEFAULT_RULES as Array<{ type: PointType; name: string; points: number }>;

// Catálogo de logros: fuente única en src/lib/achievements.ts
const ACHIEVEMENTS = ACHIEVEMENT_CATALOG.map(({ number: _number, retired: _retired, ...a }) => a);

const NOTIFICATION_TEMPLATES: Array<{ code: string; title: string; body: string }> = [
  { code: "REMINDER_WEEK_LEFT", title: "¡Te queda 1 día para cumplir tu semana! 🎯", body: "Un entreno más y mantienes la racha." },
  { code: "REMINDER_INACTIVE", title: "Te echamos de menos 😴", body: "Hace días que no entrenas. ¡Hoy es buen día para volver!" },
  { code: "FRIEND_WORKOUT_START", title: "{name} está entrenando 🏋️", body: "Ha empezado {routine}. Es su {weekWorkout} entreno de la semana." },
  { code: "FRIEND_PR", title: "¡{name} ha hecho {count} PR! 🎉", body: "Acaba de superar su récord en {exercises}." },
  { code: "WEEK_COMPLETED", title: "{milestone}", body: "Has cumplido tus {target} días esta semana. {points}" },
];

async function main() {
  // Retirar reglas de puntos legadas. "Compartir rutina", las rachas de 7 días
  // y los PR salieron del sistema: los puntos ya otorgados se conservan, pero
  // la regla desaparece del panel de admin y no vuelve a dar puntos.
  await prisma.pointRule.deleteMany({
    where: { type: { in: [...RETIRED_RULE_TYPES] } },
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
  // Después pasó a "Series realizadas": los 5 puntos por entrenar son ahora la
  // regla de Asistencia (los puntos se respetan)
  await prisma.pointRule.updateMany({
    where: {
      type: "WORKOUT_COMPLETED",
      name: { in: ["Completar rutina (por serie)", "Entrenamiento completado (por serie, +5 por entrenar)"] },
    },
    data: { name: "Series realizadas (por serie)" },
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
