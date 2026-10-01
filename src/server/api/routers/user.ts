import { z } from "zod";
import { hash } from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { startOfISOWeek, endOfISOWeek } from "date-fns";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/server/api/trpc";
import { effectiveWeekStreak, streaksForUsers } from "@/server/services/streak";
import { trainingProfiles, affinityBetween, affinityDetail } from "@/server/services/affinity";
import { sendPushToUsers } from "@/server/services/push";
import { createGroupFor, joinGroupAs } from "@/server/api/routers/group";
import { groupMemberIds } from "@/server/services/group";
import { progressUnlock, trainingProgress } from "@/server/services/training-progress";
import {
  DELETION_GRACE_DAYS,
  deletionDeadline,
  randomDeletionWord,
} from "@/server/services/account-deletion";
import {
  RESET_TTL_MINUTES,
  consumeResetToken,
  createResetToken,
  resetRequestsExceeded,
  resetTokenIsValid,
} from "@/server/services/password-reset";

export const userRouter = createTRPCRouter({
  /**
   * Alta de cuenta. Hay dos caminos y la pantalla de acceso los ofrece como
   * tales: CREAR UN GRUPO (hace falta la clave maestra) o UNIRME A UN GRUPO
   * (basta con su código).
   */
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(2).max(50),
        email: z.string().email(),
        password: z.string().min(8),
        gymStartDate: z.date().optional(),
        gymName: z.string().trim().max(80).optional(),
        group: z.discriminatedUnion("mode", [
          z.object({
            mode: z.literal("join"),
            code: z.string().trim().min(1),
          }),
          z.object({
            mode: z.literal("create"),
            name: z.string().trim().min(2).max(40),
            code: z.string().trim().min(4).max(20),
            masterKey: z.string(),
          }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const existing = await ctx.db.user.findUnique({ where: { email } });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya existe una cuenta con ese email" });
      }
      const isFirst = (await ctx.db.user.count()) === 0;
      const user = await ctx.db.user.create({
        data: {
          email,
          name: input.name.trim(),
          passwordHash: await hash(input.password, 12),
          gymStartDate: input.gymStartDate,
          // Alimenta la etiqueta del panel y la hoja de Gym desde el primer día
          gymName: input.gymName || null,
          role: isFirst ? "ADMIN" : "USER", // el primer usuario es admin
        },
      });

      // Si el grupo falla no queda una cuenta a medias: se deshace el alta.
      try {
        const group =
          input.group.mode === "create"
            ? await createGroupFor(ctx.db, user.id, input.group)
            : await joinGroupAs(ctx.db, user.id, input.group.code);
        await ctx.db.user.update({ where: { id: user.id }, data: { activeGroupId: group.id } });
        return { id: user.id, group: { name: group.name, code: group.code } };
      } catch (error) {
        await ctx.db.user.delete({ where: { id: user.id } });
        throw error;
      }
    }),

  me: protectedProcedure.query(({ ctx }) =>
    ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: {
        id: true, email: true, name: true, avatarUrl: true, gymStartDate: true,
        role: true, currentStreak: true, bestStreak: true, createdAt: true, notifyPrefs: true,
        weeklyTargetDays: true, investmentEnabled: true, onboardingDone: true,
        deletionRequestedAt: true,
        gymName: true,
      },
    }),
  ),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(50).optional(),
        avatarUrl: z
          .string()
          .max(300_000)
          .refine(
            (v) => /^https?:\/\//.test(v) || v.startsWith("data:image/"),
            "Debe ser una URL o una imagen subida",
          )
          .nullable()
          .optional(),
        gymStartDate: z.date().nullable().optional(),
        investmentEnabled: z.boolean().optional(),
        notifyPrefs: z.record(z.boolean()).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({ where: { id: ctx.session.user.id }, data: input }),
    ),

  /** Gimnasio de referencia del apartado Gym: solo el nombre. */
  setGym: protectedProcedure
    .input(z.object({ name: z.string().trim().max(80).nullable() }))
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { gymName: input.name || null },
        select: { gymName: true },
      }),
    ),

  /** Latido de la app abierta: sirve para saber si un entreno activo se olvidó. */
  ping: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.session.user.id },
      data: { lastSeenAt: new Date() },
      select: { id: true },
    });
    return { ok: true };
  }),

  completeOnboarding: protectedProcedure.mutation(({ ctx }) =>
    ctx.db.user.update({
      where: { id: ctx.session.user.id },
      data: { onboardingDone: true },
    }),
  ),

  changePassword: protectedProcedure
    .input(z.object({ current: z.string(), next: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const { compare } = await import("bcryptjs");
      const user = await ctx.db.user.findUniqueOrThrow({ where: { id: ctx.session.user.id } });
      if (!(await compare(input.current, user.passwordHash))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "La contraseña actual no es correcta" });
      }
      await ctx.db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hash(input.next, 12) },
      });
      return { ok: true };
    }),

  /**
   * Resetea el perfil: borra TODOS los registros de actividad del usuario.
   * Conserva la cuenta, las rutinas y los ejercicios personalizados.
   */
  resetData: protectedProcedure
    .input(z.object({ confirmation: z.literal("RESET") }))
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      await ctx.db.$transaction([
        ctx.db.pointEvent.deleteMany({ where: { userId } }),
        ctx.db.notification.deleteMany({ where: { userId } }),
        ctx.db.feedComment.deleteMany({ where: { userId } }),
        ctx.db.feedLike.deleteMany({ where: { userId } }),
        ctx.db.feedItem.deleteMany({ where: { userId } }),
        ctx.db.personalRecord.deleteMany({ where: { userId } }),
        ctx.db.bodyMetric.deleteMany({ where: { userId } }),
        ctx.db.attendance.deleteMany({ where: { userId } }),
        ctx.db.workout.deleteMany({ where: { userId } }),
        ctx.db.userAchievement.deleteMany({ where: { userId } }),
        ctx.db.user.update({
          where: { id: userId },
          data: {
            currentStreak: 0,
            bestStreak: 0,
            lastAttendanceDate: null,
            lastCompletedWeek: null,
            streakWarnedWeek: null,
            streakLostWeek: null,
            planPosition: 0,
          },
        }),
      ]);
      return { ok: true };
    }),

  // Perfil público: solo datos visibles para el grupo. Nunca métricas corporales.
  /**
   * Historial de puntos agrupado por día, del más reciente al más antiguo.
   *
   * Sirve tanto para el panel propio como para el perfil de cualquier miembro:
   * el desglose por categoría dice EN QUÉ se ganaron los puntos, pero no
   * CUÁNDO, que es justo lo que hace falta para entender una subida o un
   * parón en el ranking.
   */
  pointsHistory: protectedProcedure
    .input(
      z.object({
        userId: z.string().optional(), // por defecto, uno mismo
        days: z.number().int().min(1).max(365).default(90),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = input.userId ?? ctx.session.user.id;
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      from.setDate(from.getDate() - input.days);

      const events = await ctx.db.pointEvent.findMany({
        where: { userId, date: { gte: from } },
        select: { id: true, type: true, points: true, date: true },
        orderBy: { date: "desc" },
      });

      // Se agrupa por día natural conservando el orden descendente de la query
      const byDay = new Map<string, { date: Date; total: number; items: typeof events }>();
      for (const e of events) {
        const key = e.date.toISOString().slice(0, 10);
        const day = byDay.get(key) ?? { date: e.date, total: 0, items: [] };
        day.total += e.points;
        day.items.push(e);
        byDay.set(key, day);
      }

      const days = Array.from(byDay.entries()).map(([key, d]) => ({ key, ...d }));
      return {
        days,
        total: events.reduce((acc, e) => acc + e.points, 0),
        sinceDays: input.days,
      };
    }),

  publicProfile: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Un perfil solo se ve desde dentro: hay que compartir grupo con él (o
      // ser uno mismo). Los perfiles pendientes de borrado no se ven.
      if (input.userId !== ctx.session.user.id) {
        const memberIds = await groupMemberIds(ctx.db, ctx.groupId);
        if (!memberIds.includes(input.userId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ese perfil no está en tu grupo" });
        }
      }
      const user = await ctx.db.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: {
          id: true, name: true, avatarUrl: true, gymStartDate: true,
          currentStreak: true, bestStreak: true, lastCompletedWeek: true, createdAt: true,
          weeklyTargetDays: true, gymName: true,
        },
      });
      const isSelf = input.userId === ctx.session.user.id;
      const [attendances, workouts, recentPRs, routines, achievements, points, breakdownRaw, weekCount, progressMap] =
        await Promise.all([
          ctx.db.attendance.count({ where: { userId: user.id } }),
          ctx.db.workout.count({ where: { userId: user.id, endedAt: { not: null } } }),
          // PRs públicos como evento, pero SIN el peso alcanzado (privado)
          ctx.db.personalRecord.findMany({
            where: { userId: user.id },
            orderBy: { date: "desc" },
            take: 5,
            select: { id: true, date: true, exercise: { select: { name: true } } },
          }),
          // Rutinas públicas: ejercicios, series y repeticiones. Los pesos NUNCA se exponen.
          ctx.db.routine.findMany({
            where: { userId: user.id },
            select: {
              id: true, name: true, description: true, color: true, emoji: true,
              recommendedDays: true, estimatedMinutes: true, isShared: true,
              exercises: {
                orderBy: { order: "asc" },
                select: {
                  id: true, sets: true, reps: true, order: true,
                  exercise: { select: { name: true, muscleGroup: true } },
                },
              },
            },
            orderBy: { updatedAt: "desc" },
          }),
          ctx.db.userAchievement.findMany({
            where: { userId: user.id },
            include: { achievement: true },
            orderBy: { earnedAt: "desc" },
          }),
          ctx.db.pointEvent.aggregate({ where: { userId: user.id }, _sum: { points: true } }),
          ctx.db.pointEvent.groupBy({
            by: ["type"],
            where: { userId: user.id },
            _sum: { points: true },
            _count: true,
          }),
          ctx.db.attendance.count({
            where: {
              userId: input.userId,
              date: { gte: startOfISOWeek(new Date()), lte: endOfISOWeek(new Date()) },
            },
          }),
          // Progreso del perfil y, si no es el propio, también el de quien mira
          // (para aplicar la regla de desbloqueo)
          trainingProgress(ctx.db, isSelf ? [input.userId] : [input.userId, ctx.session.user.id]),
        ]);
      // Afinidad de entrenamiento con quien está mirando el perfil
      const profiles = await trainingProfiles(ctx.db);
      const myProfile = profiles.get(ctx.session.user.id);
      const theirProfile = profiles.get(input.userId);
      // El progreso ajeno solo se ve con el propio ya desbloqueado; el propio, siempre
      const lock = isSelf ? { unlocked: true, sessionsMissing: 0 } : progressUnlock(progressMap.get(ctx.session.user.id));
      const progress = lock.unlocked ? progressMap.get(input.userId)! : null;
      const progressLock = lock.unlocked ? null : { sessionsMissing: lock.sessionsMissing };

      const { lastCompletedWeek, weeklyTargetDays, ...publicUser } = user;
      return {
        affinity: isSelf ? null : affinityBetween(myProfile, theirProfile),
        affinityDetail: isSelf ? null : affinityDetail(myProfile, theirProfile),
        myProfileEmpty: !myProfile || myProfile.routines === 0,
        theirProfileEmpty: !theirProfile || theirProfile.routines === 0,
        user: {
          ...publicUser,
          currentStreak: effectiveWeekStreak({
            currentStreak: user.currentStreak,
            lastCompletedWeek,
            weeklyTargetDays,
            weekCount,
          }),
        },
        attendances, workouts, recentPRs, routines, achievements, progress, progressLock,
        totalPoints: points._sum.points ?? 0,
        pointsBreakdown: breakdownRaw.map((g) => ({ type: g.type, points: g._sum.points ?? 0, count: g._count })),
      };
    }),

  // Calendario de asistencias de un miembro del grupo (solo fechas)
  memberCalendar: protectedProcedure
    .input(z.object({ userId: z.string(), year: z.number().int(), month: z.number().int().min(0).max(11) }))
    .query(async ({ ctx, input }) => {
      const from = new Date(input.year, input.month, 1);
      const to = new Date(input.year, input.month + 1, 0, 23, 59, 59);
      const attendances = await ctx.db.attendance.findMany({
        where: { userId: input.userId, date: { gte: from, lte: to } },
        select: { date: true },
        orderBy: { date: "asc" },
      });
      return attendances.map((a) => a.date);
    }),

  // Listado ligero del grupo. El detalle de cada miembro (incluida la afinidad
  // de entrenamiento) se resuelve en su perfil, no aquí.
  list: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    // Solo el grupo activo, y sin los perfiles con borrado pendiente
    const memberIds = await groupMemberIds(ctx.db, ctx.groupId);
    const users = await ctx.db.user.findMany({
      where: { id: { in: memberIds } },
      select: {
        id: true, name: true, avatarUrl: true,
        currentStreak: true, lastCompletedWeek: true, weeklyTargetDays: true,
      },
      orderBy: { name: "asc" },
    });
    const [streaks, progress] = await Promise.all([
      streaksForUsers(ctx.db, users),
      trainingProgress(ctx.db, users.map((u) => u.id)),
    ]);
    // Sin el progreso propio desbloqueado, el contorno de los demás no se ve
    const unlocked = progressUnlock(progress.get(me)).unlocked;
    return users.map(({ lastCompletedWeek, weeklyTargetDays, ...u }) => ({
      ...u,
      currentStreak: streaks.get(u.id) ?? 0,
      progressLevel: u.id === me || unlocked ? progress.get(u.id)?.level ?? null : null,
      isMe: u.id === me,
    }));
  }),

  // ---------- Recuperación de contraseña ----------

  /**
   * Pide un enlace de recuperación. Se envía por push a los dispositivos donde
   * la cuenta ya tiene sesión abierta.
   *
   * La respuesta es siempre la misma pase lo que pase: si distinguiera entre
   * "no existe esa cuenta" y "te lo he enviado", cualquiera podría averiguar
   * qué emails están registrados probando uno a uno.
   */
  requestReset: publicProcedure
    // El teclado del móvil cuela espacios y mayúsculas al autocompletar: se
    // limpian antes de validar, o el email quedaría rechazado por un espacio.
    .input(z.object({ email: z.string().trim().toLowerCase().email() }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email;
      const user = await ctx.db.user.findUnique({
        where: { email },
        select: { id: true, _count: { select: { pushSubscriptions: true } } },
      });
      if (!user || user._count.pushSubscriptions === 0) return { ok: true };
      if (await resetRequestsExceeded(ctx.db, user.id)) return { ok: true };

      const token = await createResetToken(ctx.db, user.id);
      await sendPushToUsers(ctx.db, [user.id], {
        title: "Restablecer tu contraseña",
        body: `Toca para elegir una nueva. El enlace caduca en ${RESET_TTL_MINUTES} minutos.`,
        url: `/recuperar/${token}`,
      });
      return { ok: true };
    }),

  /** ¿Merece la pena enseñar el formulario o el enlace ya no sirve? */
  checkResetToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(({ ctx, input }) => resetTokenIsValid(ctx.db, input.token)),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string(), password: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const result = await consumeResetToken(ctx.db, input.token, input.password);
      if (!result.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este enlace ya se ha usado o ha caducado. Pide uno nuevo.",
        });
      }
      // El email vuelve para poder iniciar sesión sin pedirlo de nuevo: quien
      // llega aquí ya ha demostrado tener el token de esa cuenta.
      return { ok: true, email: result.email };
    }),

  // ---------- Borrado de la cuenta (dos fases) ----------

  /**
   * Genera la palabra que habrá que teclear para confirmar. Es aleatoria a
   * propósito: un "ESCRIBE BORRAR" se teclea en piloto automático.
   */
  deletionChallenge: protectedProcedure.mutation(async ({ ctx }) => {
    const word = randomDeletionWord();
    await ctx.db.user.update({
      where: { id: ctx.session.user.id },
      data: { deletionWord: word },
    });
    return { word, graceDays: DELETION_GRACE_DAYS };
  }),

  /**
   * Fase 1: el perfil desaparece de los grupos y la sesión se cierra, pero no
   * se borra nada durante DELETION_GRACE_DAYS. Volver a entrar lo cancela.
   */
  requestDeletion: protectedProcedure
    .input(z.object({ word: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUniqueOrThrow({
        where: { id: ctx.session.user.id },
        select: { deletionWord: true },
      });
      if (!user.deletionWord || input.word.trim().toLowerCase() !== user.deletionWord) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La palabra no coincide" });
      }
      const requestedAt = new Date();
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { deletionRequestedAt: requestedAt, deletionWord: null },
      });
      return { ok: true, deletesAt: deletionDeadline(requestedAt), graceDays: DELETION_GRACE_DAYS };
    }),

  /** Cancelar el borrado sin tener que cerrar y abrir sesión. */
  cancelDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.session.user.id },
      data: { deletionRequestedAt: null, deletionWord: null },
    });
    return { ok: true };
  }),
});
