import { UserRole } from '../types/leave.ts';

const AUTH_STORAGE_KEY = 'maestro_auth_session_v1';

export interface ActiveClientSession {
  isAuthenticated: boolean;
  role: UserRole;
  userId: number;
  employeeId: number;
  employeeCode?: string | null;
  departmentId?: number | null;
  departmentCode?: string | null;
  username: string;
  fullName: string;
  profilePhotoUrl: string | null;
  permissions: string[];
  mustChangePassword?: boolean;
  sessionToken?: string | null;
  expiresAt?: number | null;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const isBrowserRuntime =
  typeof window !== 'undefined' && typeof window.document !== 'undefined';

const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SUPER_ADMIN: [
    'ALL_PERMISSIONS',
    'USER_CREATE',
    'USER_EDIT',
    'USER_DELETE',
    'USER_STATUS',
    'USER_RESET_PASSWORD',
    'ROLE_ASSIGN',
    'EMPLOYEE_VIEW',
    'EMPLOYEE_CREATE',
    'EMPLOYEE_EDIT',
    'EMPLOYEE_DELETE',
    'EMPLOYEE_STATUS',
    'DEPARTMENT_MANAGE',
    'DESIGNATION_MANAGE',
    'WORKING_DAYS_MANAGE',
    'WEEKLY_OFF_MANAGE',
    'SHIFT_VIEW',
    'SHIFT_CREATE',
    'SHIFT_EDIT',
    'SHIFT_DEACTIVATE',
    'SHIFT_ASSIGN',
    'HOLIDAY_MANAGE',
    'OVERTIME_MANAGE',
    'OVERTIME_REVIEW',
    'AUDIT_LOG_VIEW',
    'LEAVE_VIEW_ALL',
    'LEAVE_TEAM_LEADER_APPROVE',
    'LEAVE_HR_APPROVE',
    'LEAVE_FINAL_APPROVE',
    'LEAVE_APPLY',
    'LEAVE_VIEW_OWN',
    'PROFILE_VIEW_OWN',
    'PROFILE_EDIT_BASIC',
    'PASSWORD_CHANGE_OWN',
    'SCHEDULE_VIEW_OWN',
    'OVERTIME_APPLY_OWN',
  ],
  TOP_MANAGEMENT: [
    'LEAVE_FINAL_APPROVE',
    'LEAVE_VIEW_ALL',
    'OVERTIME_REVIEW',
    'EMPLOYEE_VIEW',
    'SHIFT_VIEW',
    'LEAVE_APPLY',
    'LEAVE_VIEW_OWN',
    'PROFILE_VIEW_OWN',
    'PROFILE_EDIT_BASIC',
    'PASSWORD_CHANGE_OWN',
    'SCHEDULE_VIEW_OWN',
  ],
  HR: [
    'EMPLOYEE_VIEW',
    'EMPLOYEE_EDIT',
    'EMPLOYEE_CREATE',
    'LEAVE_HR_APPROVE',
    'LEAVE_VIEW_ALL',
    'SHIFT_VIEW',
    'SHIFT_ASSIGN',
    'OVERTIME_REVIEW',
    'HOLIDAY_MANAGE',
    'WEEKLY_OFF_MANAGE',
    'AUDIT_LOG_VIEW',
    'LEAVE_APPLY',
    'LEAVE_VIEW_OWN',
    'PROFILE_VIEW_OWN',
    'PROFILE_EDIT_BASIC',
    'PASSWORD_CHANGE_OWN',
    'SCHEDULE_VIEW_OWN',
  ],
  TEAM_LEADER: [
    'LEAVE_TEAM_LEADER_APPROVE',
    'LEAVE_VIEW_TEAM',
    'LEAVE_APPLY',
    'LEAVE_VIEW_OWN',
    'PROFILE_VIEW_OWN',
    'PROFILE_EDIT_BASIC',
    'PASSWORD_CHANGE_OWN',
    'SCHEDULE_VIEW_OWN',
    'OVERTIME_APPLY_OWN',
  ],
  EMPLOYEE: [
    'LEAVE_APPLY',
    'LEAVE_VIEW_OWN',
    'PROFILE_VIEW_OWN',
    'PROFILE_EDIT_BASIC',
    'PASSWORD_CHANGE_OWN',
    'SCHEDULE_VIEW_OWN',
    'OVERTIME_APPLY_OWN',
  ],
};

let isAuthenticated: boolean = !isBrowserRuntime;
let isExplicitlyLoggedIn: boolean = false;
let currentRole: UserRole = isBrowserRuntime ? 'EMPLOYEE' : 'SUPER_ADMIN';
let currentUserId: number = isBrowserRuntime ? 0 : 1;
let currentEmployeeId: number = isBrowserRuntime ? 0 : 1;
let currentUsername: string = isBrowserRuntime ? '' : 'superadmin';
let currentFullName: string = isBrowserRuntime ? '' : 'Super Administrator';
let currentProfilePhotoUrl: string | null = null;
let currentPermissions: string[] = isBrowserRuntime ? [] : [...DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN];
let currentMustChangePassword: boolean = false;
let currentSessionToken: string | null = null;
let currentExpiresAt: number = 0;

