import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createTestUser,
  createTestHoa,
  callerForUser,
  setHoaSubscription,
  cleanupTestData,
  disconnectDb,
} from './helpers.js';

afterEach(cleanupTestData);
afterAll(disconnectDb);

describe('subscription.status', () => {
  it('returns subscription status for active trial', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id, {
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const caller = await callerForUser(user.id);
    const status = await caller.subscription.status();

    expect(status.status).toBe('trialing');
    expect(status.trialEndsAt).toBeTruthy();
    expect(status.subscriptionId).toBeNull();
  });

  it('is accessible even with expired trial (hoaAdminProcedure)', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'trial_expired',
      trialEndsAt: new Date(Date.now() - 86400000),
    });

    const caller = await callerForUser(user.id);
    // This should NOT throw — subscription endpoints use hoaAdminProcedure
    const status = await caller.subscription.status();
    expect(status.status).toBe('trial_expired');
  });

  it('is accessible with past_due status', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'past_due',
      trialEndsAt: null,
    });

    const caller = await callerForUser(user.id);
    const status = await caller.subscription.status();
    expect(status.status).toBe('past_due');
  });

  it('is accessible with canceled status', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'canceled',
      trialEndsAt: null,
    });

    const caller = await callerForUser(user.id);
    const status = await caller.subscription.status();
    expect(status.status).toBe('canceled');
  });
});

describe('subscription.createCheckout', () => {
  it('is accessible with expired trial (so user can subscribe)', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'trial_expired',
      trialEndsAt: new Date(Date.now() - 86400000),
    });

    const caller = await callerForUser(user.id);

    // createCheckout requires Stripe to be configured.
    // Without real Stripe keys, it throws PRECONDITION_FAILED, not FORBIDDEN.
    // The important thing is it does NOT throw FORBIDDEN (subscription gate).
    try {
      await caller.subscription.createCheckout();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      // PRECONDITION_FAILED = Stripe not configured (expected in test env)
      // FORBIDDEN would mean the subscription gate blocked us (bad)
      expect((err as TRPCError).code).not.toBe('FORBIDDEN');
      expect((err as TRPCError).code).toBe('PRECONDITION_FAILED');
    }
  });

  it('is NOT blocked by adminProcedure subscription check', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'canceled',
      trialEndsAt: null,
    });

    const caller = await callerForUser(user.id);

    try {
      await caller.subscription.createCheckout();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      // Should be Stripe config error, not subscription gate
      expect((err as TRPCError).code).not.toBe('FORBIDDEN');
    }
  });
});

describe('subscription.portalUrl', () => {
  it('is accessible with expired trial', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'trial_expired',
      trialEndsAt: new Date(Date.now() - 86400000),
    });

    const caller = await callerForUser(user.id);

    try {
      await caller.subscription.portalUrl();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      // BAD_REQUEST = no billing account (expected)
      // PRECONDITION_FAILED = Stripe not configured
      // NOT FORBIDDEN = subscription gate did not block
      expect((err as TRPCError).code).not.toBe('FORBIDDEN');
    }
  });
});

describe('subscription access control', () => {
  it('blocks non-admin users', async () => {
    const { user } = await createTestUser();
    const { prisma } = await import('../server/src/db.js');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'homeowner' } });
    await createTestHoa(user.id);

    const caller = await callerForUser(user.id);

    try {
      await caller.subscription.status();
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('FORBIDDEN');
      expect((err as TRPCError).message).toContain('Admin access required');
    }
  });

  it('blocks users without an HOA', async () => {
    const { caller } = await createTestUser();

    try {
      await caller.subscription.status();
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('FORBIDDEN');
      expect((err as TRPCError).message).toContain('No HOA');
    }
  });
});
