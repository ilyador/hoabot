import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';
import Stripe from 'stripe';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const PLATFORM_FEE_PERCENT = parseFloat(process.env.STRIPE_PLATFORM_FEE_PERCENT || '2.5');

function getStripe(): Stripe {
  if (!STRIPE_SECRET || STRIPE_SECRET === 'sk_test_placeholder') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env to enable payments.',
    });
  }
  return new Stripe(STRIPE_SECRET);
}

export const stripeRouter = router({
  // Check if Stripe is configured
  status: adminProcedure.query(async ({ ctx }) => {
    const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
    const configured = !!STRIPE_SECRET && STRIPE_SECRET !== 'sk_test_placeholder';
    return {
      stripeConfigured: configured,
      accountConnected: !!hoa?.stripeConnectedAccountId,
      onboardingComplete: !!hoa?.stripeOnboardingComplete,
    };
  }),

  // Create Stripe Connect Express account and return onboarding URL
  createConnectAccount: adminProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe();
    const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
    if (!hoa) throw new TRPCError({ code: 'NOT_FOUND' });

    if (hoa.stripeConnectedAccountId) {
      // Already has an account, generate new onboarding link
      const accountLink = await stripe.accountLinks.create({
        account: hoa.stripeConnectedAccountId,
        refresh_url: `${process.env.VITE_API_URL || 'http://localhost:5174'}/settings?stripe=refresh`,
        return_url: `${process.env.VITE_API_URL || 'http://localhost:5174'}/settings?stripe=complete`,
        type: 'account_onboarding',
      });
      return { url: accountLink.url };
    }

    // Create new Express account
    const account = await stripe.accounts.create({
      type: 'express',
      business_type: 'company',
      company: { name: hoa.name },
      capabilities: {
        transfers: { requested: true },
        us_bank_account_ach_payments: { requested: true },
        card_payments: { requested: true },
      },
    });

    await prisma.hoa.update({
      where: { id: ctx.hoaId },
      data: { stripeConnectedAccountId: account.id },
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.VITE_API_URL || 'http://localhost:5174'}/settings?stripe=refresh`,
      return_url: `${process.env.VITE_API_URL || 'http://localhost:5174'}/settings?stripe=complete`,
      type: 'account_onboarding',
    });

    return { url: accountLink.url, accountId: account.id };
  }),

  // Check if onboarding is complete
  checkOnboarding: adminProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe();
    const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
    if (!hoa?.stripeConnectedAccountId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No Stripe account connected' });
    }

    const account = await stripe.accounts.retrieve(hoa.stripeConnectedAccountId);
    const complete = account.charges_enabled && account.payouts_enabled;

    if (complete && !hoa.stripeOnboardingComplete) {
      await prisma.hoa.update({
        where: { id: ctx.hoaId },
        data: { stripeOnboardingComplete: true },
      });
    }

    return {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      onboardingComplete: complete,
    };
  }),

  // Create a payment intent for an invoice
  createPayment: adminProcedure
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const stripe = getStripe();
      const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
      if (!hoa?.stripeConnectedAccountId || !hoa.stripeOnboardingComplete) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Stripe payments not set up for this HOA' });
      }

      const invoice = await prisma.invoice.findFirst({
        where: { id: input.invoiceId, hoaId: ctx.hoaId },
        include: { unit: true },
      });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      if (invoice.status === 'paid') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invoice already paid' });

      const totalAmount = invoice.amount + invoice.lateFeeAmount;
      const applicationFee = Math.round(totalAmount * (PLATFORM_FEE_PERCENT / 100));

      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: 'usd',
        payment_method_types: ['us_bank_account', 'card'],
        transfer_data: {
          destination: hoa.stripeConnectedAccountId,
        },
        application_fee_amount: applicationFee,
        metadata: {
          invoiceId: invoice.id,
          hoaId: ctx.hoaId,
          unitAddress: invoice.unit.address,
        },
      });

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { stripePaymentIntentId: paymentIntent.id },
      });

      return {
        clientSecret: paymentIntent.client_secret,
        amount: invoice.amount,
        description: invoice.description,
      };
    }),
});