/** In-memory elevated context; the signed-in Super Admin session is never overwritten or persisted. */
export interface SuperAdminUserContext {
  userId: number; employeeId: number; role: UserRole; username: string; fullName: string;
  permissions?: string[]; profilePhotoUrl?: string | null;
}
let superAdminUserContext: SuperAdminUserContext | null = null;
export function startSuperAdminUserContext(target: SuperAdminUserContext): boolean {
  if (!isUserAuthenticated() || currentRole !== 'SUPER_ADMIN' || !currentSessionToken) return false;
  if (!Number.isInteger(target.userId) || target.userId <= 0 || !Number.isInteger(target.employeeId) || target.employeeId <= 0) return false;
  if (!target.role || !target.username?.trim()) return false;
  superAdminUserContext = { ...target, permissions: [...(target.permissions || [])] };
  return true;
}
export function endSuperAdminUserContext(): void { superAdminUserContext = null; }
export function isViewingAsAnotherUser(): boolean { return superAdminUserContext !== null; }

const ROLE_VALUES: UserRole[] = [
  'SUPER_ADMIN',
  'TOP_MANAGEMENT',
  'HR',
  'TEAM_LEADER',
  'EMPLOYEE',
];

const VALID_MODULE_AND_TAB_IDS = new Set([
  'welcome',
  'dashboard',
  'my-leave',
  'leave-balance',
  'my-schedule',
  'holidays',
  'my-profile',
  'team-leader',
  'hr',
  'management',
  'reports',
  'administration',
  'users',
  'roles',
  'employees',
  'departments',
  'designations',
  'working-days',
  'weekly-offs',
  'leave-types',
  'leave-policies',
  'leave-balances',
  'shifts',
  'employee-shifts',
  'department-shifts',
  'overtime',
  'audit',
  'system-overview',
]);

const dynamicRolePermissionsMap: Record<string, string[]> = {};

export function registerClientRolePermissions(roleName: string, permissions: string[]): void {
  if (!roleName || typeof roleName !== 'string') return;
  const norm = roleName.trim().toUpperCase();
  if (!norm) return;
  dynamicRolePermissionsMap[norm] = Array.isArray(permissions) ? [...permissions] : [];
  if (currentRole === norm) {
    currentPermissions = [...dynamicRolePermissionsMap[norm]];
    persistSessionToStorage();
  }
}

export function formatRoleDisplayName(roleName?: string | null): string {
  if (!roleName) return 'Employee';
  const upper = roleName.trim().toUpperCase();
  switch (upper) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'TOP_MANAGEMENT':
      return 'Top Management';
    case 'HR':
      return 'HR';
    case 'TEAM_LEADER':
      return 'Team Leader';
    case 'EMPLOYEE':
      return 'Employee';
    default:
      return upper;
  }
}

function isBuiltInRole(val: unknown): boolean {
  return typeof val === 'string' && ROLE_VALUES.includes(val as UserRole);
}

function isUserRoleValue(val: unknown): val is UserRole {
  if (typeof val !== 'string' || !val.trim()) return false;
  if (ROLE_VALUES.includes(val as UserRole)) return true;
  if (VALID_MODULE_AND_TAB_IDS.has(val.trim().toLowerCase())) return false;
  return /^[A-Z0-9_]+$/.test(val.trim());
}

function resolveDefaultsForRole(role: UserRole): {
  userId: number;
  employeeId: number;
  username: string;
  fullName: string;
  permissions: string[];
} {
  if (role === 'SUPER_ADMIN') {
    return {
      userId: 1,
      employeeId: 1,
      username: 'superadmin',
      fullName: 'Super Administrator',
      permissions: [...DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN],
    };
  }
  if (role === 'HR') {
    return {
      userId: 2,
      employeeId: 2,
      username: 'hruser',
      fullName: 'HR Specialist',
      permissions: [...DEFAULT_ROLE_PERMISSIONS.HR],
    };
  }
  if (role === 'TOP_MANAGEMENT') {
    return {
      userId: 3,
      employeeId: 3,
      username: 'manager_john',
      fullName: 'John Operations Lead',
      permissions: [...DEFAULT_ROLE_PERMISSIONS.TOP_MANAGEMENT],
    };
  }
  if (role === 'TEAM_LEADER') {
    return {
      userId: 5,
      employeeId: 5,
      username: 'tl_robert',
      fullName: 'Robert Chen (Team Leader)',
      permissions: [...DEFAULT_ROLE_PERMISSIONS.TEAM_LEADER],
    };
  }
  if (role === 'EMPLOYEE') {
    return {
      userId: 4,
      employeeId: 4,
      username: 'alice_emp',
      fullName: 'Alice Johnson',
      permissions: [...DEFAULT_ROLE_PERMISSIONS.EMPLOYEE],
    };
  }
  return {
    userId: 4,
    employeeId: 4,
    username: role.toLowerCase(),
    fullName: formatRoleDisplayName(role),
    permissions: dynamicRolePermissionsMap[role] ? [...dynamicRolePermissionsMap[role]] : [],
  };
}

