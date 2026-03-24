import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prisma } from '../server/src/db.js';
import {
  createTestUser,
  createTestHoa,
  callerForUser,
  cleanupTestData,
  disconnectDb,
} from './helpers.js';

afterEach(cleanupTestData);
afterAll(disconnectDb);

// hoa.update uses adminProcedure — use it to test subscription gating
const DUMMY_UPDATE = { name: 'Updated Name' };

describe('HOA creation starts trial', () => {
  it('sets subscriptionStatus to trialing and trialEndsAt to ~30 days out', async () => {
    const { user, caller } = await createTestUser();
    const result = await caller.hoa.create({ name: 'Trial Test HOA' });

    expect(result.subscriptionStatus).toBe('trialing');
    expect(result.trialEndsAt).toBeTruthy();

    const trialEnd = new Date(result.trialEndsAt!);
    const daysFromNow = (trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysFromNow).toBeGreaterThan(29);
    expect(daysFromNow).toBeLessThan(31);

    // Track for cleanup
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (updatedUser?.hoaId) {
      await prisma.user.update({ where: { id: user.id }, data: { hoaId: null } });
      await prisma.hoa.delete({ where: { id: updatedUser.hoaId } });
    }
  });
});

describe('active trial allows access', () => {
  it('adminProcedure allows requests with active trial', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id, {
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const caller = await callerForUser(user.id);
    // hoa.update uses adminProcedure — should succeed during active trial
    const updated = await caller.hoa.update(DUMMY_UPDATE);
    expect(updated.name).toBe('Updated Name');
  });

  it('read endpoints work during active trial', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const caller = await callerForUser(user.id);
    const hoa = await caller.hoa.get();
    expect(hoa).toBeTruthy();
    expect(hoa!.subscriptionStatus).toBe('trialing');
  });
});

describe('expired trial blocks access', () => {
  it('adminProcedure blocks when trial has expired', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date(Date.now() - 1000), // expired 1 second ago
    });

    const caller = await callerForUser(user.id);

    try {
      await caller.hoa.update(DUMMY_UPDATE);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('FORBIDDEN');
      expect((err as TRPCError).message).toContain('trial has ended');
    }
  });

  it('auto-transitions status from trialing to trial_expired in DB', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id, {
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date(Date.now() - 1000),
    });

    const caller = await callerForUser(user.id);

    // Trigger adminProcedure — will fail but auto-expire the trial
    try {
      await caller.hoa.update(DUMMY_UPDATE);
    } catch {
      // expected
    }

    const updated = await prisma.hoa.findUnique({ where: { id: hoa.id } });
    expect(updated!.subscriptionStatus).toBe('trial_expired');
  });

  it('me endpoint auto-expires trial and returns trial_expired status', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date(Date.now() - 1000),
    });

    const caller = await callerForUser(user.id);
    const me = await caller.auth.me();

    expect(me.subscriptionStatus).toBe('trial_expired');
  });

  it('trial_expired status stays blocked on subsequent requests', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'trial_expired',
      trialEndsAt: new Date(Date.now() - 86400000),
    });

    const caller = await callerForUser(user.id);

    try {
      await caller.hoa.update(DUMMY_UPDATE);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('FORBIDDEN');
    }
  });

  it('read endpoints still work when trial is expired (frontend handles gating)', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'trial_expired',
      trialEndsAt: new Date(Date.now() - 86400000),
    });

    const caller = await callerForUser(user.id);
    // hoa.get uses authedProcedure — should still work
    const hoa = await caller.hoa.get();
    expect(hoa).toBeTruthy();
  });
});

describe('active subscription allows access', () => {
  it('adminProcedure allows active subscription', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id, {
      subscriptionStatus: 'active',
      trialEndsAt: new Date(Date.now() - 86400000), // trial past, but sub is active
    });

    const caller = await callerForUser(user.id);
    const updated = await caller.hoa.update(DUMMY_UPDATE);
    expect(updated).toBeTruthy();
  });

  it('me endpoint returns active for active subscription', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'active',
      trialEndsAt: new Date(Date.now() - 86400000),
    });

    const caller = await callerForUser(user.id);
    const me = await caller.auth.me();
    expect(me.subscriptionStatus).toBe('active');
  });
});

describe('other blocked statuses', () => {
  it('past_due blocks adminProcedure', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'past_due',
      trialEndsAt: null,
    });

    const caller = await callerForUser(user.id);

    try {
      await caller.hoa.update(DUMMY_UPDATE);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('FORBIDDEN');
      expect((err as TRPCError).message).toContain('past due');
    }
  });

  it('canceled blocks adminProcedure', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id, {
      subscriptionStatus: 'canceled',
      trialEndsAt: null,
    });

    const caller = await callerForUser(user.id);

    try {
      await caller.hoa.update(DUMMY_UPDATE);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('FORBIDDEN');
      expect((err as TRPCError).message).toContain('inactive');
    }
  });

  it('none status is allowed (legacy/initial)', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id, {
      subscriptionStatus: 'none',
      trialEndsAt: null,
    });

    const caller = await callerForUser(user.id);
    const updated = await caller.hoa.update(DUMMY_UPDATE);
    expect(updated).toBeTruthy();
  });
});
