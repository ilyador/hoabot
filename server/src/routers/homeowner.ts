import { z } from 'zod';
import { router, authedProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';

// Homeowner-scoped procedures: any authenticated user with an HOA
// can view their own data
export const homeownerRouter = router({
  // Get my unit(s) — matches on ownerEmail = user email
  myUnits: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.hoaId) return [];

    return prisma.unit.findMany({
      where: {
        hoaId: ctx.user.hoaId,
        OR: [
          { ownerEmail: ctx.user.email },
          { userId: ctx.userId },
        ],
      },
    });
  }),

  // My balance summary
  myBalance: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.hoaId) return null;

    const units = await prisma.unit.findMany({
      where: {
        hoaId: ctx.user.hoaId,
        OR: [
          { ownerEmail: ctx.user.email },
          { userId: ctx.userId },
        ],
      },
    });

    if (units.length === 0) return null;
    const unitIds = units.map(u => u.id);

    const invoices = await prisma.invoice.findMany({
      where: {
        hoaId: ctx.user.hoaId,
        unitId: { in: unitIds },
      },
      include: { unit: true },
      orderBy: { createdAt: 'desc' },
    });

    const totalDue = invoices
      .filter(i => i.status === 'pending' || i.status === 'overdue')
      .reduce((sum, i) => sum + i.amount + i.lateFeeAmount, 0);

    const totalPaid = invoices
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + i.amount + i.lateFeeAmount, 0);

    return {
      units,
      invoices,
      totalDue,
      totalPaid,
      overdueCount: invoices.filter(i => i.status === 'overdue').length,
    };
  }),

  // My violations
  myViolations: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.hoaId) return [];

    const units = await prisma.unit.findMany({
      where: {
        hoaId: ctx.user.hoaId,
        OR: [
          { ownerEmail: ctx.user.email },
          { userId: ctx.userId },
        ],
      },
    });
    if (units.length === 0) return [];

    return prisma.violation.findMany({
      where: {
        hoaId: ctx.user.hoaId,
        unitId: { in: units.map(u => u.id) },
      },
      include: { unit: true },
      orderBy: { createdAt: 'desc' },
    });
  }),

  // My maintenance requests
  myMaintenance: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.hoaId) return [];

    return prisma.maintenanceRequest.findMany({
      where: {
        hoaId: ctx.user.hoaId,
        submittedBy: ctx.userId,
      },
      include: { unit: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }),

  // Community announcements (all homeowners can see)
  announcements: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.hoaId) return [];

    return prisma.announcement.findMany({
      where: { hoaId: ctx.user.hoaId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }),

  // Community documents (all homeowners can view)
  documents: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.hoaId) return [];

    return prisma.document.findMany({
      where: { hoaId: ctx.user.hoaId },
      orderBy: { createdAt: 'desc' },
    });
  }),
});
