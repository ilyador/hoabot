# Multi-User Invite Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow HOA admins to invite board members and homeowners, with DB-backed invite tokens, email delivery, and a member management page.

**Architecture:** New `Invite` Prisma model with token-based invites. New `members` tRPC router for invite CRUD and member removal. Two new auth endpoints for public invite validation/registration. `JoinPage` for invite acceptance, `MembersPage` for admin management. All gated by `adminProcedure`.

**Tech Stack:** Prisma 6, tRPC v11, React 19, Resend email, Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-multi-user-invite-flow-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `prisma/schema.prisma` | Add Unit-User relation, InviteStatus enum, Invite model |
| Create | `server/src/routers/members.ts` | Members router: invite, listInvites, revokeInvite, resendInvite, list, remove |
| Modify | `server/src/routers/auth.ts` | Add validateInvite and registerWithInvite public endpoints |
| Modify | `server/src/router.ts` | Register members router |
| Modify | `server/src/email.ts` | Add sendInviteEmail function |
| Create | `web/src/pages/JoinPage.tsx` | Public invite acceptance page |
| Create | `web/src/pages/MembersPage.tsx` | Admin member management page |
| Modify | `web/src/App.tsx` | Add /join/:token public route, /members authed route |
| Modify | `web/src/components/Layout.tsx` | Add Members nav item, role-gated |
| Modify | `tests/helpers.ts` | Add createTestUnit, createTestInvite helpers, track invites for cleanup |
| Create | `tests/members.test.ts` | Integration tests for invite flow, member management |

---

### Task 1: Schema — Formalize Unit-User relation

**Files:**
- Modify: `prisma/schema.prisma:10-22` (User model)
- Modify: `prisma/schema.prisma:69-89` (Unit model)

- [ ] **Step 1: Add User.units relation and Unit.user relation**

In `prisma/schema.prisma`, add to the User model (after `updatedAt`, before `@@index`):

```prisma
  units        Unit[]
```

In the Unit model, add after `userId String?`:

```prisma
  user       User?    @relation(fields: [userId], references: [id])
```

- [ ] **Step 2: Push schema to DB**

Run: `pnpm db:push`
Expected: Schema pushed successfully, no data loss warnings (adding optional relation to existing field).

- [ ] **Step 3: Generate Prisma client**

Run: `pnpm db:generate`
Expected: Prisma Client generated successfully.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: formalize Unit-User relation with proper FK"
```

---

### Task 2: Schema — Add InviteStatus enum and Invite model

**Files:**
- Modify: `prisma/schema.prisma` (add enum after Role, add model after Hoa, add relations)

- [ ] **Step 1: Add InviteStatus enum**

Add after the `Role` enum block (after line 28):

```prisma
enum InviteStatus {
  pending
  accepted
  revoked
}
```

- [ ] **Step 2: Add Invite model**

Add after the Hoa model's closing brace (after line 67):

```prisma
model Invite {
  id         String       @id @default(uuid())
  hoaId      String
  hoa        Hoa          @relation(fields: [hoaId], references: [id], onDelete: Cascade)
  email      String
  role       Role
  unitId     String?
  unit       Unit?        @relation(fields: [unitId], references: [id])
  token      String       @unique
  status     InviteStatus @default(pending)
  invitedBy  String
  inviter    User         @relation("InvitedBy", fields: [invitedBy], references: [id])
  expiresAt  DateTime
  acceptedAt DateTime?
  createdAt  DateTime     @default(now())

  @@index([hoaId])
  @@index([email, hoaId])
}
```

- [ ] **Step 3: Add relation arrays to existing models**

Add to Hoa model (after `maintenanceRequests`):
```prisma
  invites                Invite[]
```

Add to Unit model (after `maintenanceRequests`):
```prisma
  invites   Invite[]
```

Add to User model (after `updatedAt`, before `units`):
```prisma
  invitedMembers Invite[] @relation("InvitedBy")
