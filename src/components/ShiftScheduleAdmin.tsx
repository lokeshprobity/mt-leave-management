import React, { useState, useEffect } from 'react';
import {
  Clock,
  Plus,
  RefreshCw,
  User,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Moon,
  Sun,
  Layers,
  Sparkles,
  Edit2,
  Trash2,
  Eye,
  Power,
  X,
  Save,
  Building,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch, getActiveRole } from '../lib/api.ts';
import { Employee360Link } from './Employee360Trigger.tsx';
import { formatDate } from '../utils/dateFormat.ts';
import { SCHEDULE_CATEGORY_STYLES, MT_COLOR_CARDS } from '../utils/theme.ts';
import {
  ShiftDto,
  ShiftType,
  ShiftSegmentDto,
  EmployeeShiftAssignmentDto,
  DepartmentShiftAssignmentDto,
  CreateShiftInput,
  UpdateShiftInput,
  CreateEmployeeShiftAssignmentInput,
  CreateDepartmentShiftAssignmentInput,
  ResolvedDailySchedule,
  EmployeeDto,
  DepartmentDto,
} from '../types/leave.ts';

export function computeSegmentWorkingHours(
  startStr: string,
  endStr: string,
  crossesMidnight: boolean
): number {
  const sParts = (startStr || '').trim().split(':').map(Number);
  const eParts = (endStr || '').trim().split(':').map(Number);
  if (
    sParts.length < 2 ||
    eParts.length < 2 ||
    isNaN(sParts[0]) ||
    isNaN(sParts[1]) ||
    isNaN(eParts[0]) ||
    isNaN(eParts[1])
  ) {
    return 0;
  }
  const sMins = sParts[0] * 60 + sParts[1];
  const eMins = eParts[0] * 60 + eParts[1];
  const grossMins = crossesMidnight || eMins <= sMins ? 24 * 60 - sMins + eMins : eMins - sMins;
  // Business Rule: Configured Total Working Hours includes the break; do NOT subtract breakMinutes.
  return Math.round((Math.max(0, grossMins) / 60) * 100) / 100;
}

