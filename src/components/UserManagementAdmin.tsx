import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Key,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Shield,
  Building,
  Briefcase,
  Mail,
  Phone,
  Calendar,
  Lock,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { UserDto, DepartmentDto, DesignationDto, ShiftDto, RoleDto, UserRole } from '../types/leave.ts';
import { getActiveRole, getActiveUserId, getActiveEmployeeId, apiFetch } from '../lib/api.ts';
import { EmployeeAdmin } from './admin/EmployeeAdmin.tsx';
import { DepartmentAdmin } from './admin/DepartmentAdmin.tsx';
import { DesignationAdmin } from './admin/DesignationAdmin.tsx';
import { RoleAdmin } from './admin/RoleAdmin.tsx';
import { WorkingDaysAdmin } from './admin/WorkingDaysAdmin.tsx';
import { MyProfile } from './MyProfile.tsx';
import { Employee360Link } from './Employee360Trigger.tsx';
import { MT_COLOR_CARDS } from '../utils/theme.ts';

export function UserManagementAdmin({
  initialSubTab,
  onSubTabChange,
  onOpenUserProfile,
}: {
  initialSubTab?: 'employees' | 'users' | 'roles' | 'departments' | 'designations' | 'working-days';
  onSubTabChange?: (tab: 'employees' | 'users' | 'roles' | 'departments' | 'designations' | 'working-days') => void;
  onOpenUserProfile?: (target: { userId?: number; employeeId?: number | string; employeeCode?: string }) => void;
} = {}) {
  const [subTab, setSubTab] = useState<'employees' | 'users' | 'roles' | 'departments' | 'designations' | 'working-days'>(
    initialSubTab || 'employees'
  );
  const [inlineProfileTarget, setInlineProfileTarget] = useState<{ userId?: number; employeeId?: number | string; employeeCode?: string } | null>(null);

  const handleOpenProfile = (target: { userId?: number; employeeId?: number | string; employeeCode?: string }) => {
    if (onOpenUserProfile) {
      onOpenUserProfile(target);
    } else {
      setInlineProfileTarget(target);
    }
  };

  const handleSelectSubTab = (tab: 'employees' | 'users' | 'roles' | 'departments' | 'designations' | 'working-days') => {
    setSubTab(tab);
    onSubTabChange?.(tab);
  };

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [rolesList, setRolesList] = useState<RoleDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [designations, setDesignations] = useState<DesignationDto[]>([]);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [isViewProfileOpen, setIsViewProfileOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserDto | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    role: 'EMPLOYEE' as UserRole,
    employeeCode: '',
    departmentId: '',
    designationId: '',
    mobile: '',
    employmentType: 'FULL_TIME',
    initialShiftId: '',
  });

  const [editFormData, setEditFormData] = useState({
    fullName: '',
    email: '',
    role: 'EMPLOYEE' as UserRole,
    departmentId: '',
    designationId: '',
    mobile: '',
    employmentType: 'FULL_TIME',
  });

  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const activeRole = getActiveRole();

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, deptsRes, desigsRes, shiftsRes, rolesRes] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch('/api/departments'),
        apiFetch('/api/designations'),
        apiFetch('/api/shifts'),
        apiFetch('/api/roles').catch(() => null),
      ]);

      if (!usersRes.ok) {
        const errData = await usersRes.json();
        throw new Error(errData.error || 'Failed to load users');
      }

      const usersData = await usersRes.json();
      const deptsData = await deptsRes.json();
      const desigsData = await desigsRes.json();
      const shiftsData = await shiftsRes.json();
      const rolesData = rolesRes && rolesRes.ok ? await rolesRes.json().catch(() => ({})) : {};

      setUsers(usersData.users || []);
      setDepartments(deptsData.departments || []);
      setDesignations(desigsData.designations || []);
      setShifts(shiftsData.shifts || []);
      if (Array.isArray(rolesData.roles) && rolesData.roles.length > 0) {
        setRolesList(rolesData.roles);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while loading data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [subTab]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      const payload: any = {
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password || undefined,
        fullName: formData.fullName.trim() || formData.username.trim(),
        role: formData.role,
        employeeCode: formData.employeeCode.trim() || undefined,
        departmentId: formData.departmentId ? Number(formData.departmentId) : undefined,
        designationId: formData.designationId ? Number(formData.designationId) : undefined,
        mobile: formData.mobile.trim() || undefined,
        employmentType: formData.employmentType,
        initialShiftId: formData.initialShiftId ? Number(formData.initialShiftId) : undefined,
      };

      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      const emailStatus = data.credentialEmail ?? data.user?.credentialEmail;
      if (emailStatus && emailStatus.sent === false) {
        setError(
          `User '${data.user.username}' created, but credential email delivery failed: ${emailStatus.error || 'Email delivery failed.'}`
        );
      } else {
        setSuccessMsg(
          emailStatus?.sent
            ? `User '${data.user.username}' created and login credentials sent to ${emailStatus.recipientEmail}!`
            : `User '${data.user.username}' created successfully!`
        );
      }
      setIsAddModalOpen(false);
      setFormData({
        username: '',
        email: '',
        password: '',
        fullName: '',
        role: 'EMPLOYEE',
        employeeCode: '',
        departmentId: '',
        designationId: '',
        mobile: '',
        employmentType: 'FULL_TIME',
        initialShiftId: '',
      });
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setError(null);
    setSuccessMsg(null);

    try {
      const payload: any = {
        fullName: editFormData.fullName.trim(),
        email: editFormData.email.trim(),
        role: editFormData.role,
        departmentId: editFormData.departmentId ? Number(editFormData.departmentId) : null,
        designationId: editFormData.designationId ? Number(editFormData.designationId) : null,
        mobile: editFormData.mobile.trim() || null,
        employmentType: editFormData.employmentType,
      };

      const res = await apiFetch(`/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      setSuccessMsg(`User '${selectedUser.username}' updated successfully!`);
      setIsEditModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (user: UserDto) => {
    setError(null);
    setSuccessMsg(null);
    const newStatus = !user.isActive;

    try {
      const res = await apiFetch(`/api/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user status');
      }

      setSuccessMsg(`User '${user.username}' has been ${newStatus ? 'activated' : 'deactivated'}.`);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch(`/api/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setSuccessMsg(`Password reset successfully for user '${selectedUser.username}'!`);
      setIsResetPasswordOpen(false);
      setNewPassword('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (user: UserDto) => {
    setError(null);
    setSuccessMsg(null);
    setDeletingUser(true);

    try {
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      setSuccessMsg(data.message || `User '${user.username}' deleted successfully.`);
      setConfirmDeleteUser(null);
      loadData();
    } catch (err: any) {
      setError(err.message);
      setConfirmDeleteUser(null);
    } finally {
      setDeletingUser(false);
    }
  };

  // Filtered list
  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    const matchesSearch =
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.fullName && u.fullName.toLowerCase().includes(q)) ||
      (u.employeeCode && u.employeeCode.toLowerCase().includes(q));

    const matchesRole = roleFilter === 'ALL' || u.roleName === roleFilter;
    const matchesDept = deptFilter === 'ALL' || String(u.departmentId) === deptFilter;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && u.isActive) ||
      (statusFilter === 'INACTIVE' && !u.isActive);

    return matchesSearch && matchesRole && matchesDept && matchesStatus;
  }).sort((a, b) => {
    const aIsAdmin = String(a.roleName || '').toUpperCase() === 'SUPER_ADMIN';
    const bIsAdmin = String(b.roleName || '').toUpperCase() === 'SUPER_ADMIN';
    if (aIsAdmin !== bIsAdmin) return aIsAdmin ? -1 : 1;
    const aCode = String(a.employeeCode || '').toUpperCase().match(/^MT(\d+)$/);
    const bCode = String(b.employeeCode || '').toUpperCase().match(/^MT(\d+)$/);
    if (aCode && bCode) return Number(aCode[1]) - Number(bCode[1]);
    if (aCode) return -1;
    if (bCode) return 1;
    return String(a.fullName || a.username || '').localeCompare(String(b.fullName || b.username || ''));
  });

  return (
    <div className="space-y-6 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* Administration Sub-Navigation Tabs */}
      <div className={`flex items-center gap-1.5 p-1.5 ${MT_COLOR_CARDS.slate} overflow-x-auto no-scrollbar w-full max-w-full min-w-0`}>
        <button
          id="subtab-employees"
          onClick={() => handleSelectSubTab('employees')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            subTab === 'employees' ? 'bg-sky-700 text-white shadow-xs' : 'text-slate-700 hover:bg-white hover:text-sky-900'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Employees</span>
        </button>

        <button
          id="subtab-users"
          onClick={() => handleSelectSubTab('users')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            subTab === 'users' ? 'bg-sky-700 text-white shadow-xs' : 'text-slate-700 hover:bg-white hover:text-sky-900'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>User Accounts</span>
        </button>

        <button
          id="subtab-roles"
          onClick={() => handleSelectSubTab('roles')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            subTab === 'roles' ? 'bg-indigo-700 text-white shadow-xs' : 'text-slate-700 hover:bg-white hover:text-indigo-900'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Role Master (RBAC)</span>
        </button>

        <button
          id="subtab-departments"
          onClick={() => handleSelectSubTab('departments')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            subTab === 'departments' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-700 hover:bg-white hover:text-teal-900'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Departments</span>
        </button>

        <button
          id="subtab-designations"
          onClick={() => handleSelectSubTab('designations')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            subTab === 'designations' ? 'bg-purple-700 text-white shadow-xs' : 'text-slate-700 hover:bg-white hover:text-purple-900'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Designations</span>
        </button>

        <button
          id="subtab-working-days"
          onClick={() => handleSelectSubTab('working-days')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            subTab === 'working-days' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-700 hover:bg-white hover:text-emerald-900'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Working Days & Timing</span>
        </button>
      </div>

      {inlineProfileTarget ? (
        <MyProfile
          currentRole={activeRole}
          currentUserId={getActiveUserId()}
          currentEmployeeId={getActiveEmployeeId()}
          targetUserId={inlineProfileTarget.userId ?? null}
          targetEmployeeId={inlineProfileTarget.employeeCode || inlineProfileTarget.employeeId || null}
          onBack={() => {
            setInlineProfileTarget(null);
            loadData();
          }}
        />
      ) : (
        <>
          {subTab === 'employees' && <EmployeeAdmin onOpenUserProfile={handleOpenProfile} />}
          {subTab === 'roles' && <RoleAdmin />}
          {subTab === 'departments' && <DepartmentAdmin />}
          {subTab === 'designations' && <DesignationAdmin />}
          {subTab === 'working-days' && <WorkingDaysAdmin />}
        </>
      )}

      {!inlineProfileTarget && subTab === 'users' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className={`${MT_COLOR_CARDS.sky} p-6 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
            <div>
              <div className="flex items-center gap-2 text-sky-950 font-bold text-lg">
                <Users className="w-5 h-5 text-sky-700" />
                <span>User & Employee Administration</span>
              </div>
              <p className="text-xs text-slate-700 mt-1">
                Manage user accounts, roles, employee profiles, shift linkage, status controls, and credentials.
              </p>
            </div>

            <button
              id="btn-add-user"
              onClick={() => {
                setError(null);
                setIsAddModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New User</span>
            </button>
          </div>

          {/* Alerts */}
          {error && (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1 font-medium">{successMsg}</div>
            </div>
          )}

      {/* Search & Filter Bar */}
      <div className={`${MT_COLOR_CARDS.slate} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div className="relative w-full sm:flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, username, email, employee code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-700 focus:outline-none focus:border-red-700"
          >
            <option value="ALL">All Roles</option>
            {rolesList.length > 0 ? (
              rolesList.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.displayName && r.displayName !== r.name ? `${r.displayName} (${r.name})` : r.name}
                </option>
              ))
            ) : (
              <>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="TOP_MANAGEMENT">Top Management</option>
                <option value="HR">HR</option>
                <option value="TEAM_LEADER">Team Leader</option>
                <option value="EMPLOYEE">Employee</option>
              </>
            )}
          </select>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-700 focus:outline-none focus:border-red-700"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-700 focus:outline-none focus:border-red-700"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Deactivated</option>
          </select>

          <button
            onClick={loadData}
            className="p-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
            title="Refresh Users"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-neutral-200/80 overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-neutral-500 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Loading user registry...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-xs">
            No users match the selected search criteria or filter.
          </div>
        ) : (
          <>
            {/* Mobile Users Card List (<768px) */}
            <div id="users-mobile-cards" className="md:hidden divide-y divide-neutral-200">
              {filteredUsers.map((user) => (
                <div key={`mobile-user-${user.id}`} className="p-4 space-y-3 bg-white">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {user.profilePhotoUrl ? (
                        <img
                          src={user.profilePhotoUrl}
                          alt={user.fullName || user.username}
                          className="w-10 h-10 rounded-full object-cover border border-neutral-200 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
                          {(user.fullName || user.employeeName || user.username || 'U')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900 text-sm flex items-center gap-1.5 flex-wrap">
                          <Employee360Link
                            userId={user.id}
                            employeeId={user.employeeId ?? undefined}
                            employeeCode={user.employeeCode || undefined}
                            employeeName={user.fullName || user.employeeName || user.username}
                          >
                            {user.fullName || user.employeeName || user.username}
                          </Employee360Link>
                          {user.employeeCode && (
                            <Employee360Link
                              userId={user.id}
                              employeeId={user.employeeId ?? undefined}
                              employeeCode={user.employeeCode}
                              employeeName={user.fullName || user.employeeName || user.username}
                              variant="badge"
                            >
                              {user.employeeCode}
                            </Employee360Link>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5 truncate">
                          @{user.username} &bull; {user.email}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        user.isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                      }`}
                    >
                      {user.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-neutral-50 p-2.5 rounded-xl border border-neutral-100">
                    <div>
                      <span className="text-[10px] text-neutral-500 block uppercase font-bold">Role</span>
                      <span className="font-semibold text-neutral-900">{user.roleName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 block uppercase font-bold">Department</span>
                      <span className="font-semibold text-neutral-900 truncate block">
                        {user.departmentName || 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 block uppercase font-bold">Designation</span>
                      <span className="text-neutral-700 truncate block">
                        {user.designationName || 'None'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 block uppercase font-bold">Shift</span>
                      <span className="text-neutral-700 truncate block">
                        {user.currentShift ? user.currentShift.shiftName : 'Standard (GN)'}
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar for Mobile (Touch-friendly >= 40px) */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Employee360Link
                      userId={user.id}
                      employeeId={user.employeeId ?? undefined}
                      employeeCode={user.employeeCode || undefined}
                      employeeName={user.fullName || user.employeeName || user.username}
                      variant="button"
                      showIcon
                    >
                      360° Profile
                    </Employee360Link>

                    <button
                      type="button"
                      onClick={() =>
                        handleOpenProfile({
                          userId: user.id,
                          employeeId: user.employeeId ?? undefined,
                          employeeCode: user.employeeCode || undefined,
                        })
                      }
                      className="min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Profile</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setEditFormData({
                          fullName: user.fullName || user.employeeName || '',
                          email: user.email || '',
                          role: (user.roleName || user.role || 'EMPLOYEE') as UserRole,
                          departmentId: user.departmentId ? String(user.departmentId) : '',
                          designationId: user.designationId ? String(user.designationId) : '',
                          mobile: user.mobile || '',
                          employmentType: String(user.employmentType || 'FULL_TIME'),
                        });
                        setIsEditModalOpen(true);
                      }}
                      className="min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setNewPassword('');
                        setIsResetPasswordOpen(true);
                      }}
                      className="min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Password</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleStatus(user)}
                      className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                        user.isActive
                          ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      {user.isActive ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Deactivate</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Activate</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (>=768px) */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-700">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Employee / User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Department & Designation</th>
                  <th className="px-4 py-3">Current Shift</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-neutral-50/70 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        {user.profilePhotoUrl ? (
                          <img
                            src={user.profilePhotoUrl}
                            alt={user.fullName || user.username}
                            className="w-8 h-8 rounded-full object-cover border border-neutral-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {(user.fullName || user.employeeName || user.username || 'U')[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-neutral-900 flex items-center gap-2">
                            <Employee360Link
                              userId={user.id}
                              employeeId={user.employeeId ?? undefined}
                              employeeCode={user.employeeCode || undefined}
                              employeeName={user.fullName || user.employeeName || user.username}
                            >
                              {user.fullName || user.employeeName || user.username}
                            </Employee360Link>
                            {user.employeeCode && (
                              <Employee360Link
                                userId={user.id}
                                employeeId={user.employeeId ?? undefined}
                                employeeCode={user.employeeCode}
                                employeeName={user.fullName || user.employeeName || user.username}
                                variant="badge"
                              >
                                {user.employeeCode}
                              </Employee360Link>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-500 flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-neutral-500" />
                              {user.email}
                            </span>
                            <span>•</span>
                            <span className="text-neutral-500">@{user.username}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          user.roleName === 'SUPER_ADMIN'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : user.roleName === 'TOP_MANAGEMENT'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : user.roleName === 'HR'
                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                            : user.roleName === 'TEAM_LEADER'
                            ? 'bg-teal-50 text-teal-700 border border-teal-200'
                            : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                        }`}
                      >
                        <Shield className="w-3 h-3" />
                        {user.roleName}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-medium text-neutral-800">
                        {user.departmentCode && user.departmentName
                          ? `${user.departmentCode} — ${user.departmentName}`
                          : user.departmentName || user.departmentCode || (
                              <span className="text-neutral-500 italic">No department</span>
                            )}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {user.designationName || <span className="text-neutral-500 italic">No designation</span>}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      {user.currentShift ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-neutral-800 text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {user.currentShift.shiftCode}
                          </span>
                          <span className="text-[11px] text-neutral-600 truncate max-w-[120px]">
                            {user.currentShift.shiftName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-neutral-500 italic text-[11px]">Standard Timing (GN)</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          user.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                        }`}
                      >
                        {user.isActive ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-neutral-500" />
                            Deactivated
                          </>
                        )}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <Employee360Link
                          userId={user.id}
                          employeeId={user.employeeId ?? undefined}
                          employeeCode={user.employeeCode || undefined}
                          employeeName={user.fullName || user.employeeName || user.username}
                          variant="button"
                          showIcon
                        >
                          360° Profile
                        </Employee360Link>

                        <button
                          id={`btn-open-user-profile-${user.id}`}
                          onClick={() =>
                            handleOpenProfile({
                              userId: user.id,
                              employeeId: user.employeeId ?? undefined,
                              employeeCode: user.employeeCode || undefined,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                          title="Open Complete Profile & Operate User"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Open Profile</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setIsViewProfileOpen(true);
                          }}
                          className="p-1 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
                          title="Quick Summary"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setEditFormData({
                              fullName: user.fullName || user.employeeName || '',
                              email: user.email || '',
                              role: (user.roleName || user.role || 'EMPLOYEE') as UserRole,
                              departmentId: user.departmentId ? String(user.departmentId) : '',
                              designationId: user.designationId ? String(user.designationId) : '',
                              mobile: user.mobile || '',
                              employmentType: String(user.employmentType || 'FULL_TIME'),
                            });
                            setIsEditModalOpen(true);
                          }}
                          className="p-1 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
                          title="Edit User"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setNewPassword('');
                            setIsResetPasswordOpen(true);
                          }}
                          className="p-1 rounded text-neutral-500 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                          title="Reset Password"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            user.isActive
                              ? 'text-neutral-500 hover:text-rose-600 hover:bg-rose-50'
                              : 'text-neutral-500 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={user.isActive ? 'Deactivate User' : 'Activate User'}
                        >
                          {user.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => setConfirmDeleteUser(user)}
                          className="p-1 rounded text-neutral-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete User"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
      </div>
      )}

      {/* Modal: Add User */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-neutral-700" />
                <span>Create New User & Employee</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5 mt-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="e.g. jdoe"
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Official Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g. jdoe@company.com"
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Full Name</label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Employee Code</label>
                  <input
                    type="text"
                    value={formData.employeeCode}
                    onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    placeholder="e.g. EMP-101"
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Initial Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Default: Welcome@123"
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  >
                    {rolesList.filter((r) => r.isActive !== false).length > 0 ? (
                      rolesList
                        .filter((r) => r.isActive !== false)
                        .map((r) => (
                          <option key={r.name} value={r.name}>
                            {r.displayName && r.displayName !== r.name
                              ? `${r.displayName} (${r.name})`
                              : r.name}
                          </option>
                        ))
                    ) : (
                      <>
                        <option value="EMPLOYEE">Employee</option>
                        <option value="TEAM_LEADER">Team Leader</option>
                        <option value="HR">HR</option>
                        <option value="TOP_MANAGEMENT">Top Management</option>
                        <option value="SUPER_ADMIN">Super Admin</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Department</label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  >
                    <option value="">-- Select Department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Designation</label>
                  <select
                    value={formData.designationId}
                    onChange={(e) => setFormData({ ...formData, designationId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  >
                    <option value="">-- Select Designation --</option>
                    {designations.map((des) => (
                      <option key={des.id} value={des.id}>
                        {des.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Mobile / Phone</label>
                  <input
                    type="text"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Initial Shift</label>
                  <select
                    value={formData.initialShiftId}
                    onChange={(e) => setFormData({ ...formData, initialShiftId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  >
                    <option value="">Default Roster (Company Default)</option>
                    {shifts
                      .filter((s) => s.timingConfigured)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.shiftCode} - {s.shiftName}
                        </option>
                      ))}
                  </select>
                </div>
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
                  type="submit"
                  className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer font-medium"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit User */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-neutral-700" />
                <span>Edit User: @{selectedUser.username}</span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="block text-neutral-700 font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  value={editFormData.fullName}
                  onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Official Email</label>
                <input
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Role</label>
                  <select
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  >
                    {rolesList.filter((r) => r.isActive !== false || r.name === editFormData.role).length > 0 ? (
                      rolesList
                        .filter((r) => r.isActive !== false || r.name === editFormData.role)
                        .map((r) => (
                          <option key={r.name} value={r.name}>
                            {r.displayName && r.displayName !== r.name
                              ? `${r.displayName} (${r.name})`
                              : r.name}
                          </option>
                        ))
                    ) : (
                      <>
                        <option value="EMPLOYEE">Employee</option>
                        <option value="TEAM_LEADER">Team Leader</option>
                        <option value="HR">HR</option>
                        <option value="TOP_MANAGEMENT">Top Management</option>
                        <option value="SUPER_ADMIN">Super Admin</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Department</label>
                  <select
                    value={editFormData.departmentId}
                    onChange={(e) => setEditFormData({ ...editFormData, departmentId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  >
                    <option value="">-- None --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Designation</label>
                  <select
                    value={editFormData.designationId}
                    onChange={(e) => setEditFormData({ ...editFormData, designationId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  >
                    <option value="">-- None --</option>
                    {designations.map((des) => (
                      <option key={des.id} value={des.id}>
                        {des.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Mobile</label>
                  <input
                    type="text"
                    value={editFormData.mobile}
                    onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                  />
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

      {/* Modal: Reset Password */}
      {isResetPasswordOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-600" />
                <span>Reset User Password</span>
              </h3>
              <button
                onClick={() => setIsResetPasswordOpen(false)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-3.5 mt-4 text-xs">
              <p className="text-neutral-600">
                Set a new password for user <strong>@{selectedUser.username}</strong> ({selectedUser.fullName}):
              </p>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  New Password (min 6 chars) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsResetPasswordOpen(false)}
                  className="px-3.5 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 cursor-pointer font-medium"
                >
                  Confirm Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Profile */}
      {isViewProfileOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-neutral-700" />
                <span>Employee Profile</span>
              </h3>
              <button
                onClick={() => setIsViewProfileOpen(false)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 mt-4 text-xs">
              <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center gap-3">
                {selectedUser.profilePhotoUrl ? (
                  <img
                    src={selectedUser.profilePhotoUrl}
                    alt={selectedUser.fullName || selectedUser.username}
                    className="w-10 h-10 rounded-full object-cover border border-neutral-200 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {(selectedUser.fullName || selectedUser.username)[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-bold text-neutral-900 text-sm">
                    {selectedUser.fullName || selectedUser.username}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    @{selectedUser.username} • {selectedUser.employeeCode || 'No code'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded border border-neutral-200/70">
                  <span className="text-neutral-500 block">Role</span>
                  <span className="font-semibold text-neutral-800">{selectedUser.roleName}</span>
                </div>
                <div className="p-2.5 rounded border border-neutral-200/70">
                  <span className="text-neutral-500 block">Account Status</span>
                  <span className={selectedUser.isActive ? 'font-semibold text-emerald-700' : 'font-semibold text-neutral-600'}>
                    {selectedUser.isActive ? 'Active' : 'Deactivated'}
                  </span>
                </div>
                <div className="p-2.5 rounded border border-neutral-200/70">
                  <span className="text-neutral-500 block">Department</span>
                  <span className="font-medium text-neutral-800">{selectedUser.departmentName || '—'}</span>
                </div>
                <div className="p-2.5 rounded border border-neutral-200/70">
                  <span className="text-neutral-500 block">Designation</span>
                  <span className="font-medium text-neutral-800">{selectedUser.designationName || '—'}</span>
                </div>
                <div className="p-2.5 rounded border border-neutral-200/70">
                  <span className="text-neutral-500 block">Official Email</span>
                  <span className="font-medium text-neutral-800 break-all">{selectedUser.email}</span>
                </div>
                <div className="p-2.5 rounded border border-neutral-200/70">
                  <span className="text-neutral-500 block">Current Shift</span>
                  <span className="font-medium text-emerald-800">
                    {selectedUser.currentShift ? selectedUser.currentShift.shiftCode : 'GN (Standard 08:30)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-neutral-100 mt-4">
              <button
                type="button"
                onClick={() => setIsViewProfileOpen(false)}
                className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Delete User</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Are you sure you want to delete user <span className="font-semibold text-neutral-800">'{confirmDeleteUser.username}'</span> ({confirmDeleteUser.fullName})?
                </p>
              </div>
            </div>
            <p className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
              User deletion enforces security checks. Super Admin users cannot be deleted, and operational dependencies are verified.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteUser(null)}
                disabled={deletingUser}
                className="px-3 py-1.5 border border-neutral-200 text-neutral-700 text-xs rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-user"
                onClick={() => handleDeleteUser(confirmDeleteUser)}
                disabled={deletingUser}
                className="px-3.5 py-1.5 bg-rose-600 text-white text-xs rounded-lg hover:bg-rose-700 cursor-pointer font-medium flex items-center gap-1.5"
              >
                {deletingUser ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