```

- [ ] **Step 4: Push schema and generate client**

Run: `pnpm db:push && pnpm db:generate`
Expected: Both succeed. New table `Invite` created.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add InviteStatus enum and Invite model"
```

---

### Task 3: Invite email helper

**Files:**
- Modify: `server/src/email.ts`

- [ ] **Step 1: Add sendInviteEmail function**

Add at the end of `server/src/email.ts`:

```typescript
export async function sendInviteEmail(to: string, data: {
  hoaName: string;
  role: string;
  inviterName: string;
  joinUrl: string;
  unitAddress?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: 'Email not configured (set RESEND_API_KEY)' };

  const roleLabel = data.role === 'board_member' ? 'Board Member' : 'Homeowner';
  const unitLine = data.unitAddress
    ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Unit</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(data.unitAddress)}</td></tr>`
    : '';

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `You're invited to ${data.hoaName} on HOABot`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">You've been invited!</h2>
          <p>${escapeHtml(data.inviterName)} has invited you to join <strong>${escapeHtml(data.hoaName)}</strong> as a <strong>${roleLabel}</strong>.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">HOA</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${escapeHtml(data.hoaName)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Role</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${roleLabel}</td></tr>
            ${unitLine}
          </table>
          <p><a href="${escapeHtml(data.joinUrl)}" style="display: inline-block; padding: 12px 24px; background: #4A5D3F; color: #fff; text-decoration: none; border-radius: 4px; font-weight: 600;">Accept Invitation</a></p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">This invite expires in 30 days. If you didn't expect this, you can safely ignore it.</p>
        </div>
      `,
    });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message || 'Failed to send email' };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/email.ts
git commit -m "feat: add sendInviteEmail helper"
```

---

### Task 4: Members router

**Files:**
- Create: `server/src/routers/members.ts`
- Modify: `server/src/router.ts`

- [ ] **Step 1: Create members router**

Create `server/src/routers/members.ts`:

