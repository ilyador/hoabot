import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';
import { createXeroClient, isXeroConfigured, getXeroClientForHoa, syncContactToXero, pushInvoiceToXero } from '../xero.js';

export const xeroRouter = router({
  // Check Xero configuration status
  status: adminProcedure.query(async ({ ctx }) => {
    const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
    return {
      configured: isXeroConfigured(),
      connected: !!hoa?.xeroConnected,
      tenantId: hoa?.xeroTenantId || null,
    };
  }),

  // Get Xero authorization URL
  connectUrl: adminProcedure.mutation(async ({ ctx }) => {
    if (!isXeroConfigured()) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Xero is not configured. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET in .env.' });
    }

    const xero = createXeroClient();
    const consentUrl = await xero.buildConsentUrl();

    // Store hoaId in state param for callback
    const url = new URL(consentUrl);
    url.searchParams.set('state', ctx.hoaId);

    return { url: url.toString() };
  }),

  // Disconnect Xero
  disconnect: adminProcedure.mutation(async ({ ctx }) => {
    await prisma.hoa.update({
      where: { id: ctx.hoaId },
      data: { xeroConnected: false, xeroTokenSet: null, xeroTenantId: null },
    });
    return { success: true };
  }),

  // Sync all contacts (unit owners) to Xero
  syncContacts: adminProcedure.mutation(async ({ ctx }) => {
    const client = await getXeroClientForHoa(ctx.hoaId);
    if (!client) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Xero not connected' });

    const units = await prisma.unit.findMany({ where: { hoaId: ctx.hoaId } });
    let synced = 0;
    let failed = 0;

    for (const unit of units) {
      try {
        await syncContactToXero(ctx.hoaId, unit);
        synced++;
      } catch (err) {
        failed++;
      }
    }

    return { synced, failed, total: units.length };
  }),

  // Sync all unsyced invoices to Xero
  syncInvoices: adminProcedure.mutation(async ({ ctx }) => {
    const client = await getXeroClientForHoa(ctx.hoaId);
    if (!client) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Xero not connected' });

    const invoices = await prisma.invoice.findMany({
      where: { hoaId: ctx.hoaId, xeroInvoiceId: null, status: { not: 'cancelled' } },
      include: { lineItems: true },
    });

    let synced = 0;
    let failed = 0;

    for (const inv of invoices) {
      try {
        await pushInvoiceToXero(ctx.hoaId, inv);
        synced++;
      } catch (err) {
        failed++;
      }
    }

    return { synced, failed, total: invoices.length };
  }),
});
