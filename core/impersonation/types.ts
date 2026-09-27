/**
 * Types and interfaces for Scoped Maintainer Impersonation (#80)
 *
 * Provides safe, time-limited, audited impersonation capabilities for support debugging.
 * Guarantees read-only defaults, explicit mutation gates, elevated confirmation,
 * and comprehensive audit trail logging.
 */

export type ImpersonationScope =
  | 'read:tickets'
  | 'read:transfers'
  | 'debug:redemption'
  | 'inspect:events'
  | 'support:diagnostics'
  | 'view:audit';

export type ImpersonationAction =
  // Read-only actions
  | 'ticket.view'
  | 'ticket.list'
  | 'transfer.history'
  | 'event.view'
  | 'fraud.check'
  | 'diagnostic.run'
  | 'audit.view'
  // Sensitive / dangerous mutation actions
  | 'ticket.transfer'
  | 'ticket.redeem'
  | 'ticket.burn'
  | 'payout.withdraw'
  | 'credential.rotate'
  | 'event.cancel';

export const DANGEROUS_MUTATIONS: readonly ImpersonationAction[] = [
  'ticket.transfer',
  'ticket.redeem',
  'ticket.burn',
  'payout.withdraw',
  'credential.rotate',
  'event.cancel'
] as const;

export const ACTION_SCOPE_MAP: Record<ImpersonationAction, ImpersonationScope> = {
  'ticket.view': 'read:tickets',
  'ticket.list': 'read:tickets',
  'transfer.history': 'read:transfers',
  'event.view': 'inspect:events',
  'fraud.check': 'support:diagnostics',
  'diagnostic.run': 'support:diagnostics',
  'audit.view': 'view:audit',
  'ticket.transfer': 'read:transfers',
  'ticket.redeem': 'debug:redemption',
  'ticket.burn': 'read:tickets',
  'payout.withdraw': 'support:diagnostics',
  'credential.rotate': 'support:diagnostics',
  'event.cancel': 'inspect:events'
};

export interface ImpersonationSession {
  readonly id: string;
  readonly maintainerId: string;
  readonly targetUserId: string;
  readonly targetAddress: string;
  readonly reason: string;
  readonly scopes: readonly ImpersonationScope[];
  readonly allowedMutations: readonly ImpersonationAction[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly elevatedConfirmationRequired: boolean;
  readonly active: boolean;
}

export type ImpersonationErrorCode =
  | 'impersonation_session_expired'
  | 'impersonation_session_inactive'
  | 'impersonation_scope_denied'
  | 'impersonation_mutation_blocked'
  | 'elevated_confirmation_required'
  | 'invalid_duration'
  | 'invalid_target'
  | 'missing_reason'
  | 'unauthorized_maintainer';

export type ImpersonationAuditEventType =
  | 'session_started'
  | 'session_ended'
  | 'action_performed'
  | 'mutation_blocked'
  | 'session_expired';

export interface ImpersonationAuditEvent {
  readonly id: string;
  readonly eventType: ImpersonationAuditEventType;
  readonly sessionId: string;
  readonly maintainerId: string;
  readonly targetUserId: string;
  readonly action?: ImpersonationAction | string;
  readonly outcome: 'allowed' | 'denied';
  readonly reason?: string;
  readonly timestamp: string;
  readonly details?: Record<string, string | number | boolean | null>;
}

export interface CreateImpersonationParams {
  readonly maintainerId: string;
  readonly targetUserId: string;
  readonly targetAddress: string;
  readonly reason: string;
  readonly durationMinutes?: number;
  readonly scopes?: readonly ImpersonationScope[];
  readonly allowedMutations?: readonly ImpersonationAction[];
  readonly elevatedConfirmationRequired?: boolean;
  readonly clock?: () => Date;
}

export interface ImpersonationBannerState {
  readonly isImpersonating: boolean;
  readonly sessionId?: string;
  readonly maintainerId?: string;
  readonly targetUserId?: string;
  readonly targetAddress?: string;
  readonly remainingSeconds: number;
  readonly isReadOnly: boolean;
  readonly scopes: readonly ImpersonationScope[];
  readonly isExpired: boolean;
  readonly badgeTone: 'warning' | 'danger' | 'info';
  readonly statusText: string;
}
