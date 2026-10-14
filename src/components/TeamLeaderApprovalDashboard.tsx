import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  FileText,
  User,
  Paperclip,
  History,
  AlertCircle,
  Ban,
  ShieldAlert,
  Info,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
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

export function TeamLeaderApprovalDashboard() {
  const [requests, setRequests] = useState<LeaveRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'REVIEWED'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state for reviewing a specific request
  const [selectedRequest, setSelectedRequest] = useState<{
    request: LeaveRequestDto;
    events: LeaveRequestEventDto[];
    employeeHistory: EmployeeLeaveHistoryDto;
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Decision form state
  const [remarks, setRemarks] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const fetchTeamLeaderRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await apiFetch(`/api/team-leader/leave-requests?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load Reporting Person leave requests');
      }
      setRequests(data.leaveRequests || data.requests || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamLeaderRequests();
  }, [statusFilter]);

  const handleOpenReviewModal = async (reqId: number) => {
    setLoadingDetails(true);
    setDecisionError(null);
    try {
      const res = await apiFetch(`/api/team-leader/leave-requests/${reqId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load request details');
      }
      setSelectedRequest(data);
      setRemarks(data.request.teamLeaderRemarks || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSubmitDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedRequest) return;
    setDecisionError(null);

    if (decision === 'REJECTED' && !remarks.trim()) {
      setDecisionError('Reporting Person remarks are required when rejecting a leave request.');
      return;
    }

    setSubmittingDecision(true);
    try {
      const res = await apiFetch(
        `/api/team-leader/leave-requests/${selectedRequest.request.id}/decision`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision,
            remarks: remarks.trim() || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit Reporting Person decision');
      }
      setSelectedRequest(null);
      setRemarks('');
      fetchTeamLeaderRequests();
    } catch (err: any) {
      setDecisionError(err.message);
    } finally {
      setSubmittingDecision(false);
    }
  };

  const getStatusBadge = (status: string, decision?: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${getStatusBadgeClasses('APPROVED')}`}>
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            {decision || 'Approved'}
          </span>
        );
      case 'REJECTED':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${getStatusBadgeClasses('REJECTED')}`}>
            <XCircle className="w-3 h-3 text-rose-600" />
            {decision || 'Rejected'}
          </span>
        );
      case 'CANCELLED':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${getStatusBadgeClasses('CANCELLED')}`}>
            <Ban className="w-3 h-3 text-neutral-500" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${getStatusBadgeClasses('PENDING')}`}>
            <Clock className="w-3 h-3 text-amber-600" />
            {decision || 'Pending'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header — Teal/Cyan Visual Identity */}
      <div className={`${MT_COLOR_CARDS.teal} p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-100 border border-teal-300 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-teal-700" />
            </div>
            <h2 className="text-xl font-bold text-teal-950">
              Reporting Person Approval Queue (Stage 1)
            </h2>
          </div>
          <p className="text-xs text-teal-900/80 mt-1">
            Review leave requests from employees assigned to you as Reporting Person. Approved requests forward to HR (Stage 2); rejected requests stop here.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white/90 p-1 rounded-xl border border-teal-200 text-xs flex-1 sm:flex-none">
            {(['PENDING', 'REVIEWED', 'ALL'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`flex-1 sm:flex-none px-3 py-2 min-h-[40px] rounded-lg font-medium transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-teal-700 text-white shadow-xs font-bold'
                    : 'text-teal-900 hover:text-teal-800 hover:bg-teal-50'
                }`}
              >
                {st === 'PENDING' ? 'Pending Reporting Person' : st === 'REVIEWED' ? 'Reviewed' : 'All'}
              </button>
            ))}
          </div>

          <button
            onClick={fetchTeamLeaderRequests}
            className="p-2.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center bg-white border border-teal-200 rounded-xl text-teal-800 hover:bg-teal-100 cursor-pointer"
            title="Refresh Queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-700' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stage 1 KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`${MT_COLOR_CARDS.teal} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-900 block">Team Queue</span>
          <span className="text-2xl font-black text-teal-950 mt-1 block">{requests.length}</span>
          <span className="text-[11px] text-teal-800">Visible requests</span>
        </div>
        <div className={`${MT_COLOR_CARDS.amber} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 block">Pending Reporting Person</span>
          <span className="text-2xl font-black text-amber-950 mt-1 block">
            {requests.filter((r) => (r.teamLeaderDecision || 'PENDING') === 'PENDING').length}
          </span>
          <span className="text-[11px] text-amber-800">Awaiting Stage 1</span>
        </div>
        <div className={`${MT_COLOR_CARDS.emerald} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 block">Approved by Reporting Person</span>
          <span className="text-2xl font-black text-emerald-950 mt-1 block">
            {requests.filter((r) => r.teamLeaderDecision === 'APPROVED').length}
          </span>
          <span className="text-[11px] text-emerald-800">Forwarded to HR</span>
        </div>
        <div className={`${MT_COLOR_CARDS.rose} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-900 block">Rejected by Reporting Person</span>
          <span className="text-2xl font-black text-rose-950 mt-1 block">
            {requests.filter((r) => r.teamLeaderDecision === 'REJECTED').length}
          </span>
          <span className="text-[11px] text-rose-800">Stopped at Stage 1</span>
        </div>
      </div>

      {/* Info Banner */}
      <div className={`${MT_COLOR_CARDS.cyan} p-3.5 text-xs text-cyan-950 flex items-start gap-2.5`}>
        <Info className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Stage 1 — Reporting Person Authority:</span> You are the first approval stage for employees assigned to you. If you <span className="font-semibold">Approve</span>, the request moves to <span className="font-semibold">Reporting Person Approved &rarr; HR Pending</span>. If you <span className="font-semibold">Reject</span>, the status becomes <span className="font-semibold">Reporting Person Rejected</span> and the request stops here.
        </div>
      </div>

      {/* Search Bar */}
      <div className={`${MT_COLOR_CARDS.teal} p-3.5 flex items-center gap-2`}>
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-teal-700 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchTeamLeaderRequests()}
            placeholder="Search by employee name, employee code, or request number..."
            className="w-full pl-10 pr-4 py-2.5 min-h-[44px] text-sm sm:text-xs bg-white rounded-xl border border-teal-200 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
        <button
          onClick={fetchTeamLeaderRequests}
          className="px-4 py-2.5 min-h-[44px] bg-teal-700 text-white rounded-xl text-xs font-bold hover:bg-teal-800 cursor-pointer shrink-0"
        >
          Search
        </button>
      </div>

      {/* Table / Queue List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-neutral-200/80 text-neutral-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
          <span className="text-xs">Loading Reporting Person approval queue...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 text-xs flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-dashed border-neutral-300">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-neutral-800">No Requests in Queue</h3>
          <p className="text-xs text-neutral-500 mt-1">
            No team leave requests match the current filter criteria.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Approval Cards (<768px) */}
          <div id="tl-approval-mobile-cards" className="md:hidden space-y-3">
            {requests.map((r) => (
              <div
                key={`mobile-tl-${r.id}`}
                className={`${getStatusCardClasses(r.teamLeaderDecision || 'PENDING')} p-4 space-y-3`}
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
                        employeeName={r.employeeName || `Employee #${r.employeeId}`}
                      >
                        {r.employeeName || `Employee #${r.employeeId}`}
                      </Employee360Link>
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {r.employeeCode || `EMP-${r.employeeId}`} &bull; Submitted {formatDate(r.createdAt)}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {getStatusBadge(
                      r.teamLeaderDecision || 'PENDING',
                      `Reporting Person: ${r.teamLeaderDecision || 'PENDING'}`
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/85 border border-teal-200/80 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${getLeaveTypeBadgeClasses(
                        r.leaveTypeCode || r.leaveTypeName
                      )}`}
                    >
                      {r.leaveTypeName} ({r.leaveTypeCode})
                    </span>
                    <span className="font-mono font-bold text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200">
                      {Number(r.totalDays)} Days ({r.dayType === 'HALF_DAY' ? 'Half Day' : 'Full Day'})
                    </span>
                  </div>
                  <div className="text-neutral-600 font-medium">
                    {formatDate(r.startDate)} {r.startDate !== r.endDate ? `to ${formatDate(r.endDate)}` : ''}
                  </div>
                  {(r.attachmentName || r.attachmentPath) && (
                    <div className="inline-flex items-center gap-1 pt-0.5 text-[11px] text-neutral-700 font-medium">
                      <Paperclip className="w-3 h-3 text-neutral-500 shrink-0" />
                      <span className="truncate max-w-[220px]">
                        {r.attachmentName || 'Attachment'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {getStatusBadge(r.hrDecision, `HR: ${r.hrDecision}`)}
                  {getStatusBadge(
                    r.finalStatus,
                    r.approvalStageLabel || `Final: ${r.finalStatus}`
                  )}
                </div>

                <button
                  onClick={() => handleOpenReviewModal(r.id)}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  {(r.teamLeaderDecision || 'PENDING') === 'PENDING' && r.finalStatus === 'PENDING'
                    ? 'Review & Decide Request'
                    : 'View Request Details'}
                </button>
              </div>
            ))}
          </div>

          {/* Desktop Queue Table (>=768px) */}
          <div className={`${MT_COLOR_CARDS.teal} hidden md:block overflow-hidden`}>
            <div className="overflow-x-auto bg-white/95">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-teal-200 bg-teal-50/90 text-[11px] font-bold text-teal-950 uppercase tracking-wider">
                  <th className="py-3 px-4">Request #</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Leave Type & Dates</th>
                  <th className="py-3 px-4">Stage 1 (Reporting Person)</th>
                  <th className="py-3 px-4">Stage 2 (HR)</th>
                  <th className="py-3 px-4">Stage 3 (Final)</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-neutral-900">
                      {r.requestNumber}
                      <div className="text-[10px] font-sans font-normal text-neutral-500 mt-0.5">
                        {formatDate(r.createdAt)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-neutral-900">
                        <Employee360Link
                          employeeId={r.employeeId}
                          employeeCode={r.employeeCode}
                          employeeName={r.employeeName || `Employee #${r.employeeId}`}
                        >
                          {r.employeeName || `Employee #${r.employeeId}`}
                        </Employee360Link>
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">
                        <Employee360Link
                          employeeId={r.employeeId}
                          employeeCode={r.employeeCode || `EMP-${r.employeeId}`}
                          employeeName={r.employeeName}
                          variant="badge"
                        >
                          {r.employeeCode || `EMP-${r.employeeId}`}
                        </Employee360Link>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div>
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${getLeaveTypeBadgeClasses(
                            r.leaveTypeCode || r.leaveTypeName
                          )}`}
                        >
                          {r.leaveTypeName} ({r.leaveTypeCode})
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-1">
                        {formatDate(r.startDate)} {r.startDate !== r.endDate ? `to ${formatDate(r.endDate)}` : ''} &bull;{' '}
                        <span className="font-semibold text-neutral-700">{Number(r.totalDays)} Days</span> (
                        {r.dayType === 'HALF_DAY' ? 'Half Day 0.5' : 'Full Day'})
                      </div>
                      {(r.attachmentName || r.attachmentPath) && (
                        <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[10px] text-neutral-700 font-medium">
                          <Paperclip className="w-2.5 h-2.5 text-neutral-500" />
                          <span className="truncate max-w-[140px]">
                            {r.attachmentName || 'Attachment'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(
                        r.teamLeaderDecision || 'PENDING',
                        `Reporting Person: ${r.teamLeaderDecision || 'PENDING'}`
                      )}
                      {r.assignedTeamLeaderName && (
                        <div className="text-[10px] text-neutral-600 font-medium mt-1">
                          Assigned:{' '}
                          <Employee360Link
                            employeeId={r.assignedTeamLeaderId || undefined}
                            employeeName={r.assignedTeamLeaderName}
                          >
                            {r.assignedTeamLeaderName}
                          </Employee360Link>
                        </div>
                      )}
                      {r.teamLeaderRemarks && (
                        <div className="text-[10px] text-neutral-500 italic mt-1 max-w-[160px] truncate">
                          "{r.teamLeaderRemarks}"
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(r.hrDecision, `HR: ${r.hrDecision}`)}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(
                        r.finalStatus,
                        r.approvalStageLabel || `Final: ${r.finalStatus}`
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        id={`btn-tl-review-${r.id}`}
                        onClick={() => handleOpenReviewModal(r.id)}
                        className="px-3 py-1.5 bg-teal-700 text-white rounded-lg text-xs font-semibold hover:bg-teal-800 transition-colors cursor-pointer"
                      >
                        {(r.teamLeaderDecision || 'PENDING') === 'PENDING' && r.finalStatus === 'PENDING'
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

      {/* Review & Inspection Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl border border-neutral-200 space-y-5 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Mobile Drag Handle */}
            <div className="sm:hidden flex justify-center pt-1 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-neutral-300" />
            </div>
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold bg-neutral-100 px-2.5 py-1 rounded text-neutral-900">
                    {selectedRequest.request.requestNumber}
                  </span>
                  <h3 className="text-base font-semibold text-neutral-900">
                    Stage 1: Reporting Person Review & Decision
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Submitted on {formatDateTime(selectedRequest.request.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {decisionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{decisionError}</span>
              </div>
            )}

            {/* Top Grid: Request Details + Employee Profile Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: Leave Request Details */}
              <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-2.5 text-xs">
                <h4 className="font-semibold text-neutral-900 flex items-center gap-1.5 border-b border-neutral-200 pb-2">
                  <FileText className="w-3.5 h-3.5 text-neutral-600" />
                  Leave Application Details
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Leave Type</span>
                    <span className="font-semibold text-neutral-900">
                      {selectedRequest.request.leaveTypeName} ({selectedRequest.request.leaveTypeCode})
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Duration</span>
                    <span className="font-semibold text-neutral-900">
                      {Number(selectedRequest.request.totalDays)} day(s) &bull;{' '}
                      {selectedRequest.request.dayType === 'HALF_DAY'
                        ? `Half Day (0.5) - ${selectedRequest.request.halfDayPeriod || 'FIRST_HALF'}`
                        : 'Full Day (1.0)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Dates</span>
                    <span className="font-medium text-neutral-800">
                      {formatDate(selectedRequest.request.startDate)} to {formatDate(selectedRequest.request.endDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Current Stage</span>
                    <span className="font-medium text-neutral-800">
                      {selectedRequest.request.approvalStageLabel || 'Pending Reporting Person'}
                    </span>
                  </div>
                  {selectedRequest.request.assignedTeamLeaderName && (
                    <div className="col-span-2">
                      <span className="text-neutral-500 block text-[11px]">
                        Resolved Reporting Person (Start Date {formatDate(selectedRequest.request.startDate)})
                      </span>
                      <span className="font-semibold text-neutral-900">
                        {selectedRequest.request.assignedTeamLeaderName}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-1">
                  <span className="text-neutral-500 block text-[11px]">Employee Reason</span>
                  <p className="p-2 bg-white rounded border border-neutral-200 text-neutral-800 mt-1">
                    {selectedRequest.request.reason}
                  </p>
                </div>

                {(selectedRequest.request.attachmentName ||
                  selectedRequest.request.attachmentPath) && (
                  <div className="pt-1">
                    <span className="text-neutral-500 block text-[11px]">Attached Document</span>
                    <LeaveAttachmentBox
                      requestId={selectedRequest.request.id}
                      attachmentName={selectedRequest.request.attachmentName}
                      attachmentPath={selectedRequest.request.attachmentPath}
                      attachmentSize={selectedRequest.request.attachmentSize}
                      attachmentMime={selectedRequest.request.attachmentMime}
                      compact
                    />
                  </div>
                )}
              </div>

              {/* Right: Employee History & Balances */}
              <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-2.5 text-xs">
                <h4 className="font-semibold text-neutral-900 flex items-center gap-1.5 border-b border-neutral-200 pb-2">
                  <User className="w-3.5 h-3.5 text-neutral-600" />
                  Employee Leave Summary & Balances
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Employee</span>
                    <span className="font-semibold text-neutral-900">
                      <Employee360Link
                        employeeId={selectedRequest.request.employeeId}
                        employeeCode={selectedRequest.employeeHistory.employeeCode}
                        employeeName={selectedRequest.employeeHistory.employeeName}
                      >
                        {selectedRequest.employeeHistory.employeeName} (
                        {selectedRequest.employeeHistory.employeeCode})
                      </Employee360Link>
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Department</span>
                    <span className="font-medium text-neutral-800">
                      {selectedRequest.employeeHistory.departmentName}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="p-2 bg-white rounded border border-neutral-200 text-center">
                    <div className="text-sm font-bold text-sky-700">
                      {selectedRequest.employeeHistory.approvedRequests}
                    </div>
                    <div className="text-[10px] text-neutral-500">Approved</div>
                  </div>
                  <div className="p-2 bg-white rounded border border-neutral-200 text-center">
                    <div className="text-sm font-bold text-orange-700">
                      {selectedRequest.employeeHistory.pendingRequests}
                    </div>
                    <div className="text-[10px] text-neutral-500">Pending</div>
                  </div>
                  <div className="p-2 bg-white rounded border border-neutral-200 text-center">
                    <div className="text-sm font-bold text-rose-700">
                      {selectedRequest.employeeHistory.lateRequests}
                    </div>
                    <div className="text-[10px] text-neutral-500">Late Notice</div>
                  </div>
                </div>

                {/* Available Balances */}
                <div className="pt-1">
                  <span className="text-neutral-500 block text-[11px] mb-1">
                    Current Available Balances
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRequest.employeeHistory.balances.map((b) => (
                      <span
                        key={b.id}
                        className="px-2 py-1 bg-white rounded border border-neutral-200 text-[11px] font-medium text-neutral-800"
                      >
                        {b.leaveTypeCode}: <strong className="text-emerald-700">{b.available}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Event Audit Trail */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-neutral-500" />
                Approval Event Audit Trail
              </h4>
              <div className="max-h-36 overflow-y-auto space-y-1.5 p-2.5 rounded-lg bg-neutral-50 border border-neutral-200">
                {selectedRequest.events.map((ev, i) => (
                  <div
                    key={ev.id || i}
                    className="flex items-start justify-between text-[11px] bg-white p-2 rounded border border-neutral-200/70"
                  >
                    <div>
                      <span className="font-semibold text-neutral-900">{ev.eventType}</span>{' '}
                      <span className="text-neutral-500">by {ev.actorRole}</span>
                      {ev.remarks && (
                        <div className="text-neutral-600 italic mt-0.5">"{ev.remarks}"</div>
                      )}
                    </div>
                    <span className="text-[10px] text-neutral-500">
                      {formatDateTime(ev.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reporting Person Decision Form */}
            {selectedRequest.request.finalStatus === 'PENDING' ? (
              <div className="p-4 rounded-xl bg-sky-50/50 border border-sky-200 space-y-3">
                <label className="block text-xs font-semibold text-neutral-900">
                  Reporting Person Remarks (Mandatory if Rejecting)
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter operational coverage notes or Reporting Person approval/rejection remarks..."
                  className="w-full text-sm sm:text-xs p-3 bg-white rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                />
                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={submittingDecision}
                    onClick={() => handleSubmitDecision('REJECTED')}
                    className="px-4 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject (Stop Request)</span>
                  </button>
                  <button
                    type="button"
                    disabled={submittingDecision}
                    onClick={() => handleSubmitDecision('APPROVED')}
                    className="px-4 py-2.5 min-h-[44px] bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve (Send to HR)</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-neutral-100 border border-neutral-200 text-xs text-neutral-600 text-center">
                This leave request is already finalized ({selectedRequest.request.finalStatus}) and cannot be modified.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
