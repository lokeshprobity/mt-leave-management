import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  Moon,
  Sun,
  Coffee,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Info,
  CalendarDays,
  Sparkles,
  Building2,
  XCircle,
  Ban,
  Hourglass,
  SplitSquareHorizontal,
  ChevronLeft,
  ChevronRight,
  Palmtree,
} from 'lucide-react';
import { apiFetch, getActiveEmployeeId, getActiveRole } from '../lib/api.ts';
import { formatDate } from '../utils/dateFormat.ts';
import {
  ResolvedDailySchedule,
  EmployeeShiftAssignmentDto,
  LeaveRequestDto,
  HolidayDto,
  FinalLeaveStatus,
} from '../types/leave.ts';
import {
  SCHEDULE_CATEGORY_STYLES,
  SCHEDULE_LEGEND_ITEMS,
  ScheduleVisualCategory,
  ScheduleCategoryStyle,
} from '../utils/theme.ts';

export { SCHEDULE_CATEGORY_STYLES, SCHEDULE_LEGEND_ITEMS };
export type { ScheduleVisualCategory, ScheduleCategoryStyle };

export interface ScheduleConditionBadge {
  category: ScheduleVisualCategory;
  shortLabel: string;
  label: string;
  badgeClass: string;
  leaveStatus?: FinalLeaveStatus;
  isHalfDay?: boolean;
}

export interface HalfDaySplitInfo {
  firstHalfLabel: string;
  secondHalfLabel: string;
  firstHalfCategory: ScheduleVisualCategory;
  secondHalfCategory: ScheduleVisualCategory;
  firstHalfClass: string;
  secondHalfClass: string;
  halfDayPeriod: 'FIRST_HALF' | 'SECOND_HALF';
  leaveStatus?: FinalLeaveStatus;
}

export interface ResolvedScheduleVisualState {
  date: string;
  primaryCategory: ScheduleVisualCategory;
  primaryLabel: string;
  shortCode: string;
  containerClass: string;
  dayBadgeClass: string;
  primaryBadgeClass: string;
  subtextClass: string;
  hoursBadgeClass: string;
  hoursDisplay: string;
  summaryText: string;
  conditions: ScheduleConditionBadge[];
  hasMultipleConditions: boolean;
  isHalfDayLeave: boolean;
  isDepartmentHoliday: boolean;
  holidayDepartmentName: string | null;
  halfDaySplit: HalfDaySplitInfo | null;
  matchingLeaves: LeaveRequestDto[];
}

/**
 * Pure helper that resolves the visual category, distinct background classes,
 * multi-condition badges, department-specific holiday labels, and half-day split info
 * for a given daily schedule and employee leave/holiday records.
 */
