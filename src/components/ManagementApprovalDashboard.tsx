import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  AlertTriangle,
  History,
  Info,
  Paperclip,
  RefreshCw,
  ShieldCheck,
  User,
  CheckCheck,
  ArrowRight,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { formatDate } from '../utils/dateFormat.ts';
import {
  MT_COLOR_CARDS,
  getStatusBadgeClasses,
  getStatusCardClasses,
  getLeaveTypeBadgeClasses,
} from '../utils/theme.ts';
import { LeaveAttachmentBox } from './LeaveAttachmentBox.tsx';
import { Employee360Link } from './Employee360Trigger.tsx';
import {
  LeaveRequestDto,
  LeaveRequestEventDto,
  EmployeeLeaveHistoryDto,
} from '../types/leave.ts';

// Keep requests requiring a later approval stage at the top of the queue.
function prioritizeApprovalQueue(requests: LeaveRequestDto[]): LeaveRequestDto[] {
  const stageOnePending = (r: LeaveRequestDto) => r.teamLeaderDecision === 'PENDING';
  return [...requests].sort((a, b) => {
    const priorityA = stageOnePending(a) ? 1 : 0;
    const priorityB = stageOnePending(b) ? 1 : 0;
    if (priorityA !== priorityB) return priorityA - priorityB;
    const dateA = new Date(a.applicationTimestamp || a.createdAt).getTime();
    const dateB = new Date(b.applicationTimestamp || b.createdAt).getTime();
    return dateB - dateA;
  });
}

