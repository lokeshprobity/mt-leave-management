import React, { useState, useEffect } from 'react';
import {
  Users,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Building,
  Tag,
  ArrowRight,
  RefreshCw,
  Bell,
  Sun,
  Coffee,
  CalendarDays,
} from 'lucide-react';
import {
  canAccessModule,
  formatRoleDisplayName,
  getActiveRole,
  getActiveUserSession,
  getAuthHeaders,
} from '../lib/api.ts';
import { formatDate } from '../utils/dateFormat.ts';
import {
  MT_THEME,
  MT_COLOR_CARDS,
  SCHEDULE_CATEGORY_STYLES,
  getStatusBadgeClasses,
  getLeaveTypeBadgeClasses,
  getLeaveTypeCardClasses,
  getLeaveTypeBarColor,
  getHolidayCategoryStyle,
} from '../utils/theme.ts';
import { UserRole } from '../types/leave.ts';
import { Employee360Link } from './Employee360Trigger.tsx';

interface DashboardStats {
  totalEmployees: number;
  onLeaveTodayCount: number;
  onLeaveTodayList: Array<{
    id: number;
    employeeId: number;
    employeeName: string;
    leaveTypeName: string;
    startDate: string;
    endDate: string;
    totalDays: string;
  }>;
  pendingTeamLeaderCount?: number;
  pendingHrCount: number;
  pendingMgmtCount: number;
  approvedCount: number;
  rejectedCount: number;
  upcomingLeaves: Array<{
    id: number;
    requestNumber: string;
    employeeName: string;
    leaveTypeName: string;
    startDate: string;
    endDate: string;
    totalDays: string;
    status: string;
    finalStatus: string;
  }>;
  leaveByType: Array<{ name: string; count: number }>;
  leaveByDepartment: Array<{ department: string; count: number }>;
  upcomingHolidays: Array<{
    id: number;
    holidayDate: string;
    holidayName: string;
    holidayType?: string;
    departmentName?: string | null;
  }>;
  employeeContext?: {
    balances: Array<{
      id: number;
      leaveTypeId: number;
      leaveTypeCode?: string;
      leaveTypeName?: string;
      available: string;
      used: string;
      allocated: string;
      openingBalance: string;
    }>;
    pendingRequests: Array<{
      id: number;
      requestNumber: string;
      startDate: string;
      endDate: string;
      totalDays: string;
      leaveTypeName: string;
      finalStatus: string;
    }>;
    approvedLeaves: Array<{
      id: number;
      requestNumber: string;
      startDate: string;
      endDate: string;
      totalDays: string;
      leaveTypeName: string;
    }>;
    requestHistory: Array<{
      id: number;
      requestNumber: string;
      startDate: string;
      endDate: string;
      totalDays: string | number;
      leaveTypeName: string;
      dayType?: string;
      reason?: string;
      applicationTimestamp?: string | null;
      status?: string;
      finalStatus?: string;
      teamLeaderDecision?: string;
      teamLeaderRemarks?: string;
      hrDecision?: string;
      hrRemarks?: string;
      managementDecision?: string;
      managementRemarks?: string;
    }>;
    upcomingLeaves: Array<{
      id: number;
      requestNumber: string;
      startDate: string;
      endDate: string;
      totalDays: string;
      leaveTypeName: string;
    }>;
    todaySchedule: {
      shiftCode: string;
      shiftName: string;
      isWeeklyOff: boolean;
      timingSummary?: string;
    };
    unreadCount: number;
  };
}

interface DashboardProps {
  onNavigate?: (module: string) => void;
  employeeId?: number;
  viewAsEmployee?: boolean;
  viewAsRole?: UserRole;
  employeeName?: string;
}