export function resolveDailyScheduleVisualState(
  schedule: ResolvedDailySchedule,
  leaveRequests: LeaveRequestDto[] = [],
  employeeHolidays: HolidayDto[] = []
): ResolvedScheduleVisualState {
  const matchingHoliday = (employeeHolidays || []).find(
    (h) => h.holidayDate === schedule.date && h.isActive !== false && !h.isOptional
  );

  const isHoliday = Boolean(schedule.isHoliday || matchingHoliday);
  const holidayName = schedule.holidayName || matchingHoliday?.holidayName || 'Declared Holiday';
  const isHalfDayHoliday = Boolean(schedule.isHalfDayHoliday ?? matchingHoliday?.isHalfDay);

  const isDepartmentHoliday = Boolean(
    isHoliday &&
      (schedule.isDepartmentHoliday ||
        (schedule.holidayDepartmentId !== null && schedule.holidayDepartmentId !== undefined) ||
        (matchingHoliday &&
          ((matchingHoliday.departmentId !== null && matchingHoliday.departmentId !== undefined) ||
            (matchingHoliday.holidayListId !== null &&
              matchingHoliday.holidayListId !== undefined &&
              matchingHoliday.holidayListId !== 1))))
  );

  const holidayDepartmentName =
    schedule.holidayDepartmentName ||
    (matchingHoliday?.departmentName && matchingHoliday.departmentName !== 'All Departments'
      ? matchingHoliday.departmentName
      : null);

  const matchingLeaves = (leaveRequests || []).filter(
    (req) => req.startDate <= schedule.date && schedule.date <= req.endDate
  );

  const conditions: ScheduleConditionBadge[] = [];

  // 1. Holiday condition
  if (isHoliday) {
    if (isDepartmentHoliday) {
      const deptSuffix = holidayDepartmentName ? ` (${holidayDepartmentName})` : '';
      const halfSuffix = isHalfDayHoliday ? ' [Half-Day]' : '';
      conditions.push({
        category: 'DEPARTMENT_HOLIDAY',
        shortLabel: 'Department Holiday',
        label: `Department Holiday: ${holidayName}${deptSuffix}${halfSuffix}`,
        badgeClass: SCHEDULE_CATEGORY_STYLES.DEPARTMENT_HOLIDAY.badgeClass,
        isHalfDay: isHalfDayHoliday,
      });
    } else {
      const halfSuffix = isHalfDayHoliday ? ' [Half-Day]' : '';
      conditions.push({
        category: 'PUBLIC_HOLIDAY',
        shortLabel: 'Public Holiday',
        label: `Public Holiday: ${holidayName}${halfSuffix}`,
        badgeClass: SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY.badgeClass,
        isHalfDay: isHalfDayHoliday,
      });
    }
  }

  // 2. Weekly Off condition
  if (schedule.isWeeklyOff) {
    conditions.push({
      category: 'WEEKLY_OFF',
      shortLabel: 'Weekly Off',
      label: 'Weekly Off',
      badgeClass: SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.badgeClass,
    });
  }

  // 3. All Leave Request conditions covering this date (preserved in full so nothing is hidden)
  for (const req of matchingLeaves) {
    const status = String(req.finalStatus || req.status || 'PENDING').toUpperCase() as FinalLeaveStatus;
    const isHalfDay = req.dayType === 'HALF_DAY' || Number(req.totalDays) === 0.5;
    const periodLabel =
      req.halfDayPeriod === 'SECOND_HALF'
        ? 'Second Half'
        : req.halfDayPeriod === 'FIRST_HALF'
        ? 'First Half'
        : 'Half-Day';
    const leaveTypeLabel = req.leaveTypeCode || req.leaveTypeName || 'Leave';

    if (status === 'APPROVED') {
      if (isHalfDay) {
        conditions.push({
          category: 'HALF_DAY_LEAVE',
          shortLabel: 'Half-Day Leave',
          label: `Half-Day Leave (${periodLabel} · ${leaveTypeLabel} · Approved)`,
          badgeClass: SCHEDULE_CATEGORY_STYLES.HALF_DAY_LEAVE.badgeClass,
          leaveStatus: 'APPROVED',
          isHalfDay: true,
        });
        conditions.push({
          category: 'APPROVED_LEAVE',
          shortLabel: 'Approved Leave',
          label: `Approved Leave (${leaveTypeLabel} · 0.5d)`,
          badgeClass: SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.badgeClass,
          leaveStatus: 'APPROVED',
          isHalfDay: true,
        });
      } else {
        conditions.push({
          category: 'APPROVED_LEAVE',
          shortLabel: 'Approved Leave',
          label: `Approved Leave (${leaveTypeLabel})`,
          badgeClass: SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.badgeClass,
          leaveStatus: 'APPROVED',
          isHalfDay: false,
        });
      }
    } else if (status === 'PENDING') {
      if (isHalfDay) {
        conditions.push({
          category: 'HALF_DAY_LEAVE',
          shortLabel: 'Half-Day Leave',
          label: `Half-Day Leave (${periodLabel} · ${leaveTypeLabel} · Pending)`,
          badgeClass: SCHEDULE_CATEGORY_STYLES.HALF_DAY_LEAVE.badgeClass,
          leaveStatus: 'PENDING',
          isHalfDay: true,
        });
        conditions.push({
          category: 'PENDING_LEAVE',
          shortLabel: 'Pending Leave',
          label: `Pending Leave (${leaveTypeLabel} · 0.5d)`,
          badgeClass: SCHEDULE_CATEGORY_STYLES.PENDING_LEAVE.badgeClass,
          leaveStatus: 'PENDING',
          isHalfDay: true,
        });
      } else {
        conditions.push({
          category: 'PENDING_LEAVE',
          shortLabel: 'Pending Leave',
          label: `Pending Leave (${leaveTypeLabel})`,
          badgeClass: SCHEDULE_CATEGORY_STYLES.PENDING_LEAVE.badgeClass,
          leaveStatus: 'PENDING',
          isHalfDay: false,
        });
      }
    } else if (status === 'REJECTED') {
      conditions.push({
        category: 'REJECTED_LEAVE',
        shortLabel: 'Rejected Leave',
        label: isHalfDay
          ? `Rejected Leave (${leaveTypeLabel} · ${periodLabel})`
          : `Rejected Leave (${leaveTypeLabel})`,
        badgeClass: SCHEDULE_CATEGORY_STYLES.REJECTED_LEAVE.badgeClass,
        leaveStatus: 'REJECTED',
        isHalfDay,
      });
    } else if (status === 'CANCELLED') {
      conditions.push({
        category: 'CANCELLED_LEAVE',
        shortLabel: 'Cancelled Leave',
        label: isHalfDay
          ? `Cancelled Leave (${leaveTypeLabel} · ${periodLabel})`
          : `Cancelled Leave (${leaveTypeLabel})`,
        badgeClass: SCHEDULE_CATEGORY_STYLES.CANCELLED_LEAVE.badgeClass,
        leaveStatus: 'CANCELLED',
        isHalfDay,
      });
    }
  }

  // 4. Working Shift condition
  if (schedule.isWorkingDay || (schedule.segments && schedule.segments.length > 0)) {
    const windowStr =
      schedule.earliestStartTime && schedule.latestEndTime
        ? ` (${schedule.earliestStartTime}–${schedule.latestEndTime})`
        : '';
    conditions.push({
      category: 'WORKING_DAY',
      shortLabel: 'Working Day / Shift',
      label: `Shift: ${schedule.shiftName || 'Scheduled Shift'}${windowStr}`,
      badgeClass: SCHEDULE_CATEGORY_STYLES.WORKING_DAY.badgeClass,
    });
  }

  // Identify leave categories for primary visual styling
  const approvedHalfDay = matchingLeaves.find(
    (r) =>
      String(r.finalStatus || r.status).toUpperCase() === 'APPROVED' &&
      (r.dayType === 'HALF_DAY' || Number(r.totalDays) === 0.5)
  );
  const approvedFullDay = matchingLeaves.find(
    (r) =>
      String(r.finalStatus || r.status).toUpperCase() === 'APPROVED' &&
      r.dayType !== 'HALF_DAY' &&
      Number(r.totalDays) !== 0.5
  );
  const pendingHalfDay = matchingLeaves.find(
    (r) =>
      String(r.finalStatus || r.status || 'PENDING').toUpperCase() === 'PENDING' &&
      (r.dayType === 'HALF_DAY' || Number(r.totalDays) === 0.5)
  );
  const pendingFullDay = matchingLeaves.find(
    (r) =>
      String(r.finalStatus || r.status || 'PENDING').toUpperCase() === 'PENDING' &&
      r.dayType !== 'HALF_DAY' &&
      Number(r.totalDays) !== 0.5
  );
  const rejectedLeave = matchingLeaves.find(
    (r) => String(r.finalStatus || r.status).toUpperCase() === 'REJECTED'
  );
  const cancelledLeave = matchingLeaves.find(
    (r) => String(r.finalStatus || r.status).toUpperCase() === 'CANCELLED'
  );

  let primaryCategory: ScheduleVisualCategory = 'WORKING_DAY';

  if (isHoliday && !isHalfDayHoliday) {
    primaryCategory = isDepartmentHoliday ? 'DEPARTMENT_HOLIDAY' : 'PUBLIC_HOLIDAY';
  } else if (schedule.isWeeklyOff) {
    primaryCategory = 'WEEKLY_OFF';
  } else if (approvedHalfDay) {
    primaryCategory = 'HALF_DAY_LEAVE';
  } else if (approvedFullDay) {
    primaryCategory = 'APPROVED_LEAVE';
  } else if (pendingHalfDay) {
    primaryCategory = 'HALF_DAY_LEAVE';
  } else if (pendingFullDay) {
    primaryCategory = 'PENDING_LEAVE';
  } else if (isHoliday && isHalfDayHoliday) {
    primaryCategory = isDepartmentHoliday ? 'DEPARTMENT_HOLIDAY' : 'PUBLIC_HOLIDAY';
  } else if (rejectedLeave) {
    primaryCategory = 'REJECTED_LEAVE';
  } else if (cancelledLeave) {
    primaryCategory = 'CANCELLED_LEAVE';
  } else {
    primaryCategory = 'WORKING_DAY';
  }

  // Construct Half-Day Split Indicator when a half-day leave or half-day holiday applies on a working day
  let halfDaySplit: HalfDaySplitInfo | null = null;
  const activeHalfDayLeave = approvedHalfDay || pendingHalfDay;
  if (activeHalfDayLeave) {
    const leaveStatus = String(
      activeHalfDayLeave.finalStatus || activeHalfDayLeave.status || 'PENDING'
    ).toUpperCase() as FinalLeaveStatus;
    const period: 'FIRST_HALF' | 'SECOND_HALF' =
      activeHalfDayLeave.halfDayPeriod === 'SECOND_HALF' ? 'SECOND_HALF' : 'FIRST_HALF';
    const typeLabel = activeHalfDayLeave.leaveTypeCode || activeHalfDayLeave.leaveTypeName || 'Leave';
    const shiftText = `Working Shift (${schedule.shiftName || 'Scheduled Shift'})`;
    const leaveText = `Half-Day Leave (${typeLabel} · ${leaveStatus})`;

    if (period === 'FIRST_HALF') {
      halfDaySplit = {
        firstHalfLabel: `1st Half: ${leaveText}`,
        secondHalfLabel: `2nd Half: ${shiftText}`,
        firstHalfCategory: 'HALF_DAY_LEAVE',
        secondHalfCategory: 'WORKING_DAY',
        firstHalfClass: 'bg-teal-100 text-teal-900 border-teal-300',
        secondHalfClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        halfDayPeriod: 'FIRST_HALF',
        leaveStatus,
      };
    } else {
      halfDaySplit = {
        firstHalfLabel: `1st Half: ${shiftText}`,
        secondHalfLabel: `2nd Half: ${leaveText}`,
        firstHalfCategory: 'WORKING_DAY',
        secondHalfCategory: 'HALF_DAY_LEAVE',
        firstHalfClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        secondHalfClass: 'bg-teal-100 text-teal-900 border-teal-300',
        halfDayPeriod: 'SECOND_HALF',
        leaveStatus,
      };
    }
  } else if (isHoliday && isHalfDayHoliday && schedule.isWorkingDay) {
    const holCat: ScheduleVisualCategory = isDepartmentHoliday ? 'DEPARTMENT_HOLIDAY' : 'PUBLIC_HOLIDAY';
    halfDaySplit = {
      firstHalfLabel: `1st Half: Working Shift (${schedule.shiftName || 'Shift'})`,
      secondHalfLabel: `2nd Half: Half-Day Holiday (${holidayName})`,
      firstHalfCategory: 'WORKING_DAY',
      secondHalfCategory: holCat,
      firstHalfClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      secondHalfClass: isDepartmentHoliday
        ? 'bg-purple-100 text-purple-900 border-purple-300'
        : 'bg-amber-100 text-amber-900 border-amber-300',
      halfDayPeriod: 'SECOND_HALF',
    };
  }

  const style = SCHEDULE_CATEGORY_STYLES[primaryCategory];

  // Determine hoursDisplay without altering schedule.totalScheduledHours calculation
  const effectiveDailyHours = schedule.totalWorkingHours ?? schedule.totalScheduledHours;
  let hoursDisplay = schedule.isWorkingDay ? `${effectiveDailyHours} hrs/day` : 'OFF';
  if (primaryCategory === 'WEEKLY_OFF') {
    hoursDisplay = 'WEEKLY OFF';
  } else if (primaryCategory === 'PUBLIC_HOLIDAY' || primaryCategory === 'DEPARTMENT_HOLIDAY') {
    hoursDisplay = isHalfDayHoliday ? `${effectiveDailyHours} hrs (0.5d Hol)` : 'HOLIDAY';
  } else if (primaryCategory === 'APPROVED_LEAVE') {
    hoursDisplay = 'ON LEAVE';
  } else if (primaryCategory === 'HALF_DAY_LEAVE') {
    hoursDisplay = `0.5d LEAVE · ${effectiveDailyHours}h Shift`;
  }

  let summaryText = schedule.shiftName || 'Scheduled Work Day';
  if (isHoliday && !isHalfDayHoliday) {
    summaryText = `${isDepartmentHoliday ? 'Department Holiday' : 'Public Holiday'}: ${holidayName}${
      holidayDepartmentName ? ` (${holidayDepartmentName})` : ''
    }`;
  } else if (schedule.isWeeklyOff) {
    summaryText = schedule.shiftName ? `Weekly Off (${schedule.shiftName})` : 'Weekly Off';
  }

  return {
    date: schedule.date,
    primaryCategory,
    primaryLabel: style.label,
    shortCode: style.shortCode,
    containerClass: style.containerClass,
    dayBadgeClass: style.dayBadgeClass,
    primaryBadgeClass: style.badgeClass,
    subtextClass: style.subtextClass,
    hoursBadgeClass: style.hoursBadgeClass,
    hoursDisplay,
    summaryText,
    conditions,
    hasMultipleConditions: conditions.length > 1,
    isHalfDayLeave: Boolean(activeHalfDayLeave),
    isDepartmentHoliday,
    holidayDepartmentName,
    halfDaySplit,
    matchingLeaves,
  };
}

