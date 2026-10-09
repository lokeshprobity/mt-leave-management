import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlusCircle,
  Calendar,
  User,
  Filter,
  RefreshCw,
  MessageSquare,
  History,
} from 'lucide-react';
import { OvertimeRequestDto, UserDto, EmployeeDto, ShiftDto, AuditLogDto } from '../types/leave.ts';
import { apiFetch, getActiveRole } from '../lib/api.ts';
import { Employee360Link } from './Employee360Trigger.tsx';
import { AuditEventDetailsView } from './SystemAuditAdmin.tsx';
import { formatDate, formatDateTime } from '../utils/dateFormat.ts';
import { MT_COLOR_CARDS, getStatusBadgeClasses } from '../utils/theme.ts';

function computeHoursFromTimes(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(isNaN)) return null;
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  if (startMins === endMins) return null;
  const diff = endMins > startMins ? endMins - startMins : 24 * 60 - startMins + endMins;
  return Math.round((diff / 60) * 100) / 100;
}

export function OvertimeAdmin() {
  const [requests, setRequests] = useState<OvertimeRequestDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([]);
  const [activeTab, setActiveTab] = useState<'requests' | 'audit'>('requests');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Request modal
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<OvertimeRequestDto | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewComments, setReviewComments] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    employeeId: '',
    date: todayStr,
    endDate: todayStr,
    startTime: '18:00',
    endTime: '20:00',
    hours: '2',
    shiftId: '',
    reason: '',
  });

  const activeRole = getActiveRole();
  const canReview = activeRole === 'SUPER_ADMIN' || activeRole === 'HR' || activeRole === 'TOP_MANAGEMENT';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [otRes, usersRes, empRes, shiftsRes, auditRes] = await Promise.all([
        apiFetch('/api/overtime'),
        apiFetch('/api/users'),
        apiFetch('/api/employees'),
        apiFetch('/api/shifts'),
        apiFetch('/api/overtime/audit'),
      ]);

      const otData = otRes.ok ? await otRes.json() : { requests: [] };
      const usersData = usersRes.ok ? await usersRes.json() : { users: [] };
      const empData = empRes.ok ? await empRes.json() : { employees: [] };
      const shiftsData = shiftsRes.ok ? await shiftsRes.json() : { shifts: [] };
      const auditData = auditRes.ok ? await auditRes.json() : { logs: [] };

      setRequests(otData.requests || []);
      setUsers(usersData.users || []);
      setEmployees(empData.employees || []);
      setShifts(shiftsData.shifts || []);
      setAuditLogs(auditData.logs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load overtime requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    const next = { ...formData, [field]: value };
    const calc = computeHoursFromTimes(next.startTime, next.endTime);
    if (calc !== null && calc > 0) {
      next.hours = String(calc);
    }
    setFormData(next);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      const rawEmpId = formData.employeeId.trim();
      if (!rawEmpId && activeRole !== 'EMPLOYEE') throw new Error('Please select an employee');
      const empId = rawEmpId ? (isNaN(Number(rawEmpId)) ? rawEmpId : Number(rawEmpId)) : undefined;

      const payload = {
        employeeId: empId || undefined,
        date: formData.date,
        endDate: formData.endDate || formData.date,
        startTime: formData.startTime || undefined,
        endTime: formData.endTime || undefined,
        hours: Number(formData.hours),
        shiftId: formData.shiftId ? Number(formData.shiftId) : undefined,
        reason: formData.reason.trim(),
      };

      const res = await apiFetch('/api/overtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit overtime request');

      setSuccessMsg('Overtime schedule submitted successfully!');
      setIsSubmitModalOpen(false);
      setFormData({
        employeeId: '',
        date: todayStr,
        endDate: todayStr,
        startTime: '18:00',
        endTime: '20:00',
        hours: '2',
        shiftId: '',
        reason: '',
      });
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReviewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    setError(null);
    setSuccessMsg(null);

    if (reviewAction === 'REJECT' && !reviewComments.trim()) {
      setError('Comments are required when rejecting an overtime request.');
      return;
    }

    try {
      const res = await apiFetch(`/api/overtime/${selectedRequest.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: reviewAction,
          comments: reviewComments.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to review overtime request');

      setSuccessMsg(`Overtime request #${selectedRequest.id} ${reviewAction.toLowerCase()}d successfully!`);
      setIsReviewModalOpen(false);
      setReviewComments('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (statusFilter === 'ALL') return true;
    return r.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header — Purple Overtime Module Identity */}
      <div className={`${MT_COLOR_CARDS.purple} p-6 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-100 border border-purple-300 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-purple-700" />
          </div>
          <div>
            <div className="text-purple-950 font-bold text-lg">
              <span>Overtime Scheduling, Authorizations & Audit Trail</span>
            </div>
            <p className="text-xs text-purple-900/80 mt-0.5">
              Schedule employee overtime by date or date range, start/end time, duration, reason, approval status, and audit history.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-purple-200 p-0.5 bg-white/90">
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                activeTab === 'requests' ? 'bg-purple-700 text-white' : 'text-purple-900 hover:bg-purple-50'
              }`}
            >
              Overtime Schedule ({requests.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                activeTab === 'audit' ? 'bg-purple-700 text-white' : 'text-purple-900 hover:bg-purple-50'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Audit History ({auditLogs.length})</span>
            </button>
          </div>

          <button
            onClick={() => {
              setError(null);
              setIsSubmitModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-700 text-white rounded-lg text-xs font-semibold hover:bg-purple-800 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Schedule Overtime</span>
          </button>
        </div>
      </div>

      {/* Overtime KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`${MT_COLOR_CARDS.purple} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900 block">Overtime Entries</span>
          <span className="text-2xl font-black text-purple-950 mt-1 block">{requests.length}</span>
          <span className="text-[11px] text-purple-800">Scheduled records</span>
        </div>
        <div className={`${MT_COLOR_CARDS.emerald} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 block">Approved OT</span>
          <span className="text-2xl font-black text-emerald-950 mt-1 block">
            {requests.filter((r) => r.status === 'APPROVED').length}
          </span>
          <span className="text-[11px] text-emerald-800">Authorized records</span>
        </div>
        <div className={`${MT_COLOR_CARDS.amber} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 block">Pending Review</span>
          <span className="text-2xl font-black text-amber-950 mt-1 block">
            {requests.filter((r) => r.status === 'PENDING').length}
          </span>
          <span className="text-[11px] text-amber-800">Awaiting decision</span>
        </div>
        <div className={`${MT_COLOR_CARDS.rose} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-900 block">Rejected / Cancelled</span>
          <span className="text-2xl font-black text-rose-950 mt-1 block">
            {requests.filter((r) => r.status === 'REJECTED' || r.status === 'CANCELLED').length}
          </span>
          <span className="text-[11px] text-rose-800">Not authorized</span>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 font-medium">{successMsg}</div>
        </div>
      )}

      {activeTab === 'audit' ? (
        <div className={`${MT_COLOR_CARDS.purple} overflow-hidden`}>
          <div className="px-5 py-3.5 border-b border-purple-200 bg-purple-100/60 flex items-center justify-between">
            <h3 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
              Overtime Assignment & Review Audit Log
            </h3>
            <button
              onClick={loadData}
              className="p-1.5 rounded-lg border border-purple-200 text-purple-800 hover:text-purple-950 bg-white cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <div className="p-10 text-center text-xs text-neutral-500 bg-white/95">
              No overtime audit events recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto bg-white/95">
              <table className="w-full text-left text-xs">
                <thead className="bg-purple-50/90 border-b border-purple-200 text-[11px] font-bold text-purple-950 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Action</th>
                    <th className="px-4 py-2.5">Actor Role</th>
                    <th className="px-4 py-2.5">Record ID</th>
                    <th className="px-4 py-2.5">Details</th>
                    <th className="px-4 py-2.5">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-50/70">
                      <td className="px-4 py-2.5 font-mono font-semibold text-neutral-900">{log.action}</td>
                      <td className="px-4 py-2.5">
                        {log.actorName ? (
                          <Employee360Link
                            userId={log.actorUserId || log.actorId || undefined}
                            employeeCode={log.actorEmployeeCode || undefined}
                            employeeName={log.actorName}
                          >
                            {log.actorName} ({log.actorRole || 'SYSTEM'})
                          </Employee360Link>
                        ) : (
                          log.actorRole || 'SYSTEM'
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono">
                        {log.employeeCode || log.targetEmployeeCode || log.employeeName || log.targetEmployeeName ? (
                          <Employee360Link
                            employeeId={log.targetEmployeeId || log.metadata?.employeeId || undefined}
                            employeeCode={log.employeeCode || log.targetEmployeeCode || undefined}
                            employeeName={log.employeeName || log.targetEmployeeName || undefined}
                            variant="badge"
                          >
                            {log.employeeCode || log.targetEmployeeCode || log.employeeName || log.targetEmployeeName}
                          </Employee360Link>
                        ) : (
                          `#${log.targetId}`
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-neutral-700">
                        <AuditEventDetailsView log={log} />
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500">
                        {log.createdAt ? formatDateTime(log.createdAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Filter Bar */}
          <div className={`${MT_COLOR_CARDS.purple} p-4 flex items-center justify-between gap-3`}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-purple-950">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-purple-200 rounded-lg text-neutral-800 focus:outline-none focus:border-purple-700"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <button
              onClick={loadData}
              className="p-1.5 rounded-lg bg-white border border-purple-200 text-purple-800 hover:text-purple-950 hover:bg-purple-100 transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Overtime Table */}
          <div className={`${MT_COLOR_CARDS.purple} overflow-hidden`}>
            {loading ? (
              <div className="p-12 text-center text-neutral-500 text-xs flex items-center justify-center gap-2 bg-white/95">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading overtime requests...</span>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="p-12 text-center text-neutral-500 text-xs bg-white/95">
                No overtime requests found matching the current filter.
              </div>
            ) : (
              <div className="overflow-x-auto bg-white/95">
                <table className="w-full text-left text-xs text-neutral-700">
                  <thead className="bg-purple-50/90 border-b border-purple-200 text-[11px] font-bold text-purple-950 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Date / Range</th>
                      <th className="px-4 py-3">Timing</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Shift</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200/70">
                    {filteredRequests.map((req) => {
                      const emp = users.find((u) => String(u.employeeId) === String(req.employeeId));
                      const empRecord = employees.find(
                        (e) =>
                          String(e.id) === String(req.employeeId) ||
                          (req.employeeCode && e.employeeCode === req.employeeCode)
                      );
                      const resolvedName =
                        req.employeeName ||
                        empRecord?.employeeName ||
                        (emp ? emp.fullName || emp.employeeName : `Employee #${req.employeeId}`);
                      const resolvedCode = req.employeeCode || empRecord?.employeeCode || emp?.employeeCode;
                      const startDate = req.overtimeDate || req.date;
                      const endDate = req.endDate && req.endDate !== startDate ? req.endDate : null;
                      return (
                        <tr key={req.id} className="hover:bg-neutral-50/70 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-neutral-900">
                              <Employee360Link
                                employeeId={req.employeeId}
                                employeeCode={resolvedCode}
                                employeeName={resolvedName}
                              >
                                {resolvedName}
                              </Employee360Link>
                            </div>
                            {resolvedCode && (
                              <div className="mt-0.5">
                                <Employee360Link
                                  employeeId={req.employeeId}
                                  employeeCode={resolvedCode}
                                  employeeName={resolvedName}
                                  variant="badge"
                                >
                                  {resolvedCode}
                                </Employee360Link>
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3.5 font-mono font-medium text-neutral-800">
                            {formatDate(startDate)}
                            {endDate ? ` → ${formatDate(endDate)}` : ''}
                          </td>

                          <td className="px-4 py-3.5 font-mono text-[11px] text-neutral-700">
                            {req.startTime && req.endTime ? `${req.startTime} - ${req.endTime}` : '—'}
                          </td>

                          <td className="px-4 py-3.5">
                            <span className="font-bold text-neutral-900 text-xs px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200">
                              {req.requestedHours || req.hours} hrs
                            </span>
                          </td>

                          <td className="px-4 py-3.5">
                            {req.shiftCode ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {req.shiftCode}
                              </span>
                            ) : (
                              <span className="text-neutral-500 italic text-[11px]">Regular Shift</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 max-w-[200px] truncate" title={req.reason}>
                            {req.reason}
                          </td>

                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusBadgeClasses(
                                req.status
                              )}`}
                            >
                              {req.status}
                            </span>
                            {req.remarks && (
                              <div className="text-[10px] text-neutral-500 mt-1 italic max-w-[150px] truncate">
                                Note: {req.remarks}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            {canReview && req.status === 'PENDING' ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setReviewAction('APPROVE');
                                    setReviewComments('');
                                    setIsReviewModalOpen(true);
                                  }}
                                  className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] font-medium hover:bg-emerald-700 transition-colors cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setReviewAction('REJECT');
                                    setReviewComments('');
                                    setIsReviewModalOpen(true);
                                  }}
                                  className="px-2 py-1 bg-rose-600 text-white rounded text-[11px] font-medium hover:bg-rose-700 transition-colors cursor-pointer"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-neutral-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal: Schedule / Request Overtime */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-neutral-700" />
                <span>Schedule / Request Overtime</span>
              </h3>
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitRequest} className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Employee <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                >
                  <option value="">-- Select Employee --</option>
                  {employees.length > 0
                    ? employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.employeeCode} — {emp.employeeName || emp.fullName} — {emp.departmentName || 'General'}
                        </option>
                      ))
                    : users
                        .filter((u) => u.employeeId)
                        .map((u) => (
                          <option key={u.id} value={u.employeeId!}>
                            {u.employeeCode || u.username} — {u.fullName || u.employeeName || u.username} — {u.departmentName || 'General'}
                          </option>
                        ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        date: e.target.value,
                        endDate: formData.endDate < e.target.value ? e.target.value : formData.endDate,
                      })
                    }
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    End Date <span className="text-neutral-500">(optional range)</span>
                  </label>
                  <input
                    type="date"
                    min={formData.date}
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Start Time</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => handleTimeChange('startTime', e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">End Time</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => handleTimeChange('endTime', e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Daily Hours <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="12"
                    required
                    value={formData.hours}
                    onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Shift Association</label>
                <select
                  value={formData.shiftId}
                  onChange={(e) => setFormData({ ...formData, shiftId: e.target.value })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                >
                  <option value="">-- Auto-detect / Regular Shift --</option>
                  {shifts
                    .filter((s) => s.timingConfigured)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.shiftCode} - {s.shiftName}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Reason for Overtime <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="e.g. Vessel customs clearance & month-end delivery coverage"
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="px-3.5 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer font-medium"
                >
                  Save Overtime Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Review Overtime */}
      {isReviewModalOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-neutral-700" />
                <span>{reviewAction === 'APPROVE' ? 'Approve' : 'Reject'} Overtime</span>
              </h3>
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReviewRequest} className="space-y-3.5 mt-4 text-xs">
              <p className="text-neutral-600">
                You are about to {reviewAction.toLowerCase()} request for{' '}
                <strong>{selectedRequest.requestedHours || selectedRequest.hours} hours</strong> on{' '}
                <strong>{formatDate(selectedRequest.overtimeDate || selectedRequest.date)}</strong>.
              </p>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Review Comments {reviewAction === 'REJECT' && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  rows={3}
                  required={reviewAction === 'REJECT'}
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  placeholder={
                    reviewAction === 'REJECT'
                      ? 'Mandatory: reason for rejecting overtime request...'
                      : 'Optional approval remarks...'
                  }
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="px-3.5 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 text-white rounded-lg cursor-pointer font-medium ${
                    reviewAction === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Confirm {reviewAction}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