function computeSessionSignature(
  userId: number,
  username: string,
  role: string,
  issuedAt: number,
  expiresAt: number,
  nonce: string
): string {
  const raw = `mt_leave_v1|${userId}|${username.trim().toLowerCase()}|${role.trim().toUpperCase()}|${issuedAt}|${expiresAt}|${nonce}`;
  let h1 = 0xdeadbeef ^ raw.length;
  let h2 = 0x41c6ce57 ^ raw.length;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

function generateSessionNonce(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return (
    Math.random().toString(16).slice(2, 14).padEnd(12, '0') +
    Math.random().toString(16).slice(2, 14).padEnd(12, '0')
  );
}

function createSignedSessionToken(
  userId: number,
  username: string,
  role: UserRole,
  ttlMs: number = SESSION_TTL_MS
): { sessionToken: string; expiresAt: number } {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ttlMs;
  const nonce = generateSessionNonce();
  const sig = computeSessionSignature(userId, username, role, issuedAt, expiresAt, nonce);
  const sessionToken = `mts1.${issuedAt.toString(36)}.${expiresAt.toString(36)}.${nonce}.${sig}`;
  return { sessionToken, expiresAt };
}

export function isValidClientSessionPayload(
  parsed: Partial<ActiveClientSession> | null | undefined
): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  if (parsed.isAuthenticated !== true) return false;
  if (typeof parsed.userId !== 'number' || !Number.isInteger(parsed.userId) || parsed.userId <= 0) {
    return false;
  }
  if (typeof parsed.username !== 'string' || !parsed.username.trim()) {
    return false;
  }
  if (!isUserRoleValue(parsed.role)) {
    return false;
  }
  if (typeof parsed.sessionToken !== 'string' || !parsed.sessionToken.startsWith('mts2.')) {
    return false;
  }
  const parts = parsed.sessionToken.split('.');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
  if (typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt)) return false;
  return Date.now() < parsed.expiresAt;
}

function resetClientStateToUnauthenticated(): void {
  isAuthenticated = false;
  isExplicitlyLoggedIn = false;
  currentRole = 'EMPLOYEE';
  currentUserId = 0;
  currentEmployeeId = 0;
  currentUsername = '';
  currentFullName = '';
  currentProfilePhotoUrl = null;
  currentPermissions = [];
  currentMustChangePassword = false;
  currentSessionToken = null;
  currentExpiresAt = 0;
}

