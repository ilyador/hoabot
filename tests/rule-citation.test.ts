import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { prisma } from '../server/src/db.js';
import {
  createTestUser,
  createTestHoa,
  createTestUnit,
  callerForUser,
  cleanupTestData,
  disconnectDb,
} from './helpers.js';

afterEach(cleanupTestData);
afterAll(disconnectDb);

describe('violations.saveRule', () => {
  it('stores a rule citation on a violation', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const unit = await createTestUnit(hoa.id);
    const caller = await callerForUser(user.id);

    const violation = await caller.violations.create({
      unitId: unit.id,
      type: 'Fence height',
      description: 'Fence exceeds 6 feet',
    });

    const updated = await caller.violations.saveRule({
      violationId: violation.id,
      ruleCitation: '[Section 4.2] No fence shall exceed 6 feet in height.',
    });

    expect(updated.ruleCitation).toBe('[Section 4.2] No fence shall exceed 6 feet in height.');
  });

  it('normalizes empty string to null', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const unit = await createTestUnit(hoa.id);
    const caller = await callerForUser(user.id);

    const violation = await caller.violations.create({
      unitId: unit.id,
      type: 'Noise',
      description: 'Loud music after 10pm',
    });

    // First save a citation
    await caller.violations.saveRule({
      violationId: violation.id,
      ruleCitation: '[Section 7.1] Quiet hours are 10pm to 7am.',
    });

    // Then clear it
    const cleared = await caller.violations.saveRule({
      violationId: violation.id,
      ruleCitation: '',
    });

    expect(cleared.ruleCitation).toBeNull();
  });

  it('rejects violations from another HOA', async () => {
    const { user: admin1 } = await createTestUser();
    const { hoa: hoa1 } = await createTestHoa(admin1.id);
    const unit1 = await createTestUnit(hoa1.id);

    const { user: admin2 } = await createTestUser();
    const { hoa: hoa2 } = await createTestHoa(admin2.id);

    const caller1 = await callerForUser(admin1.id);
    const violation = await caller1.violations.create({
      unitId: unit1.id,
      type: 'Parking',
      description: 'Unauthorized vehicle',
    });

    const caller2 = await callerForUser(admin2.id);
    await expect(
      caller2.violations.saveRule({ violationId: violation.id, ruleCitation: 'Some rule' })
    ).rejects.toThrow('NOT_FOUND');
  });

  it('saved ruleCitation appears in violations.list', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const unit = await createTestUnit(hoa.id);
    const caller = await callerForUser(user.id);

    const violation = await caller.violations.create({
      unitId: unit.id,
      type: 'Lawn',
      description: 'Overgrown grass',
    });

    await caller.violations.saveRule({
      violationId: violation.id,
      ruleCitation: '[Section 3.1] Lawns must be maintained.',
    });

    const list = await caller.violations.list();
    const found = list.find((v: any) => v.id === violation.id);
    expect(found.ruleCitation).toBe('[Section 3.1] Lawns must be maintained.');
  });
});

describe('violations.suggestRule', () => {
  it('returns empty suggestions when no documents are indexed', async () => {
    const { user } = await createTestUser();
    const { hoa } = await createTestHoa(user.id);
    const unit = await createTestUnit(hoa.id);
    const caller = await callerForUser(user.id);

    const violation = await caller.violations.create({
      unitId: unit.id,
      type: 'Fence',
      description: 'Too tall',
    });

    const result = await caller.violations.suggestRule({ violationId: violation.id });
    expect(result.suggestions).toEqual([]);
  });

  it('rejects violations from another HOA', async () => {
    const { user: admin1 } = await createTestUser();
    const { hoa: hoa1 } = await createTestHoa(admin1.id);
    const unit1 = await createTestUnit(hoa1.id);

    const { user: admin2 } = await createTestUser();
    await createTestHoa(admin2.id);

    const caller1 = await callerForUser(admin1.id);
    const violation = await caller1.violations.create({
      unitId: unit1.id,
      type: 'Parking',
      description: 'Wrong spot',
    });

    const caller2 = await callerForUser(admin2.id);
    await expect(
      caller2.violations.suggestRule({ violationId: violation.id })
    ).rejects.toThrow('NOT_FOUND');
  });
});
