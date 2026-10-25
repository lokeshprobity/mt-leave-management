import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  AlertTriangle,
  History,
  Info,
  Paperclip,
  RefreshCw,
  Eye,
  ShieldCheck,
  User,
  PieChart,
} from 'lucide-react';
import { apiFetch, getActiveRole } from '../lib/api.ts';
import { formatDate, formatDateTime } from '../utils/dateFormat.ts';
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

export function HrApprovalDashboard() {
  const [requests, setRequests] = useState<LeaveRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('PENDING');
  const [topMgmtLeaves, setTopMgmtLeaves] = useState<LeaveRequestDto[]>([]);
  const [loadingTopMgmt, setLoadingTopMgmt] = useState(false);
  const [fallbackRequests, setFallbackRequests] = useState<LeaveRequestDto[]>([]);
  const [fallbackBusyId, setFallbackBusyId] = useState<number | null>(null);
  const [canReturnForCorrection, setCanReturnForCorrection] = useState(getActiveRole() === 'SUPER_ADMIN');
  const [returningRequest, setReturningRequest] = useState(false);

  // Review Modal State
  const [activeDetails, setActiveDetails] = useState<{
    request: LeaveRequestDto;
    events: LeaveRequestEventDto[];
    employeeHistory: EmployeeLeaveHistoryDto;
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [decisionComment, setDecisionComment] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const fetchTopMgmtLeaves = async () => {
    setLoadingTopMgmt(true);
    try {
      const res = await apiFetch('/api/hr/top-management-leaves');
      const data = await res.json();
      if (res.ok) {
        setTopMgmtLeaves(data.leaveRequests || []);
      }
    } catch {
      // silently handle
    } finally {
      setLoadingTopMgmt(false);
    }
  };

  const fetchHrRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (filterStatus) queryParams.set('status', filterStatus);
      if (searchQuery) queryParams.set('search', searchQuery);

      const res = await apiFetch(`/api/hr/leave-requests?${queryParams.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch HR leave requests queue');
      }
      setRequests(prioritizeApprovalQueue(data.leaveRequests || []));
      const fallbackRes = await apiFetch(`/api/hr/stage1-fallback-requests?${queryParams.toString()}`);
      const fallbackData = await fallbackRes.json();
      if (!fallbackRes.ok) throw new Error(fallbackData.error || 'Failed to fetch Reporting Person fallback queue');
      setFallbackRequests(prioritizeApprovalQueue(fallbackData.leaveRequests || []));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadReturnPermission = async () => {
      const role = getActiveRole();
      if (role === 'SUPER_ADMIN') { setCanReturnForCorrection(true); return; }
      try {
        const res = await apiFetch('/api/roles/my-permissions');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to check role permission');
        if (!cancelled) setCanReturnForCorrection(data.canReturnForCorrection === true);
      } catch { if (!cancelled) setCanReturnForCorrection(false); }
    };
    loadReturnPermission();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (filterStatus === 'TOP_MGMT_OVERVIEW') {
      fetchTopMgmtLeaves();
    } else {
      fetchHrRequests();
    }
  }, [filterStatus]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHrRequests();
  };

  const handleOpenReview = async (reqId: number) => {
    setLoadingDetails(true);
    setDecisionError(null);
    setDecisionComment('');
    try {
      const res = await apiFetch(`/api/hr/leave-requests/${reqId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch request details');
      }
      setActiveDetails(data);
    } catch (err: any) {
      setError('Error loading review details: ' + err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleReportingPersonFallback = async (request: LeaveRequestDto) => {
    const reason = window.prompt(
      `Confirm the assigned Reporting Person is unavailable for request ${request.requestNumber}. Enter the reason (minimum 8 characters):`
    );
    if (reason === null) return;
    if (reason.trim().length < 8) {
      setError('Fallback approval requires a reason of at least 8 characters.');
      return;
    }
    setFallbackBusyId(request.id);
    setError(null);
    try {
      const res = await apiFetch(`/api/hr/leave-requests/${request.id}/reporting-person-fallback`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve Stage 1 on behalf of the Reporting Person');
      await fetchHrRequests();
    } catch (err: any) {
      setError(err.message || 'Reporting Person fallback approval failed');
    } finally {
      setFallbackBusyId(null);
    }
  };

  const handleReturnForCorrection = async () => {
    if (!activeDetails) return;
    const comments = window.prompt(`Return ${activeDetails.request.requestNumber} to the employee for reason correction. Enter a clear explanation (minimum 10 characters):`);
    if (comments === null) return;
    if (comments.trim().length < 10) {
      setDecisionError('Please enter a clear return comment of at least 10 characters.');
      return;
    }
    setReturningRequest(true);
    setDecisionError(null);
    try {
      const res = await apiFetch(`/api/hr/leave-requests/${activeDetails.request.id}/return-for-correction`, {
        method: 'POST', body: JSON.stringify({ comments: comments.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to return leave for correction');
      setActiveDetails(null);
      await fetchHrRequests();
    } catch (err: any) {
      setDecisionError(err.message || 'Failed to return leave for correction');
    } finally {
      setReturningRequest(false);
    }
  };

  const handleDecisionSubmit = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!activeDetails) return;
    setDecisionError(null);

    if (decision === 'REJECTED' && (!decisionComment || decisionComment.trim().length === 0)) {
      setDecisionError('A comment is required when recommending rejection');
      return;
    }

    setSubmittingDecision(true);
    try {
      const res = await apiFetch(`/api/hr/leave-requests/${activeDetails.request.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          comments: decisionComment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit HR review decision');
      }

      setActiveDetails(null);
      fetchHrRequests();
    } catch (err: any) {
      setDecisionError(err.message);
    } finally {
      setSubmittingDecision(false);
    }
  };

  const pendingCount = requests.filter((r) => r.hrDecision === 'PENDING').length;
  const reviewedCount = requests.filter((r) => r.hrDecision !== 'PENDING').length;

  return (
    <div className="flex flex-col space-y-6">
      {/* Header Banner — Purple/Indigo Visual Identity */}
      <div className={`${MT_COLOR_CARDS.purple} p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-purple-100 border border-purple-300 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-purple-700" />
            </div>
            <h2 className="text-xl font-bold text-purple-950">HR Leave Review Queue</h2>
          </div>
          <p className="text-xs text-purple-900/80 mt-1">
            Conduct initial verification, audit attendance history, and provide advisory recommendations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Pending Review</span>
            <span className="text-base font-bold text-amber-900">{pendingCount}</span>
          </div>
          <button
            onClick={fetchHrRequests}
            className="p-2.5 bg-white border border-purple-200 rounded-lg text-purple-800 hover:bg-purple-100 transition-colors cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-700' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stage 2 KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`${MT_COLOR_CARDS.purple} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900 block">HR Queue</span>
          <span className="text-2xl font-black text-purple-950 mt-1 block">{requests.length}</span>
          <span className="text-[11px] text-purple-800">Total visible</span>
        </div>
        <div className={`${MT_COLOR_CARDS.amber} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 block">Pending HR</span>
          <span className="text-2xl font-black text-amber-950 mt-1 block">{pendingCount}</span>
          <span className="text-[11px] text-amber-800">Awaiting Stage 2</span>
        </div>
        <div className={`${MT_COLOR_CARDS.emerald} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 block">HR Approved</span>
          <span className="text-2xl font-black text-emerald-950 mt-1 block">
            {requests.filter((r) => r.hrDecision === 'APPROVED').length}
          </span>
          <span className="text-[11px] text-emerald-800">Verified & endorsed</span>
        </div>
        <div className={`${MT_COLOR_CARDS.rose} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-900 block">HR Flagged/Rejected</span>
          <span className="text-2xl font-black text-rose-950 mt-1 block">
            {requests.filter((r) => r.hrDecision === 'REJECTED').length}
          </span>
          <span className="text-[11px] text-rose-800">Policy exception</span>
        </div>
      </div>

      {/* Advisory Architecture Callout */}
      <div className={`${MT_COLOR_CARDS.indigo} p-3.5 text-xs text-indigo-950 flex items-start gap-2.5`}>
        <Info className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-indigo-950">Stage 2 — HR Approval & Policy Review:</span> HR reviews requests that have passed Stage 1 Team Leader approval. HR cannot override a Team Leader rejection. Once HR approves or rejects, the request moves to Top Management for final authorization.
        </div>
      </div>

      {filterStatus !== 'TOP_MGMT_OVERVIEW' && fallbackRequests.length > 0 && (
        <div className="order-last bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-amber-950">Stage 1 — Reporting Person Unavailable</h3>
            <p className="text-xs text-amber-900 mt-1">
              Use this only after confirming the assigned Reporting Person is unavailable. A reason is mandatory; the request will then return to HR review before Top Management makes the final decision.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-amber-200 text-amber-900">
                <th className="py-2 pr-3">Request</th><th className="py-2 pr-3">Employee</th><th className="py-2 pr-3">Leave</th><th className="py-2 pr-3">Dates</th><th className="py-2 text-right">Action</th>
              </tr></thead>
              <tbody>
                {fallbackRequests.map((r) => (
                  <tr key={r.id} className="border-b border-amber-100 last:border-0">
                    <td className="py-2 pr-3 font-mono">{r.requestNumber}</td>
                    <td className="py-2 pr-3">{r.employeeName} <span className="text-amber-800">({r.employeeCode || r.employeeId})</span></td>
                    <td className="py-2 pr-3">{r.leaveTypeName} — {r.totalDays} day(s) <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.isPaid !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.isPaid !== false ? 'Paid' : 'Unpaid'}</span></td>
                    <td className="py-2 pr-3">{formatDate(r.startDate)} – {formatDate(r.endDate)}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleReportingPersonFallback(r)}
                        disabled={fallbackBusyId === r.id}
                        className="px-3 py-1.5 bg-amber-700 text-white rounded-lg font-semibold hover:bg-amber-800 disabled:opacity-50"
                      >
                        {fallbackBusyId === r.id ? 'Processing…' : 'Approve Stage 1 for unavailable Reporting Person'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className={`${MT_COLOR_CARDS.purple} flex flex-col sm:flex-row items-center justify-between gap-3 p-4`}>
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {[
            { id: 'PENDING', label: 'Pending HR Review' },
            { id: 'REVIEWED', label: 'Reviewed' },
            { id: 'ALL', label: 'All Requests' },
            { id: 'TOP_MGMT_OVERVIEW', label: 'Top Management Leaves (Overview)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`flex-1 sm:flex-none px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                filterStatus === tab.id
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-white/80 text-purple-900 hover:bg-purple-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-72">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-purple-700" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search request #, employee..."
              className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-sm sm:text-xs bg-white rounded-xl border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-700/20 focus:border-purple-700"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 min-h-[44px] bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0 shadow-2xs"
          >
            Search
          </button>
        </form>
      </div>

      {/* Top Management Leave Overview (Read-Only) Tab View */}
      {filterStatus === 'TOP_MGMT_OVERVIEW' ? (
        <div className="space-y-4">
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Top Management Leave Schedule (Read-Only Calendar/Overview):</span>
              {" "}This overview allows HR to view leave dates, durations, and status of Top Management personnel for organizational planning. In accordance with governance rules, Top Management leaves are decided by their assigned reporting manager or Super Admin.
            </div>
          </div>

          {loadingTopMgmt ? (
            <div className="p-12 text-center text-neutral-500 bg-white rounded-xl border border-neutral-200/80">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-500" />
              <span className="text-xs">Loading Top Management leave overview...</span>
            </div>
          ) : topMgmtLeaves.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-dashed border-neutral-300">
              <Users className="w-8 h-8 mx-auto text-neutral-400 mb-2" />
              <h3 className="text-sm font-semibold text-neutral-800">No Top Management Leave Records</h3>
              <p className="text-xs text-neutral-500 mt-1">No leave applications found for Top Management personnel.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-neutral-200">
                    <tr>
                      <th className="px-4 py-3">Request #</th>
                      <th className="px-4 py-3">Executive</th>
                      <th className="px-4 py-3">Leave Type</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Leave Dates</th>
                      <th className="px-4 py-3">Status / Stage</th>
                      <th className="px-4 py-3">Approver Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-medium">
                    {topMgmtLeaves.map((r) => (
                      <tr key={"tm-" + r.id} className="hover:bg-neutral-50/50">
                        <td className="px-4 py-3 font-mono font-bold text-neutral-900">
                          {r.requestNumber}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-neutral-900">{r.employeeName || ("Employee #" + r.employeeId)}</div>
                          <div className="text-[11px] text-neutral-500 font-mono">{r.employeeCode || ("EMP" + r.employeeId)} &bull; Top Management</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={"px-2 py-0.5 rounded text-[11px] font-bold " + getLeaveTypeBadgeClasses(r.leaveTypeCode || r.leaveTypeName)}>
                            {r.leaveTypeName || r.leaveTypeCode}
                          </span>
                          <span className={`ml-1 px-2 py-0.5 rounded text-[10px] font-semibold ${r.isPaid !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.isPaid !== false ? 'Paid' : 'Unpaid'}</span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-neutral-900">
                          {Number(r.totalDays)} Day{Number(r.totalDays) === 1 ? '' : 's'} ({r.dayType === 'HALF_DAY' ? 'Half Day' : 'Full Day'})
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {formatDate(r.startDate)} {r.startDate !== r.endDate ? ("→ " + formatDate(r.endDate)) : ''}
                        </td>
                        <td className="px-4 py-3">
                          <span className={"px-2 py-0.5 rounded text-[11px] font-bold " + getStatusBadgeClasses(r.finalStatus || r.status)}>
                            {r.approvalStageLabel || r.finalStatus || r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-neutral-600">
                          {r.managementDecision !== 'PENDING' ? (
                            <span className="font-semibold text-neutral-900">
                              {r.managementDecision}: {r.managementDecidedByName || 'Management'}
                            </span>
                          ) : (
                            <span className="text-amber-700 font-medium italic">Pending Approver Decision</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Queue List */}
      {loading ? (
        <div className="p-12 text-center text-neutral-500 bg-white rounded-xl border border-neutral-200/80">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-500" />
          <span className="text-xs">Loading queue...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 text-xs">
          {error}
        </div>
      ) : requests.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-dashed border-neutral-300">
          <Users className="w-8 h-8 mx-auto text-neutral-500 mb-2" />
          <h3 className="text-sm font-semibold text-neutral-800">No Requests Matching Criteria</h3>
          <p className="text-xs text-neutral-500 mt-1">There are currently no leave requests in this view.</p>
        </div>
      ) : (
        <>
          {/* Mobile HR Approval Cards (<768px) */}
          <div id="hr-approval-mobile-cards" className="md:hidden space-y-3">
            {requests.map((r) => (
              <div
                key={`mobile-hr-${r.id}`}
                className={`${getStatusCardClasses(r.hrDecision || 'PENDING')} p-4 space-y-3`}
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
                    {r.approvalStageLabel || r.finalStatus || r.status}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white/85 border border-purple-200/80 space-y-1.5 text-xs">
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
                  onClick={() => handleOpenReview(r.id)}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  {r.teamLeaderDecision === 'APPROVED' && r.hrDecision === 'PENDING' && r.finalStatus === 'PENDING'
                    ? 'Review & Decide Request'
                    : 'View Request Details'}
                </button>
              </div>
            ))}
          </div>

          {/* Desktop HR Queue Table (>=768px) */}
          <div className={`${MT_COLOR_CARDS.purple} hidden md:block overflow-hidden`}>
          <div className="overflow-x-auto bg-white/95">
          <table className="w-full text-left text-xs text-neutral-700">
            <thead className="bg-purple-50/90 text-purple-950 font-bold border-b border-purple-200">
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
                    {(r.teamLeaderDecision || 'PENDING') === 'APPROVED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Approved
                      </span>
                    ) : r.teamLeaderDecision === 'REJECTED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                        <XCircle className="w-3 h-3 text-rose-600" />
                        TL Rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                        <Clock className="w-3 h-3 text-amber-500" />
                        Pending TL
                      </span>
                    )}
                    {r.teamLeaderRemarks && (
                      <span className="block text-[10px] text-neutral-500 italic truncate max-w-[130px]">
                        "{r.teamLeaderRemarks}"
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.hrDecision === 'APPROVED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Approved
                      </span>
                    ) : r.hrDecision === 'REJECTED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                        <XCircle className="w-3 h-3 text-rose-600" />
                        Rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                        <Clock className="w-3 h-3 text-amber-500" />
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.managementDecision === 'APPROVED' ? (
                      <span className="text-[11px] font-semibold text-emerald-700">Approved</span>
                    ) : r.managementDecision === 'REJECTED' ? (
                      <span className="text-[11px] font-semibold text-rose-700">Rejected</span>
                    ) : (
                      <span className="text-[11px] text-neutral-500">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${getStatusBadgeClasses(
                        r.finalStatus || r.status
                      )}`}
                    >
                      {r.approvalStageLabel || r.finalStatus || r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      id={`hr-review-btn-${r.id}`}
                      onClick={() => handleOpenReview(r.id)}
                      className="px-3 py-1.5 bg-purple-700 text-white rounded-lg font-medium text-xs hover:bg-purple-800 transition-colors cursor-pointer"
                    >
                      {r.teamLeaderDecision === 'APPROVED' && r.hrDecision === 'PENDING' && r.finalStatus === 'PENDING'
                        ? 'Review & Decide'
                        : 'View Details'}
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
      </>
      )}

      {/* Review Drawer / Modal */}
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
                  <ShieldCheck className="w-4 h-4 text-neutral-800" />
                  HR Review & Recommendation
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

            {/* Request Summary Bento Grid */}
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
                <span className="text-[11px] text-neutral-500 block">Timing Classification</span>
                <span className="font-semibold text-neutral-900 mt-0.5 block">
                  {activeDetails.request.requestClassification}
                </span>
                <span className="text-neutral-500 text-[10px]">
                  Notice: {activeDetails.request.noticeMinutes} min
                </span>
              </div>
            </div>

            {/* Reason & Documents */}
            <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200/80 text-xs space-y-2">
              <div>
                <span className="font-semibold text-neutral-900 block">Reason Provided:</span>
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

            {/* Employee Past Leave History & Attendance Pattern */}
            <div className="border border-neutral-200 rounded-lg p-3.5 space-y-2.5">
              <h4 className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-neutral-600" />
                Employee Historical Attendance Insights
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 bg-neutral-50 rounded border border-neutral-200 text-center">
                  <span className="text-neutral-500 text-[10px] block">Total Applied</span>
                  <span className="font-bold text-neutral-900 text-sm">
                    {activeDetails.employeeHistory.totalRequests}
                  </span>
                </div>
                <div className="p-2 bg-sky-50 rounded border border-sky-200 text-center">
                  <span className="text-sky-700 text-[10px] block">Approved</span>
                  <span className="font-bold text-sky-900 text-sm">
                    {activeDetails.employeeHistory.approvedRequests}
                  </span>
                </div>
                <div className="p-2 bg-amber-50 rounded border border-amber-200 text-center">
                  <span className="text-amber-700 text-[10px] block">Late Requests</span>
                  <span className="font-bold text-amber-900 text-sm">
                    {activeDetails.employeeHistory.lateRequests}
                  </span>
                </div>
                <div className="p-2 bg-rose-50 rounded border border-rose-200 text-center">
                  <span className="text-rose-700 text-[10px] block">Emergencies</span>
                  <span className="font-bold text-rose-900 text-sm">
                    {activeDetails.employeeHistory.emergencyRequests}
                  </span>
                </div>
              </div>

              {/* Employee Balances Breakdown */}
              {activeDetails.employeeHistory.balances.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] text-neutral-500 font-medium block mb-1">
                    Current Leave Balances ({activeDetails.employeeHistory.balances[0].year}):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {activeDetails.employeeHistory.balances.map((b) => (
                      <span
                        key={b.id}
                        className="px-2 py-1 rounded bg-neutral-100 text-neutral-700 text-[11px] border border-neutral-200"
                      >
                        <strong className="text-neutral-900">{b.leaveTypeCode}:</strong> {b.available} Days available ({b.used} Days used)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Stage 1 Team Leader Decision Box */}
            <div className="p-3.5 rounded-lg border border-neutral-200 bg-neutral-50 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-900">Stage 1: Team Leader Decision</span>
                <span
                  className={`px-2 py-0.5 rounded font-semibold text-[11px] ${getStatusBadgeClasses(
                    activeDetails.request.teamLeaderDecision || 'PENDING'
                  )}`}
                >
                  {activeDetails.request.teamLeaderDecision || 'PENDING'}
                </span>
              </div>
              {activeDetails.request.teamLeaderRemarks && (
                <p className="italic text-neutral-700 bg-white p-2 rounded border border-neutral-200">
                  "{activeDetails.request.teamLeaderRemarks}"
                </p>
              )}
            </div>

            {/* Current Review State */}
            {activeDetails.request.teamLeaderDecision === 'REJECTED' ? (
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <span className="font-semibold block">Team Leader Rejected (Read-Only):</span>
                This request was rejected by the Team Leader at Stage 1. HR cannot approve, reject, override, or move this request to Top Management.
              </div>
            ) : (activeDetails.request.teamLeaderDecision || 'PENDING') !== 'APPROVED' ? (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <span className="font-semibold block">Pending Team Leader Approval:</span>
                HR can only review and action requests that have passed Stage 1 Team Leader approval.
              </div>
            ) : activeDetails.request.hrDecision !== 'PENDING' ? (
              <div className="p-3.5 rounded-lg bg-neutral-100 border border-neutral-200 text-xs">
                <span className="font-semibold text-neutral-900">HR Decision already submitted:</span>
                <span className="ml-2 font-bold">{activeDetails.request.hrDecision}</span>
                {activeDetails.request.hrRemarks && (
                  <p className="mt-1 italic text-neutral-600">"{activeDetails.request.hrRemarks}"</p>
                )}
                <span className="text-[10px] text-neutral-500 block mt-1">
                  Decided by {activeDetails.request.hrDecidedByName} at {activeDetails.request.hrDecidedAt ? formatDateTime(activeDetails.request.hrDecidedAt) : 'N/A'}
                </span>
              </div>
            ) : (
              /* Review Action Form */
              <div className="space-y-3 pt-2 border-t border-neutral-100">
                <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-600">
                  <span className="font-semibold text-neutral-900">Stage 2 HR Decision:</span> Approving or rejecting forwards this request to Top Management (Stage 3) for final decision.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    HR Remarks / Policy Verification Notes
                  </label>
                  <textarea
                    rows={3}
                    value={decisionComment}
                    onChange={(e) => setDecisionComment(e.target.value)}
                    placeholder="Provide notes on document verification, coverage, or reasons for rejection..."
                    className="w-full text-sm sm:text-xs p-3 rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                  />
                  <span className="text-[10px] text-neutral-500 block mt-0.5">
                    * Remarks are required when rejecting.
                  </span>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
                  {canReturnForCorrection &&
                    (activeDetails.request.finalStatus == null || activeDetails.request.finalStatus === 'PENDING') &&
                    activeDetails.request.managementDecision !== 'APPROVED' &&
                    activeDetails.request.managementDecision !== 'REJECTED' &&
                    activeDetails.request.status !== 'APPROVED' &&
                    activeDetails.request.status !== 'REJECTED' &&
                    activeDetails.request.status !== 'CANCELLED' &&
                    activeDetails.request.balancePosted !== true &&
                    activeDetails.request.teamLeaderDecision === 'APPROVED' && (
                    <button
                      type="button"
                      id="btn-hr-return-for-correction"
                      disabled={returningRequest || submittingDecision}
                      onClick={handleReturnForCorrection}
                      className="px-4 py-2.5 min-h-[44px] text-xs font-bold bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {returningRequest ? 'Returning…' : 'Return to Employee for Reason Correction'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveDetails(null)}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl border border-neutral-200 sm:border-transparent text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    id="btn-hr-recommend-reject"
                    disabled={submittingDecision}
                    onClick={() => handleDecisionSubmit('REJECTED')}
                    className="px-4 py-2.5 min-h-[44px] text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    HR Reject (Send to Top Management)
                  </button>
                  <button
                    type="button"
                    id="btn-hr-recommend-approve"
                    disabled={submittingDecision}
                    onClick={() => handleDecisionSubmit('APPROVED')}
                    className="px-4 py-2.5 min-h-[44px] text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    HR Approve (Send to Top Management)
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
