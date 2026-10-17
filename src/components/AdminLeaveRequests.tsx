import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  User,
  Building,
  ShieldAlert,
  ArrowRight,
  Info,
  Save,
  X,
} from 'lucide-react';
import { LeaveRequestDto, LeaveTypeDto, DepartmentDto, EmployeeDto } from '../types/leave.ts';
import { apiFetch, getAuthHeaders, getActiveRole } from '../lib/api.ts';
import { formatDate } from '../utils/dateFormat.ts';
import {
  MT_COLOR_CARDS,
  getStatusBadgeClasses,
  getLeaveTypeBadgeClasses,
} from '../utils/theme.ts';

export function AdminLeaveRequests() {
  const activeRole = getActiveRole();
  const isSuperAdmin = activeRole === 'SUPER_ADMIN';

  const [requests, setRequests] = useState<LeaveRequestDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDto[]>([]);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDept, setFilterDept] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Selected for Details / Edit / Delete
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequestDto | null>(null);
  const [editingRequest, setEditingRequest] = useState<LeaveRequestDto | null>(null);
  const [deletingRequest, setDeletingRequest] = useState<LeaveRequestDto | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit form state
  const [editForm, setEditForm] = useState({
    startDate: '',
    endDate: '',
    leaveTypeId: 1,
    dayType: 'FULL_DAY' as 'FULL_DAY' | 'HALF_DAY',
    reason: '',
    adminNotes: '',
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch leave requests from reports dataset or all leave requests
      const res = await fetch('/api/reports/data', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error('Failed to load leave requests dataset');
      }
      const data = await res.json();
      setRequests(data.leaveRequests || []);
      setDepartments(data.departments || []);
      setLeaveTypes(data.leaveTypes || []);
      setEmployees(data.employees || []);
    } catch (err: any) {
      setError(err.message || 'Error loading leave requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenEdit = (req: LeaveRequestDto) => {
    setEditingRequest(req);
    setActionError(null);
    setEditForm({
      startDate: req.startDate,
      endDate: req.endDate,
      leaveTypeId: req.leaveTypeId,
      dayType: req.dayType === 'HALF_DAY' ? 'HALF_DAY' : 'FULL_DAY',
      reason: req.reason,
      adminNotes: '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRequest) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/leave-requests/${editingRequest.id}`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update leave request');
      setSuccessMsg(`Leave request ${editingRequest.requestNumber} successfully updated and audited.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setEditingRequest(null);
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Error editing leave request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRequest) return;
    if (!deleteReason.trim()) {
      setActionError('A mandatory deletion reason is required for administrative audit tracking.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/leave-requests/${deletingRequest.id}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: deleteReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete leave request');
      setSuccessMsg(`Leave request ${deletingRequest.requestNumber} deleted successfully. Balance reversed where applicable.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setDeletingRequest(null);
      setDeleteReason('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Error deleting leave request');
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered requests
  const filtered = requests.filter((r) => {
    if (filterStatus !== 'ALL' && (r.finalStatus || r.status) !== filterStatus) return false;
    if (filterDept !== 'ALL' && String(r.departmentId) !== filterDept) return false;
    if (filterType !== 'ALL' && String(r.leaveTypeId) !== filterType) return false;
    if (filterStartDate && r.startDate < filterStartDate) return false;
    if (filterEndDate && r.endDate > filterEndDate) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        r.requestNumber.toLowerCase().includes(q) ||
        r.employeeName?.toLowerCase().includes(q) ||
        r.employeeCode?.toLowerCase().includes(q) ||
        r.leaveTypeName?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-red-200 border-t-[5px] border-t-red-700 bg-red-50/60 p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-700 text-white">
              Super Admin Control
            </span>
            <h1 className="text-xl font-bold text-neutral-900">Leave Request Management</h1>
          </div>
          <p className="text-xs text-slate-700 mt-1">
            Global repository of employee leave requests. Review complete lifecycle details, edit parameters with automatic balance recalculation, or safely delete records with audited ledger reversal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="btn-refresh-leave-requests"
            onClick={loadData}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-slate-700' : 'text-slate-700'}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">Search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="filter-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ID, employee, type..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">Status</label>
            <select
              id="filter-status-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-neutral-300 font-semibold focus:outline-none focus:ring-1 focus:ring-red-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Leave Type */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">Leave Type</label>
            <select
              id="filter-type-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-neutral-300 font-semibold focus:outline-none focus:ring-1 focus:ring-red-700"
            >
              <option value="ALL">All Leave Types</option>
              {leaveTypes.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">Date Range</label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-lg border border-neutral-300"
              />
              <span className="text-neutral-400 text-xs">to</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-lg border border-neutral-300"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 text-xs text-neutral-500">
          <span>Showing <strong>{filtered.length}</strong> of {requests.length} total leave requests</span>
          {(searchQuery || filterStatus !== 'ALL' || filterType !== 'ALL' || filterStartDate || filterEndDate) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('ALL');
                setFilterType('ALL');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className="text-red-700 hover:underline font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Requests Table */}
      {loading ? (
        <div className="p-12 text-center text-neutral-500 bg-white rounded-xl border border-neutral-200">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-500" />
          <span className="text-xs">Loading leave requests repository...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-dashed border-neutral-300">
          <FileSpreadsheet className="w-8 h-8 mx-auto text-neutral-400 mb-2" />
          <h3 className="text-sm font-semibold text-neutral-800">No Leave Requests Found</h3>
          <p className="text-xs text-neutral-500 mt-1">Adjust search parameters or filters to view leave requests.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-3">Request ID</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Leave Type</th>
                  <th className="px-4 py-3">Dates &amp; Duration</th>
                  <th className="px-4 py-3">Current Status</th>
                  <th className="px-4 py-3">Assigned Approver</th>
                  <th className="px-4 py-3 text-right">Super Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium">
                {filtered.map((r) => (
                  <tr key={`req-${r.id}`} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-neutral-900">
                      {r.requestNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-neutral-900">{r.employeeName || `Employee #${r.employeeId}`}</div>
                      <div className="text-[11px] text-neutral-500 font-mono">
                        {r.employeeCode || `EMP${r.employeeId}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {r.departmentName || r.departmentCode || 'General'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${getLeaveTypeBadgeClasses(r.leaveTypeCode || r.leaveTypeName)}`}>
                        {r.leaveTypeName || r.leaveTypeCode}
                      </span>
                      <span className={`ml-1 px-2 py-0.5 rounded text-[10px] font-semibold ${r.isPaid !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {r.isPaid !== false ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-neutral-900">
                        {formatDate(r.startDate)} {r.startDate !== r.endDate ? `→ ${formatDate(r.endDate)}` : ''}
                      </div>
                      <div className="text-[11px] text-neutral-500 font-mono">
                        {Number(r.totalDays)} Day(s) &bull; {r.dayType === 'HALF_DAY' ? 'Half Day' : 'Full Day'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${getStatusBadgeClasses(r.finalStatus || r.status)}`}>
                        {r.approvalStageLabel || r.finalStatus || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      <div className="text-[11px]">
                        {r.assignedTeamLeaderName ? (
                          <span>TL: {r.assignedTeamLeaderName}</span>
                        ) : r.reportingManagerName ? (
                          <span>Mgr: {r.reportingManagerName}</span>
                        ) : (
                          <span className="text-neutral-400">Standard Routing</span>
                        )}
                      </div>
                      {r.managementDecidedByName && (
                        <div className="text-[10px] text-emerald-700 font-semibold">
                          Final: {r.managementDecidedByName} ({r.managementDecision})
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          id={`btn-view-details-${r.id}`}
                          onClick={() => setSelectedRequest(r)}
                          className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {isSuperAdmin && (
                          <>
                            <button
                              id={`btn-edit-req-${r.id}`}
                              onClick={() => handleOpenEdit(r)}
                              className="p-1.5 text-sky-600 hover:text-sky-800 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit Leave Request"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              id={`btn-delete-req-${r.id}`}
                              onClick={() => {
                                setDeletingRequest(r);
                                setDeleteReason('');
                                setActionError(null);
                              }}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Leave Request (With Ledger Reversal)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-neutral-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-red-700" />
                  Leave Request Details
                </h3>
                <span className="font-mono text-xs text-neutral-500">{selectedRequest.requestNumber}</span>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-50 rounded-xl">
                <div>
                  <span className="text-neutral-500 block">Employee:</span>
                  <strong className="text-neutral-900">{selectedRequest.employeeName}</strong>
                  <span className="text-neutral-400 block font-mono">{selectedRequest.employeeCode}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block">Department:</span>
                  <strong className="text-neutral-900">{selectedRequest.departmentName || 'General'}</strong>
                </div>
                <div>
                  <span className="text-neutral-500 block">Leave Type:</span>
                  <strong className="text-neutral-900">{selectedRequest.leaveTypeName} ({selectedRequest.leaveTypeCode})</strong>
                  <span className={`ml-2 px-2 py-0.5 rounded text-[11px] font-semibold ${selectedRequest.isPaid !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{selectedRequest.isPaid !== false ? 'Paid' : 'Unpaid'}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block">Duration:</span>
                  <strong className="text-neutral-900">{Number(selectedRequest.totalDays)} Day(s) ({selectedRequest.dayType})</strong>
                </div>
                <div>
                  <span className="text-neutral-500 block">Dates:</span>
                  <strong className="text-neutral-900">{formatDate(selectedRequest.startDate)} to {formatDate(selectedRequest.endDate)}</strong>
                </div>
                <div>
                  <span className="text-neutral-500 block">Current Status:</span>
                  <span className={`px-2 py-0.5 rounded font-bold ${getStatusBadgeClasses(selectedRequest.finalStatus || selectedRequest.status)}`}>
                    {selectedRequest.approvalStageLabel || selectedRequest.finalStatus || selectedRequest.status}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-neutral-500 block mb-1">Reason:</span>
                <p className="p-3 bg-neutral-50 rounded-xl text-neutral-800 leading-relaxed">
                  {selectedRequest.reason || 'No reason provided'}
                </p>
              </div>

              <div className="p-3 bg-neutral-50 rounded-xl space-y-1">
                <span className="text-neutral-500 font-bold block uppercase tracking-wider text-[10px]">Approval Decisions</span>
                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div>
                    <span className="text-neutral-500 block">Stage 1 (TL):</span>
                    <strong className="text-neutral-900">{selectedRequest.teamLeaderDecision || 'PENDING'}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Stage 2 (HR):</span>
                    <strong className="text-neutral-900">{selectedRequest.hrDecision || 'PENDING'}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Stage 3 (Mgmt):</span>
                    <strong className="text-neutral-900">{selectedRequest.managementDecision || 'PENDING'}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 border border-neutral-200 text-neutral-700 text-xs font-semibold rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-sky-600" />
                  Edit Leave Request (Super Admin)
                </h3>
                <span className="font-mono text-xs text-neutral-500">{editingRequest.requestNumber}</span>
              </div>
              <button
                onClick={() => setEditingRequest(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                {actionError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editForm.startDate}
                    onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">End Date</label>
                  <input
                    type="date"
                    value={editForm.endDate}
                    onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Leave Type</label>
                  <select
                    value={editForm.leaveTypeId}
                    onChange={(e) => setEditForm({ ...editForm, leaveTypeId: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg"
                  >
                    {leaveTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Duration Unit</label>
                  <select
                    value={editForm.dayType}
                    onChange={(e) => setEditForm({ ...editForm, dayType: e.target.value as any })}
                    className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg"
                  >
                    <option value="FULL_DAY">Full Day</option>
                    <option value="HALF_DAY">Half Day</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Reason</label>
                <textarea
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Super Admin Audit Notes</label>
                <input
                  type="text"
                  value={editForm.adminNotes}
                  onChange={(e) => setEditForm({ ...editForm, adminNotes: e.target.value })}
                  placeholder="Reason for administrative modification..."
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg"
                />
              </div>

              <p className="text-[11px] text-neutral-500 bg-sky-50 p-2.5 rounded-lg border border-sky-200">
                Editing recalculates working days. If this request was already approved, the balance difference will be safely adjusted in the ledger and logged to the audit trail.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setEditingRequest(null)}
                className="px-4 py-2 border border-neutral-200 text-neutral-700 text-xs font-semibold rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-save-edit"
                onClick={handleSaveEdit}
                disabled={actionLoading}
                className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                {actionLoading ? 'Saving...' : 'Save & Recalculate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Administrative Leave Deletion</h3>
                <p className="text-xs text-neutral-500 font-mono mt-0.5">{deletingRequest.requestNumber}</p>
              </div>
            </div>

            {actionError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                {actionError}
              </div>
            )}

            <div className="space-y-2 text-xs text-neutral-600">
              <p>
                Are you sure you want to administratively delete leave request <strong>{deletingRequest.requestNumber}</strong>?
              </p>
              {deletingRequest.finalStatus === 'APPROVED' && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg font-medium">
                  <strong>Automatic Ledger Reversal:</strong> This request was already approved. Deleting it will automatically reverse the <strong>{Number(deletingRequest.totalDays)} day(s)</strong> leave balance deduction back to the employee's available balance and record a REVERSAL ledger entry.
                </div>
              )}
              <div>
                <label className="block font-semibold text-neutral-800 mb-1">
                  Mandatory Deletion Reason <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="input-delete-reason"
                  rows={2}
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Explain why this request is being administratively deleted..."
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setDeletingRequest(null)}
                className="px-3.5 py-1.5 border border-neutral-200 text-neutral-700 text-xs font-semibold rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-leave-request"
                onClick={handleConfirmDelete}
                disabled={actionLoading}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                {actionLoading ? 'Deleting...' : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
