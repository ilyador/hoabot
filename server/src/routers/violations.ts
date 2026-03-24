import { z } from 'zod';
import { router, adminProcedure, authedProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';
import { searchChunks } from '../ai.js';

export const violationsRouter = router({
  list: adminProcedure
    .input(z.object({
      status: z.enum(['reported', 'notice_sent', 'curing', 'resolved', 'escalated']).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const where: any = { hoaId: ctx.hoaId };
      if (input?.status) where.status = input.status;

      return prisma.violation.findMany({
        where,
        include: { unit: true },
        orderBy: { createdAt: 'desc' },
      });
    }),

  create: adminProcedure
    .input(z.object({
      unitId: z.string(),
      type: z.string().min(1),
      description: z.string().min(1),
      cureByDate: z.string().optional(),
      fineAmount: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const unit = await prisma.unit.findFirst({ where: { id: input.unitId, hoaId: ctx.hoaId } });
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unit not found' });

      return prisma.violation.create({
        data: {
          hoaId: ctx.hoaId,
          unitId: input.unitId,
          type: input.type,
          description: input.description,
          cureByDate: input.cureByDate ? (() => { const [y, m, d] = input.cureByDate!.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); })() : undefined,
          fineAmount: input.fineAmount,
        },
      });
    }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['reported', 'notice_sent', 'curing', 'hearing_requested', 'resolved', 'escalated']),
    }))
    .mutation(async ({ input, ctx }) => {
      const violation = await prisma.violation.findFirst({ where: { id: input.id, hoaId: ctx.hoaId } });
      if (!violation) throw new TRPCError({ code: 'NOT_FOUND' });

      return prisma.violation.update({
        where: { id: input.id },
        data: { status: input.status },
      });
    }),

  // Homeowner can respond/dispute a violation
  respond: authedProcedure
    .input(z.object({
      id: z.string(),
      response: z.string().min(1),
      requestHearing: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.hoaId) throw new TRPCError({ code: 'FORBIDDEN' });

      const violation = await prisma.violation.findFirst({
        where: { id: input.id, hoaId: ctx.user.hoaId },
        include: { unit: true },
      });
      if (!violation) throw new TRPCError({ code: 'NOT_FOUND' });

      // Verify the user is associated with the violated unit
      const isOwner = violation.unit.ownerEmail === ctx.user.email || violation.unit.userId === ctx.userId;
      const isAdmin = ctx.user.role === 'admin' || ctx.user.role === 'board_member';
      if (!isOwner && !isAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only respond to violations on your own unit' });
      }

      // Only allow response if violation is in an active state
      if (['resolved', 'escalated'].includes(violation.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot respond to a resolved or escalated violation' });
      }

      return prisma.violation.update({
        where: { id: input.id },
        data: {
          ownerResponse: input.response,
          respondedAt: new Date(),
          status: input.requestHearing ? 'hearing_requested' : violation.status,
        },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const violation = await prisma.violation.findFirst({ where: { id: input.id, hoaId: ctx.hoaId } });
      if (!violation) throw new TRPCError({ code: 'NOT_FOUND' });
      await prisma.violation.delete({ where: { id: input.id } });
      return { success: true };
    }),

  suggestRule: adminProcedure
    .input(z.object({ violationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const violation = await prisma.violation.findFirst({ where: { id: input.violationId, hoaId: ctx.hoaId } });
      if (!violation) throw new TRPCError({ code: 'NOT_FOUND' });

      try {
        const query = `${violation.type} ${violation.description}`;
        const chunks = await searchChunks(ctx.hoaId, query, 3);
        const suggestions = chunks.filter(c => c.score > 0.3);
        return { suggestions };
      } catch {
        return { suggestions: [] };
      }
    }),

  saveRule: adminProcedure
    .input(z.object({
      violationId: z.string(),
      ruleCitation: z.string().max(3000),
    }))
    .mutation(async ({ input, ctx }) => {
      const violation = await prisma.violation.findFirst({ where: { id: input.violationId, hoaId: ctx.hoaId } });
      if (!violation) throw new TRPCError({ code: 'NOT_FOUND' });

      return prisma.violation.update({
        where: { id: input.violationId },
        data: { ruleCitation: input.ruleCitation || null },
      });
    }),
});
