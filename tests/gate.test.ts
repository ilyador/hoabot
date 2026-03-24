import { describe, it, expect } from 'vitest';

/**
 * Tests for the frontend subscription gate logic.
 * This mirrors the logic in App.tsx that blocks the app when subscription is inactive.
 */

const BLOCKED_STATUSES = ['trial_expired', 'past_due', 'canceled', 'unpaid'];

function isBlocked(subscriptionStatus: string | null): boolean {
  return !!subscriptionStatus && BLOCKED_STATUSES.includes(subscriptionStatus);
}

describe('frontend gate logic', () => {
  describe('should block access', () => {
    it('blocks trial_expired', () => {
      expect(isBlocked('trial_expired')).toBe(true);
    });

    it('blocks past_due', () => {
      expect(isBlocked('past_due')).toBe(true);
    });

    it('blocks canceled', () => {
      expect(isBlocked('canceled')).toBe(true);
    });

    it('blocks unpaid', () => {
      expect(isBlocked('unpaid')).toBe(true);
    });
  });

  describe('should allow access', () => {
    it('allows trialing (active trial)', () => {
      expect(isBlocked('trialing')).toBe(false);
    });

    it('allows active subscription', () => {
      expect(isBlocked('active')).toBe(false);
    });

    it('allows none (legacy/initial)', () => {
      expect(isBlocked('none')).toBe(false);
    });

    it('allows null (no HOA yet)', () => {
      expect(isBlocked(null)).toBe(false);
    });
  });
});

describe('frontend gate shows correct content', () => {
  it('TrialExpiredPage adapts title for trial_expired vs past_due', () => {
    // Mirrors the logic in TrialExpiredPage.tsx
    function getTitle(status: string) {
      return status === 'past_due' ? 'Payment past due' : 'Your free trial has ended';
    }

    expect(getTitle('trial_expired')).toBe('Your free trial has ended');
    expect(getTitle('past_due')).toBe('Payment past due');
    expect(getTitle('canceled')).toBe('Your free trial has ended');
  });
});
