import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  User,
  Users,
} from 'lucide-react';
import { EmployeeDto } from '../../types/leave.ts';
import { getActiveRole, apiFetch } from '../../lib/api.ts';
import { Employee360Link } from '../Employee360Trigger.tsx';
import { formatDate } from '../../utils/dateFormat.ts';
import { SCHEDULE_CATEGORY_STYLES } from '../../utils/theme.ts';

interface DayScheduleConfig {
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  dayName: string;
  isWorkingDay: boolean;
  startTime: string;
  endTime: string;
  officeStartTime?: string;
  officeEndTime?: string;
  graceMinutes: number;
}

const DAY_NAMES_BY_INDEX = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function normalizeDayScheduleConfig(item: any, idxFallback = 0): DayScheduleConfig {
  const dayOfWeek = typeof item?.dayOfWeek === 'number' ? item.dayOfWeek : idxFallback;
  const start = item?.startTime || item?.officeStartTime || '08:30';
  const end = item?.endTime || item?.officeEndTime || '17:30';
  const grace =
    typeof item?.graceMinutes === 'number' && !isNaN(item.graceMinutes)
      ? item.graceMinutes
      : Number(item?.graceMinutes ?? 15) || 0;
  return {
    dayOfWeek,
    dayName: item?.dayName || DAY_NAMES_BY_INDEX[dayOfWeek] || `Day ${dayOfWeek}`,
    isWorkingDay: typeof item?.isWorkingDay === 'boolean' ? item.isWorkingDay : dayOfWeek !== 0,
    startTime: String(start),
    endTime: String(end),
    officeStartTime: String(start),
    officeEndTime: String(end),
    graceMinutes: grace,
  };
}

const DEFAULT_WEEK: DayScheduleConfig[] = [
  { dayOfWeek: 1, dayName: 'Monday', isWorkingDay: true, startTime: '08:30', endTime: '17:30', officeStartTime: '08:30', officeEndTime: '17:30', graceMinutes: 15 },
  { dayOfWeek: 2, dayName: 'Tuesday', isWorkingDay: true, startTime: '08:30', endTime: '17:30', officeStartTime: '08:30', officeEndTime: '17:30', graceMinutes: 15 },
  { dayOfWeek: 3, dayName: 'Wednesday', isWorkingDay: true, startTime: '08:30', endTime: '17:30', officeStartTime: '08:30', officeEndTime: '17:30', graceMinutes: 15 },
  { dayOfWeek: 4, dayName: 'Thursday', isWorkingDay: true, startTime: '08:30', endTime: '17:30', officeStartTime: '08:30', officeEndTime: '17:30', graceMinutes: 15 },
  { dayOfWeek: 5, dayName: 'Friday', isWorkingDay: true, startTime: '08:30', endTime: '17:30', officeStartTime: '08:30', officeEndTime: '17:30', graceMinutes: 15 },
  { dayOfWeek: 6, dayName: 'Saturday', isWorkingDay: true, startTime: '08:30', endTime: '17:30', officeStartTime: '08:30', officeEndTime: '17:30', graceMinutes: 15 },
  { dayOfWeek: 0, dayName: 'Sunday', isWorkingDay: false, startTime: '08:30', endTime: '17:30', officeStartTime: '08:30', officeEndTime: '17:30', graceMinutes: 15 },
];

