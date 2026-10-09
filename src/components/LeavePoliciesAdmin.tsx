import React, { useState, useEffect } from 'react';
import { Plus, Edit2, CheckCircle2, XCircle, AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { CreateLeavePolicyInput, LeavePolicyDto, LeaveTypeDto, UpdateLeavePolicyInput } from '../types/leave.ts';
import { apiFetch, getActiveRole } from '../lib/api.ts';
import { getLeaveTypeBadgeClasses, getStatusBadgeClasses } from '../utils/theme.ts';

export function LeavePoliciesAdmin() {
  const [policies, setPolicies] = useState<LeavePolicyDto[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LeavePolicyDto | null>(null);
  const [formData, setFormData] = useState<CreateLeavePolicyInput>({
    leaveTypeId: 1,
    policyName: '',
    annualAllocation: 12,
    allocationFrequency: 'ANNUAL',
    carryForwardAllowed: false,
    carryForwardLimit: 0,
    expiryEnabled: false,
    expiryPeriod: '',
    maximumConsecutiveDays: 0,
    minimumNoticeDays: 0,
    sameDayAllowed: true,
    lateRequestAllowed: false,
    postStartRequestAllowed: false,
    emergencyExceptionAllowed: false,
    negativeBalanceAllowed: false,
    documentRequired: false,
    halfDayAllowed: true,
    isActive: true,
    effectiveFrom: '',
    effectiveTo: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const activeRole = getActiveRole();
  const isSuperAdmin = activeRole === 'SUPER_ADMIN';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Leave Types
      const ltRes = await apiFetch('/api/leave-types?includeInactive=true');
      const ltData = await ltRes.json();
      const types: LeaveTypeDto[] = ltData.leaveTypes || [];
      setLeaveTypes(types);

      // 2. Fetch Policies
      const polRes = await apiFetch('/api/leave-policies?includeInactive=true');
      if (!polRes.ok) {
        const pData = await polRes.json();
        throw new Error(pData.error || 'Failed to fetch leave policies');
      }
      const polData = await polRes.json();
      setPolicies(polData.policies || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeRole]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    const defaultTypeId = leaveTypes[0]?.id || 1;
    setFormData({
      leaveTypeId: defaultTypeId,
      policyName: '',
      annualAllocation: 12,
      allocationFrequency: 'ANNUAL',
      carryForwardAllowed: false,
      carryForwardLimit: 0,
      expiryEnabled: false,
      expiryPeriod: '',
      maximumConsecutiveDays: 0,
      minimumNoticeDays: 0,
      sameDayAllowed: true,
      lateRequestAllowed: false,
      postStartRequestAllowed: false,
      emergencyExceptionAllowed: false,
      negativeBalanceAllowed: false,
      documentRequired: false,
      halfDayAllowed: true,
      isActive: true,
      effectiveFrom: '',
      effectiveTo: '',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: LeavePolicyDto) => {
    setEditingItem(item);
    setFormData({
      leaveTypeId: item.leaveTypeId,
      policyName: item.policyName,
      annualAllocation: Number(item.annualAllocation),
      allocationFrequency: item.allocationFrequency || 'ANNUAL',
      carryForwardAllowed: item.carryForwardAllowed,
      carryForwardLimit: Number(item.carryForwardLimit || 0),
      expiryEnabled: item.expiryEnabled,
      expiryPeriod: item.expiryPeriod || '',
      maximumConsecutiveDays: item.maximumConsecutiveDays,
      minimumNoticeDays: item.minimumNoticeDays,
      sameDayAllowed: item.sameDayAllowed,
      lateRequestAllowed: item.lateRequestAllowed,
      postStartRequestAllowed: item.postStartRequestAllowed,
      emergencyExceptionAllowed: item.emergencyExceptionAllowed,
      negativeBalanceAllowed: item.negativeBalanceAllowed,
      documentRequired: item.documentRequired,
      halfDayAllowed: item.halfDayAllowed,
      isActive: item.isActive,
      effectiveFrom: item.effectiveFrom ? String(item.effectiveFrom).slice(0, 10) : '',
      effectiveTo: item.effectiveTo ? String(item.effectiveTo).slice(0, 10) : '',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleToggleActive = async (item: LeavePolicyDto) => {
    if (!isSuperAdmin) {
      setError('Forbidden: Only Super Admin can change policy status.');
      return;
    }
    try {
      const res = await apiFetch(`/api/leave-policies/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update policy status');
      }
      setSuccessMsg(`Policy "${item.policyName}" is now ${!item.isActive ? 'Active' : 'Inactive'}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormErrors({});
    setError(null);

    try {
      const payload = {
        ...formData,
        leaveTypeId: Number(formData.leaveTypeId),
        annualAllocation: Number(formData.annualAllocation),
        carryForwardLimit: Number(formData.carryForwardLimit || 0),
        maximumConsecutiveDays: Number(formData.maximumConsecutiveDays || 0),
        minimumNoticeDays: Number(formData.minimumNoticeDays || 0),
        effectiveFrom: formData.effectiveFrom ? formData.effectiveFrom : null,
        effectiveTo: formData.effectiveTo ? formData.effectiveTo : null,
      };

      if (editingItem) {
        const res = await apiFetch(`/api/leave-policies/${editingItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          if (data.fieldErrors) setFormErrors(data.fieldErrors);
          throw new Error(data.error || 'Failed to update leave policy');
        }
        setSuccessMsg(`Policy "${payload.policyName}" updated successfully`);
      } else {
        const res = await apiFetch('/api/leave-policies', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          if (data.fieldErrors) setFormErrors(data.fieldErrors);
          throw new Error(data.error || 'Failed to create leave policy');
        }
        setSuccessMsg(`Policy "${payload.policyName}" created successfully`);
      }

      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 3000);
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getTypeName = (typeId: number) => {
    const found = leaveTypes.find((lt) => lt.id === typeId);
    return found ? `${found.code} (${found.name})` : `Type #${typeId}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-indigo-300 border-t-[5px] border-t-indigo-600 bg-indigo-50/75 p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Configurable Leave Policies</h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Rule engine parameters: allocations, notice windows, carry forward, and approval criteria
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="refresh-policies-btn"
            onClick={loadData}
            className="p-2 text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg hover:bg-neutral-50 cursor-pointer"
            title="Refresh policies"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {isSuperAdmin ? (
            <button
              id="add-policy-btn"
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Policy</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-500 bg-neutral-100 rounded-lg border border-neutral-200">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>Read-only Mode ({activeRole})</span>
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Policies Table */}
      <div className="bg-white border border-indigo-300 border-t-[5px] border-t-indigo-600 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-indigo-50/80 border-b border-indigo-200 text-slate-800 uppercase tracking-wider font-bold">
              <tr>
                <th className="px-4 py-3">Policy Name</th>
                <th className="px-4 py-3">Leave Type</th>
                <th className="px-4 py-3">Allocation</th>
                <th className="px-4 py-3">Notice</th>
                <th className="px-4 py-3">Carry Forward</th>
                <th className="px-4 py-3">Max Cons.</th>
                <th className="px-4 py-3">Same Day</th>
                <th className="px-4 py-3">Status</th>
                {isSuperAdmin && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {loading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 9 : 8} className="px-4 py-8 text-center text-neutral-500">
                    Loading policies...
                  </td>
                </tr>
              ) : policies.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 9 : 8} className="px-4 py-8 text-center text-neutral-500">
                    <p className="font-medium text-neutral-700">No leave policies configured yet.</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {isSuperAdmin
                        ? 'Click "Create Policy" to define dynamic entitlement rules.'
                        : 'Contact Super Admin to set up organization policies.'}
                    </p>
                  </td>
                </tr>
              ) : (
                policies.map((pol) => (
                  <tr key={pol.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-neutral-900">{pol.policyName}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${getLeaveTypeBadgeClasses(
                          getTypeName(pol.leaveTypeId)
                        )}`}
                      >
                        {getTypeName(pol.leaveTypeId)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-neutral-900">
                        {pol.annualAllocation} days
                      </span>{' '}
                      <span className="text-[11px] text-neutral-500">/{pol.allocationFrequency}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {pol.minimumNoticeDays > 0 ? (
                        <span>{pol.minimumNoticeDays} day(s)</span>
                      ) : (
                        <span className="text-neutral-500">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {pol.carryForwardAllowed ? (
                        <span className="text-emerald-700 font-medium">
                          Up to {pol.carryForwardLimit} days
                        </span>
                      ) : (
                        <span className="text-neutral-500">Disabled</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {pol.maximumConsecutiveDays > 0 ? (
                        <span>{pol.maximumConsecutiveDays} days</span>
                      ) : (
                        <span className="text-neutral-500">No limit</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {pol.sameDayAllowed ? (
                        <span className="text-emerald-700">Permitted</span>
                      ) : (
                        <span className="text-rose-600">Cutoff Enforced</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${getStatusBadgeClasses(
                          pol.isActive ? 'ACTIVE' : 'INACTIVE'
                        )}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            pol.isActive ? 'bg-emerald-500' : 'bg-neutral-400'
                          }`}
                        />
                        {pol.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            id={`edit-policy-${pol.id}`}
                            onClick={() => handleOpenEdit(pol)}
                            className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded cursor-pointer"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            id={`toggle-policy-${pol.id}`}
                            onClick={() => handleToggleActive(pol)}
                            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
                              pol.isActive
                                ? 'text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                                : 'text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                            }`}
                          >
                            {pol.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog for Create/Edit Policy */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h4 className="text-base font-semibold text-neutral-900">
                {editingItem ? `Edit Policy: ${editingItem.policyName}` : 'Create New Leave Policy'}
              </h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-700 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
              {/* Row 1: Name and Leave Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">
                    Policy Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.policyName}
                    onChange={(e) => setFormData({ ...formData, policyName: e.target.value })}
                    placeholder="e.g. Standard CL Policy 2026"
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:outline-none ${
                      formErrors.policyName ? 'border-rose-500' : 'border-neutral-300 focus:ring-red-700/20 focus:border-red-700'
                    }`}
                    required
                  />
                  {formErrors.policyName && (
                    <p className="text-rose-600 mt-1">{formErrors.policyName}</p>
                  )}
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">
                    Target Leave Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    disabled={!!editingItem}
                    value={formData.leaveTypeId}
                    onChange={(e) =>
                      setFormData({ ...formData, leaveTypeId: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs bg-white focus:ring-1 focus:ring-red-700/20 focus:border-red-700 focus:outline-none"
                  >
                    {leaveTypes.map((lt) => (
                      <option key={lt.id} value={lt.id}>
                        {lt.code} — {lt.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Entitlement & Frequency */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">
                    Annual Allocation (Days) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.annualAllocation}
                    onChange={(e) =>
                      setFormData({ ...formData, annualAllocation: e.target.value })
                    }
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:outline-none ${
                      formErrors.annualAllocation ? 'border-rose-500' : 'border-neutral-300 focus:ring-red-700/20 focus:border-red-700'
                    }`}
                    required
                  />
                  {formErrors.annualAllocation && (
                    <p className="text-rose-600 mt-1">{formErrors.annualAllocation}</p>
                  )}
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Frequency</label>
                  <select
                    value={formData.allocationFrequency}
                    onChange={(e) =>
                      setFormData({ ...formData, allocationFrequency: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs bg-white focus:ring-1 focus:ring-red-700/20 focus:border-red-700 focus:outline-none"
                  >
                    <option value="ANNUAL">Annual (Full upfront)</option>
                    <option value="MONTHLY">Monthly Pro-rata</option>
                    <option value="QUARTERLY">Quarterly Credit</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Min Notice (Days)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.minimumNoticeDays}
                    onChange={(e) =>
                      setFormData({ ...formData, minimumNoticeDays: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs focus:ring-1 focus:ring-red-700/20 focus:border-red-700 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 3: Carry Forward & Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-lg bg-neutral-50 border border-neutral-200/80">
                <div>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={formData.carryForwardAllowed}
                      onChange={(e) =>
                        setFormData({ ...formData, carryForwardAllowed: e.target.checked })
                      }
                      className="rounded border-neutral-300 text-neutral-900"
                    />
                    <span className="font-semibold text-neutral-800">Allow Carry Forward</span>
                  </label>
                  {formData.carryForwardAllowed && (
                    <div>
                      <label className="block font-medium text-neutral-600 mb-1">
                        Max Carry Forward Days
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={formData.carryForwardLimit}
                        onChange={(e) =>
                          setFormData({ ...formData, carryForwardLimit: e.target.value })
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 text-xs bg-white focus:ring-1 focus:ring-red-700/20 focus:border-red-700 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">
                    Max Consecutive Days
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.maximumConsecutiveDays}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maximumConsecutiveDays: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="0 = unlimited"
                    className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 text-xs bg-white focus:ring-1 focus:ring-red-700/20 focus:border-red-700 focus:outline-none"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">Set 0 for unrestricted consecutive days</p>
                </div>
              </div>

              {/* Rules & Permissions Checkboxes */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sameDayAllowed}
                    onChange={(e) => setFormData({ ...formData, sameDayAllowed: e.target.checked })}
                    className="rounded border-neutral-300 text-neutral-900"
                  />
                  <span>Same Day Allowed</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.halfDayAllowed}
                    onChange={(e) => setFormData({ ...formData, halfDayAllowed: e.target.checked })}
                    className="rounded border-neutral-300 text-neutral-900"
                  />
                  <span>Half Day Allowed</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.documentRequired}
                    onChange={(e) =>
                      setFormData({ ...formData, documentRequired: e.target.checked })
                    }
                    className="rounded border-neutral-300 text-neutral-900"
                  />
                  <span>Document Required</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.emergencyExceptionAllowed}
                    onChange={(e) =>
                      setFormData({ ...formData, emergencyExceptionAllowed: e.target.checked })
                    }
                    className="rounded border-neutral-300 text-neutral-900"
                  />
                  <span>Emergency Exception</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.negativeBalanceAllowed}
                    onChange={(e) =>
                      setFormData({ ...formData, negativeBalanceAllowed: e.target.checked })
                    }
                    className="rounded border-neutral-300 text-neutral-900"
                  />
                  <span>Negative Balance</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.lateRequestAllowed}
                    onChange={(e) =>
                      setFormData({ ...formData, lateRequestAllowed: e.target.checked })
                    }
                    className="rounded border-neutral-300 text-neutral-900"
                  />
                  <span>Late Request Allowed</span>
                </label>
              </div>

              {/* Effective Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Effective From</label>
                  <input
                    type="date"
                    value={typeof formData.effectiveFrom === 'string' ? formData.effectiveFrom : ''}
                    onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs focus:ring-1 focus:ring-red-700/20 focus:border-red-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Effective To</label>
                  <input
                    type="date"
                    value={typeof formData.effectiveTo === 'string' ? formData.effectiveTo : ''}
                    onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs focus:ring-1 focus:ring-red-700/20 focus:border-red-700 focus:outline-none"
                  />
                </div>
              </div>
              {formErrors.effectiveDateRange && (
                <p className="text-rose-600">{formErrors.effectiveDateRange}</p>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : editingItem ? 'Save Policy' : 'Create Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