export function invalidateClientSessionAndRedirectToLogin(): void {
  resetClientStateToUnauthenticated();
  if (!isBrowserRuntime) return;
  try {
    window.localStorage?.removeItem(AUTH_STORAGE_KEY);
    window.sessionStorage?.clear();
  } catch {}
  try {
    const h = window.location.hash || '';
    if (!h.startsWith('#forgot-password') && !h.startsWith('#reset-password') && h !== '#login') {
      window.history.replaceState({ activeModule: 'login', loggedOut: true }, '', '#login');
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {}
}

function loadSessionFromStorage(): void {
  if (!isBrowserRuntime || !window.localStorage) return;
  resetClientStateToUnauthenticated();
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as Partial<ActiveClientSession>;
    if (parsed.isAuthenticated === false) {
      return;
    }
    if (!isValidClientSessionPayload(parsed)) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    const verifiedRole = parsed.role as UserRole;
    isAuthenticated = true;
    isExplicitlyLoggedIn = true;
    currentRole = verifiedRole;
    currentUserId = parsed.userId!;
    currentEmployeeId =
      typeof parsed.employeeId === 'number' && parsed.employeeId > 0 ? parsed.employeeId : 0;
    currentUsername = parsed.username!.trim();
    currentFullName = (parsed.fullName || parsed.username || '').trim();
    currentProfilePhotoUrl = parsed.profilePhotoUrl ?? null;
    currentPermissions = Array.isArray(parsed.permissions)
      ? [...parsed.permissions]
      : [...(DEFAULT_ROLE_PERMISSIONS[verifiedRole] || [])];
    currentMustChangePassword = Boolean(parsed.mustChangePassword);
    currentSessionToken = parsed.sessionToken!;
    currentExpiresAt =
      typeof parsed.expiresAt === 'number'
        ? parsed.expiresAt
        : parseInt(parsed.sessionToken!.split('.')[2], 36);
  } catch {
    resetClientStateToUnauthenticated();
    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {}
  }
}

function persistSessionToStorage(): void {
  if (!isBrowserRuntime || !window.localStorage) return;
  try {
    if (!isAuthenticated || !currentSessionToken || currentUserId <= 0) {
      const loggedOutPayload: ActiveClientSession = {
        isAuthenticated: false,
        role: 'EMPLOYEE',
        userId: 0,
        employeeId: 0,
        username: '',
        fullName: '',
        profilePhotoUrl: null,
        permissions: [],
        mustChangePassword: false,
        sessionToken: null,
        expiresAt: null,
      };
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedOutPayload));
      return;
    }
    const payload: ActiveClientSession = {
      isAuthenticated: true,
      role: currentRole,
      userId: currentUserId,
      employeeId: currentEmployeeId,
      username: currentUsername,
      fullName: currentFullName,
      profilePhotoUrl: currentProfilePhotoUrl,
      permissions: currentPermissions,
      mustChangePassword: currentMustChangePassword,
      sessionToken: currentSessionToken,
      expiresAt: currentExpiresAt,
    };
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

loadSessionFromStorage();

export function setActiveRole(
  role: UserRole,
  employeeId?: number,
  userId?: number,
  meta?: {
    username?: string;
    fullName?: string;
    profilePhotoUrl?: string | null;
    permissions?: string[];
  }
) {
  // Never allow unauthenticated browser state to escalate or self-authenticate via setActiveRole
  if (isBrowserRuntime && !isAuthenticated) {
    return;
  }
  // Prevent client-side role switching/escalation when a non-SUPER_ADMIN user is logged in
  if (isAuthenticated && isExplicitlyLoggedIn && currentRole !== 'SUPER_ADMIN' && role !== currentRole) {
    return;
  }
  const defaults = resolveDefaultsForRole(role);
  isAuthenticated = true;
  currentRole = role;
  currentUserId = userId ?? defaults.userId;
  currentEmployeeId = employeeId ?? defaults.employeeId;
  currentUsername = meta?.username || defaults.username;
  currentFullName = meta?.fullName || defaults.fullName;
  currentProfilePhotoUrl = meta?.profilePhotoUrl !== undefined ? meta.profilePhotoUrl : null;
  currentPermissions = Array.isArray(meta?.permissions)
    ? [...meta!.permissions]
    : [...defaults.permissions];
  if (Array.isArray(meta?.permissions)) {
    dynamicRolePermissionsMap[role] = [...meta!.permissions];
  }
  currentMustChangePassword = false;
  // Role changes are a UI preview only. Preserve the server-issued token for the
  // actual authenticated account; the backend permits preview headers only for a
  // verified SUPER_ADMIN token.
  if (!isBrowserRuntime) {
    const signed = createSignedSessionToken(currentUserId, currentUsername, currentRole);
    currentSessionToken = signed.sessionToken;
    currentExpiresAt = signed.expiresAt;
  }
  persistSessionToStorage();
}

export function loginUserSession(user: {
  id?: number;
  userId?: number;
  role?: UserRole;
  roleName?: UserRole;
  employeeId?: number | null;
  username?: string;
  fullName?: string;
  employeeName?: string | null;
  profilePhotoUrl?: string | null;
  permissions?: string[];
  mustChangePassword?: boolean;
  sessionToken?: string | null;
  expiresAt?: number | null;
}): ActiveClientSession {
  const resolvedRole = (user.roleName || user.role || 'EMPLOYEE') as UserRole;
  const defaults = resolveDefaultsForRole(resolvedRole);
  const resolvedUserId = user.userId ?? user.id ?? (isBrowserRuntime ? 0 : defaults.userId);
  const resolvedUsername = (user.username || (isBrowserRuntime ? '' : defaults.username)).trim();

  if (isBrowserRuntime && (resolvedUserId <= 0 || !resolvedUsername)) {
    invalidateClientSessionAndRedirectToLogin();
    return getActiveUserSession();
  }

  isAuthenticated = true;
  isExplicitlyLoggedIn = true;
  currentRole = resolvedRole;
  currentUserId = resolvedUserId;
  currentEmployeeId = user.employeeId ?? (isBrowserRuntime ? 0 : defaults.employeeId);
  currentUsername = resolvedUsername;
  currentFullName =
    user.fullName || user.employeeName || (isBrowserRuntime ? resolvedUsername : defaults.fullName);
  currentProfilePhotoUrl = user.profilePhotoUrl ?? null;
  currentPermissions = Array.isArray(user.permissions)
    ? [...user.permissions]
    : [...(DEFAULT_ROLE_PERMISSIONS[resolvedRole] || [])];
  currentMustChangePassword = Boolean(user.mustChangePassword);
  if (Array.isArray(user.permissions)) {
    dynamicRolePermissionsMap[resolvedRole] = [...user.permissions];
  }
  const suppliedToken = typeof user.sessionToken === 'string' ? user.sessionToken.trim() : '';
  const canReuseCurrentToken = Boolean(
    currentSessionToken &&
    currentExpiresAt > Date.now() &&
    currentUserId === resolvedUserId &&
    currentUsername.trim().toLowerCase() === resolvedUsername.toLowerCase() &&
    currentRole === resolvedRole
  );
  if (isBrowserRuntime && !suppliedToken && !canReuseCurrentToken) {
    invalidateClientSessionAndRedirectToLogin();
    return getActiveUserSession();
  }
  if (suppliedToken) {
    currentSessionToken = suppliedToken;
    currentExpiresAt =
      typeof user.expiresAt === 'number' && user.expiresAt > Date.now()
        ? user.expiresAt
        : Date.now() + SESSION_TTL_MS;
  } else if (canReuseCurrentToken) {
    // Keep the current server-issued token when refreshing the same signed-in user.
  } else {
    const signed = createSignedSessionToken(currentUserId, currentUsername, currentRole);
    currentSessionToken = signed.sessionToken;
    currentExpiresAt = signed.expiresAt;
  }
  persistSessionToStorage();
  return getActiveUserSession();
}

export async function logoutUserSession(): Promise<void> {
  try {
    if (isAuthenticated && typeof fetch !== 'undefined') {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-user-id': String(currentUserId),
          'x-employee-id': String(currentEmployeeId),
          'x-username': currentUsername,
          ...(currentSessionToken ? { 'x-session-token': currentSessionToken } : {}),
        },
      }).catch(() => {});
    }
  } finally {
    resetClientStateToUnauthenticated();

    if (isBrowserRuntime) {
      try {
        window.sessionStorage?.clear();
      } catch {}
      persistSessionToStorage();
      try {
        window.history.replaceState({ activeModule: 'login', loggedOut: true }, '', '#login');
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch {}
    }
  }
}

