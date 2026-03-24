import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'crypto';
import { sendInviteEmail } from '../email.js';

const INVITE_EXPIRY_DAYS = 30;
const BASE_URL = process.env.VITE_API_URL || 'http://localhost:5174';

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export const membersRouter = router({
  invite: adminProcedure
    .input(z.object({
      email: z.string().email(),
      role: z.enum(['board_member', 'homeowner']),
      unitId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.role === 'homeowner' && !input.unitId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unit is required for homeowner invites' });
      }

      if (input.unitId) {
        const unit = await prisma.unit.findUnique({ where: { id: input.unitId } });
        if (!unit || unit.hoaId !== ctx.hoaId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unit not found in this HOA' });
        }
        if (unit.userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This unit already has an owner assigned' });
        }
      }

      const existing = await prisma.invite.findFirst({
        where: {
          email: input.email,
          hoaId: ctx.hoaId,
          status: 'pending',
          expiresAt: { gt: new Date() },
        },
      });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Pending invite already exists — revoke it first or resend' });
      }

      const token = generateToken();
      const invite = await prisma.invite.create({
        data: {
          hoaId: ctx.hoaId,
          email: input.email,
          role: input.role,
          unitId: input.unitId || null,
          token,
          invitedBy: ctx.userId,
          expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      const link = `${BASE_URL}/join/${token}`;
      const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
      const unit = input.unitId ? await prisma.unit.findUnique({ where: { id: input.unitId } }) : null;

      const emailResult = await sendInviteEmail(input.email, {
        hoaName: hoa!.name,
        role: input.role,
        inviterName: ctx.user.name,
        joinUrl: link,
        unitAddress: unit?.address,
      });

      return { invite, link, emailSent: emailResult.sent, emailError: emailResult.error };
    }),

  listInvites: adminProcedure.query(async ({ ctx }) => {
    const invites = await prisma.invite.findMany({
      where: { hoaId: ctx.hoaId },
      orderBy: { createdAt: 'desc' },
      include: {
        unit: { select: { address: true } },
        inviter: { select: { name: true } },
      },
    });

    return invites.map(inv => ({
      ...inv,
      effectiveStatus: inv.status === 'pending' && inv.expiresAt < new Date() ? 'expired' : inv.status,
    }));
  }),

  revokeInvite: adminProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const invite = await prisma.invite.findUnique({ where: { id: input.inviteId } });
      if (!invite || invite.hoaId !== ctx.hoaId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      }
      return prisma.invite.update({
        where: { id: input.inviteId },
        data: { status: 'revoked' },
      });
    }),

  resendInvite: adminProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const invite = await prisma.invite.findUnique({ where: { id: input.inviteId } });
      if (!invite || invite.hoaId !== ctx.hoaId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      }
      if (invite.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only resend pending invites' });
      }
      if (invite.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite has expired — create a new one' });
      }

      const newToken = generateToken();
      const updated = await prisma.invite.update({
        where: { id: input.inviteId },
        data: {
          token: newToken,
          expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      const link = `${BASE_URL}/join/${newToken}`;
      const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
      const unit = invite.unitId ? await prisma.unit.findUnique({ where: { id: invite.unitId } }) : null;

      const emailResult = await sendInviteEmail(invite.email, {
        hoaName: hoa!.name,
        role: invite.role,
        inviterName: ctx.user.name,
        joinUrl: link,
        unitAddress: unit?.address,
      });

      return { invite: updated, link, emailSent: emailResult.sent };
    }),

  list: adminProcedure.query(async ({ ctx }) => {
    return prisma.user.findMany({
      where: { hoaId: ctx.hoaId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }),

  remove: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot remove yourself' });
      }
      const target = await prisma.user.findUnique({ where: { id: input.userId } });
      if (!target || target.hoaId !== ctx.hoaId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found in this HOA' });
      }

      await prisma.unit.updateMany({
        where: { userId: input.userId, hoaId: ctx.hoaId },
        data: { userId: null },
      });

      await prisma.user.update({
        where: { id: input.userId },
        data: { hoaId: null, role: 'admin' },
      });

      return { success: true };
    }),
});