export function WorkingDaysAdmin({
  initialSubTab = 'all',
}: {
  initialSubTab?: 'working-days' | 'weekly-off' | 'all';
} = {}) {
  const [activeTab, setActiveTab] = useState<'working-days' | 'weekly-off' | 'all'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [schedule, setSchedule] = useState<DayScheduleConfig[]>(DEFAULT_WEEK);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [weeklyOffAssignments, setWeeklyOffAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Employee Weekly-Off Assignment Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [confirmDeleteAssignId, setConfirmDeleteAssignId] = useState<number | null>(null);
  const [deletingAssign, setDeletingAssign] = useState(false);
  const [assignEmpId, setAssignEmpId] = useState<number | string>('');
  const [selectedDays, setSelectedDays] = useState<number[]>([0]); // default Sunday
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [effectiveTo, setEffectiveTo] = useState('');
  const [assignRemarks, setAssignRemarks] = useState('');
  const [assigning, setAssigning] = useState(false);

  const activeRole = getActiveRole();
  const canManage = activeRole === 'SUPER_ADMIN' || activeRole === 'HR';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [schedRes, empRes, offRes] = await Promise.all([
        apiFetch('/api/working-days/schedule'),
        apiFetch('/api/employees'),
        apiFetch('/api/weekly-off/assignments'),
      ]);

      if (schedRes.ok) {
        const schedData = await schedRes.json();
        if (Array.isArray(schedData.schedule) && schedData.schedule.length > 0) {
          setSchedule(schedData.schedule.map((item: any, idx: number) => normalizeDayScheduleConfig(item, idx)));
        }
      }

      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(empData.employees || []);
        if (empData.employees?.length > 0 && assignEmpId === '') {
          setAssignEmpId(empData.employees[0].id);
        }
      }

      if (offRes.ok) {
        const offData = await offRes.json();
        setWeeklyOffAssignments(offData.assignments || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading working schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDayChange = (index: number, field: keyof DayScheduleConfig, val: any) => {
    setSchedule((prev) => {
      const copy = [...prev];
      const next = { ...copy[index], [field]: val };
      if (field === 'startTime') {
        next.officeStartTime = val;
      } else if (field === 'endTime') {
        next.officeEndTime = val;
      }
      copy[index] = next;
      return copy;
    });
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSavingSchedule(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch('/api/working-days/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update working days schedule');

      setSuccessMsg('Company working days and office timings saved successfully.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  const toggleSelectedDay = (d: number) => {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  };

  const handleAssignWeeklyOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignEmpId) return;
    if (selectedDays.length === 0) {
      setError('Please select at least one weekly off day.');
      return;
    }

    setAssigning(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const resolvedEmpId = isNaN(Number(assignEmpId)) ? assignEmpId : Number(assignEmpId);
      const payload = {
        employeeId: resolvedEmpId,
        weeklyOffDays: selectedDays,
        effectiveFrom,
        effectiveTo: effectiveTo || undefined,
        remarks: assignRemarks || undefined,
      };

      const res = await apiFetch('/api/weekly-off/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign weekly off');

      const emp = employees.find((e) => String(e.id) === String(assignEmpId));
      setSuccessMsg(
        `Weekly off schedule successfully assigned to ${emp?.employeeName || assignEmpId} effective from ${formatDate(effectiveFrom)}.`
      );
      setIsAssignModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleDeleteAssignment = async (id: number) => {
    setError(null);
    setSuccessMsg(null);
    setDeletingAssign(true);

    try {
      const res = await apiFetch(`/api/weekly-off/${id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete assignment');

      setSuccessMsg('Weekly off assignment removed successfully.');
      setConfirmDeleteAssignId(null);
      loadData();
    } catch (err: any) {
      setError(err.message);
      setConfirmDeleteAssignId(null);
    } finally {
      setDeletingAssign(false);
    }
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="rounded-xl border border-slate-300 border-t-[5px] border-t-slate-600 bg-slate-50/85 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <Clock className="w-5 h-5 text-slate-700" />
            <span>Working Days, Office Timing & Employee Weekly-Offs</span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Configure default 7-day Monday–Sunday organization schedule, office operational hours, grace cutoffs, and employee-specific weekly-off overrides with effective dating.
          </p>
        </div>

        {canManage && (
          <button
            id="btn-open-assign-weekly-off"
            onClick={() => {
              setError(null);
              setIsAssignModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Assign Employee Weekly-Off</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 font-medium">{successMsg}</div>
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'all'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          All (Overview)
        </button>
        <button
          type="button"
          id="tab-working-days"
          onClick={() => setActiveTab('working-days')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'working-days'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          7-Day Organization Timings
        </button>
        <button
          type="button"
          id="tab-weekly-off"
          onClick={() => setActiveTab('weekly-off')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'weekly-off'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          Employee Weekly-Off Overrides ({weeklyOffAssignments.length})
        </button>
      </div>

      {/* SECTION 1: 7-DAY ORGANIZATION TIMINGS */}
      {(activeTab === 'all' || activeTab === 'working-days') && (
      <div className="bg-white rounded-xl border border-slate-300 border-t-[5px] border-t-slate-600 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Standard 7-Day Office Timings & Working Days</h3>
            <p className="text-xs text-slate-600 mt-0.5">Default timing for all employees without individual shift or weekly-off assignments.</p>
          </div>
          {canManage && (
            <button
              id="btn-save-working-days-schedule"
              onClick={handleSaveSchedule}
              disabled={savingSchedule}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingSchedule ? 'Saving...' : 'Save Timing Schedule'}</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-neutral-500 font-semibold border-b border-neutral-200/80">
              <tr>
                <th className="py-3 px-4">Day of Week</th>
                <th className="py-3 px-4">Schedule Type</th>
                <th className="py-3 px-4">Office Start Time</th>
                <th className="py-3 px-4">Office End Time</th>
                <th className="py-3 px-4">Grace Period</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {schedule.map((day, idx) => (
                <tr key={day.dayOfWeek} className="hover:bg-neutral-50/80 transition-colors">
                  <td className="py-3 px-4 font-semibold text-neutral-900">{day.dayName}</td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => handleDayChange(idx, 'isWorkingDay', !day.isWorkingDay)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                        day.isWorkingDay
                          ? SCHEDULE_CATEGORY_STYLES.WORKING_DAY.badgeClass
                          : SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.badgeClass
                      }`}
                    >
                      {day.isWorkingDay ? 'Working Day' : 'Weekly Off'}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="time"
                      disabled={!canManage || !day.isWorkingDay}
                      value={day.startTime || day.officeStartTime || '08:30'}
                      onChange={(e) => handleDayChange(idx, 'startTime', e.target.value)}
                      className="px-2.5 py-1 border border-neutral-200 rounded font-mono text-xs focus:outline-none focus:border-red-700 disabled:opacity-40"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="time"
                      disabled={!canManage || !day.isWorkingDay}
                      value={day.endTime || day.officeEndTime || '17:30'}
                      onChange={(e) => handleDayChange(idx, 'endTime', e.target.value)}
                      className="px-2.5 py-1 border border-neutral-200 rounded font-mono text-xs focus:outline-none focus:border-red-700 disabled:opacity-40"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={60}
                        disabled={!canManage || !day.isWorkingDay}
                        value={day.graceMinutes ?? 15}
                        onChange={(e) => handleDayChange(idx, 'graceMinutes', Number(e.target.value))}
                        className="w-16 px-2 py-1 border border-neutral-200 rounded text-xs focus:outline-none focus:border-red-700 disabled:opacity-40"
                      />
                      <span className="text-neutral-500">mins</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-neutral-500">
                    {day.isWorkingDay ? 'Normal business hours' : 'Full-day scheduled off'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* SECTION 2: EMPLOYEE-WISE WEEKLY OFF ASSIGNMENTS */}
      {(activeTab === 'all' || activeTab === 'weekly-off') && (
      <div className="bg-white rounded-xl border border-slate-300 border-t-[5px] border-t-slate-700 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-100/75 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Employee-Specific Weekly-Off Overrides (With Effective Dating)</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Custom weekly-offs assigned directly to employees. Forward & historical dates use the schedule active on the exact leave date.
            </p>
          </div>
          <button
            onClick={loadData}
            title="Refresh"
            className="p-2 border border-neutral-200 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-neutral-500 font-semibold border-b border-neutral-200/80">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Weekly-Off Day(s)</th>
                <th className="py-3 px-4">Effective From</th>
                <th className="py-3 px-4">Effective To</th>
                <th className="py-3 px-4">Remarks</th>
                <th className="py-3 px-4">Status</th>
                {canManage && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {weeklyOffAssignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-neutral-500">
                    No custom employee weekly-off assignments configured yet. Default organization schedule applies.
                  </td>
                </tr>
              ) : (
                weeklyOffAssignments.map((a) => {
                  const emp = employees.find((e) => e.id === a.employeeId);
                  const offDaysDisplay = (a.weeklyOffDays || [])
                    .map((d: number) => dayNames[d])
                    .join(', ');

                  return (
                    <tr key={a.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-neutral-900">
                          <Employee360Link
                            employeeId={a.employeeId}
                            employeeCode={emp?.employeeCode}
                            employeeName={emp?.employeeName || `Employee #${a.employeeId}`}
                          >
                            {emp?.employeeName || `Employee #${a.employeeId}`}
                          </Employee360Link>
                        </div>
                        <div className="mt-0.5">
                          <Employee360Link
                            employeeId={a.employeeId}
                            employeeCode={emp?.employeeCode || String(a.employeeId)}
                            employeeName={emp?.employeeName}
                            variant="badge"
                          >
                            {emp?.employeeCode || `ID: ${a.employeeId}`}
                          </Employee360Link>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-0.5 rounded font-semibold text-[11px] ${SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.badgeClass}`}>
                          {offDaysDisplay || 'Sunday'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-neutral-800">{formatDate(a.effectiveFrom)}</td>
                      <td className="py-3 px-4 font-mono text-neutral-500">{a.effectiveTo ? formatDate(a.effectiveTo) : 'Ongoing'}</td>
                      <td className="py-3 px-4 text-neutral-500">{a.remarks || '—'}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      </td>
                      {canManage && (
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setConfirmDeleteAssignId(a.id)}
                            title="Remove assignment"
                            className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Modal: Assign Employee Weekly-Off */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-neutral-700" />
                <span>Assign Custom Weekly-Off</span>
              </h3>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-neutral-500 hover:text-neutral-600 cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleAssignWeeklyOff} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Target Employee <span className="text-rose-500">*</span>
                </label>
                <select
                  id="select-weekly-off-employee"
                  required
                  value={assignEmpId}
                  onChange={(e) => setAssignEmpId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                >
                  <option value="">Select Employee...</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.employeeCode} — {e.employeeName} — {e.departmentName || 'General'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1.5">
                  Designated Weekly-Off Days <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {dayNames.map((name, idx) => {
                    const isSelected = selectedDays.includes(idx);
                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => toggleSelectedDay(idx)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer text-left transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-red-700 text-white border-red-700'
                            : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                        }`}
                      >
                        <span>{name}</span>
                        {isSelected && <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded">OFF</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Effective From <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-weekly-off-from"
                    type="date"
                    required
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Effective To (Optional)</label>
                  <input
                    id="input-weekly-off-to"
                    type="date"
                    value={effectiveTo}
                    onChange={(e) => setEffectiveTo(e.target.value)}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Remarks</label>
                <input
                  id="input-weekly-off-remarks"
                  type="text"
                  placeholder="e.g. 6-day roster change or medical accommodations"
                  value={assignRemarks}
                  onChange={(e) => setAssignRemarks(e.target.value)}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-3.5 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-employee-weekly-off"
                  type="submit"
                  disabled={assigning}
                  className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer font-medium disabled:opacity-50"
                >
                  {assigning ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Weekly-off Assignment Modal */}
      {confirmDeleteAssignId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Cancel Weekly-Off Override</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Are you sure you want to cancel this weekly-off override assignment?
                </p>
              </div>
            </div>
            <p className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
              The employee will revert to the standard organizational weekly off schedule.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAssignId(null)}
                disabled={deletingAssign}
                className="px-3 py-1.5 border border-neutral-200 text-neutral-700 text-xs rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
              >
                Keep Assignment
              </button>
              <button
                type="button"
                id="btn-confirm-delete-wo"
                onClick={() => handleDeleteAssignment(confirmDeleteAssignId)}
                disabled={deletingAssign}
                className="px-3.5 py-1.5 bg-rose-600 text-white text-xs rounded-lg hover:bg-rose-700 cursor-pointer font-medium flex items-center gap-1.5"
              >
                {deletingAssign ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