export function updateActiveUserPhoto(profilePhotoUrl: string | null) {
  currentProfilePhotoUrl = profilePhotoUrl;
  persistSessionToStorage();
}

export function mustUserChangePassword(): boolean {
  return Boolean(isUserAuthenticated() && currentMustChangePassword);
}

export function clearMustChangePasswordFlag(): void {
  currentMustChangePassword = false;
  persistSessionToStorage();
}

export function isUserAuthenticated(): boolean {
  if (!isAuthenticated) return false;
  if (isBrowserRuntime) {
    if (!currentSessionToken || currentUserId <= 0 || !currentUsername) {
      resetClientStateToUnauthenticated();
      return false;
    }
    if (currentExpiresAt > 0 && Date.now() >= currentExpiresAt) {
      invalidateClientSessionAndRedirectToLogin();
      return false;
    }
  }
  return isAuthenticated;
}

export function getActiveUserSession(): ActiveClientSession {
  const active = isUserAuthenticated();
  const target = active ? superAdminUserContext : null;
  return {
    isAuthenticated: active,
    role: active ? (target?.role || currentRole) : 'EMPLOYEE',
    userId: active ? (target?.userId || currentUserId) : 0,
    employeeId: active ? (target?.employeeId || currentEmployeeId) : 0,
    username: active ? (target?.username || currentUsername) : '',
    fullName: active ? (target?.fullName || currentFullName) : '',
    profilePhotoUrl: active ? (target ? target.profilePhotoUrl ?? null : currentProfilePhotoUrl) : null,
    permissions: active ? [...(target?.permissions || currentPermissions)] : [],
    mustChangePassword: active ? (target ? false : currentMustChangePassword) : false,
    sessionToken: active ? currentSessionToken : null,
    expiresAt: active ? currentExpiresAt : null,
  };
}

export function getClientSession(): ActiveClientSession {
  return getActiveUserSession();
}

export function getActiveRole(): UserRole { return superAdminUserContext?.role || currentRole; }
export function getActiveUserId(): number { return superAdminUserContext?.userId || currentUserId; }
export function getActiveEmployeeId(): number { return superAdminUserContext?.employeeId || currentEmployeeId; }
export function getActiveUserPermissions(): string[] { return [...(superAdminUserContext?.permissions || currentPermissions)]; }

const PERMISSION_ALIASES: Record<string, string[]> = {
  'audit.view': ['AUDIT_LOG_VIEW', 'audit.view', 'AUDIT_VIEW'],
  AUDIT_VIEW: ['AUDIT_LOG_VIEW', 'audit.view', 'AUDIT_VIEW'],
  'system.settings.manage': ['ALL_PERMISSIONS', 'system.settings.manage'],
  'reports.view': ['LEAVE_VIEW_ALL', 'REPORT_VIEW', 'reports.view', 'reports.export'],
  'reports.export': ['LEAVE_VIEW_ALL', 'REPORT_VIEW', 'reports.export'],
  REPORT_VIEW: ['LEAVE_VIEW_ALL', 'REPORT_VIEW', 'reports.view', 'reports.export'],
  LEAVE_BALANCE_ADJUST: ['LEAVE_BALANCE_MANAGE', 'LEAVE_BALANCE_ADJUST', 'ALL_PERMISSIONS'],
  LEAVE_BALANCE_MANAGE: ['LEAVE_BALANCE_ADJUST', 'LEAVE_BALANCE_MANAGE', 'ALL_PERMISSIONS'],
};

function resolvePermissionsForRoleCheck(
  role: UserRole,
  roleOverride?: UserRole,
  permissionsOverride?: string[]
): string[] {
  if (Array.isArray(permissionsOverride)) {
    return permissionsOverride;
  }
  const contextRole = superAdminUserContext?.role || currentRole;
  const contextPermissions = superAdminUserContext?.permissions || currentPermissions;
  if (!roleOverride || roleOverride === contextRole) {
    if (contextPermissions.length > 0) return contextPermissions;
    if (!isBuiltInRole(role)) return dynamicRolePermissionsMap[role] || [];
    return DEFAULT_ROLE_PERMISSIONS[role] || [];
  }
  return (
    DEFAULT_ROLE_PERMISSIONS[roleOverride] ||
    dynamicRolePermissionsMap[roleOverride] ||
    []
  );
}