```typescript
import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'crypto';
import { sendInviteEmail } from '../email.js';

const INVITE_EXPIRY_DAYS = 30;
const BASE_URL = process.env.VITE_API_URL || 'http://localhost:5174';

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export const membersRouter = router({
  invite: adminProcedure
    .input(z.object({
      email: z.string().email(),
      role: z.enum(['board_member', 'homeowner']),
      unitId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.role === 'homeowner' && !input.unitId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unit is required for homeowner invites' });
      }

      if (input.unitId) {
        const unit = await prisma.unit.findUnique({ where: { id: input.unitId } });
        if (!unit || unit.hoaId !== ctx.hoaId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unit not found in this HOA' });
        }
        if (unit.userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This unit already has an owner assigned' });
        }
      }

      // Check for existing pending (non-expired) invite
      const existing = await prisma.invite.findFirst({
        where: {
          email: input.email,
          hoaId: ctx.hoaId,
          status: 'pending',
          expiresAt: { gt: new Date() },
        },
      });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Pending invite already exists — revoke it first or resend' });
      }

      const token = generateToken();
      const invite = await prisma.invite.create({
        data: {
          hoaId: ctx.hoaId,
          email: input.email,
          role: input.role,
          unitId: input.unitId || null,
          token,
          invitedBy: ctx.userId,
          expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      const link = `${BASE_URL}/join/${token}`;
      const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
      const unit = input.unitId ? await prisma.unit.findUnique({ where: { id: input.unitId } }) : null;

      const emailResult = await sendInviteEmail(input.email, {
        hoaName: hoa!.name,
        role: input.role,
        inviterName: ctx.user.name,
        joinUrl: link,
        unitAddress: unit?.address,
      });

      return { invite, link, emailSent: emailResult.sent, emailError: emailResult.error };
    }),

  listInvites: adminProcedure.query(async ({ ctx }) => {
    const invites = await prisma.invite.findMany({
      where: { hoaId: ctx.hoaId },
      orderBy: { createdAt: 'desc' },
      include: {
        unit: { select: { address: true } },
        inviter: { select: { name: true } },
      },
    });

    return invites.map(inv => ({
      ...inv,
      effectiveStatus: inv.status === 'pending' && inv.expiresAt < new Date() ? 'expired' : inv.status,
    }));
  }),

  revokeInvite: adminProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const invite = await prisma.invite.findUnique({ where: { id: input.inviteId } });
      if (!invite || invite.hoaId !== ctx.hoaId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      }
      return prisma.invite.update({
        where: { id: input.inviteId },
        data: { status: 'revoked' },
      });
    }),

  resendInvite: adminProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const invite = await prisma.invite.findUnique({ where: { id: input.inviteId } });
      if (!invite || invite.hoaId !== ctx.hoaId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      }
      if (invite.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only resend pending invites' });
      }
      if (invite.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite has expired — create a new one' });
      }

      const newToken = generateToken();
      const updated = await prisma.invite.update({
        where: { id: input.inviteId },
        data: {
          token: newToken,
          expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      const link = `${BASE_URL}/join/${newToken}`;
      const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
      const unit = invite.unitId ? await prisma.unit.findUnique({ where: { id: invite.unitId } }) : null;

      const emailResult = await sendInviteEmail(invite.email, {
        hoaName: hoa!.name,
        role: invite.role,
        inviterName: ctx.user.name,
        joinUrl: link,
        unitAddress: unit?.address,
      });

      return { invite: updated, link, emailSent: emailResult.sent };
    }),

  list: adminProcedure.query(async ({ ctx }) => {
    return prisma.user.findMany({
      where: { hoaId: ctx.hoaId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }),

  remove: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot remove yourself' });
      }
      const target = await prisma.user.findUnique({ where: { id: input.userId } });
      if (!target || target.hoaId !== ctx.hoaId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found in this HOA' });
      }

      await prisma.unit.updateMany({
        where: { userId: input.userId, hoaId: ctx.hoaId },
        data: { userId: null },
      });

      await prisma.user.update({
        where: { id: input.userId },
        data: { hoaId: null, role: 'admin' },
      });

      return { success: true };
    }),
});
```

- [ ] **Step 2: Register members router in router.ts**

In `server/src/router.ts`, add the import:

```typescript
import { membersRouter } from './routers/members.js';
```

Add to the router object:

```typescript
  members: membersRouter,
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routers/members.ts server/src/router.ts
git commit -m "feat: add members router with invite CRUD and member removal"
```

---

### Task 5: Auth router — validateInvite and registerWithInvite

**Files:**
- Modify: `server/src/routers/auth.ts`

- [ ] **Step 1: Add validateInvite endpoint**

Add to the authRouter object in `server/src/routers/auth.ts` (after the `me` endpoint):