export function ShiftScheduleAdmin({
  initialSubTab = 'shifts',
}: {
  initialSubTab?: 'shifts' | 'assignments' | 'departments' | 'tester';
} = {}) {
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [assignments, setAssignments] = useState<EmployeeShiftAssignmentDto[]>([]);
  const [deptAssignments, setDeptAssignments] = useState<DepartmentShiftAssignmentDto[]>([]);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active view tab inside shift management: 'shifts' | 'assignments' | 'departments' | 'tester'
  const [subTab, setSubTab] = useState<'shifts' | 'assignments' | 'departments' | 'tester'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Create Shift Modal state
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftCode, setShiftCode] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [shiftType, setShiftType] = useState<ShiftType>('DAY');
  const [shiftStartTime, setShiftStartTime] = useState('08:30');
  const [shiftEndTime, setShiftEndTime] = useState('17:30');
  const [shiftBreakMinutes, setShiftBreakMinutes] = useState<number>(30);
  const [shiftTotalWorkingHours, setShiftTotalWorkingHours] = useState<number>(9.0);
  const [createHoursManuallyEdited, setCreateHoursManuallyEdited] = useState<boolean>(false);
  const [shiftWeeklyOff, setShiftWeeklyOff] = useState('Sunday');
  const [shiftIsActive, setShiftIsActive] = useState<boolean>(true);
  const [shiftEffectiveFrom, setShiftEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [shiftEffectiveTo, setShiftEffectiveTo] = useState('');
  const [shiftDesc, setShiftDesc] = useState('');
  const [segments, setSegments] = useState<
    Array<{
      segmentSequence: number;
      startTime: string;
      endTime: string;
      crossesMidnight: boolean;
      breakMinutes: number;
    }>
  >([{ segmentSequence: 1, startTime: '08:30', endTime: '17:30', crossesMidnight: false, breakMinutes: 30 }]);
  const [savingShift, setSavingShift] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);

  // Edit Shift Modal state
  const [editingShift, setEditingShift] = useState<ShiftDto | null>(null);
  const [editShiftCode, setEditShiftCode] = useState('');
  const [editShiftName, setEditShiftName] = useState('');
  const [editShiftType, setEditShiftType] = useState<ShiftType>('DAY');
  const [editShiftStartTime, setEditShiftStartTime] = useState('08:30');
  const [editShiftEndTime, setEditShiftEndTime] = useState('17:30');
  const [editShiftBreakMinutes, setEditShiftBreakMinutes] = useState<number>(30);
  const [editShiftTotalWorkingHours, setEditShiftTotalWorkingHours] = useState<number>(9.0);
  const [editHoursManuallyEdited, setEditHoursManuallyEdited] = useState<boolean>(false);
  const [editShiftWeeklyOff, setEditShiftWeeklyOff] = useState('Sunday');
  const [editShiftIsActive, setEditShiftIsActive] = useState<boolean>(true);
  const [editShiftEffectiveFrom, setEditShiftEffectiveFrom] = useState('2026-01-01');
  const [editShiftEffectiveTo, setEditShiftEffectiveTo] = useState('');
  const [editShiftDesc, setEditShiftDesc] = useState('');
  const [editSegments, setEditSegments] = useState<
    Array<{
      segmentSequence: number;
      startTime: string;
      endTime: string;
      crossesMidnight: boolean;
      breakMinutes: number;
    }>
  >([]);
  const [updatingShift, setUpdatingShift] = useState(false);
  const [editShiftError, setEditShiftError] = useState<string | null>(null);

  // Delete Shift Confirmation Modal state
  const [confirmDeleteShift, setConfirmDeleteShift] = useState<ShiftDto | null>(null);
  const [deletingShift, setDeletingShift] = useState(false);
  const [deleteShiftError, setDeleteShiftError] = useState<string | null>(null);

  // View Shift Details Modal
  const [viewingShift, setViewingShift] = useState<ShiftDto | null>(null);

  // Assign Shift to Employee Modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignEmpId, setAssignEmpId] = useState<string | number>(101);
  const [assignShiftId, setAssignShiftId] = useState<number>(1);
  const [assignFrom, setAssignFrom] = useState(new Date().toISOString().split('T')[0]);
  const [assignTo, setAssignTo] = useState('');
  const [assignWorkDays, setAssignWorkDays] = useState('1,2,3,4,5,6'); // Mon-Sat default
  const [assignmentReason, setAssignmentReason] = useState('DEPARTMENT_REQUIREMENT');
  const [assignRemarks, setAssignRemarks] = useState('');
  const [useCustomSegments, setUseCustomSegments] = useState(false);
  const [assignCustomSegments, setAssignCustomSegments] = useState<
    Array<{ startTime: string; endTime: string; crossesMidnight: boolean; breakMinutes: number }>
  >([
    { startTime: '05:30', endTime: '08:30', crossesMidnight: false, breakMinutes: 0 },
    { startTime: '19:00', endTime: '21:00', crossesMidnight: false, breakMinutes: 0 },
  ]);
  const [savingAssign, setSavingAssign] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Edit Employee Shift Assignment Modal state
  const [editingAssignment, setEditingAssignment] = useState<EmployeeShiftAssignmentDto | null>(null);
  const [editAssignShiftId, setEditAssignShiftId] = useState<number>(1);
  const [editAssignFrom, setEditAssignFrom] = useState('');
  const [editAssignTo, setEditAssignTo] = useState('');
  const [editAssignReason, setEditAssignReason] = useState('DEPARTMENT_REQUIREMENT');
  const [editAssignRemarks, setEditAssignRemarks] = useState('');
  const [updatingAssign, setUpdatingAssign] = useState(false);
  const [editAssignError, setEditAssignError] = useState<string | null>(null);

  // Department Shift Modal state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [assignDeptId, setAssignDeptId] = useState<string | number>(1);
  const [deptShiftId, setDeptShiftId] = useState<number>(1);
  const [deptFrom, setDeptFrom] = useState(new Date().toISOString().split('T')[0]);
  const [deptTo, setDeptTo] = useState('');
  const [deptWorkDays, setDeptWorkDays] = useState('1,2,3,4,5');
  const [savingDept, setSavingDept] = useState(false);
  const [deptError, setDeptError] = useState<string | null>(null);

  // Schedule Resolution Inspector / Tester State
  const [inspectEmpId, setInspectEmpId] = useState<string | number>(101);
  const [inspectDate, setInspectDate] = useState(new Date().toISOString().split('T')[0]);
  const [inspectResult, setInspectResult] = useState<ResolvedDailySchedule | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const activeRole = getActiveRole();
  const canEdit = activeRole === 'SUPER_ADMIN' || activeRole === 'HR';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [shiftsRes, assignRes, deptRes, empRes, deptsRes] = await Promise.all([
        apiFetch('/api/shifts?includeInactive=true'),
        apiFetch('/api/employee-shifts'),
        apiFetch('/api/department-shifts'),
        apiFetch('/api/employees'),
        apiFetch('/api/departments?includeInactive=true'),
      ]);

      const shiftsData = await shiftsRes.json();
      if (shiftsRes.ok && shiftsData.shifts) {
        setShifts(shiftsData.shifts);
        if (shiftsData.shifts.length > 0 && !assignShiftId) {
          const firstConfigured = shiftsData.shifts.find((s: ShiftDto) => s.timingConfigured) || shiftsData.shifts[0];
          setAssignShiftId(firstConfigured.id);
          setDeptShiftId(firstConfigured.id);
        }
      }

      const assignData = await assignRes.json();
      if (assignRes.ok && assignData.assignments) {
        setAssignments(assignData.assignments);
      }

      const deptData = await deptRes.json();
      if (deptRes.ok && deptData.assignments) {
        setDeptAssignments(deptData.assignments);
      }

      if (empRes.ok) {
        const empData = await empRes.json();
        const empList: EmployeeDto[] = empData.employees || [];
        setEmployees(empList);
        if (empList.length > 0 && assignEmpId === 101 && !empList.some((e) => String(e.id) === '101')) {
          setAssignEmpId(empList[0].id);
          setInspectEmpId(empList[0].id);
        }
      }

      if (deptsRes.ok) {
        const deptsData = await deptsRes.json();
        const deptList: DepartmentDto[] = deptsData.departments || [];
        setDepartments(deptList);
        if (deptList.length > 0 && assignDeptId === 1 && !deptList.some((d) => String(d.id) === '1')) {
          setAssignDeptId(deptList[0].id);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load shift records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const recalculateCreateSegmentsSummary = (
    nextSegs: Array<{
      segmentSequence: number;
      startTime: string;
      endTime: string;
      crossesMidnight: boolean;
      breakMinutes: number;
    }>,
    options?: { skipTotalHoursUpdate?: boolean; fromSegmentBreakChange?: boolean }
  ) => {
    if (nextSegs.length > 0) {
      setShiftStartTime(nextSegs[0].startTime);
      setShiftEndTime(nextSegs[nextSegs.length - 1].endTime);
      const totalBreak = nextSegs.reduce((acc, s) => acc + (Number(s.breakMinutes) || 0), 0);
      if (options?.fromSegmentBreakChange || nextSegs.length === 1 || totalBreak > 0) {
        setShiftBreakMinutes(totalBreak);
      }
      if (!options?.skipTotalHoursUpdate && !createHoursManuallyEdited) {
        const totalHrs = nextSegs.reduce(
          (acc, s) => acc + computeSegmentWorkingHours(s.startTime, s.endTime, s.crossesMidnight),
          0
        );
        setShiftTotalWorkingHours(Math.round(totalHrs * 100) / 100);
      }
    }
  };

  const handleShiftTypeChange = (nextType: ShiftType) => {
    setShiftType(nextType);
    if (nextType === 'DAY') {
      const nextSegs = [
        { segmentSequence: 1, startTime: '08:30', endTime: '17:30', crossesMidnight: false, breakMinutes: 30 },
      ];
      setSegments(nextSegs);
      recalculateCreateSegmentsSummary(nextSegs);
    } else if (nextType === 'NIGHT') {
      const nextSegs = [
        { segmentSequence: 1, startTime: '20:30', endTime: '08:30', crossesMidnight: true, breakMinutes: 30 },
      ];
      setSegments(nextSegs);
      recalculateCreateSegmentsSummary(nextSegs);
    } else if (nextType === 'SPLIT') {
      const nextSegs =
        segments.length >= 2
          ? segments
          : [
              { segmentSequence: 1, startTime: '05:30', endTime: '08:30', crossesMidnight: false, breakMinutes: 0 },
              { segmentSequence: 2, startTime: '17:00', endTime: '23:00', crossesMidnight: false, breakMinutes: 0 },
            ];
      setSegments(nextSegs);
      recalculateCreateSegmentsSummary(nextSegs);
    }
  };

  const handleAddSegment = () => {
    setSegments((prev) => {
      const updated = [
        ...prev,
        {
          segmentSequence: prev.length + 1,
          startTime: '18:00',
          endTime: '22:00',
          crossesMidnight: false,
          breakMinutes: 0,
        },
      ];
      if (updated.length > 1 && shiftType !== 'SPLIT') {
        setShiftType('SPLIT');
      }
      recalculateCreateSegmentsSummary(updated);
      return updated;
    });
  };

  const handleRemoveSegment = (index: number) => {
    if (segments.length <= 1) return;
    setSegments((prev) => {
      const updated = prev
        .filter((_, i) => i !== index)
        .map((s, idx) => ({ ...s, segmentSequence: idx + 1 }));
      recalculateCreateSegmentsSummary(updated);
      return updated;
    });
  };

  const handleSegmentChange = (index: number, field: string, value: any) => {
    setSegments((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      recalculateCreateSegmentsSummary(copy, {
        skipTotalHoursUpdate: field === 'breakMinutes',
        fromSegmentBreakChange: field === 'breakMinutes',
      });
      return copy;
    });
  };

  const handlePrimaryTimingChange = (
    field: 'startTime' | 'endTime' | 'breakMinutes',
    value: string | number
  ) => {
    if (field === 'startTime') setShiftStartTime(String(value));
    if (field === 'endTime') setShiftEndTime(String(value));
    if (field === 'breakMinutes') setShiftBreakMinutes(Number(value) || 0);

    setSegments((prev) => {
      const nextStart = field === 'startTime' ? String(value) : prev[0]?.startTime || shiftStartTime;
      const nextEnd = field === 'endTime' ? String(value) : prev[0]?.endTime || shiftEndTime;
      const nextBreak = field === 'breakMinutes' ? Number(value) || 0 : prev[0]?.breakMinutes ?? shiftBreakMinutes;
      const crossesMidnight = shiftType === 'NIGHT' || nextEnd <= nextStart;
      if (prev.length <= 1) {
        const single = [
          {
            segmentSequence: 1,
            startTime: nextStart,
            endTime: nextEnd,
            crossesMidnight,
            breakMinutes: nextBreak,
          },
        ];
        // Do NOT subtract breakMinutes or alter Total Working Hours when breakMinutes changes
        if (field !== 'breakMinutes' && !createHoursManuallyEdited) {
          setShiftTotalWorkingHours(computeSegmentWorkingHours(nextStart, nextEnd, crossesMidnight));
        }
        return single;
      }
      return prev;
    });
  };

  const openCreateShiftModal = () => {
    setShiftError(null);
    setShiftCode('');
    setShiftName('');
    setShiftType('DAY');
    setShiftStartTime('08:30');
    setShiftEndTime('17:30');
    setShiftBreakMinutes(30);
    setShiftTotalWorkingHours(9.0);
    setCreateHoursManuallyEdited(false);
    setShiftWeeklyOff('Sunday');
    setShiftIsActive(true);
    setShiftEffectiveFrom(new Date().toISOString().split('T')[0]);
    setShiftEffectiveTo('');
    setShiftDesc('');
    setSegments([
      { segmentSequence: 1, startTime: '08:30', endTime: '17:30', crossesMidnight: false, breakMinutes: 30 },
    ]);
    setShowShiftModal(true);
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingShift(true);
    setShiftError(null);
    try {
      const normalizedSegments = segments.map((s, idx) => ({
        segmentSequence: idx + 1,
        startTime: s.startTime,
        endTime: s.endTime,
        crossesMidnight: shiftType === 'NIGHT' && segments.length === 1 ? true : Boolean(s.crossesMidnight),
        breakMinutes: Number(s.breakMinutes) || 0,
        isActive: true,
      }));

      const payload: CreateShiftInput = {
        shiftCode: shiftCode.trim().toUpperCase(),
        shiftName: shiftName.trim(),
        shiftType,
        startTime: normalizedSegments[0]?.startTime || shiftStartTime,
        endTime: normalizedSegments[normalizedSegments.length - 1]?.endTime || shiftEndTime,
        totalWorkingHours: Number(shiftTotalWorkingHours) || undefined,
        breakMinutes: Number(shiftBreakMinutes) || 0,
        weeklyOff: shiftWeeklyOff.trim() || 'Sunday',
        isActive: shiftIsActive,
        effectiveFrom: shiftEffectiveFrom || undefined,
        effectiveTo: shiftEffectiveTo.trim() || null,
        description: shiftDesc.trim() || undefined,
        segments: normalizedSegments,
      };

      const res = await apiFetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create shift');
      }

      // Close modal ONLY after successful backend save and refresh from backend
      await loadData();
      setShowShiftModal(false);
      setSuccessMsg(`Shift "${payload.shiftName}" (${payload.shiftCode}) created and saved to database!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      // Keep dialog open and show the actual backend error
      setShiftError(err.message || 'Failed to create shift');
    } finally {
      setSavingShift(false);
    }
  };

  const recalculateEditSegmentsSummary = (
    nextSegs: Array<{
      segmentSequence: number;
      startTime: string;
      endTime: string;
      crossesMidnight: boolean;
      breakMinutes: number;
    }>,
    options?: { skipTotalHoursUpdate?: boolean; fromSegmentBreakChange?: boolean }
  ) => {
    if (nextSegs.length > 0) {
      setEditShiftStartTime(nextSegs[0].startTime);
      setEditShiftEndTime(nextSegs[nextSegs.length - 1].endTime);
      const totalBreak = nextSegs.reduce((acc, s) => acc + (Number(s.breakMinutes) || 0), 0);
      if (options?.fromSegmentBreakChange || nextSegs.length === 1 || totalBreak > 0) {
        setEditShiftBreakMinutes(totalBreak);
      }
      if (!options?.skipTotalHoursUpdate && !editHoursManuallyEdited) {
        const totalHrs = nextSegs.reduce(
          (acc, s) => acc + computeSegmentWorkingHours(s.startTime, s.endTime, s.crossesMidnight),
          0
        );
        setEditShiftTotalWorkingHours(Math.round(totalHrs * 100) / 100);
      }
    }
  };

  const openEditShift = (shift: ShiftDto) => {
    setEditingShift(shift);
    setEditShiftCode(shift.shiftCode || '');
    setEditShiftName(shift.shiftName || '');
    const inferredType: ShiftType =
      shift.shiftType === 'NIGHT' || shift.shiftType === 'SPLIT' || shift.shiftType === 'DAY'
        ? (shift.shiftType as ShiftType)
        : shift.segments && shift.segments.length > 1
        ? 'SPLIT'
        : shift.segments?.[0]?.crossesMidnight || String(shift.category || '').toLowerCase().includes('night')
        ? 'NIGHT'
        : 'DAY';
    setEditShiftType(inferredType);
    const hasConfiguredTiming = Boolean(shift.timingConfigured && shift.segments && shift.segments.length > 0);
    const initialSegs =
      hasConfiguredTiming && shift.segments && shift.segments.length > 0
        ? shift.segments.map((s, i) => ({
            segmentSequence: s.segmentSequence || i + 1,
            startTime: s.startTime || '08:30',
            endTime: s.endTime || '17:30',
            crossesMidnight: Boolean(s.crossesMidnight),
            breakMinutes: s.breakMinutes ?? 0,
          }))
        : [
            {
              segmentSequence: 1,
              startTime: shift.startTime || '08:30',
              endTime: shift.endTime || '17:30',
              crossesMidnight: inferredType === 'NIGHT',
              breakMinutes: hasConfiguredTiming ? (shift.breakMinutes ?? 30) : (shift.breakMinutes && shift.breakMinutes > 0 ? shift.breakMinutes : 30),
            },
          ];
    setEditSegments(initialSegs);
    setEditShiftStartTime(shift.startTime || initialSegs[0]?.startTime || '08:30');
    setEditShiftEndTime(shift.endTime || initialSegs[initialSegs.length - 1]?.endTime || '17:30');
    setEditShiftBreakMinutes(
      hasConfiguredTiming
        ? (shift.breakMinutes ?? initialSegs.reduce((acc, s) => acc + (Number(s.breakMinutes) || 0), 0))
        : (shift.breakMinutes && shift.breakMinutes > 0 ? shift.breakMinutes : 30)
    );
    const computedGrossHrs =
      Math.round(
        initialSegs.reduce(
          (acc, s) => acc + computeSegmentWorkingHours(s.startTime, s.endTime, s.crossesMidnight),
          0
        ) * 100
      ) / 100;
    const configuredHrs =
      hasConfiguredTiming && (shift.totalWorkingHours || shift.totalScheduledHours)
        ? (shift.totalWorkingHours ?? shift.totalScheduledHours ?? computedGrossHrs ?? 9.0)
        : (computedGrossHrs || 9.0);
    setEditShiftTotalWorkingHours(configuredHrs);
    setEditHoursManuallyEdited(
      inferredType === 'SPLIT' ||
        initialSegs.length > 1 ||
        (configuredHrs > 0 && Math.abs(configuredHrs - computedGrossHrs) > 0.01)
    );
    setEditShiftWeeklyOff(shift.weeklyOff || 'Sunday');
    setEditShiftIsActive(shift.isActive ?? true);
    setEditShiftEffectiveFrom(shift.effectiveFrom || '2026-01-01');
    setEditShiftEffectiveTo(shift.effectiveTo || '');
    setEditShiftDesc(shift.description || '');
    setEditShiftError(null);
  };

  const handleUpdateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;
    setUpdatingShift(true);
    setEditShiftError(null);
    try {
      const normalizedSegments = editSegments.map((s, idx) => ({
        segmentSequence: idx + 1,
        startTime: s.startTime,
        endTime: s.endTime,
        crossesMidnight: editShiftType === 'NIGHT' && editSegments.length === 1 ? true : Boolean(s.crossesMidnight),
        breakMinutes: Number(s.breakMinutes) || 0,
        isActive: true,
      }));

      const payload: UpdateShiftInput = {
        shiftCode: editShiftCode.trim().toUpperCase(),
        shiftName: editShiftName.trim(),
        shiftType: editShiftType,
        startTime: normalizedSegments[0]?.startTime || editShiftStartTime,
        endTime: normalizedSegments[normalizedSegments.length - 1]?.endTime || editShiftEndTime,
        totalWorkingHours: Number(editShiftTotalWorkingHours) || undefined,
        breakMinutes: Number(editShiftBreakMinutes) || 0,
        weeklyOff: editShiftWeeklyOff.trim() || 'Sunday',
        isActive: editShiftIsActive,
        effectiveFrom: editShiftEffectiveFrom || null,
        effectiveTo: editShiftEffectiveTo.trim() || null,
        description: editShiftDesc.trim() || null,
        segments: normalizedSegments,
      };

      const res = await apiFetch(`/api/shifts/${editingShift.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update shift');
      }

      await loadData();
      setEditingShift(null);
      setSuccessMsg(`Shift "${payload.shiftName}" (${payload.shiftCode}) updated and persisted!`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setEditShiftError(err.message || 'Failed to update shift');
    } finally {
      setUpdatingShift(false);
    }
  };

  const handleToggleShiftStatus = async (shift: ShiftDto) => {
    const nextStatus = !shift.isActive;
    try {
      const res = await apiFetch(`/api/shifts/${shift.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change shift status');
      setSuccessMsg(`Shift ${shift.shiftCode} is now ${nextStatus ? 'Active' : 'Inactive'}.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteShift = (shift: ShiftDto) => {
    setDeleteShiftError(null);
    setConfirmDeleteShift(shift);
  };

  const executeConfirmDeleteShift = async () => {
    if (!confirmDeleteShift) return;
    setDeletingShift(true);
    setDeleteShiftError(null);
    try {
      const res = await apiFetch(`/api/shifts/${confirmDeleteShift.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete shift');
      }
      await loadData();
      setConfirmDeleteShift(null);
      setSuccessMsg(data.message || `Shift ${confirmDeleteShift.shiftCode} deleted.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setDeleteShiftError(err.message || 'Failed to delete shift');
    } finally {
      setDeletingShift(false);
    }
  };

  const handleAssignShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAssign(true);
    setAssignError(null);

    const targetShift = shifts.find((s) => s.id === assignShiftId);
    if (targetShift && !targetShift.timingConfigured && !useCustomSegments) {
      setAssignError('Shift timing is not configured and cannot be assigned without custom work segments.');
      setSavingAssign(false);
      return;
    }

    try {
      const resolvedEmpId = isNaN(Number(assignEmpId)) ? assignEmpId : Number(assignEmpId);
      const payload: CreateEmployeeShiftAssignmentInput = {
        employeeId: resolvedEmpId as any,
        shiftId: Number(assignShiftId),
        effectiveFrom: assignFrom,
        effectiveTo: assignTo.trim() || undefined,
        workDaysOfWeek: assignWorkDays.trim() || undefined,
        customSegments: useCustomSegments
          ? assignCustomSegments.map((seg, i) => ({
              segmentSequence: i + 1,
              startTime: seg.startTime,
              endTime: seg.endTime,
              crossesMidnight: Boolean(seg.crossesMidnight),
              breakMinutes: Number(seg.breakMinutes) || 0,
            }))
          : undefined,
        assignmentReason: assignmentReason,
        remarks: assignRemarks.trim() || undefined,
      };

      const res = await apiFetch('/api/employee-shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to assign shift');
      }

      const assignedEmp = employees.find((e) => String(e.id) === String(assignEmpId) || e.employeeCode === String(assignEmpId));
      setSuccessMsg(
        `Shift assigned successfully to ${assignedEmp ? `${assignedEmp.employeeCode} (${assignedEmp.employeeName || assignedEmp.fullName})` : `Employee #${assignEmpId}`}!`
      );
      setTimeout(() => setSuccessMsg(null), 3000);
      setShowAssignModal(false);
      setAssignRemarks('');
      await loadData();
    } catch (err: any) {
      setAssignError(err.message);
    } finally {
      setSavingAssign(false);
    }
  };

  const openEditAssignment = (assign: EmployeeShiftAssignmentDto) => {
    setEditingAssignment(assign);
    setEditAssignShiftId(assign.shiftId ?? 1);
    setEditAssignFrom(assign.effectiveFrom || '');
    setEditAssignTo(assign.effectiveTo || '');
    setEditAssignReason(assign.assignmentReason || 'DEPARTMENT_REQUIREMENT');
    setEditAssignRemarks(assign.remarks || '');
    setEditAssignError(null);
  };

  const handleUpdateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment) return;
    setUpdatingAssign(true);
    setEditAssignError(null);
    try {
      const payload = {
        shiftId: Number(editAssignShiftId),
        effectiveFrom: editAssignFrom,
        effectiveTo: editAssignTo.trim() || null,
        assignmentReason: editAssignReason,
        remarks: editAssignRemarks.trim() || null,
      };

      const res = await apiFetch(`/api/employee-shifts/${editingAssignment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update shift assignment');
      }

      setSuccessMsg(`Shift assignment #${editingAssignment.id} updated successfully!`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setEditingAssignment(null);
      await loadData();
    } catch (err: any) {
      setEditAssignError(err.message);
    } finally {
      setUpdatingAssign(false);
    }
  };

  const handleDeleteAssignment = async (id: number) => {
    if (!window.confirm(`Are you sure you want to end/cancel this employee shift assignment (#${id})?`)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/employee-shifts/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel shift assignment');
      setSuccessMsg('Employee shift assignment ended/cancelled successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAssignDeptShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDept(true);
    setDeptError(null);

    const targetShift = shifts.find((s) => s.id === deptShiftId);
    if (targetShift && !targetShift.timingConfigured) {
      setDeptError('Shift timing is not configured and cannot be assigned.');
      setSavingDept(false);
      return;
    }

    try {
      const resolvedDeptId = isNaN(Number(assignDeptId)) ? assignDeptId : Number(assignDeptId);
      const payload: CreateDepartmentShiftAssignmentInput = {
        departmentId: resolvedDeptId as any,
        shiftId: Number(deptShiftId),
        effectiveFrom: deptFrom,
        effectiveTo: deptTo.trim() || undefined,
        workDaysOfWeek: deptWorkDays.trim() || undefined,
      };

      const res = await apiFetch('/api/department-shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign shift to department');

      const assignedDept = departments.find((d) => String(d.id) === String(assignDeptId) || d.code === String(assignDeptId));
      setSuccessMsg(
        `Shift assigned successfully to ${assignedDept ? `${assignedDept.code} (${assignedDept.name})` : `Department #${assignDeptId}`}!`
      );
      setTimeout(() => setSuccessMsg(null), 3000);
      setShowDeptModal(false);
      await loadData();
    } catch (err: any) {
      setDeptError(err.message);
    } finally {
      setSavingDept(false);
    }
  };

  const handleDeleteDeptAssignment = async (id: number) => {
    if (!window.confirm(`Are you sure you want to end/cancel this department shift assignment (#${id})?`)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/department-shifts/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel department assignment');
      setSuccessMsg('Department shift assignment cancelled successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleInspectSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setInspectLoading(true);
    setInspectResult(null);
    setError(null);
    try {
      const res = await apiFetch(`/api/employees/${inspectEmpId}/schedule?date=${inspectDate}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resolve employee schedule');
      }
      setInspectResult(data.schedule);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInspectLoading(false);
    }
  };

  return (
    <div id="shift-schedule-admin" className="space-y-6 animate-in fade-in duration-200">
      {/* Header with Sub-tabs and Actions — Sky/Blue Module Identity */}
      <div className={`${MT_COLOR_CARDS.sky} flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5`}>
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-sky-100 border border-sky-300 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-sky-700" />
            </div>
            <h2 className="text-base font-bold text-sky-950 tracking-tight">
              Shift Master & Work Schedule Engine
            </h2>
          </div>
          <p className="text-xs text-sky-900/80 mt-1">
            Official 17-shift catalog, multi-segment/overnight rules, date-effective employee and department rosters.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <>
              <button
                type="button"
                id="btn-new-shift"
                onClick={openCreateShiftModal}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Create New Shift
              </button>
              <button
                type="button"
                id="btn-assign-shift"
                onClick={() => setShowAssignModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-sky-50 text-sky-900 border border-sky-300 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-sky-700" />
                Assign to Employee
              </button>
              <button
                type="button"
                id="btn-assign-dept-shift"
                onClick={() => setShowDeptModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-sky-50 text-sky-900 border border-sky-300 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Building className="w-3.5 h-3.5 text-sky-700" />
                Assign to Dept
              </button>
            </>
          )}
          <button
            type="button"
            onClick={loadData}
            title="Reload data"
            className="p-2 bg-white text-sky-800 hover:text-sky-950 hover:bg-sky-100 rounded-lg transition-colors border border-sky-200 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-700' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-center gap-2 text-xs font-medium text-rose-900">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 overflow-x-auto pb-px">
        <button
          type="button"
          id="tab-shifts-catalog"
          onClick={() => setSubTab('shifts')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            subTab === 'shifts'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          Shift Master Catalog ({shifts.length})
        </button>
        <button
          type="button"
          id="tab-shift-assignments"
          onClick={() => setSubTab('assignments')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            subTab === 'assignments'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          Employee Shift Assignments ({assignments.length})
        </button>
        <button
          type="button"
          id="tab-department-shifts"
          onClick={() => setSubTab('departments')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            subTab === 'departments'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          Department Shift Assignments ({deptAssignments.length})
        </button>
        <button
          type="button"
          id="tab-schedule-tester"
          onClick={() => setSubTab('tester')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            subTab === 'tester'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          Daily Schedule Inspector
        </button>
      </div>

      {/* Subtab 1: Shift Master Catalog */}
      {subTab === 'shifts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map((s) => (
            <div
              key={s.id}
              className={`p-5 flex flex-col justify-between transition-all ${
                s.timingConfigured
                  ? `${MT_COLOR_CARDS.sky} hover:border-sky-400`
                  : `${MT_COLOR_CARDS.amber} border-dashed`
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-xs bg-sky-100 text-sky-900 border border-sky-300 px-2.5 py-0.5 rounded-md">
                        {s.shiftCode}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          s.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <h3 className="font-bold text-neutral-900 text-sm mt-1.5">{s.shiftName}</h3>
                  </div>

                  {!s.timingConfigured ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                      Pending Timing
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-200">
                      {s.shiftType || s.category || 'DAY'}
                    </span>
                  )}
                </div>

                <p className="text-xs text-neutral-600 mb-3">{s.description || 'Standard shift schedule'}</p>

                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-neutral-700 mb-3 bg-white/85 p-2.5 rounded-lg border border-sky-200/80">
                  <div>
                    <span className="text-neutral-500">Type: </span>
                    <span className="font-semibold text-neutral-800">{s.shiftType || 'DAY'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Break: </span>
                    <span className="font-semibold text-neutral-800">{s.breakMinutes ?? 0} mins</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Weekly Off: </span>
                    <span className="font-semibold text-neutral-800">{s.weeklyOff || 'Sunday'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Effective: </span>
                    <span className="font-mono text-neutral-800">
                      {formatDate(s.effectiveFrom || '2026-01-01')}
                      {s.effectiveTo ? ` → ${formatDate(s.effectiveTo)}` : ''}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-sky-200/70 pt-3">
                  <span className="text-[11px] font-semibold text-sky-950 block mb-1">
                    Configured Segments ({s.segments?.length || 0}):
                  </span>
                  {s.segments && s.segments.length > 0 ? (
                    s.segments.map((seg, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-white/90 border border-sky-200 text-xs flex items-center justify-between"
                      >
                        <div className="flex items-center gap-1.5 font-mono font-medium text-neutral-800">
                          {seg.crossesMidnight ? (
                            <Moon className="w-3.5 h-3.5 text-indigo-700" />
                          ) : (
                            <Sun className="w-3.5 h-3.5 text-amber-600" />
                          )}
                          <span>
                            {seg.startTime} → {seg.endTime}
                          </span>
                          {seg.crossesMidnight && (
                            <span className="text-[10px] font-sans font-bold px-1 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                              +1 Day
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-sky-900 font-semibold">
                          {seg.durationHours} hrs
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-2.5 rounded-lg bg-amber-50/90 border border-amber-200 text-[11px] text-amber-800 italic">
                      Timings not configured. This shift cannot be assigned until timing is defined.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-sky-200/70">
                <div className="flex items-center justify-between text-xs font-semibold text-sky-950 mb-3">
                  <span>Total Working Hours = {s.totalWorkingHours ?? s.totalScheduledHours ?? 0} hrs/day</span>
                  <span className="text-sky-950 font-mono font-bold">
                    Break = {s.breakMinutes ?? 0} mins
                  </span>
                </div>

                {canEdit && (
                  <div className="flex items-center justify-between gap-1 pt-2 border-t border-sky-200/70 text-xs">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditShift(s)}
                        title="Edit Shift Timings & Info"
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white text-sky-900 hover:bg-sky-100 rounded text-[11px] font-semibold transition-colors cursor-pointer border border-sky-300"
                      >
                        <Edit2 className="w-3 h-3 text-sky-700" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleShiftStatus(s)}
                        title={s.isActive ? 'Deactivate Shift' : 'Activate Shift'}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer border ${
                          s.isActive
                            ? 'text-amber-700 hover:bg-amber-50 border-amber-200'
                            : 'text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                        }`}
                      >
                        <Power className="w-3 h-3" />
                        <span>{s.isActive ? 'Deactivate' : 'Activate'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteShift(s)}
                      title="Delete Shift (Dependency-Safe)"
                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Subtab 2: Employee Shift Assignments */}
      {subTab === 'assignments' && (
        <div className={`${MT_COLOR_CARDS.sky} overflow-hidden`}>
          <div className="p-4 border-b border-sky-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-sky-950">Individual Employee Shift Rosters</h3>
              <p className="text-xs text-sky-900/80">Tier 1 priority in schedule resolution hierarchy with effective date ranges.</p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowAssignModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 text-white rounded-lg text-xs font-semibold hover:bg-sky-800 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Assign Shift
              </button>
            )}
          </div>

          <div className="overflow-x-auto bg-white/95">
            <table className="w-full text-left text-xs text-neutral-700">
              <thead className="bg-sky-50/90 text-sky-950 font-bold border-b border-sky-200">
                <tr>
                  <th className="px-4 py-3">Employee ID</th>
                  <th className="px-4 py-3">Assigned Shift</th>
                  <th className="px-4 py-3">Effective From</th>
                  <th className="px-4 py-3">Effective To</th>
                  <th className="px-4 py-3">Reason / Remarks</th>
                  <th className="px-4 py-3">Status</th>
                  {canEdit && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {assignments.length > 0 ? (
                  assignments.map((a) => {
                    const empObj = employees.find(
                      (e) =>
                        String(e.id) === String(a.employeeId) ||
                        (a.employeeCode && e.employeeCode === a.employeeCode)
                    );
                    const empName = a.employeeName || empObj?.employeeName || empObj?.fullName || `EMP #${a.employeeId}`;
                    const empCode = a.employeeCode || empObj?.employeeCode || String(a.employeeId);
                    return (
                    <tr key={a.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-semibold text-neutral-900">
                        <div>
                          <Employee360Link
                            employeeId={a.employeeId}
                            employeeCode={empCode}
                            employeeName={empName}
                          >
                            {empName}
                          </Employee360Link>
                        </div>
                        <div className="mt-0.5">
                          <Employee360Link
                            employeeId={a.employeeId}
                            employeeCode={empCode}
                            employeeName={empName}
                            variant="badge"
                          >
                            {empCode}
                          </Employee360Link>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-neutral-900 block">
                          {a.shiftName || a.shiftCode || `Shift #${a.shiftId}`}
                        </span>
                        <span className="text-[11px] font-mono text-neutral-500">
                          {a.shiftCode}{' '}
                          {(a.shift?.totalWorkingHours ?? a.totalScheduledHours)
                            ? `(Total Working Hours = ${a.shift?.totalWorkingHours ?? a.totalScheduledHours} hrs/day; Break = ${a.shift?.breakMinutes ?? 0} mins)`
                            : ''}
                        </span>
                        {a.customSegments && a.customSegments.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {a.customSegments.map((seg, idx) => (
                              <span
                                key={idx}
                                className="inline-block mr-1 px-1.5 py-0.5 rounded bg-red-50 text-red-800 border border-red-200 font-mono text-[10px]"
                              >
                                Seg {idx + 1}: {seg.startTime}–{seg.endTime} ({seg.durationHours}h)
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">{formatDate(a.effectiveFrom)}</td>
                      <td className="px-4 py-3 font-mono">
                        {a.effectiveTo ? formatDate(a.effectiveTo) : <span className="text-neutral-500">Open-ended</span>}
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        <div>{a.assignmentReason || 'Standard'}</div>
                        {a.remarks && <div className="text-[11px] text-neutral-500 italic">{a.remarks}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                            a.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-neutral-100 text-neutral-500'
                          }`}
                        >
                          {a.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditAssignment(a)}
                              title="Edit Assignment"
                              className="p-1 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAssignment(a.id)}
                              title="End / Cancel Assignment"
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                      No custom employee shift assignments defined yet. All employees use the default company schedule.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Department Shift Assignments */}
      {subTab === 'departments' && (
        <div className={`${MT_COLOR_CARDS.indigo} overflow-hidden`}>
          <div className="p-4 border-b border-indigo-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-indigo-950">Department Shift Rosters</h3>
              <p className="text-xs text-indigo-900/80">Tier 2 priority in schedule resolution hierarchy applied across all department members.</p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowDeptModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 text-white rounded-lg text-xs font-semibold hover:bg-indigo-800 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Assign to Dept
              </button>
            )}
          </div>

          <div className="overflow-x-auto bg-white/95">
            <table className="w-full text-left text-xs text-neutral-700">
              <thead className="bg-indigo-50/90 text-indigo-950 font-bold border-b border-indigo-200">
                <tr>
                  <th className="px-4 py-3">Department ID</th>
                  <th className="px-4 py-3">Assigned Shift</th>
                  <th className="px-4 py-3">Effective From</th>
                  <th className="px-4 py-3">Effective To</th>
                  <th className="px-4 py-3">Status</th>
                  {canEdit && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {deptAssignments.length > 0 ? (
                  deptAssignments.map((da) => {
                    const deptObj = departments.find(
                      (d) =>
                        String(d.id) === String(da.departmentId) ||
                        (da.departmentCode && d.code === da.departmentCode)
                    );
                    const deptCode = da.departmentCode || deptObj?.code || `DEPT #${da.departmentId}`;
                    const deptName = da.departmentName || deptObj?.name || '';
                    return (
                    <tr key={da.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-semibold text-neutral-900">
                        <div>{deptName || deptCode}</div>
                        {deptName && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200 font-mono text-[10px]">
                            {deptCode}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-neutral-900 block">
                          {da.shiftName || da.shiftCode || `Shift #${da.shiftId}`}
                        </span>
                        <span className="text-[11px] font-mono text-neutral-500">
                          {da.shiftCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">{formatDate(da.effectiveFrom)}</td>
                      <td className="px-4 py-3 font-mono">
                        {da.effectiveTo ? formatDate(da.effectiveTo) : <span className="text-neutral-500">Open-ended</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                            da.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-neutral-100 text-neutral-500'
                          }`}
                        >
                          {da.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteDeptAssignment(da.id)}
                            title="End / Cancel Department Assignment"
                            className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                      No department shift assignments defined yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Daily Schedule Inspector */}
      {subTab === 'tester' && (
        <div className={`${MT_COLOR_CARDS.teal} p-6 max-w-2xl`}>
          <h3 className="text-sm font-bold text-teal-950 mb-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-700" />
            Inspect Resolved Daily Schedule
          </h3>
          <p className="text-xs text-teal-900/80 mb-4">
            Test the live schedule resolver against the 3-tier hierarchy: Employee Specific Shift → Department Shift → Default Organization Timing, interacting with Weekly-Off and Holidays.
          </p>

          <form onSubmit={handleInspectSchedule} className="flex flex-wrap items-end gap-3 mb-6">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Employee</label>
              <div className="flex items-center gap-1.5">
                {employees.length > 0 ? (
                  <select
                    value={inspectEmpId}
                    onChange={(e) => setInspectEmpId(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-neutral-300 text-xs bg-white"
                    required
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employeeCode} — {emp.employeeName || emp.fullName} — {emp.departmentName || 'General'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={inspectEmpId}
                    onChange={(e) => setInspectEmpId(e.target.value)}
                    className="w-32 px-3 py-2 rounded-lg border border-neutral-300 text-xs"
                    required
                  />
                )}
                {inspectEmpId && (
                  <Employee360Link
                    employeeId={inspectEmpId}
                    variant="button"
                    showIcon
                  >
                    360°
                  </Employee360Link>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Date</label>
              <input
                type="date"
                value={inspectDate}
                onChange={(e) => setInspectDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-neutral-300 text-xs"
                required
              />
            </div>
            <button
              type="submit"
              disabled={inspectLoading}
              className="px-4 py-2 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 disabled:opacity-50 cursor-pointer"
            >
              {inspectLoading ? 'Resolving...' : 'Resolve Schedule'}
            </button>
          </form>

          {inspectResult && (
            <div
              className={`p-4 rounded-xl space-y-3 text-xs ${
                inspectResult.isWorkingDay
                  ? SCHEDULE_CATEGORY_STYLES.WORKING_DAY.containerClass
                  : inspectResult.isHoliday
                  ? SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY.containerClass
                  : SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.containerClass
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200/70">
                <span className="font-bold text-neutral-900">
                  Business Date: {formatDate(inspectResult.date)}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    inspectResult.isWorkingDay
                      ? SCHEDULE_CATEGORY_STYLES.WORKING_DAY.badgeClass
                      : inspectResult.isHoliday
                      ? SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY.badgeClass
                      : SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.badgeClass
                  }`}
                >
                  {inspectResult.isWorkingDay
                    ? 'WORKING DAY'
                    : inspectResult.isHoliday
                    ? 'HOLIDAY'
                    : 'WEEKLY OFF'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-neutral-700">
                <div>
                  <span className="text-neutral-500 block text-[10px]">Resolved Source:</span>
                  <span className="font-semibold text-neutral-900 font-mono">
                    {inspectResult.scheduleSource}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Active Shift:</span>
                  <span className="font-semibold text-neutral-900">
                    {inspectResult.shiftCode || 'None'} ({inspectResult.shiftName || 'Standard'})
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Weekly Off:</span>
                  <span className="font-semibold">
                    {inspectResult.isWeeklyOff ? 'YES (Weekly-Off Applied)' : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Holiday / Closure:</span>
                  <span className="font-semibold">
                    {inspectResult.isHoliday
                      ? `YES (${inspectResult.holidayName || 'Holiday'})`
                      : 'No'}
                  </span>
                </div>
              </div>

              {inspectResult.segments && inspectResult.segments.length > 0 && (
                <div className="pt-2 border-t border-neutral-200">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">
                    Scheduled Segments:
                  </span>
                  <div className="space-y-1">
                    {inspectResult.segments.map((seg, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-white p-2 rounded border border-neutral-200 font-mono text-[11px]"
                      >
                        <span>
                          {seg.startTime} → {seg.endTime} {seg.crossesMidnight ? '(Crosses Midnight)' : ''}
                        </span>
                        <span className="text-neutral-500">{seg.durationHours} hrs</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold text-neutral-900 pt-2 text-[11px]">
                    <span>
                      Total Working Hours = {inspectResult.totalWorkingHours ?? inspectResult.totalScheduledHours} hrs/day
                    </span>
                    <span>
                      Break ={' '}
                      {inspectResult.breakMinutes ??
                        inspectResult.segments.reduce((acc, s) => acc + (s.breakMinutes || 0), 0)}{' '}
                      mins
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Create New Shift */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-neutral-200 overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-neutral-200 flex justify-between items-center bg-neutral-50/50">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Create New Shift</h3>
                <p className="text-[11px] text-neutral-500">
                  Define shift code, type (DAY / NIGHT / SPLIT), timings, working hours, break minutes, weekly off, and effective dates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowShiftModal(false)}
                className="text-neutral-500 hover:text-neutral-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShift} className="p-5 space-y-4 text-xs overflow-y-auto">
              {shiftError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{shiftError}</span>
                </div>
              )}

              {/* Row 1: Shift Name, Shift Code, Shift Type */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Shift Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Morning Operations Shift"
                    value={shiftName}
                    onChange={(e) => setShiftName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Shift Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GN-5, NGN-6, SPL-1"
                    value={shiftCode}
                    onChange={(e) => setShiftCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Shift Type *</label>
                  <select
                    value={shiftType}
                    onChange={(e) => handleShiftTypeChange(e.target.value as ShiftType)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white font-semibold"
                  >
                    <option value="DAY">DAY</option>
                    <option value="NIGHT">NIGHT</option>
                    <option value="SPLIT">SPLIT</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Start Time, End Time, Break/Lunch Minutes, Total Working Hours */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Start Time *</label>
                  <input
                    type="text"
                    required
                    placeholder="08:30"
                    value={shiftStartTime}
                    onChange={(e) => handlePrimaryTimingChange('startTime', e.target.value)}
                    disabled={shiftType === 'SPLIT' && segments.length > 1}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono disabled:bg-neutral-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">End Time *</label>
                  <input
                    type="text"
                    required
                    placeholder="17:30"
                    value={shiftEndTime}
                    onChange={(e) => handlePrimaryTimingChange('endTime', e.target.value)}
                    disabled={shiftType === 'SPLIT' && segments.length > 1}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono disabled:bg-neutral-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Break/Lunch Minutes</label>
                  <input
                    type="number"
                    min={0}
                    value={shiftBreakMinutes}
                    onChange={(e) => handlePrimaryTimingChange('breakMinutes', Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Total Working Hours</label>
                  <input
                    type="number"
                    step="0.25"
                    min={0.5}
                    value={shiftTotalWorkingHours}
                    onChange={(e) => {
                      setCreateHoursManuallyEdited(true);
                      setShiftTotalWorkingHours(Number(e.target.value));
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono font-semibold"
                  />
                </div>
              </div>

              {/* Row 3: Weekly Off, Active/Inactive, Effective From, Effective To */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Weekly Off</label>
                  <select
                    value={shiftWeeklyOff}
                    onChange={(e) => setShiftWeeklyOff(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white"
                  >
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                    <option value="Saturday, Sunday">Saturday & Sunday</option>
                    <option value="None">None</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Status</label>
                  <select
                    value={shiftIsActive ? 'ACTIVE' : 'INACTIVE'}
                    onChange={(e) => setShiftIsActive(e.target.value === 'ACTIVE')}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white font-semibold"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Effective From *</label>
                  <input
                    type="date"
                    required
                    value={shiftEffectiveFrom}
                    onChange={(e) => setShiftEffectiveFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Effective To</label>
                  <input
                    type="date"
                    value={shiftEffectiveTo}
                    onChange={(e) => setShiftEffectiveTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
              </div>

              {/* Row 4: Description */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Optional operational notes or shift details"
                  value={shiftDesc}
                  onChange={(e) => setShiftDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                />
              </div>

              {/* Working Segments Section (Multi-segment for SPLIT shifts & overnight control) */}
              <div className="pt-2 border-t border-neutral-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-neutral-900">
                    Working Segments ({segments.length}){shiftType === 'SPLIT' ? ' — Multiple Split Segments' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={handleAddSegment}
                    className="text-neutral-900 font-semibold text-[11px] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Segment
                  </button>
                </div>

                <div className="space-y-3">
                  {segments.map((seg, idx) => (
                    <div key={idx} className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-neutral-700">Segment {idx + 1}</span>
                        {segments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSegment(idx)}
                            className="text-rose-600 hover:text-rose-800 text-[11px] cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-neutral-500">Start (HH:mm)</label>
                          <input
                            type="text"
                            required
                            placeholder="08:30"
                            value={seg.startTime}
                            onChange={(e) => handleSegmentChange(idx, 'startTime', e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-neutral-300 font-mono text-center bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-neutral-500">End (HH:mm)</label>
                          <input
                            type="text"
                            required
                            placeholder="17:30"
                            value={seg.endTime}
                            onChange={(e) => handleSegmentChange(idx, 'endTime', e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-neutral-300 font-mono text-center bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-neutral-500">Break (mins)</label>
                          <input
                            type="number"
                            min={0}
                            value={seg.breakMinutes}
                            onChange={(e) => handleSegmentChange(idx, 'breakMinutes', Number(e.target.value))}
                            className="w-full px-2 py-1.5 rounded border border-neutral-300 text-center bg-white"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 pt-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={seg.crossesMidnight}
                          onChange={(e) => handleSegmentChange(idx, 'crossesMidnight', e.target.checked)}
                          className="rounded text-neutral-900 border-neutral-300 focus:ring-red-700/20 focus:border-red-700"
                        />
                        <span className="text-[11px] text-neutral-700 font-medium">
                          Crosses Midnight (+1 Day Next Morning)
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 font-semibold hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingShift}
                  className="px-4 py-2 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 disabled:opacity-50 cursor-pointer"
                >
                  {savingShift ? 'Saving...' : 'Create Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Shift */}
      {editingShift && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-neutral-200 overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-neutral-200 flex justify-between items-center bg-neutral-50/50">
              <h3 className="text-sm font-bold text-neutral-900">
                Edit Shift: {editingShift.shiftCode}
              </h3>
              <button
                type="button"
                onClick={() => setEditingShift(null)}
                className="text-neutral-500 hover:text-neutral-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateShift} className="p-5 space-y-4 text-xs overflow-y-auto">
              {editShiftError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{editShiftError}</span>
                </div>
              )}

              {/* Row 1: Shift Name, Shift Code, Shift Type */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Shift Name *</label>
                  <input
                    type="text"
                    required
                    value={editShiftName}
                    onChange={(e) => setEditShiftName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Shift Code *</label>
                  <input
                    type="text"
                    required
                    value={editShiftCode}
                    onChange={(e) => setEditShiftCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Shift Type *</label>
                  <select
                    value={editShiftType}
                    onChange={(e) => {
                      const nextType = e.target.value as ShiftType;
                      setEditShiftType(nextType);
                      if (nextType === 'NIGHT' && editSegments.length === 1) {
                        const updated = [{ ...editSegments[0], crossesMidnight: true }];
                        setEditSegments(updated);
                        recalculateEditSegmentsSummary(updated);
                      } else if (nextType === 'SPLIT' && editSegments.length < 2) {
                        const updated = [
                          ...editSegments,
                          {
                            segmentSequence: editSegments.length + 1,
                            startTime: '17:00',
                            endTime: '21:00',
                            crossesMidnight: false,
                            breakMinutes: 0,
                          },
                        ];
                        setEditSegments(updated);
                        recalculateEditSegmentsSummary(updated);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white font-semibold"
                  >
                    <option value="DAY">DAY</option>
                    <option value="NIGHT">NIGHT</option>
                    <option value="SPLIT">SPLIT</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Start Time, End Time, Break Minutes, Total Working Hours */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Start Time *</label>
                  <input
                    type="text"
                    required
                    value={editShiftStartTime}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditShiftStartTime(val);
                      if (editSegments.length === 1) {
                        const updated = [{ ...editSegments[0], startTime: val }];
                        setEditSegments(updated);
                        recalculateEditSegmentsSummary(updated);
                      }
                    }}
                    disabled={editShiftType === 'SPLIT' && editSegments.length > 1}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono disabled:bg-neutral-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">End Time *</label>
                  <input
                    type="text"
                    required
                    value={editShiftEndTime}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditShiftEndTime(val);
                      if (editSegments.length === 1) {
                        const updated = [{ ...editSegments[0], endTime: val }];
                        setEditSegments(updated);
                        recalculateEditSegmentsSummary(updated);
                      }
                    }}
                    disabled={editShiftType === 'SPLIT' && editSegments.length > 1}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono disabled:bg-neutral-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Break/Lunch Minutes</label>
                  <input
                    type="number"
                    min={0}
                    value={editShiftBreakMinutes}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setEditShiftBreakMinutes(val);
                      if (editSegments.length === 1) {
                        const updated = [{ ...editSegments[0], breakMinutes: val }];
                        setEditSegments(updated);
                        // Do NOT subtract breakMinutes from editShiftTotalWorkingHours
                        recalculateEditSegmentsSummary(updated, { skipTotalHoursUpdate: true });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Total Working Hours</label>
                  <input
                    type="number"
                    step="0.25"
                    min={0.5}
                    value={editShiftTotalWorkingHours}
                    onChange={(e) => {
                      setEditHoursManuallyEdited(true);
                      setEditShiftTotalWorkingHours(Number(e.target.value));
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono font-semibold"
                  />
                </div>
              </div>

              {/* Row 3: Weekly Off, Status, Effective From, Effective To */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Weekly Off</label>
                  <select
                    value={editShiftWeeklyOff}
                    onChange={(e) => setEditShiftWeeklyOff(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white"
                  >
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                    <option value="Saturday, Sunday">Saturday & Sunday</option>
                    <option value="None">None</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Status</label>
                  <select
                    value={editShiftIsActive ? 'ACTIVE' : 'INACTIVE'}
                    onChange={(e) => setEditShiftIsActive(e.target.value === 'ACTIVE')}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white font-semibold"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Effective From</label>
                  <input
                    type="date"
                    value={editShiftEffectiveFrom}
                    onChange={(e) => setEditShiftEffectiveFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Effective To</label>
                  <input
                    type="date"
                    value={editShiftEffectiveTo}
                    onChange={(e) => setEditShiftEffectiveTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Description</label>
                <input
                  type="text"
                  value={editShiftDesc}
                  onChange={(e) => setEditShiftDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                />
              </div>

              <div className="pt-2 border-t border-neutral-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-neutral-900">Timing Segments ({editSegments.length})</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditSegments((prev) => {
                        const updated = [
                          ...prev,
                          {
                            segmentSequence: prev.length + 1,
                            startTime: '18:00',
                            endTime: '22:00',
                            crossesMidnight: false,
                            breakMinutes: 0,
                          },
                        ];
                        if (updated.length > 1 && editShiftType !== 'SPLIT') {
                          setEditShiftType('SPLIT');
                        }
                        recalculateEditSegmentsSummary(updated);
                        return updated;
                      })
                    }
                    className="text-neutral-900 font-semibold text-[11px] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Segment
                  </button>
                </div>

                <div className="space-y-3">
                  {editSegments.map((seg, idx) => (
                    <div key={idx} className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-neutral-700">Segment {idx + 1}</span>
                        {editSegments.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditSegments((prev) => {
                                const updated = prev
                                  .filter((_, i) => i !== idx)
                                  .map((s, i) => ({ ...s, segmentSequence: i + 1 }));
                                recalculateEditSegmentsSummary(updated);
                                return updated;
                              })
                            }
                            className="text-rose-600 hover:text-rose-800 text-[11px] cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-neutral-500">Start (HH:mm)</label>
                          <input
                            type="text"
                            required
                            placeholder="08:30"
                            value={seg.startTime}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditSegments((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], startTime: val };
                                recalculateEditSegmentsSummary(copy);
                                return copy;
                              });
                            }}
                            className="w-full px-2 py-1.5 rounded border border-neutral-300 font-mono text-center bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-neutral-500">End (HH:mm)</label>
                          <input
                            type="text"
                            required
                            placeholder="17:30"
                            value={seg.endTime}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditSegments((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], endTime: val };
                                recalculateEditSegmentsSummary(copy);
                                return copy;
                              });
                            }}
                            className="w-full px-2 py-1.5 rounded border border-neutral-300 font-mono text-center bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-neutral-500">Break (mins)</label>
                          <input
                            type="number"
                            min={0}
                            value={seg.breakMinutes}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setEditSegments((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], breakMinutes: val };
                                recalculateEditSegmentsSummary(copy, {
                                  skipTotalHoursUpdate: true,
                                  fromSegmentBreakChange: true,
                                });
                                return copy;
                              });
                            }}
                            className="w-full px-2 py-1.5 rounded border border-neutral-300 text-center bg-white"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 pt-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={seg.crossesMidnight}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setEditSegments((prev) => {
                              const copy = [...prev];
                              copy[idx] = { ...copy[idx], crossesMidnight: val };
                              recalculateEditSegmentsSummary(copy);
                              return copy;
                            });
                          }}
                          className="rounded text-neutral-900 border-neutral-300 focus:ring-red-700/20 focus:border-red-700"
                        />
                        <span className="text-[11px] text-neutral-700 font-medium">
                          Crosses Midnight (+1 Day Next Morning)
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingShift(null)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 font-semibold hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingShift}
                  className="px-4 py-2 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 disabled:opacity-50 cursor-pointer"
                >
                  {updatingShift ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Shift */}
      {confirmDeleteShift && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-neutral-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 flex justify-between items-center bg-neutral-50/50">
              <h3 className="text-sm font-bold text-neutral-900">
                Delete Shift: {confirmDeleteShift.shiftCode}
              </h3>
              <button
                type="button"
                onClick={() => setConfirmDeleteShift(null)}
                className="text-neutral-500 hover:text-neutral-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              {deleteShiftError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{deleteShiftError}</span>
                </div>
              )}
              <p className="text-neutral-700">
                Are you sure you want to delete shift{' '}
                <span className="font-bold text-neutral-900">
                  {confirmDeleteShift.shiftCode} ({confirmDeleteShift.shiftName})
                </span>
                ? Deletion is blocked if the shift has any active or historical employee or department assignments.
              </p>
              <div className="pt-3 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteShift(null)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 font-semibold hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingShift}
                  onClick={executeConfirmDeleteShift}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                >
                  {deletingShift ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Assign Shift to Employee */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-neutral-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 flex justify-between items-center bg-neutral-50/50">
              <h3 className="text-sm font-bold text-neutral-900">Assign Shift to Employee</h3>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="text-neutral-500 hover:text-neutral-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAssignShift} className="p-5 space-y-4 text-xs">
              {assignError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{assignError}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Employee *</label>
                {employees.length > 0 ? (
                  <select
                    required
                    value={assignEmpId}
                    onChange={(e) => setAssignEmpId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employeeCode} — {emp.employeeName || emp.fullName} — {emp.departmentName || 'General'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={assignEmpId}
                    onChange={(e) => setAssignEmpId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                )}
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Select Shift *</label>
                <select
                  value={assignShiftId}
                  onChange={(e) => setAssignShiftId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white"
                >
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id} disabled={!s.timingConfigured && !useCustomSegments}>
                      {s.shiftCode} - {s.shiftName}{' '}
                      {!s.timingConfigured
                        ? '⚠️ [CUSTOM SEGMENTS REQUIRED]'
                        : `(${s.totalWorkingHours ?? s.totalScheduledHours} hrs/day)`}
                    </option>
                  ))}
                </select>
                {shifts.find((s) => s.id === assignShiftId)?.timingConfigured === false && !useCustomSegments && (
                  <p className="text-[11px] text-rose-600 font-medium mt-1">
                    Shift timing is not configured. Enable Custom Work Segments below or configure the shift first.
                  </p>
                )}
              </div>

              {/* Custom Multi-Segment Work Schedule Option */}
              <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-semibold text-neutral-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomSegments}
                      onChange={(e) => setUseCustomSegments(e.target.checked)}
                      className="rounded text-neutral-900"
                    />
                    <span>Configure Split / Multiple Work Segments</span>
                  </label>
                  {useCustomSegments && (
                    <button
                      type="button"
                      onClick={() =>
                        setAssignCustomSegments([
                          { startTime: '05:30', endTime: '08:30', crossesMidnight: false, breakMinutes: 0 },
                          { startTime: '19:00', endTime: '21:00', crossesMidnight: false, breakMinutes: 0 },
                        ])
                      }
                      className="text-[10px] font-semibold px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded cursor-pointer"
                    >
                      Preset: 05:30–08:30 & 19:00–21:00
                    </button>
                  )}
                </div>

                {useCustomSegments && (
                  <div className="space-y-2 pt-1">
                    {assignCustomSegments.map((seg, idx) => (
                      <div key={idx} className="grid grid-cols-3 gap-2 items-center bg-white p-2 rounded border border-neutral-200">
                        <div>
                          <label className="block text-[10px] text-neutral-500">Seg {idx + 1} Start</label>
                          <input
                            type="text"
                            value={seg.startTime}
                            onChange={(e) => {
                              const copy = [...assignCustomSegments];
                              copy[idx] = { ...copy[idx], startTime: e.target.value };
                              setAssignCustomSegments(copy);
                            }}
                            placeholder="05:30"
                            className="w-full px-2 py-1 border border-neutral-300 rounded font-mono text-center"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-neutral-500">Seg {idx + 1} End</label>
                          <input
                            type="text"
                            value={seg.endTime}
                            onChange={(e) => {
                              const copy = [...assignCustomSegments];
                              copy[idx] = { ...copy[idx], endTime: e.target.value };
                              setAssignCustomSegments(copy);
                            }}
                            placeholder="08:30"
                            className="w-full px-2 py-1 border border-neutral-300 rounded font-mono text-center"
                          />
                        </div>
                        <div className="flex items-end justify-end h-full pb-1">
                          {assignCustomSegments.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setAssignCustomSegments(assignCustomSegments.filter((_, i) => i !== idx))
                              }
                              className="text-rose-600 hover:text-rose-800 text-[11px] font-medium cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setAssignCustomSegments([
                          ...assignCustomSegments,
                          { startTime: '19:00', endTime: '21:00', crossesMidnight: false, breakMinutes: 0 },
                        ])
                      }
                      className="text-[11px] font-semibold text-neutral-900 hover:underline cursor-pointer"
                    >
                      + Add Work Segment
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Assignment Reason *</label>
                  <select
                    value={assignmentReason}
                    onChange={(e) => setAssignmentReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white"
                  >
                    <option value="DEPARTMENT_REQUIREMENT">Department Requirement</option>
                    <option value="PROJECT_ALLOCATION">Project Allocation</option>
                    <option value="ROSTER_ROTATION">Roster Rotation</option>
                    <option value="EMPLOYEE_REQUEST">Employee Request</option>
                    <option value="OPERATIONAL_NEED">Operational Need</option>
                    <option value="BUSINESS_REQUIREMENT">Business Requirement</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Remarks</label>
                  <input
                    type="text"
                    placeholder="e.g. Approved Q4 Rotation"
                    value={assignRemarks}
                    onChange={(e) => setAssignRemarks(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Effective From *</label>
                  <input
                    type="date"
                    required
                    value={assignFrom}
                    onChange={(e) => setAssignFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Effective To</label>
                  <input
                    type="date"
                    value={assignTo}
                    onChange={(e) => setAssignTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                  <span className="text-[10px] text-neutral-500">Leave blank for indefinite</span>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 font-semibold hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAssign}
                  className="px-4 py-2 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 disabled:opacity-50 cursor-pointer"
                >
                  {savingAssign ? 'Saving...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Employee Shift Assignment */}
      {editingAssignment && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-neutral-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 flex justify-between items-center bg-neutral-50/50">
              <h3 className="text-sm font-bold text-neutral-900">
                Edit Assignment: {editingAssignment.employeeCode || `EMP #${editingAssignment.employeeId}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingAssignment(null)}
                className="text-neutral-500 hover:text-neutral-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateAssignment} className="p-5 space-y-4 text-xs">
              {editAssignError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{editAssignError}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Assigned Shift *</label>
                <select
                  value={editAssignShiftId}
                  onChange={(e) => setEditAssignShiftId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white"
                >
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id} disabled={!s.timingConfigured}>
                      {s.shiftCode} - {s.shiftName}{' '}
                      {!s.timingConfigured
                        ? '⚠️ [UNCONFIGURED]'
                        : `(${s.totalWorkingHours ?? s.totalScheduledHours} hrs/day)`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Effective From *</label>
                  <input
                    type="date"
                    required
                    value={editAssignFrom}
                    onChange={(e) => setEditAssignFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Effective To</label>
                  <input
                    type="date"
                    value={editAssignTo}
                    onChange={(e) => setEditAssignTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Reason</label>
                  <select
                    value={editAssignReason}
                    onChange={(e) => setEditAssignReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white"
                  >
                    <option value="DEPARTMENT_REQUIREMENT">Department Requirement</option>
                    <option value="PROJECT_ALLOCATION">Project Allocation</option>
                    <option value="ROSTER_ROTATION">Roster Rotation</option>
                    <option value="EMPLOYEE_REQUEST">Employee Request</option>
                    <option value="OPERATIONAL_NEED">Operational Need</option>
                    <option value="BUSINESS_REQUIREMENT">Business Requirement</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Remarks</label>
                  <input
                    type="text"
                    value={editAssignRemarks}
                    onChange={(e) => setEditAssignRemarks(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAssignment(null)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 font-semibold hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingAssign}
                  className="px-4 py-2 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 disabled:opacity-50 cursor-pointer"
                >
                  {updatingAssign ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Assign Shift to Department */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-neutral-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 flex justify-between items-center bg-neutral-50/50">
              <h3 className="text-sm font-bold text-neutral-900">Assign Shift to Department</h3>
              <button
                type="button"
                onClick={() => setShowDeptModal(false)}
                className="text-neutral-500 hover:text-neutral-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAssignDeptShift} className="p-5 space-y-4 text-xs">
              {deptError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{deptError}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Department *</label>
                {departments.length > 0 ? (
                  <select
                    required
                    value={assignDeptId}
                    onChange={(e) => setAssignDeptId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={assignDeptId}
                    onChange={(e) => setAssignDeptId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                )}
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Select Shift *</label>
                <select
                  value={deptShiftId}
                  onChange={(e) => setDeptShiftId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white"
                >
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id} disabled={!s.timingConfigured}>
                      {s.shiftCode} - {s.shiftName}{' '}
                      {!s.timingConfigured
                        ? '⚠️ [UNCONFIGURED - TIMING NOT SET]'
                        : `(${s.totalWorkingHours ?? s.totalScheduledHours} hrs/day)`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Effective From *</label>
                  <input
                    type="date"
                    required
                    value={deptFrom}
                    onChange={(e) => setDeptFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Effective To</label>
                  <input
                    type="date"
                    value={deptTo}
                    onChange={(e) => setDeptTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300"
                  />
                  <span className="text-[10px] text-neutral-500">Leave blank for indefinite</span>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 font-semibold hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDept}
                  className="px-4 py-2 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 disabled:opacity-50 cursor-pointer"
                >
                  {savingDept ? 'Saving...' : 'Confirm Department Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