function renderCategoryIcon(category: ScheduleVisualCategory, className = 'w-3.5 h-3.5 shrink-0') {
  switch (category) {
    case 'WORKING_DAY':
      return <CheckCircle2 className={className} />;
    case 'WEEKLY_OFF':
      return <Coffee className={className} />;
    case 'PUBLIC_HOLIDAY':
      return <Sparkles className={className} />;
    case 'DEPARTMENT_HOLIDAY':
      return <Building2 className={className} />;
    case 'APPROVED_LEAVE':
      return <Palmtree className={className} />;
    case 'PENDING_LEAVE':
      return <Hourglass className={className} />;
    case 'REJECTED_LEAVE':
      return <XCircle className={className} />;
    case 'CANCELLED_LEAVE':
      return <Ban className={className} />;
    case 'HALF_DAY_LEAVE':
      return <SplitSquareHorizontal className={className} />;
    default:
      return <Calendar className={className} />;
  }
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().split('T')[0];
}

export function MySchedule({ targetEmployeeId }: { targetEmployeeId?: number } = {}) {
  const employeeId = targetEmployeeId ?? getActiveEmployeeId();
  const activeRole = getActiveRole();

  const todayStr = new Date().toISOString().split('T')[0];
  const [rangeStartDate, setRangeStartDate] = useState<string>(todayStr);
  const [conditionFilter, setConditionFilter] = useState<'ALL' | ScheduleVisualCategory>('ALL');
  const [isMobileLegendOpen, setIsMobileLegendOpen] = useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todaySchedule, setTodaySchedule] = useState<ResolvedDailySchedule | null>(null);
  const [upcomingSchedules, setUpcomingSchedules] = useState<ResolvedDailySchedule[]>([]);
  const [assignments, setAssignments] = useState<EmployeeShiftAssignmentDto[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestDto[]>([]);
  const [employeeHolidays, setEmployeeHolidays] = useState<HolidayDto[]>([]);

  // Selected date inspector
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedSchedule, setSelectedSchedule] = useState<ResolvedDailySchedule | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const fetchScheduleData = async (startOverride?: string) => {
    const startToUse = startOverride || rangeStartDate || todayStr;
    setLoading(true);
    setError(null);
    try {
      const endDateStr = addDaysToDateStr(startToUse, 13);

      const [todayRes, rangeRes, assignRes, leavesRes, holidaysRes] = await Promise.all([
        apiFetch(`/api/employees/${employeeId}/schedule?date=${todayStr}`),
        apiFetch(
          `/api/employees/${employeeId}/schedule-range?startDate=${startToUse}&endDate=${endDateStr}`
        ),
        apiFetch(`/api/employees/${employeeId}/shifts`),
        apiFetch(`/api/leave-requests/my?employeeId=${employeeId}`),
        apiFetch(`/api/holidays?employeeId=${employeeId}`),
      ]);

      if (todayRes.ok) {
        const todayData = await todayRes.json();
        if (todayData.schedule) {
          setTodaySchedule(todayData.schedule);
          if (!selectedSchedule || selectedDate === todayStr) {
            setSelectedSchedule(todayData.schedule);
          }
        }
      }

      if (rangeRes.ok) {
        const rangeData = await rangeRes.json();
        if (rangeData.schedules) {
          setUpcomingSchedules(rangeData.schedules);
        }
      }

      if (assignRes.ok) {
        const assignData = await assignRes.json();
        if (assignData.assignments) {
          setAssignments(assignData.assignments);
        }
      }

      if (leavesRes.ok) {
        const leavesData = await leavesRes.json();
        if (Array.isArray(leavesData.leaveRequests)) {
          setLeaveRequests(leavesData.leaveRequests);
        }
      }

      if (holidaysRes.ok) {
        const holidaysData = await holidaysRes.json();
        if (Array.isArray(holidaysData.holidays)) {
          setEmployeeHolidays(holidaysData.holidays);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load employee schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduleData(rangeStartDate);
  }, [employeeId, activeRole, rangeStartDate]);

  const handleDateChange = async (dateStr: string) => {
    setSelectedDate(dateStr);
    setInspecting(true);
    try {
      const res = await apiFetch(`/api/employees/${employeeId}/schedule?date=${dateStr}`);
      const data = await res.json();
      if (res.ok && data.schedule) {
        setSelectedSchedule(data.schedule);
      }
    } catch (err: any) {
      console.warn('Failed to inspect date schedule:', err);
    } finally {
      setInspecting(false);
    }
  };

  const handleShiftRange = (deltaDays: number) => {
    const nextStart = addDaysToDateStr(rangeStartDate, deltaDays);
    setRangeStartDate(nextStart);
  };

  const handleResetToToday = () => {
    setRangeStartDate(todayStr);
    handleDateChange(todayStr);
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'EMPLOYEE_SHIFT':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
            Individual Assigned Shift
          </span>
        );
      case 'DEPARTMENT_SHIFT':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            Department Schedule
          </span>
        );
      case 'COMPANY_DEFAULT':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
            Company Default (08:30 - 17:30)
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-neutral-100 text-neutral-500 border border-neutral-200">
            Off Day
          </span>
        );
    }
  };

  const todayVisual = todaySchedule
    ? resolveDailyScheduleVisualState(todaySchedule, leaveRequests, employeeHolidays)
    : null;

  const selectedVisual = selectedSchedule
    ? resolveDailyScheduleVisualState(selectedSchedule, leaveRequests, employeeHolidays)
    : null;

  const filteredUpcomingSchedules = upcomingSchedules.filter((sch) => {
    if (conditionFilter === 'ALL') return true;
    const vis = resolveDailyScheduleVisualState(sch, leaveRequests, employeeHolidays);
    return (
      vis.primaryCategory === conditionFilter ||
      vis.conditions.some((c) => c.category === conditionFilter)
    );
  });

  return (
    <div id="my-schedule-view" className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-neutral-200/80 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-neutral-900 shrink-0" />
            <h2 className="text-base font-bold text-neutral-900 tracking-tight break-words">
              My Work Schedule & Roster
            </h2>
          </div>
          <p className="text-xs text-neutral-500 mt-1 break-words">
            View your active shifts, daily working hours, weekly-offs, department/public holidays, and leave statuses.
          </p>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
          <span className="text-xs text-neutral-500 font-medium">
            Employee ID: <strong className="text-neutral-800 font-mono">#{employeeId}</strong>
          </span>
          <button
            type="button"
            onClick={() => fetchScheduleData(rangeStartDate)}
            title="Refresh Schedule"
            className="p-2.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors border border-neutral-200 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-red-600' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 flex items-center gap-2 text-xs font-medium text-rose-900">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {/* Calendar Colour Coding Legend */}
      <div
        id="my-schedule-legend"
        data-testid="my-schedule-legend"
        className="bg-white rounded-xl border border-neutral-200/80 p-4 sm:p-5 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-neutral-700 shrink-0" />
            <h3 className="text-xs sm:text-sm font-bold text-neutral-900">
              Schedule & Leave Colour Legend
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="hidden sm:inline text-[11px] text-neutral-500">
              Click any legend item to filter schedule dates
            </span>
            {conditionFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setConditionFilter('ALL')}
                className="text-xs font-semibold text-red-700 hover:underline cursor-pointer min-h-[36px] px-2"
              >
                Show All ({upcomingSchedules.length})
              </button>
            )}
            <button
              id="my-schedule-mobile-legend-toggle"
              type="button"
              onClick={() => setIsMobileLegendOpen((prev) => !prev)}
              className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold transition-colors cursor-pointer"
            >
              {isMobileLegendOpen ? 'Hide Full Legend' : 'Full Legend'}
            </button>
          </div>
        </div>

        {/* Mobile Quick Filter Chip Strip (<768px) */}
        <div
          id="my-schedule-mobile-filter-strip"
          className="md:hidden flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 mb-1"
        >
          <button
            type="button"
            onClick={() => setConditionFilter('ALL')}
            className={`shrink-0 px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              conditionFilter === 'ALL'
                ? 'bg-red-600 text-white border-red-600 shadow-xs'
                : 'bg-neutral-50 text-neutral-700 border-neutral-200'
            }`}
          >
            All ({upcomingSchedules.length})
          </button>
          {SCHEDULE_LEGEND_ITEMS.map((item) => {
            const isActiveFilter = conditionFilter === item.category;
            return (
              <button
                key={`mobile-chip-${item.category}`}
                type="button"
                onClick={() =>
                  setConditionFilter((prev) => (prev === item.category ? 'ALL' : item.category))
                }
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isActiveFilter
                    ? `${item.containerClass} ring-2 ring-red-700`
                    : 'bg-white text-neutral-700 border-neutral-200'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${item.swatchClass}`}
                >
                  {renderCategoryIcon(item.category, 'w-2.5 h-2.5')}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className={isMobileLegendOpen ? 'block mt-2' : 'hidden md:block'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {SCHEDULE_LEGEND_ITEMS.map((item) => {
            const isActiveFilter = conditionFilter === item.category;
            return (
              <button
                key={item.category}
                type="button"
                data-legend-category={item.category}
                onClick={() =>
                  setConditionFilter((prev) => (prev === item.category ? 'ALL' : item.category))
                }
                className={`p-2.5 rounded-lg border text-left transition-all flex items-start gap-2.5 min-w-0 cursor-pointer ${
                  item.containerClass
                } ${
                  isActiveFilter
                    ? 'ring-2 ring-red-700 ring-offset-1 shadow-xs'
                    : 'hover:opacity-95'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${item.swatchClass}`}
                  aria-hidden="true"
                >
                  {renderCategoryIcon(item.category, 'w-3 h-3')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <span className="text-xs font-bold leading-tight break-words">{item.label}</span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/75 border border-black/10 shrink-0">
                      {item.shortCode}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-85 mt-0.5 leading-snug break-words">
                    {item.description}
                  </p>
                </div>
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* Today's Schedule Card */}
      {todaySchedule && todayVisual && (
        <div
          id="today-schedule-card"
          data-schedule-category={todayVisual.primaryCategory}
          className="bg-white rounded-xl border border-neutral-200/80 p-4 sm:p-6 shadow-xs"
        >
          <div
            className={`p-4 rounded-xl border mb-5 ${todayVisual.containerClass}`}
            data-testid="today-status-banner"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider block opacity-80">
                  Today's Resolved Status ({formatDate(todaySchedule.date)})
                </span>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <h3 className="text-base sm:text-lg font-bold break-words">
                    {todayVisual.summaryText}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold border ${todayVisual.primaryBadgeClass}`}
                  >
                    {renderCategoryIcon(todayVisual.primaryCategory, 'w-3.5 h-3.5')}
                    <span>{todayVisual.primaryLabel}</span>
                  </span>
                  {getSourceBadge(todaySchedule.scheduleSource)}
                </div>

                {/* All active conditions on Today (ensuring multi-condition transparency) */}
                {todayVisual.conditions.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                    {todayVisual.conditions.map((cond, idx) => (
                      <span
                        key={`${cond.category}-${idx}`}
                        data-condition-badge={cond.category}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border break-words ${cond.badgeClass}`}
                      >
                        {renderCategoryIcon(cond.category, 'w-3 h-3')}
                        <span>{cond.label}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Half-Day Split Presentation for Today */}
                {todayVisual.halfDaySplit && (
                  <div
                    data-testid="today-half-day-split"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-black/10"
                  >
                    <div
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${todayVisual.halfDaySplit.firstHalfClass}`}
                    >
                      {renderCategoryIcon(todayVisual.halfDaySplit.firstHalfCategory, 'w-3.5 h-3.5')}
                      <span className="break-words">{todayVisual.halfDaySplit.firstHalfLabel}</span>
                    </div>
                    <div
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${todayVisual.halfDaySplit.secondHalfClass}`}
                    >
                      {renderCategoryIcon(todayVisual.halfDaySplit.secondHalfCategory, 'w-3.5 h-3.5')}
                      <span className="break-words">{todayVisual.halfDaySplit.secondHalfLabel}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 sm:flex items-center gap-2 sm:gap-4 bg-white/90 p-2.5 sm:px-4 sm:py-3 rounded-xl border border-black/10 w-full sm:w-auto self-start md:self-center">
                <div className="text-left sm:text-right">
                  <span className="text-[10px] sm:text-[11px] text-neutral-500 block truncate">Total Hours</span>
                  <span className="text-xs sm:text-base font-bold font-mono text-neutral-900">
                    {todaySchedule.totalWorkingHours ?? todaySchedule.totalScheduledHours} hrs
                  </span>
                </div>
                <div className="hidden sm:block h-8 w-px bg-neutral-200" />
                <div className="text-center sm:text-right">
                  <span className="text-[10px] sm:text-[11px] text-neutral-500 block truncate">Break</span>
                  <span className="text-xs sm:text-base font-bold font-mono text-neutral-800">
                    {todaySchedule.breakMinutes ??
                      todaySchedule.segments.reduce((acc, s) => acc + (s.breakMinutes || 0), 0)}{' '}
                    mins
                  </span>
                </div>
                <div className="hidden sm:block h-8 w-px bg-neutral-200" />
                <div className="text-right sm:text-left">
                  <span className="text-[10px] sm:text-[11px] text-neutral-500 block truncate">Working State</span>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold ${
                      todaySchedule.isWorkingDay ? 'text-emerald-700' : 'text-neutral-700'
                    }`}
                  >
                    {todaySchedule.isWorkingDay ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">Working Day</span>
                      </>
                    ) : (
                      <span className="truncate">Off / Holiday</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Configured Segments */}
          <div>
            <h4 className="text-xs font-bold text-neutral-800 mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <span>Working Segments for Today ({todaySchedule.segments.length})</span>
            </h4>

            {todaySchedule.segments.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {todaySchedule.segments.map((seg, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border transition-all ${
                      seg.crossesMidnight
                        ? 'bg-red-50/40 border-red-200'
                        : 'bg-neutral-50/60 border-neutral-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wide">
                        Segment #{seg.segmentSequence}
                      </span>
                      {seg.crossesMidnight ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                          <Moon className="w-3 h-3 text-red-700 shrink-0" />
                          <span>Overnight Cross-Midnight (+1 Day)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <Sun className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>Daytime</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-2 font-mono text-base font-bold text-neutral-900 mt-1 flex-wrap">
                      <span>{seg.startTime}</span>
                      <span className="text-neutral-500 font-normal">→</span>
                      <span>{seg.endTime}</span>
                      {seg.crossesMidnight && (
                        <span className="text-xs font-normal text-red-700">(Next Day)</span>
                      )}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-neutral-200/60 flex items-center justify-between gap-2 text-xs text-neutral-600 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Coffee className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <span>Break: {seg.breakMinutes} mins</span>
                      </span>
                      <span className="font-semibold text-neutral-900">
                        Duration: {seg.durationHours} hrs
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-neutral-50 border border-dashed border-neutral-300 text-center text-xs text-neutral-600">
                No active working segments for this date (Weekly Off or Full-Day Holiday).
              </div>
            )}
          </div>
        </div>
      )}

      {/* Date Inspector & 14-Day Roster */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: 14-Day Lookahead Calendar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-neutral-200/80 p-4 sm:p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-neutral-700 shrink-0" />
                <h3 className="text-sm font-bold text-neutral-900">14-Day Shift Schedule</h3>
              </div>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Employees have read-only view of their schedule, department holidays, and leave statuses
              </p>
            </div>

            {/* Range Navigation Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleShiftRange(-14)}
                title="Previous 14 Days"
                className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] rounded-xl border border-neutral-200 text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev 14d</span>
              </button>
              <button
                type="button"
                onClick={handleResetToToday}
                className="px-3.5 py-2 min-h-[44px] rounded-xl border border-neutral-200 text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleShiftRange(14)}
                title="Next 14 Days"
                className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] rounded-xl border border-neutral-200 text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <span>Next 14d</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2.5" id="schedule-calendar-list">
            {filteredUpcomingSchedules.length === 0 ? (
              <div className="p-6 rounded-xl bg-neutral-50 border border-dashed border-neutral-200 text-center text-xs text-neutral-500">
                No schedule dates match the selected filter ({conditionFilter}).
              </div>
            ) : (
              filteredUpcomingSchedules.map((sch) => {
                const isSelected = sch.date === selectedDate;
                const dateObj = new Date(sch.date + 'T00:00:00Z');
                const dayName = dateObj.toLocaleDateString('en-US', {
                  weekday: 'short',
                  timeZone: 'UTC',
                });
                const visual = resolveDailyScheduleVisualState(
                  sch,
                  leaveRequests,
                  employeeHolidays
                );

                return (
                  <div
                    key={sch.date}
                    data-schedule-date={sch.date}
                    data-schedule-category={visual.primaryCategory}
                    onClick={() => handleDateChange(sch.date)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 text-xs ${
                      visual.containerClass
                    } ${
                      isSelected
                        ? 'ring-2 ring-red-700 ring-offset-1 shadow-sm'
                        : 'hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`font-mono font-bold w-11 shrink-0 text-center py-1.5 rounded-lg border text-xs ${visual.dayBadgeClass}`}
                      >
                        {dayName}
                      </span>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm font-mono">{formatDate(sch.date)}</span>
                          <span
                            data-primary-badge={visual.primaryCategory}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border break-words ${visual.primaryBadgeClass}`}
                          >
                            {renderCategoryIcon(visual.primaryCategory, 'w-3 h-3')}
                            <span>{visual.primaryLabel}</span>
                          </span>
                          {sch.date === todayStr && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-800 text-white">
                              Today
                            </span>
                          )}
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-700 text-white">
                              Selected
                            </span>
                          )}
                        </div>

                        <div className={`text-[11px] font-medium break-words ${visual.subtextClass}`}>
                          {visual.summaryText}
                        </div>

                        {/* Render all condition badges so multiple conditions on one date are never hidden */}
                        {visual.conditions.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {visual.conditions.map((cond, idx) => (
                              <span
                                key={`${sch.date}-cond-${idx}`}
                                data-condition-badge={cond.category}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border break-words ${cond.badgeClass}`}
                              >
                                {renderCategoryIcon(cond.category, 'w-2.5 h-2.5')}
                                <span>{cond.label}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Half-Day Partial Presentation */}
                        {visual.halfDaySplit && (
                          <div
                            data-testid={`half-day-split-${sch.date}`}
                            className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1"
                          >
                            <div
                              className={`px-2 py-1 rounded border text-[10px] font-semibold flex items-center gap-1 ${visual.halfDaySplit.firstHalfClass}`}
                            >
                              {renderCategoryIcon(visual.halfDaySplit.firstHalfCategory, 'w-3 h-3')}
                              <span className="break-words">{visual.halfDaySplit.firstHalfLabel}</span>
                            </div>
                            <div
                              className={`px-2 py-1 rounded border text-[10px] font-semibold flex items-center gap-1 ${visual.halfDaySplit.secondHalfClass}`}
                            >
                              {renderCategoryIcon(visual.halfDaySplit.secondHalfCategory, 'w-3 h-3')}
                              <span className="break-words">{visual.halfDaySplit.secondHalfLabel}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5">
                      {sch.segments.some((s) => s.crossesMidnight) && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                          Night (+1)
                        </span>
                      )}

                      <span
                        className={`font-mono font-bold text-xs px-2.5 py-1 rounded-lg border ${visual.hoursBadgeClass}`}
                      >
                        {visual.hoursDisplay}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Col: Interactive Schedule Inspector & Assignment History */}
        <div className="space-y-6">
          {/* Specific Date Inspector */}
          <div className="bg-white rounded-xl border border-neutral-200/80 p-4 sm:p-5 shadow-xs">
            <h3 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-neutral-700 shrink-0" />
              <span>Schedule Inspector</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Select Business Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm sm:text-xs border border-neutral-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                />
              </div>

              {inspecting ? (
                <div className="p-4 text-center text-xs text-neutral-500">Resolving schedule...</div>
              ) : selectedSchedule && selectedVisual ? (
                <div
                  data-testid="inspector-schedule-card"
                  data-schedule-category={selectedVisual.primaryCategory}
                  className={`p-3.5 rounded-xl border space-y-2.5 text-xs ${selectedVisual.containerClass}`}
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-black/10 flex-wrap">
                    <span className="font-mono font-bold">{formatDate(selectedSchedule.date)}</span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${selectedVisual.primaryBadgeClass}`}
                    >
                      {renderCategoryIcon(selectedVisual.primaryCategory, 'w-3 h-3')}
                      <span>{selectedVisual.primaryLabel}</span>
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-2">
                    <span className="opacity-75">Resolved Source:</span>
                    <span className="font-semibold text-right break-words">
                      {selectedSchedule.scheduleSource}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="opacity-75">Working Day:</span>
                    <span className="font-semibold">
                      {selectedSchedule.isWorkingDay ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="opacity-75">Total Working Hours:</span>
                    <span className="font-mono font-bold">
                      {selectedSchedule.totalWorkingHours ?? selectedSchedule.totalScheduledHours} hrs/day
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="opacity-75">Break:</span>
                    <span className="font-mono font-semibold">
                      {selectedSchedule.breakMinutes ??
                        selectedSchedule.segments.reduce((acc, s) => acc + (s.breakMinutes || 0), 0)}{' '}
                      mins
                    </span>
                  </div>
                  {selectedSchedule.earliestStartTime && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="opacity-75">Working Window:</span>
                      <span className="font-mono">
                        {selectedSchedule.earliestStartTime} → {selectedSchedule.latestEndTime}
                      </span>
                    </div>
                  )}
                  {(selectedSchedule.isHoliday || selectedVisual.isDepartmentHoliday) && (
                    <div className="flex justify-between items-start gap-2 font-semibold pt-1 border-t border-black/10">
                      <span>
                        {selectedVisual.isDepartmentHoliday ? 'Department Holiday:' : 'Public Holiday:'}
                      </span>
                      <span className="text-right break-words">
                        {selectedSchedule.holidayName}
                        {selectedVisual.holidayDepartmentName
                          ? ` (${selectedVisual.holidayDepartmentName})`
                          : ''}
                      </span>
                    </div>
                  )}

                  {/* Conditions / Events on Selected Date */}
                  {selectedVisual.conditions.length > 0 && (
                    <div className="pt-2 border-t border-black/10 space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider block opacity-80">
                        Conditions on {formatDate(selectedSchedule.date)} ({selectedVisual.conditions.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedVisual.conditions.map((cond, idx) => (
                          <span
                            key={`insp-cond-${idx}`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border break-words ${cond.badgeClass}`}
                          >
                            {renderCategoryIcon(cond.category, 'w-3 h-3')}
                            <span>{cond.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Half-Day Split in Inspector */}
                  {selectedVisual.halfDaySplit && (
                    <div className="pt-2 border-t border-black/10 space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider block opacity-80">
                        Partial-Day Breakdown
                      </span>
                      <div className="grid grid-cols-1 gap-1.5">
                        <div
                          className={`px-2.5 py-1.5 rounded border text-[11px] font-semibold flex items-center gap-1.5 ${selectedVisual.halfDaySplit.firstHalfClass}`}
                        >
                          {renderCategoryIcon(
                            selectedVisual.halfDaySplit.firstHalfCategory,
                            'w-3 h-3'
                          )}
                          <span className="break-words">
                            {selectedVisual.halfDaySplit.firstHalfLabel}
                          </span>
                        </div>
                        <div
                          className={`px-2.5 py-1.5 rounded border text-[11px] font-semibold flex items-center gap-1.5 ${selectedVisual.halfDaySplit.secondHalfClass}`}
                        >
                          {renderCategoryIcon(
                            selectedVisual.halfDaySplit.secondHalfCategory,
                            'w-3 h-3'
                          )}
                          <span className="break-words">
                            {selectedVisual.halfDaySplit.secondHalfLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Active Shift Assignment Roster History */}
          <div className="bg-white rounded-xl border border-neutral-200/80 p-4 sm:p-5 shadow-xs">
            <h3 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-neutral-700 shrink-0" />
              <span>My Shift Assignments</span>
            </h3>

            {assignments.length > 0 ? (
              <div className="space-y-2.5">
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-neutral-900 break-words">
                        {a.shiftName || a.shiftCode}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          a.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-neutral-200 text-neutral-600'
                        }`}
                      >
                        {a.isActive ? 'Active' : 'Past'}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 font-mono break-words">
                      Effective: {formatDate(a.effectiveFrom)} → {a.effectiveTo ? formatDate(a.effectiveTo) : 'Open-ended'}
                    </div>
                    {(a.shift || a.totalScheduledHours) && (
                      <div className="text-[11px] text-neutral-700 font-medium mt-1">
                        Total Working Hours ={' '}
                        {a.shift?.totalWorkingHours ?? a.shift?.totalScheduledHours ?? a.totalScheduledHours ?? 0}{' '}
                        hrs/day; Break = {a.shift?.breakMinutes ?? 0} mins
                      </div>
                    )}
                    {a.workDaysOfWeek && (
                      <div className="text-[10px] text-neutral-600 mt-1">
                        Work Days: DOW [{a.workDaysOfWeek}]
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-neutral-50 border border-dashed border-neutral-200 text-center text-xs text-neutral-500">
                No custom shift assigned. You follow company standard timings (08:30 - 17:30).
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