```typescript
  validateInvite: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const invite = await prisma.invite.findUnique({
        where: { token: input.token },
        include: { hoa: { select: { name: true } }, unit: { select: { address: true } } },
      });
      if (!invite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      }
      if (invite.status === 'accepted') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has already been used' });
      }
      if (invite.status === 'revoked') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has been revoked' });
      }
      if (invite.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has expired' });
      }

      return {
        email: invite.email,
        role: invite.role,
        hoaName: invite.hoa.name,
        unitAddress: invite.unit?.address ?? null,
      };
    }),

  registerWithInvite: publicProcedure
    .input(z.object({
      token: z.string(),
      name: z.string().min(1),
      password: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      const invite = await prisma.invite.findUnique({ where: { token: input.token } });
      if (!invite || invite.status !== 'pending' || invite.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite is no longer valid' });
      }

      const existing = await prisma.user.findUnique({ where: { email: invite.email } });
      let user;

      if (existing) {
        if (existing.hoaId && existing.hoaId !== invite.hoaId) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This email is already associated with another HOA' });
        }
        if (existing.hoaId === invite.hoaId) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This user is already a member of this HOA' });
        }
        // Previously removed user (null hoaId) — re-link
        user = await prisma.user.update({
          where: { id: existing.id },
          data: { hoaId: invite.hoaId, role: invite.role },
        });
      } else {
        const passwordHash = await hashPassword(input.password);
        user = await prisma.user.create({
          data: {
            email: invite.email,
            passwordHash,
            name: input.name,
            role: invite.role,
            hoaId: invite.hoaId,
          },
        });
      }

      if (invite.unitId) {
        await prisma.unit.update({
          where: { id: invite.unitId },
          data: { userId: user.id },
        });
      }

      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      });

      const token = signToken(user.id);
      ctx.res.cookie('token', token, cookieOptions());

      return { user: { id: user.id, email: user.email, name: user.name, role: user.role, hoaId: user.hoaId } };
    }),
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routers/auth.ts
git commit -m "feat: add validateInvite and registerWithInvite auth endpoints"
```

---

### Task 6: Test helpers and integration tests

**Files:**
- Modify: `tests/helpers.ts`
- Create: `tests/members.test.ts`

- [ ] **Step 1: Add test helpers**

Add to `tests/helpers.ts` — new tracking array and helpers:

Add `testInviteIds` tracking array alongside existing ones:
```typescript
const testInviteIds: string[] = [];
```

Add `createTestUnit` helper:
```typescript
export async function createTestUnit(hoaId: string, overrides: { address?: string; userId?: string | null } = {}) {
  const unit = await prisma.unit.create({
    data: {
      hoaId,
      address: overrides.address ?? `${Math.floor(Math.random() * 9999)} Test Street`,
      userId: overrides.userId ?? null,
    },
  });
  return unit;
}
```

Add `createTestInvite` helper:
```typescript
export async function createTestInvite(hoaId: string, invitedBy: string, overrides: {
  email?: string;
  role?: 'board_member' | 'homeowner';
  unitId?: string;
  status?: 'pending' | 'accepted' | 'revoked';
  expiresAt?: Date;
} = {}) {
  const { randomBytes } = await import('crypto');
  const invite = await prisma.invite.create({
    data: {
      hoaId,
      email: overrides.email ?? `invite-${Date.now()}@hoabot-test.com`,
      role: overrides.role ?? 'board_member',
      unitId: overrides.unitId ?? null,
      token: randomBytes(32).toString('base64url'),
      status: overrides.status ?? 'pending',
      invitedBy,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  testInviteIds.push(invite.id);
  return invite;
}
```

Update `cleanupTestData` to also clean invites (add before the HOA cleanup):
```typescript
  if (testInviteIds.length > 0) {
    await prisma.invite.deleteMany({ where: { id: { in: testInviteIds } } });
    testInviteIds.length = 0;
  }
```

Also add invite cleanup inside the HOA block (before deleting HOAs):
```typescript
    await prisma.invite.deleteMany({ where: { hoaId: { in: testHoaIds } } });
```

And add unit userId cleanup (before unlinking users from HOAs):
```typescript
    await prisma.unit.updateMany({ where: { hoaId: { in: testHoaIds } }, data: { userId: null } });
```

- [ ] **Step 2: Create members integration tests**

Create `tests/members.test.ts`:

```typescript
import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prisma } from '../server/src/db.js';
import {
  publicCaller,
  createTestUser,
  createTestHoa,
  createTestUnit,
  createTestInvite,
  callerForUser,
  cleanupTestData,
  disconnectDb,
} from './helpers.js';

afterEach(cleanupTestData);
afterAll(disconnectDb);

describe('members.invite', () => {
  it('creates a board_member invite with link', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id);
    const caller = await callerForUser(user.id);

    const result = await caller.members.invite({
      email: 'board@test.com',
      role: 'board_member',
    });

    expect(result.invite.email).toBe('board@test.com');
    expect(result.invite.role).toBe('board_member');
    expect(result.invite.status).toBe('pending');
    expect(result.link).toContain('/join/');
  });

  it('creates a homeowner invite linked to a unit', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const unit = await createTestUnit(hoa.id);
    const caller = await callerForUser(user.id);

    const result = await caller.members.invite({
      email: 'owner@test.com',
      role: 'homeowner',
      unitId: unit.id,
    });

    expect(result.invite.unitId).toBe(unit.id);
    expect(result.invite.role).toBe('homeowner');
  });

  it('rejects homeowner invite without unitId', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id);
    const caller = await callerForUser(user.id);

    await expect(
      caller.members.invite({ email: 'no-unit@test.com', role: 'homeowner' })
    ).rejects.toThrow('Unit is required');
  });

  it('rejects invite if unit already has an owner', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const unit = await createTestUnit(hoa.id, { userId: user.id });
    const caller = await callerForUser(user.id);

    await expect(
      caller.members.invite({ email: 'dup@test.com', role: 'homeowner', unitId: unit.id })
    ).rejects.toThrow('already has an owner');
  });

  it('rejects duplicate pending invite', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const caller = await callerForUser(user.id);

    await caller.members.invite({ email: 'dup@test.com', role: 'board_member' });
    await expect(
      caller.members.invite({ email: 'dup@test.com', role: 'board_member' })
    ).rejects.toThrow('Pending invite already exists');
  });
});

describe('members.revokeInvite', () => {
  it('revokes a pending invite', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const invite = await createTestInvite(hoa.id, user.id);
    const caller = await callerForUser(user.id);

    const result = await caller.members.revokeInvite({ inviteId: invite.id });
    expect(result.status).toBe('revoked');
  });
});

describe('members.resendInvite', () => {
  it('generates new token and resets expiry', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const invite = await createTestInvite(hoa.id, user.id);
    const oldToken = invite.token;
    const caller = await callerForUser(user.id);

    const result = await caller.members.resendInvite({ inviteId: invite.id });
    expect(result.invite.token).not.toBe(oldToken);
    expect(new Date(result.invite.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('members.listInvites', () => {
  it('computes expired effective status', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    await createTestInvite(hoa.id, user.id, {
      expiresAt: new Date(Date.now() - 1000), // expired
    });
    const caller = await callerForUser(user.id);

    const invites = await caller.members.listInvites();
    expect(invites[0].effectiveStatus).toBe('expired');
    expect(invites[0].status).toBe('pending'); // DB still says pending
  });
});

describe('members.remove', () => {
  it('removes a member and unlinks their units', async () => {
    const { user: admin } = await createTestUser();
    const { hoa } = await createTestHoa(admin.id);
    const { user: member } = await createTestUser();
    await prisma.user.update({ where: { id: member.id }, data: { hoaId: hoa.id, role: 'board_member' } });
    const unit = await createTestUnit(hoa.id, { userId: member.id });

    const caller = await callerForUser(admin.id);
    await caller.members.remove({ userId: member.id });

    const updated = await prisma.user.findUnique({ where: { id: member.id } });
    expect(updated!.hoaId).toBeNull();
    const updatedUnit = await prisma.unit.findUnique({ where: { id: unit.id } });
    expect(updatedUnit!.userId).toBeNull();
  });

  it('admin cannot remove themselves', async () => {
    const { user } = await createTestUser();
    await createTestHoa(user.id);
    const caller = await callerForUser(user.id);

    await expect(
      caller.members.remove({ userId: user.id })
    ).rejects.toThrow('cannot remove yourself');
  });
});

describe('auth.validateInvite', () => {
  it('returns invite details for valid token', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const invite = await createTestInvite(hoa.id, user.id, { email: 'valid@test.com' });
    const caller = publicCaller();

    const result = await caller.auth.validateInvite({ token: invite.token });
    expect(result.email).toBe('valid@test.com');
    expect(result.hoaName).toBe('Test HOA');
  });

  it('rejects expired token', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const invite = await createTestInvite(hoa.id, user.id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const caller = publicCaller();

    await expect(
      caller.auth.validateInvite({ token: invite.token })
    ).rejects.toThrow('expired');
  });

  it('rejects revoked token', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const invite = await createTestInvite(hoa.id, user.id, { status: 'revoked' });
    const caller = publicCaller();

    await expect(
      caller.auth.validateInvite({ token: invite.token })
    ).rejects.toThrow('revoked');
  });

  it('rejects used token', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const invite = await createTestInvite(hoa.id, user.id, { status: 'accepted' });
    const caller = publicCaller();

    await expect(
      caller.auth.validateInvite({ token: invite.token })
    ).rejects.toThrow('already been used');
  });
});

describe('auth.registerWithInvite', () => {
  it('creates user with correct role and hoaId', async () => {
    const { user: admin } = await createTestUser();
    const { hoa } = await createTestHoa(admin.id);
    const invite = await createTestInvite(hoa.id, admin.id, {
      email: 'newmember@test.com',
      role: 'board_member',
    });
    const caller = publicCaller();

    const result = await caller.auth.registerWithInvite({
      token: invite.token,
      name: 'New Member',
      password: 'testpassword123',
    });

    expect(result.user.email).toBe('newmember@test.com');
    expect(result.user.role).toBe('board_member');
    expect(result.user.hoaId).toBe(hoa.id);

    // Cleanup
    await prisma.user.delete({ where: { id: result.user.id } });
  });

  it('links unit for homeowner invite', async () => {
    const { user: admin } = await createTestUser();
    const { hoa } = await createTestHoa(admin.id);
    const unit = await createTestUnit(hoa.id);
    const invite = await createTestInvite(hoa.id, admin.id, {
      email: 'homeowner@test.com',
      role: 'homeowner',
      unitId: unit.id,
    });
    const caller = publicCaller();

    const result = await caller.auth.registerWithInvite({
      token: invite.token,
      name: 'Home Owner',
      password: 'testpassword123',
    });

    const updatedUnit = await prisma.unit.findUnique({ where: { id: unit.id } });
    expect(updatedUnit!.userId).toBe(result.user.id);

    await prisma.unit.update({ where: { id: unit.id }, data: { userId: null } });
    await prisma.user.delete({ where: { id: result.user.id } });
  });

  it('re-links a previously removed user', async () => {
    const { user: admin } = await createTestUser();
    const { hoa } = await createTestHoa(admin.id);
    // Create a "removed" user (has account but no hoaId)
    const { user: removed } = await createTestUser({ email: 'removed@test.com' });
    const invite = await createTestInvite(hoa.id, admin.id, {
      email: 'removed@test.com',
      role: 'board_member',
    });
    const caller = publicCaller();

    const result = await caller.auth.registerWithInvite({
      token: invite.token,
      name: 'Re-linked',
      password: 'testpassword123',
    });

    expect(result.user.id).toBe(removed.id); // same user, re-linked
    expect(result.user.hoaId).toBe(hoa.id);
    expect(result.user.role).toBe('board_member');
  });

  it('rejects if email belongs to another HOA', async () => {
    const { user: admin1 } = await createTestUser();
    const { hoa: hoa1 } = await createTestHoa(admin1.id);

    const { user: admin2 } = await createTestUser({ email: 'other-hoa@test.com' });
    const { hoa: hoa2 } = await createTestHoa(admin2.id, { name: 'Other HOA' });

    const invite = await createTestInvite(hoa1.id, admin1.id, {
      email: 'other-hoa@test.com',
    });
    const caller = publicCaller();

    await expect(
      caller.auth.registerWithInvite({ token: invite.token, name: 'X', password: 'testpassword123' })
    ).rejects.toThrow('already associated with another HOA');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All new tests pass alongside existing 39 tests.

- [ ] **Step 4: Commit**

```bash
git add tests/helpers.ts tests/members.test.ts
git commit -m "test: add integration tests for invite flow and member management"
```

---

### Task 7: Frontend — JoinPage

**Files:**
- Create: `web/src/pages/JoinPage.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create JoinPage.tsx**

