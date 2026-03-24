import { z } from 'zod';
import { router, publicProcedure, authedProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';
import { TRPCError } from '@trpc/server';

const isProduction = process.env.NODE_ENV === 'production';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

export const authRouter = router({
  register: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'An account with this email already exists' });
      }

      const passwordHash = await hashPassword(input.password);
      const user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          role: 'admin',
        },
      });

      const token = signToken(user.id);
      ctx.res.cookie('token', token, cookieOptions());

      return { user: { id: user.id, email: user.email, name: user.name, role: user.role, hoaId: user.hoaId } };
    }),

  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      if (!user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
      }

      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
      }

      const token = signToken(user.id);
      ctx.res.cookie('token', token, cookieOptions());

      return { user: { id: user.id, email: user.email, name: user.name, role: user.role, hoaId: user.hoaId } };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    ctx.res.clearCookie('token', { path: '/' });
    return { success: true };
  }),

  me: authedProcedure.query(async ({ ctx }) => {
    let subscriptionStatus: string | null = null;
    let trialEndsAt: string | null = null;

    if (ctx.user.hoaId) {
      const hoa = await prisma.hoa.findUnique({
        where: { id: ctx.user.hoaId },
        select: { subscriptionStatus: true, trialEndsAt: true },
      });
      if (hoa) {
        // Auto-expire trials that have passed
        if (hoa.subscriptionStatus === 'trialing' && hoa.trialEndsAt && hoa.trialEndsAt < new Date()) {
          await prisma.hoa.update({
            where: { id: ctx.user.hoaId },
            data: { subscriptionStatus: 'trial_expired' },
          });
          subscriptionStatus = 'trial_expired';
        } else {
          subscriptionStatus = hoa.subscriptionStatus;
        }
        trialEndsAt = hoa.trialEndsAt?.toISOString() ?? null;
      }
    }

    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      role: ctx.user.role,
      hoaId: ctx.user.hoaId,
      subscriptionStatus,
      trialEndsAt,
    };
  }),

  validateInvite: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const invite = await prisma.invite.findUnique({
        where: { token: input.token },
        include: { hoa: { select: { name: true } }, unit: { select: { address: true } } },
      });
      if (!invite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      }
      if (invite.status === 'accepted') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has already been used' });
      }
      if (invite.status === 'revoked') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has been revoked' });
      }
      if (invite.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has expired' });
      }

      return {
        email: invite.email,
        role: invite.role,
        hoaName: invite.hoa.name,
        unitAddress: invite.unit?.address ?? null,
      };
    }),

  registerWithInvite: publicProcedure
    .input(z.object({
      token: z.string(),
      name: z.string().min(1),
      password: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      const invite = await prisma.invite.findUnique({ where: { token: input.token } });
      if (!invite || invite.status !== 'pending' || invite.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite is no longer valid' });
      }

      const existing = await prisma.user.findUnique({ where: { email: invite.email } });
      let user;

      if (existing) {
        if (existing.hoaId && existing.hoaId !== invite.hoaId) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This email is already associated with another HOA' });
        }
        if (existing.hoaId === invite.hoaId) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This user is already a member of this HOA' });
        }
        // Previously removed user (null hoaId) — re-link
        user = await prisma.user.update({
          where: { id: existing.id },
          data: { hoaId: invite.hoaId, role: invite.role },
        });
      } else {
        const passwordHash = await hashPassword(input.password);
        user = await prisma.user.create({
          data: {
            email: invite.email,
            passwordHash,
            name: input.name,
            role: invite.role,
            hoaId: invite.hoaId,
          },
        });
      }

      if (invite.unitId) {
        await prisma.unit.update({
          where: { id: invite.unitId },
          data: { userId: user.id },
        });
      }

      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      });

      const token = signToken(user.id);
      ctx.res.cookie('token', token, cookieOptions());

      return { user: { id: user.id, email: user.email, name: user.name, role: user.role, hoaId: user.hoaId } };
    }),
});
