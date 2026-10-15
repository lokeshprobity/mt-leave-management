import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, LayoutDashboard, UserRound, Wallet, Clock, X, Users,
  ShieldCheck, BriefcaseBusiness, BarChart3, Settings2, LockKeyhole,
} from 'lucide-react';
import { Dashboard } from '../Dashboard.tsx';
import { MyLeavePortal } from '../MyLeavePortal.tsx';
import { MyLeaveBalance } from '../MyLeaveBalance.tsx';
import { MySchedule } from '../MySchedule.tsx';
import { MyProfile } from '../MyProfile.tsx';
import { TeamLeaderApprovalDashboard } from '../TeamLeaderApprovalDashboard.tsx';
import { HrApprovalDashboard } from '../HrApprovalDashboard.tsx';
import { ManagementApprovalDashboard } from '../ManagementApprovalDashboard.tsx';
import { ReportsMis } from '../ReportsMis.tsx';
import { apiFetch, getAllowedNavModules, getVisibleAdminTabs } from '../../lib/api.ts';
import type { EmployeeDto, RoleDto, UserRole } from '../../types/leave.ts';

interface EmployeeDashboardAccessProps {
  employeeId: number;
  employeeName: string;
  employeeCode?: string;
  onClose: () => void;
}

type ViewTab =
  | 'dashboard' | 'my-leave' | 'leave-balance' | 'my-schedule' | 'my-profile'
  | 'team-leader' | 'hr' | 'management' | 'reports' | 'administration';

const MODULES: { id: ViewTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-leave', label: 'My Leave', icon: CalendarDays },
  { id: 'leave-balance', label: 'Leave Balance', icon: Wallet },
  { id: 'my-schedule', label: 'My Schedule', icon: Clock },
  { id: 'my-profile', label: 'My Profile', icon: UserRound },
  { id: 'team-leader', label: 'Team Leader', icon: Users },
  { id: 'hr', label: 'HR Desk', icon: ShieldCheck },
  { id: 'management', label: 'Top Management', icon: BriefcaseBusiness },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'administration', label: 'Administration', icon: Settings2 },
];

const ADMIN_TAB_LABELS: Record<string, string> = {
  users: 'User Management', roles: 'Role & Permission Management', employees: 'Employee Directory',
  departments: 'Departments', designations: 'Designations', 'working-days': 'Working Days & Weekly Offs',
  'leave-types': 'Leave Types', 'leave-policies': 'Leave Policies', 'leave-balance': 'Leave Balance Management',
  holidays: 'Holiday Calendar', shifts: 'Shift Management', overtime: 'Overtime Management', audit: 'Audit Logs',
};

/**
 * Role-aware Super Admin preview. It never changes the authenticated Super Admin session.
 * The employee's role and its persisted permission list are loaded from the existing APIs.
 */
