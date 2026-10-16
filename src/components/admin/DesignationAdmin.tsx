import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Power,
  X,
  Search,
} from 'lucide-react';
import { DesignationDto } from '../../types/leave.ts';
import { getActiveRole, apiFetch } from '../../lib/api.ts';

export function DesignationAdmin() {
  const [designations, setDesignations] = useState<DesignationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDesig, setEditingDesig] = useState<DesignationDto | null>(null);
  const [confirmDeleteDesig, setConfirmDeleteDesig] = useState<DesignationDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    isActive: true,
  });

  const activeRole = getActiveRole();
  const canManage = activeRole === 'SUPER_ADMIN' || activeRole === 'HR';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/designations?includeInactive=true');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load designations');
      setDesignations(data.designations || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAdd = () => {
    setEditingDesig(null);
    setFormData({ name: '', code: '', description: '', isActive: true });
    setIsModalOpen(true);
  };

  const openEdit = (d: DesignationDto) => {
    setEditingDesig(d);
    setFormData({
      name: d.name,
      code: d.code,
      description: d.description || '',
      isActive: d.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      const url = editingDesig ? `/api/designations/${editingDesig.id}` : '/api/designations';
      const method = editingDesig ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save designation');

      setSuccessMsg(
        editingDesig
          ? `Designation '${data.designation.name}' updated successfully.`
          : `Designation '${data.designation.name}' created successfully.`
      );
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (d: DesignationDto) => {
    setError(null);
    setSuccessMsg(null);
    const newStatus = !d.isActive;

    try {
      const res = await apiFetch(`/api/designations/${d.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update designation status');

      setSuccessMsg(`Designation '${d.name}' marked ${newStatus ? 'Active' : 'Inactive'}.`);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (d: DesignationDto) => {
    if (activeRole !== 'SUPER_ADMIN') return;
    setError(null);
    setSuccessMsg(null);
    setDeleting(true);

    try {
      const res = await apiFetch(`/api/designations/${d.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete designation');

      setSuccessMsg(data.message || `Designation '${d.name}' deleted successfully.`);
      setConfirmDeleteDesig(null);
      loadData();
    } catch (err: any) {
      setError(err.message);
      setConfirmDeleteDesig(null);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = designations.filter((d) => {
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q) || (d.description && d.description.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-indigo-300 border-t-[5px] border-t-indigo-600 bg-indigo-50/75 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <Briefcase className="w-5 h-5 text-indigo-700" />
            <span>Designation Master</span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Manage job titles, functional roles, professional hierarchy, and designation codes.
          </p>
        </div>

        {canManage && (
          <button
            id="btn-add-designation"
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Designation</span>
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

      <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-search-designation"
            type="text"
            placeholder="Search designations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
          />
        </div>

        <button
          onClick={loadData}
          title="Refresh"
          className="p-2 border border-neutral-200 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-indigo-300 border-t-[5px] border-t-indigo-600 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
          <thead className="bg-indigo-50/80 text-slate-800 font-bold border-b border-indigo-200">
            <tr>
              <th className="py-3 px-4">Code</th>
              <th className="py-3 px-4">Designation Title</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4">Status</th>
              {canManage && <th className="py-3 px-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-neutral-500">Loading designations...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-neutral-500">No designations found.</td></tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="hover:bg-neutral-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-neutral-900">{d.code}</td>
                  <td className="py-3 px-4 font-semibold text-neutral-900">{d.name}</td>
                  <td className="py-3 px-4 text-neutral-500">{d.description || '—'}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        d.isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${d.isActive ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                      {d.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEdit(d)}
                          title="Edit Designation"
                          className="p-1 text-neutral-500 hover:text-neutral-800 rounded hover:bg-neutral-100 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(d)}
                          title={d.isActive ? 'Deactivate' : 'Activate'}
                          className={`p-1 rounded hover:bg-neutral-100 cursor-pointer ${
                            d.isActive ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        {activeRole === 'SUPER_ADMIN' && (
                          <button
                          onClick={() => setConfirmDeleteDesig(d)}
                          title="Safe Delete Designation"
                          className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        )}
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-neutral-700" />
                <span>{editingDesig ? 'Edit Designation' : 'Create Designation'}</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-500 hover:text-neutral-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Designation Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-desig-name"
                  type="text"
                  required
                  placeholder="e.g. Lead Database Architect"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Designation Code <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-desig-code"
                  type="text"
                  required
                  placeholder="e.g. ARCH"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief role responsibilities..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-designation"
                  type="submit"
                  className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer font-medium"
                >
                  {editingDesig ? 'Update Designation' : 'Create Designation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {activeRole === 'SUPER_ADMIN' && confirmDeleteDesig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Delete Designation</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Are you sure you want to delete <span className="font-semibold text-neutral-800">'{confirmDeleteDesig.name}' ({confirmDeleteDesig.code})</span>?
                </p>
              </div>
            </div>
            <p className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
              Designation deletion is dependency-safe. If employees reference this designation, deletion will be blocked safely.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteDesig(null)}
                disabled={deleting}
                className="px-3 py-1.5 border border-neutral-200 text-neutral-700 text-xs rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-desig"
                onClick={() => handleDelete(confirmDeleteDesig)}
                disabled={deleting}
                className="px-3.5 py-1.5 bg-rose-600 text-white text-xs rounded-lg hover:bg-rose-700 cursor-pointer font-medium flex items-center gap-1.5"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
