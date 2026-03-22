import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';
import { pushInvoiceToXero, recordPaymentInXero } from '../xero.js';

/** Parse a YYYY-MM-DD string into a UTC midnight Date */
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'overdue', 'cancelled'],
  overdue: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

function assertTransition(current: string, target: string) {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed || !allowed.includes(target)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot transition from '${current}' to '${target}'` });
  }
}

export const invoicesRouter = router({
  list: adminProcedure
    .input(z.object({
      status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional(),
      unitId: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const where: any = { hoaId: ctx.hoaId };
      if (input?.status) where.status = input.status;
      if (input?.unitId) where.unitId = input.unitId;

      return prisma.invoice.findMany({
        where,
        include: { unit: true },
        orderBy: { dueDate: 'desc' },
      });
    }),

  create: adminProcedure
    .input(z.object({
      unitId: z.string(),
      amount: z.number().int().min(1),
      description: z.string().optional(),
      dueDate: z.string(),
      lineItems: z.array(z.object({
        description: z.string(),
        amount: z.number().int(),
        type: z.enum(['assessment', 'special_assessment', 'late_fee', 'fine', 'credit']).default('assessment'),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const unit = await prisma.unit.findFirst({ where: { id: input.unitId, hoaId: ctx.hoaId } });
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unit not found' });

      const invoice = await prisma.invoice.create({
        data: {
          hoaId: ctx.hoaId,
          unitId: input.unitId,
          amount: input.amount,
          description: input.description || 'Monthly HOA Dues',
          dueDate: parseDate(input.dueDate),
          lineItems: input.lineItems?.length ? {
            create: input.lineItems,
          } : {
            create: [{ description: input.description || 'Monthly HOA Dues', amount: input.amount, type: 'assessment' }],
          },
        },
        include: { lineItems: true },
      });

      // Auto-sync to Xero (non-blocking)
      pushInvoiceToXero(ctx.hoaId, invoice).catch(() => {});

      return invoice;
    }),

  generateBulk: adminProcedure
    .input(z.object({
      description: z.string().optional(),
      dueDate: z.string(),
      billingPeriod: z.string().optional(), // e.g. "2026-03"
    }))
    .mutation(async ({ input, ctx }) => {
      const units = await prisma.unit.findMany({
        where: { hoaId: ctx.hoaId, monthlyDues: { gt: 0 } },
      });

      if (units.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No units with dues configured' });
      }

      const dueDate = parseDate(input.dueDate);
      const billingPeriod = input.billingPeriod || `${dueDate.getUTCFullYear()}-${String(dueDate.getUTCMonth() + 1).padStart(2, '0')}`;

      // Check for duplicate billing period
      const existing = await prisma.invoice.count({
        where: { hoaId: ctx.hoaId, billingPeriod },
      });
      if (existing > 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Invoices already exist for billing period ${billingPeriod}. Delete existing invoices first or use a different period.` });
      }

      let count = 0;
      for (const unit of units) {
        await prisma.invoice.create({
          data: {
            hoaId: ctx.hoaId,
            unitId: unit.id,
            amount: unit.monthlyDues,
            description: input.description || 'Monthly HOA Dues',
            dueDate,
            billingPeriod,
            lineItems: {
              create: [{ description: input.description || 'Monthly HOA Dues', amount: unit.monthlyDues, type: 'assessment' }],
            },
          },
        });
        count++;
      }

      // Update last billing date
      await prisma.hoa.update({ where: { id: ctx.hoaId }, data: { lastBillingDate: new Date() } });

      return { count, billingPeriod };
    }),

  // Get account ledger for a unit
  unitLedger: adminProcedure
    .input(z.object({ unitId: z.string() }))
    .query(async ({ input, ctx }) => {
      const unit = await prisma.unit.findFirst({ where: { id: input.unitId, hoaId: ctx.hoaId } });
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND' });

      const invoices = await prisma.invoice.findMany({
        where: { hoaId: ctx.hoaId, unitId: input.unitId, status: { not: 'cancelled' } },
        include: { lineItems: true },
        orderBy: { createdAt: 'asc' },
      });

      // Build ledger entries with running balance
      let balance = 0;
      const entries: { date: string; description: string; charges: number; payments: number; balance: number; invoiceId: string; type: string }[] = [];

      for (const inv of invoices) {
        // Charge entry
        const totalCharge = inv.amount + inv.lateFeeAmount;
        balance += totalCharge;
        entries.push({
          date: inv.createdAt.toISOString().split('T')[0],
          description: inv.description + (inv.billingPeriod ? ` (${inv.billingPeriod})` : ''),
          charges: totalCharge,
          payments: 0,
          balance,
          invoiceId: inv.id,
          type: 'charge',
        });

        // Payment entry (if paid)
        if (inv.status === 'paid' && inv.paidAt) {
          balance -= totalCharge;
          entries.push({
            date: inv.paidAt.toISOString().split('T')[0],
            description: `Payment - Invoice #${inv.invoiceNumber}`,
            charges: 0,
            payments: totalCharge,
            balance,
            invoiceId: inv.id,
            type: 'payment',
          });
        }
      }

      return {
        unit: { id: unit.id, address: unit.address, ownerName: unit.ownerName, lotNumber: unit.lotNumber },
        entries,
        currentBalance: balance,
        totalCharges: entries.filter(e => e.type === 'charge').reduce((s, e) => s + e.charges, 0),
        totalPayments: entries.filter(e => e.type === 'payment').reduce((s, e) => s + e.payments, 0),
      };
    }),

  // Apply late fees to overdue invoices
  applyLateFees: adminProcedure
    .mutation(async ({ ctx }) => {
      const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
      if (!hoa || !hoa.lateFeeEnabled) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Late fees not enabled. Configure in Settings.' });
      }

      const now = new Date();
      const graceCutoff = new Date(now.getTime() - hoa.gracePeriodDays * 24 * 60 * 60 * 1000);

      // Find overdue invoices that haven't had late fees applied yet
      const overdueInvoices = await prisma.invoice.findMany({
        where: {
          hoaId: ctx.hoaId,
          status: { in: ['pending', 'overdue'] },
          dueDate: { lt: graceCutoff },
          lateFeeApplied: false,
        },
      });

      let applied = 0;
      for (const inv of overdueInvoices) {
        const lateFee = hoa.lateFeeType === 'percent'
          ? Math.round(inv.amount * hoa.lateFeeAmount / 10000) // basis points
          : hoa.lateFeeAmount; // flat cents

        await prisma.invoice.update({
          where: { id: inv.id },
          data: {
            status: 'overdue',
            lateFeeApplied: true,
            lateFeeAmount: lateFee,
            lineItems: {
              create: [{ description: `Late Fee (${hoa.lateFeeType === 'percent' ? `${hoa.lateFeeAmount / 100}%` : `$${(hoa.lateFeeAmount / 100).toFixed(2)}`})`, amount: lateFee, type: 'late_fee' }],
            },
          },
        });
        applied++;
      }

      return { applied, total: overdueInvoices.length };
    }),

  markPaid: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const invoice = await prisma.invoice.findFirst({ where: { id: input.id, hoaId: ctx.hoaId } });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      assertTransition(invoice.status, 'paid');

      const updated = await prisma.invoice.update({
        where: { id: input.id },
        data: { status: 'paid', paidAt: new Date() },
      });

      // Auto-sync payment to Xero (non-blocking)
      recordPaymentInXero(ctx.hoaId, updated).catch(() => {});

      return updated;
    }),

  markOverdue: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const invoice = await prisma.invoice.findFirst({ where: { id: input.id, hoaId: ctx.hoaId } });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      assertTransition(invoice.status, 'overdue');

      return prisma.invoice.update({
        where: { id: input.id },
        data: { status: 'overdue' },
      });
    }),

  cancel: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const invoice = await prisma.invoice.findFirst({ where: { id: input.id, hoaId: ctx.hoaId } });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      assertTransition(invoice.status, 'cancelled');

      return prisma.invoice.update({
        where: { id: input.id },
        data: { status: 'cancelled' },
      });
    }),
});
