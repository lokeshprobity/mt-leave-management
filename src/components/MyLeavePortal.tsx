import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  Clock,
  FileText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Ban,
  Paperclip,
  History,
  Info,
  ChevronRight,
  ShieldCheck,
  User,
  Trash2,
} from 'lucide-react';
import { apiFetch, getActiveEmployeeId, parseApiJson } from '../lib/api.ts';
import { formatDate, formatDateTime } from '../utils/dateFormat.ts';
import {
  MT_THEME,
  MT_COLOR_CARDS,
  getStatusBadgeClasses,
  getStatusCardClasses,
  getLeaveTypeBadgeClasses,
} from '../utils/theme.ts';
import { LeaveAttachmentBox } from './LeaveAttachmentBox.tsx';
import { validateMeaningfulLeaveReason } from '../utils/leaveReasonValidation.ts';
import { Employee360Link } from './Employee360Trigger.tsx';
import {
  LeaveRequestDto,
  LeaveRequestEventDto,
  LeaveTypeDto,
  DayType,
  HalfDayPeriod,
  ReasonCategory,
} from '../types/leave.ts';

const toDateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface MyLeavePortalProps {
  targetEmployeeId?: number;
  targetEmployeeName?: string;
}

export function MyLeavePortal({ targetEmployeeId }: MyLeavePortalProps = {}) {
  const [requests, setRequests] = useState<LeaveRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedRequestEvents, setSelectedRequestEvents] = useState<{
    request: LeaveRequestDto;
    events: LeaveRequestEventDto[];
  } | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [returnedEditRequest, setReturnedEditRequest] = useState<LeaveRequestDto | null>(null);
  const [returnedEditReason, setReturnedEditReason] = useState('');
  const [returnedEditError, setReturnedEditError] = useState<string | null>(null);
  const [submittingReturnedEdit, setSubmittingReturnedEdit] = useState(false);

  // Form State
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDto[]>([]);
  const [formLeaveTypeId, setFormLeaveTypeId] = useState<number>(1);
  const [formIsPaid, setFormIsPaid] = useState<boolean>(true);
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formDayType, setFormDayType] = useState<DayType>('FULL_DAY');
  const [formHalfDayPeriod, setFormHalfDayPeriod] = useState<HalfDayPeriod>('FIRST_HALF');
  const [formReasonCategory, setFormReasonCategory] = useState<ReasonCategory>('OTHER');
  const [formReason, setFormReason] = useState('');
  const [formEmergencyException, setFormEmergencyException] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleRemoveSelectedAttachment = () => {
    setAttachmentFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  const [submittingApply, setSubmittingApply] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const selectedFormLeaveType = leaveTypes.find((lt) => lt.id === Number(formLeaveTypeId));
  const isCasualLeave = selectedFormLeaveType?.code?.trim().toUpperCase() === 'CL';

  const fetchMyRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const requestUrl = targetEmployeeId ? `/api/leave-requests/my?employeeId=${encodeURIComponent(String(targetEmployeeId))}` : '/api/leave-requests/my';
      const res = await apiFetch(requestUrl);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch leave requests');
      }
      setRequests(data.leaveRequests || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaveTypes = async () => {
    try {
      const res = await apiFetch('/api/leave-types');
      const data = await res.json();
      if (res.ok && data.leaveTypes) {
        setLeaveTypes(data.leaveTypes);
        if (data.leaveTypes.length > 0) {
          setFormLeaveTypeId(data.leaveTypes[0].id);
          setFormIsPaid(data.leaveTypes[0].code?.trim().toUpperCase() === 'CL' ? true : Boolean(data.leaveTypes[0].isPaid));
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchMyRequests();
    fetchLeaveTypes();
  }, [targetEmployeeId]);

  useEffect(() => {
    const effectiveEnd = formDayType === 'HALF_DAY' ? formStartDate : formEndDate;
    if (!showApplyModal || !formStartDate || !effectiveEnd || !formLeaveTypeId) {
      setPreviewData(null);
      return;
    }
    let cancelled = false;
    const runPreview = async () => {
      setLoadingPreview(true);
      try {
        const res = await apiFetch('/api/leave-requests/calculate', {
          method: 'POST',
          body: JSON.stringify({
            ...(targetEmployeeId ? { employeeId: targetEmployeeId, submittedOnBehalfOf: true } : {}),
            leaveTypeId: Number(formLeaveTypeId),
            startDate: formStartDate,
            endDate: effectiveEnd,
            dayType: formDayType,
            halfDayPeriod: formDayType === 'HALF_DAY' ? formHalfDayPeriod : null,
            reasonCategory: formReasonCategory,
            emergencyException: formEmergencyException,
            documentProvided: Boolean(attachmentFile),
          }),
        });
        const data = await res.json();
        if (!cancelled && res.ok && data.preview) {
          setPreviewData(data.preview);
        }
      } catch {
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    };
    runPreview();
    return () => {
      cancelled = true;
    };
  }, [
    showApplyModal,
    targetEmployeeId,
    formLeaveTypeId,
    formStartDate,
    formEndDate,
    formDayType,
    formHalfDayPeriod,
    formReasonCategory,
    formEmergencyException,
    attachmentFile,
  ]);

  const handleOpenEvents = async (req: LeaveRequestDto) => {
    try {
      const res = await apiFetch(`/api/leave-requests/${req.id}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedRequestEvents({
          request: data.leaveRequest,
          events: data.events || [],
        });
      }
    } catch (err: any) {
      setError('Failed to load request timeline: ' + err.message);
    }
  };

  const handleCancelRequest = async (id: number) => {
    setSubmittingCancel(true);
    try {
      const res = await apiFetch(`/api/leave-requests/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel request');
      }
      setCancellingId(null);
      setCancelReason('');
      fetchMyRequests();
    } catch (err: any) {
      setError('Error cancelling leave request: ' + err.message);
    } finally {
      setSubmittingCancel(false);
    }
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const reasonError = validateMeaningfulLeaveReason(formReason);
    if (reasonError) {
      setFormError(reasonError);
      return;
    }
    setSubmittingApply(true);

    try {
      let attachmentPayload = null;
      if (attachmentFile) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(attachmentFile);
        });
        const base64Data = await base64Promise;
        const uploadRes = await apiFetch('/api/leave-requests/upload-document', {
          method: 'POST',
          body: JSON.stringify({
            fileName: attachmentFile.name,
            mimeType: attachmentFile.type,
            fileSize: attachmentFile.size,
            fileData: base64Data,
          }),
        });
        const uploadData = await parseApiJson(uploadRes);
        if (!uploadRes.ok) {
          throw new Error(uploadData.error || `Failed to upload document (HTTP ${uploadRes.status})`);
        }
        attachmentPayload = uploadData.attachment;
      }

      const selectedLeaveType = leaveTypes.find((lt) => lt.id === Number(formLeaveTypeId));
      const effectiveEndDate = formDayType === 'HALF_DAY' ? formStartDate : formEndDate || formStartDate;
      const effectiveHalfDaySession = formDayType === 'HALF_DAY' ? formHalfDayPeriod : null;
      const isEmergencySelected =
        formEmergencyException ||
        Boolean(selectedLeaveType?.name?.toLowerCase().includes('emergency')) ||
        selectedLeaveType?.code?.toUpperCase() === 'EMERGENCY' ||
        ['MEDICAL_EMERGENCY', 'FAMILY_EMERGENCY', 'ACCIDENT_OR_TRAVEL_EMERGENCY'].includes(formReasonCategory);

      const payload = {
        employeeId: targetEmployeeId ?? getActiveEmployeeId(),
        ...(targetEmployeeId ? { submittedOnBehalfOf: true } : {}),
        leaveTypeId: Number(formLeaveTypeId),
        isPaid: selectedLeaveType?.code?.trim().toUpperCase() === 'CL' ? true : formIsPaid,
        leaveType: selectedLeaveType?.code || String(formLeaveTypeId),
        startDate: formStartDate,
        endDate: effectiveEndDate,
        dayType: formDayType,
        durationUnit: formDayType,
        halfDayPeriod: effectiveHalfDaySession,
        halfDaySession: effectiveHalfDaySession,
        reasonCategory: formReasonCategory,
        reason: formReason,
        emergencyException: formEmergencyException,
        isEmergency: isEmergencySelected,
        attachmentPath: attachmentPayload?.attachmentPath || attachmentPayload?.path || null,
        attachmentName: attachmentPayload?.attachmentName || attachmentPayload?.name || null,
        attachmentSize: attachmentPayload?.attachmentSize || attachmentPayload?.size || null,
        attachmentMime: attachmentPayload?.attachmentMime || attachmentPayload?.mime || null,
      };

      const res = await apiFetch('/api/leave-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await parseApiJson(res);
      if (!res.ok) {
        throw new Error(data.error || `Failed to submit leave request (HTTP ${res.status})`);
      }

      setShowApplyModal(false);
      setFormStartDate('');
      setFormEndDate('');
      setFormReason('');
      setFormIsPaid(true);
      handleRemoveSelectedAttachment();
      fetchMyRequests();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmittingApply(false);
    }
  };

  const openReturnedRequestEditor = (request: LeaveRequestDto) => {
    setReturnedEditRequest(request);
    setReturnedEditReason(request.reason || '');
    setReturnedEditError(null);
  };

  const handleReapplyReturnedRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnedEditRequest) return;
    const reason = returnedEditReason.trim();
    const reasonError = validateMeaningfulLeaveReason(reason);
    if (reasonError) {
      setReturnedEditError(reasonError);
      return;
    }

    setSubmittingReturnedEdit(true);
    setReturnedEditError(null);
    try {
      const res = await apiFetch(`/api/leave-requests/${returnedEditRequest.id}/reapply`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      const data = await parseApiJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to re-submit corrected leave request');
      setReturnedEditRequest(null);
      setReturnedEditReason('');
      setError(null);
      await fetchMyRequests();
    } catch (err: any) {
      setReturnedEditError(err.message || 'Failed to re-submit corrected leave request');
    } finally {
      setSubmittingReturnedEdit(false);
    }
  };

  const getFinalStatusBadge = (r: LeaveRequestDto) => {
    const status = r.status === 'RETURNED_FOR_CORRECTION' ? r.status : r.finalStatus || r.status;
    switch (status) {
      case 'APPROVED':
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${getStatusBadgeClasses('APPROVED')}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{r.approvalStageLabel || 'Approved'}</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${getStatusBadgeClasses('REJECTED')}`}>
            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>{r.teamLeaderDecision === 'REJECTED' ? 'Team Leader Rejected' : r.approvalStageLabel || 'Rejected'}</span>
          </span>
        );
      case 'RETURNED_FOR_CORRECTION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Returned for Reason Correction</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${getStatusBadgeClasses('CANCELLED')}`}>
            <Ban className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <span>Cancelled</span>
          </span>
        );
      default: {
        let stageText = r.approvalStageLabel || 'Pending Team Leader';
        if (!r.approvalStageLabel) {
          if ((r.teamLeaderDecision || 'PENDING') === 'PENDING') {
            stageText = 'Pending Team Leader';
          } else if (r.teamLeaderDecision === 'APPROVED' && r.hrDecision === 'PENDING') {
            stageText = 'Team Leader Approved → HR Pending';
          } else if (r.hrDecision === 'APPROVED' && r.managementDecision === 'PENDING') {
            stageText = 'HR Approved → Pending Top Management';
          } else if (r.hrDecision === 'REJECTED' && r.managementDecision === 'PENDING') {
            stageText = 'HR Rejected → Sent to Top Management';
          }
        }
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${getStatusBadgeClasses('PENDING')}`}>
            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>{stageText}</span>
          </span>
        );
      }
    }
  };

  const getDecisionBadge = (decision: string | null | undefined, label: string) => {
    switch (decision) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>{label}: Approved</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600 shrink-0" />
            <span>{label}: Rejected</span>
          </span>
        );
      case 'NOT_REQUIRED':
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
            <ShieldCheck className="w-3 h-3 text-red-700 shrink-0" />
            <span>{label}: Not Required (Direct to Mgmt)</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200">
            <Clock className="w-3 h-3 text-neutral-500 shrink-0" />
            <span>{label}: Pending</span>
          </span>
        );
    }
  };

  const getClassificationBadge = (cls?: string) => {
    switch (cls) {
      case 'LATE_LEAVE_REQUEST':
        return (
          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${MT_THEME.badge.warning}`}>
            Late Request
          </span>
        );
      case 'POST_START_LEAVE_REQUEST':
        return (
          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${MT_THEME.badge.danger}`}>
            Post-Start
          </span>
        );
      default:
        return (
          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${MT_THEME.badge.info}`}>
            Standard Notice
          </span>
        );
    }
  };

  const approvedTotalCount = requests.filter((r) => (r.finalStatus || r.status) === 'APPROVED').length;
  const pendingTotalCount = requests.filter((r) => (r.finalStatus || r.status) === 'PENDING').length;
  const rejectedTotalCount = requests.filter((r) => (r.finalStatus || r.status) === 'REJECTED').length;
  const [mobileStatusFilter, setMobileStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const mobileFilteredRequests = requests.filter((r) => {
    if (mobileStatusFilter === 'ALL') return true;
    return (r.finalStatus || r.status) === mobileStatusFilter;
  });

  return (
    <div className="space-y-4 md:space-y-6 min-w-0">
      {/* =====================================================================
          MOBILE MY LEAVE / LEAVE APPLICATION VIEW (<768px ONLY)
         ===================================================================== */}
      <div id="my-leave-mobile-view" className="md:hidden space-y-4 min-w-0">
        {/* 1. Mobile Header & Primary Leave Application Trigger */}
        <section
          id="mobile-my-leave-header"
          className={`${MT_THEME.cardBrand} p-4 space-y-3 min-w-0 overflow-hidden`}
        >
          <div className="flex items-start justify-between gap-2.5 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-red-700 shrink-0" />
                <h2 className="text-base font-bold text-neutral-900 truncate">
                  My Leave Applications
                </h2>
              </div>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Submit leave requests, check HR recommendations, and track Top Management final approvals
              </p>
            </div>
            <button
              id="btn-mobile-refresh-leave"
              type="button"
              onClick={fetchMyRequests}
              title="Refresh requests"
              aria-label="Refresh requests"
              className={`${MT_THEME.mobile.touchTarget} px-3 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-red-200 hover:text-red-700 active:bg-red-50 text-xs font-semibold gap-1.5 shrink-0 cursor-pointer`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <button
            id="btn-mobile-apply-leave-open"
            type="button"
            onClick={() => setShowApplyModal(true)}
            className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl ${MT_THEME.button.primary} text-xs font-semibold flex items-center justify-center gap-2`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Apply for Leave</span>
          </button>
        </section>

        {/* 2. Mobile Leave Summary Status Cards */}
        <section id="mobile-my-leave-summary" className="space-y-2.5 min-w-0">
          <div className="grid grid-cols-2 gap-2.5">
            <div className={`${MT_COLOR_CARDS.sky} p-3.5 min-w-0`}>
              <span className="text-[10px] font-bold text-sky-900 uppercase tracking-wider block">
                Total Requests
              </span>
              <div className="mt-1.5 flex items-baseline justify-between gap-1">
                <span className="text-xl font-bold text-sky-800">{requests.length}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${MT_THEME.badge.info}`}>
                  All
                </span>
              </div>
            </div>

            <div className={`${MT_COLOR_CARDS.amber} p-3.5 min-w-0`}>
              <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                Pending
              </span>
              <div className="mt-1.5 flex items-baseline justify-between gap-1">
                <span className="text-xl font-bold text-amber-700">{pendingTotalCount}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${MT_THEME.badge.warning}`}>
                  In Review
                </span>
              </div>
            </div>

            <div className={`${MT_COLOR_CARDS.emerald} p-3.5 min-w-0`}>
              <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider block">
                Approved
              </span>
              <div className="mt-1.5 flex items-baseline justify-between gap-1">
                <span className="text-xl font-bold text-emerald-700">{approvedTotalCount}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${MT_THEME.badge.success}`}>
                  Final
                </span>
              </div>
            </div>

            <div className={`${MT_COLOR_CARDS.rose} p-3.5 min-w-0`}>
              <span className="text-[10px] font-bold text-rose-900 uppercase tracking-wider block">
                Rejected
              </span>
              <div className="mt-1.5 flex items-baseline justify-between gap-1">
                <span className="text-xl font-bold text-rose-700">{rejectedTotalCount}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${MT_THEME.badge.danger}`}>
                  Closed
                </span>
              </div>
            </div>
          </div>

          {/* Compact Mobile Workflow Informational Card */}
          <div className={`p-3.5 rounded-xl ${MT_THEME.alert.info} text-xs flex items-start gap-2.5 min-w-0`}>
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div className="min-w-0 leading-relaxed">
              <span className="font-bold block">
                3-Stage Approval Workflow (TL &rarr; HR &rarr; Top Management)
              </span>
              <span className="text-[11px]">
                Half-Day = 0.5d, Full-Day = 1.0d per working day. Balances are deducted only after Top Management final approval.
              </span>
            </div>
          </div>
        </section>

        {/* 3. Mobile My Leave History (Stacked Cards with Interactive Mobile Filter Tabs) */}
        <section id="mobile-my-leave-history" className="space-y-3 min-w-0">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
              My Leave History ({mobileFilteredRequests.length})
            </h3>
          </div>

          {/* Mobile Segmented Status Filter Bar (>=44px Touch Targets) */}
          <div
            id="mobile-my-leave-filter-bar"
            className="grid grid-cols-4 gap-1.5 p-1 bg-neutral-200/70 rounded-xl"
          >
            {(
              [
                { id: 'ALL', label: `All (${requests.length})` },
                { id: 'PENDING', label: `Pending (${pendingTotalCount})` },
                { id: 'APPROVED', label: `Approved (${approvedTotalCount})` },
                { id: 'REJECTED', label: `Rejected (${rejectedTotalCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                id={`btn-mobile-leave-filter-${tab.id.toLowerCase()}`}
                type="button"
                onClick={() => setMobileStatusFilter(tab.id)}
                className={`min-h-[44px] px-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer truncate ${
                  mobileStatusFilter === tab.id
                    ? 'bg-red-700 text-white shadow-2xs'
                    : 'text-neutral-700 hover:text-neutral-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className={`${MT_THEME.card} p-8 text-center text-neutral-500`}>
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-700" />
              <span className="text-xs text-neutral-500">Loading leave requests...</span>
            </div>
          ) : error ? (
            <div className={`p-4 rounded-xl ${MT_THEME.alert.danger} text-xs flex items-center gap-2.5`}>
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          ) : mobileFilteredRequests.length === 0 ? (
            <div className={`${MT_THEME.card} p-8 text-center space-y-3`}>
              <Calendar className="w-8 h-8 mx-auto text-neutral-500" />
              <div>
                <h4 className="text-sm font-bold text-neutral-900">No Leave Requests Found</h4>
                <p className="text-xs text-neutral-500 mt-1">
                  {mobileStatusFilter === 'ALL'
                    ? 'You have not submitted any leave applications yet. Tap below to submit your first leave request.'
                    : `No ${mobileStatusFilter.toLowerCase()} leave requests found.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyModal(true)}
                className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl ${MT_THEME.button.primary} text-xs font-semibold flex items-center justify-center gap-2`}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Apply for Leave</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 min-w-0">
              {mobileFilteredRequests.map((r) => (
                <article
                  key={r.id}
                  id={`mobile-leave-card-${r.id}`}
                  className={`${
                    (r.finalStatus === 'APPROVED' || r.status === 'APPROVED') && r.dayType === 'HALF_DAY'
                      ? MT_COLOR_CARDS.teal
                      : getStatusCardClasses(r.finalStatus || r.status)
                  } p-4 space-y-3 min-w-0 overflow-hidden`}
                >
                  {/* Card Top Header: Request Number + Final Status */}
                  <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b border-black/10">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                          {r.requestNumber}
                        </span>
                        {getClassificationBadge(r.requestClassification)}
                      </div>
                      <p className="text-[11px] text-neutral-500">
                        Submitted: {formatDate(r.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 max-w-full">{getFinalStatusBadge(r)}</div>
                  </div>

                  {/* Card Leave Summary Block */}
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-2 text-xs min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-neutral-500">Leave Type</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold text-right truncate ${getLeaveTypeBadgeClasses(
                          r.leaveTypeCode || r.leaveTypeName
                        )}`}
                      >
                        {r.leaveTypeName} ({r.leaveTypeCode})
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-neutral-500">Payment Type</span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${r.isPaid !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {r.isPaid !== false ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-neutral-500">Date Range</span>
                      <span className="font-semibold text-neutral-800 text-right">
                        {formatDate(r.startDate)}
                        {r.startDate !== r.endDate ? ` to ${formatDate(r.endDate)}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-neutral-500">Duration</span>
                      <span className="font-bold text-red-700 text-right">
                        {Number(r.totalDays)} working day(s) &bull;{' '}
                        {r.dayType === 'HALF_DAY'
                          ? `Half Day (${r.halfDayPeriod === 'SECOND_HALF' ? '2nd Half' : '1st Half'})`
                          : 'Full Day'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-200/70">
                      <span className="text-[11px] font-semibold text-neutral-500">Balance Posting</span>
                      {r.balancePosted ? (
                        <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Deducted ({Number(r.totalDays)} Days)</span>
                        </span>
                      ) : (
                        <span className="text-neutral-500 font-medium">Not deducted</span>
                      )}
                    </div>
                  </div>

                  {/* Card 3-Stage Approval Status Breakdown */}
                  <div className="space-y-1.5 text-xs min-w-0">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                      Approval Pipeline Status
                    </span>
                    <div className="p-2.5 rounded-lg bg-white border border-neutral-200/80 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-[11px] font-medium text-neutral-600">Stage 1: Team Leader</span>
                        {getDecisionBadge(r.teamLeaderDecision || 'PENDING', 'TL')}
                      </div>
                      {(r.assignedTeamLeaderName || r.reportingManagerName) && (
                        <div className="text-[11px] text-neutral-600">
                          Approver:{' '}
                          <Employee360Link
                            employeeId={r.assignedTeamLeaderId || r.reportingManagerId}
                            employeeName={r.assignedTeamLeaderName || r.reportingManagerName}
                          />
                        </div>
                      )}
                      {r.teamLeaderRemarks && (
                        <p className="text-[11px] text-neutral-500 italic break-words">
                          TL: "{r.teamLeaderRemarks}"
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-neutral-100">
                        <span className="text-[11px] font-medium text-neutral-600">Stage 2: HR Review</span>
                        {getDecisionBadge(r.hrDecision, 'HR')}
                      </div>
                      {r.hrRemarks && (
                        <p className="text-[11px] text-neutral-500 italic break-words">
                          HR: "{r.hrRemarks}"
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-neutral-100">
                        <span className="text-[11px] font-medium text-neutral-600">Stage 3: Top Management</span>
                        {getDecisionBadge(r.managementDecision, 'Mgmt')}
                      </div>
                      {r.managementRemarks && (
                        <p className="text-[11px] text-neutral-500 italic break-words">
                          Mgmt: "{r.managementRemarks}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Reason & Attachment Block */}
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/70 text-xs text-neutral-700 space-y-2 min-w-0">
                    <div className="break-words">
                      <span className="font-semibold text-neutral-900">Reason: </span>
                      <span>{r.reason}</span>
                    </div>
                    {r.status === 'RETURNED_FOR_CORRECTION' && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                        <p className="font-semibold text-amber-900">Reason correction required</p>
                        <p className="text-amber-900">{r.returnReason || 'Please submit a more meaningful leave reason.'}</p>
                        <button type="button" onClick={() => openReturnedRequestEditor(r)} className="min-h-[44px] px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold hover:bg-amber-800">
                          Correct Reason & Reapply
                        </button>
                      </div>
                    )}
                    {(r.attachmentName || r.attachmentPath) && (
                      <LeaveAttachmentBox
                        requestId={r.id}
                        attachmentName={r.attachmentName}
                        attachmentPath={r.attachmentPath}
                        attachmentSize={r.attachmentSize}
                        attachmentMime={r.attachmentMime}
                        compact
                      />
                    )}
                  </div>

                  {/* Touch-Friendly Mobile Card Actions (>=44px height) */}
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEvents(r)}
                      className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl ${MT_THEME.button.secondary} text-xs font-semibold flex items-center justify-center gap-2`}
                    >
                      <History className="w-4 h-4 text-red-700 shrink-0" />
                      <span>View Approval Timeline</span>
                    </button>

                    {(r.finalStatus === 'PENDING' || r.status === 'PENDING') && (
                      <button
                        type="button"
                        onClick={() => setCancellingId(r.id)}
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl ${MT_THEME.button.dangerSoft} text-xs font-semibold flex items-center justify-center gap-2`}
                      >
                        <Ban className="w-4 h-4 shrink-0" />
                        <span>Cancel Request</span>
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* =====================================================================
          DESKTOP MY LEAVE VIEW (>=768px PRESERVED UNCHANGED)
         ===================================================================== */}
      <div id="my-leave-desktop-view" className="hidden md:block space-y-6">
        {/* Top Header Card */}
        <div className={`${MT_COLOR_CARDS.slate} p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-sky-100 border border-sky-300 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-sky-700" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-neutral-900">My Leave Applications</h2>
                <p className="text-xs text-neutral-600 mt-0.5">
                  Submit leave requests, check HR recommendations, and track Top Management final approvals
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchMyRequests}
              className="p-2.5 bg-white border border-slate-300 rounded-lg text-neutral-700 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-300 transition-colors cursor-pointer"
              title="Refresh requests"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-700' : ''}`} />
            </button>
            <button
              id="btn-apply-leave"
              onClick={() => setShowApplyModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-700 text-white rounded-lg text-xs font-bold hover:bg-red-800 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Apply for Leave</span>
            </button>
          </div>
        </div>

        {/* Desktop KPI Summary Strip */}
        <div className="grid grid-cols-4 gap-4">
          <div className={`${MT_COLOR_CARDS.sky} p-4 flex items-center justify-between`}>
            <div>
              <span className="text-[11px] font-bold text-sky-900 uppercase tracking-wider block">Total Requests</span>
              <span className="text-2xl font-bold text-sky-800 mt-1 block">{requests.length}</span>
            </div>
            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${MT_THEME.badge.info}`}>All Time</span>
          </div>
          <div className={`${MT_COLOR_CARDS.amber} p-4 flex items-center justify-between`}>
            <div>
              <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">Pending Review</span>
              <span className="text-2xl font-bold text-amber-700 mt-1 block">{pendingTotalCount}</span>
            </div>
            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${MT_THEME.badge.warning}`}>In Pipeline</span>
          </div>
          <div className={`${MT_COLOR_CARDS.emerald} p-4 flex items-center justify-between`}>
            <div>
              <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block">Approved</span>
              <span className="text-2xl font-bold text-emerald-700 mt-1 block">{approvedTotalCount}</span>
            </div>
            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${MT_THEME.badge.success}`}>Finalized</span>
          </div>
          <div className={`${MT_COLOR_CARDS.rose} p-4 flex items-center justify-between`}>
            <div>
              <span className="text-[11px] font-bold text-rose-900 uppercase tracking-wider block">Rejected</span>
              <span className="text-2xl font-bold text-rose-700 mt-1 block">{rejectedTotalCount}</span>
            </div>
            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${MT_THEME.badge.danger}`}>Closed</span>
          </div>
        </div>

        {/* Rules Notice */}
        <div className={`p-3.5 ${MT_COLOR_CARDS.sky} text-xs text-sky-900 flex items-start gap-2.5`}>
          <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-sky-950">Approval Workflow (Employee &rarr; Team Leader &rarr; HR &rarr; Top Management):</span> Stage 1: Assigned Team Leader reviews your request. Stage 2: HR conducts policy verification (if HR rejects, the request is still sent to Top Management with HR remarks). Stage 3: Top Management grants final approval or rejection. Half-Day Leave equals <span className="font-semibold">0.5 day</span> and Full-Day Leave equals <span className="font-semibold">1.0 day</span> per working day. Leave balances are deducted only after Top Management final approval. <span className="font-semibold">Note: One half-day leave per calendar month will be allowed without any salary deduction.</span>
          </div>
        </div>

        {/* Requests List */}
        {loading ? (
          <div className={`p-12 text-center text-neutral-500 ${MT_COLOR_CARDS.slate}`}>
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-700" />
            <span className="text-xs">Loading leave requests...</span>
          </div>
        ) : error ? (
          <div className={`p-6 ${MT_COLOR_CARDS.rose} text-rose-800 text-xs flex items-center gap-3`}>
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        ) : requests.length === 0 ? (
          <div className={`p-12 text-center ${MT_COLOR_CARDS.slate}`}>
            <Calendar className="w-8 h-8 mx-auto text-sky-600 mb-2" />
            <h3 className="text-sm font-semibold text-neutral-800">No Leave Requests Found</h3>
            <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
              You have not submitted any leave applications yet. Click "Apply for Leave" to create your first request.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {requests.map((r) => (
              <div
                key={r.id}
                id={`leave-request-card-${r.id}`}
                className={`${
                  (r.finalStatus === 'APPROVED' || r.status === 'APPROVED') && r.dayType === 'HALF_DAY'
                    ? MT_COLOR_CARDS.teal
                    : getStatusCardClasses(r.finalStatus || r.status)
                } p-5 transition-all space-y-3`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/10 pb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-md">
                      {r.requestNumber}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded text-xs font-semibold ${getLeaveTypeBadgeClasses(
                        r.leaveTypeCode || r.leaveTypeName
                      )}`}
                    >
                      {r.leaveTypeName} ({r.leaveTypeCode})
                    </span>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${r.isPaid !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {r.isPaid !== false ? 'Paid' : 'Unpaid'}
                    </span>
                    {getClassificationBadge(r.requestClassification)}
                    <span className="text-xs text-neutral-500">
                      Submitted: {formatDate(r.createdAt)}
                    </span>
                  </div>
                  <div>{getFinalStatusBadge(r)}</div>
                </div>

                {/* Middle Information Row */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                  <div>
                    <span className="text-neutral-500 block text-[11px]">Leave Duration</span>
                    <span className="font-medium text-neutral-800 mt-0.5 block">
                      {formatDate(r.startDate)} {r.startDate !== r.endDate ? `to ${formatDate(r.endDate)}` : ''}
                    </span>
                    <span className="text-neutral-500 text-[11px]">
                      {Number(r.totalDays)} working day(s) &bull;{' '}
                      {r.dayType === 'HALF_DAY'
                        ? `Half Day (0.5) — ${r.halfDayPeriod === 'SECOND_HALF' ? '2nd Half' : '1st Half'}`
                        : 'Full Day'}
                    </span>
                  </div>

                  <div>
                    <span className="text-neutral-500 block text-[11px]">Stage 1: Team Leader</span>
                    <div className="mt-1">{getDecisionBadge(r.teamLeaderDecision || 'PENDING', 'TL')}</div>
                    {(r.assignedTeamLeaderName || r.reportingManagerName) && (
                      <span className="text-neutral-600 text-[11px] font-medium block mt-1">
                        Approver:{' '}
                        <Employee360Link
                          employeeId={r.assignedTeamLeaderId || r.reportingManagerId}
                          employeeName={r.assignedTeamLeaderName || r.reportingManagerName}
                        />
                      </span>
                    )}
                    {r.teamLeaderRemarks && (
                      <span className="text-neutral-500 text-[11px] block mt-1 italic">
                        "{r.teamLeaderRemarks}"
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-neutral-500 block text-[11px]">Stage 2: HR Review</span>
                    <div className="mt-1">{getDecisionBadge(r.hrDecision, 'HR')}</div>
                    {r.hrRemarks && (
                      <span className="text-neutral-500 text-[11px] block mt-1 italic">
                        "{r.hrRemarks}"
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-neutral-500 block text-[11px]">Stage 3: Top Management</span>
                    <div className="mt-1">{getDecisionBadge(r.managementDecision, 'Mgmt')}</div>
                    {r.managementRemarks && (
                      <span className="text-neutral-500 text-[11px] block mt-1 italic">
                        "{r.managementRemarks}"
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-neutral-500 block text-[11px]">Balance Posting</span>
                    <span className="font-medium text-neutral-800 mt-1 block">
                      {r.balancePosted ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Deducted ({Number(r.totalDays)} Days)
                        </span>
                      ) : (
                        <span className="text-neutral-500">Not deducted</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Reason Snippet */}
                <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-150 text-xs text-neutral-700 space-y-1.5">
                  <div>
                    <span className="font-semibold text-neutral-900">Reason:</span> {r.reason}
                  </div>
                  {r.status === 'RETURNED_FOR_CORRECTION' && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                      <p className="font-semibold text-amber-900">Reason correction required</p>
                      <p className="text-amber-900">{r.returnReason || 'Please submit a more meaningful leave reason.'}</p>
                      <button type="button" onClick={() => openReturnedRequestEditor(r)} className="min-h-[44px] px-4 py-2 rounded-lg bg-amber-700 text-white font-semibold hover:bg-amber-800">
                        Correct Reason & Reapply
                      </button>
                    </div>
                  )}
                  {(r.attachmentName || r.attachmentPath) && (
                    <LeaveAttachmentBox
                      requestId={r.id}
                      attachmentName={r.attachmentName}
                      attachmentPath={r.attachmentPath}
                      attachmentSize={r.attachmentSize}
                      attachmentMime={r.attachmentMime}
                      compact
                    />
                  )}
                </div>

                {/* Actions & Audit Timeline Trigger */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => handleOpenEvents(r)}
                    className="inline-flex items-center gap-1.5 text-xs text-neutral-700 hover:text-neutral-950 font-medium cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5 text-neutral-500" />
                    <span>View Approval Timeline</span>
                  </button>

                  {(r.finalStatus === 'PENDING' || r.status === 'PENDING') && (
                    <button
                      onClick={() => setCancellingId(r.id)}
                      className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium px-2.5 py-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancel Request</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancellation Modal (Mobile & Desktop Responsive) */}
      {cancellingId && (
        <div
          id="leave-cancel-modal"
          className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-end md:items-center justify-center p-3 md:p-4 z-50"
        >
          <div className="bg-white rounded-2xl md:rounded-xl max-w-md w-full p-4 md:p-6 shadow-xl border border-neutral-200 border-t-3 border-t-red-700 space-y-4 max-h-[90dvh] overflow-y-auto">
            <h3 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Cancel Leave Request</span>
            </h3>
            <p className="text-xs text-neutral-500">
              Are you sure you want to cancel this leave request? This action cannot be undone.
            </p>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Cancellation Reason
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Explain why you are cancelling this request..."
                rows={3}
                className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCancellingId(null);
                  setCancelReason('');
                }}
                className="min-h-[44px] md:min-h-0 px-3.5 py-2 text-xs font-semibold text-neutral-700 border border-neutral-200 md:border-transparent rounded-xl md:rounded-lg hover:text-neutral-900 cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => handleCancelRequest(cancellingId)}
                disabled={submittingCancel}
                className="min-h-[44px] md:min-h-0 px-4 py-2 text-xs font-semibold bg-rose-600 text-white rounded-xl md:rounded-lg hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {submittingCancel ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Timeline Modal (Mobile & Desktop Responsive) */}
      {selectedRequestEvents && (
        <div
          id="leave-timeline-modal"
          className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-end md:items-center justify-center p-3 md:p-4 z-50"
        >
          <div className="bg-white rounded-2xl md:rounded-xl max-w-lg w-full p-4 md:p-6 shadow-xl border border-neutral-200 border-t-3 border-t-red-700 space-y-4 max-h-[88dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-red-700 shrink-0" />
                  <span className="truncate">Approval Audit Trail &amp; Timeline</span>
                </h3>
                <p className="text-xs text-neutral-500 font-mono mt-0.5 truncate">
                  Request: {selectedRequestEvents.request.requestNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRequestEvents(null)}
                aria-label="Close timeline"
                className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 inline-flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-700 text-base font-semibold cursor-pointer shrink-0"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              {selectedRequestEvents.events.length === 0 ? (
                <p className="text-xs text-neutral-500 text-center py-4">No events logged yet.</p>
              ) : (
                selectedRequestEvents.events.map((ev, idx) => (
                  <div
                    key={ev.id || idx}
                    className="p-3 rounded-lg bg-neutral-50 border border-neutral-200/70 text-xs space-y-1 relative min-w-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-neutral-900">{ev.eventType}</span>
                      <span className="text-[10px] text-neutral-500">
                        {formatDateTime(ev.createdAt)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                      <span>Actor: {ev.actorRole}</span>
                      {ev.actorName && (
                        <span>
                          &bull;{' '}
                          <Employee360Link
                            employeeId={ev.actorUserId ?? ev.actorId}
                            employeeCode={ev.actorEmployeeCode}
                            employeeName={ev.actorName}
                          />
                        </span>
                      )}
                    </div>
                    {ev.remarks && (
                      <p className="text-neutral-700 mt-1 italic bg-white p-2 rounded border border-neutral-200 text-[11px] break-words">
                        {ev.remarks}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setSelectedRequestEvents(null)}
                className="w-full md:w-auto min-h-[44px] md:min-h-0 px-4 py-2 bg-red-700 text-white rounded-xl md:rounded-lg text-xs font-semibold cursor-pointer hover:bg-red-800"
              >
                Close Timeline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply Leave Modal (Mobile App-Like Form <768px & Preserved Desktop Modal >=768px) */}
      {returnedEditRequest && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="returned-leave-edit-title">
          <form onSubmit={handleReapplyReturnedRequest} className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-neutral-200">
            <div className="p-5 border-b border-neutral-200 bg-amber-50">
              <h2 id="returned-leave-edit-title" className="text-lg font-bold text-neutral-900">Correct and Resubmit Leave</h2>
              <p className="mt-1 text-sm text-neutral-700">Request {returnedEditRequest.requestNumber} was returned for correction. Update the leave reason below and resubmit it for approval from Stage 1.</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Return comment</p>
                <p className="mt-1 text-sm text-amber-950">{returnedEditRequest.returnReason || 'Please provide a meaningful leave reason.'}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-neutral-500">Leave type</span><p className="font-semibold text-neutral-900">{returnedEditRequest.leaveTypeName || returnedEditRequest.leaveTypeCode || 'Leave'}</p></div>
                <div><span className="text-neutral-500">Dates</span><p className="font-semibold text-neutral-900">{formatDate(returnedEditRequest.startDate)} – {formatDate(returnedEditRequest.endDate)}</p></div>
              </div>
              <div>
                <label htmlFor="returned-leave-reason" className="block text-sm font-semibold text-neutral-900 mb-1.5">Corrected leave reason <span className="text-rose-600">*</span></label>
                <textarea id="returned-leave-reason" value={returnedEditReason} onChange={(e) => setReturnedEditReason(e.target.value)} rows={4} maxLength={1000} required className="w-full rounded-xl border border-neutral-300 p-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="Explain the actual reason for your leave in clear words." />
                <p className="mt-1 text-xs text-neutral-500">Enter at least 10 characters and two meaningful words.</p>
              </div>
              {returnedEditError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{returnedEditError}</p>}
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 p-4 border-t border-neutral-200">
              <button type="button" disabled={submittingReturnedEdit} onClick={() => { setReturnedEditRequest(null); setReturnedEditError(null); }} className="min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={submittingReturnedEdit} className="min-h-[44px] rounded-lg bg-amber-700 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50">{submittingReturnedEdit ? 'Resubmitting…' : 'Save Correction & Resubmit'}</button>
            </div>
          </form>
        </div>
      )}

      {showApplyModal && (
        <div
          id="leave-application-modal"
          className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-end md:items-center justify-center p-2.5 md:p-4 z-50"
        >
          <div className="bg-white rounded-2xl md:rounded-xl max-w-lg w-full p-4 md:p-6 shadow-xl border border-neutral-200 border-t-3 border-t-red-700 space-y-4 max-h-[92dvh] md:max-h-[90vh] overflow-y-auto overscroll-contain min-w-0">
            <div className="w-10 h-1 rounded-full bg-neutral-300 mx-auto -mt-1 mb-1 md:hidden" />
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 gap-2">
              <h3 className="text-base font-semibold text-neutral-900 flex items-center gap-2 min-w-0">
                <Calendar className="w-4 h-4 text-red-700 shrink-0" />
                <span className="truncate">Submit Leave Application</span>
              </h3>
              <button
                id="btn-close-apply-modal"
                type="button"
                onClick={() => setShowApplyModal(false)}
                aria-label="Close leave application form"
                className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 inline-flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-700 text-base font-semibold cursor-pointer shrink-0"
              >
                &times;
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="break-words">{formError}</span>
              </div>
            )}

            <form onSubmit={handleApplySubmit} className="space-y-4 min-w-0">
              {/* Section 1: Leave Type Selection */}
              <div
                id="leave-form-section-type"
                className="p-3 md:p-0 rounded-xl md:rounded-none bg-neutral-50/70 md:bg-transparent border border-neutral-200/80 md:border-0 space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Leave Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="select-leave-type"
                    value={formLeaveTypeId}
                    onChange={(e) => {
                      const nextId = Number(e.target.value);
                      const nextType = leaveTypes.find((lt) => lt.id === nextId);
                      setFormLeaveTypeId(nextId);
                      setFormIsPaid(nextType?.code?.trim().toUpperCase() === 'CL' ? true : Boolean(nextType?.isPaid));
                    }}
                    className="w-full min-h-[44px] md:min-h-0 text-xs p-2.5 bg-white rounded-xl md:rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
                  >
                    {leaveTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code}) {t.isPaid ? '— Paid' : '— Unpaid'}
                      </option>
                    ))}
                  </select>
                </div>

                {isCasualLeave ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    CL is always treated as Paid Leave.
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                      Leave Payment Type <span className="text-rose-500">*</span>
                    </label>
                    <select
                      id="select-leave-payment-type"
                      value={formIsPaid ? 'PAID' : 'UNPAID'}
                      onChange={(e) => setFormIsPaid(e.target.value === 'PAID')}
                      className="w-full min-h-[44px] md:min-h-0 text-xs p-2.5 bg-white rounded-xl md:rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
                    >
                      <option value="PAID">Paid Leave</option>
                      <option value="UNPAID">Unpaid Leave</option>
                    </select>
                    <p className="mt-1 text-[11px] text-neutral-500">Paid leave is deducted from this leave type's balance after final approval. Unpaid leave does not deduct paid leave balance.</p>
                  </div>
                )}

                {/* Full-Day / Half-Day Controls */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Leave Duration Unit <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      id="btn-day-type-full"
                      type="button"
                      onClick={() => setFormDayType('FULL_DAY')}
                      className={`min-h-[48px] p-2.5 rounded-xl md:rounded-lg border text-left transition-all cursor-pointer ${
                        formDayType === 'FULL_DAY'
                          ? 'border-red-700 bg-red-700 text-white shadow-xs'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <div className="text-xs font-semibold">Full Day</div>
                      <div className={`text-[11px] ${formDayType === 'FULL_DAY' ? 'text-neutral-200' : 'text-neutral-500'}`}>
                        1.0 day per working date
                      </div>
                    </button>
                    <button
                      id="btn-day-type-half"
                      type="button"
                      onClick={() => {
                        setFormDayType('HALF_DAY');
                        if (formStartDate) setFormEndDate(formStartDate);
                      }}
                      className={`min-h-[48px] p-2.5 rounded-xl md:rounded-lg border text-left transition-all cursor-pointer ${
                        formDayType === 'HALF_DAY'
                          ? 'border-red-700 bg-red-700 text-white shadow-xs'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <div className="text-xs font-semibold">Half Day</div>
                      <div className={`text-[11px] ${formDayType === 'HALF_DAY' ? 'text-neutral-200' : 'text-neutral-500'}`}>
                        0.5 day business unit
                      </div>
                    </button>
                  </div>
                </div>

                {/* Half Day Session & Reason Category (Stacked on Mobile, 2-Col on Desktop) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {formDayType === 'HALF_DAY' && (
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Half Day Session
                      </label>
                      <select
                        id="select-half-day-period"
                        value={formHalfDayPeriod}
                        onChange={(e) => setFormHalfDayPeriod(e.target.value as HalfDayPeriod)}
                        className="w-full min-h-[44px] md:min-h-0 text-xs p-2.5 bg-white rounded-xl md:rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
                      >
                        <option value="FIRST_HALF">First Half (0.5 Day)</option>
                        <option value="SECOND_HALF">Second Half (0.5 Day)</option>
                      </select>
                    </div>
                  )}
                  <div className={formDayType === 'HALF_DAY' ? '' : 'md:col-span-2'}>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Reason Category
                    </label>
                    <select
                      id="select-reason-category"
                      value={formReasonCategory}
                      onChange={(e) => setFormReasonCategory(e.target.value as ReasonCategory)}
                      className="w-full min-h-[44px] md:min-h-0 text-xs p-2.5 bg-white rounded-xl md:rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
                    >
                      <option value="OTHER">Standard / Personal / Planned</option>
                      <option value="MEDICAL_EMERGENCY">Medical Emergency</option>
                      <option value="FAMILY_EMERGENCY">Family Emergency</option>
                      <option value="ACCIDENT_OR_TRAVEL_EMERGENCY">Accident or Travel Emergency</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Date Selection (Stacked on Mobile for Easy Touch Input, 2-Col on Desktop) */}
              <div
                id="leave-form-section-dates"
                className="p-3 md:p-0 rounded-xl md:rounded-none bg-neutral-50/70 md:bg-transparent border border-neutral-200/80 md:border-0 grid grid-cols-1 md:grid-cols-2 gap-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-start-date"
                    type="date"
                    required
                    min={formDayType === 'HALF_DAY' ? toDateInputValue(new Date()) : undefined}
                    max={formDayType === 'HALF_DAY' ? (() => { const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 30); return toDateInputValue(maxDate); })() : undefined}
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full min-h-[44px] md:min-h-0 text-xs p-2.5 bg-white rounded-xl md:rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
                  />
                </div>

                {formDayType === 'FULL_DAY' && (
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      End Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="input-end-date"
                      type="date"
                      required
                      min={formStartDate || undefined}
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="w-full min-h-[44px] md:min-h-0 text-xs p-2.5 bg-white rounded-xl md:rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
                    />
                  </div>
                )}
              </div>

              {/* Section 3: Live Leave Calculation & Schedule Summary Card */}
              {(loadingPreview || previewData) && (
                <div
                  id="leave-form-section-summary"
                  className="p-3.5 rounded-xl md:rounded-lg bg-neutral-50 border border-neutral-200/90 space-y-2.5 text-xs min-w-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-neutral-900">
                    <span>Schedule &amp; Working-Day Calculation</span>
                    {loadingPreview ? (
                      <span className="text-[11px] text-neutral-500">Calculating...</span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded bg-red-700 text-white text-[11px] font-bold">
                        {previewData?.totalWorkingDays ?? 0} Leave Day(s)
                      </span>
                    )}
                  </div>
                  {previewData && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] text-neutral-600 pt-1">
                        <div>
                          <span className="text-neutral-500 block">Applicable Shift:</span>
                          <span className="font-medium text-neutral-800 break-words">
                            {previewData.applicableShiftSummary || 'Standard Schedule'}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block">Balance Impact:</span>
                          <span className="font-medium text-neutral-800">
                            {previewData.currentAvailableBalance} &rarr; {previewData.balanceAfterApproval} days
                          </span>
                        </div>
                        {previewData.normalFullDayCutoffDateStr && (
                          <div>
                            <span className="text-neutral-500 block">Normal Full-Day Cutoff:</span>
                            <span className="font-medium text-neutral-800">
                              {formatDate(previewData.normalFullDayCutoffDateStr)} {previewData.normalFullDayCutoffTimeUsed || '07:00'}
                            </span>
                          </div>
                        )}
                        {previewData.shiftStartTimeUsed && (
                          <div>
                            <span className="text-neutral-500 block">Emergency Full-Day Cutoff:</span>
                            <span className="font-medium text-neutral-800">
                              Before {formatDate(previewData.startDate)} {previewData.shiftStartTimeUsed}
                            </span>
                          </div>
                        )}
                        {previewData.resolvedTeamLeaderName && (
                          <div className="sm:col-span-2 pt-1.5 border-t border-neutral-200/70">
                            <span className="text-neutral-500 block">
                              Stage 1 Team Leader (Resolved by Start Date {formatDate(previewData.startDate)}):
                            </span>
                            <span className="font-semibold text-neutral-900 break-words">
                              {previewData.resolvedTeamLeaderName}
                              {previewData.resolvedTeamName ? ` — ${previewData.resolvedTeamName}` : ''}
                              {previewData.resolvedTeamLeaderPeriodLabel
                                ? ` (${previewData.resolvedTeamLeaderPeriodLabel})`
                                : ''}
                            </span>
                          </div>
                        )}
                      </div>
                      {previewData.holidayDays?.length > 0 && (
                        <div className="text-[11px] text-emerald-700 bg-emerald-50/80 border border-emerald-200 px-2.5 py-1.5 rounded break-words">
                          <span className="font-semibold">Department Holiday Excluded: </span>
                          {previewData.holidayDays.map((h: any) => `${h.name} (${formatDate(h.date)})`).join(', ')}
                        </div>
                      )}
                      {previewData.weeklyOffDays?.length > 0 && (
                        <div className="text-[11px] text-neutral-600 bg-white border border-neutral-200 px-2.5 py-1.5 rounded break-words">
                          <span className="font-semibold">Weekly Off Excluded: </span>
                          {previewData.weeklyOffDays.map((d: string) => formatDate(d)).join(', ')}
                        </div>
                      )}
                      {previewData.validationErrors?.length > 0 && (
                        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded space-y-0.5 break-words">
                          {previewData.validationErrors.map((ve: string, i: number) => (
                            <div key={i}>&bull; {ve}</div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Section 4: Reason & Supporting Attachment */}
              <div
                id="leave-form-section-reason"
                className="p-3 md:p-0 rounded-xl md:rounded-none bg-neutral-50/70 md:bg-transparent border border-neutral-200/80 md:border-0 space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Reason for Leave <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="textarea-leave-reason"
                    required
                    rows={3}
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    placeholder="Provide a specific, descriptive explanation for your absence..."
                    className="w-full text-xs p-2.5 bg-white rounded-xl md:rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Attach Supporting Document (Optional or if required by policy)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                    className="w-full min-h-[44px] md:min-h-0 text-xs text-neutral-600 file:mr-3 file:py-2 md:file:py-1.5 file:px-3 file:rounded-lg md:file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 cursor-pointer"
                  />
                  {attachmentFile && (
                    <div className="mt-2 p-2.5 rounded-xl md:rounded-lg bg-white md:bg-neutral-50 border border-neutral-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-neutral-900 truncate">
                            {attachmentFile.name}
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            {(attachmentFile.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        id="btn-remove-selected-attachment"
                        onClick={handleRemoveSelectedAttachment}
                        className="min-h-[44px] md:min-h-0 inline-flex items-center gap-1 px-3 md:px-2.5 py-1.5 md:py-1 rounded-lg md:rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 5: Emergency Exception Control (Unchanged Functionally, Touch-Friendly) */}
              <div
                id="leave-form-section-emergency"
                className="min-h-[44px] flex items-center gap-2.5 p-3 md:p-2.5 bg-neutral-50 rounded-xl md:rounded-lg border border-neutral-200"
              >
                <input
                  type="checkbox"
                  id="emergency-check"
                  checked={formEmergencyException}
                  onChange={(e) => setFormEmergencyException(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 accent-red-700 shrink-0 cursor-pointer"
                />
                <label htmlFor="emergency-check" className="text-xs text-neutral-700 cursor-pointer leading-snug">
                  Request advance notice waiver under Emergency Exception clause
                </label>
              </div>

              {/* Section 6: Submit & Cancel Controls (>=44px Touch Targets on Mobile) */}
              <div
                id="leave-form-section-actions"
                className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-neutral-100"
              >
                <button
                  id="btn-cancel-apply-modal"
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="min-h-[44px] md:min-h-0 px-4 py-2 text-xs font-semibold text-neutral-700 border border-neutral-200 md:border-transparent rounded-xl md:rounded-lg hover:text-neutral-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-leave-application"
                  type="submit"
                  disabled={submittingApply}
                  className="min-h-[44px] md:min-h-0 px-5 py-2 text-xs font-semibold bg-red-700 text-white rounded-xl md:rounded-lg hover:bg-red-800 active:bg-red-900 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingApply ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
