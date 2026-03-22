import { z } from 'zod';
import { router, authedProcedure, adminProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';

export const hoaRouter = router({
  create: authedProcedure
    .input(z.object({
      name: z.string().min(1),
      address: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.hoaId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'User already has an HOA' });
      }

      const hoa = await prisma.hoa.create({
        data: {
          name: input.name,
          address: input.address,
        },
      });

      await prisma.user.update({
        where: { id: ctx.userId },
        data: { hoaId: hoa.id },
      });

      return hoa;
    }),

  get: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.hoaId) return null;
    return prisma.hoa.findUnique({ where: { id: ctx.user.hoaId } });
  }),

  update: adminProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      // Late fee settings
      lateFeeEnabled: z.boolean().optional(),
      lateFeeType: z.enum(['flat', 'percent']).optional(),
      lateFeeAmount: z.number().int().min(0).optional(),
      gracePeriodDays: z.number().int().min(0).max(90).optional(),
      // Billing schedule
      billingFrequency: z.enum(['monthly', 'quarterly', 'annual']).optional(),
      billingDayOfMonth: z.number().int().min(1).max(28).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { email: inputEmail, ...rest } = input;
      return prisma.hoa.update({
        where: { id: ctx.hoaId },
        data: { ...rest, email: inputEmail || null },
      });
    }),

  dashboard: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.hoaId) return null;
    const hoaId = ctx.user.hoaId;

    const [totalUnits, totalInvoices, paidInvoices, pendingInvoices, overdueInvoices, openViolations, openMaintenance, recentAnnouncements, totalDocuments, totalChatMessages] = await Promise.all([
      prisma.unit.count({ where: { hoaId } }),
      prisma.invoice.count({ where: { hoaId } }),
      prisma.invoice.count({ where: { hoaId, status: 'paid' } }),
      prisma.invoice.count({ where: { hoaId, status: 'pending' } }),
      prisma.invoice.count({ where: { hoaId, status: 'overdue' } }),
      prisma.violation.count({ where: { hoaId, status: { notIn: ['resolved'] } } }),
      prisma.maintenanceRequest.count({ where: { hoaId, status: { notIn: ['completed'] } } }),
      prisma.announcement.findMany({ where: { hoaId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.document.count({ where: { hoaId } }),
      prisma.chatMessage.count({ where: { hoaId } }),
    ]);

    const totalCollected = await prisma.invoice.aggregate({
      where: { hoaId, status: 'paid' },
      _sum: { amount: true },
    });

    const totalOutstanding = await prisma.invoice.aggregate({
      where: { hoaId, status: { in: ['pending', 'overdue'] } },
      _sum: { amount: true },
    });

    return {
      totalUnits,
      totalInvoices,
      paidInvoices,
      pendingInvoices,
      overdueInvoices,
      openViolations,
      openMaintenance,
      totalCollected: totalCollected._sum.amount || 0,
      totalOutstanding: totalOutstanding._sum.amount || 0,
      recentAnnouncements,
      totalDocuments,
      totalChatMessages,
    };
  }),
});
