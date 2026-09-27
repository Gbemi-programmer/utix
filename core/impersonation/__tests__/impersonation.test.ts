import { beforeEach, describe, expect, it } from 'vitest';
import {
  canExecuteAction,
  clearImpersonationAuditTrail,
  createImpersonationSession,
  endImpersonationSession,
  getImpersonationAuditTrail,
  getImpersonationBannerState,
  isSessionValid
} from '../impersonation';
import { ImpersonationSession } from '../types';

describe('Scoped Maintainer Impersonation (#80)', () => {
  const fixedNow = new Date('2026-09-27T10:00:00.000Z');
  const mockClock = () => new Date(fixedNow.getTime());

  beforeEach(() => {
    clearImpersonationAuditTrail();
  });

  describe('createImpersonationSession', () => {
    it('creates a time-limited read-only impersonation session with valid parameters', () => {
      const result = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Customer reported ticket sync failure on mobile',
        durationMinutes: 20,
        clock: mockClock
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const session = result.value;
        expect(session.maintainerId).toBe('maintainer_alice');
        expect(session.targetUserId).toBe('user_bob');
        expect(session.active).toBe(true);
        expect(session.allowedMutations).toEqual([]);
        expect(session.expiresAt).toBe(new Date(fixedNow.getTime() + 20 * 60 * 1000).toISOString());

        // Verify audit event emission
        const trail = getImpersonationAuditTrail(session.id);
        expect(trail.length).toBe(1);
        expect(trail[0].eventType).toBe('session_started');
        expect(trail[0].outcome).toBe('allowed');
        expect(trail[0].maintainerId).toBe('maintainer_alice');
      }
    });

    it('rejects session creation with missing or blank reason', () => {
      const result = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: '   ',
        clock: mockClock
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('missing_reason');
      }
    });

    it('rejects session creation with invalid duration (< 1 or > 60 minutes)', () => {
      const resultZero = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Investigating transfer issue',
        durationMinutes: 0,
        clock: mockClock
      });
      expect(resultZero.ok).toBe(false);
      if (!resultZero.ok) expect(resultZero.code).toBe('invalid_duration');

      const resultOver = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Investigating transfer issue',
        durationMinutes: 120,
        clock: mockClock
      });
      expect(resultOver.ok).toBe(false);
      if (!resultOver.ok) expect(resultOver.code).toBe('invalid_duration');
    });

    it('rejects unauthenticated or invalid maintainer and target IDs', () => {
      const result1 = createImpersonationSession({
        maintainerId: '',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Debugging issue',
        clock: mockClock
      });
      expect(result1.ok).toBe(false);
      if (!result1.ok) expect(result1.code).toBe('unauthorized_maintainer');

      const result2 = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: '',
        targetAddress: 'GD5J...TEST',
        reason: 'Debugging issue',
        clock: mockClock
      });
      expect(result2.ok).toBe(false);
      if (!result2.ok) expect(result2.code).toBe('invalid_target');
    });
  });

  describe('isSessionValid & expiry', () => {
    it('returns true when session is within its valid time window', () => {
      const result = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Checking balance issues',
        durationMinutes: 15,
        clock: mockClock
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(isSessionValid(result.value, mockClock)).toBe(true);

        // Advance 10 minutes (still valid)
        const later10m = () => new Date(fixedNow.getTime() + 10 * 60 * 1000);
        expect(isSessionValid(result.value, later10m)).toBe(true);

        // Advance 16 minutes (expired)
        const later16m = () => new Date(fixedNow.getTime() + 16 * 60 * 1000);
        expect(isSessionValid(result.value, later16m)).toBe(false);
      }
    });

    it('returns false after session is manually ended', () => {
      const result = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Checking balance issues',
        clock: mockClock
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const ended = endImpersonationSession(result.value, 'Resolved ticket', mockClock);
        expect(ended.active).toBe(false);
        expect(isSessionValid(ended, mockClock)).toBe(false);

        const trail = getImpersonationAuditTrail(result.value.id);
        expect(trail.some((e) => e.eventType === 'session_ended')).toBe(true);
      }
    });
  });

  describe('canExecuteAction & mutation blocking', () => {
    it('allows read-only actions when corresponding scope is present', () => {
      const result = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Support investigation',
        scopes: ['read:tickets', 'inspect:events'],
        clock: mockClock
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const session = result.value;
        const checkView = canExecuteAction(session, 'ticket.view', { clock: mockClock });
        expect(checkView.ok).toBe(true);

        const checkEvents = canExecuteAction(session, 'event.view', { clock: mockClock });
        expect(checkEvents.ok).toBe(true);
      }
    });

    it('denies actions when required scope is missing', () => {
      const result = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Support investigation',
        scopes: ['read:tickets'], // 'inspect:events' omitted
        clock: mockClock
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const session = result.value;
        const checkEvents = canExecuteAction(session, 'event.view', { clock: mockClock });
        expect(checkEvents.ok).toBe(false);
        if (!checkEvents.ok) {
          expect(checkEvents.code).toBe('impersonation_scope_denied');
        }
      }
    });

    it('blocks dangerous mutations by default in read-only mode', () => {
      const result = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Support investigation',
        scopes: ['read:tickets', 'read:transfers', 'debug:redemption'],
        allowedMutations: [], // Read-only
        clock: mockClock
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const session = result.value;
        const transferCheck = canExecuteAction(session, 'ticket.transfer', { clock: mockClock });
        expect(transferCheck.ok).toBe(false);
        if (!transferCheck.ok) {
          expect(transferCheck.code).toBe('impersonation_mutation_blocked');
        }

        const redeemCheck = canExecuteAction(session, 'ticket.redeem', { clock: mockClock });
        expect(redeemCheck.ok).toBe(false);
        if (!redeemCheck.ok) {
          expect(redeemCheck.code).toBe('impersonation_mutation_blocked');
        }

        // Verify audit log captured mutation_blocked
        const trail = getImpersonationAuditTrail(session.id);
        const blockedEvents = trail.filter((e) => e.eventType === 'mutation_blocked');
        expect(blockedEvents.length).toBe(2);
        expect(blockedEvents[0].outcome).toBe('denied');
      }
    });

    it('allows mutation only when explicitly permitted AND elevated confirmation token is supplied', () => {
      const result = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Escrow unlock debug with user consent',
        scopes: ['read:tickets', 'debug:redemption'],
        allowedMutations: ['ticket.redeem'],
        elevatedConfirmationRequired: true,
        clock: mockClock
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const session = result.value;

        // Attempt without confirmation token
        const noTokenCheck = canExecuteAction(session, 'ticket.redeem', { clock: mockClock });
        expect(noTokenCheck.ok).toBe(false);
        if (!noTokenCheck.ok) {
          expect(noTokenCheck.code).toBe('elevated_confirmation_required');
        }

        // Attempt with valid token
        const validTokenCheck = canExecuteAction(session, 'ticket.redeem', {
          elevatedConfirmationToken: 'ELEVATED_AUTH_CONFIRMATION_XYZ123',
          clock: mockClock
        });
        expect(validTokenCheck.ok).toBe(true);
      }
    });

    it('rejects action on expired session and logs audit event', () => {
      const result = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Diagnostics',
        durationMinutes: 10,
        clock: mockClock
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const session = result.value;
        const later15m = () => new Date(fixedNow.getTime() + 15 * 60 * 1000);

        const check = canExecuteAction(session, 'ticket.view', { clock: later15m });
        expect(check.ok).toBe(false);
        if (!check.ok) {
          expect(check.code).toBe('impersonation_session_expired');
        }

        const trail = getImpersonationAuditTrail(session.id);
        expect(trail.some((e) => e.eventType === 'session_expired')).toBe(true);
      }
    });
  });

  describe('getImpersonationBannerState', () => {
    it('returns empty banner state when no session exists', () => {
      const banner = getImpersonationBannerState(null);
      expect(banner.isImpersonating).toBe(false);
      expect(banner.remainingSeconds).toBe(0);
      expect(banner.isReadOnly).toBe(true);
    });

    it('returns correct banner state for active read-only session', () => {
      const result = createImpersonationSession({
        maintainerId: 'maintainer_alice',
        targetUserId: 'user_bob',
        targetAddress: 'GD5J...TEST',
        reason: 'Support ticket 1234',
        durationMinutes: 10,
        clock: mockClock
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const banner = getImpersonationBannerState(result.value, mockClock);
        expect(banner.isImpersonating).toBe(true);
        expect(banner.isReadOnly).toBe(true);
        expect(banner.targetUserId).toBe('user_bob');
        expect(banner.remainingSeconds).toBe(600);
        expect(banner.badgeTone).toBe('warning');
      }
    });

    it('indicates expired session on banner', () => {
      const session: ImpersonationSession = {
        id: 'imp_1',
        maintainerId: 'm1',
        targetUserId: 'u1',
        targetAddress: 'G...',
        reason: 'test',
        scopes: ['read:tickets'],
        allowedMutations: [],
        createdAt: new Date(fixedNow.getTime() - 20 * 60 * 1000).toISOString(),
        expiresAt: new Date(fixedNow.getTime() - 5 * 60 * 1000).toISOString(),
        elevatedConfirmationRequired: true,
        active: true
      };

      const banner = getImpersonationBannerState(session, mockClock);
      expect(banner.isImpersonating).toBe(false);
      expect(banner.isExpired).toBe(true);
      expect(banner.remainingSeconds).toBe(0);
      expect(banner.badgeTone).toBe('danger');
    });
  });
});
