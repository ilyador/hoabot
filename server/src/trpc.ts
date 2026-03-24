import { initTRPC, TRPCError } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { verifyToken } from './auth.js';
import { prisma } from './db.js';

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  let userId: string | null = null;
  let user: any = null;

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      userId = payload.userId;
      user = await prisma.user.findUnique({ where: { id: payload.userId } });
    }
  }

  return { req, res, userId, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      user: ctx.user,
    },
  });
});

// Checks auth + hoaId + role, but NOT subscription status.
// Use for subscription management endpoints that must remain accessible when trial is expired.
export const hoaAdminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user.hoaId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No HOA associated' });
  }
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'board_member') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({
    ctx: { ...ctx, hoaId: ctx.user.hoaId as string },
  });
});

export const adminProcedure = hoaAdminProcedure.use(async ({ ctx, next }) => {
  const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
  if (!hoa) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'HOA not found' });
  }

  // Auto-expire trials that have passed their end date
  if (hoa.subscriptionStatus === 'trialing' && hoa.trialEndsAt && hoa.trialEndsAt < new Date()) {
    await prisma.hoa.update({
      where: { id: hoa.id },
      data: { subscriptionStatus: 'trial_expired' },
    });
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Your free trial has ended. Subscribe to continue using HOABot.',
    });
  }

  // Check subscription status (allow none for initial setup, trialing, and active)
  const ALLOWED_SUB_STATUSES = ['none', 'trialing', 'active'];
  if (!ALLOWED_SUB_STATUSES.includes(hoa.subscriptionStatus)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: hoa.subscriptionStatus === 'past_due'
        ? 'Your payment is past due. Please update your payment method to continue.'
        : hoa.subscriptionStatus === 'trial_expired'
          ? 'Your free trial has ended. Subscribe to continue using HOABot.'
          : 'Your subscription is inactive. Please subscribe to continue.',
    });
  }

  return next({ ctx });
});