export function ManagementApprovalDashboard() {
  const [requests, setRequests] = useState<LeaveRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('PENDING');

  // Decision Modal State
  const [activeDetails, setActiveDetails] = useState<{
    request: LeaveRequestDto;
    events: LeaveRequestEventDto[];
    employeeHistory: EmployeeLeaveHistoryDto;
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [decisionComment, setDecisionComment] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const fetchManagementRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (filterStatus) queryParams.set('status', filterStatus);
      if (searchQuery) queryParams.set('search', searchQuery);

      const res = await apiFetch(`/api/management/leave-requests?${queryParams.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch Top Management queue');
      }
      setRequests(prioritizeApprovalQueue(data.leaveRequests || []));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManagementRequests();
  }, [filterStatus]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchManagementRequests();
  };

  const handleOpenDecision = async (reqId: number) => {
    setLoadingDetails(true);
    setDecisionError(null);
    setDecisionComment('');
    try {
      const res = await apiFetch(`/api/management/leave-requests/${reqId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch request details');
      }
      setActiveDetails(data);
    } catch (err: any) {
      setError('Error loading request details: ' + err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDecisionSubmit = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!activeDetails) return;
    setDecisionError(null);

    if (decision === 'REJECTED' && (!decisionComment || decisionComment.trim().length === 0)) {
      setDecisionError('An executive comment is required when rejecting a leave request');
      return;
    }

    setSubmittingDecision(true);
    try {
      const res = await apiFetch(`/api/management/leave-requests/${activeDetails.request.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          comments: decisionComment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit management final decision');
      }

      setActiveDetails(null);
      fetchManagementRequests();
    } catch (err: any) {
      setDecisionError(err.message);
    } finally {
      setSubmittingDecision(false);
    }
  };

  const pendingCount = requests.filter((r) => r.managementDecision === 'PENDING').length;

  return (
    <div className="space-y-6">
      {/* Top Banner — Navy/Slate Executive Structure with Amber Pending State */}
      <div className={`${MT_COLOR_CARDS.slate} p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-950">Top Management Approval Desk</h2>
          </div>
          <p className="text-xs text-slate-700 mt-1">
            Sole final authority for organizational leave authorization and balance deduction posting
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
              Pending Final Decision
            </span>
            <span className="text-base font-bold text-amber-900">{pendingCount}</span>
          </div>
          <button
            onClick={fetchManagementRequests}
            className="p-2.5 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-slate-800' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stage 3 Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`${MT_COLOR_CARDS.slate} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block">Executive Queue</span>
          <span className="text-2xl font-black text-slate-950 mt-1 block">{requests.length}</span>
          <span className="text-[11px] text-slate-600">Total visible</span>
        </div>
        <div className={`${MT_COLOR_CARDS.amber} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 block">Action Required</span>
          <span className="text-2xl font-black text-amber-950 mt-1 block">{pendingCount}</span>
          <span className="text-[11px] text-amber-800">Pending final decision</span>
        </div>
        <div className={`${MT_COLOR_CARDS.emerald} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 block">Authorized</span>
          <span className="text-2xl font-black text-emerald-950 mt-1 block">
            {requests.filter((r) => r.managementDecision === 'APPROVED').length}
          </span>
          <span className="text-[11px] text-emerald-800">Balance deducted</span>
        </div>
        <div className={`${MT_COLOR_CARDS.rose} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-900 block">Declined</span>
          <span className="text-2xl font-black text-rose-950 mt-1 block">
            {requests.filter((r) => r.managementDecision === 'REJECTED').length}
          </span>
          <span className="text-[11px] text-rose-800">Executive rejection</span>
        </div>
      </div>

      {/* Core Principle Callout */}
      <div className="p-3.5 rounded-xl bg-slate-900 border-t-5 border-t-amber-500 text-white text-xs flex items-start gap-2.5 shadow-xs">
        <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white">Top Management is the Final Authority:</span> HR and Management operate in parallel. You are not required to wait for HR. If HR has reviewed, their recommendation is visible for your consideration. Final approval will immediately post the deduction against the employee's balance.
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className={`${MT_COLOR_CARDS.slate} flex flex-col sm:flex-row items-center justify-between gap-3 p-4`}>
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {[
            { id: 'PENDING', label: 'Pending Management' },
            { id: 'DECIDED', label: 'Decided' },
            { id: 'ALL', label: 'All Requests' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`flex-1 sm:flex-none px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                filterStatus === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-72">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search request #, employee..."
              className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-sm sm:text-xs bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0 shadow-2xs"
          >
            Search
          </button>
        </form>
      </div>

      {/* Requests Table */}
      {loading ? (
        <div className="p-12 text-center text-neutral-500 bg-white rounded-xl border border-neutral-200/80">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-500" />
          <span className="text-xs">Loading management queue...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 text-xs">
          {error}
        </div>
      ) : requests.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-dashed border-neutral-300">
          <Briefcase className="w-8 h-8 mx-auto text-neutral-500 mb-2" />
          <h3 className="text-sm font-semibold text-neutral-800">No Requests Pending Decision</h3>
          <p className="text-xs text-neutral-500 mt-1">
            There are currently no requests requiring executive decision in this view.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Management Approval Cards (<768px) */}
          <div id="mgmt-approval-mobile-cards" className="md:hidden space-y-3">
            {requests.map((r) => (
              <div
                key={`mobile-mgmt-${r.id}`}
                className={`${getStatusCardClasses(r.managementDecision || 'PENDING')} p-4 space-y-3`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-block font-mono text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-md">
                      {r.requestNumber}
                    </span>
                    <div className="font-bold text-sm text-neutral-900 mt-1.5 break-words">
                      <Employee360Link
                        employeeId={r.employeeId}
                        employeeCode={r.employeeCode}
                        employeeName={r.employeeName || `Employee ${r.employeeId}`}
                      >
                        {r.employeeName || `Employee ${r.employeeId}`}
                      </Employee360Link>
                    </div>
                    {r.employeeCode && (
                      <div className="text-[11px] text-neutral-500 mt-0.5">{r.employeeCode}</div>
                    )}
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${getStatusBadgeClasses(
                      r.finalStatus || r.status
                    )}`}
                  >
                    {r.finalStatus || r.status}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white/85 border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${getLeaveTypeBadgeClasses(
                        r.leaveTypeCode || r.leaveTypeName
                      )}`}
                    >
                      {r.leaveTypeName} ({r.leaveTypeCode})
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${r.isPaid !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.isPaid !== false ? 'Paid' : 'Unpaid'}</span>
                    <span className="font-mono font-bold text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200">
                      {Number(r.totalDays)} Days ({r.dayType === 'HALF_DAY' ? 'Half Day' : 'Full Day'})
                    </span>
                  </div>
                  <div className="text-neutral-600 font-medium">
                    {formatDate(r.startDate)} to {formatDate(r.endDate)}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <div className="p-2 rounded-lg bg-white/90 border border-neutral-200 text-center">
                    <span className="block text-[10px] text-neutral-500">Stage 1 (TL)</span>
                    <span className="font-bold text-neutral-800">{r.teamLeaderDecision || 'PENDING'}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white/90 border border-neutral-200 text-center">
                    <span className="block text-[10px] text-neutral-500">Stage 2 (HR)</span>
                    <span className="font-bold text-neutral-800">{r.hrDecision || 'PENDING'}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white/90 border border-neutral-200 text-center">
                    <span className="block text-[10px] text-neutral-500">Stage 3 (Mgmt)</span>
                    <span className="font-bold text-neutral-800">{r.managementDecision || 'PENDING'}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenDecision(r.id)}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  {r.managementDecision === 'PENDING' ? 'Final Decision' : 'View Decision'}
                </button>
              </div>
            ))}
          </div>

          {/* Desktop Management Queue Table (>=768px) */}
          <div className={`${MT_COLOR_CARDS.slate} hidden md:block overflow-hidden`}>
          <div className="overflow-x-auto bg-white/95">
          <table className="w-full text-left text-xs text-neutral-700">
            <thead className="bg-slate-100/90 text-slate-950 font-bold border-b border-slate-300">
              <tr>
                <th className="px-4 py-3">Request #</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Leave Type</th>
                <th className="px-4 py-3">Dates & Days</th>
                <th className="px-4 py-3">Stage 1 (Team Leader)</th>
                <th className="px-4 py-3">Stage 2 (HR)</th>
                <th className="px-4 py-3">Stage 3 (Mgmt)</th>
                <th className="px-4 py-3">Final Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50/60 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-neutral-900">
                    {r.requestNumber}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    <div>
                      <Employee360Link
                        employeeId={r.employeeId}
                        employeeCode={r.employeeCode}
                        employeeName={r.employeeName || `Employee ${r.employeeId}`}
                      >
                        {r.employeeName || `Employee ${r.employeeId}`}
                      </Employee360Link>
                    </div>
                    {r.employeeCode && (
                      <div className="mt-0.5">
                        <Employee360Link
                          employeeId={r.employeeId}
                          employeeCode={r.employeeCode}
                          employeeName={r.employeeName}
                          variant="badge"
                        >
                          {r.employeeCode}
                        </Employee360Link>
                      </div>
                    )}
                    {r.applicantRole === 'TOP_MANAGEMENT' && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300 text-[10px] font-semibold">
                        Top Management
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold font-mono ${getLeaveTypeBadgeClasses(
                        r.leaveTypeCode || r.leaveTypeName
                      )}`}
                    >
                      {r.leaveTypeCode}
                    </span>
                    <span className="text-[11px] text-neutral-500 block mt-0.5">{r.leaveTypeName} · {r.isPaid !== false ? 'Paid' : 'Unpaid'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-neutral-800 block">{formatDate(r.startDate)} to {formatDate(r.endDate)}</span>
                    <span className="text-[11px] text-neutral-500 font-medium">
                      {Number(r.totalDays)} day(s) &bull; {r.dayType === 'HALF_DAY' ? 'Half Day (0.5)' : 'Full Day'}
                    </span>
                    {(r.attachmentName || r.attachmentPath) && (
                      <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[10px] text-neutral-700 font-medium">
                        <Paperclip className="w-2.5 h-2.5 text-neutral-500" />
                        <span className="truncate max-w-[140px]">
                          {r.attachmentName || 'Attachment'}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.teamLeaderDecision === 'NOT_REQUIRED' ||
                    r.teamLeaderDecision === 'SKIPPED' ||
                    r.applicantRole === 'TOP_MANAGEMENT' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                        Not Required
                      </span>
                    ) : (r.teamLeaderDecision || 'PENDING') === 'APPROVED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        TL Approved
                      </span>
                    ) : r.teamLeaderDecision === 'REJECTED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        <XCircle className="w-3 h-3 text-rose-600" />
                        TL Rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">
                        <Clock className="w-3 h-3 text-neutral-500" />
                        TL Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.hrDecision === 'NOT_REQUIRED' ||
                    r.hrDecision === 'SKIPPED' ||
                    r.applicantRole === 'TOP_MANAGEMENT' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                        Not Required
                      </span>
                    ) : r.hrDecision === 'APPROVED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        HR Approved
                      </span>
                    ) : r.hrDecision === 'REJECTED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        <XCircle className="w-3 h-3 text-rose-600" />
                        HR Rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">
                        <Clock className="w-3 h-3 text-neutral-500" />
                        HR Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.managementDecision === 'APPROVED' ? (
                      <span className="text-[11px] font-semibold text-emerald-700">Approved</span>
                    ) : r.managementDecision === 'REJECTED' ? (
                      <span className="text-[11px] font-semibold text-rose-700">Rejected</span>
                    ) : (
                      <span className="text-[11px] text-amber-700 font-medium">Pending Decision</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${getStatusBadgeClasses(
                        r.finalStatus || r.status
                      )}`}
                    >
                      {r.finalStatus || r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      id={`mgmt-decide-btn-${r.id}`}
                      onClick={() => handleOpenDecision(r.id)}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-medium text-xs hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      {r.managementDecision === 'PENDING' ? 'Final Decision' : 'View Decision'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        </>
      )}

      {/* Decision Modal */}
      {activeDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-neutral-200 space-y-5 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Mobile Drag Handle */}
            <div className="sm:hidden flex justify-center pt-1 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-neutral-300" />
            </div>
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-neutral-800" />
                  Top Management Final Decision
                </h3>
                <span className="font-mono text-xs text-neutral-500">
                  Request: {activeDetails.request.requestNumber}
                </span>
              </div>
              <button
                onClick={() => setActiveDetails(null)}
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {decisionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {decisionError}
              </div>
            )}

            {/* Stage 1 (Team Leader) & Stage 2 (HR) Callout Boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-900">
                    Stage 1: Team Leader
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getStatusBadgeClasses(
                      activeDetails.request.teamLeaderDecision || 'PENDING'
                    )}`}
                  >
                    {activeDetails.request.teamLeaderDecision || 'PENDING'}
                  </span>
                </div>
                {activeDetails.request.teamLeaderRemarks ? (
                  <p className="text-xs text-neutral-700 italic bg-white p-2 rounded border border-neutral-200">
                    "{activeDetails.request.teamLeaderRemarks}"
                  </p>
                ) : (
                  <p className="text-[11px] text-neutral-500">No Team Leader remarks recorded.</p>
                )}
              </div>

              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-900 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-neutral-600" />
                    Stage 2: HR Decision
                  </span>
                  {activeDetails.request.hrDecision === 'NOT_REQUIRED' ||
                  activeDetails.request.hrDecision === 'SKIPPED' ||
                  activeDetails.request.applicantRole === 'TOP_MANAGEMENT' ? (
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getStatusBadgeClasses('NOT_REQUIRED')}`}>
                      NOT_REQUIRED
                    </span>
                  ) : activeDetails.request.hrDecision === 'APPROVED' ? (
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getStatusBadgeClasses('APPROVED')}`}>
                      HR Approved
                    </span>
                  ) : activeDetails.request.hrDecision === 'REJECTED' ? (
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getStatusBadgeClasses('REJECTED')}`}>
                      HR Rejected
                    </span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getStatusBadgeClasses('PENDING')}`}>
                      HR Pending
                    </span>
                  )}
                </div>
                {activeDetails.request.hrRemarks ? (
                  <p className="text-xs text-neutral-700 italic bg-white p-2 rounded border border-neutral-200">
                    "{activeDetails.request.hrRemarks}"
                  </p>
                ) : (
                  <p className="text-[11px] text-neutral-500">
                    No HR remarks recorded yet.
                  </p>
                )}
              </div>
            </div>

            {/* Request Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200/70">
                <span className="text-[11px] text-neutral-500 block">Applicant</span>
                <span className="font-semibold text-neutral-900 mt-0.5 block">
                  <Employee360Link
                    employeeId={activeDetails.request.employeeId}
                    employeeCode={activeDetails.request.employeeCode}
                    employeeName={activeDetails.request.employeeName}
                  >
                    {activeDetails.request.employeeName}
                  </Employee360Link>
                </span>
                <span className="text-neutral-500 text-[10px]">
                  Code:{' '}
                  <Employee360Link
                    employeeId={activeDetails.request.employeeId}
                    employeeCode={activeDetails.request.employeeCode || String(activeDetails.request.employeeId)}
                    employeeName={activeDetails.request.employeeName}
                    variant="badge"
                  >
                    {activeDetails.request.employeeCode || activeDetails.request.employeeId}
                  </Employee360Link>
                </span>
              </div>

              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200/70">
                <span className="text-[11px] text-neutral-500 block">Leave Duration</span>
                <span className="font-semibold text-neutral-900 mt-0.5 block">
                  {activeDetails.request.totalDays} Day(s) ({activeDetails.request.dayType})
                </span>
                <span className="text-neutral-500 text-[10px]">
                  {formatDate(activeDetails.request.startDate)} &rarr; {formatDate(activeDetails.request.endDate)}
                </span>
              </div>

              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200/70">
                <span className="text-[11px] text-neutral-500 block">Reason Category</span>
                <span className="font-semibold text-neutral-900 mt-0.5 block">
                  {activeDetails.request.reasonCategory || 'Personal'}
                </span>
                <span className="text-neutral-500 text-[10px]">
                  Classification: {activeDetails.request.requestClassification}
                </span>
              </div>
            </div>

            {/* Reason & Supporting Attachment */}
            <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200/80 text-xs space-y-2">
              <div>
                <span className="font-semibold text-neutral-900 block">Reason Provided by Employee:</span>
                <p className="text-neutral-700 mt-0.5">{activeDetails.request.reason}</p>
              </div>
              {(activeDetails.request.attachmentName || activeDetails.request.attachmentPath) && (
                <div className="pt-2 border-t border-neutral-200/60">
                  <span className="font-semibold text-neutral-900 block mb-1">
                    Supporting Attachment:
                  </span>
                  <LeaveAttachmentBox
                    requestId={activeDetails.request.id}
                    attachmentName={activeDetails.request.attachmentName}
                    attachmentPath={activeDetails.request.attachmentPath}
                    attachmentSize={activeDetails.request.attachmentSize}
                    attachmentMime={activeDetails.request.attachmentMime}
                    compact
                  />
                </div>
              )}
            </div>

            {/* Balances Context */}
            {activeDetails.employeeHistory.balances.length > 0 && (
              <div className="border border-neutral-200 rounded-lg p-3.5 space-y-2">
                <span className="text-xs font-semibold text-neutral-900 block">
                  Current Employee Balances & History
                </span>
                <div className="flex flex-wrap gap-2">
                  {activeDetails.employeeHistory.balances.map((b) => (
                    <span
                      key={b.id}
                      className="px-2.5 py-1 rounded bg-neutral-100 text-neutral-700 text-xs border border-neutral-200"
                    >
                      <strong className="text-neutral-900">{b.leaveTypeCode}:</strong> {b.available} Days available ({b.used} Days used)
                    </span>
                  ))}
                </div>
                <div className="text-[11px] text-neutral-500 flex items-center gap-3 pt-1">
                  <span>Total Past Requests: {activeDetails.employeeHistory.totalRequests}</span>
                  <span>&bull; Approved: {activeDetails.employeeHistory.approvedRequests}</span>
                  <span>&bull; Late: {activeDetails.employeeHistory.lateRequests}</span>
                  <span>&bull; Emergencies: {activeDetails.employeeHistory.emergencyRequests}</span>
                </div>
              </div>
            )}

            {/* Already Decided State */}
            {activeDetails.request.managementDecision !== 'PENDING' ? (
              <div className="p-4 rounded-xl bg-neutral-100 border border-neutral-200 text-xs space-y-1">
                <span className="font-semibold text-neutral-900">
                  Management Final Decision Recorded:
                </span>
                <span className="ml-2 font-bold text-neutral-900">
                  {activeDetails.request.managementDecision}
                </span>
                {activeDetails.request.managementRemarks && (
                  <p className="mt-1 italic text-neutral-700">
                    "{activeDetails.request.managementRemarks}"
                  </p>
                )}
                <span className="text-[10px] text-neutral-500 block pt-1">
                  Author: {activeDetails.request.managementDecidedByName} &bull; Final Status: {activeDetails.request.finalStatus} &bull; Balance Posted: {activeDetails.request.balancePosted ? 'Yes' : 'No'}
                </span>
              </div>
            ) : (
              /* Decision Submission Controls */
              <div className="space-y-3 pt-2 border-t border-neutral-100">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <span className="font-semibold">Authoritative Action:</span> Approving this request sets Final Status to APPROVED and automatically posts a deduction of {activeDetails.request.totalDays} day(s) to the employee's balance ledger.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Management Remarks / Executive Decision Notes
                  </label>
                  <textarea
                    rows={3}
                    value={decisionComment}
                    onChange={(e) => setDecisionComment(e.target.value)}
                    placeholder="Enter executive remarks, condition waivers, or explanation for rejection..."
                    className="w-full text-sm sm:text-xs p-3 rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                  />
                  <span className="text-[10px] text-neutral-500 block mt-0.5">
                    * Required when rejecting the request.
                  </span>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveDetails(null)}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl border border-neutral-200 sm:border-transparent text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    id="btn-mgmt-final-reject"
                    disabled={submittingDecision}
                    onClick={() => handleDecisionSubmit('REJECTED')}
                    className="px-4 py-2.5 min-h-[44px] text-xs font-bold bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Final Reject
                  </button>
                  <button
                    type="button"
                    id="btn-mgmt-final-approve"
                    disabled={submittingDecision}
                    onClick={() => handleDecisionSubmit('APPROVED')}
                    className="px-4 py-2.5 min-h-[44px] text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Final Approve & Deduct Balance
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