export function Dashboard({ onNavigate, employeeId, viewAsEmployee = false, viewAsRole, employeeName }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionRole: UserRole = getActiveRole();
  const activeRole: UserRole = viewAsEmployee && viewAsRole ? viewAsRole : sessionRole;

  // Preview must render the employee self-service layout regardless of operational role.
  const isEmployee = viewAsEmployee || activeRole === 'EMPLOYEE';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const statsUrl = employeeId ? `/api/dashboard/stats?employeeId=${encodeURIComponent(String(employeeId))}` : '/api/dashboard/stats';
      const res = await fetch(statsUrl, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to load dashboard statistics');
      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Error fetching dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeRole, employeeId, viewAsEmployee]);

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-neutral-200">
        <RefreshCw className="w-6 h-6 animate-spin text-neutral-500 mb-2" />
        <span className="text-xs text-neutral-500 font-medium">Loading live dashboard metrics...</span>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-center">
        <p className="text-sm font-semibold text-rose-800">{error}</p>
        <button
          onClick={loadData}
          className="mt-3 min-h-[44px] md:min-h-0 px-4 py-2 md:px-3 md:py-1.5 bg-rose-600 text-white rounded-lg md:rounded text-xs font-medium hover:bg-rose-700 cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  const todayStr = formatDate(new Date());
  const activeSession = getActiveUserSession();
  const displayRole: UserRole = activeRole;
  const displayUserName = viewAsEmployee
    ? (employeeName || 'Employee')
    : (activeSession.fullName || activeSession.username || formatRoleDisplayName(activeRole));
  const unreadNotificationsCount = stats?.employeeContext?.unreadCount ?? 0;
  const totalPendingOperational =
    (stats?.pendingTeamLeaderCount ?? 0) +
    (stats?.pendingHrCount ?? 0) +
    (stats?.pendingMgmtCount ?? 0);

  return (
    <div className="space-y-4 md:space-y-6 min-w-0">
      {/* =====================================================================
          MOBILE DASHBOARD / HOME VIEW (<768px ONLY)
         ===================================================================== */}
      <div id="dashboard-mobile-view" className="md:hidden space-y-4 min-w-0">
        {/* 1. Welcome / User Section */}
        <section
          id="mobile-dashboard-welcome"
          className={`${MT_COLOR_CARDS.slate} p-4 space-y-3 min-w-0 overflow-hidden`}
        >
          <div className="flex items-start justify-between gap-2.5 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${MT_THEME.badge.brand}`}>
                  {formatRoleDisplayName(displayRole)}
                </span>
                <span className="text-[11px] font-medium text-neutral-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3 shrink-0" />
                  <span>{todayStr}</span>
                </span>
              </div>
              <h1 className="text-base font-bold text-neutral-900 mt-1.5 leading-snug break-words">
                {displayUserName}
              </h1>
              <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                {isEmployee
                  ? 'Employee Leave Hub'
                  : 'Operational Leave & Attendance Dashboard'}
              </p>
            </div>
            <button
              id="btn-mobile-dashboard-refresh"
              type="button"
              onClick={loadData}
              title="Refresh metrics"
              aria-label="Refresh metrics"
              className={`${MT_THEME.mobile.touchTarget} px-3 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-red-200 hover:text-red-700 active:bg-red-50 text-xs font-semibold gap-1.5 shrink-0 cursor-pointer`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Compact Today Duty & Notification Bar */}
          {stats?.employeeContext && (
            <div className="pt-2.5 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-neutral-700 min-w-0">
                {stats.employeeContext.todaySchedule.isWeeklyOff ? (
                  <Coffee className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                )}
                <span className="font-semibold truncate">
                  {stats.employeeContext.todaySchedule.shiftCode} &bull;{' '}
                  {stats.employeeContext.todaySchedule.shiftName}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  unreadNotificationsCount > 0 ? MT_THEME.badge.warning : MT_THEME.badge.neutral
                }`}
              >
                {unreadNotificationsCount > 0
                  ? `${unreadNotificationsCount} Unread Alert${unreadNotificationsCount === 1 ? '' : 's'}`
                  : '0 Unread Alerts'}
              </span>
            </div>
          )}
        </section>

        {/* 2. Quick Actions (Touch-Friendly >= 44px Controls, Role-Preserved) */}
        <section
          id="mobile-dashboard-quick-actions"
          className={`${MT_COLOR_CARDS.indigo} p-4 space-y-2.5 min-w-0`}
        >
          <h2 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {isEmployee && onNavigate && (
              <>
                <button
                  id="btn-mobile-apply-leave"
                  type="button"
                  onClick={() => onNavigate('my-leave')}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-red-700 text-white text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs hover:bg-red-800 active:bg-red-900 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 shrink-0" />
                    <span>Apply Leave</span>
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
                <button
                  id="btn-mobile-detailed-ledger"
                  type="button"
                  onClick={() => onNavigate('leave-balance')}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-red-50/50 border border-red-200 text-red-800 text-xs font-semibold flex items-center justify-between gap-2 active:bg-red-100/70 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-red-700 shrink-0" />
                    <span>Detailed Ledger (Leave Balances)</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-red-700 shrink-0" />
                </button>
              </>
            )}

            {!isEmployee && onNavigate && (
              <>
                {canAccessModule('team-leader', activeRole) && (
                  <button
                    id="btn-mobile-open-tl-desk"
                    type="button"
                    onClick={() => onNavigate('team-leader')}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-700 text-white text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs active:bg-teal-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="truncate">Open Team Leader Desk</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/20 text-[10px] font-bold shrink-0">
                      {stats?.pendingTeamLeaderCount ?? 0} Pending
                    </span>
                  </button>
                )}
                {canAccessModule('hr', activeRole) && (
                  <button
                    id="btn-mobile-open-hr-desk"
                    type="button"
                    onClick={() => onNavigate('hr')}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-700 text-white text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs active:bg-amber-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="truncate">Open HR Desk</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/20 text-[10px] font-bold shrink-0">
                      {stats?.pendingHrCount ?? 0} Pending
                    </span>
                  </button>
                )}
                {canAccessModule('management', activeRole) && (
                  <button
                    id="btn-mobile-open-mgmt-desk"
                    type="button"
                    onClick={() => onNavigate('management')}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-red-700 text-white text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs hover:bg-red-800 active:bg-red-900 cursor-pointer"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span className="truncate">Open Management Desk</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/20 text-[10px] font-bold shrink-0">
                      {stats?.pendingMgmtCount ?? 0} Pending
                    </span>
                  </button>
                )}
              </>
            )}

            <button
              id="btn-mobile-quick-refresh"
              type="button"
              onClick={loadData}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white border border-neutral-200 text-neutral-700 text-xs font-semibold flex items-center justify-center gap-2 active:bg-neutral-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Live Dashboard Data</span>
            </button>
          </div>
        </section>

        {/* ===============================================================
            MOBILE EMPLOYEE VIEW (<768px)
           =============================================================== */}
        {isEmployee && stats?.employeeContext && (
          <>
            {/* 3. Important Status / Summary Cards (Stacked for Mobile) */}
            <section id="mobile-dashboard-summary-cards" className="space-y-3 min-w-0">
              {/* Today's Roster & Duty Card */}
              <div className={`${MT_COLOR_CARDS.sky} p-4 min-w-0`}>
                <span className="text-[11px] font-bold text-sky-900 uppercase tracking-wider block">
                  Today's Roster &amp; Duty
                </span>
                <div className="mt-2.5 flex items-center gap-3 min-w-0">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 ${
                      stats.employeeContext.todaySchedule.isWeeklyOff
                        ? SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.badgeClass
                        : SCHEDULE_CATEGORY_STYLES.WORKING_DAY.badgeClass
                    }`}
                  >
                    {stats.employeeContext.todaySchedule.isWeeklyOff ? (
                      <Coffee className="w-5 h-5" />
                    ) : (
                      <Sun className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-neutral-900 truncate">
                      {stats.employeeContext.todaySchedule.shiftCode} &bull;{' '}
                      {stats.employeeContext.todaySchedule.shiftName}
                    </h3>
                    <p className="text-xs text-sky-900/80 mt-0.5 break-words">
                      {stats.employeeContext.todaySchedule.timingSummary ||
                        (stats.employeeContext.todaySchedule.isWeeklyOff
                          ? 'Official Weekly Off'
                          : 'Scheduled Shift')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stacked Pending & Approved Summary Cards */}
              <div className="grid grid-cols-1 gap-3">
                <div className={`${MT_COLOR_CARDS.amber} p-4 flex items-center justify-between gap-3`}>
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                      Pending Applications
                    </span>
                    <p className="text-xs text-amber-900/80 mt-0.5">
                      Awaiting Team Leader / HR / Top Management review
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-2xl font-bold text-amber-700">
                      {stats.employeeContext.pendingRequests.length}
                    </span>
                    <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 border border-amber-300">
                      <Clock className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                <div className={`${MT_COLOR_CARDS.emerald} p-4 flex items-center justify-between gap-3`}>
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block">
                      Approved Leaves Taken
                    </span>
                    <p className="text-xs text-emerald-900/80 mt-0.5">
                      Approved requests this cycle
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-2xl font-bold text-emerald-700">
                      {stats.employeeContext.approvedLeaves.length}
                    </span>
                    <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* My Available Leave Balances (Stacked Mobile Cards) */}
              <div
                id="mobile-dashboard-leave-balances"
                className={`${MT_COLOR_CARDS.indigo} p-4 space-y-3 min-w-0`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                    <span>My Available Leave Balances</span>
                  </h2>
                </div>

                {stats.employeeContext.balances && stats.employeeContext.balances.length > 0 ? (
                  <div className="space-y-2.5">
                    {stats.employeeContext.balances.map((b) => (
                      <div
                        key={b.id}
                        className={`p-3 ${getLeaveTypeCardClasses(b.leaveTypeCode || b.leaveTypeName)} flex items-center justify-between gap-3 min-w-0`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono shrink-0 ${getLeaveTypeBadgeClasses(
                                b.leaveTypeCode || b.leaveTypeName
                              )}`}
                            >
                              {b.leaveTypeCode || `TYPE-${b.leaveTypeId}`}
                            </span>
                            <span className="text-xs text-neutral-800 font-semibold truncate">
                              {b.leaveTypeName || 'Leave'}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-neutral-700 font-medium">
                            <span>Used: {b.used}</span>
                            <span>Alloc: {b.allocated}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-lg font-bold text-neutral-900 block leading-none">
                            {b.available}
                          </span>
                          <span className="text-[10px] font-semibold text-neutral-700">
                            days avail
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-neutral-600">
                    No balance records found.
                  </div>
                )}
              </div>
            </section>

            {/* 4. Relevant Pending Items (Employee Pending Requests) */}
            <section
              id="mobile-dashboard-pending-items"
              className={`${MT_COLOR_CARDS.amber} p-4 space-y-3 min-w-0`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>My Pending Leave Requests</span>
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${MT_THEME.badge.warning}`}>
                  {stats.employeeContext.pendingRequests.length}
                </span>
              </div>
              {stats.employeeContext.pendingRequests &&
              stats.employeeContext.pendingRequests.length > 0 ? (
                <div className="space-y-2">
                  {stats.employeeContext.pendingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-1.5 min-w-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold truncate ${getLeaveTypeBadgeClasses(
                            req.leaveTypeName
                          )}`}
                        >
                          {req.leaveTypeName}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${getStatusBadgeClasses(req.finalStatus)}`}>
                          {req.finalStatus || 'PENDING'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                        <span>
                          {formatDate(req.startDate)} to {formatDate(req.endDate)} ({req.totalDays} Days)
                        </span>
                        <span className="font-mono text-neutral-500 shrink-0">
                          {req.requestNumber}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-500 py-4 text-center">
                  No pending leave requests awaiting approval.
                </p>
              )}
            </section>

            {/* 5. Recent Activity / Notifications & Upcoming Schedule */}
            <section id="mobile-dashboard-activity-section" className="space-y-3 min-w-0">
              {/* Unread Notification Activity Card */}
              <div className={`${MT_COLOR_CARDS.sky} p-4 flex items-center justify-between gap-3`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-sky-100 text-sky-800 border border-sky-300 shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-neutral-900">
                      Notifications &amp; Alerts
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {unreadNotificationsCount > 0
                        ? `You have ${unreadNotificationsCount} unread notification(s) in the header bell.`
                        : 'You are all caught up on leave and schedule alerts.'}
                    </p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                  unreadNotificationsCount > 0 ? MT_THEME.badge.info : MT_THEME.badge.neutral
                }`}>
                  {unreadNotificationsCount}
                </span>
              </div>

              {/* My Upcoming Approved Leaves */}
              <div className={`${MT_COLOR_CARDS.emerald} p-4 space-y-3 min-w-0`}>
                <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>My Upcoming Approved Leaves</span>
                </h3>
                {stats.employeeContext.upcomingLeaves &&
                stats.employeeContext.upcomingLeaves.length > 0 ? (
                  <div className="space-y-2">
                    {stats.employeeContext.upcomingLeaves.map((req) => (
                      <div
                        key={req.id}
                        className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/60 space-y-1 min-w-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold truncate ${getLeaveTypeBadgeClasses(
                              req.leaveTypeName
                            )}`}
                          >
                            {req.leaveTypeName}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${MT_THEME.badge.approved}`}>
                            {req.totalDays} day(s)
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                          <span>
                            {formatDate(req.startDate)} to {formatDate(req.endDate)}
                          </span>
                          <span className="font-mono text-neutral-500 shrink-0">
                            {req.requestNumber}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 py-4 text-center">
                    No upcoming approved leaves scheduled.
                  </p>
                )}
              </div>

              {/* Upcoming Official Holidays */}
              <div className={`${MT_COLOR_CARDS.teal} p-4 space-y-3 min-w-0`}>
                <h3 className="text-xs font-bold text-teal-950 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  <span>Upcoming Official Holidays</span>
                </h3>
                {stats.upcomingHolidays && stats.upcomingHolidays.length > 0 ? (
                  <div className="space-y-2">
                    {stats.upcomingHolidays.map((h) => {
                      const holidayStyle = getHolidayCategoryStyle(h.holidayType, h.departmentName);
                      return (
                        <div
                          key={h.id}
                          className={`p-3 rounded-xl flex items-center justify-between gap-2 min-w-0 ${holidayStyle.containerClass}`}
                        >
                          <div className="min-w-0">
                            <span className={`font-semibold text-xs block truncate ${holidayStyle.titleClass}`}>
                              {h.holidayName}
                            </span>
                            <span className={`text-[11px] ${holidayStyle.subtextClass}`}>
                              {formatDate(h.holidayDate)}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${holidayStyle.badgeClass}`}>
                            {h.departmentName && h.departmentName !== 'All Departments'
                              ? `🏢 ${h.departmentName}`
                              : h.holidayType || 'Public'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 py-4 text-center">
                    No upcoming holidays in the immediate schedule.
                  </p>
                )}
              </div>
            </section>
          </>
        )}

        {/* ===============================================================
            MOBILE OPERATIONAL / ADMIN / HR / TL / MGMT VIEW (<768px)
           =============================================================== */}
        {!isEmployee && stats && (
          <>
            {/* 3. Important Status / Summary Cards (Stacked Mobile Hierarchy) */}
            <section id="mobile-dashboard-summary-cards" className="space-y-3 min-w-0">
              {/* Primary Attendance Summary Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className={`${MT_COLOR_CARDS.slate} p-3.5 min-w-0`}>
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Total Staff
                    </span>
                    <Users className="w-4 h-4 text-slate-600 shrink-0" />
                  </div>
                  <p className="text-xl font-bold text-neutral-900 mt-1.5">
                    {stats.totalEmployees}
                  </p>
                  <span className="text-[10px] text-slate-600 block truncate">
                    Registered employees
                  </span>
                </div>

                <div className={`${MT_COLOR_CARDS.sky} p-3.5 min-w-0`}>
                  <div className="flex items-center justify-between text-sky-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      On Leave Today
                    </span>
                    <Coffee className="w-4 h-4 text-sky-600 shrink-0" />
                  </div>
                  <p className="text-xl font-bold text-sky-700 mt-1.5">
                    {stats.onLeaveTodayCount}
                  </p>
                  <span className="text-[10px] text-sky-800/80 block truncate">
                    Absent on approved leave
                  </span>
                </div>
              </div>

              {/* Stacked 3-Stage Approval Pipeline Summary Card */}
              <div className={`${MT_COLOR_CARDS.amber} p-4 space-y-2.5 min-w-0`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                    Approval Pipeline Status
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    totalPendingOperational > 0 ? MT_THEME.badge.warning : MT_THEME.badge.success
                  }`}>
                    {totalPendingOperational} Pending
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/70 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Clock className="w-4 h-4 text-teal-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-neutral-900 block">
                          Pending TL
                        </span>
                        <span className="text-[10px] text-neutral-500 block">
                          Stage 1 Team Leader
                        </span>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-teal-600 shrink-0">
                      {stats.pendingTeamLeaderCount ?? 0}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/70 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-neutral-900 block">
                          Pending HR
                        </span>
                        <span className="text-[10px] text-neutral-500 block">
                          Stage 2 HR review
                        </span>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-amber-600 shrink-0">
                      {stats.pendingHrCount}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/70 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AlertCircle className="w-4 h-4 text-purple-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-neutral-900 block">
                          Pending Mgmt
                        </span>
                        <span className="text-[10px] text-neutral-500 block">
                          Stage 3 Final authority
                        </span>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-purple-600 shrink-0">
                      {stats.pendingMgmtCount}
                    </span>
                  </div>
                </div>

                {/* Approved & Rejected Totals */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div className={`p-3 rounded-xl flex items-center justify-between gap-2 ${SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.containerClass}`}>
                    <div>
                      <span className={`text-[10px] font-bold uppercase block ${SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.subtextClass}`}>
                        Approved
                      </span>
                      <span className={`text-lg font-bold ${SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.titleClass}`}>
                        {stats.approvedCount}
                      </span>
                    </div>
                    <CheckCircle className="w-4 h-4 text-sky-600 shrink-0" />
                  </div>

                  <div className={`p-3 rounded-xl flex items-center justify-between gap-2 ${SCHEDULE_CATEGORY_STYLES.REJECTED_LEAVE.containerClass}`}>
                    <div>
                      <span className={`text-[10px] font-bold uppercase block ${SCHEDULE_CATEGORY_STYLES.REJECTED_LEAVE.subtextClass}`}>
                        Rejected
                      </span>
                      <span className={`text-lg font-bold ${SCHEDULE_CATEGORY_STYLES.REJECTED_LEAVE.titleClass}`}>
                        {stats.rejectedCount}
                      </span>
                    </div>
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  </div>
                </div>
              </div>
            </section>

            {/* 4. Relevant Pending Items & On Leave Today Stacked Cards */}
            <section id="mobile-dashboard-pending-items" className="space-y-3 min-w-0">
              {((stats.pendingTeamLeaderCount ?? 0) > 0 ||
                stats.pendingHrCount > 0 ||
                stats.pendingMgmtCount > 0) && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 min-w-0">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-amber-900">
                        Pending Decisions Awaiting Action
                      </h4>
                      <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                        {stats.pendingTeamLeaderCount ?? 0} awaiting Team Leader,{' '}
                        {stats.pendingHrCount} awaiting HR, and {stats.pendingMgmtCount} awaiting
                        Management final decision.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* On Leave Today Stacked Mobile Cards (replaces wide desktop table on <768px) */}
              <div
                id="mobile-dashboard-on-leave-today"
                className={`${MT_COLOR_CARDS.sky} p-4 space-y-3 min-w-0`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>On Leave Today</span>
                  </h2>
                  <span className="text-[11px] font-medium text-neutral-500 shrink-0">
                    {stats.onLeaveTodayList.length} out today
                  </span>
                </div>

                {stats.onLeaveTodayList.length > 0 ? (
                  <div className="space-y-2">
                    {stats.onLeaveTodayList.map((row) => (
                      <div
                        key={row.id}
                        className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-1.5 min-w-0"
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="font-semibold text-xs text-neutral-900 truncate min-w-0">
                            <Employee360Link
                              employeeId={row.employeeId}
                              employeeCode={(row as any).employeeCode}
                              employeeName={row.employeeName || `EMP #${row.employeeId}`}
                            >
                              {row.employeeName || `EMP #${row.employeeId}`}
                            </Employee360Link>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${getLeaveTypeBadgeClasses(
                              row.leaveTypeName
                            )}`}
                          >
                            {row.leaveTypeName}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-600">
                          <span>
                            {formatDate(row.startDate)} to {formatDate(row.endDate)}
                          </span>
                          <span className="font-bold text-neutral-800 shrink-0">
                            {row.totalDays} day(s)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center bg-neutral-50 rounded-xl border border-neutral-200/60 text-xs text-neutral-500">
                    All scheduled staff are active. No employees on approved leave today.
                  </div>
                )}
              </div>
            </section>

            {/* 5. Recent Activity, Breakdowns & Upcoming Schedule */}
            <section id="mobile-dashboard-activity-section" className="space-y-3 min-w-0">
              {/* Upcoming Approved Leaves (Next 14 Days) */}
              <div className={`${MT_COLOR_CARDS.emerald} p-4 space-y-3 min-w-0`}>
                <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>Upcoming Approved Leaves (14d)</span>
                </h3>
                {stats.upcomingLeaves && stats.upcomingLeaves.length > 0 ? (
                  <div className="space-y-2">
                    {stats.upcomingLeaves.map((u) => (
                      <div
                        key={u.id}
                        className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/60 flex items-center justify-between gap-2 text-xs min-w-0"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-neutral-900 block truncate">
                            <Employee360Link
                              employeeId={(u as any).employeeId}
                              employeeCode={(u as any).employeeCode}
                              employeeName={u.employeeName}
                            >
                              {u.employeeName}
                            </Employee360Link>
                          </span>
                          <span className="text-[11px] text-neutral-500 block truncate mt-0.5">
                            {u.leaveTypeName} &bull; {formatDate(u.startDate)} to{' '}
                            {formatDate(u.endDate)}
                          </span>
                        </div>
                        <span className="font-bold text-neutral-800 shrink-0">
                          {u.totalDays} Days
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 py-4 text-center">
                    No upcoming leaves scheduled.
                  </p>
                )}
              </div>

              {/* Upcoming Calendar Holidays */}
              <div className={`${MT_COLOR_CARDS.amber} p-4 space-y-3 min-w-0`}>
                <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Upcoming Calendar Holidays</span>
                </h3>
                {stats.upcomingHolidays && stats.upcomingHolidays.length > 0 ? (
                  <div className="space-y-2">
                    {stats.upcomingHolidays.map((h) => {
                      const holidayStyle = getHolidayCategoryStyle(h.holidayType, h.departmentName);
                      return (
                        <div
                          key={h.id}
                          className={`p-3 rounded-xl flex items-center justify-between gap-2 text-xs min-w-0 ${holidayStyle.containerClass}`}
                        >
                          <div className="min-w-0">
                            <span className={`font-semibold block truncate ${holidayStyle.titleClass}`}>
                              {h.holidayName}
                            </span>
                            <span className={`text-[11px] ${holidayStyle.subtextClass}`}>
                              {formatDate(h.holidayDate)}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${holidayStyle.badgeClass}`}>
                            {h.departmentName && h.departmentName !== 'All Departments'
                              ? `🏢 ${h.departmentName}`
                              : h.holidayType || 'Holiday'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 py-4 text-center">
                    No upcoming holidays found.
                  </p>
                )}
              </div>

              {/* Leave Days by Department & Leave Type (Stacked) */}
              <div className={`${MT_COLOR_CARDS.indigo} p-4 space-y-3 min-w-0`}>
                <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                  <span>Leave Days by Department</span>
                </h3>
                {stats.leaveByDepartment && stats.leaveByDepartment.length > 0 ? (
                  <div className="space-y-2">
                    {stats.leaveByDepartment.map((dept) => (
                      <div
                        key={dept.department}
                        className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/60 flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-medium text-neutral-800 truncate">
                          {dept.department}
                        </span>
                        <span className="font-bold text-neutral-900 shrink-0">
                          {dept.count} days
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 py-4 text-center">
                    No departmental leave records yet.
                  </p>
                )}
              </div>

              <div className={`${MT_COLOR_CARDS.purple} p-4 space-y-3 min-w-0`}>
                <h3 className="text-xs font-bold text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                  <span>Leave Days by Leave Type</span>
                </h3>
                {stats.leaveByType && stats.leaveByType.length > 0 ? (
                  <div className="space-y-2">
                    {stats.leaveByType.map((t) => (
                      <div
                        key={t.name}
                        className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/60 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold truncate ${getLeaveTypeBadgeClasses(
                              t.name
                            )}`}
                          >
                            {t.name}
                          </span>
                          <span className="font-bold text-neutral-900 shrink-0">
                            {t.count} days
                          </span>
                        </div>
                        <div className={MT_THEME.chart.track}>
                          <div
                            className={`h-full rounded-full ${getLeaveTypeBarColor(t.name)} transition-all`}
                            style={{ width: `${Math.min(100, Math.max(8, t.count * 10))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 py-4 text-center">
                    No leave type metrics yet.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {/* =====================================================================
          DESKTOP DASHBOARD VIEW (>=768px PRESERVED UNCHANGED)
         ===================================================================== */}
      <div id="dashboard-desktop-view" className="hidden md:block space-y-6">
        {/* Top Banner / Welcome Bar */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 ${MT_COLOR_CARDS.slate}`}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-neutral-900">
              {isEmployee ? 'Employee Leave Hub' : 'Operational Leave & Attendance Dashboard'}
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-100 text-sky-900 border border-sky-300">
              {displayRole}
            </span>
          </div>
          <p className="text-xs text-neutral-600 mt-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-sky-600" />
            <span>Today: {todayStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            title="Refresh metrics"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-neutral-700 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-300 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          {isEmployee && onNavigate && (
            <button
              onClick={() => onNavigate('my-leave')}
              className="px-3.5 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 active:bg-red-900 cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <span>Apply Leave</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* EMPLOYEE VIEW */}
      {isEmployee && stats?.employeeContext && (
        <>
          {/* Employee Schedule & Notification Snapshot */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-5 ${MT_COLOR_CARDS.sky}`}>
              <span className="text-xs font-bold text-sky-900 uppercase tracking-wider block">
                Today's Roster & Duty
              </span>
              <div className="mt-3 flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${stats.employeeContext.todaySchedule.isWeeklyOff ? SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.badgeClass : SCHEDULE_CATEGORY_STYLES.WORKING_DAY.badgeClass}`}>
                  {stats.employeeContext.todaySchedule.isWeeklyOff ? (
                    <Coffee className="w-5 h-5" />
                  ) : (
                    <Sun className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">
                    {stats.employeeContext.todaySchedule.shiftCode} &bull; {stats.employeeContext.todaySchedule.shiftName}
                  </h3>
                  <p className="text-xs text-sky-900/80">
                    {stats.employeeContext.todaySchedule.timingSummary ||
                      (stats.employeeContext.todaySchedule.isWeeklyOff ? 'Official Weekly Off' : 'Scheduled Shift')}
                  </p>
                </div>
              </div>
            </div>

            <div className={`p-5 ${MT_COLOR_CARDS.amber}`}>
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider block">
                Pending Applications
              </span>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <span className="text-2xl font-bold text-amber-700">
                    {stats.employeeContext.pendingRequests.length}
                  </span>
                  <p className="text-xs text-amber-900/80 mt-0.5">Awaiting Team Leader / HR / Top Management review</p>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-100 text-amber-800 border border-amber-300">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className={`p-5 ${MT_COLOR_CARDS.emerald}`}>
              <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider block">
                Approved Leaves Taken
              </span>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <span className="text-2xl font-bold text-emerald-700">
                    {stats.employeeContext.approvedLeaves.length}
                  </span>
                  <p className="text-xs text-emerald-900/80 mt-0.5">Approved requests this cycle</p>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          {/* Personal Leave Balances */}
          <div className={`${MT_COLOR_CARDS.indigo} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-700" />
                <span>My Available Leave Balances</span>
              </h2>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('leave-balance')}
                  className="text-xs text-indigo-800 hover:text-indigo-950 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Detailed Ledger</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {stats.employeeContext.balances && stats.employeeContext.balances.length > 0 ? (
                stats.employeeContext.balances.map((b) => (
                  <div
                    key={b.id}
                    className={`p-3.5 ${getLeaveTypeCardClasses(b.leaveTypeCode || b.leaveTypeName)} transition-all`}
                  >
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-bold font-mono ${getLeaveTypeBadgeClasses(
                        b.leaveTypeCode || b.leaveTypeName
                      )}`}
                    >
                      {b.leaveTypeCode || `TYPE-${b.leaveTypeId}`}
                    </span>
                    <span className="text-[11px] text-neutral-700 font-semibold block truncate mt-1">
                      {b.leaveTypeName || 'Leave'}
                    </span>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-xl font-bold text-neutral-900">{b.available}</span>
                      <span className="text-[10px] text-neutral-700 font-medium">days avail</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-700 font-medium">
                      <span>Used: {b.used}</span>
                      <span>Alloc: {b.allocated}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-4 text-center text-xs text-neutral-600">
                  No balance records found.
                </div>
              )}
            </div>
          </div>

          {/* Employee Upcoming Leaves & Holidays */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`${MT_COLOR_CARDS.emerald} p-5`}>
              <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                <span>My Upcoming Approved Leaves</span>
              </h3>
              {stats.employeeContext.upcomingLeaves && stats.employeeContext.upcomingLeaves.length > 0 ? (
                <div className="space-y-2">
                  {stats.employeeContext.upcomingLeaves.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 rounded-lg bg-white/85 border border-emerald-200 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getLeaveTypeBadgeClasses(
                              req.leaveTypeName
                            )}`}
                          >
                            {req.leaveTypeName}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${MT_THEME.badge.approved}`}>
                            {req.totalDays} day(s)
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-600 mt-0.5">
                          {formatDate(req.startDate)} to {formatDate(req.endDate)}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-neutral-600">
                        {req.requestNumber}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-600 py-6 text-center">
                  No upcoming approved leaves scheduled.
                </p>
              )}
            </div>

            <div className={`${MT_COLOR_CARDS.teal} p-5`}>
              <h3 className="text-xs font-bold text-teal-950 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-teal-700" />
                <span>Upcoming Official Holidays</span>
              </h3>
              {stats.upcomingHolidays && stats.upcomingHolidays.length > 0 ? (
                <div className="space-y-2">
                  {stats.upcomingHolidays.map((h) => {
                    const holidayStyle = getHolidayCategoryStyle(h.holidayType, h.departmentName);
                    return (
                      <div
                        key={h.id}
                        className={`p-3 rounded-lg flex items-center justify-between ${holidayStyle.containerClass}`}
                      >
                        <div>
                          <span className={`font-semibold text-xs block ${holidayStyle.titleClass}`}>
                            {h.holidayName}
                          </span>
                          <span className={`text-[11px] ${holidayStyle.subtextClass}`}>{formatDate(h.holidayDate)}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${holidayStyle.badgeClass}`}>
                          {h.departmentName && h.departmentName !== 'All Departments' ? `🏢 ${h.departmentName}` : (h.holidayType || 'Public')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-neutral-600 py-6 text-center">
                  No upcoming holidays in the immediate schedule.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {isEmployee && stats?.employeeContext && (
        <section id="employee-complete-leave-history" className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Complete Leave Application History</h2>
              <p className="text-xs text-neutral-500 mt-1">All submitted requests for {displayUserName}, including pending, approved, rejected and cancelled applications.</p>
            </div>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
              {stats.employeeContext.requestHistory.length} request(s)
            </span>
          </div>
          {stats.employeeContext.requestHistory.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-700">
                  <tr>
                    <th className="px-3 py-2.5">Request No.</th>
                    <th className="px-3 py-2.5">Leave Type</th>
                    <th className="px-3 py-2.5">Dates</th>
                    <th className="px-3 py-2.5">Duration</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Approval Details / Remarks</th>
                    <th className="px-3 py-2.5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {stats.employeeContext.requestHistory.map((request) => {
                    const status = String(request.finalStatus || request.status || 'PENDING').toUpperCase();
                    const statusClass = status === 'APPROVED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : status === 'REJECTED'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : status === 'CANCELLED'
                          ? 'bg-neutral-100 text-neutral-700 border-neutral-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200';
                    const approvalDetails = [
                      request.teamLeaderDecision && `Reporting Person: ${request.teamLeaderDecision}${request.teamLeaderRemarks ? ` — ${request.teamLeaderRemarks}` : ''}`,
                      request.hrDecision && `HR: ${request.hrDecision}${request.hrRemarks ? ` — ${request.hrRemarks}` : ''}`,
                      request.managementDecision && `Top Management: ${request.managementDecision}${request.managementRemarks ? ` — ${request.managementRemarks}` : ''}`,
                    ].filter(Boolean);
                    return (
                      <tr key={request.id} className="align-top hover:bg-neutral-50/70">
                        <td className="px-3 py-3 font-mono font-semibold text-neutral-800">{request.requestNumber || `#${request.id}`}</td>
                        <td className="px-3 py-3 text-neutral-800">{request.leaveTypeName}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-neutral-700">{formatDate(request.startDate)} – {formatDate(request.endDate)}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-neutral-700">{request.totalDays} Days{request.dayType ? ` • ${request.dayType.replace(/_/g, ' ')}` : ''}</td>
                        <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass}`}>{status}</span></td>
                        <td className="px-3 py-3 min-w-[210px] text-neutral-600">
                          {approvalDetails.length ? <ul className="space-y-1">{approvalDetails.map((detail, index) => <li key={index}>{detail}</li>)}</ul> : <span className="text-neutral-400">No decision remarks recorded</span>}
                        </td>
                        <td className="px-3 py-3 min-w-[180px] text-neutral-600">{request.reason || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg bg-neutral-50 px-4 py-6 text-center text-xs text-neutral-500">No leave applications have been submitted by this employee.</p>
          )}
        </section>
      )}

      {/* ADMIN / HR / TOP MANAGEMENT VIEW */}
      {!isEmployee && stats && (
        <>
          {/* Key Metrics KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className={`p-4 ${MT_COLOR_CARDS.slate}`}>
              <div className="flex items-center justify-between text-slate-700">
                <span className="text-[11px] font-bold uppercase">Total Staff</span>
                <Users className="w-4 h-4 text-slate-600" />
              </div>
              <p className="text-2xl font-bold text-neutral-900 mt-2">{stats.totalEmployees}</p>
              <span className="text-[10px] text-slate-600 font-medium">Registered employees</span>
            </div>

            <div className={`p-4 ${MT_COLOR_CARDS.sky}`}>
              <div className="flex items-center justify-between text-sky-900">
                <span className="text-[11px] font-bold uppercase">On Leave Today</span>
                <Coffee className="w-4 h-4 text-sky-600" />
              </div>
              <p className="text-2xl font-bold text-sky-700 mt-2">{stats.onLeaveTodayCount}</p>
              <span className="text-[10px] text-sky-800 font-medium">Absent on approved leave</span>
            </div>

            <div className={`p-4 ${MT_COLOR_CARDS.teal}`}>
              <div className="flex items-center justify-between text-teal-900">
                <span className="text-[11px] font-bold uppercase">Pending TL</span>
                <Clock className="w-4 h-4 text-teal-600" />
              </div>
              <p className="text-2xl font-bold text-teal-700 mt-2">{stats.pendingTeamLeaderCount ?? 0}</p>
              <span className="text-[10px] text-teal-800 font-medium">Stage 1 Team Leader</span>
            </div>

            <div className={`p-4 ${MT_COLOR_CARDS.amber}`}>
              <div className="flex items-center justify-between text-amber-900">
                <span className="text-[11px] font-bold uppercase">Pending HR</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl font-bold text-amber-700 mt-2">{stats.pendingHrCount}</p>
              <span className="text-[10px] text-amber-800 font-medium">Stage 2 HR review</span>
            </div>

            <div className={`p-4 ${MT_COLOR_CARDS.purple}`}>
              <div className="flex items-center justify-between text-purple-900">
                <span className="text-[11px] font-bold uppercase">Pending Mgmt</span>
                <AlertCircle className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-purple-700 mt-2">{stats.pendingMgmtCount}</p>
              <span className="text-[10px] text-purple-800 font-medium">Stage 3 Final authority</span>
            </div>

            <div className={`p-4 ${MT_COLOR_CARDS.emerald}`}>
              <div className="flex items-center justify-between text-emerald-900">
                <span className="text-[11px] font-bold uppercase">Approved</span>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-emerald-700 mt-2">{stats.approvedCount}</p>
              <span className="text-[10px] text-emerald-800 font-medium">Total approved leaves</span>
            </div>

            <div className={`p-4 ${MT_COLOR_CARDS.rose}`}>
              <div className="flex items-center justify-between text-rose-900">
                <span className="text-[11px] font-bold uppercase">Rejected</span>
                <XCircle className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-2xl font-bold text-rose-700 mt-2">{stats.rejectedCount}</p>
              <span className="text-[10px] text-rose-800 font-medium">Rejected applications</span>
            </div>
          </div>

          {/* Pending Actions Quick Banner */}
          {((stats.pendingTeamLeaderCount ?? 0) > 0 || stats.pendingHrCount > 0 || stats.pendingMgmtCount > 0) && (
            <div className={`p-4 ${MT_COLOR_CARDS.amber} flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <div>
                  <h4 className="text-xs font-bold text-amber-900">
                    Pending Decisions Awaiting Action
                  </h4>
                  <p className="text-[11px] text-amber-800">
                    There are {stats.pendingTeamLeaderCount ?? 0} requests awaiting Team Leader review, {stats.pendingHrCount} awaiting HR review, and {stats.pendingMgmtCount} awaiting Management final decision.
                  </p>
                </div>
              </div>
              {onNavigate && (
                <div className="flex items-center gap-2">
                  {(stats.pendingTeamLeaderCount ?? 0) > 0 && canAccessModule('team-leader', activeRole) && (
                    <button
                      onClick={() => onNavigate('team-leader')}
                      className="px-3 py-1 bg-teal-700 text-white rounded text-xs font-semibold hover:bg-teal-800 cursor-pointer"
                    >
                      Open Team Leader Desk
                    </button>
                  )}
                  {stats.pendingHrCount > 0 && canAccessModule('hr', activeRole) && (
                    <button
                      onClick={() => onNavigate('hr')}
                      className="px-3 py-1 bg-purple-700 text-white rounded text-xs font-semibold hover:bg-purple-800 cursor-pointer"
                    >
                      Open HR Desk
                    </button>
                  )}
                  {stats.pendingMgmtCount > 0 && canAccessModule('management', activeRole) && (
                    <button
                      onClick={() => onNavigate('management')}
                      className="px-3 py-1 bg-slate-800 text-white rounded text-xs font-semibold hover:bg-slate-900 cursor-pointer"
                    >
                      Open Management Desk
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* On Leave Today Snapshot Table */}
          <div className={`${MT_COLOR_CARDS.sky} p-6`}>
            <h2 className="text-sm font-bold text-sky-950 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-700" />
                <span>On Leave Today &bull; Attendance Snapshot</span>
              </span>
              <span className="text-xs font-semibold text-sky-800">
                {stats.onLeaveTodayList.length} employee(s) out today
              </span>
            </h2>
            {stats.onLeaveTodayList.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-sky-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-sky-100/70 text-sky-950 font-bold border-b border-sky-200">
                    <tr>
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Leave Type</th>
                      <th className="px-3 py-2">Start Date</th>
                      <th className="px-3 py-2">End Date</th>
                      <th className="px-3 py-2">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-100">
                    {stats.onLeaveTodayList.map((row) => (
                      <tr key={row.id} className="hover:bg-sky-50/60">
                        <td className="px-3 py-2 font-medium text-neutral-900">
                          <Employee360Link
                            employeeId={row.employeeId}
                            employeeCode={(row as any).employeeCode}
                            employeeName={row.employeeName || `EMP #${row.employeeId}`}
                          >
                            {row.employeeName || `EMP #${row.employeeId}`}
                          </Employee360Link>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 rounded font-medium ${getLeaveTypeBadgeClasses(
                              row.leaveTypeName
                            )}`}
                          >
                            {row.leaveTypeName}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-neutral-600">{formatDate(row.startDate)}</td>
                        <td className="px-3 py-2 text-neutral-600">{formatDate(row.endDate)}</td>
                        <td className="px-3 py-2 font-semibold text-neutral-800">
                          {row.totalDays} day(s)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center bg-white/80 rounded-lg border border-sky-200 text-xs text-sky-900">
                All scheduled staff are active. No employees on approved leave today.
              </div>
            )}
          </div>

          {/* Department Breakdown & Type Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`${MT_COLOR_CARDS.indigo} p-5`}>
              <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-indigo-700" />
                <span>Leave Days by Department</span>
              </h3>
              {stats.leaveByDepartment && stats.leaveByDepartment.length > 0 ? (
                <div className="space-y-2">
                  {stats.leaveByDepartment.map((dept) => (
                    <div
                      key={dept.department}
                      className="p-2.5 rounded-lg bg-white/85 border border-indigo-200 flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold text-neutral-900">{dept.department}</span>
                      <span className="font-bold text-indigo-900">{dept.count} days</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-600 py-6 text-center">No departmental leave records yet.</p>
              )}
            </div>

            <div className={`${MT_COLOR_CARDS.purple} p-5`}>
              <h3 className="text-xs font-bold text-purple-950 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-purple-700" />
                <span>Leave Days by Leave Type</span>
              </h3>
              {stats.leaveByType && stats.leaveByType.length > 0 ? (
                <div className="space-y-2">
                  {stats.leaveByType.map((t) => (
                    <div
                      key={t.name}
                      className="p-2.5 rounded-lg bg-white/85 border border-purple-200 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getLeaveTypeBadgeClasses(
                            t.name
                          )}`}
                        >
                          {t.name}
                        </span>
                        <span className="font-bold text-neutral-900">{t.count} days</span>
                      </div>
                      <div className={MT_THEME.chart.track}>
                        <div
                          className={`h-full rounded-full ${getLeaveTypeBarColor(t.name)} transition-all`}
                          style={{ width: `${Math.min(100, Math.max(8, t.count * 10))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-600 py-6 text-center">No leave type metrics yet.</p>
              )}
            </div>
          </div>

          {/* Upcoming Leaves & Upcoming Holidays */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className={`${MT_COLOR_CARDS.emerald} p-5`}>
                <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Upcoming Approved Leaves (Next 14 Days)</span>
                </h3>
                {stats.upcomingLeaves && stats.upcomingLeaves.length > 0 ? (
                  <div className="space-y-2">
                    {stats.upcomingLeaves.map((u) => (
                      <div
                        key={u.id}
                        className={`p-2.5 rounded-lg flex items-center justify-between text-xs ${SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.containerClass}`}
                      >
                        <div>
                          <span className={`font-semibold block ${SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.titleClass}`}>
                            <Employee360Link
                              employeeId={(u as any).employeeId}
                              employeeCode={(u as any).employeeCode}
                              employeeName={u.employeeName}
                            >
                              {u.employeeName}
                            </Employee360Link>
                          </span>
                          <span className={`text-[11px] ${SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.subtextClass}`}>
                            {u.leaveTypeName} &bull; {formatDate(u.startDate)} to {formatDate(u.endDate)}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded font-bold ${SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.badgeClass}`}>
                          {u.totalDays} Days
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-600 py-6 text-center">No upcoming leaves scheduled.</p>
                )}
              </div>

              <div className={`${MT_COLOR_CARDS.amber} p-5`}>
                <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-amber-700" />
                  <span>Upcoming Calendar Holidays</span>
                </h3>
                {stats.upcomingHolidays && stats.upcomingHolidays.length > 0 ? (
                  <div className="space-y-2">
                    {stats.upcomingHolidays.map((h) => {
                      const holidayStyle = getHolidayCategoryStyle(h.holidayType, h.departmentName);
                      return (
                        <div
                          key={h.id}
                          className={`p-2.5 rounded-lg flex items-center justify-between text-xs ${holidayStyle.containerClass}`}
                        >
                          <div>
                            <span className={`font-semibold block ${holidayStyle.titleClass}`}>{h.holidayName}</span>
                            <span className={`text-[11px] ${holidayStyle.subtextClass}`}>{formatDate(h.holidayDate)}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${holidayStyle.badgeClass}`}>
                            {h.departmentName && h.departmentName !== 'All Departments' ? `🏢 ${h.departmentName}` : (h.holidayType || 'Holiday')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 py-6 text-center">No upcoming holidays found.</p>
                )}
              </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