export function hasClientPermission(
  permissionCode: string,
  roleOverride?: UserRole,
  permissionsOverride?: string[]
): boolean {
  if (!isAuthenticated && !roleOverride) return false;
  const role = roleOverride || superAdminUserContext?.role || currentRole;
  if (role === 'SUPER_ADMIN') return true;
  const perms = resolvePermissionsForRoleCheck(role, roleOverride, permissionsOverride);
  if (perms.includes('ALL_PERMISSIONS') || perms.includes('*')) return true;
  if (perms.includes(permissionCode)) return true;
  const aliases = PERMISSION_ALIASES[permissionCode] || [];
  return aliases.some((code) => perms.includes(code));
}

export function getDefaultModuleForRole(roleOverride?: UserRole): string {
  const role = roleOverride || currentRole;
  if (role === 'SUPER_ADMIN') return 'administration';
  return 'dashboard';
}

/**
 * Enforces strict role & permission module boundaries for navigation and direct routes.
 * Supports both canAccessModule(moduleId, roleOverride) and canAccessModule(roleOverride, moduleId).
 */
export function canAccessModule(
  arg1: string,
  arg2?: string,
  permissionsOverride?: string[]
): boolean {
  let moduleId: string;
  let roleOverride: UserRole | undefined;
  if (isUserRoleValue(arg1) && typeof arg2 === 'string') {
    roleOverride = arg1;
    moduleId = arg2;
  } else {
    moduleId = arg1;
    roleOverride = isUserRoleValue(arg2) ? arg2 : undefined;
  }

  if (!isAuthenticated && !roleOverride) return false;
  if (!roleOverride && isAuthenticated && currentMustChangePassword) {
    return moduleId === 'change-password';
  }
  const role = roleOverride || currentRole;
  const perms = resolvePermissionsForRoleCheck(role, roleOverride, permissionsOverride);
  const builtIn = isBuiltInRole(role);

  if (moduleId === 'welcome' || moduleId === 'dashboard' || moduleId === 'my-profile') {
    return true;
  }

  const selfServiceModules = [
    'my-leave',
    'leave-balance',
    'my-schedule',
    'holidays',
  ];
  if (selfServiceModules.includes(moduleId)) {
    if (builtIn) {
      return true;
    }
    if (moduleId === 'my-leave' || moduleId === 'leave-balance') {
      return (
        perms.includes('LEAVE_APPLY') ||
        perms.includes('LEAVE_VIEW_OWN') ||
        perms.includes('LEAVE_VIEW_TEAM') ||
        perms.includes('LEAVE_VIEW_ALL') ||
        perms.includes('ALL_PERMISSIONS')
      );
    }
    if (moduleId === 'my-schedule' || moduleId === 'holidays') {
      return (
        perms.includes('SCHEDULE_VIEW_OWN') ||
        perms.includes('SHIFT_VIEW') ||
        perms.includes('HOLIDAY_MANAGE') ||
        perms.includes('LEAVE_APPLY') ||
        perms.includes('LEAVE_VIEW_OWN') ||
        perms.includes('ALL_PERMISSIONS')
      );
    }
  }

  // Stage 1 queue is shared by all roles, but the server returns only employees
  // assigned to the signed-in user as their Reporting Person.
  if (moduleId === 'team-leader') {
    return builtIn ||
      perms.includes('LEAVE_TEAM_LEADER_APPROVE') ||
      (!builtIn && (perms.includes('LEAVE_VIEW_TEAM') || perms.includes('LEAVE_TEAM_LEADER_APPROVE')));
  }

  // EMPLOYEE is otherwise strictly limited to Employee Portal self-service modules
  if (role === 'EMPLOYEE') {
    return false;
  }

  if (role === 'SUPER_ADMIN' || perms.includes('ALL_PERMISSIONS')) {
    return true;
  }

  switch (moduleId) {
    case 'hr':
      return role === 'HR' || perms.includes('LEAVE_HR_APPROVE');
    case 'management':
      return role === 'TOP_MANAGEMENT' || perms.includes('LEAVE_FINAL_APPROVE');
    case 'reports':
      return (
        role === 'HR' ||
        role === 'TOP_MANAGEMENT' ||
        perms.includes('LEAVE_VIEW_ALL') ||
        perms.includes('REPORT_VIEW') ||
        perms.includes('reports.view') ||
        perms.includes('reports.export')
      );
    case 'administration':
      if (builtIn) {
        return (
          role === 'HR' ||
          perms.includes('EMPLOYEE_EDIT') ||
          perms.includes('HOLIDAY_MANAGE') ||
          perms.includes('SHIFT_ASSIGN') ||
          perms.includes('WEEKLY_OFF_MANAGE')
        );
      }
      return perms.some((p) =>
        [
          'USER_CREATE',
          'USER_EDIT',
          'USER_DELETE',
          'USER_STATUS',
          'ROLE_ASSIGN',
          'EMPLOYEE_VIEW',
          'EMPLOYEE_CREATE',
          'EMPLOYEE_EDIT',
          'EMPLOYEE_DELETE',
          'EMPLOYEE_STATUS',
          'DEPARTMENT_MANAGE',
          'DESIGNATION_MANAGE',
          'WORKING_DAYS_MANAGE',
          'WEEKLY_OFF_MANAGE',
          'SHIFT_VIEW',
          'SHIFT_CREATE',
          'SHIFT_EDIT',
          'SHIFT_ASSIGN',
          'HOLIDAY_MANAGE',
          'OVERTIME_REVIEW',
          'OVERTIME_MANAGE',
          'AUDIT_LOG_VIEW',
        ].includes(p)
      );
    default:
      return false;
  }
}