Create `web/src/pages/JoinPage.tsx`. This page:
- Extracts token from URL params via `useParams`
- Calls `auth.validateInvite` on load
- Shows invite details + registration form
- On submit calls `auth.registerWithInvite`
- Matches LoginPage/RegisterPage styling (centered card, serif heading, form fields)
- Error states for expired/revoked/used/email-taken

Use the same patterns from `LoginPage.tsx`: centered layout, `.card` wrapper, `FormField` component, `trpc` mutations, `useQueryClient().invalidateQueries()` on success, `useNavigate()` to redirect to `/`.

- [ ] **Step 2: Add /join/:token public route in App.tsx**

In `web/src/App.tsx`, add the import:

```typescript
import { JoinPage } from './pages/JoinPage';
```

Add the route in the unauthenticated block (before the catch-all):

```typescript
        <Route path="/join/:token" element={<JoinPage />} />
```

- [ ] **Step 3: Build and verify**

Run: `pnpm build:web`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/JoinPage.tsx web/src/App.tsx
git commit -m "feat: add JoinPage for invite acceptance"
```

---

### Task 8: Frontend — MembersPage

**Files:**
- Create: `web/src/pages/MembersPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/Layout.tsx`

- [ ] **Step 1: Create MembersPage.tsx**

Create `web/src/pages/MembersPage.tsx`. This page has:
- **Header** with "Members" title and "Invite Member" button
- **Invite form** (toggled by button): email input, role dropdown (`board_member`/`homeowner`), unit picker (shown when homeowner, populated from `trpc.units.list` filtering to units with no userId). On submit calls `members.invite`, shows copyable link + email status.
- **Current Members table** using `.table-wrap` class: name, email, role, joined. Remove button per row (not on current user's row). Confirmation before removal. Calls `members.remove`.
- **Pending Invites table** using `.table-wrap` class: email, role, unit, effective status, expires. Actions column with Revoke/Resend/Copy Link buttons. Expired rows greyed out.

Use existing design system: `.card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-sm`, `.label`, `.input`, `.table-wrap`, `.badge` classes.

- [ ] **Step 2: Add /members route and Members nav link**

In `web/src/App.tsx`, add the import:

```typescript
import { MembersPage } from './pages/MembersPage';
```

Add the route in the authenticated layout (after `/units`):

```typescript
        <Route path="/members" element={<MembersPage />} />
```

In `web/src/components/Layout.tsx`, add Members to the Management nav group. Insert after the Units & Owners item:

```typescript
      { path: '/members', label: 'Members', icon: '👥' },
```

The nav item needs role gating. Pass `user` to the nav rendering and conditionally include `/members` only for `admin` and `board_member` roles. The `Layout` component already receives `user` as a prop.

Change the `navGroups` from a static constant to a function `getNavGroups(role: string)` that filters out `/members` for homeowners. Or simpler: filter items during rendering — skip items with `path: '/members'` when `user.role === 'homeowner'`.

- [ ] **Step 3: Build and verify**

Run: `pnpm build:web`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/MembersPage.tsx web/src/App.tsx web/src/components/Layout.tsx
git commit -m "feat: add MembersPage with invite management and member removal"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass (existing 39 + new members tests).

- [ ] **Step 2: Build web**

Run: `pnpm build:web`
Expected: Build succeeds.

- [ ] **Step 3: Final commit (if any unstaged changes)**

```bash
git status
```

If clean, done. If any fixes needed, commit them.
