import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Calendar,
  PieChart,
  Users,
  Briefcase,
  Settings,
  Home,
  Database,
  Clock,
  ShieldCheck,
  Building2,
  Layers,
  FileSpreadsheet,
  Sliders,
  User,
  Shield,
  Building,
  Award,
  CalendarDays,
  LogOut,
  ChevronDown,
  Lock,
  Eye,
  EyeOff,
  Upload,
  Trash2,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Menu,
  X,
  ChevronRight,
  ArrowLeft,
  Search,
  Wallet,
} from 'lucide-react';
import { MT_THEME } from './utils/theme.ts';
import { LeaveTypesAdmin } from './components/LeaveTypesAdmin.tsx';
import { LeavePoliciesAdmin } from './components/LeavePoliciesAdmin.tsx';
import { HolidayCalendarAdmin } from './components/HolidayCalendarAdmin.tsx';
import { ShiftScheduleAdmin } from './components/ShiftScheduleAdmin.tsx';
import { UserManagementAdmin } from './components/UserManagementAdmin.tsx';
import { WorkingDaysAdmin } from './components/admin/WorkingDaysAdmin.tsx';
import { MyProfile } from './components/MyProfile.tsx';
import { OvertimeAdmin } from './components/OvertimeAdmin.tsx';
import { AttendanceAdmin } from './components/AttendanceAdmin.tsx';
import { SystemAuditAdmin } from './components/SystemAuditAdmin.tsx';
import { AdminLeaveBalance } from './components/AdminLeaveBalance.tsx';
import { AdminSystemSettings } from './components/AdminSystemSettings.tsx';
import { AdminLeaveRequests } from './components/AdminLeaveRequests.tsx';
import {
  clearEmployee360ProfileState,
  getPersistedEmployee360ProfileState,
  OpenEmployee360Payload,
} from './components/Employee360Trigger.tsx';
import { AdminSettingsModal } from './components/AdminSettingsModal.tsx';
import { NotificationCenter } from './components/NotificationCenter.tsx';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { MyLeaveBalance } from './components/MyLeaveBalance.tsx';
import { MyLeavePortal } from './components/MyLeavePortal.tsx';
import { MySchedule } from './components/MySchedule.tsx';
import { TeamLeaderApprovalDashboard } from './components/TeamLeaderApprovalDashboard.tsx';
import { HrApprovalDashboard } from './components/HrApprovalDashboard.tsx';
import { ManagementApprovalDashboard } from './components/ManagementApprovalDashboard.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { ReportsMis } from './components/ReportsMis.tsx';
import { CompanyBrandingDto, UserDto, UserRole } from './types/leave.ts';
import {
  apiFetch,
  canAccessAdminTab,
  canAccessModule,
  clearMustChangePasswordFlag,
  getActiveRole,
  getActiveUserId,
  getActiveUserSession,
  getDefaultModuleForRole,
  isUserAuthenticated,
  loginUserSession,
  logoutUserSession,
  mustUserChangePassword,
  startSuperAdminUserContext,
  endSuperAdminUserContext,
  isViewingAsAnotherUser,
} from './lib/api.ts';

type NavModule =
  | 'welcome'
  | 'dashboard'
  | 'my-leave'
  | 'leave-balance'
  | 'my-schedule'
  | 'attendance'
  | 'my-profile'
  | 'team-leader'
  | 'hr'
  | 'management'
  | 'reports'
  | 'administration';

type AdminTab =
  | 'users'
  | 'employees'
  | 'roles'
  | 'departments'
  | 'designations'
  | 'working-days'
  | 'weekly-offs'
  | 'shifts'
  | 'employee-shifts'
  | 'department-shifts'
  | 'overtime'
  | 'attendance'
  | 'audit'
  | 'leave-types'
  | 'leave-policies'
  | 'holidays'
  | 'leave-balances'
  | 'leave-requests'
  | 'workflow-settings'
  | 'system-overview';

interface SystemSettingItem {
  settingKey: string;
  settingValue: string;
  description?: string | null;
}

interface RoleItem {
  name: string;
  description?: string | null;
}

const VALID_MODULES: NavModule[] = [
  'welcome',
  'dashboard',
  'my-leave',
  'leave-balance',
  'my-schedule',
  'attendance',
  'my-profile',
  'team-leader',
  'hr',
  'management',
  'reports',
  'administration',
];

const VALID_ADMIN_TABS: AdminTab[] = [
  'users',
  'employees',
  'roles',
  'departments',
  'designations',
  'working-days',
  'weekly-offs',
  'shifts',
  'employee-shifts',
  'department-shifts',
  'overtime',
  'attendance',
  'audit',
  'leave-types',
  'leave-policies',
  'holidays',
  'leave-balances',
  'leave-requests',
  'workflow-settings',
  'system-overview',
];

function parseNavFromLocation(roleOverride?: UserRole): { module: NavModule; tab: AdminTab } {
  const role = roleOverride || getActiveRole();
  const defaultMod = (getDefaultModuleForRole(role) as NavModule) || 'dashboard';
  const defaultTab: AdminTab = role === 'SUPER_ADMIN' ? 'users' : 'employees';

  if (typeof window === 'undefined') {
    return { module: defaultMod, tab: defaultTab };
  }
  const st = window.history.state;
  if (st && VALID_MODULES.includes(st.activeModule)) {
    return {
      module: st.activeModule,
      tab: VALID_ADMIN_TABS.includes(st.adminTab) ? st.adminTab : defaultTab,
    };
  }
  const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
  if (rawHash) {
    const parts = rawHash.split('/');
    if (parts[0] === 'administration' && parts[1] && VALID_ADMIN_TABS.includes(parts[1] as AdminTab)) {
      return { module: 'administration', tab: parts[1] as AdminTab };
    }
    if (VALID_ADMIN_TABS.includes(parts[0] as AdminTab)) {
      return { module: 'administration', tab: parts[0] as AdminTab };
    }
    if (VALID_MODULES.includes(parts[0] as NavModule)) {
      return { module: parts[0] as NavModule, tab: defaultTab };
    }
  }
  const rawPath = window.location.pathname.replace(/^\/+/, '').trim();
  if (rawPath) {
    const parts = rawPath.split('/');
    const last = parts[parts.length - 1];
    if (VALID_ADMIN_TABS.includes(last as AdminTab)) {
      return { module: 'administration', tab: last as AdminTab };
    }
    if (VALID_MODULES.includes(last as NavModule)) {
      return { module: last as NavModule, tab: defaultTab };
    }
  }
  return { module: defaultMod, tab: defaultTab };
}