export function canAccessAdminTab(
  arg1: string,
  arg2?: string,
  permissionsOverride?: string[]
): boolean {
  let tabId: string;
  let roleOverride: UserRole | undefined;
  if (isUserRoleValue(arg1) && typeof arg2 === 'string') {
    roleOverride = arg1;
    tabId = arg2;
  } else {
    tabId = arg1;
    roleOverride = isUserRoleValue(arg2) ? arg2 : undefined;
  }

  const role = roleOverride || currentRole;
  // System Audit is strictly Super Admin-only, regardless of custom role permissions.
  if (tabId === 'audit') return role === 'SUPER_ADMIN';
  // Attendance management is restricted to HR and Super Admin; employees use self-service elsewhere.
  // Weekly-off overrides are explicitly available to Super Admin and HR, even if
  // an older/custom Administration module permission set omitted the tab permission.
  if (tabId === 'weekly-offs' && (role === 'SUPER_ADMIN' || role === 'HR')) return true;
  // HR may manage employee/department/designation records, but never user accounts or system roles.
  if (role === 'HR' && (tabId === 'users' || tabId === 'roles')) return false;
  if (!canAccessModule('administration', role, permissionsOverride)) {
    return false;
  }
  if (role === 'SUPER_ADMIN') {
    return true;
  }
  const perms = resolvePermissionsForRoleCheck(role, roleOverride, permissionsOverride);
  if (perms.includes('ALL_PERMISSIONS')) {
    return true;
  }
  const builtIn = isBuiltInRole(role);

  switch (tabId) {
    case 'employees':
      return (
        perms.includes('EMPLOYEE_VIEW') ||
        perms.includes('EMPLOYEE_EDIT') ||
        perms.includes('EMPLOYEE_CREATE')
      );
    case 'departments':
      return perms.includes('DEPARTMENT_MANAGE') || perms.includes('EMPLOYEE_EDIT');
    case 'designations':
      return perms.includes('DESIGNATION_MANAGE') || perms.includes('EMPLOYEE_EDIT');
    case 'working-days':
      return perms.includes('WORKING_DAYS_MANAGE') || perms.includes('WEEKLY_OFF_MANAGE');
    case 'weekly-offs':
      // Weekly-off changes are an operational admin task; always expose this section to Super Admin and HR.
      return role === 'SUPER_ADMIN' || role === 'HR' || perms.includes('WEEKLY_OFF_MANAGE');
    case 'leave-balance':
    case 'leave-balances':
      return perms.includes('LEAVE_VIEW_ALL') || perms.includes('EMPLOYEE_EDIT') || role === 'SUPER_ADMIN' || role === 'HR';
    case 'shifts':
    case 'employee-shifts':
    case 'department-shifts':
      return (
        perms.includes('SHIFT_VIEW') ||
        perms.includes('SHIFT_ASSIGN') ||
        perms.includes('SHIFT_EDIT') ||
        perms.includes('SHIFT_CREATE')
      );
    case 'attendance':
      return role === 'SUPER_ADMIN' || role === 'HR' || perms.includes('ATTENDANCE_MANAGE');
    case 'overtime':
      return perms.includes('OVERTIME_REVIEW') || perms.includes('OVERTIME_MANAGE');
    case 'holidays':
      return perms.includes('HOLIDAY_MANAGE');
    case 'users':
      return (
        !builtIn &&
        (perms.includes('USER_CREATE') ||
          perms.includes('USER_EDIT') ||
          perms.includes('USER_DELETE') ||
          perms.includes('USER_STATUS'))
      );
    case 'roles':
      return !builtIn && perms.includes('ROLE_ASSIGN');
    case 'audit':
      return !builtIn && perms.includes('AUDIT_LOG_VIEW');
    case 'leave-types':
    case 'leave-policies':
    case 'leave-requests':
    case 'workflow-settings':
      return role === 'SUPER_ADMIN';
    case 'system-overview':
      return false;
    default:
      return false;
  }
}

export function getAllowedNavModules(
  roleOverride?: UserRole,
  permissionsOverride?: string[]
): string[] {
  const allModules = [
    'welcome',
    'dashboard',
    'my-leave',
    'leave-balance',
    'my-schedule',
    'my-profile',
    'team-leader',
    'hr',
    'management',
    'reports',
    'administration',
  ];
  return allModules.filter((m) => canAccessModule(m, roleOverride, permissionsOverride));
}