export function EmployeeDashboardAccess({
  employeeId, employeeName, employeeCode, onClose,
}: EmployeeDashboardAccessProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>('dashboard');
  const [employee, setEmployee] = useState<EmployeeDto | null>(null);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingAccess(true);
    setAccessError(null);
    Promise.all([apiFetch('/api/employees'), apiFetch('/api/roles')])
      .then(async ([employeeRes, rolesRes]) => {
        const [employeeData, rolesData] = await Promise.all([
          employeeRes.ok ? employeeRes.json() : Promise.reject(new Error('Employee access details could not be loaded.')),
          rolesRes.ok ? rolesRes.json() : Promise.reject(new Error('Role permissions could not be loaded.')),
        ]);
        if (cancelled) return;
        const list: EmployeeDto[] = employeeData.employees || [];
        const target = list.find((item) => Number(item.id) === Number(employeeId));
        if (!target) throw new Error('The selected employee could not be found in the employee directory.');
        setEmployee(target);
        setRoles((rolesData.roles || []) as RoleDto[]);
      })
      .catch((error: any) => {
        if (!cancelled) setAccessError(error?.message || 'Unable to load employee permissions.');
      })
      .finally(() => { if (!cancelled) setLoadingAccess(false); });
    return () => { cancelled = true; };
  }, [employeeId]);

  const role = useMemo<UserRole>(() => {
    const assignedRole = String(employee?.role || '').trim().toUpperCase();
    const operationalRole = String(employee?.operationalRole || '').trim().toUpperCase();
    const builtInRoles = new Set(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']);
    // Custom role assignment takes precedence; otherwise honor operational role
    // when the account role is the generic EMPLOYEE role.
    const resolved = assignedRole && !builtInRoles.has(assignedRole)
      ? assignedRole
      : assignedRole || operationalRole || 'EMPLOYEE';
    return resolved as UserRole;
  }, [employee]);

  const assignedRole = useMemo(() => {
    const normalized = (value?: string | null) => String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    return roles.find((item) =>
      [item.name, item.code, item.displayName].some((value) => normalized(value) === normalized(role))
    ) || roles.find((item) =>
      [item.name, item.code, item.displayName].some((value) =>
        normalized(value) === normalized(employee?.role) ||
        normalized(value) === normalized(employee?.operationalRole)
      )
    );
  }, [roles, role, employee]);

  const permissions = assignedRole?.permissions || [];
  const allowedModules = useMemo(() => new Set(getAllowedNavModules(role, permissions)), [role, permissions]);
  const allowedAdminTabs = useMemo(() => getVisibleAdminTabs(role, permissions), [role, permissions]);
  const permissionSet = new Set(permissions.map((value) => String(value).trim().toUpperCase()));
  const hasAny = (...codes: string[]) =>
    permissionSet.has('ALL_PERMISSIONS') ||
    permissionSet.has('*') ||
    codes.some((code) => permissionSet.has(code.toUpperCase()));
  // In this preview, the persisted role permission list is authoritative for role-specific modules.
  // The generic navigation helper intentionally keeps self-service available for built-in roles;
  // applying this stricter filter here prevents that default from masking explicit role settings.
  const permissionGate: Partial<Record<ViewTab, boolean>> = {
    dashboard: true,
    'my-profile': hasAny('PROFILE_VIEW_OWN', 'PROFILE_EDIT_BASIC', 'PASSWORD_CHANGE_OWN', 'ALL_PERMISSIONS'),
    'my-leave': hasAny('LEAVE_APPLY', 'LEAVE_VIEW_OWN', 'LEAVE_VIEW_TEAM', 'LEAVE_VIEW_ALL'),
    'leave-balance': hasAny('LEAVE_VIEW_OWN', 'LEAVE_VIEW_TEAM', 'LEAVE_VIEW_ALL', 'LEAVE_BALANCE_VIEW', 'LEAVE_BALANCE_MANAGE', 'LEAVE_BALANCE_ADJUST'),
    'my-schedule': hasAny('SCHEDULE_VIEW_OWN', 'SHIFT_VIEW', 'SHIFT_ASSIGN', 'SHIFT_EDIT', 'LEAVE_APPLY', 'LEAVE_VIEW_OWN'),
    'team-leader': hasAny('LEAVE_TEAM_LEADER_APPROVE', 'LEAVE_VIEW_TEAM'),
    hr: hasAny('LEAVE_HR_APPROVE'),
    management: hasAny('LEAVE_FINAL_APPROVE'),
    reports: hasAny('LEAVE_VIEW_ALL', 'REPORT_VIEW', 'REPORTS_VIEW', 'reports.view', 'reports.export'),
    administration: allowedAdminTabs.length > 0,
  };
  const visibleTabs = MODULES.filter(
    (item) => allowedModules.has(item.id) && permissionGate[item.id] === true
  );
  const activeRoleLabel = assignedRole?.displayName || assignedRole?.name || role;

  const openModule = (module: string) => {
    const normalized = module === 'welcome' ? 'dashboard' : module;
    if (MODULES.some((item) => item.id === normalized && allowedModules.has(normalized))) {
      setActiveTab(normalized as ViewTab);
    }
  };

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [activeTab, visibleTabs]);

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950/60 backdrop-blur-[2px] p-0 sm:p-5 flex items-stretch sm:items-center justify-center">
      <section role="dialog" aria-modal="true" aria-label={`Employee dashboard for ${employeeName}`}
        className="w-full max-w-7xl h-full sm:h-[94vh] bg-neutral-50 sm:rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col">
        <header className="shrink-0 bg-white border-b border-neutral-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center shrink-0"><LayoutDashboard className="w-5 h-5" /></div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-red-700">Super Admin • Role-aware Employee View</p>
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 truncate">{employeeName}</h2>
              <p className="text-[11px] text-neutral-500">{employeeCode ? `Employee Code: ${employeeCode} • ` : ''}{employee?.departmentName || 'Department not assigned'} • Role: {activeRoleLabel}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 cursor-pointer shrink-0">
            <X className="w-4 h-4" /><span className="hidden sm:inline">Close View</span>
          </button>
        </header>

        {loadingAccess ? (
          <div className="flex-1 grid place-items-center text-sm text-neutral-500">Loading assigned role and permissions…</div>
        ) : accessError ? (
          <div className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{accessError}<p className="mt-2 text-xs">The preview is blocked rather than showing a guessed permission set.</p></div>
        ) : (
          <>
            <nav aria-label="Employee role-based navigation" className="shrink-0 bg-white border-b border-neutral-200 px-2 sm:px-6 flex items-center gap-1 overflow-x-auto">
              {visibleTabs.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-2 px-3 py-3 text-xs font-semibold border-b-2 whitespace-nowrap cursor-pointer ${activeTab === id ? 'border-red-700 text-red-700' : 'border-transparent text-neutral-500 hover:text-neutral-900'}`}>
                  <Icon className="w-4 h-4" />{label}
                </button>
              ))}
            </nav>
            <main className="flex-1 overflow-y-auto p-3 sm:p-6">
              {activeTab === 'dashboard' && <Dashboard key={`employee-view-dashboard-${employeeId}`} employeeId={employeeId} employeeName={employeeName} viewAsEmployee viewAsRole={role} onNavigate={openModule} />}
              {activeTab === 'my-leave' && <MyLeavePortal key={`employee-view-leave-${employeeId}`} targetEmployeeId={employeeId} targetEmployeeName={employeeName} />}
              {activeTab === 'leave-balance' && <MyLeaveBalance key={`employee-view-balance-${employeeId}`} targetEmployeeId={employeeId} viewAsEmployee />}
              {activeTab === 'my-schedule' && <MySchedule key={`employee-view-schedule-${employeeId}`} targetEmployeeId={employeeId} />}
              {activeTab === 'my-profile' && <MyProfile key={`employee-view-profile-${employeeId}`} currentEmployeeId={employeeId} targetEmployeeId={employeeId} viewAsEmployee />}
              {activeTab === 'team-leader' && <TeamLeaderApprovalDashboard />}
              {activeTab === 'hr' && <HrApprovalDashboard />}
              {activeTab === 'management' && <ManagementApprovalDashboard />}
              {activeTab === 'reports' && <ReportsMis />}
              {activeTab === 'administration' && (
                <section className="rounded-xl border border-neutral-200 bg-white p-5">
                  <div className="flex items-center gap-2 font-semibold text-neutral-900"><Settings2 className="h-5 w-5" />Permitted Administration Areas</div>
                  <p className="mt-1 text-xs text-neutral-600">These areas are listed from this employee's saved role permissions. To avoid accidentally performing privileged changes under the Super Admin session, this preview does not execute administrative mutations.</p>
                  {allowedAdminTabs.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {allowedAdminTabs.map((tab) => <div key={tab} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 flex items-center gap-2 text-sm"><LockKeyhole className="h-4 w-4 text-neutral-500" />{ADMIN_TAB_LABELS[tab] || tab}</div>)}
                  </div> : <p className="mt-4 text-sm text-neutral-500">No administration areas are assigned to this role.</p>}
                </section>
              )}
              </main>
          </>
        )}
      </section>
    </div>
  );
}
