import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';
import { sendPaymentReminder, sendViolationNotice, sendAnnouncement, isEmailConfigured } from '../email.js';

export const emailRouter = router({
  status: adminProcedure.query(() => {
    return { configured: isEmailConfigured() };
  }),

  sendPaymentReminders: adminProcedure
    .input(z.object({
      invoiceIds: z.array(z.string()).optional(), // If empty, send for all overdue
    }).optional())
    .mutation(async ({ input, ctx }) => {
      const where: any = { hoaId: ctx.hoaId };
      if (input?.invoiceIds?.length) {
        where.id = { in: input.invoiceIds };
      } else {
        where.status = { in: ['pending', 'overdue'] };
      }

      const invoices = await prisma.invoice.findMany({
        where,
        include: { unit: true, hoa: true },
      });

      const results = [];
      for (const inv of invoices) {
        if (!inv.unit.ownerEmail) {
          results.push({ unit: inv.unit.address, sent: false, error: 'No email on file' });
          continue;
        }

        const result = await sendPaymentReminder(inv.unit.ownerEmail, {
          ownerName: inv.unit.ownerName || 'Homeowner',
          hoaName: inv.hoa.name,
          amount: inv.amount,
          dueDate: inv.dueDate.toISOString().split('T')[0],
          unitAddress: inv.unit.address,
        });
        results.push({ unit: inv.unit.address, ...result });
      }

      return results;
    }),

  sendViolationNotice: adminProcedure
    .input(z.object({ violationId: z.string(), noticeText: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const violation = await prisma.violation.findFirst({
        where: { id: input.violationId, hoaId: ctx.hoaId },
        include: { unit: true, hoa: true },
      });
      if (!violation) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!violation.unit.ownerEmail) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No email on file for this unit owner' });
      }

      const result = await sendViolationNotice(violation.unit.ownerEmail, {
        ownerName: violation.unit.ownerName || 'Homeowner',
        hoaName: violation.hoa.name,
        noticeText: input.noticeText,
      });

      if (result.sent) {
        await prisma.violation.update({
          where: { id: violation.id },
          data: { status: 'notice_sent' },
        });
      }

      return result;
    }),

  broadcastAnnouncement: adminProcedure
    .input(z.object({ announcementId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const announcement = await prisma.announcement.findFirst({
        where: { id: input.announcementId, hoaId: ctx.hoaId },
      });
      if (!announcement) throw new TRPCError({ code: 'NOT_FOUND' });

      const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
      const units = await prisma.unit.findMany({ where: { hoaId: ctx.hoaId } });
      const emails = units.map(u => u.ownerEmail).filter(Boolean) as string[];

      if (emails.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No owner emails on file' });
      }

      return sendAnnouncement(emails, {
        hoaName: hoa!.name,
        title: announcement.title,
        body: announcement.body,
      });
    }),
});
