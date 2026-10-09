import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  AlertCircle,
  Clock,
  Filter,
  RefreshCw,
  Search,
  Building,
  Check,
  X,
  Layers,
  Info,
} from 'lucide-react';
import { apiFetch, getActiveRole } from '../lib/api.ts';
import { formatDate, getDayOfWeekName } from '../utils/dateFormat.ts';
import { SCHEDULE_CATEGORY_STYLES, MT_COLOR_CARDS } from '../utils/theme.ts';
import {
  HolidayDto,
  DepartmentDto,
  HolidayListDto,
  EmployeeHolidayAssignmentDto,
  EmployeeDto,
} from '../types/leave.ts';

const DAYS_OF_WEEK = [
  { index: 0, name: 'Sunday' },
  { index: 1, name: 'Monday' },
  { index: 2, name: 'Tuesday' },
  { index: 3, name: 'Wednesday' },
  { index: 4, name: 'Thursday' },
  { index: 5, name: 'Friday' },
  { index: 6, name: 'Saturday' },
];

export function HolidayCalendarAdmin() {
  const [holidays, setHolidays] = useState<HolidayDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [holidayLists, setHolidayLists] = useState<HolidayListDto[]>([]);
  const [holidayAssignments, setHolidayAssignments] = useState<EmployeeHolidayAssignmentDto[]>([]);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [weeklyOffs, setWeeklyOffs] = useState<number[]>([0, 6]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all'); // 'all', 'company_only', or deptId
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptional, setFilterOptional] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'dept_preview' | 'holiday_lists'>('table');
  const [previewDeptId, setPreviewDeptId] = useState<number>(5); // default to Maestro_Import if available

  // Holiday List & Employee Assignment Forms
  const [newListForm, setNewListForm] = useState({
    listCode: '',
    listName: '',
    year: 2026,
    departmentId: '',
    isDefault: false,
    description: '',
  });
  const [newAssignForm, setNewAssignForm] = useState({
    employeeId: '',
    holidayListId: '',
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    remarks: '',
  });

  // Modal / Form state for Add/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<HolidayDto | null>(null);
  const [formData, setFormData] = useState({
    holidayDate: '',
    holidayName: '',
    description: '',
    holidayListId: '' as string | number,
    departmentId: '' as string | number, // '' for All Departments (null)
    isOptional: false,
    isHalfDay: false,
    isActive: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Weekly off update state
  const [savingWeeklyOffs, setSavingWeeklyOffs] = useState(false);

  const activeRole = getActiveRole();
  const canEdit = activeRole === 'SUPER_ADMIN' || activeRole === 'HR';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch departments
      try {
        const resDepts = await apiFetch('/api/departments');
        if (resDepts.ok) {
          const deptsData = await resDepts.json();
          const list = deptsData.departments || [];
          setDepartments(list);
          if (list.length > 0 && !list.some((d: DepartmentDto) => d.id === previewDeptId)) {
            setPreviewDeptId(list[0].id);
          }
        }
      } catch (e) {
        console.warn('Failed to load departments', e);
      }

      // 2. Fetch holidays
      const params = new URLSearchParams();
      if (selectedYear) params.set('year', String(selectedYear));
      if (filterOptional === 'optional') params.set('isOptional', 'true');
      if (filterOptional === 'mandatory') params.set('isOptional', 'false');
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const resHolidays = await apiFetch(`/api/holidays?${params.toString()}`);
      if (!resHolidays.ok) throw new Error('Failed to load holidays');
      const holidaysData = await resHolidays.json();
      setHolidays(holidaysData.holidays || []);

      // 3. Fetch weekly offs
      const resWeekly = await apiFetch('/api/working-calendar/weekly-offs');
      if (resWeekly.ok) {
        const weeklyData = await resWeekly.json();
        setWeeklyOffs(weeklyData.weeklyOffs || [0, 6]);
      }

      // 4. Fetch holiday lists, assignments, and employees
      const [resLists, resAssigns, resEmps] = await Promise.all([
        apiFetch(`/api/holiday-lists?includeInactive=true`),
        apiFetch(`/api/holiday-assignments`),
        apiFetch(`/api/employees`),
      ]);
      if (resLists.ok) {
        const d = await resLists.json();
        setHolidayLists(d.holidayLists || []);
      }
      if (resAssigns.ok) {
        const d = await resAssigns.json();
        setHolidayAssignments(d.assignments || []);
      }
      if (resEmps.ok) {
        const d = await resEmps.json();
        setEmployees(d.employees || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading calendar data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedYear, filterOptional]);

  const openAddModal = () => {
    setEditingHoliday(null);
    setFormData({
      holidayDate: `${selectedYear}-01-01`,
      holidayName: '',
      description: '',
      holidayListId: '',
      departmentId: '',
      isOptional: false,
      isHalfDay: false,
      isActive: true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (h: HolidayDto) => {
    setEditingHoliday(h);
    setFormData({
      holidayDate: h.holidayDate,
      holidayName: h.holidayName,
      description: h.description || '',
      holidayListId: h.holidayListId ?? '',
      departmentId: h.departmentId ?? '',
      isOptional: Boolean(h.isOptional),
      isHalfDay: Boolean(h.isHalfDay),
      isActive: h.isActive !== false,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCreateHolidayList = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch('/api/holiday-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listCode: newListForm.listCode,
          listName: newListForm.listName,
          year: Number(newListForm.year),
          departmentId: newListForm.departmentId ? Number(newListForm.departmentId) : null,
          isDefault: newListForm.isDefault,
          description: newListForm.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create holiday list');
      setSuccessMsg(`Holiday list "${newListForm.listName}" created.`);
      setNewListForm({
        listCode: '',
        listName: '',
        year: selectedYear,
        departmentId: '',
        isDefault: false,
        description: '',
      });
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAssignHolidayList = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch('/api/holiday-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: Number(newAssignForm.employeeId),
          holidayListId: Number(newAssignForm.holidayListId),
          effectiveFrom: newAssignForm.effectiveFrom,
          effectiveTo: newAssignForm.effectiveTo || null,
          remarks: newAssignForm.remarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign holiday list');
      setSuccessMsg('Employee holiday list assignment saved.');
      setNewAssignForm({
        employeeId: '',
        holidayListId: '',
        effectiveFrom: '2026-01-01',
        effectiveTo: '',
        remarks: '',
      });
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteHolidayAssignment = async (id: number) => {
    try {
      const res = await apiFetch(`/api/holiday-assignments/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove assignment');
      setSuccessMsg('Holiday list assignment removed.');
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const url = editingHoliday
        ? `/api/holidays/${editingHoliday.id}`
        : '/api/holidays';
      const method = editingHoliday ? 'PUT' : 'POST';

      const payload = {
        holidayDate: formData.holidayDate,
        holidayName: formData.holidayName,
        description: formData.description,
        holidayListId: formData.holidayListId ? Number(formData.holidayListId) : null,
        departmentId: formData.departmentId ? Number(formData.departmentId) : null,
        isOptional: formData.isOptional,
        isHalfDay: formData.isHalfDay,
        isActive: formData.isActive,
        year: Number(formData.holidayDate.split('-')[0]),
      };

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save holiday');
      }

      setIsModalOpen(false);
      setSuccessMsg(
        editingHoliday
          ? `Holiday "${formData.holidayName}" updated successfully.`
          : `Holiday "${formData.holidayName}" created successfully.`
      );
      setTimeout(() => setSuccessMsg(null), 4000);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'An error occurred while saving.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete holiday "${name}"?`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/holidays/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete holiday');
      }
      setSuccessMsg(`Holiday "${name}" deleted.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Error deleting holiday');
      setTimeout(() => setError(null), 4000);
    }
  };

  const handleToggleWeeklyOff = (dayIndex: number) => {
    if (!canEdit) return;
    if (weeklyOffs.includes(dayIndex)) {
      if (weeklyOffs.length <= 1) {
        setError('At least one weekly off day must be configured.');
        return;
      }
      setWeeklyOffs(weeklyOffs.filter((d) => d !== dayIndex));
    } else {
      setWeeklyOffs([...weeklyOffs, dayIndex].sort((a, b) => a - b));
    }
  };

  const handleSaveWeeklyOffs = async () => {
    if (!canEdit) return;
    setSavingWeeklyOffs(true);
    setError(null);
    try {
      const res = await apiFetch('/api/working-calendar/weekly-offs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyOffs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save weekly offs');
      setSuccessMsg('Default weekly-off configuration updated successfully.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Error updating weekly offs');
    } finally {
      setSavingWeeklyOffs(false);
    }
  };

  // Filter holidays
  const filteredHolidays = holidays.filter((h) => {
    // Department filter
    if (selectedDeptFilter === 'company_only') {
      if (h.departmentId !== null && h.departmentId !== undefined) return false;
    } else if (selectedDeptFilter !== 'all') {
      const deptNum = Number(selectedDeptFilter);
      if (h.departmentId !== deptNum) return false;
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      const matchName = h.holidayName.toLowerCase().includes(term);
      const matchDate = h.holidayDate.includes(term);
      const matchDesc = (h.description || '').toLowerCase().includes(term);
      const matchDept = (h.departmentName || '').toLowerCase().includes(term);
      if (!matchName && !matchDate && !matchDesc && !matchDept) return false;
    }

    return true;
  });

  // Effective department preview computation
  const previewDepartmentHolidays = holidays.filter((h) => {
    if (h.departmentId === previewDeptId) return true;
    if (h.departmentId === null || h.departmentId === undefined) {
      // Company-wide holiday applies unless overridden on the same date
      const overridden = holidays.some(
        (other) => other.departmentId === previewDeptId && other.holidayDate === h.holidayDate
      );
      return !overridden;
    }
    return false;
  }).sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));

  const selectedDeptObj = departments.find((d) => d.id === previewDeptId);

  return (
    <div className="space-y-6">
      {/* Top Banner / Explanation of Department-Wise Holidays — Emerald Module Identity */}
      <div className={`rounded-xl p-4 text-xs flex items-start gap-3 ${MT_COLOR_CARDS.emerald}`}>
        <Info className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-emerald-950 text-sm">
            Department-Wise Government & Public Holiday Calendars
          </p>
          <p className="text-emerald-900 leading-relaxed">
            Government and public holidays are configurable per department (e.g. <strong>Maestro_Import</strong>, <strong>A R Transportation</strong>, <strong>Maestro CFS</strong>).
            Employees automatically inherit their department's calendar for leave calculation, shift scheduling, and working day validation.
            Holidays set to <em>"All Departments (Company-wide)"</em> apply globally unless customized by a specific department.
          </p>
        </div>
      </div>

      {/* Holiday Master KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`${MT_COLOR_CARDS.emerald} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 block">Total Holidays ({selectedYear})</span>
          <span className="text-2xl font-black text-emerald-950 mt-1 block">{holidays.length}</span>
          <span className="text-[11px] text-emerald-800">Active calendar entries</span>
        </div>
        <div className={`${MT_COLOR_CARDS.teal} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-900 block">Company-Wide</span>
          <span className="text-2xl font-black text-teal-950 mt-1 block">
            {holidays.filter((h) => !h.departmentId).length}
          </span>
          <span className="text-[11px] text-teal-800">All departments</span>
        </div>
        <div className={`${MT_COLOR_CARDS.sky} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-sky-900 block">Department Specific</span>
          <span className="text-2xl font-black text-sky-950 mt-1 block">
            {holidays.filter((h) => Boolean(h.departmentId)).length}
          </span>
          <span className="text-[11px] text-sky-800">Custom operational closures</span>
        </div>
        <div className={`${MT_COLOR_CARDS.amber} p-3.5`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 block">Named Holiday Lists</span>
          <span className="text-2xl font-black text-amber-950 mt-1 block">{holidayLists.length}</span>
          <span className="text-[11px] text-amber-800">{holidayAssignments.length} employee overrides</span>
        </div>
      </div>

      {/* Success / Error Messages */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* View Switcher: All Records vs Department Matrix */}
      <div className="flex items-center justify-between border-b border-emerald-200 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'table'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Holiday Master Records</span>
          </button>
          <button
            onClick={() => setViewMode('dept_preview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'dept_preview'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Department Calendar View</span>
          </button>
          <button
            onClick={() => setViewMode('holiday_lists')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'holiday_lists'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Holiday Lists & Employee Assignments ({holidayAssignments.length})</span>
          </button>
        </div>

        {canEdit && (
          <button
            id="btn-add-holiday"
            onClick={openAddModal}
            className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-800 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Holiday</span>
          </button>
        )}
      </div>

      {viewMode === 'holiday_lists' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Holiday Lists Card */}
          <div className={`${MT_COLOR_CARDS.emerald} p-5 space-y-4`}>
            <div>
              <h2 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-700" />
                Named Holiday Lists ({holidayLists.length})
              </h2>
              <p className="text-xs text-emerald-900/80 mt-0.5">
                Configure multiple holiday calendars by location, shift group, or department
              </p>
            </div>

            {canEdit && (
              <form onSubmit={handleCreateHolidayList} className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="List Code (e.g. HL-PORT-2026)"
                    value={newListForm.listCode}
                    onChange={(e) => setNewListForm({ ...newListForm, listCode: e.target.value })}
                    className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md font-mono"
                  />
                  <input
                    type="text"
                    required
                    placeholder="List Name (e.g. Port Ops Calendar)"
                    value={newListForm.listName}
                    onChange={(e) => setNewListForm({ ...newListForm, listName: e.target.value })}
                    className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <select
                    value={newListForm.departmentId}
                    onChange={(e) => setNewListForm({ ...newListForm, departmentId: e.target.value })}
                    className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md"
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-red-700 text-white font-semibold rounded-md hover:bg-red-800 cursor-pointer"
                  >
                    + Create Holiday List
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto border border-neutral-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-neutral-200">
                  <tr>
                    <th className="py-2 px-3">Code</th>
                    <th className="py-2 px-3">List Name</th>
                    <th className="py-2 px-3">Department</th>
                    <th className="py-2 px-3">Holidays</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {holidayLists.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 px-3 font-mono font-bold text-neutral-900">{l.listCode}</td>
                      <td className="py-2 px-3 font-medium text-neutral-800">
                        {l.listName}
                        {l.isDefault && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px]">
                            Default
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-neutral-600">{l.departmentName || 'All Departments'}</td>
                      <td className="py-2 px-3 font-semibold">{l.holidayCount ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Effective-Dated Employee Holiday List Assignments Card */}
          <div className={`${MT_COLOR_CARDS.teal} p-5 space-y-4`}>
            <div>
              <h2 className="text-sm font-bold text-teal-950 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-teal-700" />
                Employee Holiday List Assignments ({holidayAssignments.length})
              </h2>
              <p className="text-xs text-teal-900/80 mt-0.5">
                Assign effective-dated holiday lists to individual employees for leave & working-day calculation
              </p>
            </div>

            {canEdit && (
              <form onSubmit={handleAssignHolidayList} className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <select
                    required
                    value={newAssignForm.employeeId}
                    onChange={(e) => setNewAssignForm({ ...newAssignForm, employeeId: e.target.value })}
                    className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md"
                  >
                    <option value="">-- Select Employee --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employeeName} ({emp.employeeCode})
                      </option>
                    ))}
                  </select>
                  <select
                    required
                    value={newAssignForm.holidayListId}
                    onChange={(e) => setNewAssignForm({ ...newAssignForm, holidayListId: e.target.value })}
                    className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md"
                  >
                    <option value="">-- Select Holiday List --</option>
                    {holidayLists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.listName} ({l.listCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <input
                    type="date"
                    required
                    value={newAssignForm.effectiveFrom}
                    onChange={(e) => setNewAssignForm({ ...newAssignForm, effectiveFrom: e.target.value })}
                    className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md"
                  />
                  <input
                    type="date"
                    value={newAssignForm.effectiveTo}
                    onChange={(e) => setNewAssignForm({ ...newAssignForm, effectiveTo: e.target.value })}
                    placeholder="Effective To"
                    className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-red-700 text-white font-semibold rounded-md hover:bg-red-800 cursor-pointer"
                  >
                    Assign List
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto border border-neutral-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-neutral-200">
                  <tr>
                    <th className="py-2 px-3">Employee</th>
                    <th className="py-2 px-3">Holiday List</th>
                    <th className="py-2 px-3">Effective Dates</th>
                    {canEdit && <th className="py-2 px-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {holidayAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-neutral-500">
                        No employee-specific holiday list overrides configured.
                      </td>
                    </tr>
                  ) : (
                    holidayAssignments.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2 px-3 font-medium text-neutral-900">
                          {a.employeeName || `Employee #${a.employeeId}`}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY.badgeClass}`}>
                            {a.holidayListName || a.holidayListCode || `List #${a.holidayListId}`}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-neutral-600">
                          {formatDate(a.effectiveFrom)} → {a.effectiveTo ? formatDate(a.effectiveTo) : 'Ongoing'}
                        </td>
                        {canEdit && (
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteHolidayAssignment(a.id)}
                              className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : viewMode === 'dept_preview' ? (
        /* ============================================================== */
        /* DEPARTMENT CALENDAR PREVIEW VIEW */
        /* ============================================================== */
        <div className={`${MT_COLOR_CARDS.emerald} overflow-hidden`}>
          <div className="p-4 bg-emerald-100/60 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                <Building className="w-4 h-4 text-emerald-700" />
                Department Effective Calendar Explorer
              </h2>
              <p className="text-xs text-emerald-900/80 mt-0.5">
                Select a department to view the exact holiday list that applies to its employees
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-neutral-600">Department:</label>
              <select
                aria-label="Select department for preview"
                value={previewDeptId}
                onChange={(e) => setPreviewDeptId(Number(e.target.value))}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-neutral-300 rounded-lg text-neutral-800 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-neutral-600">
              <span>
                Total Effective Holidays for <strong>{selectedDeptObj?.name || `Dept #${previewDeptId}`}</strong>: {previewDepartmentHolidays.length} days
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className={`w-2.5 h-2.5 rounded-full inline-block ${SCHEDULE_CATEGORY_STYLES.DEPARTMENT_HOLIDAY.dotClass}`} />
                  Department Exclusive
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className={`w-2.5 h-2.5 rounded-full inline-block ${SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY.dotClass}`} />
                  Company-Wide Base
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-neutral-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Holiday Name</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Calendar Source</th>
                    <th className="py-2.5 px-3">Half-Day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {previewDepartmentHolidays.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-neutral-500">
                        No holidays found for this department.
                      </td>
                    </tr>
                  ) : (
                    previewDepartmentHolidays.map((h) => {
                      const isDeptSpecific = h.departmentId === previewDeptId;
                      const dateObj = new Date(h.holidayDate + 'T00:00:00');
                      const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short' });

                      return (
                        <tr key={h.id} className="hover:bg-neutral-50/70">
                          <td className="py-2.5 px-3 font-mono font-medium text-neutral-900">
                            {formatDate(h.holidayDate)} <span className="text-neutral-500 text-[11px]">({dayName})</span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-neutral-900">
                            {h.holidayName}
                            {h.description && (
                              <div className="text-[11px] text-neutral-500">{h.description}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {h.isOptional ? (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] font-semibold">
                                Optional
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-neutral-100 text-neutral-800 border border-neutral-200 rounded text-[10px] font-semibold">
                                Mandatory
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {isDeptSpecific ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${SCHEDULE_CATEGORY_STYLES.DEPARTMENT_HOLIDAY.badgeClass}`}>
                                🏢 {selectedDeptObj?.name} Exclusive
                              </span>
                            ) : (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY.badgeClass}`}>
                                🌐 Company-Wide
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {h.isHalfDay ? (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${SCHEDULE_CATEGORY_STYLES.HALF_DAY_LEAVE.badgeClass}`}>
                                0.5 Day
                              </span>
                            ) : (
                              <span className="text-neutral-500 text-[11px]">Full</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ============================================================== */
        /* HOLIDAY RECORDS LIST VIEW */
        /* ============================================================== */
        <div className={`${MT_COLOR_CARDS.emerald} overflow-hidden`}>
          {/* Header & Filter Controls */}
          <div className="p-4 border-b border-emerald-200 bg-emerald-100/50 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-emerald-700" />
                Organization & Department Holiday Registry
              </h2>
              <p className="text-xs text-emerald-900/80 mt-0.5">
                Manage mandatory public holidays and department-specific schedules
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Department Filter */}
              <select
                id="select-holiday-department"
                aria-label="Filter holidays by department"
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-neutral-300 rounded-lg text-neutral-700 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
              >
                <option value="all">All Department Scopes</option>
                <option value="company_only">Company-Wide Only</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    Dept: {d.name} ({d.code})
                  </option>
                ))}
              </select>

              {/* Year filter */}
              <select
                id="select-holiday-year"
                aria-label="Filter holidays by year"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-neutral-300 rounded-lg text-neutral-700 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
              >
                <option value={2025}>Year 2025</option>
                <option value={2026}>Year 2026</option>
                <option value={2027}>Year 2027</option>
              </select>

              {/* Optional / Mandatory filter */}
              <select
                id="select-holiday-type"
                aria-label="Filter holidays by type"
                value={filterOptional}
                onChange={(e) => setFilterOptional(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-neutral-300 rounded-lg text-neutral-700 focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
              >
                <option value="all">All Types</option>
                <option value="mandatory">Mandatory Only</option>
                <option value="optional">Optional / Restricted</option>
              </select>

              {/* Refresh */}
              <button
                onClick={loadData}
                className="p-1.5 border border-neutral-200 bg-white rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-5 py-2.5 bg-white border-b border-neutral-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-neutral-500 shrink-0" />
            <input
              id="input-search-holiday"
              type="text"
              placeholder="Search holiday by name, date, department or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs bg-transparent border-none focus:outline-none text-neutral-800 placeholder-neutral-400"
            />
          </div>

          {/* Table / List */}
          <div className="overflow-x-auto bg-white/95">
            <table className="w-full text-left text-xs">
              <thead className="bg-emerald-50/90 text-emerald-950 font-bold border-b border-emerald-200">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Holiday Name</th>
                  <th className="py-3 px-4">Department Scope</th>
                  <th className="py-3 px-4">Day</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Half-Day</th>
                  <th className="py-3 px-4">Status</th>
                  {canEdit && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-neutral-500">
                      Loading holiday calendar...
                    </td>
                  </tr>
                ) : filteredHolidays.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-neutral-500">
                      No holidays found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredHolidays.map((h) => {
                    const dateObj = new Date(h.holidayDate + 'T00:00:00');
                    const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'long' });

                    return (
                      <tr
                        key={h.id}
                        id={`holiday-row-${h.id}`}
                        className="hover:bg-neutral-50/80 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-neutral-900">
                          {formatDate(h.holidayDate)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-neutral-900">{h.holidayName}</div>
                          {h.description && (
                            <div className="text-[11px] text-neutral-500 mt-0.5">
                              {h.description}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {h.departmentId ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${SCHEDULE_CATEGORY_STYLES.DEPARTMENT_HOLIDAY.badgeClass}`}>
                              🏢 {h.departmentName || `Dept #${h.departmentId}`}
                            </span>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY.badgeClass}`}>
                              🌐 All Departments
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-neutral-600">{dayName}</td>
                        <td className="py-3 px-4">
                          {h.isOptional ? (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] font-semibold">
                              Optional
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-neutral-100 text-neutral-800 border border-neutral-200 rounded text-[10px] font-semibold">
                              Mandatory
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {h.isHalfDay ? (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${SCHEDULE_CATEGORY_STYLES.HALF_DAY_LEAVE.badgeClass}`}>
                              0.5 Day
                            </span>
                          ) : (
                            <span className="text-neutral-500">Full</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {h.isActive ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-500">
                              <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                              Inactive
                            </span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              id={`btn-edit-holiday-${h.id}`}
                              onClick={() => openEditModal(h)}
                              className="p-1 text-neutral-500 hover:text-neutral-900 rounded hover:bg-neutral-100 transition-colors cursor-pointer"
                              title="Edit holiday"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              id={`btn-delete-holiday-${h.id}`}
                              onClick={() => handleDelete(h.id, h.holidayName)}
                              className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete holiday"
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

      {/* 2. WEEKLY-OFF CONFIGURATION CARD */}
      <div className={`${MT_COLOR_CARDS.slate} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-950 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-700" />
              Default Weekly-Off Configuration
            </h2>
            <p className="text-xs text-slate-700 mt-0.5">
              Standard non-working recurring days of the week across the organization
            </p>
          </div>

          {canEdit && (
            <button
              id="btn-save-weekly-offs"
              onClick={handleSaveWeeklyOffs}
              disabled={savingWeeklyOffs}
              className="px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-red-800 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{savingWeeklyOffs ? 'Saving...' : 'Save Weekly Offs'}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {DAYS_OF_WEEK.map((day) => {
            const isOff = weeklyOffs.includes(day.index);
            return (
              <button
                key={day.index}
                id={`weekly-off-day-${day.index}`}
                type="button"
                onClick={() => handleToggleWeeklyOff(day.index)}
                disabled={!canEdit}
                className={`p-3 rounded-lg text-center transition-all cursor-pointer ${
                  isOff
                    ? `${SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.containerClass} font-bold shadow-2xs`
                    : `${SCHEDULE_CATEGORY_STYLES.WORKING_DAY.containerClass} font-medium`
                } ${!canEdit ? 'opacity-80 cursor-default' : ''}`}
              >
                <div className={`text-xs ${isOff ? SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.titleClass : SCHEDULE_CATEGORY_STYLES.WORKING_DAY.titleClass}`}>{day.name}</div>
                <div className="text-[10px] mt-1">
                  {isOff ? (
                    <span className={`${SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.subtextClass} font-semibold`}>Weekly Off</span>
                  ) : (
                    <span className={`${SCHEDULE_CATEGORY_STYLES.WORKING_DAY.subtextClass} font-semibold`}>Working Day</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. MODAL FOR ADD / EDIT HOLIDAY */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div
            id="holiday-modal-dialog"
            className="bg-white rounded-xl shadow-xl max-w-md w-full border border-neutral-200 overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 bg-neutral-50/80">
              <h3 className="text-sm font-bold text-neutral-900">
                {editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-neutral-500 hover:text-neutral-700 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
                  {formError}
                </div>
              )}

              {/* Holiday Date */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Holiday Date (DD/MM/YYYY) *
                </label>
                <input
                  id="input-holiday-date"
                  type="date"
                  required
                  value={formData.holidayDate}
                  onChange={(e) => setFormData({ ...formData, holidayDate: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
                />
              </div>

              {/* Holiday Name */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Holiday Name *
                </label>
                <input
                  id="input-holiday-name"
                  type="text"
                  required
                  placeholder="e.g. Independence Day or Fleet Maintenance Day"
                  value={formData.holidayName}
                  onChange={(e) => setFormData({ ...formData, holidayName: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
                />
              </div>

              {/* Department Assignment */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Applicable Department Scope *
                </label>
                <select
                  id="select-modal-department"
                  value={formData.departmentId}
                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700 bg-white"
                >
                  <option value="">All Departments (Company-wide Public Holiday)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Select a department if this government holiday applies only to that specific department (e.g. Maestro_Import, A R Transportation, Maestro CFS).
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Description / Remarks
                </label>
                <input
                  id="input-holiday-desc"
                  type="text"
                  placeholder="e.g. Gazetted holiday or department operational closure"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
                />
              </div>

              {/* Checkboxes: Optional, HalfDay, Active */}
              <div className="pt-2 space-y-2.5 border-t border-neutral-100">
                <label className="flex items-center gap-2 cursor-pointer text-neutral-700">
                  <input
                    id="checkbox-is-optional"
                    type="checkbox"
                    checked={formData.isOptional}
                    onChange={(e) => setFormData({ ...formData, isOptional: e.target.checked })}
                    className="rounded text-neutral-900 focus:ring-0"
                  />
                  <span>Optional / Restricted holiday</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-neutral-700">
                  <input
                    id="checkbox-is-half-day"
                    type="checkbox"
                    checked={formData.isHalfDay}
                    onChange={(e) => setFormData({ ...formData, isHalfDay: e.target.checked })}
                    className="rounded text-neutral-900 focus:ring-0"
                  />
                  <span>Half-day holiday (0.5 working day)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-neutral-700">
                  <input
                    id="checkbox-is-active"
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded text-neutral-900 focus:ring-0"
                  />
                  <span>Active in calendar calculation</span>
                </label>
              </div>

              {/* Form Buttons */}
              <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-neutral-200 text-neutral-700 font-semibold rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-holiday"
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800 disabled:opacity-50 shadow-2xs cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingHoliday ? 'Update Holiday' : 'Create Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