export default function App() {
  const initialRole = getActiveRole();
  const initialNav = parseNavFromLocation(initialRole);
  const [isAuthenticatedState, setIsAuthenticatedState] = useState<boolean>(isUserAuthenticated());
  const [activeModule, setActiveModuleState] = useState<NavModule>(initialNav.module);
  // Increment on every navigation click so the current module can dismiss any open detail/profile view,
  // even when the user clicks the already-selected navigation item.
  const [navigationResetKey, setNavigationResetKey] = useState(0);
  const [adminTab, setAdminTabState] = useState<AdminTab>(initialNav.tab);
  const adminDropdownNavRef = useRef<HTMLDivElement | null>(null);
  const [activeRole, setActiveRoleState] = useState<UserRole>(initialRole);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserDto | null>(null);
  const [companyBranding, setCompanyBranding] = useState<CompanyBrandingDto>({
    applicationName: 'Maestro Leave Management',
    hasCustomLogo: false,
    logoUrl: null,
  });
  const [settings, setSettings] = useState<SystemSettingItem[]>([]);
  const [, setRoles] = useState<RoleItem[]>([]);
  const [dbStatus, setDbStatus] = useState<{ isConfigured: boolean; tablesDefined?: string[] }>({
    isConfigured: false,
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [mobileAdminSearch, setMobileAdminSearch] = useState('');
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [drillDownTarget, setDrillDownTarget] = useState<OpenEmployee360Payload | null>(() =>
    getPersistedEmployee360ProfileState()
  );
  const [viewingUser, setViewingUser] = useState<{ userId: number; employeeId: number; employeeName: string; employeeCode?: string; role: UserRole } | null>(null);
  const [approvalCounts, setApprovalCounts] = useState<{ teamLeader: number; hr: number; management: number }>({
    teamLeader: 0,
    hr: 0,
    management: 0,
  });

  // Close Administration dropdowns when the user clicks elsewhere or presses Escape.
  useEffect(() => {
    const closeAdminDropdowns = () => {
      adminDropdownNavRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((item) => {
        item.open = false;
      });
    };
    const handlePointerDown = (event: PointerEvent) => {
      const openDetails = adminDropdownNavRef.current?.querySelector<HTMLDetailsElement>('details[open]');
      if (openDetails && !openDetails.contains(event.target as Node)) closeAdminDropdowns();
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeAdminDropdowns(); };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('pointerdown', handlePointerDown); document.removeEventListener('keydown', handleKeyDown); };
  }, []);

  // Keep navigation badges synchronized without continuously querying queues users cannot act on.
  useEffect(() => {
    if (!isAuthenticatedState) {
      setApprovalCounts({ teamLeader: 0, hr: 0, management: 0 });
      return;
    }
    let cancelled = false;
    const queueRole = String(viewingUser?.role || activeRole || '').trim().toUpperCase();
    const allQueues = [
      { key: 'teamLeader' as const, endpoint: '/api/team-leader/leave-requests?status=PENDING' },
      { key: 'hr' as const, endpoint: '/api/hr/leave-requests?status=PENDING' },
      { key: 'management' as const, endpoint: '/api/management/leave-requests?status=PENDING' },
    ];
    // HR can handle reporting-person queues as a fallback; other roles only load their own stage.
    const relevantQueues = queueRole === 'SUPER_ADMIN'
      ? allQueues
      : queueRole === 'HR'
        ? allQueues.filter((queue) => queue.key === 'teamLeader' || queue.key === 'hr')
        : queueRole === 'TEAM_LEADER' || queueRole === 'REPORTING_PERSON'
          ? allQueues.filter((queue) => queue.key === 'teamLeader')
          : queueRole === 'TOP_MANAGEMENT' || queueRole === 'MANAGEMENT'
            ? allQueues.filter((queue) => queue.key === 'management')
            : queueRole === 'EMPLOYEE'
              ? []
              : allQueues;
    const refreshApprovalCounts = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      try {
        const results = await Promise.all(relevantQueues.map(async ({ key, endpoint }) => {
          const response = await apiFetch(endpoint, { cache: 'no-store' });
          if (!response.ok) return { key, requests: [] as any[] };
          const payload = await response.json();
          const requests = Array.isArray(payload.leaveRequests) ? payload.leaveRequests :
            Array.isArray(payload.requests) ? payload.requests : [];
          return { key, requests };
        }));
        const nextCounts = { teamLeader: 0, hr: 0, management: 0 };
        const isPending = (request: any) => String(request.finalStatus || 'PENDING').toUpperCase() === 'PENDING';
        for (const { key, requests } of results) {
          if (key === 'teamLeader') {
            nextCounts.teamLeader = requests.filter((request: any) => isPending(request) && String(request.teamLeaderDecision || 'PENDING').toUpperCase() === 'PENDING').length;
          } else if (key === 'hr') {
            nextCounts.hr = requests.filter((request: any) => isPending(request) && String(request.hrDecision || 'PENDING').toUpperCase() === 'PENDING' && String(request.teamLeaderDecision || 'PENDING').toUpperCase() !== 'REJECTED').length;
          } else {
            nextCounts.management = requests.filter((request: any) => isPending(request) && String(request.managementDecision || 'PENDING').toUpperCase() === 'PENDING').length;
          }
        }
        if (!cancelled) setApprovalCounts(nextCounts);
      } catch {
        // Keep the last successfully loaded counts if a temporary network error occurs.
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshApprovalCounts();
    };
    void refreshApprovalCounts();
    // Counts refresh immediately on focus/actions, and every minute while the tab is visible.
    const intervalId = window.setInterval(() => void refreshApprovalCounts(), 60000);
    window.addEventListener('focus', refreshApprovalCounts);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('leave-approval-queue-updated', refreshApprovalCounts);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshApprovalCounts);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('leave-approval-queue-updated', refreshApprovalCounts);
    };
  }, [isAuthenticatedState, activeRole, currentUserProfile, viewingUser]);


  useEffect(() => {
    const handleOpenEmployee360 = (e: Event) => {
      const customEvent = e as CustomEvent<OpenEmployee360Payload>;
      if (customEvent.detail) {
        setIsMobileDrawerOpen(false);
        setIsUserMenuOpen(false);
        setDrillDownTarget(customEvent.detail);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('open-employee-360', handleOpenEmployee360);
    const handleOpenEmployeeDashboard = async (e: Event) => {
      const detail = (e as CustomEvent<{ employeeId: number; employeeName: string; employeeCode?: string }>).detail;
      if (!detail?.employeeId || getActiveRole() !== 'SUPER_ADMIN' || isViewingAsAnotherUser()) return;
      try {
        const [employeeResponse, roleResponse] = await Promise.all([apiFetch('/api/employees'), apiFetch('/api/roles')]);
        if (!employeeResponse.ok) throw new Error('Employee account details could not be loaded.');
        const employeePayload = await employeeResponse.json();
        const rolePayload = roleResponse.ok ? await roleResponse.json() : { roles: [] };
        const employee = (employeePayload.employees || []).find((item: any) => Number(item.id) === Number(detail.employeeId));
        if (!employee || !Number(employee.userId)) throw new Error('This employee has no linked user account, so their actual dashboard cannot be opened.');
        const role = String(employee.role || employee.operationalRole || 'EMPLOYEE').trim().toUpperCase() as UserRole;
        const normalize = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[\\s-]+/g, '_');
        const roleRecord = (rolePayload.roles || []).find((item: any) => [item.name, item.code, item.displayName].some((value: unknown) => normalize(value) === normalize(role)));
        const started = startSuperAdminUserContext({ userId: Number(employee.userId), employeeId: Number(employee.id), role,
          username: String(employee.username || employee.officialEmail || employee.email || ''),
          fullName: String(employee.fullName || employee.employeeName || detail.employeeName || ''),
          profilePhotoUrl: employee.profilePhotoUrl || null,
          permissions: Array.isArray(roleRecord?.permissions) ? roleRecord.permissions : [] });
        if (!started) throw new Error('Secure user context could not be started. Your Super Admin session remains unchanged.');
        setViewingUser({ userId: Number(employee.userId), employeeId: Number(employee.id), employeeName: String(employee.fullName || employee.employeeName || detail.employeeName), employeeCode: employee.employeeCode, role });
        setActiveRoleState(role);
        setActiveModuleState('dashboard');
        setDrillDownTarget(null);
        setCurrentUserProfile(null);
        setIsMobileDrawerOpen(false);
        setIsUserMenuOpen(false);
        window.history.replaceState({ activeModule: 'dashboard' }, '', '#dashboard');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error: any) { window.alert(error?.message || 'Could not open the selected user dashboard.'); }
    };
    window.addEventListener('open-employee-dashboard', handleOpenEmployeeDashboard);
    return () => {
      window.removeEventListener('open-employee-360', handleOpenEmployee360);
      window.removeEventListener('open-employee-dashboard', handleOpenEmployeeDashboard);
    };
  }, []);

  useEffect(() => {
    if (!isMobileDrawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileDrawerOpen]);

  // Login Form State (when logged out)
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccessMsg, setLoginSuccessMsg] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Forgot Password & Reset Password State (when logged out)
  const [authScreenMode, setAuthScreenMode] = useState<'login' | 'forgot-password' | 'reset-password'>(() => {
    if (typeof window !== 'undefined') {
      const h = window.location.hash || '';
      const s = window.location.search || '';
      if (h.startsWith('#reset-password') || s.includes('resetToken=') || h.includes('token=')) {
        return 'reset-password';
      }
      if (h.startsWith('#forgot-password')) {
        return 'forgot-password';
      }
    }
    return 'login';
  });
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotGenericMessage, setForgotGenericMessage] = useState<string | null>(null);

  const [resetTokenInput, setResetTokenInput] = useState(() => {
    if (typeof window !== 'undefined') {
      const hashQuery = window.location.hash.includes('?')
        ? window.location.hash.split('?')[1]
        : '';
      const params = new URLSearchParams(hashQuery || window.location.search);
      return params.get('token') || params.get('resetToken') || '';
    }
    return '';
  });
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Forced First-Login Password Change State
  const [mustChangePasswordState, setMustChangePasswordState] = useState<boolean>(() =>
    mustUserChangePassword()
  );
  const [forcedCurrentPassword, setForcedCurrentPassword] = useState('');
  const [forcedNewPassword, setForcedNewPassword] = useState('');
  const [forcedConfirmPassword, setForcedConfirmPassword] = useState('');
  const [forcedPasswordError, setForcedPasswordError] = useState<string | null>(null);
  const [forcedPasswordSubmitting, setForcedPasswordSubmitting] = useState(false);

  // Admin Overview Company Logo Upload State
  const [adminPendingLogo, setAdminPendingLogo] = useState<{
    fileName: string;
    mimeType: string;
    fileData: string;
    sizeBytes: number;
  } | null>(null);
  const [adminLogoSaving, setAdminLogoSaving] = useState(false);
  const [adminLogoFeedback, setAdminLogoFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const setActiveModule = (mod: NavModule) => {
    setNavigationResetKey((key) => key + 1);
    clearEmployee360ProfileState();
    setDrillDownTarget(null);
    setIsMobileDrawerOpen(false);
    setIsUserMenuOpen(false);
    if (!isUserAuthenticated()) {
      setIsAuthenticatedState(false);
      return;
    }
    if (!isViewingAsAnotherUser() && (mustUserChangePassword() || mustChangePasswordState)) {
      setMustChangePasswordState(true);
      if (typeof window !== 'undefined' && window.location.hash !== '#change-password') {
        window.history.replaceState(
          { activeModule: 'change-password', mustChangePassword: true },
          '',
          '#change-password'
        );
      }
      return;
    }
    if (!canAccessModule(mod, activeRole)) {
      setActiveModuleState(mod);
      return;
    }
    setActiveModuleState(mod);
    if (typeof window !== 'undefined') {
      const targetHash = mod === 'administration' ? `#administration/${adminTab}` : `#${mod}`;
      if (window.location.hash !== targetHash) {
        window.history.pushState({ activeModule: mod, adminTab }, '', targetHash);
      }
    }
  };

  const setAdminTab = (tab: AdminTab) => {
    setNavigationResetKey((key) => key + 1);
    setDrillDownTarget(null);
    setIsMobileDrawerOpen(false);
    setIsUserMenuOpen(false);
    if (!isUserAuthenticated()) {
      setIsAuthenticatedState(false);
      return;
    }
    if (!isViewingAsAnotherUser() && (mustUserChangePassword() || mustChangePasswordState)) {
      setMustChangePasswordState(true);
      if (typeof window !== 'undefined' && window.location.hash !== '#change-password') {
        window.history.replaceState(
          { activeModule: 'change-password', mustChangePassword: true },
          '',
          '#change-password'
        );
      }
      return;
    }
    if (!canAccessModule('administration', activeRole) || !canAccessAdminTab(tab, activeRole)) {
      return;
    }
    setAdminTabState(tab);
    setActiveModuleState('administration');
    if (typeof window !== 'undefined') {
      const targetHash = `#administration/${tab}`;
      if (window.location.hash !== targetHash) {
        window.history.pushState({ activeModule: 'administration', adminTab: tab }, '', targetHash);
      }
    }
  };

  const refreshCompanyBranding = () => {
    fetch('/api/company-logo')
      .then((res) => res.json())
      .then((data) => {
        if (data?.branding) {
          setCompanyBranding(data.branding);
        }
      })
      .catch(() => {});
  };

  const refreshCurrentUserProfile = () => {
    if (!isUserAuthenticated()) {
      setCurrentUserProfile(null);
      return;
    }
    apiFetch('/api/users/profile/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setCurrentUserProfile(data.user);
          if (!isViewingAsAnotherUser() && typeof data.user.mustChangePassword === 'boolean') {
            setMustChangePasswordState(data.user.mustChangePassword);
          }
          const serverRole = (data.user.roleName || data.user.role) as UserRole | undefined;
          // A profile refresh in elevated user-context mode must never replace the original admin session.
          if (!isViewingAsAnotherUser() && serverRole && serverRole !== activeRole) {
            const sess = loginUserSession(data.user);
            setActiveRoleState(sess.role);
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    const handlePopState = () => {
      if (!isUserAuthenticated()) {
        setIsAuthenticatedState(false);
        const h = window.location.hash || '';
        if (h.startsWith('#reset-password')) {
          const hashQuery = h.includes('?') ? h.split('?')[1] : '';
          const params = new URLSearchParams(hashQuery || window.location.search);
          const tok = params.get('token') || params.get('resetToken') || '';
          if (tok) setResetTokenInput(tok);
          setAuthScreenMode('reset-password');
          return;
        }
        if (h.startsWith('#forgot-password')) {
          setAuthScreenMode('forgot-password');
          return;
        }
        setAuthScreenMode('login');
        if (window.location.hash !== '#login') {
          window.history.replaceState({ activeModule: 'login', loggedOut: true }, '', '#login');
        }
        return;
      }
      if (!isViewingAsAnotherUser() && mustUserChangePassword()) {
        setMustChangePasswordState(true);
        if (window.location.hash !== '#change-password') {
          window.history.replaceState(
            { activeModule: 'change-password', mustChangePassword: true },
            '',
            '#change-password'
          );
        }
        return;
      }
      const parsed = parseNavFromLocation();
      setActiveModuleState(parsed.module);
      setAdminTabState(parsed.tab);
    };
    const handleBrandingEvent = (e: Event) => {
      const custom = e as CustomEvent<CompanyBrandingDto>;
      if (custom.detail) {
        setCompanyBranding(custom.detail);
      } else {
        refreshCompanyBranding();
      }
    };
    const handlePhotoEvent = () => {
      refreshCurrentUserProfile();
    };
    const handleRequestLogout = () => {
      setIsLogoutModalOpen(true);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    window.addEventListener('maestro-company-branding-updated', handleBrandingEvent);
    window.addEventListener('maestro-profile-photo-updated', handlePhotoEvent);
    window.addEventListener('maestro-request-logout', handleRequestLogout);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
      window.removeEventListener('maestro-company-branding-updated', handleBrandingEvent);
      window.removeEventListener('maestro-profile-photo-updated', handlePhotoEvent);
      window.removeEventListener('maestro-request-logout', handleRequestLogout);
    };
  }, []);

  useEffect(() => {
    refreshCompanyBranding();
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data?.database) {
          setDbStatus({
            isConfigured: data.database.isConfigured,
            tablesDefined: data.database.tablesDefined,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAuthenticatedState) {
      setCurrentUserProfile(null);
      return;
    }
    refreshCurrentUserProfile();
    refreshCompanyBranding();

    if (activeRole === 'SUPER_ADMIN') {
      apiFetch('/api/settings')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.settings) {
            setSettings(data.settings);
          }
          if (data?.branding) {
            setCompanyBranding(data.branding);
          }
        })
        .catch(() => {});

      apiFetch('/api/roles')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.roles) {
            setRoles(data.roles);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticatedState, activeRole]);

  const handleConfirmLogout = async () => {
    endSuperAdminUserContext();
    setViewingUser(null);
    setLoggingOut(true);
    try {
      await logoutUserSession();
      setCurrentUserProfile(null);
      setMustChangePasswordState(false);
      setForcedCurrentPassword('');
      setForcedNewPassword('');
      setForcedConfirmPassword('');
      setForcedPasswordError(null);
      setSettings([]);
      setRoles([]);
      setLoginPassword('');
      setShowLoginPassword(false);
      setIsUserMenuOpen(false);
      setIsSettingsOpen(false);
      setIsLogoutModalOpen(false);
      setIsAuthenticatedState(false);
      setAuthScreenMode('login');
    } finally {
      setLoggingOut(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginSuccessMsg(null);
    setLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginIdentifier.trim(),
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.user) {
        throw new Error(data?.error || 'Invalid username or password');
      }
      const requiresPasswordChange = Boolean(
        data.mustChangePassword || data.user?.mustChangePassword
      );
      const sess = loginUserSession({
        ...data.user,
        mustChangePassword: requiresPasswordChange,
      });
      setActiveRoleState(sess.role);
      setMustChangePasswordState(requiresPasswordChange);
      setIsAuthenticatedState(true);
      if (requiresPasswordChange) {
        setForcedCurrentPassword('');
        setForcedNewPassword('');
        setForcedConfirmPassword('');
        setForcedPasswordError(null);
        window.history.replaceState(
          { activeModule: 'change-password', mustChangePassword: true },
          '',
          '#change-password'
        );
        return;
      }
      const defaultMod: NavModule = sess.role === 'SUPER_ADMIN' ? 'administration' : 'dashboard';
      const defaultTab: AdminTab = sess.role === 'SUPER_ADMIN' ? 'users' : 'employees';
      setAdminTabState(defaultTab);
      setActiveModuleState(defaultMod);
      window.history.replaceState({ activeModule: defaultMod, adminTab: defaultTab }, '', `#${defaultMod}`);
    } catch (err: any) {
      setLoginError(err.message || 'Sign in failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotGenericMessage(null);
    setForgotSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: forgotIdentifier.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to process password reset request');
      }
      setForgotGenericMessage(
        data?.message ||
          'If an account matching that email or User ID exists, password reset instructions have been sent to the registered email address.'
      );
    } catch (err: any) {
      setForgotError(err.message || 'Unable to process password reset request');
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (!resetTokenInput.trim()) {
      setResetError('Please enter your one-time password reset token.');
      return;
    }
    if (!resetNewPassword || resetNewPassword.length < 6) {
      setResetError('New password must be at least 6 characters.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('New password and confirm password do not match.');
      return;
    }
    setResetSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetTokenInput.trim(),
          newPassword: resetNewPassword,
          confirmPassword: resetConfirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to reset password');
      }
      setResetTokenInput('');
      setResetNewPassword('');
      setResetConfirmPassword('');
      setLoginPassword('');
      setLoginError(null);
      setLoginSuccessMsg(
        data?.message ||
          'Your password has been reset successfully. You can now sign in with your new password.'
      );
      setAuthScreenMode('login');
      window.history.replaceState({ activeModule: 'login' }, '', '#login');
    } catch (err: any) {
      setResetError(err.message || 'Failed to reset password');
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleForcedPasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForcedPasswordError(null);
    if (!forcedCurrentPassword) {
      setForcedPasswordError('Current temporary password is required.');
      return;
    }
    if (!forcedNewPassword || forcedNewPassword.length < 6) {
      setForcedPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (forcedNewPassword !== forcedConfirmPassword) {
      setForcedPasswordError('New password and confirm password do not match.');
      return;
    }
    if (forcedNewPassword === forcedCurrentPassword) {
      setForcedPasswordError('New password must be different from your temporary password.');
      return;
    }
    setForcedPasswordSubmitting(true);
    try {
      const res = await apiFetch('/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: getActiveUserId(),
          currentPassword: forcedCurrentPassword,
          newPassword: forcedNewPassword,
          confirmPassword: forcedConfirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to change password');
      }
      clearMustChangePasswordFlag();
      setMustChangePasswordState(false);
      setCurrentUserProfile((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
      setForcedCurrentPassword('');
      setForcedNewPassword('');
      setForcedConfirmPassword('');
      const defaultMod: NavModule = activeRole === 'SUPER_ADMIN' ? 'administration' : 'dashboard';
      const defaultTab: AdminTab = activeRole === 'SUPER_ADMIN' ? 'users' : 'employees';
      setAdminTabState(defaultTab);
      setActiveModuleState(defaultMod);
      window.history.replaceState(
        { activeModule: defaultMod, adminTab: defaultTab },
        '',
        `#${defaultMod}`
      );
    } catch (err: any) {
      setForcedPasswordError(err.message || 'Failed to change password');
    } finally {
      setForcedPasswordSubmitting(false);
    }
  };

  const handleAdminSelectLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAdminLogoFeedback(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setAdminLogoFeedback({
        type: 'error',
        message: 'Unsupported image format. Allowed formats: JPEG, PNG, WEBP.',
      });
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAdminLogoFeedback({
        type: 'error',
        message: 'Logo file size exceeds the maximum permitted limit of 5.0 MB.',
      });
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAdminPendingLogo({
          fileName: file.name,
          mimeType: file.type,
          fileData: reader.result,
          sizeBytes: file.size,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAdminUploadLogo = async () => {
    if (activeRole !== 'SUPER_ADMIN' || !adminPendingLogo) return;
    setAdminLogoSaving(true);
    setAdminLogoFeedback(null);
    try {
      const res = await apiFetch('/api/company-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: adminPendingLogo.fileName,
          mimeType: adminPendingLogo.mimeType,
          fileData: adminPendingLogo.fileData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload company logo');
      setCompanyBranding(data.branding);
      setAdminPendingLogo(null);
      setAdminLogoFeedback({
        type: 'success',
        message: 'Company logo uploaded and applied globally across Maestro Leave Management.',
      });
    } catch (err: any) {
      setAdminLogoFeedback({
        type: 'error',
        message: err.message || 'Failed to upload company logo',
      });
    } finally {
      setAdminLogoSaving(false);
    }
  };

  const handleAdminRemoveLogo = async () => {
    if (activeRole !== 'SUPER_ADMIN') return;
    setAdminLogoSaving(true);
    setAdminLogoFeedback(null);
    try {
      const res = await apiFetch('/api/company-logo', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove company logo');
      setCompanyBranding(data.branding);
      setAdminPendingLogo(null);
      setAdminLogoFeedback({
        type: 'success',
        message: 'Company logo removed and default Maestro branding restored.',
      });
    } catch (err: any) {
      setAdminLogoFeedback({
        type: 'error',
        message: err.message || 'Failed to remove company logo',
      });
    } finally {
      setAdminLogoSaving(false);
    }
  };

  const allNavItems = [
    { id: 'welcome' as NavModule, label: 'Welcome', mobileLabel: 'Welcome', icon: Home },
    { id: 'dashboard' as NavModule, label: 'Dashboard', mobileLabel: 'Dashboard', icon: LayoutDashboard },
    { id: 'my-leave' as NavModule, label: 'My Leave', mobileLabel: 'My Leave', icon: Calendar },
    { id: 'leave-balance' as NavModule, label: 'Leave Balance', mobileLabel: 'Balances', icon: PieChart },
    { id: 'my-schedule' as NavModule, label: 'My Schedule', mobileLabel: 'Schedule', icon: Clock },
    { id: 'attendance' as NavModule, label: 'My Attendance', mobileLabel: 'Attendance', icon: CalendarDays }, 
    { id: 'my-profile' as NavModule, label: 'My Profile', mobileLabel: 'Profile', icon: User },
    { id: 'team-leader' as NavModule, label: 'Reporting Person Approval', mobileLabel: 'Approvals', icon: ShieldCheck },
    { id: 'hr' as NavModule, label: 'HR', mobileLabel: 'HR Desk', icon: Users },
    { id: 'management' as NavModule, label: 'Management', mobileLabel: 'Mgmt Desk', icon: Briefcase },
    { id: 'reports' as NavModule, label: 'Reports & MIS', mobileLabel: 'Reports', icon: FileSpreadsheet },
    { id: 'administration' as NavModule, label: 'Administration', mobileLabel: 'Admin', icon: Settings },
  ];

  const allAdminTabItems: { id: AdminTab; label: string; icon: typeof Users }[] = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'employees', label: 'Employees', icon: User },
    { id: 'roles', label: 'Roles', icon: Shield },
    { id: 'departments', label: 'Departments', icon: Building },
    { id: 'designations', label: 'Designations', icon: Award },
    { id: 'working-days', label: 'Working Days & Timing', icon: Clock },
    { id: 'weekly-offs', label: 'Weekly-Off Overrides', icon: CalendarDays },
    { id: 'shifts', label: 'Shifts Master', icon: Clock },
    { id: 'employee-shifts', label: 'Employee Shift Roster', icon: User },
    { id: 'department-shifts', label: 'Dept Shift Roster', icon: Building },
    { id: 'overtime', label: 'Overtime', icon: Clock },
    { id: 'attendance', label: 'Employee Attendance', icon: CalendarDays },
    { id: 'audit', label: 'System Audit', icon: ShieldCheck },
    { id: 'leave-types', label: 'Leave Types', icon: FileSpreadsheet },
    { id: 'leave-policies', label: 'Leave Policies', icon: Sliders },
    { id: 'leave-requests', label: 'Leave Request Management', icon: FileSpreadsheet },
    { id: 'leave-balances', label: 'Leave Balances', icon: Wallet },
    { id: 'holidays', label: 'Holidays', icon: Calendar },
    { id: 'workflow-settings', label: 'Leave Workflow Settings', icon: Sliders },
    { id: 'system-overview', label: 'System Overview', icon: Layers },
  ];

  const navItems = allNavItems.filter((item) => canAccessModule(item.id, activeRole) && item.id !== 'attendance');
  const authorizedAdminTabs = allAdminTabItems.filter((tab) => canAccessAdminTab(tab.id, activeRole));
  const isCurrentModuleAuthorized = canAccessModule(activeModule, activeRole);
  const isCurrentAdminTabAuthorized = canAccessAdminTab(adminTab, activeRole);

  // Role-prioritized primary bottom navigation items (max 4 primary tabs + 1 Menu drawer trigger)
  const preferredBottomOrder: Record<UserRole, NavModule[]> = {
    EMPLOYEE: ['dashboard', 'my-leave', 'leave-balance', 'my-schedule'],
    TEAM_LEADER: ['dashboard', 'team-leader', 'my-leave', 'my-schedule'],
    HR: ['dashboard', 'hr', 'my-leave', 'reports'],
    TOP_MANAGEMENT: ['dashboard', 'management', 'reports', 'administration'],
    SUPER_ADMIN: ['dashboard', 'administration', 'management', 'reports'],
  };
  const rolePriorityIds = preferredBottomOrder[activeRole] || ['dashboard', 'my-leave', 'leave-balance', 'my-schedule'];
  const primaryMobileNavItems = [
    ...rolePriorityIds
      .map((id) => navItems.find((item) => item.id === id))
      .filter((item): item is (typeof navItems)[number] => Boolean(item)),
    ...navItems.filter((item) => !rolePriorityIds.includes(item.id)),
  ].slice(0, 4);

  const activeNavItemObj = allNavItems.find((item) => item.id === activeModule);
  const activeAdminTabObj = allAdminTabItems.find((tab) => tab.id === adminTab);
  const currentMobilePageTitle = drillDownTarget
    ? 'Employee 360° Profile'
    : activeModule === 'administration' && activeAdminTabObj
      ? `Admin • ${activeAdminTabObj.label}`
      : activeNavItemObj?.label || 'Dashboard';

  const sessionInfo = getActiveUserSession();
  const displayFullName =
    currentUserProfile?.fullName ||
    currentUserProfile?.employeeName ||
    sessionInfo.fullName ||
    sessionInfo.username ||
    'User';
  const displayUsername = currentUserProfile?.username || sessionInfo.username || 'user';
  const displayAvatarUrl = currentUserProfile?.profilePhotoUrl || sessionInfo.profilePhotoUrl || null;

  if (!isAuthenticatedState) {
    return (
      <div
        id="login-screen"
        className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-12 font-sans text-neutral-900"
      >
        <div className="w-full max-w-md bg-white rounded-2xl border border-neutral-300 border-t-4 border-t-red-700 shadow-md p-8 space-y-6">
          <div className="flex flex-col items-center text-center">
            <img
              id="login-company-logo"
              src={
                companyBranding.hasCustomLogo && companyBranding.logoUrl
                  ? companyBranding.logoUrl
                  : '/assets/maestro-tires-logo.png'
              }
              alt="Maestro Leave Management Logo"
              className="h-12 w-auto max-w-full object-contain mb-3"
            />
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">
              Maestro Leave Management
            </h1>
            <p className="text-xs text-neutral-600 mt-1">
              {authScreenMode === 'forgot-password'
                ? 'Enter your registered email or User ID to receive password reset instructions'
                : authScreenMode === 'reset-password'
                  ? 'Enter your one-time reset token and choose a new password'
                  : 'Sign in with your account credentials to access your workspace'}
            </p>
          </div>

          {authScreenMode === 'login' && (
            <>
              {loginSuccessMsg && (
                <div
                  id="login-success-alert"
                  className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{loginSuccessMsg}</span>
                </div>
              )}

              {loginError && (
                <div
                  id="login-error-alert"
                  className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <form id="login-form" onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1.5">
                    Username, Official Email, or Employee Code
                  </label>
                  <input
                    id="input-login-identifier"
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="e.g. superadmin, alice_emp, hruser"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm sm:text-xs rounded-xl sm:rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-semibold text-neutral-700">Password</label>
                    <button
                      id="btn-forgot-password"
                      type="button"
                      onClick={() => {
                        setLoginError(null);
                        setLoginSuccessMsg(null);
                        setForgotError(null);
                        setForgotGenericMessage(null);
                        setForgotIdentifier(loginIdentifier.trim());
                        setAuthScreenMode('forgot-password');
                        window.history.pushState(
                          { activeModule: 'forgot-password' },
                          '',
                          '#forgot-password'
                        );
                      }}
                      className="text-xs font-semibold text-red-700 hover:text-red-800 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="input-login-password"
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full min-h-[44px] px-3.5 py-2.5 pr-11 text-sm sm:text-xs rounded-xl sm:rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    />
                    <button
                      id="btn-toggle-login-password"
                      type="button"
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                      title={showLoginPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      className="absolute right-0 top-0 bottom-0 px-3.5 flex items-center justify-center text-neutral-400 hover:text-neutral-700 focus:outline-none focus:text-neutral-700 cursor-pointer"
                    >
                      {showLoginPassword ? (
                        <EyeOff className="w-4 h-4 text-neutral-500" />
                      ) : (
                        <Eye className="w-4 h-4 text-neutral-500" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  id="btn-login-submit"
                  type="submit"
                  disabled={loggingIn}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl sm:rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800 active:bg-red-900 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <Lock className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span>{loggingIn ? 'Signing in...' : 'Sign In to Maestro'}</span>
                </button>
              </form>
            </>
          )}

          {authScreenMode === 'forgot-password' && (
            <div id="forgot-password-screen" className="space-y-4 text-xs">
              {forgotError && (
                <div
                  id="forgot-password-error-alert"
                  className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{forgotError}</span>
                </div>
              )}

              {forgotGenericMessage && (
                <div
                  id="forgot-password-generic-response"
                  className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2"
                >
                  <div className="flex items-start gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                    <span>{forgotGenericMessage}</span>
                  </div>
                  <div className="pt-1">
                    <button
                      id="btn-open-reset-password"
                      type="button"
                      onClick={() => {
                        setResetError(null);
                        setAuthScreenMode('reset-password');
                        window.history.pushState(
                          { activeModule: 'reset-password' },
                          '',
                          '#reset-password'
                        );
                      }}
                      className="text-xs font-semibold text-red-700 hover:text-red-800 underline cursor-pointer"
                    >
                      Enter Reset Token to Set New Password &rarr;
                    </button>
                  </div>
                </div>
              )}

              <form
                id="forgot-password-form"
                onSubmit={handleForgotPasswordSubmit}
                className="space-y-4"
              >
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1.5">
                    Registered Email or User ID
                  </label>
                  <input
                    id="input-forgot-identifier"
                    type="text"
                    required
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    placeholder="Enter your registered email or User ID"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm sm:text-xs rounded-xl sm:rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                  />
                </div>

                <button
                  id="btn-forgot-submit"
                  type="submit"
                  disabled={forgotSubmitting}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl sm:rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800 active:bg-red-900 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <Lock className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span>
                    {forgotSubmitting ? 'Sending Reset Instructions...' : 'Send Reset Instructions'}
                  </span>
                </button>
              </form>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-200/80">
                <button
                  id="btn-back-to-login"
                  type="button"
                  onClick={() => {
                    setForgotError(null);
                    setForgotGenericMessage(null);
                    setAuthScreenMode('login');
                    window.history.replaceState({ activeModule: 'login' }, '', '#login');
                  }}
                  className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </button>

                <button
                  id="btn-have-reset-token"
                  type="button"
                  onClick={() => {
                    setResetError(null);
                    setAuthScreenMode('reset-password');
                    window.history.pushState(
                      { activeModule: 'reset-password' },
                      '',
                      '#reset-password'
                    );
                  }}
                  className="text-xs font-semibold text-red-700 hover:text-red-800 hover:underline cursor-pointer"
                >
                  Have a reset token?
                </button>
              </div>
            </div>
          )}

          {authScreenMode === 'reset-password' && (
            <div id="reset-password-screen" className="space-y-4 text-xs">
              {resetError && (
                <div
                  id="reset-password-error-alert"
                  className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              <form
                id="reset-password-form"
                onSubmit={handleResetPasswordSubmit}
                className="space-y-4"
              >
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1.5">
                    One-Time Reset Token
                  </label>
                  <input
                    id="input-reset-token"
                    type="text"
                    required
                    value={resetTokenInput}
                    onChange={(e) => setResetTokenInput(e.target.value)}
                    placeholder="Paste the reset token from your email"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm sm:text-xs font-mono rounded-xl sm:rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1.5">
                    New Password
                  </label>
                  <input
                    id="input-reset-new-password"
                    type="password"
                    required
                    minLength={6}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm sm:text-xs rounded-xl sm:rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    id="input-reset-confirm-password"
                    type="password"
                    required
                    minLength={6}
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm sm:text-xs rounded-xl sm:rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                  />
                </div>

                <button
                  id="btn-reset-password-submit"
                  type="submit"
                  disabled={resetSubmitting}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl sm:rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800 active:bg-red-900 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <Lock className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span>{resetSubmitting ? 'Resetting Password...' : 'Reset Password'}</span>
                </button>
              </form>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-200/80">
                <button
                  id="btn-reset-back-to-login"
                  type="button"
                  onClick={() => {
                    setResetError(null);
                    setAuthScreenMode('login');
                    window.history.replaceState({ activeModule: 'login' }, '', '#login');
                  }}
                  className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!isViewingAsAnotherUser() && (mustChangePasswordState || mustUserChangePassword())) {
    return (
      <div
        id="forced-password-change-screen"
        className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-12 font-sans text-neutral-900"
      >
        <div className="w-full max-w-md bg-white rounded-2xl border border-neutral-300 border-t-4 border-t-red-700 shadow-md p-8 space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-red-700 text-white flex items-center justify-center font-bold text-lg mb-3 shadow-xs">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">
              Change Your Temporary Password
            </h1>
            <p className="text-xs text-neutral-600 mt-1">
              Welcome, <strong>{displayFullName}</strong> (@{displayUsername}). For your security, you must change your temporary password before accessing Maestro Leave Management.
            </p>
          </div>

          {forcedPasswordError && (
            <div
              id="forced-password-error-alert"
              className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{forcedPasswordError}</span>
            </div>
          )}

          <form
            id="forced-password-change-form"
            onSubmit={handleForcedPasswordChangeSubmit}
            className="space-y-4 text-xs"
          >
            <div>
              <label className="block font-semibold text-neutral-700 mb-1.5">
                Current Temporary Password
              </label>
              <input
                id="input-forced-current-password"
                type="password"
                required
                value={forcedCurrentPassword}
                onChange={(e) => setForcedCurrentPassword(e.target.value)}
                placeholder="Enter your temporary password"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm sm:text-xs rounded-xl sm:rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1.5">
                New Password
              </label>
              <input
                id="input-forced-new-password"
                type="password"
                required
                minLength={6}
                value={forcedNewPassword}
                onChange={(e) => setForcedNewPassword(e.target.value)}
                placeholder="Enter a new password (min 6 characters)"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm sm:text-xs rounded-xl sm:rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1.5">
                Confirm New Password
              </label>
              <input
                id="input-forced-confirm-password"
                type="password"
                required
                minLength={6}
                value={forcedConfirmPassword}
                onChange={(e) => setForcedConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm sm:text-xs rounded-xl sm:rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
              />
            </div>

            <button
              id="btn-forced-password-submit"
              type="submit"
              disabled={forcedPasswordSubmitting}
              className="w-full min-h-[46px] py-2.5 px-4 rounded-xl sm:rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800 active:bg-red-900 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
            >
              <ShieldCheck className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span>
                {forcedPasswordSubmitting ? 'Updating Password...' : 'Update Password & Continue'}
              </span>
            </button>
          </form>

          <div className="pt-2 border-t border-neutral-200/80 flex justify-center">
            <button
              id="btn-forced-password-logout"
              type="button"
              onClick={handleConfirmLogout}
              disabled={loggingOut}
              className="text-xs font-semibold text-rose-700 hover:text-rose-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="app-root" className="min-h-screen flex flex-col bg-white text-neutral-900 font-sans overflow-x-hidden">
      {/* Header (Responsive Desktop Header + Dedicated App-Like Mobile Header — Deep Navy #0F172A) */}
      <header
        id="app-header"
        className={`${MT_THEME.mobile.header} w-full max-w-full min-w-0`}
      >
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
          {/* Mobile Back Button (When in Employee 360° Drilldown or Sub-Screen) */}
          {(drillDownTarget || activeModule !== 'dashboard') && (
            <button
              id="btn-mobile-header-back"
              type="button"
              onClick={() => {
                if (drillDownTarget) {
                  clearEmployee360ProfileState();
                  setDrillDownTarget(null);
                } else {
                  setActiveModule('dashboard');
                }
              }}
              aria-label="Back"
              title="Back"
              className="inline-flex md:hidden min-h-[44px] min-w-[44px] -ml-1 rounded-xl items-center justify-center text-white hover:text-red-300 hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Mobile Navigation Drawer Trigger Button */}
          <button
            id="btn-mobile-drawer-open"
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={isMobileDrawerOpen}
            aria-controls="mobile-navigation-drawer"
            className={`${drillDownTarget || activeModule !== 'dashboard' ? 'hidden' : 'inline-flex md:hidden'} min-h-[44px] min-w-[44px] -ml-1 rounded-xl items-center justify-center text-white hover:text-red-300 hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer shrink-0`}
          >
            <Menu className="w-5 h-5" />
          </button>

          {companyBranding.hasCustomLogo && companyBranding.logoUrl ? (
            <img
              id="header-company-logo"
              src={companyBranding.logoUrl}
              alt="Maestro Leave Management Logo"
              className={`${drillDownTarget || activeModule !== 'dashboard' ? 'hidden sm:block' : 'block'} w-7 h-7 sm:w-9 sm:h-9 rounded-lg object-contain bg-white border border-neutral-300 p-0.5 shadow-2xs shrink-0`}
            />
          ) : (
            <div
              id="header-default-logo"
              className={`${drillDownTarget || activeModule !== 'dashboard' ? 'hidden sm:flex' : 'flex'} w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-700 text-white items-center justify-center font-semibold text-xs sm:text-sm shrink-0 shadow-2xs`}
            >
              M
            </div>
          )}
          <div className="min-w-0 flex-1">
            {/* Mobile Current Page / Module Title (Primary App Title on <768px) */}
            <div
              id="mobile-current-page-title"
              className="md:hidden flex items-center gap-1.5 text-sm font-bold text-white leading-tight min-w-0"
            >
              <span className="truncate">{currentMobilePageTitle}</span>
            </div>
            <h1
              id="app-title"
              className="text-[10px] md:text-base font-medium md:font-semibold tracking-tight text-neutral-300 md:text-white leading-tight truncate"
            >
              <span className="hidden md:inline">Maestro Leave Management</span>
              <span className="md:hidden text-red-400 font-mono font-semibold">
                {activeRole.replace(/_/g, ' ')}
              </span>
            </h1>
            {/* Desktop Subtitle */}
            <p className="hidden md:block text-[11px] text-neutral-300 mt-0.5 truncate">
              Enterprise Leave, Department Holidays, 18-Shift Roster &amp; 3-Stage Approval Workflow
            </p>
          </div>
        </div>

        {/* Right Header: Notification Center, System Settings (SUPER_ADMIN only), User Avatar Menu & Logout */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <div className="hidden sm:inline-flex">
            <PWAInstallButton variant="header" />
          </div>
          <NotificationCenter
            onNavigateToRequest={() => {
              if (activeRole === 'EMPLOYEE') {
                setActiveModule('my-leave');
              } else if (activeRole === 'TEAM_LEADER') {
                setActiveModule('team-leader');
              } else if (activeRole === 'HR') {
                setActiveModule('hr');
              } else {
                setActiveModule('management');
              }
            }}
          />

          {activeRole === 'SUPER_ADMIN' && (
            <button
              id="btn-open-settings"
              onClick={() => setIsSettingsOpen(true)}
              className="hidden sm:inline-flex min-h-[44px] min-w-[44px] items-center justify-center p-2 rounded-xl text-neutral-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Company Branding & System Policy Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}

          {/* User Profile Avatar & Menu */}
          <div className="relative">
            <button
              id="header-user-profile-btn"
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-1.5 sm:px-2.5 py-1.5 rounded-xl border border-neutral-700 bg-neutral-800 text-white hover:bg-neutral-700 hover:border-red-500 transition-colors cursor-pointer text-xs"
              title="Open Profile & Account Menu"
            >
              {displayAvatarUrl ? (
                <img
                  id="header-user-avatar"
                  src={displayAvatarUrl}
                  alt={displayFullName}
                  className="w-6 h-6 rounded-full object-cover border border-neutral-600 shrink-0"
                />
              ) : (
                <div
                  id="header-user-default-avatar"
                  className="w-6 h-6 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-[11px] shrink-0"
                >
                  {displayFullName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:inline font-semibold text-white max-w-[120px] truncate">
                {displayFullName}
              </span>
              <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-neutral-300 shrink-0" />
            </button>

            {isUserMenuOpen && (
              <div
                id="header-user-menu"
                className="fixed right-3 left-3 top-16 sm:left-auto sm:right-0 sm:top-auto sm:absolute sm:mt-2 sm:w-64 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl shadow-xl border border-neutral-200 border-t-2 border-t-red-700 py-2 z-50 text-xs"
              >
                <div className="px-3.5 py-2.5 border-b border-neutral-100 flex items-center gap-2.5">
                  {displayAvatarUrl ? (
                    <img
                      src={displayAvatarUrl}
                      alt={displayFullName}
                      className="w-9 h-9 rounded-full object-cover border border-neutral-200 shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
                      {displayFullName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-neutral-900 truncate">{displayFullName}</div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      @{displayUsername} &bull; {activeRole}
                    </div>
                  </div>
                </div>

                <div className="py-1">
                  <button
                    id="menu-btn-my-profile"
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setActiveModule('my-profile');
                    }}
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-left text-neutral-700 hover:bg-neutral-50 flex items-center gap-2.5 font-medium cursor-pointer"
                  >
                    <User className="w-4 h-4 text-neutral-500" />
                    <span>My Profile &amp; Photo</span>
                  </button>

                  {activeRole === 'SUPER_ADMIN' && (
                    <>
                      <button
                        id="menu-btn-leave-workflow-settings"
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setActiveModule('administration');
                          setAdminTab('workflow-settings');
                        }}
                        className="w-full min-h-[44px] px-3.5 py-2.5 text-left text-neutral-700 hover:bg-neutral-50 flex items-center gap-2.5 font-medium cursor-pointer"
                      >
                        <Sliders className="w-4 h-4 text-neutral-500" />
                        <span>Leave Workflow Settings (HR ON/OFF)</span>
                      </button>
                      <button
                        id="menu-btn-leave-requests"
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setActiveModule('administration');
                          setAdminTab('leave-requests');
                        }}
                        className="w-full min-h-[44px] px-3.5 py-2.5 text-left text-neutral-700 hover:bg-neutral-50 flex items-center gap-2.5 font-medium cursor-pointer"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-neutral-500" />
                        <span>Leave Request Management (Edit/Delete)</span>
                      </button>
                      <button
                        id="menu-btn-company-branding"
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setIsSettingsOpen(true);
                        }}
                        className="w-full min-h-[44px] px-3.5 py-2.5 text-left text-neutral-700 hover:bg-neutral-50 flex items-center gap-2.5 font-medium cursor-pointer"
                      >
                        <ImageIcon className="w-4 h-4 text-neutral-500" />
                        <span>Company Logo &amp; Branding</span>
                      </button>
                    </>
                  )}
                </div>

                <div className="pt-1 border-t border-neutral-100">
                  <button
                    id="menu-btn-logout"
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsLogoutModalOpen(true);
                    }}
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-left text-rose-700 hover:bg-rose-50 flex items-center gap-2.5 font-semibold cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-600" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Direct Header Logout Button Visible for Every Authenticated Role */}
          <button
            id="btn-header-logout"
            type="button"
            onClick={() => setIsLogoutModalOpen(true)}
            aria-label="Logout"
            className="hidden sm:inline-flex min-h-[44px] sm:min-w-0 items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-700 text-white border border-red-600 hover:bg-red-800 active:bg-red-900 transition-colors cursor-pointer"
            title="Logout from Maestro Leave Management"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Logout</span>
          </button>

          {activeRole === 'SUPER_ADMIN' && (
            <div
              id="db-status-badge"
              className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium bg-neutral-800 text-neutral-200 border border-neutral-700"
            >
              <Database className="w-3.5 h-3.5 text-neutral-500" />
              <span className="hidden xl:inline">PostgreSQL + Drizzle</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  dbStatus.isConfigured ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
                title={dbStatus.isConfigured ? 'PostgreSQL Connected' : 'Database Ready / Local Store'}
              />
            </div>
          )}
        </div>
      </header>

      {/* Desktop Navigation Bar (Preserved Unchanged for Desktop Viewports) */}
      <nav
        id="main-navigation"
        className="hidden md:block bg-white border-b border-neutral-200/80 px-4 lg:px-8 overflow-x-auto"
        aria-label="Main Navigation"
      >
        <div className="flex items-center gap-1 min-w-max">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                id={`nav-btn-${item.id}`}
                onClick={() => setActiveModule(item.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? MT_THEME.navTabActive
                    : MT_THEME.navTabInactive
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
                {item.id === 'team-leader' && approvalCounts.teamLeader > 0 && (
                  <span aria-label={approvalCounts.teamLeader + ' pending approvals'} className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white">{approvalCounts.teamLeader}</span>
                )}
                {item.id === 'hr' && approvalCounts.hr > 0 && (
                  <span aria-label={approvalCounts.hr + ' pending approvals'} className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white">{approvalCounts.hr}</span>
                )}
                {item.id === 'management' && approvalCounts.management > 0 && (
                  <span aria-label={approvalCounts.management + ' pending approvals'} className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white">{approvalCounts.management}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile Navigation Drawer / Slide-Over Sidebar (Mobile Only) */}
      {isMobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Mobile Navigation Drawer">
          <div
            id="mobile-drawer-backdrop"
            className={MT_THEME.mobile.drawerBackdrop}
            onClick={() => setIsMobileDrawerOpen(false)}
          />
          <aside
            id="mobile-navigation-drawer"
            className={MT_THEME.mobile.drawerPanel}
          >
            {/* Drawer Header */}
            <div className="px-4 py-3.5 border-b border-neutral-200 bg-neutral-50/70 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {companyBranding.hasCustomLogo && companyBranding.logoUrl ? (
                  <img
                    src={companyBranding.logoUrl}
                    alt="Maestro Logo"
                    className="w-8 h-8 rounded-lg object-contain bg-white border border-neutral-200 p-0.5 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-red-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    M
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-neutral-900 truncate">
                    Maestro Leave Management
                  </div>
                  <div className="text-[10px] font-medium text-neutral-500 truncate">
                    Role: <span className="font-mono font-semibold text-red-700">{activeRole}</span>
                  </div>
                </div>
              </div>
              <button
                id="btn-mobile-drawer-close"
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                aria-label="Close navigation menu"
                className="min-h-[44px] min-w-[44px] -mr-1 rounded-xl inline-flex items-center justify-center text-neutral-500 hover:text-red-700 hover:bg-red-50/60 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Signed-In User Quick Card */}
            <div className="px-4 py-3 border-b border-neutral-100 bg-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {displayAvatarUrl ? (
                  <img
                    src={displayAvatarUrl}
                    alt={displayFullName}
                    className="w-9 h-9 rounded-full object-cover border border-neutral-200 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {displayFullName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-neutral-900 truncate">{displayFullName}</div>
                  <div className="text-[11px] text-neutral-500 truncate">@{displayUsername}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModule('my-profile')}
                className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-semibold cursor-pointer shrink-0"
              >
                Profile
              </button>
            </div>

            {/* Scrollable Authorized Navigation Modules & Admin Sub-Sections (Grouped Mobile More/Menu Hub) */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
              {/* Group 1: Employee & Personal Workspace */}
              <div className="space-y-1">
                <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  My Workspace
                </div>
                {navItems
                  .filter((item) =>
                    ['dashboard', 'my-leave', 'leave-balance', 'my-schedule', 'my-profile', 'welcome'].includes(
                      item.id
                    )
                  )
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive = !drillDownTarget && activeModule === item.id;
                    return (
                      <button
                        key={item.id}
                        id={`mobile-drawer-nav-${item.id}`}
                        type="button"
                        onClick={() => setActiveModule(item.id)}
                        className={`${MT_THEME.mobile.drawerItem} ${
                          isActive ? MT_THEME.mobile.drawerItemActive : MT_THEME.mobile.drawerItemInactive
                        }`}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                          {item.id === 'team-leader' && approvalCounts.teamLeader > 0 && <span className="ml-2 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{approvalCounts.teamLeader}</span>}
                          {item.id === 'hr' && approvalCounts.hr > 0 && <span className="ml-2 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{approvalCounts.hr}</span>}
                          {item.id === 'management' && approvalCounts.management > 0 && <span className="ml-2 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{approvalCounts.management}</span>}
                        </span>
                        <ChevronRight className={`w-4 h-4 shrink-0 ${isActive ? 'text-white/80' : 'text-neutral-500'}`} />
                      </button>
                    );
                  })}
              </div>

              {/* Group 2: Approval Desks & Management Operations */}
              {navItems.some((item) =>
                ['team-leader', 'hr', 'management', 'reports', 'administration'].includes(item.id)
              ) && (
                <div className="space-y-1 pt-2 border-t border-neutral-200">
                  <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Approvals &amp; Operations
                  </div>
                  {navItems
                    .filter((item) =>
                      ['team-leader', 'hr', 'management', 'reports', 'administration'].includes(item.id)
                    )
                    .map((item) => {
                      const Icon = item.icon;
                      const isActive = !drillDownTarget && activeModule === item.id;
                      return (
                        <button
                          key={item.id}
                          id={`mobile-drawer-nav-${item.id}`}
                          type="button"
                          onClick={() => setActiveModule(item.id)}
                          className={`${MT_THEME.mobile.drawerItem} ${
                            isActive ? MT_THEME.mobile.drawerItemActive : MT_THEME.mobile.drawerItemInactive
                          }`}
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            <Icon className="w-4 h-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </span>
                          <ChevronRight className={`w-4 h-4 shrink-0 ${isActive ? 'text-white/80' : 'text-neutral-500'}`} />
                        </button>
                      );
                    })}
                </div>
              )}

              {canAccessModule('administration', activeRole) && authorizedAdminTabs.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-neutral-200">
                  <div className="px-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                      Administration Sections ({authorizedAdminTabs.length})
                    </span>
                  </div>
                  <div className="px-1">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="mobile-drawer-admin-search"
                        type="text"
                        value={mobileAdminSearch}
                        onChange={(e) => setMobileAdminSearch(e.target.value)}
                        placeholder="Quick find admin section..."
                        className="w-full min-h-[40px] pl-8 pr-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 text-xs text-neutral-800 focus:outline-none focus:bg-white focus:border-red-700"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    {authorizedAdminTabs
                      .filter(
                        (tab) =>
                          !mobileAdminSearch.trim() ||
                          tab.label.toLowerCase().includes(mobileAdminSearch.trim().toLowerCase())
                      )
                      .map((tab) => {
                        const TabIcon = tab.icon;
                        const isTabActive =
                          !drillDownTarget && activeModule === 'administration' && adminTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            id={`mobile-drawer-admin-tab-${tab.id}`}
                            type="button"
                            onClick={() => setAdminTab(tab.id)}
                            className={`${MT_THEME.mobile.drawerItem} ${
                              isTabActive
                                ? 'bg-red-50 text-red-800 border border-red-200'
                                : MT_THEME.mobile.drawerItemInactive
                            }`}
                          >
                            <span className="flex items-center gap-3 min-w-0">
                              <TabIcon className="w-4 h-4 shrink-0" />
                              <span className="truncate">{tab.label}</span>
                            </span>
                            {isTabActive && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-700 text-white shrink-0">
                                Active
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Controls */}
            <div className="p-3 border-t border-neutral-200 bg-neutral-50/70 space-y-2">
              <PWAInstallButton variant="drawer" />
              {activeRole === 'SUPER_ADMIN' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    setIsSettingsOpen(true);
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white border border-neutral-200 text-neutral-800 hover:bg-neutral-100 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-neutral-600" />
                  <span>Company Branding &amp; Settings</span>
                </button>
              )}
              <button
                id="btn-mobile-drawer-logout"
                type="button"
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  setIsLogoutModalOpen(true);
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out ({displayUsername})</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <main
        id="app-container"
        className="flex-1 p-3 sm:p-4 md:p-8 mt-mobile-content-safe max-w-6xl w-full mx-auto min-w-0 overflow-x-hidden"
      >
        {!isCurrentModuleAuthorized && (
          <section
            id="route-access-denied"
            className="bg-white rounded-xl border border-rose-200 p-8 text-center max-w-lg mx-auto my-8 shadow-xs space-y-4"
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900">
                Access Denied (403 Forbidden)
              </h2>
              <p className="text-xs text-neutral-600 mt-1.5 leading-relaxed">
                Your current authenticated role (<strong>{activeRole}</strong>) does not have permission to access the <strong>{activeModule}</strong> module.
              </p>
            </div>
            <div className="pt-2">
              <button
                id="btn-return-dashboard"
                type="button"
                onClick={() => setActiveModule('dashboard')}
                className="px-4 py-2 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-800 transition-colors cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          </section>
        )}

        {/* Module 1: Welcome Page */}
        {isCurrentModuleAuthorized && activeModule === 'welcome' && (
          <section id="module-welcome" className="flex items-center justify-center py-12">
            <div
              id="app-card"
              className="max-w-xl w-full bg-white rounded-2xl shadow-xs border border-neutral-300 border-t-4 border-t-red-700 p-8 md:p-10 text-center space-y-6"
            >
              <div className="flex justify-center">
                <img
                  src={
                    companyBranding.hasCustomLogo && companyBranding.logoUrl
                      ? companyBranding.logoUrl
                      : '/assets/maestro-tires-logo.png'
                  }
                  alt="Maestro Leave Management Logo"
                  className="h-12 md:h-14 w-auto max-w-full object-contain"
                />
              </div>
              <div className="space-y-2">
                <h2
                  id="welcome-title"
                  className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900"
                >
                  Maestro Leave Management
                </h2>
                <p id="welcome-message" className="text-base text-neutral-600 font-medium">
                  Welcome to Maestro Leave Management
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-2">
                <div className="p-3.5 rounded-xl bg-amber-50/75 border border-amber-300 border-t-[5px] border-t-amber-500">
                  <div className="text-xs font-semibold text-amber-950">3-Stage Approval</div>
                  <div className="text-xs text-neutral-600 mt-0.5">
                    Employee &rarr; Team Leader &rarr; HR &rarr; Top Management
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-50/75 border border-emerald-300 border-t-[5px] border-t-emerald-600">
                  <div className="text-xs font-semibold text-emerald-950">Half-Day &amp; Holidays</div>
                  <div className="text-xs text-neutral-600 mt-0.5">
                    0.5 day leave units &amp; Mon–Sat working calendar
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Universal Employee 360° Drill-Down Console */}
        {drillDownTarget && (
          <section id="module-employee-360-drilldown" className="space-y-6 mb-8 w-full max-w-full min-w-0">
            <MyProfile
              key={`drilldown-${drillDownTarget.employeeCode || drillDownTarget.employeeId || drillDownTarget.userId || drillDownTarget.employeeName}`}
              targetEmployeeId={
                drillDownTarget.employeeCode ||
                drillDownTarget.employeeId ||
                drillDownTarget.employeeName ||
                null
              }
              targetUserId={
                !drillDownTarget.employeeCode &&
                !drillDownTarget.employeeId &&
                !drillDownTarget.employeeName
                  ? drillDownTarget.userId ?? null
                  : null
              }
              onBack={() => {
                clearEmployee360ProfileState();
                setDrillDownTarget(null);
              }}
              onRequestLogout={() => setIsLogoutModalOpen(true)}
            />
          </section>
        )}

        {/* Module 2: Dashboard */}
        {!drillDownTarget && activeModule === 'dashboard' && (
          <section id="module-dashboard" className="space-y-6">
            <Dashboard
              key={`dashboard-${activeRole}`}
              onNavigate={(mod) => setActiveModule(mod as NavModule)}
            />
          </section>
        )}

        {/* Module 3: My Leave */}
        {!drillDownTarget && activeModule === 'my-leave' && (
          <section id="module-my-leave" className="space-y-6">
            <MyLeavePortal key={`myleave-${activeRole}`} />
          </section>
        )}

        {/* Module 4: Leave Balance (Employee UI Foundation & Admin Leave Balance Dashboard) */}
        {!drillDownTarget && activeModule === 'leave-balance' && (
          <section id="module-leave-balance" className="space-y-6">
            {activeRole === 'SUPER_ADMIN' || activeRole === 'HR' ? (
              <AdminLeaveBalance key={`admin-balance-${activeRole}`} />
            ) : (
              <MyLeaveBalance key={`balance-${activeRole}`} />
            )}
          </section>
        )}

        {/* Module 4.5: My Work Schedule & Roster (Step 7 Employee UI) */}
        {!drillDownTarget && activeModule === 'my-schedule' && (
          <section id="module-my-schedule" className="space-y-6">
            <MySchedule key={`schedule-${activeRole}`} />
          </section>
        )}

        {/* Module: My Attendance (read-only; no employee punch in/out) */}
        {!drillDownTarget && isCurrentModuleAuthorized && activeModule === 'attendance' && (
          <section id="module-attendance" className="space-y-6">
            <AttendanceAdmin canManage={false} />
          </section>
        )}

        {/* Module: My Profile */}
        {!drillDownTarget && activeModule === 'my-profile' && (
          <section id="module-my-profile" className="space-y-6 w-full max-w-full min-w-0">
            <MyProfile
              key={`profile-${activeRole}-${getActiveUserId()}`}
              onRequestLogout={() => setIsLogoutModalOpen(true)}
            />
          </section>
        )}

        {/* Module: Reporting Person (Stage 1 Approval Dashboard) */}
        {!drillDownTarget && isCurrentModuleAuthorized && activeModule === 'team-leader' && (
          <section id="module-team-leader" className="space-y-6">
            <TeamLeaderApprovalDashboard key={`tl-${activeRole}`} />
          </section>
        )}

        {/* Module 5: HR (HR Approval Dashboard) */}
        {!drillDownTarget && isCurrentModuleAuthorized && activeModule === 'hr' && (
          <section id="module-hr" className="space-y-6">
            <HrApprovalDashboard key={`hr-${activeRole}`} />
          </section>
        )}

        {/* Module 6: Management (Top Management Approval Desk) */}
        {!drillDownTarget && isCurrentModuleAuthorized && activeModule === 'management' && (
          <section id="module-management" className="space-y-6">
            <ManagementApprovalDashboard key={`mgmt-${activeRole}`} />
          </section>
        )}

        {/* Module: Reports & MIS */}
        {!drillDownTarget && isCurrentModuleAuthorized && activeModule === 'reports' && (
          <section id="module-reports" className="space-y-6">
            <ReportsMis key={`reports-${activeRole}`} />
          </section>
        )}

        {/* Module 7: Administration (Admin UI Master Foundation) */}
        {!drillDownTarget && isCurrentModuleAuthorized && activeModule === 'administration' && (
          <section id="module-administration" className="space-y-6">
            {/* Mobile Administration Section Switcher Bar */}
            <div
              id="mobile-admin-section-bar"
              className="md:hidden bg-white rounded-xl border border-neutral-200 p-3 flex items-center justify-between gap-2 shadow-2xs"
            >
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  Administration Section
                </div>
                <div className="text-xs font-bold text-neutral-900 truncate mt-0.5">
                  {activeAdminTabObj?.label || adminTab}
                </div>
              </div>
              <button
                id="btn-mobile-admin-drawer"
                type="button"
                onClick={() => setIsMobileDrawerOpen(true)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
              >
                <Menu className="w-4 h-4" />
                <span>Switch Section</span>
              </button>
            </div>

            {/* Categorized Administration dropdown navigation */}
            <div id="desktop-admin-dropdown-nav" ref={adminDropdownNavRef} className="hidden md:flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-3">
              {([
                { label: 'People & Organization', icon: Users, tabs: ['users', 'employees', 'roles', 'departments', 'designations'] as AdminTab[] },
                { label: 'Work Schedule & Attendance', icon: CalendarDays, tabs: ['working-days', 'weekly-offs', 'shifts', 'employee-shifts', 'department-shifts', 'overtime', 'attendance'] as AdminTab[] },
                { label: 'Leave Management', icon: Calendar, tabs: ['leave-types', 'leave-policies', 'leave-balances', 'leave-requests', 'holidays', 'workflow-settings'] as AdminTab[] },
                { label: 'System & Security', icon: ShieldCheck, tabs: ['audit', 'system-overview'] as AdminTab[] },
              ]).map((group) => {
                const groupItems = group.tabs
                  .map((id) => allAdminTabItems.find((item) => item.id === id))
                  .filter((item): item is (typeof allAdminTabItems)[number] => Boolean(item))
                  .filter((item) => item.id === 'weekly-offs'
                    ? activeRole === 'SUPER_ADMIN' || activeRole === 'HR' || canAccessAdminTab(item.id, activeRole)
                    : canAccessAdminTab(item.id, activeRole));
                if (!groupItems.length) return null;
                const isGroupActive = groupItems.some((item) => item.id === adminTab);
                const GroupIcon = group.icon;
                return (
                  <details key={group.label} className="relative">
                    <summary
                      className={`list-none inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer select-none transition-colors [&::-webkit-details-marker]:hidden ${
                        isGroupActive
                          ? 'border-red-300 bg-red-50 text-red-800'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300'
                      }`}
                    >
                      <GroupIcon className="h-4 w-4 shrink-0" />
                      <span>{group.label}</span>
                      {isGroupActive && <span className="h-1.5 w-1.5 rounded-full bg-red-600" />}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </summary>
                    <div className="absolute left-0 top-full z-40 mt-1 min-w-[240px] max-w-[320px] rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
                      {groupItems.map((item) => {
                        const ItemIcon = item.icon;
                        const selected = adminTab === item.id;
                        return (
                          <button
                            key={item.id}
                            id={`admin-dropdown-${item.id}`}
                            type="button"
                            onClick={(event) => {
                              setAdminTab(item.id);
                              const details = (event.currentTarget as HTMLButtonElement).closest('details');
                              if (details) details.open = false;
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                              selected ? 'bg-red-50 text-red-800' : 'text-neutral-700 hover:bg-neutral-50'
                            }`}
                          >
                            <ItemIcon className="h-4 w-4 shrink-0" />
                            <span className="min-w-0 flex-1">{item.label}</span>
                            {selected && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-red-700" />}
                          </button>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
              <span className="ml-auto hidden xl:inline-flex items-center gap-1.5 text-[11px] text-neutral-500">
                <Settings className="h-3.5 w-3.5" />
                {activeAdminTabObj?.label || 'Administration'}
              </span>
            </div>

            {!isCurrentAdminTabAuthorized && (
              <div
                id="admin-tab-access-denied"
                className="bg-white rounded-xl border border-rose-200 p-6 text-center space-y-2"
              >
                <div className="text-sm font-bold text-rose-700">
                  Access Restricted (SUPER_ADMIN Required)
                </div>
                <p className="text-xs text-neutral-600">
                  Your role ({activeRole}) does not have permission to access the <strong>{adminTab}</strong> administration section.
                </p>
              </div>
            )}

            {/* Tab: Users */}
            {isCurrentAdminTabAuthorized && adminTab === 'users' && <UserManagementAdmin initialSubTab="users" navigationResetKey={navigationResetKey} onSubTabChange={(t) => setAdminTab(t)} />}

            {/* Tab: Employees */}
            {isCurrentAdminTabAuthorized && adminTab === 'employees' && <UserManagementAdmin initialSubTab="employees" navigationResetKey={navigationResetKey} onSubTabChange={(t) => setAdminTab(t)} />}

            {/* Tab: Roles */}
            {isCurrentAdminTabAuthorized && adminTab === 'roles' && <UserManagementAdmin initialSubTab="roles" navigationResetKey={navigationResetKey} onSubTabChange={(t) => setAdminTab(t)} />}

            {/* Tab: Departments */}
            {isCurrentAdminTabAuthorized && adminTab === 'departments' && <UserManagementAdmin initialSubTab="departments" navigationResetKey={navigationResetKey} onSubTabChange={(t) => setAdminTab(t)} />}

            {/* Tab: Designations */}
            {isCurrentAdminTabAuthorized && adminTab === 'designations' && <UserManagementAdmin initialSubTab="designations" navigationResetKey={navigationResetKey} onSubTabChange={(t) => setAdminTab(t)} />}

            {/* Tab: Working Days & Timing */}
            {isCurrentAdminTabAuthorized && adminTab === 'working-days' && <WorkingDaysAdmin initialSubTab="working-days" />}

            {/* Tab: Weekly-Off Overrides */}
            {(activeRole === 'SUPER_ADMIN' || activeRole === 'HR' || isCurrentAdminTabAuthorized) && adminTab === 'weekly-offs' && <WorkingDaysAdmin initialSubTab="weekly-off" />}

            {/* Tab: Shifts Master */}
            {isCurrentAdminTabAuthorized && adminTab === 'shifts' && <ShiftScheduleAdmin initialSubTab="shifts" />}

            {/* Tab: Employee Shift Assignments */}
            {isCurrentAdminTabAuthorized && adminTab === 'employee-shifts' && <ShiftScheduleAdmin initialSubTab="assignments" />}

            {/* Tab: Department Shift Assignments */}
            {isCurrentAdminTabAuthorized && adminTab === 'department-shifts' && <ShiftScheduleAdmin initialSubTab="departments" />}

            {/* Tab: Overtime Management */}
            {isCurrentAdminTabAuthorized && adminTab === 'overtime' && <OvertimeAdmin />}

            {/* Tab: Employee Attendance */}
            {isCurrentAdminTabAuthorized && adminTab === 'attendance' && <AttendanceAdmin canManage={isCurrentAdminTabAuthorized} />}

            {/* Tab: System Audit Trail */}
            {isCurrentAdminTabAuthorized && adminTab === 'audit' && <SystemAuditAdmin />}

            {/* Tab: Leave Types Administration */}
            {isCurrentAdminTabAuthorized && adminTab === 'leave-types' && <LeaveTypesAdmin />}

            {/* Tab: Leave Policies Administration */}
            {isCurrentAdminTabAuthorized && adminTab === 'leave-policies' && <LeavePoliciesAdmin />}

            {/* Tab: Employee Leave Balances Dashboard */}
            {isCurrentAdminTabAuthorized && adminTab === 'leave-balances' && <AdminLeaveBalance />}

            {/* Tab: Holidays & Working Calendar Administration */}
            {isCurrentAdminTabAuthorized && adminTab === 'holidays' && <HolidayCalendarAdmin />}

            {/* Tab: Leave Request Management */}
            {isCurrentAdminTabAuthorized && adminTab === 'leave-requests' && <AdminLeaveRequests />}

            {/* Tab: Leave Workflow Settings */}
            {isCurrentAdminTabAuthorized && adminTab === 'workflow-settings' && <AdminSystemSettings />}

            {/* Tab 5: System Overview & Schemas */}
            {isCurrentAdminTabAuthorized && adminTab === 'system-overview' && (
              <div className="space-y-6">
                {/* Company Branding & Logo Administration Card */}
                <div
                  id="admin-company-branding-card"
                  className="bg-white rounded-xl border border-neutral-200/80 p-6 shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-neutral-700" />
                        <span>Company Branding &amp; Logo (Global)</span>
                      </h3>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Configure the official company logo displayed across Maestro Leave Management. Only SUPER_ADMIN can upload, replace, or remove the logo.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                      {companyBranding.hasCustomLogo ? 'Custom Logo Active' : 'Default Branding'}
                    </span>
                  </div>

                  {adminLogoFeedback && (
                    <div
                      className={`p-3 rounded-lg border text-xs flex items-center gap-2 font-medium ${
                        adminLogoFeedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}
                    >
                      {adminLogoFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{adminLogoFeedback.message}</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                    <div className="flex items-center gap-4">
                      {adminPendingLogo ? (
                        <img
                          id="admin-logo-preview"
                          src={adminPendingLogo.fileData}
                          alt="Company Logo Preview"
                          className="w-14 h-14 rounded-xl object-contain bg-white border-2 border-red-600 p-1.5 shadow-xs"
                        />
                      ) : companyBranding.hasCustomLogo && companyBranding.logoUrl ? (
                        <img
                          id="admin-logo-current"
                          src={companyBranding.logoUrl}
                          alt="Maestro Company Logo"
                          className="w-14 h-14 rounded-xl object-contain bg-white border border-neutral-200 p-1.5 shadow-xs"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-red-700 text-white flex items-center justify-center font-bold text-lg shadow-xs">
                          M
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-neutral-900 text-sm">
                          Maestro Leave Management
                        </div>
                        {adminPendingLogo ? (
                          <div className="text-xs text-red-700 font-medium mt-0.5">
                            Selected for preview: {adminPendingLogo.fileName} ({Math.round(adminPendingLogo.sizeBytes / 1024)} KB)
                          </div>
                        ) : companyBranding.hasCustomLogo ? (
                          <div className="text-xs text-neutral-500 mt-0.5">
                            {companyBranding.originalName || companyBranding.fileName} &bull; {companyBranding.mimeType}
                          </div>
                        ) : (
                          <div className="text-xs text-neutral-500 mt-0.5">
                            Default Maestro monogram emblem (Upload JPEG, PNG, or WEBP up to 5 MB)
                          </div>
                        )}
                      </div>
                    </div>

                    {activeRole === 'SUPER_ADMIN' ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <label
                          htmlFor="admin-overview-logo-input"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-800 font-semibold hover:bg-red-50/50 hover:text-red-700 hover:border-red-200 cursor-pointer shadow-2xs"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{companyBranding.hasCustomLogo ? 'Replace Logo' : 'Upload Logo'}</span>
                        </label>
                        <input
                          id="admin-overview-logo-input"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleAdminSelectLogo}
                          className="hidden"
                        />

                        {adminPendingLogo && (
                          <button
                            id="btn-admin-save-logo"
                            type="button"
                            disabled={adminLogoSaving}
                            onClick={handleAdminUploadLogo}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800 disabled:opacity-50 cursor-pointer shadow-2xs"
                          >
                            <span>{adminLogoSaving ? 'Uploading...' : 'Save Logo'}</span>
                          </button>
                        )}

                        {companyBranding.hasCustomLogo && (
                          <button
                            id="btn-admin-remove-logo"
                            type="button"
                            disabled={adminLogoSaving}
                            onClick={handleAdminRemoveLogo}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove Logo</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-500 italic">
                        View-only (Only SUPER_ADMIN can modify company logo)
                      </div>
                    )}
                  </div>
                </div>

                {/* Master Data Schemas Overview */}
                <div className="bg-white rounded-xl border border-neutral-200/80 p-6 shadow-xs">
                  <h3 className="text-sm font-semibold text-neutral-800 mb-3 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-neutral-600" />
                    PostgreSQL 10-Table Architecture
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
                      <span className="font-semibold text-xs text-neutral-900 block">1. users</span>
                      <span className="text-[11px] text-neutral-500 block mt-0.5">
                        id, username, email, password_hash, role_id, is_active, timestamps
                      </span>
                    </div>
                    <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
                      <span className="font-semibold text-xs text-neutral-900 block">2. roles</span>
                      <span className="text-[11px] text-neutral-500 block mt-0.5">
                        id, name, description, created_at
                      </span>
                    </div>
                    <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
                      <span className="font-semibold text-xs text-neutral-900 block">3. employees</span>
                      <span className="text-[11px] text-neutral-500 block mt-0.5">
                        id, employee_code, employee_name, official_email, mobile, department_id, designation_id, timestamps
                      </span>
                    </div>
                    <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
                      <span className="font-semibold text-xs text-neutral-900 block">4. departments</span>
                      <span className="text-[11px] text-neutral-500 block mt-0.5">
                        id, name, code, is_active, created_at, updated_at
                      </span>
                    </div>
                    <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
                      <span className="font-semibold text-xs text-neutral-900 block">5. designations</span>
                      <span className="text-[11px] text-neutral-500 block mt-0.5">
                        id, name, code, is_active, created_at, updated_at
                      </span>
                    </div>
                    <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
                      <span className="font-semibold text-xs text-neutral-900 block">6. system_settings</span>
                      <span className="text-[11px] text-neutral-500 block mt-0.5">
                        id, setting_key, setting_value, description, updated_at
                      </span>
                    </div>
                    <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200/80">
                      <span className="font-semibold text-xs text-emerald-950 block">7. leave_types (Step 3)</span>
                      <span className="text-[11px] text-neutral-600 block mt-0.5">
                        id, code, name, description, is_paid, requires_document, supports_half_day, is_active, display_order
                      </span>
                    </div>
                    <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200/80">
                      <span className="font-semibold text-xs text-emerald-950 block">8. leave_policies (Step 3)</span>
                      <span className="text-[11px] text-neutral-600 block mt-0.5">
                        id, leave_type_id, policy_name, annual_allocation, frequency, carry_forward, notice, same_day, etc.
                      </span>
                    </div>
                    <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200/80">
                      <span className="font-semibold text-xs text-emerald-950 block">9. leave_balances (Step 3)</span>
                      <span className="text-[11px] text-neutral-600 block mt-0.5">
                        id, employee_id, leave_type_id, opening, allocated, carry_forward, adjustments, used, reserved, available, year
                      </span>
                    </div>
                    <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200/80 md:col-span-2 lg:col-span-3">
                      <span className="font-semibold text-xs text-emerald-950 block">10. leave_balance_transactions (Step 3)</span>
                      <span className="text-[11px] text-neutral-600 block mt-0.5">
                        id, employee_id, leave_type_id, balance_id, transaction_type, quantity, reference_type, reference_id, remarks, created_by, created_at
                      </span>
                    </div>
                  </div>
                </div>

                {/* Configurable System Settings */}
                <div className="bg-white rounded-xl border border-neutral-200/80 p-6 shadow-xs">
                  <h3 className="text-sm font-semibold text-neutral-800 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-neutral-600" />
                    Operational Cutoff & Timings
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-neutral-200">
                    <table className="w-full text-left text-xs text-neutral-700">
                      <thead className="bg-neutral-50 text-neutral-900 font-semibold border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-3">Setting Key</th>
                          <th className="px-4 py-3">Default Value</th>
                          <th className="px-4 py-3">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200">
                        {(settings.length > 0
                          ? settings
                          : [
                              {
                                settingKey: 'office_start_time',
                                settingValue: '08:30',
                                description: 'Standard daily office start time',
                              },
                              {
                                settingKey: 'office_end_time',
                                settingValue: '17:30',
                                description: 'Standard daily office end time',
                              },
                              {
                                settingKey: 'normal_leave_cutoff_time',
                                settingValue: '07:00',
                                description: 'Cutoff time for applying standard same-day leave',
                              },
                              {
                                settingKey: 'timezone',
                                settingValue: 'Asia/Kolkata',
                                description: 'Organization operational timezone',
                              },
                            ]
                        ).map((item) => (
                          <tr key={item.settingKey} className="hover:bg-neutral-50/50">
                            <td className="px-4 py-3 font-mono text-neutral-900 font-medium">
                              {item.settingKey}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded bg-neutral-100 font-mono text-neutral-800">
                                {item.settingValue}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-neutral-500">{item.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Footer (Desktop Only — Hidden on Mobile for Native App Experience) */}
      <footer
        id="app-footer"
        className="hidden md:block bg-neutral-900 text-white border-t-2 border-red-700 px-4 lg:px-8 py-3.5 text-center text-xs"
      >
        <div className="text-neutral-100">Maestro Leave Management &bull; Employee &rarr; Team Leader &rarr; HR &rarr; Top Management Workflow</div>
        <div className="mt-1 font-medium text-white">Build By: Lokesh Yadav</div>
      </footer>

      {/* Mobile Bottom Navigation Bar (Dedicated App-Like Mobile Navigation) */}
      <nav
        id="mobile-bottom-nav"
        className={`${MT_THEME.mobile.bottomNav} w-full max-w-full`}
        aria-label="Mobile Primary Navigation"
      >
        {primaryMobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = !drillDownTarget && activeModule === item.id && !isMobileDrawerOpen;
          return (
            <button
              key={item.id}
              id={`mobile-bottom-nav-btn-${item.id}`}
              type="button"
              onClick={() => setActiveModule(item.id)}
              className={`${MT_THEME.mobile.bottomNavItem} ${
                isActive ? MT_THEME.mobile.bottomNavItemActive : MT_THEME.mobile.bottomNavItemInactive
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="truncate max-w-full px-0.5">{item.mobileLabel}</span>
            {item.id === 'team-leader' && approvalCounts.teamLeader > 0 && <span className="absolute -top-1 right-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{approvalCounts.teamLeader}</span>}
            {item.id === 'hr' && approvalCounts.hr > 0 && <span className="absolute -top-1 right-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{approvalCounts.hr}</span>}
            {item.id === 'management' && approvalCounts.management > 0 && <span className="absolute -top-1 right-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{approvalCounts.management}</span>}
            </button>
          );
        })}

        <button
          id="btn-mobile-nav-more"
          type="button"
          onClick={() => setIsMobileDrawerOpen((prev) => !prev)}
          aria-expanded={isMobileDrawerOpen}
          aria-controls="mobile-navigation-drawer"
          className={`${MT_THEME.mobile.bottomNavItem} ${
            isMobileDrawerOpen ||
            (!drillDownTarget && !primaryMobileNavItems.some((i) => i.id === activeModule))
              ? MT_THEME.mobile.bottomNavItemActive
              : MT_THEME.mobile.bottomNavItemInactive
          }`}
        >
          <Menu className="w-5 h-5 shrink-0" />
          <span className="truncate max-w-full px-0.5">Menu</span>
        </button>
      </nav>

      {/* Admin System Settings Modal */}
      <AdminSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onBrandingChanged={(b) => setCompanyBranding(b)}
      />

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div
          id="logout-confirm-modal"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4"
        >
          <div className="bg-white rounded-2xl sm:rounded-xl max-w-sm w-full p-5 sm:p-6 shadow-xl border border-neutral-200 border-t-3 border-t-red-700 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Confirm Logout</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Signed in as <strong>{displayFullName}</strong> ({activeRole})
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Are you sure you want to log out of <strong>Maestro Leave Management</strong>? Your current session and cached user state will be cleared.
            </p>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-neutral-100 text-xs">
              <button
                id="btn-cancel-logout"
                type="button"
                disabled={loggingOut}
                onClick={() => setIsLogoutModalOpen(false)}
                className="min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-xl sm:rounded-lg border border-neutral-200 text-neutral-700 font-semibold hover:bg-neutral-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-logout"
                type="button"
                disabled={loggingOut}
                onClick={handleConfirmLogout}
                className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl sm:rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{loggingOut ? 'Logging out...' : 'Confirm Logout'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {viewingUser && isViewingAsAnotherUser() && (
        <div className="fixed top-0 inset-x-0 z-[120] bg-amber-100 border-b border-amber-300 px-3 py-2 shadow-md">
          <div className="mx-auto max-w-screen-2xl flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
            <div className="min-w-0 text-amber-950"><strong>Super Admin — Viewing as {viewingUser.employeeName}</strong><span className="ml-2">({viewingUser.employeeCode || 'No employee code'} · {viewingUser.role})</span><span className="ml-2 hidden md:inline">Actions run in the selected user context.</span></div>
            <button type="button" onClick={() => { endSuperAdminUserContext(); setViewingUser(null); setActiveRoleState('SUPER_ADMIN'); setActiveModuleState('dashboard'); setAdminTabState('employees'); setCurrentUserProfile(null); window.history.replaceState({ activeModule: 'dashboard' }, '', '#dashboard'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded-lg bg-amber-900 px-3 py-2 font-semibold text-white hover:bg-amber-950">Return to Super Admin</button>
          </div>
        </div>
      )}
    </div>
  );
}

