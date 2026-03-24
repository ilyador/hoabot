import { prisma } from '../server/src/db.js';
import { appRouter } from '../server/src/router.js';
import { hashPassword, signToken } from '../server/src/auth.js';
import type { Context } from '../server/src/trpc.js';

// Track all test entities for cleanup
const testUserIds: string[] = [];
const testHoaIds: string[] = [];

/**
 * Create a tRPC caller with the given context.
 * Uses createCallerFactory pattern from tRPC v11.
 */
export function createTestCaller(ctx: Context) {
  return appRouter.createCaller(ctx);
}

/**
 * Build a minimal mock Express req/res for tRPC context.
 */
function mockReqRes() {
  const cookies: Record<string, string> = {};
  const req = {
    cookies,
    headers: {} as Record<string, string>,
  } as any;
  const res = {
    cookie: (name: string, value: string) => { cookies[name] = value; },
    clearCookie: () => {},
  } as any;
  return { req, res };
}

/**
 * Create a caller with no auth (public context).
 */
export function publicCaller() {
  const { req, res } = mockReqRes();
  return createTestCaller({ req, res, userId: null, user: null });
}

/**
 * Create a test user in the DB and return an authed caller + user data.
 */
export async function createTestUser(overrides: { email?: string; name?: string; password?: string } = {}) {
  const email = overrides.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@hoabot-test.com`;
  const password = overrides.password ?? 'testpassword123';
  const name = overrides.name ?? 'Test User';

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: 'admin' },
  });
  testUserIds.push(user.id);

  const { req, res } = mockReqRes();
  const caller = createTestCaller({ req, res, userId: user.id, user });

  return { user, caller, email, password };
}

/**
 * Create a test HOA linked to a user. Sets trial status by default.
 */
export async function createTestHoa(userId: string, overrides: {
  name?: string;
  subscriptionStatus?: string;
  trialEndsAt?: Date | null;
} = {}) {
  const hoa = await prisma.hoa.create({
    data: {
      name: overrides.name ?? 'Test HOA',
      subscriptionStatus: overrides.subscriptionStatus ?? 'trialing',
      trialEndsAt: overrides.trialEndsAt !== undefined
        ? overrides.trialEndsAt
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  testHoaIds.push(hoa.id);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { hoaId: hoa.id },
  });

  return { hoa, user };
}

/**
 * Get a fresh authed caller for a user (re-fetches from DB for latest state).
 */
export async function callerForUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const { req, res } = mockReqRes();
  return createTestCaller({ req, res, userId: user.id, user });
}

/**
 * Directly set HOA subscription fields.
 */
export async function setHoaSubscription(hoaId: string, data: {
  subscriptionStatus?: string;
  trialEndsAt?: Date | null;
  subscriptionId?: string | null;
  stripeCustomerId?: string | null;
  currentPeriodEnd?: Date | null;
}) {
  return prisma.hoa.update({ where: { id: hoaId }, data });
}

/**
 * Clean up all test data created during tests.
 * Call in afterAll or afterEach.
 */
export async function cleanupTestData() {
  // Delete in reverse dependency order
  if (testHoaIds.length > 0) {
    // Unlink users from HOAs first
    await prisma.user.updateMany({
      where: { hoaId: { in: testHoaIds } },
      data: { hoaId: null },
    });
    await prisma.hoa.deleteMany({ where: { id: { in: testHoaIds } } });
    testHoaIds.length = 0;
  }
  if (testUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    testUserIds.length = 0;
  }
}

/**
 * Disconnect Prisma after all tests.
 */
export async function disconnectDb() {
  await prisma.$disconnect();
}
