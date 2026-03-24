import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { prisma } from '../server/src/db.js';
import {
  publicCaller,
  createTestUser,
  createTestHoa,
  callerForUser,
  cleanupTestData,
  disconnectDb,
} from './helpers.js';

afterEach(cleanupTestData);
afterAll(disconnectDb);

describe('auth.register', () => {
  it('creates a user with no hoaId', async () => {
    const caller = publicCaller();
    const email = `reg-${Date.now()}@hoabot-test.com`;
    const result = await caller.auth.register({
      email,
      password: 'testpassword123',
      name: 'New User',
    });

    expect(result.user.email).toBe(email);
    expect(result.user.name).toBe('New User');
    expect(result.user.role).toBe('admin');
    expect(result.user.hoaId).toBeNull();

    // Cleanup: manually track so afterEach can clean it
    await prisma.user.delete({ where: { id: result.user.id } });
  });

  it('rejects duplicate emails', async () => {
    const { email } = await createTestUser();
    const caller = publicCaller();

    await expect(
      caller.auth.register({ email, password: 'testpassword123', name: 'Dupe' })
    ).rejects.toThrow('already exists');
  });

  it('rejects short passwords', async () => {
    const caller = publicCaller();
    await expect(
      caller.auth.register({ email: `short-${Date.now()}@test.com`, password: 'short', name: 'Test' })
    ).rejects.toThrow();
  });
});

describe('auth.login', () => {
  it('authenticates valid credentials', async () => {
    const { email, password } = await createTestUser();
    const caller = publicCaller();
    const result = await caller.auth.login({ email, password });

    expect(result.user.email).toBe(email);
  });

  it('rejects wrong password', async () => {
    const { email } = await createTestUser();
    const caller = publicCaller();

    await expect(
      caller.auth.login({ email, password: 'wrongpassword' })
    ).rejects.toThrow('Invalid credentials');
  });

  it('rejects nonexistent email', async () => {
    const caller = publicCaller();
    await expect(
      caller.auth.login({ email: 'nobody@example.com', password: 'whatever' })
    ).rejects.toThrow('Invalid credentials');
  });
});

describe('auth.me', () => {
  it('returns user data for authenticated user', async () => {
    const { user, caller } = await createTestUser();
    const me = await caller.auth.me();

    expect(me.id).toBe(user.id);
    expect(me.email).toBe(user.email);
    expect(me.name).toBe(user.name);
    expect(me.hoaId).toBeNull();
    expect(me.subscriptionStatus).toBeNull();
    expect(me.trialEndsAt).toBeNull();
  });

  it('returns subscription status after HOA creation', async () => {
    const { user, caller } = await createTestUser();
    await createTestHoa(user.id);
    const freshCaller = await callerForUser(user.id);
    const me = await freshCaller.auth.me();

    expect(me.hoaId).toBeTruthy();
    expect(me.subscriptionStatus).toBe('trialing');
    expect(me.trialEndsAt).toBeTruthy();
  });
});
