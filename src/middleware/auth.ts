import { Request, Response, NextFunction } from 'express';
import { AuthContext, UserRole } from '../types/leave.ts';
import { UserService } from '../services/userService.ts';
import { verifySessionToken } from '../services/sessionService.ts';

declare global {
  namespace Express {
    interface Request {
      user?: AuthContext;
    }
  }
}

/**
 * Extracts authentication context from headers.
 * Accepts:
 *   x-user-role: 'SUPER_ADMIN' | 'HR' | 'TOP_MANAGEMENT' | 'EMPLOYEE'
 *   x-user-id: string / number
 *   x-employee-id: string / number
 *   x-username: string
 *
 * In local/dev testing, if no header is supplied, defaults to SUPER_ADMIN so default dev testing flows succeed,
 * but whenever a role header is provided (e.g. x-user-role: EMPLOYEE), strict RBAC is enforced!
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Production trusts only a server-signed session token. Identity/role headers are never
  // sufficient to authenticate a request; only a real SUPER_ADMIN session may request
  // the lower-privilege preview context used by the admin employee-dashboard preview.
  if (process.env.NODE_ENV === 'production') {
    const pathLower = (req.path || req.url || '').split('?')[0].toLowerCase().replace(/\/+$/, '') || '/';
    const publicEndpoints = new Set([
      '/health',
      '/auth/login',
      '/auth/forgot-password',
      '/auth/verify-reset-token',
      '/auth/reset-password',
      '/company-logo',
      '/company-logo/image',
      '/company-branding',
    ]);
    if (publicEndpoints.has(pathLower)) {
      req.user = undefined;
      return next();
    }

    const rawTokenHeader = req.headers['x-session-token'];
    const bearerHeader = req.headers.authorization;
    const sessionToken = (typeof rawTokenHeader === 'string' ? rawTokenHeader : '') ||
      (typeof bearerHeader === 'string' && bearerHeader.startsWith('Bearer ') ? bearerHeader.slice(7).trim() : '');
    const claims = verifySessionToken(sessionToken);
    if (!claims) {
      return res.status(401).json({
        error: 'Unauthorized: A valid server-issued session is required.',
        authenticated: false,
      });
    }

    const authenticatedRecord = UserService.getMemoryUserRecordById(claims.userId);
    if (
      !authenticatedRecord ||
      authenticatedRecord.isActive === false ||
      String(authenticatedRecord.username || '').trim().toLowerCase() !== claims.username.trim().toLowerCase() ||
      String(authenticatedRecord.roleName || '').trim().toUpperCase() !== claims.role
    ) {
      return res.status(401).json({
        error: 'Unauthorized: The session no longer matches an active account. Please log in again.',
        authenticated: false,
      });
    }

    const validSystemRoles: UserRole[] = [
      'SUPER_ADMIN',
      'HR',
      'TOP_MANAGEMENT',
      'TEAM_LEADER',
      'EMPLOYEE',
    ];
    const rawRoleHeader = (req.headers['x-user-role'] as string)?.trim().toUpperCase();
    const isSuperAdminSession = claims.role === 'SUPER_ADMIN';
    const requestedRoleIsValid = Boolean(
      rawRoleHeader &&
      (validSystemRoles.includes(rawRoleHeader as UserRole) || UserService.isValidRoleName(rawRoleHeader))
    );
    const effectiveRole = (
      isSuperAdminSession && requestedRoleIsValid ? rawRoleHeader : claims.role
    ) as UserRole;

    const requestedUserId = req.headers['x-user-id'] ? Number(req.headers['x-user-id']) : NaN;
    const effectiveUserRecord =
      isSuperAdminSession && Number.isInteger(requestedUserId) && requestedUserId > 0
        ? UserService.getMemoryUserRecordById(requestedUserId) || authenticatedRecord
        : authenticatedRecord;

    const rawEmployeeHeader = req.headers['x-employee-id']
      ? String(req.headers['x-employee-id']).trim()
      : '';
    const requestedEmployeeId =
      isSuperAdminSession && /^\d+$/.test(rawEmployeeHeader) ? Number(rawEmployeeHeader) : undefined;
    const effectiveEmployeeId = requestedEmployeeId ?? effectiveUserRecord.employeeId ?? undefined;
    const effectiveEmployeeRecord =
      isSuperAdminSession && effectiveEmployeeId
        ? UserService.getMemoryUserRecordByEmployee(effectiveEmployeeId) || effectiveUserRecord
        : effectiveUserRecord;
    const effectiveDept = effectiveEmployeeRecord.departmentId
      ? UserService.getDepartmentByIdSync(effectiveEmployeeRecord.departmentId)
      : null;
    const headerUsername = (req.headers['x-username'] as string)?.trim();

    req.user = {
      userId: effectiveUserRecord.id,
      employeeId: effectiveEmployeeId,
      employeeCode: effectiveEmployeeRecord.employeeCode ?? undefined,
      departmentId: effectiveEmployeeRecord.departmentId ?? null,
      departmentCode: effectiveDept?.code ?? null,
      username: isSuperAdminSession
        ? headerUsername || effectiveUserRecord.username
        : authenticatedRecord.username,
      role: effectiveRole,
      ...(effectiveEmployeeRecord.roleName === effectiveRole
        ? { operationalRole: UserService.resolveOperationalRoleForRecord(effectiveEmployeeRecord) }
        : {}),
    };

    // Forced password changes are enforced against the actual signed-in account, not
    // an admin's temporary employee-preview context.
    if (authenticatedRecord.mustChangePassword === true) {
      const isAllowedDuringForcedChange =
        pathLower === '/health' ||
        pathLower === '/auth/login' ||
        pathLower === '/auth/logout' ||
        pathLower === '/auth/me' ||
        pathLower === '/auth/forgot-password' ||
        pathLower === '/auth/verify-reset-token' ||
        pathLower === '/auth/reset-password' ||
        pathLower === '/company-logo' ||
        pathLower === '/company-logo/image' ||
        pathLower === '/company-branding' ||
        pathLower === '/users/change-password' ||
        pathLower === `/users/${authenticatedRecord.id}/change-password`;
      if (!isAllowedDuringForcedChange) {
        return res.status(403).json({
          error: 'Forbidden: Password change required. Please change your temporary password before accessing this resource.',
          mustChangePassword: true,
          code: 'PASSWORD_CHANGE_REQUIRED',
        });
      }
    }
    return next();
  }
  const authStateHeader = (req.headers['x-auth-state'] as string)?.toUpperCase();
  const rawRoleHeader = (req.headers['x-user-role'] as string)?.trim().toUpperCase();
  const validSystemRoles: UserRole[] = [
    'SUPER_ADMIN',
    'HR',
    'TOP_MANAGEMENT',
    'TEAM_LEADER',
    'EMPLOYEE',
  ];

  // If the client explicitly signals it is logged out / unauthenticated
  const isLoggedOut =
    authStateHeader === 'LOGGED_OUT' ||
    authStateHeader === 'UNAUTHENTICATED' ||
    rawRoleHeader === 'LOGGED_OUT' ||
    rawRoleHeader === 'NONE';

  if (isLoggedOut) {
    req.user = undefined;
    const pathLower = (req.path || req.url || '').toLowerCase();
    const isPublicEndpoint =
      pathLower === '/health' ||
      pathLower === '/auth/login' ||
      pathLower === '/auth/logout' ||
      pathLower === '/auth/forgot-password' ||
      pathLower === '/auth/verify-reset-token' ||
      pathLower === '/auth/reset-password' ||
      pathLower === '/company-logo' ||
      pathLower === '/company-logo/image' ||
      pathLower === '/company-branding';
    if (!isPublicEndpoint) {
      return res.status(401).json({
        error: 'Unauthorized: Session has been logged out. Please log in to access this resource.',
        authenticated: false,
      });
    }
    return next();
  }

  const headerUserId = req.headers['x-user-id'] ? Number(req.headers['x-user-id']) : undefined;
  const rawEmployeeHeader = req.headers['x-employee-id']
    ? String(req.headers['x-employee-id']).trim()
    : undefined;
  const headerUsername = (req.headers['x-username'] as string)?.trim();

  const matchedById =
    headerUserId && !isNaN(headerUserId)
      ? UserService.getMemoryUserRecordById(headerUserId)
      : undefined;
  const matchedByEmployee =
    !matchedById && rawEmployeeHeader
      ? UserService.getMemoryUserRecordByEmployee(rawEmployeeHeader)
      : undefined;
  const matchedByUsername =
    !matchedById && !matchedByEmployee && headerUsername
      ? UserService.getMemoryUserRecordByUsername(headerUsername)
      : undefined;
  const matchedRecord = matchedById || matchedByEmployee || matchedByUsername;

  let role: UserRole = 'SUPER_ADMIN';
  if (rawRoleHeader) {
    if (validSystemRoles.includes(rawRoleHeader as UserRole) || UserService.isValidRoleName(rawRoleHeader)) {
      role = rawRoleHeader as UserRole;
    } else if (matchedRecord && matchedRecord.roleName.toUpperCase() === rawRoleHeader) {
      role = matchedRecord.roleName;
    }
  } else if (matchedRecord) {
    role = matchedRecord.roleName;
  }

  const defaultUserId =
    matchedRecord?.id
      ? matchedRecord.id
      : role === 'SUPER_ADMIN'
      ? 1
      : role === 'HR'
      ? 2
      : role === 'TOP_MANAGEMENT'
      ? 3
      : role === 'TEAM_LEADER'
      ? 5
      : 4;

  const userId = headerUserId && !isNaN(headerUserId) ? headerUserId : defaultUserId;

  const parsedHeaderEmpId =
    rawEmployeeHeader && !isNaN(Number(rawEmployeeHeader)) && /^\d+$/.test(rawEmployeeHeader)
      ? Number(rawEmployeeHeader)
      : undefined;

  const employeeId =
    matchedByEmployee?.employeeId ??
    parsedHeaderEmpId ??
    (matchedRecord && matchedRecord.id === userId && matchedRecord.employeeId
      ? matchedRecord.employeeId
      : role === 'EMPLOYEE'
      ? userId > 10
        ? userId
        : 100 + userId
      : role === 'TEAM_LEADER'
      ? 5
      : !validSystemRoles.includes(role)
      ? matchedRecord?.employeeId || userId
      : undefined);

  const effectiveEmpRecord =
    matchedRecord ||
    (employeeId ? UserService.getMemoryUserRecordByEmployee(employeeId) : undefined);

  const effectiveDept = effectiveEmpRecord?.departmentId
    ? UserService.getDepartmentByIdSync(effectiveEmpRecord.departmentId)
    : null;

  const username =
    headerUsername ||
    (matchedRecord && matchedRecord.id === userId ? matchedRecord.username : undefined) ||
    effectiveEmpRecord?.username ||
    (role === 'EMPLOYEE'
      ? 'employee_user'
      : role === 'TEAM_LEADER'
      ? 'tl_robert'
      : 'admin_user');

  const operationalRole =
    matchedRecord && matchedRecord.id === userId && matchedRecord.roleName === role
      ? UserService.resolveOperationalRoleForRecord(matchedRecord)
      : undefined;

  req.user = {
    userId,
    employeeId,
    employeeCode: effectiveEmpRecord?.employeeCode ?? undefined,
    departmentId: effectiveEmpRecord?.departmentId ?? null,
    departmentCode: effectiveDept?.code ?? null,
    username,
    role,
    ...(operationalRole ? { operationalRole } : {}),
  };

  // Enforce forced first-login password change at the API layer so users with mustChangePassword=true cannot bypass via direct API requests
  if (matchedRecord && matchedRecord.id === userId && matchedRecord.mustChangePassword === true) {
    const pathLower = (req.path || req.url || '').split('?')[0].toLowerCase();
    const isAllowedDuringForcedChange =
      pathLower === '/health' ||
      pathLower === '/auth/login' ||
      pathLower === '/auth/logout' ||
      pathLower === '/auth/me' ||
      pathLower === '/auth/forgot-password' ||
      pathLower === '/auth/verify-reset-token' ||
      pathLower === '/auth/reset-password' ||
      pathLower === '/company-logo' ||
      pathLower === '/company-logo/image' ||
      pathLower === '/company-branding' ||
      pathLower === '/users/change-password' ||
      pathLower === `/users/${userId}/change-password`;

    if (!isAllowedDuringForcedChange) {
      return res.status(403).json({
        error: 'Forbidden: Password change required. Please change your temporary password before accessing this resource.',
        mustChangePassword: true,
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
  }

  next();
}

async function hasCustomRoleRoutePermission(req: Request, allowedRoles: UserRole[]): Promise<boolean> {
  const user = req.user;
  if (!user || !UserService.isValidRoleName(user.role)) return false;

  if (await UserService.hasPermission(user, 'ALL_PERMISSIONS')) {
    return true;
  }

  // Routes open to all authenticated users (including EMPLOYEE)
  if (allowedRoles.includes('EMPLOYEE')) {
    return true;
  }

  // Strictly SUPER_ADMIN-only administrative authority routes
  if (allowedRoles.length === 1 && allowedRoles[0] === 'SUPER_ADMIN') {
    return false;
  }

  const pathLower = ((req.baseUrl || '') + (req.path || req.url || '')).toLowerCase();
  const method = (req.method || 'GET').toUpperCase();

  if (pathLower.includes('/team-leader') || pathLower.includes('/approvals/team-leader')) {
    return (
      user.operationalRole === 'TEAM_LEADER' ||
      (await UserService.hasPermission(user, 'LEAVE_TEAM_LEADER_APPROVE')) ||
      (method === 'GET' && (await UserService.hasPermission(user, 'LEAVE_VIEW_TEAM')))
    );
  }

  if (pathLower.includes('/hr/leave-requests')) {
    return (
      user.operationalRole === 'HR' ||
      (await UserService.hasPermission(user, 'LEAVE_HR_APPROVE'))
    );
  }

  if (pathLower.includes('/management/leave-requests')) {
    return (
      user.operationalRole === 'TOP_MANAGEMENT' ||
      (await UserService.hasPermission(user, 'LEAVE_FINAL_APPROVE'))
    );
  }

  if (pathLower.includes('/audit')) {
    return UserService.hasPermission(user, 'AUDIT_LOG_VIEW');
  }

  if (pathLower.includes('/reports')) {
    return (
      (await UserService.hasPermission(user, 'REPORT_VIEW')) ||
      (await UserService.hasPermission(user, 'LEAVE_VIEW_ALL'))
    );
  }

  if (pathLower.includes('/roles') && method === 'GET') {
    return (
      (await UserService.hasPermission(user, 'ROLE_ASSIGN')) ||
      (await UserService.hasPermission(user, 'USER_EDIT')) ||
      (await UserService.hasPermission(user, 'USER_CREATE')) ||
      (await UserService.hasPermission(user, 'EMPLOYEE_EDIT')) ||
      (await UserService.hasPermission(user, 'EMPLOYEE_CREATE'))
    );
  }

  if (pathLower.includes('/users')) {
    if (method === 'GET') {
      return (
        (await UserService.hasPermission(user, 'USER_VIEW')) ||
        (await UserService.hasPermission(user, 'USER_EDIT')) ||
        (await UserService.hasPermission(user, 'USER_CREATE')) ||
        (await UserService.hasPermission(user, 'EMPLOYEE_VIEW'))
      );
    }
    return (
      (await UserService.hasPermission(user, 'USER_EDIT')) ||
      (await UserService.hasPermission(user, 'USER_CREATE')) ||
      (await UserService.hasPermission(user, 'USER_STATUS'))
    );
  }

  if (pathLower.includes('/employees')) {
    if (method === 'GET') {
      return (
        (await UserService.hasPermission(user, 'EMPLOYEE_VIEW')) ||
        (await UserService.hasPermission(user, 'EMPLOYEE_EDIT')) ||
        (await UserService.hasPermission(user, 'EMPLOYEE_CREATE'))
      );
    }
    if (method === 'POST') {
      return UserService.hasPermission(user, 'EMPLOYEE_CREATE');
    }
    return (
      (await UserService.hasPermission(user, 'EMPLOYEE_EDIT')) ||
      (await UserService.hasPermission(user, 'EMPLOYEE_STATUS'))
    );
  }

  if (pathLower.includes('/departments') && !pathLower.includes('shift')) {
    return UserService.hasPermission(user, 'DEPARTMENT_MANAGE');
  }

  if (pathLower.includes('/designations')) {
    return UserService.hasPermission(user, 'DESIGNATION_MANAGE');
  }

  if (pathLower.includes('/shift')) {
    if (method === 'GET') {
      return (
        (await UserService.hasPermission(user, 'SHIFT_VIEW')) ||
        (await UserService.hasPermission(user, 'SHIFT_ASSIGN')) ||
        (await UserService.hasPermission(user, 'SHIFT_EDIT')) ||
        (await UserService.hasPermission(user, 'SHIFT_CREATE'))
      );
    }
    return (
      (await UserService.hasPermission(user, 'SHIFT_ASSIGN')) ||
      (await UserService.hasPermission(user, 'SHIFT_EDIT')) ||
      (await UserService.hasPermission(user, 'SHIFT_CREATE')) ||
      (await UserService.hasPermission(user, 'SHIFT_DEACTIVATE'))
    );
  }

  if (pathLower.includes('/working-calendar') || pathLower.includes('/working-days') || pathLower.includes('/weekly-off')) {
    return (
      (await UserService.hasPermission(user, 'WORKING_DAYS_MANAGE')) ||
      (await UserService.hasPermission(user, 'WEEKLY_OFF_MANAGE'))
    );
  }

  if (pathLower.includes('/overtime')) {
    return (
      (await UserService.hasPermission(user, 'OVERTIME_REVIEW')) ||
      (await UserService.hasPermission(user, 'OVERTIME_MANAGE'))
    );
  }

  if (pathLower.includes('/leave-balances/adjust')) {
    return UserService.hasPermission(user, 'LEAVE_HR_APPROVE');
  }

  return false;
}

/**
 * RBAC authorization guard.
 * Rejects with 403 if the user's role is not within the allowed roles and lacks equivalent dynamic permission.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication context missing' });
      }

      if (allowedRoles.includes(req.user.role) || req.user.role === 'SUPER_ADMIN') {
        return next();
      }

      if (await hasCustomRoleRoutePermission(req, allowedRoles)) {
        return next();
      }

      return res.status(403).json({
        error: `Forbidden: Access denied. Required role(s): ${allowedRoles.join(', ')}. Your active role: ${req.user.role}`,
        activeRole: req.user.role,
        requiredRoles: allowedRoles,
      });
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Dynamic RBAC permission guard backed by persisted role permissions.
 */
export function requirePermission(permissionCode: string, allowedRoles?: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication context missing' });
      }

      if (req.user.role === 'SUPER_ADMIN') {
        return next();
      }

      if (allowedRoles && allowedRoles.length === 1 && allowedRoles[0] === 'SUPER_ADMIN') {
        return res.status(403).json({
          error: `Forbidden: Access denied. Required role(s): SUPER_ADMIN. Your active role: ${req.user.role}`,
          activeRole: req.user.role,
          requiredRoles: allowedRoles,
        });
      }

      const permitted = await UserService.hasPermission(req.user, permissionCode);
      if (!permitted) {
        return res.status(403).json({
          error: `Forbidden: Role '${req.user.role}' does not have required permission '${permissionCode}'`,
          activeRole: req.user.role,
          requiredPermission: permissionCode,
        });
      }

      const isBuiltInRole = ['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE'].includes(
        req.user.role
      );
      if (isBuiltInRole && allowedRoles && !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          error: `Forbidden: Access denied. Required role(s): ${allowedRoles.join(', ')}. Your active role: ${req.user.role}`,
          activeRole: req.user.role,
          requiredRoles: allowedRoles,
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}
