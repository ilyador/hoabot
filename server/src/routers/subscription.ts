import { router, adminProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';
import Stripe from 'stripe';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const PRICE_ID = process.env.STRIPE_PRICE_ID || '';
const BASE_URL = process.env.VITE_API_URL || 'http://localhost:5174';
const TRIAL_DAYS = 30;

function getStripe(): Stripe {
  if (!STRIPE_SECRET || STRIPE_SECRET === 'sk_test_placeholder') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Stripe not configured' });
  }
  return new Stripe(STRIPE_SECRET);
}

export const subscriptionRouter = router({
  // Get subscription status
  status: adminProcedure.query(async ({ ctx }) => {
    const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
    if (!hoa) throw new TRPCError({ code: 'NOT_FOUND' });

    return {
      configured: !!PRICE_ID && !!STRIPE_SECRET && STRIPE_SECRET !== 'sk_test_placeholder',
      status: hoa.subscriptionStatus,
      subscriptionId: hoa.subscriptionId,
      trialEndsAt: hoa.trialEndsAt?.toISOString() || null,
      currentPeriodEnd: hoa.currentPeriodEnd?.toISOString() || null,
      hasPaymentMethod: !!hoa.stripeCustomerId,
    };
  }),

  // Create a checkout session to start subscription
  createCheckout: adminProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe();
    if (!PRICE_ID) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'STRIPE_PRICE_ID not configured' });

    const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
    if (!hoa) throw new TRPCError({ code: 'NOT_FOUND' });

    // If already has subscription, redirect to portal
    if (hoa.subscriptionId && hoa.subscriptionStatus !== 'canceled') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already subscribed. Use the billing portal to manage.' });
    }

    // Get or create Stripe customer
    let customerId = hoa.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: ctx.user.email,
        name: hoa.name,
        metadata: { hoaId: ctx.hoaId },
      });
      customerId = customer.id;
      await prisma.hoa.update({ where: { id: ctx.hoaId }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { hoaId: ctx.hoaId },
      },
      success_url: `${BASE_URL}/settings?subscription=success`,
      cancel_url: `${BASE_URL}/settings?subscription=cancelled`,
      metadata: { hoaId: ctx.hoaId },
    });

    return { url: session.url };
  }),

  // Get Stripe billing portal URL
  portalUrl: adminProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe();
    const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
    if (!hoa?.stripeCustomerId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No billing account found. Start a subscription first.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: hoa.stripeCustomerId,
      return_url: `${BASE_URL}/settings`,
    });

    return { url: session.url };
  }),
});

// Webhook handler — called from index.ts
export async function handleSubscriptionWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as any;
      const hoaId = sub.metadata?.hoaId;
      if (!hoaId) break;

      await prisma.hoa.update({
        where: { id: hoaId },
        data: {
          subscriptionId: sub.id,
          subscriptionStatus: sub.status,
          trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
        },
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as any;
      const hoaId = sub.metadata?.hoaId;
      if (!hoaId) break;

      await prisma.hoa.update({
        where: { id: hoaId },
        data: {
          subscriptionStatus: 'canceled',
          subscriptionId: null,
        },
      });
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as any;
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!subId) break;

      const hoa = await prisma.hoa.findFirst({ where: { subscriptionId: subId } });
      if (hoa) {
        await prisma.hoa.update({
          where: { id: hoa.id },
          data: { subscriptionStatus: 'active' },
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as any;
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!subId) break;

      const hoa = await prisma.hoa.findFirst({ where: { subscriptionId: subId } });
      if (hoa) {
        await prisma.hoa.update({
          where: { id: hoa.id },
          data: { subscriptionStatus: 'past_due' },
        });
      }
      break;
    }
  }
}
