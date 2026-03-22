import { z } from 'zod';
import { router, adminProcedure, authedProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';

export const maintenanceRouter = router({
  list: adminProcedure
    .input(z.object({
      status: z.enum(['submitted', 'acknowledged', 'in_progress', 'completed']).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const where: any = { hoaId: ctx.hoaId };
      if (input?.status) where.status = input.status;

      return prisma.maintenanceRequest.findMany({
        where,
        include: { unit: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      });
    }),

  // Homeowners can submit maintenance requests too
  create: authedProcedure
    .input(z.object({
      unitId: z.string().optional(),
      title: z.string().min(1),
      description: z.string().min(1),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.hoaId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No HOA associated' });

      const req = await prisma.maintenanceRequest.create({
        data: {
          hoaId: ctx.user.hoaId,
          unitId: input.unitId || null,
          title: input.title,
          description: input.description,
          priority: input.priority,
          submittedBy: ctx.userId,
          statusHistory: {
            create: [{
              fromStatus: '',
              toStatus: 'submitted',
              note: 'Request submitted',
              changedBy: ctx.userId,
            }],
          },
        },
      });

      return req;
    }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['submitted', 'acknowledged', 'in_progress', 'completed']),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const req = await prisma.maintenanceRequest.findFirst({ where: { id: input.id, hoaId: ctx.hoaId } });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND' });

      const now = new Date();
      const updateData: any = {
        status: input.status,
        adminNotes: input.note || req.adminNotes,
        statusHistory: {
          create: [{
            fromStatus: req.status,
            toStatus: input.status,
            note: input.note || `Status changed to ${input.status}`,
            changedBy: ctx.userId,
          }],
        },
      };

      if (input.status === 'acknowledged' && !req.acknowledgedAt) {
        updateData.acknowledgedAt = now;
      }
      if (input.status === 'completed' && !req.completedAt) {
        updateData.completedAt = now;
      }

      return prisma.maintenanceRequest.update({
        where: { id: input.id },
        data: updateData,
        include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
      });
    }),

  // Get status timeline for a request
  timeline: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.hoaId) throw new TRPCError({ code: 'FORBIDDEN' });

      const req = await prisma.maintenanceRequest.findFirst({
        where: { id: input.id, hoaId: ctx.user.hoaId },
        include: { statusHistory: { orderBy: { createdAt: 'asc' } }, unit: true },
      });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND' });
      return req;
    }),
});