export function getVisibleNavModules(
  roleOverride?: UserRole,
  permissionsOverride?: string[]
): string[] {
  const navModules = [
    'dashboard',
    'my-leave',
    'leave-balance',
    'my-schedule',
    'holidays',
    'my-profile',
    'team-leader',
    'hr',
    'management',
    'reports',
    'administration',
  ];
  return navModules.filter((m) => canAccessModule(m, roleOverride, permissionsOverride));
}

export function getVisibleAdminTabs(
  roleOverride?: UserRole,
  permissionsOverride?: string[]
): string[] {
  const allTabs = [
    'users',
    'roles',
    'employees',
    'departments',
    'designations',
    'working-days',
    'leave-types',
    'leave-policies',
    'leave-balance',
    'holidays',
    'shifts',
    'overtime',
    'audit',
  ];
  return allTabs.filter((t) => canAccessAdminTab(t, roleOverride, permissionsOverride));
}

export function canAccessFrontendRoute(
  pathOrModule: string,
  roleOverride?: UserRole,
  permissionsOverride?: string[]
): boolean {
  const cleaned = (pathOrModule || '').trim().replace(/^[#/]+/, '').split('?')[0].split('/')[0] || 'dashboard';
  if (!roleOverride && isAuthenticated && currentMustChangePassword) {
    return cleaned === 'change-password';
  }
  if (cleaned === 'system-overview') {
    const role = roleOverride || currentRole;
    return role === 'SUPER_ADMIN';
  }
  return canAccessModule(cleaned, roleOverride, permissionsOverride);
}

export function getAuthHeaders(): Record<string, string> {
  if (!isUserAuthenticated()) {
    return {
      'x-auth-state': 'LOGGED_OUT',
      'x-user-role': 'LOGGED_OUT',
      'Content-Type': 'application/json',
    };
  }
  const target = superAdminUserContext;
  return {
    'x-user-role': target?.role || currentRole,
    'x-user-id': String(target?.userId || currentUserId),
    'x-employee-id': String(target?.employeeId || currentEmployeeId),
    'x-username': target?.username || currentUsername,
    ...(currentSessionToken ? { 'x-session-token': currentSessionToken } : {}),
    'Content-Type': 'application/json',
  };
}

/**
 * Safely parses a fetch Response as JSON after inspecting HTTP status and Content-Type.
 * Never exposes raw HTML ("<!DOCTYPE...") parse errors to the user.
 */
export async function parseApiJson<T = any>(response: Response): Promise<T> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const rawText = await response.text();
  const trimmed = rawText.trim();

  if (
    contentType.includes('text/html') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html')
  ) {
    if (response.status === 413) {
      throw new Error('Attachment or request payload is too large (HTTP 413). Please upload a smaller file.');
    }
    if (response.status === 404) {
      throw new Error(`Requested API endpoint was not found (HTTP 404).`);
    }
    if (response.status >= 500) {
      throw new Error(`Server temporarily unavailable (HTTP ${response.status}). Please try again.`);
    }
    throw new Error(
      `Server returned an unexpected HTML response instead of JSON (HTTP ${response.status}). Please refresh and try again.`
    );
  }

  if (!trimmed) {
    if (!response.ok) {
      throw new Error(`Request failed with status HTTP ${response.status}.`);
    }
    return {} as T;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `Invalid response format from server (HTTP ${response.status}). Expected JSON response.`
    );
  }
}

/**
 * Standard fetch wrapper that injects role & identity headers for RBAC enforcement
 * and guards response.json() against non-JSON / HTML payloads.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (!isUserAuthenticated()) {
    headers.set('x-auth-state', 'LOGGED_OUT');
    headers.set('x-user-role', 'LOGGED_OUT');
  } else {
    const target = superAdminUserContext;
    headers.set('x-user-role', target?.role || currentRole);
    headers.set('x-user-id', String(target?.userId || currentUserId));
    headers.set('x-employee-id', String(target?.employeeId || currentEmployeeId));
    headers.set('x-username', target?.username || currentUsername);
    if (currentSessionToken) {
      headers.set('x-session-token', currentSessionToken);
    }
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (
    isBrowserRuntime &&
    response.status === 401 &&
    !url.includes('/api/auth/login') &&
    !url.includes('/api/auth/forgot-password') &&
    !url.includes('/api/auth/reset-password')
  ) {
    invalidateClientSessionAndRedirectToLogin();
  }

  // Refresh navigation approval badges immediately after a successful leave-request mutation.
  const method = (options.method || 'GET').toUpperCase();
  if (
    isBrowserRuntime &&
    response.ok &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
    /\/api\/(?:team-leader|hr|management)\/leave-requests|\/api\/(?:my-leave|leave-requests|leave)\//i.test(url)
  ) {
    window.dispatchEvent(new CustomEvent('leave-approval-queue-updated'));
  }

  // Guard response.json() so callers never hit raw "Unexpected token '<', \"<!DOCTYPE \"..."
  response.json = () => parseApiJson(response);

  return response;
}
