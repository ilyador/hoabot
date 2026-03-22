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

export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user.hoaId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No HOA associated' });
  }
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'board_member') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }

  // Check subscription status (allow none for initial setup, trialing, and active)
  const ALLOWED_SUB_STATUSES = ['none', 'trialing', 'active'];
  const hoa = await prisma.hoa.findUnique({ where: { id: ctx.user.hoaId } });
  if (hoa && !ALLOWED_SUB_STATUSES.includes(hoa.subscriptionStatus)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: hoa.subscriptionStatus === 'past_due'
        ? 'Your payment is past due. Please update your payment method in Settings to continue.'
        : 'Your subscription is inactive. Please subscribe in Settings to continue.',
    });
  }

  return next({
    ctx: {
      ...ctx,
      hoaId: ctx.user.hoaId as string,
    },
  });
});
