import React, { useState, useEffect } from 'react';
import {
  Users,
  Download,
  UserPlus,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Building,
  Briefcase,
  Mail,
  Phone,
  Clock,
  ChevronDown,
  X,
  RefreshCw,
  Power,
  Shield,
} from 'lucide-react';
import { EmployeeDto, DepartmentDto, DesignationDto, ShiftDto, EmploymentType, EmploymentStatus } from '../../types/leave.ts';
import { strToU8, zipSync } from 'fflate';
import { getActiveRole, apiFetch } from '../../lib/api.ts';
import { Employee360Link } from '../Employee360Trigger.tsx';

export function EmployeeAdmin({
  onOpenUserProfile,
}: {
  onOpenUserProfile?: (target: { userId?: number; employeeId?: number | string; employeeCode?: string }) => void;
} = {}) {
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [designations, setDesignations] = useState<DesignationDto[]>([]);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [lastLoginByUserId, setLastLoginByUserId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDeleteEmp, setConfirmDeleteEmp] = useState<EmployeeDto | null>(null);
  const [deletingEmp, setDeletingEmp] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [desigFilter, setDesigFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [managerFilter, setManagerFilter] = useState<string>('ALL');
  const [shiftFilter, setShiftFilter] = useState<string>('ALL');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeDto | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    employeeCode: '',
    employeeName: '',
    email: '',
    mobile: '',
    departmentId: '',
    designationId: '',
    reportingManagerId: '',
    employmentType: 'FULL_TIME' as EmploymentType,
    employmentStatus: 'ACTIVE' as EmploymentStatus,
    joiningDate: new Date().toISOString().split('T')[0],
    officeLocation: 'Headquarters',
    weeklyOff: '0', // Sunday
    shiftId: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
    remarks: '',
    hrApprovalRequired: true,
  });

  const activeRole = getActiveRole();
  const isSuperAdmin = activeRole === 'SUPER_ADMIN';
  const canManage = activeRole === 'SUPER_ADMIN' || activeRole === 'HR';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [empRes, deptRes, desigRes, shiftRes] = await Promise.all([
        apiFetch('/api/employees'),
        apiFetch('/api/departments'),
        apiFetch('/api/designations'),
        apiFetch('/api/shifts'),
      ]);

      if (!empRes.ok) throw new Error('Failed to load employee directory');

      const empData = await empRes.json();
      const deptData = await deptRes.json();
      const desigData = await desigRes.json();
      const shiftData = await shiftRes.json();

      setEmployees(empData.employees || []);
      setDepartments(deptData.departments || []);
      setDesignations(desigData.designations || []);
      setShifts(shiftData.shifts || []);
      if (isSuperAdmin) {
        try {
          const activityRes = await apiFetch('/api/admin/user-last-activity');
          if (activityRes.ok) {
            const activityData = await activityRes.json();
            setLastLoginByUserId(activityData.lastLoginByUserId || {});
          }
        } catch {
          // Keep the employee directory available if login activity cannot be loaded.
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error loading employee data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      const payload: any = {
        employeeCode: formData.employeeCode.trim() ? formData.employeeCode.trim().toUpperCase() : undefined,
        employeeName: formData.employeeName.trim(),
        officialEmail: formData.email.trim(),
        mobile: formData.mobile.trim() || undefined,
        departmentId: formData.departmentId ? Number(formData.departmentId) : undefined,
        designationId: formData.designationId ? Number(formData.designationId) : undefined,
        reportingManagerId: formData.reportingManagerId ? Number(formData.reportingManagerId) : undefined,
        employmentType: formData.employmentType,
        employmentStatus: formData.employmentStatus,
        joiningDate: formData.joiningDate || undefined,
        officeLocation: formData.officeLocation || undefined,
        weeklyOffDays: formData.weeklyOff ? [Number(formData.weeklyOff)] : undefined,
        shiftId: formData.shiftId ? Number(formData.shiftId) : undefined,
        remarks: formData.remarks || undefined,
        hrApprovalRequired: formData.hrApprovalRequired,
      };

      const res = await apiFetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create employee');
      }

      const emailStatus = data.credentialEmail ?? data.employee?.credentialEmail;
      if (emailStatus && emailStatus.sent === false) {
        setError(
          `Employee ${data.employee.employeeName} (${data.employee.employeeCode}) added, but credential email delivery failed: ${emailStatus.error || 'Email delivery failed.'}`
        );
      } else {
        setSuccessMsg(
          emailStatus?.sent
            ? `Employee ${data.employee.employeeName} (${data.employee.employeeCode}) added and login credentials sent to ${emailStatus.recipientEmail}!`
            : `Employee ${data.employee.employeeName} (${data.employee.employeeCode}) added successfully!`
        );
      }
      setIsAddModalOpen(false);
      resetForm();
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    setError(null);
    setSuccessMsg(null);

    try {
      const payload: any = {
        employeeName: formData.employeeName.trim(),
        officialEmail: formData.email.trim(),
        employeeCode: formData.employeeCode.trim().toUpperCase(),
        mobile: formData.mobile.trim() || null,
        departmentId: formData.departmentId ? Number(formData.departmentId) : null,
        designationId: formData.designationId ? Number(formData.designationId) : null,
        reportingManagerId: formData.reportingManagerId ? Number(formData.reportingManagerId) : null,
        employmentType: formData.employmentType,
        employmentStatus: formData.employmentStatus,
        joiningDate: formData.joiningDate || null,
        officeLocation: formData.officeLocation || null,
        weeklyOffDays: formData.weeklyOff !== '' ? [Number(formData.weeklyOff)] : undefined,
        shiftId: formData.shiftId ? Number(formData.shiftId) : undefined,
        remarks: formData.remarks || undefined,
        hrApprovalRequired: formData.hrApprovalRequired,
      };

      const res = await apiFetch(`/api/employees/${selectedEmp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update employee');
      }

      setSuccessMsg(`Employee ${data.employee.employeeName} updated successfully.`);
      setIsEditModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (emp: EmployeeDto) => {
    setError(null);
    setSuccessMsg(null);
    const newActive = emp.employmentStatus !== 'ACTIVE';

    try {
      const res = await apiFetch(`/api/employees/${emp.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newActive }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update employee status');
      }

      setSuccessMsg(`Employee ${emp.employeeName} is now ${newActive ? 'Active' : 'Deactivated'}.`);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteEmployee = async (emp: EmployeeDto) => {
    setError(null);
    setSuccessMsg(null);
    setDeletingEmp(true);

    try {
      const res = await apiFetch(`/api/employees/${emp.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete employee');
      }

      setSuccessMsg(data.message || `Employee ${emp.employeeName} deleted successfully.`);
      setConfirmDeleteEmp(null);
      loadData();
    } catch (err: any) {
      // Clear dependency message explaining safe deactivation option
      setError(err.message);
      setConfirmDeleteEmp(null);
    } finally {
      setDeletingEmp(false);
    }
  };

  const openEdit = (emp: EmployeeDto) => {
    setSelectedEmp(emp);
    setFormData({
      employeeCode: emp.employeeCode || '',
      employeeName: emp.employeeName || emp.fullName || '',
      email: emp.officialEmail || emp.email || '',
      mobile: emp.mobile || '',
      departmentId: emp.departmentId ? String(emp.departmentId) : '',
      designationId: emp.designationId ? String(emp.designationId) : '',
      reportingManagerId: emp.reportingManagerId ? String(emp.reportingManagerId) : '',
      employmentType: (emp.employmentType as EmploymentType) || 'FULL_TIME',
      employmentStatus: (emp.employmentStatus as EmploymentStatus) || 'ACTIVE',
      joiningDate: emp.joiningDate || '',
      officeLocation: emp.officeLocation || 'Headquarters',
      weeklyOff: emp.weeklyOff || '0',
      shiftId: emp.currentShiftId ? String(emp.currentShiftId) : '',
      effectiveFrom: new Date().toISOString().split('T')[0],
      remarks: '',
      hrApprovalRequired: emp.hrApprovalRequired !== undefined ? Boolean(emp.hrApprovalRequired) : true,
    });
    setIsEditModalOpen(true);
  };

  const openView = (emp: EmployeeDto) => {
    setSelectedEmp(emp);
    setIsViewModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      employeeCode: '',
      employeeName: '',
      email: '',
      mobile: '',
      departmentId: '',
      designationId: '',
      reportingManagerId: '',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      joiningDate: new Date().toISOString().split('T')[0],
      officeLocation: 'Headquarters',
      weeklyOff: '0',
      shiftId: '',
      effectiveFrom: new Date().toISOString().split('T')[0],
      remarks: '',
      hrApprovalRequired: true,
    });
  };

  // Filter logic
  const filteredEmployees = employees.filter((emp) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (emp.employeeName && emp.employeeName.toLowerCase().includes(q)) ||
      (emp.employeeCode && emp.employeeCode.toLowerCase().includes(q)) ||
      (emp.officialEmail && emp.officialEmail.toLowerCase().includes(q)) ||
      (emp.mobile && emp.mobile.includes(q));

    const matchesDept = deptFilter === 'ALL' || String(emp.departmentId) === deptFilter;
    const matchesDesig = desigFilter === 'ALL' || String(emp.designationId) === desigFilter;
    const matchesStatus = statusFilter === 'ALL' || emp.employmentStatus === statusFilter;
    const matchesType = typeFilter === 'ALL' || emp.employmentType === typeFilter;
    const matchesManager = managerFilter === 'ALL' || String(emp.reportingManagerId) === managerFilter;
    const matchesShift = shiftFilter === 'ALL' || String(emp.currentShiftId) === shiftFilter || emp.currentShiftCode === shiftFilter;

    return matchesSearch && matchesDept && matchesDesig && matchesStatus && matchesType && matchesManager && matchesShift;
  }).sort((a, b) => {
    const aIsAdmin = String(a.role || '').toUpperCase() === 'SUPER_ADMIN';
    const bIsAdmin = String(b.role || '').toUpperCase() === 'SUPER_ADMIN';
    if (aIsAdmin !== bIsAdmin) return aIsAdmin ? -1 : 1;
    const aCode = String(a.employeeCode || '').trim();
    const bCode = String(b.employeeCode || '').trim();
    if (aCode && bCode) return aCode.localeCompare(bCode, undefined, { numeric: true, sensitivity: 'base' });
    if (aCode) return -1;
    if (bCode) return 1;
    return String(a.employeeName || a.fullName || '').localeCompare(String(b.employeeName || b.fullName || ''), undefined, { numeric: true, sensitivity: 'base' });
  });

  const handleExportEmployeesExcel = () => {
    const headers = [
      'Employee Code', 'Employee Name', 'Official Email', 'Mobile',
      'Department', 'Designation', 'Reporting Manager', 'Employment Type',
      'Employment Status', 'Role', 'Joining Date', 'Office Location',
      'Shift Code', 'Shift Name', 'Weekly Off', 'HR Approval Required',
      'Holiday List', 'Active',
    ];
    const rows = employees.map((emp) => [
      emp.employeeCode,
      emp.employeeName || emp.fullName,
      emp.officialEmail || emp.email,
      emp.mobile,
      emp.departmentName,
      emp.designationName,
      emp.reportingManagerName,
      emp.employmentType,
      emp.employmentStatus,
      emp.role,
      emp.joiningDate,
      emp.officeLocation,
      emp.currentShiftCode,
      emp.currentShiftName,
      emp.weeklyOff,
      (emp as any).hrApprovalRequired === undefined ? '' : ((emp as any).hrApprovalRequired ? 'Yes' : 'No'),
      emp.currentHolidayListName || emp.currentHolidayListCode,
      emp.isActive ? 'Yes' : 'No',
    ].map((value) => value === null || value === undefined ? '' : String(value)));

    const xmlEscape = (value: string) => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
    const columnName = (index: number) => {
      let number = index + 1;
      let name = '';
      while (number > 0) {
        const remainder = (number - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        number = Math.floor((number - 1) / 26);
      }
      return name;
    };
    const makeRow = (values: string[], rowNumber: number) =>
      `<row r="${rowNumber}">${values.map((value, index) =>
        `<c r="${columnName(index)}${rowNumber}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
      ).join('')}</row>`;
    const sheetRows = [makeRow(headers, 1), ...rows.map((row, index) => makeRow(row, index + 2))].join('');
    const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${columnName(headers.length - 1)}${rows.length + 1}"/></worksheet>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Employees" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const files: Record<string, Uint8Array> = {
      '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
      '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
      'xl/workbook.xml': strToU8(workbook),
      'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
      'xl/worksheets/sheet1.xml': strToU8(worksheet),
    };
    const blob = new Blob([zipSync(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MT-Leave-Employees-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSuccessMsg(`Excel downloaded successfully: ${employees.length} employee record(s).`);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl border border-sky-300 border-t-[5px] border-t-sky-600 bg-sky-50/75 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <Users className="w-5 h-5 text-sky-700" />
            <span>Employee Master & Lifecycle Management</span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Complete employee records, departmental reporting lines, employment status, shifts, and weekly-off schedule linkage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <button
              id="btn-export-employees-excel"
              onClick={handleExportEmployeesExcel}
              disabled={loading || employees.length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 transition-colors shadow-xs cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download all employee records as an Excel workbook"
            >
              <Download className="w-4 h-4" />
              <span>Download Excel</span>
            </button>
          )}
          {canManage && (
          <button
            id="btn-add-employee"
            onClick={() => {
              resetForm();
              setError(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New Employee</span>
          </button>
          )}
        </div>
      </div>

      {/* Notifications */}
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

      {/* Search & Filters */}
      <div className="rounded-xl border border-slate-300 border-t-[5px] border-t-slate-600 bg-slate-50/85 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-employee"
              type="text"
              placeholder="Search by name, code, email, mobile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
            />
          </div>

          <button
            onClick={loadData}
            title="Refresh list"
            className="p-2 border border-neutral-200 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-neutral-100 text-xs">
          <div>
            <label className="text-[11px] font-semibold text-neutral-500 mb-1 block">Department</label>
            <select
              id="filter-department"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded text-neutral-700"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-neutral-500 mb-1 block">Designation</label>
            <select
              id="filter-designation"
              value={desigFilter}
              onChange={(e) => setDesigFilter(e.target.value)}
              className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded text-neutral-700"
            >
              <option value="ALL">All Designations</option>
              {designations.map((d) => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-neutral-500 mb-1 block">Status</label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded text-neutral-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="PROBATION">Probation</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="RESIGNED">Resigned</option>
              <option value="TERMINATED">Terminated</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-neutral-500 mb-1 block">Employment Type</label>
            <select
              id="filter-employment-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded text-neutral-700"
            >
              <option value="ALL">All Types</option>
              <option value="FULL_TIME">Full Time</option>
              <option value="PART_TIME">Part Time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERN">Intern</option>
              <option value="PROBATION">Probation</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-neutral-500 mb-1 block">Reporting Manager</label>
            <select
              id="filter-reporting-manager"
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
              className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded text-neutral-700"
            >
              <option value="ALL">All Managers</option>
              {employees
                .filter((e) => e.role === 'SUPER_ADMIN' || e.role === 'HR' || e.role === 'TOP_MANAGEMENT' || e.role === 'TEAM_LEADER')
                .map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.employeeCode} — {m.employeeName} — {m.departmentName || 'No Dept'}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-neutral-500 mb-1 block">Shift</label>
            <select
              id="filter-shift"
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded text-neutral-700"
            >
              <option value="ALL">All Shifts</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.shiftCode}>{s.shiftCode} ({s.shiftName})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Employee List Table */}
      <div className="bg-white rounded-xl border border-sky-300 border-t-[5px] border-t-sky-600 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-sky-50/85 text-slate-800 font-bold border-b border-sky-200">
              <tr>
                <th className="py-3 px-4">Code / ID</th>
                <th className="py-3 px-4">Employee Name</th>
                <th className="py-3 px-4">Department & Designation</th>
                <th className="py-3 px-4">Reporting Manager</th>
                <th className="py-3 px-4">Employment Type</th>
                <th className="py-3 px-4">Current Shift</th>
                <th className="py-3 px-4">HR Approval Required</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-neutral-500">Loading employees...</td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-neutral-500">No employees found matching criteria.</td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <Employee360Link
                        employeeId={emp.id}
                        employeeCode={emp.employeeCode || `EMP-${emp.id}`}
                        employeeName={emp.employeeName || emp.fullName}
                        userId={emp.userId ?? undefined}
                        variant="badge"
                      >
                        {emp.employeeCode || `EMP-${emp.id}`}
                      </Employee360Link>
                      <div className="text-[10px] text-neutral-500 mt-0.5">ID: {emp.id}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {emp.profilePhotoUrl ? (
                          <img
                            src={emp.profilePhotoUrl}
                            alt={emp.employeeName || emp.fullName || 'Employee'}
                            className="w-7 h-7 rounded-full object-cover border border-neutral-200 shrink-0"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                            {(emp.employeeName || emp.fullName || 'E').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-neutral-900">
                            <Employee360Link
                              employeeId={emp.id}
                              employeeCode={emp.employeeCode}
                              employeeName={emp.employeeName || emp.fullName}
                              userId={emp.userId ?? undefined}
                            >
                              {emp.employeeName || emp.fullName}
                            </Employee360Link>
                          </div>
                          <div className="text-[11px] text-neutral-500">{emp.officialEmail || emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-neutral-800">{emp.departmentName || '—'}</div>
                      <div className="text-[11px] text-neutral-500">{emp.designationName || '—'}</div>
                    </td>
                    <td className="py-3 px-4 text-neutral-700">
                      {emp.reportingManagerName ? (
                        <Employee360Link
                          employeeId={emp.reportingManagerId ?? undefined}
                          employeeName={emp.reportingManagerName}
                        >
                          {emp.reportingManagerName}
                        </Employee360Link>
                      ) : (
                        <span className="text-neutral-500 italic">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-700">
                        {emp.employmentType?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {emp.currentShiftCode || 'GN'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {isSuperAdmin ? (
                        <button
                          id={"toggle-emp-hr-approval-" + emp.id}
                          type="button"
                          onClick={async () => {
                            const nextVal = !(emp.hrApprovalRequired ?? true);
                            try {
                              const res = await apiFetch("/api/employees/" + emp.id, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ hrApprovalRequired: nextVal }),
                              });
                              if (!res.ok) {
                                const errData = await res.json().catch(() => ({}));
                                throw new Error(errData.error || 'Failed to update HR approval setting');
                              }
                              setSuccessMsg("HR Approval Required for " + emp.employeeName + " set to " + (nextVal ? "ON (3-Stage: TL → HR → Mgmt)" : "OFF (2-Stage: TL → Mgmt)") + ".");
                              loadData();
                            } catch (err: any) {
                              setError(err.message || 'Error updating HR approval setting');
                            }
                          }}
                          className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors cursor-pointer " + (
                            (emp.hrApprovalRequired ?? true)
                              ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                              : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                          )}
                          title="Click to toggle HR Approval Stage (Super Admin)"
                        >
                          {(emp.hrApprovalRequired ?? true) ? "ON (3-Stage)" : "OFF (2-Stage)"}
                        </button>
                      ) : (
                        <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border " + (
                          (emp.hrApprovalRequired ?? true)
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        )}>
                          {(emp.hrApprovalRequired ?? true) ? "ON (3-Stage)" : "OFF (2-Stage)"}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          emp.employmentStatus === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${emp.employmentStatus === 'ACTIVE' ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                        {emp.employmentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Employee360Link
                          employeeId={emp.id}
                          employeeCode={emp.employeeCode}
                          employeeName={emp.employeeName || emp.fullName}
                          userId={emp.userId ?? undefined}
                          variant="button"
                          showIcon
                        >
                          360° Profile
                        </Employee360Link>
                        {onOpenUserProfile && (
                          <button
                            id={`btn-open-emp-profile-${emp.id}`}
                            onClick={() =>
                              onOpenUserProfile({
                                userId: emp.userId ?? undefined,
                                employeeId: emp.id,
                                employeeCode: emp.employeeCode,
                              })
                            }
                            title="Open Complete Profile & Operate User"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Open Profile</span>
                          </button>
                        )}

                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('open-employee-dashboard', {
                              detail: {
                                employeeId: Number(emp.id),
                                employeeName: emp.employeeName || emp.fullName || `Employee ${emp.id}`,
                                employeeCode: emp.employeeCode || undefined,
                              },
                            }))}
                            title="View employee dashboard and process leave"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-neutral-900 text-white border border-neutral-900 hover:bg-neutral-700 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Dashboard</span>
                          </button>
                        )}

                        <button
                          onClick={() => openView(emp)}
                          title="Quick Summary"
                          className="p-1 text-neutral-500 hover:text-neutral-800 rounded hover:bg-neutral-100 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {canManage && (
                          <button
                            onClick={() => openEdit(emp)}
                            title="Edit Employee"
                            className="p-1 text-neutral-500 hover:text-neutral-800 rounded hover:bg-neutral-100 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canManage && (
                          <button
                            onClick={() => handleToggleStatus(emp)}
                            title={emp.employmentStatus === 'ACTIVE' ? 'Deactivate Employee' : 'Activate Employee'}
                            className={`p-1 rounded hover:bg-neutral-100 cursor-pointer ${
                              emp.employmentStatus === 'ACTIVE' ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {isSuperAdmin && (
                          <button
                            onClick={() => setConfirmDeleteEmp(emp)}
                            title="Delete Employee (Safe check)"
                            className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add Employee */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-neutral-700" />
                <span>Onboard New Employee</span>
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-neutral-500 hover:text-neutral-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Employee Code <span className="text-neutral-500 font-normal">(Auto if blank)</span>
                  </label>
                  <input
                    id="input-emp-code"
                    type="text"
                    placeholder="Auto-generated (e.g. MT002) or enter manually"
                    value={formData.employeeCode}
                    onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg uppercase"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Full Legal Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-emp-name"
                    type="text"
                    required
                    placeholder="e.g. Amit Sharma"
                    value={formData.employeeName}
                    onChange={(e) => setFormData({ ...formData, employeeName: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Official Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-emp-email"
                    type="email"
                    required
                    placeholder="e.g. amit@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Mobile Number</label>
                  <input
                    id="input-emp-mobile"
                    type="tel"
                    placeholder="e.g. +91 9876543210"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Department</label>
                  <select
                    id="input-emp-dept"
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  >
                    <option value="">Select Department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Designation</label>
                  <select
                    id="input-emp-desig"
                    value={formData.designationId}
                    onChange={(e) => setFormData({ ...formData, designationId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  >
                    <option value="">Select Designation</option>
                    {designations.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Reporting Manager</label>
                  <select
                    id="input-emp-manager"
                    value={formData.reportingManagerId}
                    onChange={(e) => setFormData({ ...formData, reportingManagerId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  >
                    <option value="">No Manager (Direct Executive)</option>
                    {employees.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.employeeCode} — {m.employeeName} — {m.departmentName || 'No Dept'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Employment Type</label>
                  <select
                    id="input-emp-type"
                    value={formData.employmentType}
                    onChange={(e) => setFormData({ ...formData, employmentType: e.target.value as EmploymentType })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  >
                    <option value="FULL_TIME">Full Time</option>
                    <option value="PART_TIME">Part Time</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="INTERN">Intern</option>
                    <option value="PROBATION">Probation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Date of Joining</label>
                  <input
                    id="input-emp-joining"
                    type="date"
                    value={formData.joiningDate}
                    onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Office Location</label>
                  <input
                    id="input-emp-location"
                    type="text"
                    placeholder="e.g. Headquarters / Mumbai Branch"
                    value={formData.officeLocation}
                    onChange={(e) => setFormData({ ...formData, officeLocation: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Weekly Off Schedule</label>
                  <select
                    id="input-emp-weekly-off"
                    value={formData.weeklyOff}
                    onChange={(e) => setFormData({ ...formData, weeklyOff: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  >
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                    <option value="0">Sunday</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Shift Assignment</label>
                  <select
                    id="input-emp-shift"
                    value={formData.shiftId}
                    onChange={(e) => setFormData({ ...formData, shiftId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  >
                    <option value="">Default Company Shift (GN 08:30-17:30)</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>{s.shiftCode} - {s.shiftName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Employee-Specific HR Approval Workflow Setting */}
              <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-purple-700" />
                    <span>HR Approval Required</span>
                  </label>
                  <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + (
                    formData.hrApprovalRequired ? "bg-purple-700 text-white" : "bg-amber-500 text-white"
                  )}>
                    {formData.hrApprovalRequired ? "3-Stage Active" : "2-Stage Active"}
                  </span>
                </div>
                <select
                  id="input-emp-hr-approval-required-add"
                  disabled={!isSuperAdmin}
                  value={formData.hrApprovalRequired ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, hrApprovalRequired: e.target.value === 'true' })}
                  className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-700 disabled:bg-neutral-100"
                >
                  <option value="true">ON — 3-Stage Workflow (Team Leader → HR → Top Management)</option>
                  <option value="false">OFF — 2-Stage Workflow (Team Leader → Top Management, Bypassing HR)</option>
                </select>
                <p className="text-[11px] text-purple-800/80">
                  Controls whether this individual employee's leave requests require HR review. Only Super Admin can change this setting.
                </p>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Remarks / Onboarding Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional notes, probation details, or location remarks..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-employee"
                  type="submit"
                  className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer font-medium"
                >
                  Save Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Employee */}
      {isEditModalOpen && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-neutral-700" />
                <span>Edit Employee: {selectedEmp.employeeName}</span>
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-neutral-500 hover:text-neutral-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Employee Code</label>
                  <input
                    type="text"
                    required
                    value={formData.employeeCode}
                    onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg uppercase"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Full Legal Name</label>
                  <input
                    type="text"
                    required
                    value={formData.employeeName}
                    onChange={(e) => setFormData({ ...formData, employeeName: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Official Email</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Mobile</label>
                  <input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Department</label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  >
                    <option value="">None</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Designation</label>
                  <select
                    value={formData.designationId}
                    onChange={(e) => setFormData({ ...formData, designationId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  >
                    <option value="">None</option>
                    {designations.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Reporting Manager</label>
                  <select
                    value={formData.reportingManagerId}
                    onChange={(e) => setFormData({ ...formData, reportingManagerId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  >
                    <option value="">None</option>
                    {employees
                      .filter((m) => m.id !== selectedEmp.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.employeeCode} — {m.employeeName} — {m.departmentName || 'No Dept'}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Employee-Specific HR Approval Workflow Setting (Edit Modal) */}
                <div className="sm:col-span-2 p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-purple-700" />
                      <span>HR Approval Required</span>
                    </label>
                    <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + (
                      formData.hrApprovalRequired ? "bg-purple-700 text-white" : "bg-amber-500 text-white"
                    )}>
                      {formData.hrApprovalRequired ? "3-Stage Active" : "2-Stage Active"}
                    </span>
                  </div>
                  <select
                    id="input-emp-hr-approval-required-edit"
                    disabled={!isSuperAdmin}
                    value={formData.hrApprovalRequired ? 'true' : 'false'}
                    onChange={(e) => setFormData({ ...formData, hrApprovalRequired: e.target.value === 'true' })}
                    className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-700 disabled:bg-neutral-100"
                  >
                    <option value="true">ON — 3-Stage Workflow (Team Leader → HR → Top Management)</option>
                    <option value="false">OFF — 2-Stage Workflow (Team Leader → Top Management, Bypassing HR)</option>
                  </select>
                  <p className="text-[11px] text-purple-800/80">
                    {isSuperAdmin
                      ? "Super Admin control: Switching ON routes this employee's requests through HR. Switching OFF routes approved TL requests directly to Top Management."
                      : "Read-only: Only Super Administrator can modify an employee's HR approval workflow."}
                  </p>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Status</label>
                  <select
                    value={formData.employmentStatus}
                    onChange={(e) => setFormData({ ...formData, employmentStatus: e.target.value as EmploymentStatus })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="PROBATION">PROBATION</option>
                    <option value="ON_LEAVE">ON_LEAVE</option>
                    <option value="RESIGNED">RESIGNED</option>
                    <option value="TERMINATED">TERMINATED</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3.5 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer font-medium"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Employee */}
      {isViewModalOpen && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-neutral-700" />
                <span>Employee Dossier: {selectedEmp.employeeName}</span>
              </h3>
              <button onClick={() => setIsViewModalOpen(false)} className="text-neutral-500 hover:text-neutral-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-3.5 bg-neutral-50 rounded-lg border border-neutral-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-sm">
                  {selectedEmp.employeeName[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-neutral-900 text-sm">{selectedEmp.employeeName}</div>
                  <div className="text-[11px] text-neutral-500">
                    {selectedEmp.employeeCode} • {selectedEmp.officialEmail}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded border border-neutral-100 bg-neutral-50/50">
                  <span className="text-neutral-500 block">Department</span>
                  <span className="font-semibold text-neutral-800">{selectedEmp.departmentName || '—'}</span>
                </div>
                <div className="p-2.5 rounded border border-neutral-100 bg-neutral-50/50">
                  <span className="text-neutral-500 block">Designation</span>
                  <span className="font-semibold text-neutral-800">{selectedEmp.designationName || '—'}</span>
                </div>
                <div className="p-2.5 rounded border border-neutral-100 bg-neutral-50/50">
                  <span className="text-neutral-500 block">Reporting Manager</span>
                  <span className="font-semibold text-neutral-800">{selectedEmp.reportingManagerName || 'None'}</span>
                </div>
                <div className="p-2.5 rounded border border-neutral-100 bg-neutral-50/50">
                  <span className="text-neutral-500 block">Employment Status</span>
                  <span className="font-semibold text-neutral-800">{selectedEmp.employmentStatus}</span>
                </div>
                <div className="p-2.5 rounded border border-neutral-100 bg-neutral-50/50">
                  <span className="text-neutral-500 block">Current Shift</span>
                  <span className="font-semibold text-emerald-800">{selectedEmp.currentShiftCode || 'GN'}</span>
                </div>
                <div className="p-2.5 rounded border border-neutral-100 bg-neutral-50/50">
                  <span className="text-neutral-500 block">HR Approval Required</span>
                  <span className={"font-bold " + ((selectedEmp.hrApprovalRequired ?? true) ? "text-purple-700" : "text-amber-700")}>
                    {(selectedEmp.hrApprovalRequired ?? true) ? "ON (3-Stage: TL → HR → Mgmt)" : "OFF (2-Stage: TL → Mgmt)"}
                  </span>
                </div>
                <div className="p-2.5 rounded border border-neutral-100 bg-neutral-50/50">
                  <span className="text-neutral-500 block">Mobile</span>
                  <span className="font-semibold text-neutral-800">{selectedEmp.mobile || '—'}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-neutral-100 mt-4">
              <button
                type="button"
                onClick={() => setIsViewModalOpen(false)}
                className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer font-medium text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Employee Confirmation Modal */}
      {confirmDeleteEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Delete Employee</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Are you sure you want to delete <span className="font-semibold text-neutral-800">'{confirmDeleteEmp.employeeName}' ({confirmDeleteEmp.employeeCode})</span>?
                </p>
              </div>
            </div>
            <p className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
              Employee deletion enforces operational dependency checks. If shift schedules, leave requests, or reporting lines exist, the system blocks deletion safely.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteEmp(null)}
                disabled={deletingEmp}
                className="px-3 py-1.5 border border-neutral-200 text-neutral-700 text-xs rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-emp"
                onClick={() => handleDeleteEmployee(confirmDeleteEmp)}
                disabled={deletingEmp}
                className="px-3.5 py-1.5 bg-rose-600 text-white text-xs rounded-lg hover:bg-rose-700 cursor-pointer font-medium flex items-center gap-1.5"
              >
                {deletingEmp ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
