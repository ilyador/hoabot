import { describe, it, expect, afterAll, afterEach } from 'vitest';
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

    const result = await caller.members.invite({ email: 'board@test.com', role: 'board_member' });

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

    const result = await caller.members.invite({ email: 'owner@test.com', role: 'homeowner', unitId: unit.id });

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
    await createTestHoa(user.id);
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
    await createTestInvite(hoa.id, user.id, { expiresAt: new Date(Date.now() - 1000) });
    const caller = await callerForUser(user.id);

    const invites = await caller.members.listInvites();
    expect(invites[0].effectiveStatus).toBe('expired');
    expect(invites[0].status).toBe('pending');
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
    const invite = await createTestInvite(hoa.id, user.id, { expiresAt: new Date(Date.now() - 1000) });

    await expect(publicCaller().auth.validateInvite({ token: invite.token })).rejects.toThrow('expired');
  });

  it('rejects revoked token', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const invite = await createTestInvite(hoa.id, user.id, { status: 'revoked' });

    await expect(publicCaller().auth.validateInvite({ token: invite.token })).rejects.toThrow('revoked');
  });

  it('rejects used token', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const invite = await createTestInvite(hoa.id, user.id, { status: 'accepted' });

    await expect(publicCaller().auth.validateInvite({ token: invite.token })).rejects.toThrow('already been used');
  });
});

describe('auth.registerWithInvite', () => {
  it('creates user with correct role and hoaId', async () => {
    const { user: admin } = await createTestUser();
    const { hoa } = await createTestHoa(admin.id);
    const invite = await createTestInvite(hoa.id, admin.id, { email: 'newmember@test.com', role: 'board_member' });

    const result = await publicCaller().auth.registerWithInvite({
      token: invite.token, name: 'New Member', password: 'testpassword123',
    });

    expect(result.user.email).toBe('newmember@test.com');
    expect(result.user.role).toBe('board_member');
    expect(result.user.hoaId).toBe(hoa.id);

    await prisma.user.delete({ where: { id: result.user.id } });
  });

  it('links unit for homeowner invite', async () => {
    const { user: admin } = await createTestUser();
    const { hoa } = await createTestHoa(admin.id);
    const unit = await createTestUnit(hoa.id);
    const invite = await createTestInvite(hoa.id, admin.id, { email: 'homeowner@test.com', role: 'homeowner', unitId: unit.id });

    const result = await publicCaller().auth.registerWithInvite({
      token: invite.token, name: 'Home Owner', password: 'testpassword123',
    });

    const updatedUnit = await prisma.unit.findUnique({ where: { id: unit.id } });
    expect(updatedUnit!.userId).toBe(result.user.id);

    await prisma.unit.update({ where: { id: unit.id }, data: { userId: null } });
    await prisma.user.delete({ where: { id: result.user.id } });
  });

  it('re-links a previously removed user', async () => {
    const { user: admin } = await createTestUser();
    const { hoa } = await createTestHoa(admin.id);
    const { user: removed } = await createTestUser({ email: 'removed@test.com' });
    const invite = await createTestInvite(hoa.id, admin.id, { email: 'removed@test.com', role: 'board_member' });

    const result = await publicCaller().auth.registerWithInvite({
      token: invite.token, name: 'Re-linked', password: 'testpassword123',
    });

    expect(result.user.id).toBe(removed.id);
    expect(result.user.hoaId).toBe(hoa.id);
    expect(result.user.role).toBe('board_member');
  });

  it('rejects if email belongs to another HOA', async () => {
    const { user: admin1 } = await createTestUser();
    const { hoa: hoa1 } = await createTestHoa(admin1.id);
    const { user: admin2 } = await createTestUser({ email: 'other-hoa@test.com' });
    await createTestHoa(admin2.id, { name: 'Other HOA' });

    const invite = await createTestInvite(hoa1.id, admin1.id, { email: 'other-hoa@test.com' });

    await expect(
      publicCaller().auth.registerWithInvite({ token: invite.token, name: 'X', password: 'testpassword123' })
    ).rejects.toThrow('already associated with another HOA');
  });
});
