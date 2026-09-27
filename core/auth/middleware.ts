/**
 * Server-side authorization middleware
 * 
 * Enforces permission checks for API routes and server actions.
 * These checks run server-side and cannot be bypassed through UI manipulation.
 */

import { Role, Permission, hasPermission } from './types';

export class UnauthorizedError extends Error {
  constructor(
    message: string,
    public readonly requiredPermission: Permission,
    public readonly userRole: Role
  ) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export interface AuthContext {
  role: Role;
  userId?: string;
}

/**
 * Verify that the current user has the required permission.
 * Throws UnauthorizedError if permission is denied.
 */
export function requirePermission(
  context: AuthContext,
  permission: Permission
): void {
  if (!hasPermission(context.role, permission)) {
    throw new UnauthorizedError(
      `Permission denied: ${permission} requires elevated privileges`,
      permission,
      context.role
    );
  }
}

/**
 * Get the current auth context from request headers or environment.
 * For Utix, this defaults to viewer role since all tools are read-only.
 */
export function getAuthContext(): AuthContext {
  const role = (process.env.UTIX_USER_ROLE as Role) || 'viewer';
  return { role };
}

/**
 * Higher-order function that wraps server actions with permission checks.
 */
export function withPermission<T extends (...args: unknown[]) => unknown>(
  permission: Permission,
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    const context = getAuthContext();
    requirePermission(context, permission);
    return handler(...args);
  }) as T;
}
