import React, { useState, useEffect } from 'react';
import { Plus, Edit2, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { CreateLeaveTypeInput, LeaveTypeDto, UpdateLeaveTypeInput } from '../types/leave.ts';
import { apiFetch, getActiveRole } from '../lib/api.ts';
import { MT_COLOR_CARDS, getLeaveTypeBadgeClasses, getLeaveTypeCardClasses, getStatusBadgeClasses } from '../utils/theme.ts';

export function LeaveTypesAdmin() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LeaveTypeDto | null>(null);
  const [formData, setFormData] = useState<CreateLeaveTypeInput>({
    code: '',
    name: '',
    description: '',
    isPaid: true,
    requiresDocument: false,
    supportsHalfDay: true,
    displayOrder: 1,
    isActive: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const activeRole = getActiveRole();
  const isSuperAdmin = activeRole === 'SUPER_ADMIN';

  const loadLeaveTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/leave-types?includeInactive=true');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load leave types');
      }
      const data = await res.json();
      setLeaveTypes(data.leaveTypes || []);
    } catch (err: any) {
      setError(err.message || 'Error loading leave types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaveTypes();
  }, [activeRole]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormData({
      code: '',
      name: '',
      description: '',
      isPaid: true,
      requiresDocument: false,
      supportsHalfDay: true,
      displayOrder: leaveTypes.length + 1,
      isActive: true,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: LeaveTypeDto) => {
    setEditingItem(item);
    setFormData({
      code: item.code,
      name: item.name,
      description: item.description || '',
      isPaid: item.isPaid,
      requiresDocument: item.requiresDocument,
      supportsHalfDay: item.supportsHalfDay,
      displayOrder: item.displayOrder,
      isActive: item.isActive,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleToggleActive = async (item: LeaveTypeDto) => {
    if (!isSuperAdmin) {
      setError('Forbidden: Only Super Admin can change leave type status.');
      return;
    }
    try {
      const res = await apiFetch(`/api/leave-types/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update leave type status');
      }
      setSuccessMsg(`Leave type ${item.code} is now ${!item.isActive ? 'Active' : 'Inactive'}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      loadLeaveTypes();
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
      if (editingItem) {
        const updatePayload: UpdateLeaveTypeInput = {
          name: formData.name,
          description: formData.description,
          isPaid: formData.isPaid,
          requiresDocument: formData.requiresDocument,
          supportsHalfDay: formData.supportsHalfDay,
          displayOrder: Number(formData.displayOrder),
          isActive: formData.isActive,
        };

        const res = await apiFetch(`/api/leave-types/${editingItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify(updatePayload),
        });

        const data = await res.json();
        if (!res.ok) {
          if (data.fieldErrors) setFormErrors(data.fieldErrors);
          throw new Error(data.error || 'Failed to update leave type');
        }
        setSuccessMsg(`Leave type ${editingItem.code} updated successfully`);
      } else {
        const res = await apiFetch('/api/leave-types', {
          method: 'POST',
          body: JSON.stringify({
            ...formData,
            code: formData.code.trim().toUpperCase(),
            displayOrder: Number(formData.displayOrder),
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          if (data.fieldErrors) setFormErrors(data.fieldErrors);
          throw new Error(data.error || 'Failed to create leave type');
        }
        setSuccessMsg(`Leave type ${formData.code.toUpperCase()} created successfully`);
      }

      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 3000);
      loadLeaveTypes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="rounded-xl border border-teal-300 border-t-[5px] border-t-teal-600 bg-teal-50/75 p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Master Leave Types</h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Configurable category definitions (e.g. CL, SL, EL, EMERGENCY, LWP)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="refresh-leave-types-btn"
            onClick={loadLeaveTypes}
            className="p-2 text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg hover:bg-neutral-50 cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {isSuperAdmin && (
            <button
              id="add-leave-type-btn"
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Leave Type</span>
            </button>
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

      {/* Leave Type Summary Cards */}
      {!loading && leaveTypes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {leaveTypes.map((lt) => (
            <div
              key={`lt-card-${lt.id}`}
              className={`rounded-xl p-3.5 ${getLeaveTypeCardClasses(lt.code || lt.name)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${getLeaveTypeBadgeClasses(
                    lt.code || lt.name
                  )}`}
                >
                  {lt.code}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${getStatusBadgeClasses(
                    lt.isActive ? 'ACTIVE' : 'INACTIVE'
                  )}`}
                >
                  {lt.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="text-xs font-bold text-slate-900 mt-2 truncate">{lt.name}</div>
              <div className="text-[11px] font-semibold text-slate-600 mt-1">
                {lt.isPaid ? 'Paid Leave' : 'Unpaid (LWP)'} • {lt.supportsHalfDay ? 'Half-Day' : 'Full-Day'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Leave Types Table */}
      <div className="bg-white border border-teal-300 border-t-[5px] border-t-teal-600 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-teal-50/80 border-b border-teal-200 text-slate-800 uppercase tracking-wider font-bold">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Half-Day</th>
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Status</th>
                {isSuperAdmin && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {loading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 9 : 8} className="px-4 py-8 text-center text-neutral-500">
                    Loading leave types...
                  </td>
                </tr>
              ) : leaveTypes.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 9 : 8} className="px-4 py-8 text-center text-neutral-500">
                    No leave types registered yet.
                  </td>
                </tr>
              ) : (
                leaveTypes.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-neutral-500">{item.displayOrder}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded font-mono font-semibold text-[11px] ${getLeaveTypeBadgeClasses(
                          item.code || item.name
                        )}`}
                      >
                        {item.code}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-neutral-900">{item.name}</td>
                    <td className="px-4 py-3.5 text-neutral-500 max-w-xs truncate">
                      {item.description || '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          item.isPaid
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {item.isPaid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {item.supportsHalfDay ? (
                        <span className="text-neutral-700">Supported</span>
                      ) : (
                        <span className="text-neutral-500">Full Day Only</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {item.requiresDocument ? (
                        <span className="text-amber-700 font-medium">Required</span>
                      ) : (
                        <span className="text-neutral-500">Optional</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${getStatusBadgeClasses(
                          item.isActive ? 'ACTIVE' : 'INACTIVE'
                        )}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.isActive ? 'bg-emerald-500' : 'bg-neutral-400'
                          }`}
                        />
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            id={`edit-leave-type-${item.code}`}
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded cursor-pointer"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            id={`toggle-leave-type-${item.code}`}
                            onClick={() => handleToggleActive(item)}
                            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
                              item.isActive
                                ? 'text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                                : 'text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                            }`}
                          >
                            {item.isActive ? 'Deactivate' : 'Activate'}
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

      {/* Modal Dialog for Create/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h4 className="text-base font-semibold text-neutral-900">
                {editingItem ? `Edit Leave Type: ${editingItem.code}` : 'Create New Leave Type'}
              </h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-700 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
              {/* Code */}
              <div>
                <label className="block font-medium text-neutral-700 mb-1">
                  Leave Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  disabled={!!editingItem}
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. CL, SL, EL, BEREAVEMENT"
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:outline-none uppercase ${
                    editingItem ? 'bg-neutral-100 cursor-not-allowed' : 'bg-white'
                  } ${formErrors.code ? 'border-rose-500 focus:ring-rose-500' : 'border-neutral-300 focus:ring-red-700/20 focus:border-red-700'}`}
                  required
                />
                {formErrors.code && <p className="text-rose-600 mt-1">{formErrors.code}</p>}
                {!editingItem && (
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Unique uppercase alphanumeric code (2 to 20 characters).
                  </p>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="block font-medium text-neutral-700 mb-1">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Casual Leave"
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:outline-none ${
                    formErrors.name ? 'border-rose-500 focus:ring-rose-500' : 'border-neutral-300 focus:ring-red-700/20 focus:border-red-700'
                  }`}
                  required
                />
                {formErrors.name && <p className="text-rose-600 mt-1">{formErrors.name}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="block font-medium text-neutral-700 mb-1">Description</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Brief description of when this leave applies"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs focus:ring-1 focus:ring-red-700/20 focus:border-red-700 focus:outline-none"
                />
              </div>

              {/* Order & Flags Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.displayOrder ?? 1}
                    onChange={(e) =>
                      setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs focus:ring-1 focus:ring-red-700/20 focus:border-red-700 focus:outline-none"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isPaid}
                      onChange={(e) => setFormData({ ...formData, isPaid: e.target.checked })}
                      className="rounded border-neutral-300 text-neutral-900"
                    />
                    <span className="font-medium text-neutral-800">Is Paid Leave</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.supportsHalfDay}
                      onChange={(e) =>
                        setFormData({ ...formData, supportsHalfDay: e.target.checked })
                      }
                      className="rounded border-neutral-300 text-neutral-900"
                    />
                    <span className="font-medium text-neutral-800">Supports Half Day</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.requiresDocument}
                      onChange={(e) =>
                        setFormData({ ...formData, requiresDocument: e.target.checked })
                      }
                      className="rounded border-neutral-300 text-neutral-900"
                    />
                    <span className="font-medium text-neutral-800">Requires Document</span>
                  </label>
                </div>
              </div>

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
                  {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Leave Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
