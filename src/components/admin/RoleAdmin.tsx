import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UserCheck,
  Settings,
  Save,
  Plus,
  Edit2,
  Trash2,
  Lock,
  CheckSquare,
  Square,
} from 'lucide-react';
import { RoleDto, UserDto, UserRole } from '../../types/leave.ts';
import { getActiveRole, apiFetch } from '../../lib/api.ts';
import { MT_COLOR_CARDS } from '../../utils/theme.ts';

interface PermissionCatalogItem {
  code: string;
  label: string;
  category: string;
}

const BUILT_IN_ROLE_CODES = new Set([
  'SUPER_ADMIN',
  'TOP_MANAGEMENT',
  'HR',
  'TEAM_LEADER',
  'EMPLOYEE',
]);

function normalizeRoleCodeInput(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}

export function RoleAdmin() {
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<PermissionCatalogItem[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Assign Role Modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [selectedRoleName, setSelectedRoleName] = useState<UserRole>('EMPLOYEE');
  const [assigning, setAssigning] = useState(false);

  // Configure Permissions Modal state
  const [editingRole, setEditingRole] = useState<RoleDto | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [roleDesc, setRoleDesc] = useState<string>('');
  const [savingPerms, setSavingPerms] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<boolean>(false);

  // Create / Edit Role Modal state
  const [roleFormMode, setRoleFormMode] = useState<'create' | 'edit' | null>(null);
  const [roleFormTarget, setRoleFormTarget] = useState<RoleDto | null>(null);
  const [formRoleName, setFormRoleName] = useState<string>('');
  const [formRoleCode, setFormRoleCode] = useState<string>('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState<boolean>(false);
  const [formRoleDesc, setFormRoleDesc] = useState<string>('');
  const [formRoleIsActive, setFormRoleIsActive] = useState<boolean>(true);
  const [formRolePerms, setFormRolePerms] = useState<string[]>([]);
  const [savingRoleForm, setSavingRoleForm] = useState<boolean>(false);
  const [roleFormError, setRoleFormError] = useState<string | null>(null);

  // Delete Role Confirmation Modal state
  const [roleToDelete, setRoleToDelete] = useState<RoleDto | null>(null);
  const [deletingRole, setDeletingRole] = useState<boolean>(false);

  const activeRole = getActiveRole();
  const isSuperAdmin = activeRole === 'SUPER_ADMIN';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, usersRes] = await Promise.all([
        apiFetch('/api/roles'),
        apiFetch('/api/users').catch(() => null),
      ]);

      const rolesData = await rolesRes.json().catch(() => ({}));
      if (!rolesRes.ok) {
        throw new Error(rolesData.error || 'Failed to load roles');
      }

      const rawRoles = Array.isArray(rolesData.roles) ? rolesData.roles : [];
      const normalizedRoles: RoleDto[] = rawRoles.map((r: any, idx: number) => {
        const code = String(r.code || r.name || '').toUpperCase();
        const isSys = Boolean(r.isSystem ?? BUILT_IN_ROLE_CODES.has(code));
        return {
          id: r.id ?? idx + 1,
          name: r.name,
          code: code || r.name,
          displayName: r.displayName || r.name,
          description: r.description || '',
          isActive: isSys ? true : (r.isActive ?? true),
          isSystem: isSys,
          userCount: typeof r.userCount === 'number' ? r.userCount : 0,
          activeUserCount: typeof r.activeUserCount === 'number' ? r.activeUserCount : undefined,
          permissions: Array.isArray(r.permissions) ? r.permissions : [],
        };
      });
      setRoles(normalizedRoles);

      if (Array.isArray(rolesData.availablePermissions)) {
        setAvailablePermissions(rolesData.availablePermissions);
      }

      if (usersRes && usersRes.ok) {
        const usersData = await usersRes.json().catch(() => ({}));
        setUsers(Array.isArray(usersData.users) ? usersData.users : []);
      } else {
        setUsers([]);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load roles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeRole]);

  const validPermissionCodes = new Set(availablePermissions.map((p) => p.code));

  const groupedPermissions = availablePermissions.reduce<Record<string, PermissionCatalogItem[]>>(
    (acc, item) => {
      const cat = item.category || 'General';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    },
    {}
  );

  // ----------------------------------------------------
  // Assign Role to User Handlers
  // ----------------------------------------------------
  const openAssignModal = (preselectedRole?: UserRole) => {
    if (preselectedRole) {
      setSelectedRoleName(preselectedRole);
    } else {
      const firstAssignable = roles.find((r) => r.isActive !== false);
      if (firstAssignable) setSelectedRoleName(firstAssignable.name);
    }
    if (users.length > 0 && selectedUserId === '') {
      setSelectedUserId(users[0].id);
    }
    setError(null);
    setSuccessMsg(null);
    setIsAssignModalOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setAssigning(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch(`/api/users/${selectedUserId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRoleName }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign role');

      const targetUser = users.find((u) => u.id === Number(selectedUserId));
      setSuccessMsg(
        `Role '${selectedRoleName}' successfully assigned to @${targetUser?.username || selectedUserId}!`
      );
      setIsAssignModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  // ----------------------------------------------------
  // Configure Permissions Modal Handlers
  // ----------------------------------------------------
  const openPermissionsModal = (role: RoleDto) => {
    setEditingRole(role);
    setSelectedPerms(Array.isArray(role.permissions) ? [...role.permissions] : []);
    setRoleDesc(role.description || '');
    setConfirmRevoke(false);
    setError(null);
    setSuccessMsg(null);
  };

  const togglePermission = (code: string) => {
    setConfirmRevoke(false);
    setSelectedPerms((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
  };

  const handleSelectAllConfigurePerms = (category?: string) => {
    setConfirmRevoke(false);
    const isSuperAdminTarget = editingRole?.name === 'SUPER_ADMIN';
    const codesToAdd = availablePermissions
      .filter((p) => (!category || p.category === category) && (isSuperAdminTarget || p.code !== 'ALL_PERMISSIONS'))
      .map((p) => p.code);
    setSelectedPerms((prev) => Array.from(new Set([...prev, ...codesToAdd])));
  };

  const handleClearAllConfigurePerms = (category?: string) => {
    setConfirmRevoke(false);
    const isSuperAdminTarget = editingRole?.name === 'SUPER_ADMIN';
    if (!category) {
      setSelectedPerms(isSuperAdminTarget ? ['ALL_PERMISSIONS'] : []);
      return;
    }
    const categoryCodes = new Set(
      availablePermissions.filter((p) => p.category === category).map((p) => p.code)
    );
    setSelectedPerms((prev) =>
      prev.filter(
        (code) =>
          !categoryCodes.has(code) || (isSuperAdminTarget && code === 'ALL_PERMISSIONS')
      )
    );
  };

  const revokedPermissions = editingRole
    ? (editingRole.permissions || []).filter((p) => !selectedPerms.includes(p))
    : [];

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;
    if (revokedPermissions.length > 0 && !confirmRevoke) {
      setConfirmRevoke(true);
      return;
    }
    setSavingPerms(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch(`/api/roles/${editingRole.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: selectedPerms,
          description: roleDesc,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update role permissions');
      }
      setSuccessMsg(
        `Permissions for role '${editingRole.displayName || editingRole.name}' saved (${data.role?.permissions?.length ?? selectedPerms.length} granted).`
      );
      setEditingRole(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingPerms(false);
    }
  };

  // ----------------------------------------------------
  // Create / Edit Role Modal Handlers
  // ----------------------------------------------------
  const openCreateRoleModal = () => {
    setRoleFormMode('create');
    setRoleFormTarget(null);
    setFormRoleName('');
    setFormRoleCode('');
    setCodeManuallyEdited(false);
    setFormRoleDesc('');
    setFormRoleIsActive(true);
    setFormRolePerms([
      'LEAVE_APPLY',
      'LEAVE_VIEW_OWN',
      'PROFILE_VIEW_OWN',
      'PROFILE_EDIT_BASIC',
      'PASSWORD_CHANGE_OWN',
      'SCHEDULE_VIEW_OWN',
    ]);
    setRoleFormError(null);
    setError(null);
    setSuccessMsg(null);
  };

  const openEditRoleModal = (role: RoleDto) => {
    setRoleFormMode('edit');
    setRoleFormTarget(role);
    setFormRoleName(role.displayName || role.name);
    setFormRoleCode(role.code || role.name);
    setCodeManuallyEdited(true);
    setFormRoleDesc(role.description || '');
    setFormRoleIsActive(role.isActive ?? true);
    setFormRolePerms(Array.isArray(role.permissions) ? [...role.permissions] : []);
    setRoleFormError(null);
    setError(null);
    setSuccessMsg(null);
  };

  const closeRoleFormModal = () => {
    setRoleFormMode(null);
    setRoleFormTarget(null);
    setRoleFormError(null);
  };

  const handleRoleNameChange = (val: string) => {
    setFormRoleName(val);
    if (roleFormMode === 'create' && !codeManuallyEdited) {
      setFormRoleCode(normalizeRoleCodeInput(val));
    }
  };

  const handleRoleCodeChange = (val: string) => {
    if (roleFormMode !== 'create') return; // Immutable after creation
    setCodeManuallyEdited(true);
    setFormRoleCode(normalizeRoleCodeInput(val));
  };

  const toggleFormRolePerm = (code: string) => {
    if (roleFormTarget?.name === 'SUPER_ADMIN' && code === 'ALL_PERMISSIONS') return;
    setFormRolePerms((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
  };

  const handleSelectAllFormPerms = (category?: string) => {
    const isSuperAdminTarget = roleFormTarget?.name === 'SUPER_ADMIN';
    const codesToAdd = availablePermissions
      .filter((p) => (!category || p.category === category) && (isSuperAdminTarget || p.code !== 'ALL_PERMISSIONS'))
      .map((p) => p.code);
    setFormRolePerms((prev) => Array.from(new Set([...prev, ...codesToAdd])));
  };

  const handleClearAllFormPerms = (category?: string) => {
    const isSuperAdminTarget = roleFormTarget?.name === 'SUPER_ADMIN';
    if (!category) {
      setFormRolePerms(isSuperAdminTarget ? ['ALL_PERMISSIONS'] : []);
      return;
    }
    const categoryCodes = new Set(
      availablePermissions.filter((p) => p.category === category).map((p) => p.code)
    );
    setFormRolePerms((prev) =>
      prev.filter(
        (code) =>
          !categoryCodes.has(code) || (isSuperAdminTarget && code === 'ALL_PERMISSIONS')
      )
    );
  };

  const handleSaveRoleForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleFormError(null);
    setError(null);
    setSuccessMsg(null);

    const cleanName = formRoleName.trim();
    const cleanCode = normalizeRoleCodeInput(formRoleCode);

    if (!cleanName) {
      setRoleFormError('Role Name is required.');
      return;
    }
    if (!cleanCode || cleanCode.length < 2) {
      setRoleFormError('Role Code / Key is required (minimum 2 characters).');
      return;
    }

    for (const perm of formRolePerms) {
      if (validPermissionCodes.size > 0 && !validPermissionCodes.has(perm)) {
        setRoleFormError(`Invalid permission code selected: '${perm}'`);
        return;
      }
    }

    setSavingRoleForm(true);
    try {
      if (roleFormMode === 'create') {
        const res = await apiFetch('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: cleanCode,
            code: cleanCode,
            displayName: cleanName,
            description: formRoleDesc.trim(),
            isActive: formRoleIsActive,
            permissions: formRolePerms,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Failed to create role');
        }
        setSuccessMsg(
          `Custom role '${data.role?.displayName || cleanName}' (${data.role?.name || cleanCode}) created successfully with ${data.role?.permissions?.length ?? formRolePerms.length} permission(s).`
        );
        closeRoleFormModal();
        await loadData();
      } else if (roleFormMode === 'edit' && roleFormTarget) {
        const isSys = Boolean(roleFormTarget.isSystem || BUILT_IN_ROLE_CODES.has(roleFormTarget.name));
        const payload: Record<string, any> = {
          description: formRoleDesc.trim(),
          permissions: formRolePerms,
        };
        if (!isSys) {
          payload.displayName = cleanName;
          payload.name = cleanName;
          payload.isActive = formRoleIsActive;
        }
        const res = await apiFetch(`/api/roles/${roleFormTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Failed to update role');
        }
        setSuccessMsg(
          `Role '${data.role?.displayName || cleanName}' (${data.role?.name || roleFormTarget.name}) updated successfully.`
        );
        closeRoleFormModal();
        await loadData();
      }
    } catch (err: any) {
      setRoleFormError(err.message || 'Failed to save role.');
    } finally {
      setSavingRoleForm(false);
    }
  };

  // ----------------------------------------------------
  // Delete Role Modal Handlers
  // ----------------------------------------------------
  const openDeleteRoleModal = (role: RoleDto) => {
    setError(null);
    setSuccessMsg(null);
    setRoleToDelete(role);
  };

  const handleConfirmDeleteRole = async () => {
    if (!roleToDelete) return;
    setDeletingRole(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch(`/api/roles/${roleToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete role');
      }
      setSuccessMsg(
        data.message ||
          `Role '${roleToDelete.displayName || roleToDelete.name}' (${roleToDelete.name}) deleted successfully.`
      );
      setRoleToDelete(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Unable to delete role.');
      setRoleToDelete(null);
    } finally {
      setDeletingRole(false);
    }
  };

  return (
    <div id="role-master-root" className="space-y-6 w-full max-w-full min-w-0 overflow-x-hidden">
      <div className={`${MT_COLOR_CARDS.indigo} p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full max-w-full min-w-0`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-start sm:items-center gap-2.5 text-indigo-950 font-bold text-sm sm:text-base min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-300 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-indigo-700" />
            </div>
            <span className="break-words min-w-0">Role-Based Access Control (RBAC) & Role Master</span>
          </div>
          <p className="text-xs text-slate-700 mt-1 break-words">
            System security roles, custom RBAC role definitions, configurable operational permissions, and user role assignments.
          </p>
        </div>

        {isSuperAdmin && (
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full md:w-auto shrink-0">
            <button
              type="button"
              id="btn-create-role"
              onClick={() => openCreateRoleModal()}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-700 text-white rounded-lg text-xs font-semibold hover:bg-indigo-800 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Create New Role</span>
            </button>
            <button
              type="button"
              id="btn-open-assign-role"
              onClick={() => openAssignModal()}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-indigo-300 text-indigo-900 rounded-lg text-xs font-semibold hover:bg-indigo-50 transition-colors shadow-xs cursor-pointer"
            >
              <UserCheck className="w-4 h-4 shrink-0 text-indigo-700" />
              <span>Assign Role to User</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-wrap items-center justify-between gap-2.5 w-full max-w-full min-w-0">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 font-medium break-words min-w-0">{error}</div>
          </div>
          <button
            type="button"
            onClick={() => loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 text-rose-700 rounded-md text-xs font-semibold hover:bg-rose-100 cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5 w-full max-w-full min-w-0">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 font-medium break-words min-w-0">{successMsg}</div>
        </div>
      )}

      <div id="role-cards-grid" className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-full min-w-0">
        {loading ? (
          <div className="col-span-1 md:col-span-2 text-center py-10 text-neutral-500 text-xs">Loading roles...</div>
        ) : roles.length === 0 ? (
          <div className="col-span-1 md:col-span-2 bg-white rounded-xl border border-neutral-200/80 p-8 text-center text-neutral-500 text-xs">
            No roles found.
          </div>
        ) : (
          roles.map((r) => {
            const permissions = Array.isArray(r.permissions) ? r.permissions : [];
            const isActive = r.isActive ?? true;
            const userCount = typeof r.userCount === 'number' ? r.userCount : 0;
            const isSystemRole = Boolean(r.isSystem || BUILT_IN_ROLE_CODES.has(r.name));
            const displayTitle = r.displayName && r.displayName !== r.name ? `${r.displayName} (${r.name})` : r.name;

            const roleCardTone =
              r.name === 'SUPER_ADMIN'
                ? MT_COLOR_CARDS.indigo
                : r.name === 'TOP_MANAGEMENT'
                  ? MT_COLOR_CARDS.amber
                  : r.name === 'HR'
                    ? MT_COLOR_CARDS.purple
                    : r.name === 'TEAM_LEADER'
                      ? MT_COLOR_CARDS.teal
                      : r.name === 'EMPLOYEE'
                        ? MT_COLOR_CARDS.sky
                        : MT_COLOR_CARDS.indigo;

            return (
              <div
                key={r.id || r.name}
                id={`role-card-${r.name}`}
                className={`${roleCardTone} p-4 sm:p-5 space-y-3 flex flex-col justify-between w-full max-w-full min-w-0 overflow-hidden`}
              >
                <div className="space-y-3 w-full max-w-full min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 w-full max-w-full min-w-0">
                    <div className="min-w-0 flex-1 w-full">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                        <span className="font-bold text-neutral-900 text-sm break-words min-w-0">
                          {displayTitle}
                        </span>
                        <span className="px-2 py-0.5 bg-white/90 border border-slate-300 text-slate-800 rounded text-[10px] font-mono break-all max-w-full">
                          Code: {r.code || r.name} • ID: {r.id}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                            isSystemRole
                              ? 'bg-indigo-700 text-white'
                              : 'bg-sky-100 text-sky-900 border border-sky-300'
                          }`}
                        >
                          {isSystemRole ? (
                            <>
                              <Lock className="w-2.5 h-2.5 shrink-0" />
                              <span>System Role</span>
                            </>
                          ) : (
                            <span>Custom Role</span>
                          )}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-stone-200 text-stone-700 border border-stone-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isActive ? 'bg-emerald-600' : 'bg-stone-500'
                            }`}
                          />
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-1.5 break-words leading-relaxed">
                        {r.description}
                      </p>
                    </div>

                    <div className="w-full sm:w-auto sm:max-w-[52%] min-w-0 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-neutral-100 sm:text-right flex flex-col sm:items-end gap-2">
                      <div className="flex items-center justify-between sm:justify-end gap-2 w-full">
                        <div className="text-xs font-semibold text-neutral-900 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                          <span>
                            {userCount} User{userCount === 1 ? '' : 's'}
                          </span>
                        </div>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            disabled={!isActive}
                            onClick={() => openAssignModal(r.name)}
                            className={`sm:hidden text-[11px] font-semibold ${
                              isActive
                                ? 'text-neutral-700 hover:text-neutral-950 hover:underline cursor-pointer'
                                : 'text-neutral-500 cursor-not-allowed'
                            }`}
                          >
                            Assign role to user &rarr;
                          </button>
                        )}
                      </div>
                      {isSuperAdmin && (
                        <div className="flex flex-col sm:items-end gap-1.5 w-full min-w-0">
                          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-1.5 w-full min-w-0">
                            <button
                              type="button"
                              id={`btn-edit-role-${r.name}`}
                              onClick={() => openEditRoleModal(r)}
                              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 sm:py-1 rounded-md text-[11px] font-semibold bg-white border border-neutral-300 text-neutral-800 hover:bg-neutral-50 cursor-pointer max-w-full"
                            >
                              <Edit2 className="w-3 h-3 shrink-0" />
                              <span>Edit Role</span>
                            </button>
                            <button
                              type="button"
                              id={`btn-configure-role-${r.name}`}
                              onClick={() => openPermissionsModal(r)}
                              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 sm:py-1 rounded-md text-[11px] font-semibold bg-indigo-700 text-white hover:bg-indigo-800 cursor-pointer max-w-full"
                            >
                              <Settings className="w-3 h-3 shrink-0" />
                              <span>Configure Permissions</span>
                            </button>
                            <button
                              type="button"
                              id={`btn-delete-role-${r.name}`}
                              onClick={() => openDeleteRoleModal(r)}
                              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 sm:py-1 rounded-md text-[11px] font-semibold bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 cursor-pointer max-w-full"
                              title={
                                userCount > 0
                                  ? `Assigned to ${userCount} user(s) — reassign before deleting`
                                  : isSystemRole
                                    ? 'Delete predefined system role'
                                    : 'Delete custom role'
                              }
                            >
                              <Trash2 className="w-3 h-3 shrink-0" />
                              <span>Delete Role</span>
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={!isActive}
                            onClick={() => openAssignModal(r.name)}
                            className={`hidden sm:inline-block text-[11px] font-semibold ${
                              isActive
                                ? 'text-neutral-700 hover:text-neutral-950 hover:underline cursor-pointer'
                                : 'text-neutral-500 cursor-not-allowed'
                            }`}
                          >
                            Assign role to user &rarr;
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Permissions list */}
                  <div className="pt-3 border-t border-slate-200/80 w-full max-w-full min-w-0">
                    <span className="text-[11px] font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
                      Granted System Permissions ({permissions.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 w-full max-w-full min-w-0">
                      {permissions.length === 0 ? (
                        <span className="text-[11px] text-slate-500 italic">
                          No permissions granted
                        </span>
                      ) : (
                        permissions.map((perm) => (
                          <span
                            key={perm}
                            className="px-2 py-0.5 bg-white/90 border border-slate-300 rounded text-[10px] font-mono font-medium text-slate-800 break-all max-w-full"
                          >
                            {perm}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Create / Edit Role (Super Admin) */}
      {roleFormMode && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl max-w-2xl w-full p-4 sm:p-6 shadow-xl border border-neutral-200 max-h-[92vh] flex flex-col min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-neutral-100 min-w-0">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-neutral-900 text-sm flex items-start sm:items-center gap-2 min-w-0">
                  <Shield className="w-4 h-4 text-neutral-700 shrink-0 mt-0.5 sm:mt-0" />
                  <span className="break-words min-w-0">
                    {roleFormMode === 'create'
                      ? 'Create New Role'
                      : `Edit Role — ${roleFormTarget?.displayName || roleFormTarget?.name}`}
                  </span>
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5 break-words">
                  {roleFormMode === 'create'
                    ? 'Define a new custom RBAC security role and select its allowed module permissions.'
                    : 'Update role metadata, active status, and assigned operational permissions.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRoleFormModal}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer shrink-0 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRoleForm} className="space-y-4 mt-4 text-xs overflow-y-auto pr-1 min-w-0">
              {roleFormError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="font-medium break-words min-w-0">{roleFormError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                <div className="min-w-0">
                  <label className="block text-neutral-700 font-semibold mb-1">
                    Role Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-role-name"
                    type="text"
                    required
                    disabled={
                      roleFormMode === 'edit' &&
                      Boolean(roleFormTarget?.isSystem || BUILT_IN_ROLE_CODES.has(roleFormTarget?.name || ''))
                    }
                    placeholder="e.g., Payroll Reviewer"
                    value={formRoleName}
                    onChange={(e) => handleRoleNameChange(e.target.value)}
                    className="w-full min-w-0 max-w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700 disabled:bg-neutral-100 disabled:text-neutral-500"
                  />
                </div>

                <div className="min-w-0">
                  <label className="block text-neutral-700 font-semibold mb-1">
                    Role Code / Key <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-role-code"
                    type="text"
                    required
                    disabled={roleFormMode === 'edit'}
                    placeholder="e.g., PAYROLL_REVIEWER"
                    value={formRoleCode}
                    onChange={(e) => handleRoleCodeChange(e.target.value)}
                    className="w-full min-w-0 max-w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700 disabled:bg-neutral-100 disabled:text-neutral-500"
                  />
                  <span className="text-[10px] text-neutral-500 mt-0.5 block break-words">
                    {roleFormMode === 'create'
                      ? 'Normalized uppercase identifier (A-Z, 0-9, _). Immutable after creation.'
                      : 'Role code/key is immutable after creation to preserve assignments and audit history.'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-w-0">
                <div className="sm:col-span-2 min-w-0">
                  <label className="block text-neutral-700 font-semibold mb-1">
                    Description
                  </label>
                  <input
                    id="input-role-description"
                    type="text"
                    placeholder="Describe this role's responsibilities and access scope..."
                    value={formRoleDesc}
                    onChange={(e) => setFormRoleDesc(e.target.value)}
                    className="w-full min-w-0 max-w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                  />
                </div>

                <div className="min-w-0">
                  <label className="block text-neutral-700 font-semibold mb-1">
                    Role Status
                  </label>
                  <select
                    id="select-role-status"
                    disabled={
                      roleFormMode === 'edit' &&
                      Boolean(roleFormTarget?.isSystem || BUILT_IN_ROLE_CODES.has(roleFormTarget?.name || ''))
                    }
                    value={formRoleIsActive ? 'ACTIVE' : 'INACTIVE'}
                    onChange={(e) => setFormRoleIsActive(e.target.value === 'ACTIVE')}
                    className="w-full min-w-0 max-w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700 disabled:bg-neutral-100 disabled:text-neutral-500"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 min-w-0">
                  <label className="text-neutral-700 font-semibold break-words">
                    System Permissions ({formRolePerms.length} of {availablePermissions.length} selected)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      id="btn-select-all-perms"
                      onClick={() => handleSelectAllFormPerms()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-[11px] font-semibold cursor-pointer"
                    >
                      <CheckSquare className="w-3 h-3 shrink-0" />
                      <span>Select All</span>
                    </button>
                    <button
                      type="button"
                      id="btn-clear-all-perms"
                      onClick={() => handleClearAllFormPerms()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[11px] font-semibold cursor-pointer"
                    >
                      <Square className="w-3 h-3 shrink-0" />
                      <span>Clear All</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto p-2.5 bg-neutral-50 rounded-lg border border-neutral-200 min-w-0">
                  {Object.entries(groupedPermissions).map(([category, perms]) => {
                    const selectableInCat = perms.filter(
                      (p) => roleFormTarget?.name === 'SUPER_ADMIN' || p.code !== 'ALL_PERMISSIONS'
                    );
                    const selectedInCatCount = perms.filter((p) => formRolePerms.includes(p.code)).length;
                    return (
                      <div key={category} className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-1 px-1 min-w-0">
                          <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider break-words">
                            {category} ({selectedInCatCount}/{perms.length})
                          </span>
                          {selectableInCat.length > 0 && (
                            <div className="flex items-center gap-2 text-[10px] shrink-0">
                              <button
                                type="button"
                                onClick={() => handleSelectAllFormPerms(category)}
                                className="text-neutral-700 hover:text-neutral-950 font-semibold underline cursor-pointer"
                              >
                                Select category
                              </button>
                              <span className="text-neutral-300">|</span>
                              <button
                                type="button"
                                onClick={() => handleClearAllFormPerms(category)}
                                className="text-neutral-500 hover:text-neutral-800 font-semibold underline cursor-pointer"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                          {perms.map((perm) => {
                            const isSuperAdminPerm =
                              perm.code === 'ALL_PERMISSIONS' && roleFormTarget?.name !== 'SUPER_ADMIN';
                            const checked =
                              formRolePerms.includes(perm.code) ||
                              (roleFormTarget?.name === 'SUPER_ADMIN' && perm.code === 'ALL_PERMISSIONS');
                            const disabled =
                              isSuperAdminPerm ||
                              (roleFormTarget?.name === 'SUPER_ADMIN' && perm.code === 'ALL_PERMISSIONS');
                            return (
                              <label
                                key={perm.code}
                                className={`flex items-start gap-2.5 p-2 rounded-md border text-xs transition-colors min-w-0 ${
                                  disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                                } ${
                                  checked
                                    ? 'bg-red-50/60 border-red-700 text-red-800'
                                    : 'bg-white/60 border-neutral-200 text-neutral-600 hover:bg-white'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={() => toggleFormRolePerm(perm.code)}
                                  className="mt-0.5 rounded border-neutral-300 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-mono text-[11px] font-semibold break-all">
                                    {perm.code}
                                  </div>
                                  <div className="text-[11px] text-neutral-500 break-words">{perm.label}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-start gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={closeRoleFormModal}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 bg-slate-600 hover:bg-slate-700 border border-slate-700 rounded-lg text-white font-semibold transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  id="btn-save-role-form"
                  disabled={savingRoleForm}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {savingRoleForm
                      ? 'Saving...'
                      : roleFormMode === 'create'
                      ? 'Create Role and Close'
                      : 'Save and Close'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Role Confirmation (Super Admin) */}
      {roleToDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl max-w-md w-full p-4 sm:p-6 shadow-xl border border-neutral-200 space-y-4 max-h-[92vh] overflow-y-auto min-w-0">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-neutral-100 min-w-0">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-start sm:items-center gap-2 min-w-0">
                <Trash2 className="w-4 h-4 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
                <span className="break-words min-w-0">
                  Delete{' '}
                  {roleToDelete.isSystem || BUILT_IN_ROLE_CODES.has(roleToDelete.name)
                    ? 'Predefined System Role'
                    : 'Custom Role'}{' '}
                  — {roleToDelete.displayName || roleToDelete.name}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setRoleToDelete(null)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer shrink-0 p-1"
              >
                ✕
              </button>
            </div>

            {roleToDelete.userCount > 0 ? (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2 min-w-0">
                <div className="font-semibold flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span className="break-words min-w-0">Role Currently Assigned to Users (Dependency Check)</span>
                </div>
                <p className="break-words">
                  This role is assigned to {roleToDelete.userCount} user
                  {roleToDelete.userCount === 1 ? '' : 's'}. Reassign those users before deleting this role.
                </p>
                {users.filter(
                  (u) =>
                    String(u.role || u.roleName || '').toUpperCase() ===
                      String(roleToDelete.name).toUpperCase() || u.roleId === roleToDelete.id
                ).length > 0 && (
                  <div className="pt-1.5 border-t border-amber-200/70 space-y-1 min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                      Affected Assigned Users:
                    </div>
                    <ul className="list-disc list-inside text-[11px] text-amber-900 space-y-0.5 break-words">
                      {users
                        .filter(
                          (u) =>
                            String(u.role || u.roleName || '').toUpperCase() ===
                              String(roleToDelete.name).toUpperCase() || u.roleId === roleToDelete.id
                        )
                        .map((u) => (
                          <li key={u.id} className="break-words">
                            <span className="font-semibold">{u.fullName || u.username}</span>{' '}
                            (<span className="font-mono">@{u.username}</span>, ID: {u.id})
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-neutral-600 space-y-2 break-words min-w-0">
                <p>
                  Are you sure you want to permanently delete the{' '}
                  {roleToDelete.isSystem || BUILT_IN_ROLE_CODES.has(roleToDelete.name)
                    ? 'predefined system role'
                    : 'custom role'}{' '}
                  <span className="font-bold text-neutral-900">
                    {roleToDelete.displayName || roleToDelete.name}
                  </span>{' '}
                  (<span className="font-mono break-all">Code: {roleToDelete.code || roleToDelete.name} • ID: {roleToDelete.id}</span>)?
                </p>
                <p className="text-neutral-500">
                  Dependency check verified 0 assigned users. This action will remove the role definition from Role Master and record a{' '}
                  <span className="font-mono">ROLE_DELETED</span> audit event.
                </p>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-neutral-100 text-xs">
              <button
                type="button"
                onClick={() => setRoleToDelete(null)}
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 border border-neutral-200 rounded-lg text-neutral-600 hover:bg-neutral-50 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-role"
                disabled={deletingRole}
                onClick={handleConfirmDeleteRole}
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>{deletingRole ? 'Deleting...' : 'Confirm Delete Role'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Configure Role Permissions (Super Admin) */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl max-w-2xl w-full p-4 sm:p-6 shadow-xl border border-neutral-200 max-h-[92vh] flex flex-col min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-neutral-100 min-w-0">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-neutral-900 text-sm flex items-start sm:items-center gap-2 min-w-0">
                  <Settings className="w-4 h-4 text-neutral-700 shrink-0 mt-0.5 sm:mt-0" />
                  <span className="break-words min-w-0">
                    Configure Role Permissions — {editingRole.displayName || editingRole.name}
                  </span>
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5 break-words">
                  Persisted RBAC permissions dynamically enforced across backend APIs and UI views.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRole(null)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer shrink-0 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePermissions} className="space-y-4 mt-4 text-xs overflow-y-auto pr-1 min-w-0">
              <div className="min-w-0">
                <label className="block text-neutral-700 font-semibold mb-1">
                  Role Description
                </label>
                <input
                  type="text"
                  value={roleDesc}
                  onChange={(e) => setRoleDesc(e.target.value)}
                  className="w-full min-w-0 max-w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 min-w-0">
                  <label className="text-neutral-700 font-semibold break-words">
                    Granted Permissions ({selectedPerms.length} selected)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {editingRole.name === 'SUPER_ADMIN' && (
                      <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 break-words max-w-full">
                        SUPER_ADMIN always retains ALL_PERMISSIONS
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSelectAllConfigurePerms()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-[11px] font-semibold cursor-pointer"
                    >
                      <CheckSquare className="w-3 h-3 shrink-0" />
                      <span>Select All</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearAllConfigurePerms()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[11px] font-semibold cursor-pointer"
                    >
                      <Square className="w-3 h-3 shrink-0" />
                      <span>Clear All</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto p-2.5 bg-neutral-50 rounded-lg border border-neutral-200 min-w-0">
                  {Object.entries(groupedPermissions).map(([category, perms]) => (
                    <div key={category} className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-1 px-1 min-w-0">
                        <div className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider break-words">
                          {category}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSelectAllConfigurePerms(category)}
                            className="text-neutral-700 hover:text-neutral-950 font-semibold underline cursor-pointer"
                          >
                            Select category
                          </button>
                          <span className="text-neutral-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleClearAllConfigurePerms(category)}
                            className="text-neutral-500 hover:text-neutral-800 font-semibold underline cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                        {perms.map((perm) => {
                          const checked =
                            selectedPerms.includes(perm.code) ||
                            (editingRole.name === 'SUPER_ADMIN' && perm.code === 'ALL_PERMISSIONS');
                          const disabled =
                            (editingRole.name === 'SUPER_ADMIN' && perm.code === 'ALL_PERMISSIONS') ||
                            (editingRole.name !== 'SUPER_ADMIN' && perm.code === 'ALL_PERMISSIONS');
                          return (
                            <label
                              key={perm.code}
                              className={`flex items-start gap-2.5 p-2 rounded-md border text-xs cursor-pointer transition-colors min-w-0 ${
                                checked
                                  ? 'bg-red-50/60 border-red-700 text-red-800'
                                  : 'bg-white/60 border-neutral-200 text-neutral-600 hover:bg-white'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => togglePermission(perm.code)}
                                className="mt-0.5 rounded border-neutral-300 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-mono text-[11px] font-semibold break-all">
                                  {perm.code}
                                </div>
                                <div className="text-[11px] text-neutral-500 break-words">{perm.label}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {revokedPermissions.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1 min-w-0">
                  <div className="font-semibold flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span className="break-words min-w-0">
                      Restricting Access: {revokedPermissions.length} permission(s) will be removed
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-800 break-words">
                    Revoking: <span className="font-mono font-semibold break-all">{revokedPermissions.join(', ')}</span>.
                    {confirmRevoke
                      ? ' Click "Confirm & Save Permissions" below to apply this restriction.'
                      : ' Saving will ask for confirmation before restricting role access.'}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-start gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRole(null);
                    setConfirmRevoke(false);
                  }}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 bg-slate-600 hover:bg-slate-700 border border-slate-700 rounded-lg text-white font-semibold transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  id="btn-save-role-permissions"
                  disabled={savingPerms}
                  className={`w-full sm:w-auto min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-white rounded-lg font-semibold disabled:opacity-50 cursor-pointer ${
                    confirmRevoke
                      ? 'bg-amber-700 hover:bg-amber-800'
                      : 'bg-red-700 hover:bg-red-800'
                  }`}
                >
                  <Save className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {savingPerms
                      ? 'Saving...'
                      : confirmRevoke
                      ? 'Confirm & Save and Close'
                      : 'Save and Close'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Assign Role to User */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl max-w-md w-full p-4 sm:p-6 shadow-xl border border-neutral-200 max-h-[92vh] overflow-y-auto min-w-0">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-neutral-100 min-w-0">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-start sm:items-center gap-2 min-w-0">
                <UserCheck className="w-4 h-4 text-neutral-700 shrink-0 mt-0.5 sm:mt-0" />
                <span className="break-words min-w-0">Assign Role to User Account</span>
              </h3>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer shrink-0 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="space-y-4 mt-4 text-xs min-w-0">
              <div className="min-w-0">
                <label className="block text-neutral-700 font-medium mb-1">
                  Select User Account <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(Number(e.target.value))}
                  className="w-full min-w-0 max-w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700 bg-white"
                >
                  <option value="" disabled>
                    -- Choose User --
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} (@{u.username}) — Current: {u.role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-0">
                <label className="block text-neutral-700 font-medium mb-1">
                  Target Security Role <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedRoleName}
                  onChange={(e) => setSelectedRoleName(e.target.value as UserRole)}
                  className="w-full min-w-0 max-w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700 bg-white"
                >
                  {roles
                    .filter((r) => r.isActive !== false)
                    .map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.displayName && r.displayName !== r.name
                          ? `${r.displayName} (${r.name})`
                          : r.name}{' '}
                        — {r.description}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 border border-neutral-200 rounded-lg text-neutral-600 hover:bg-neutral-50 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning || !selectedUserId}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 disabled:opacity-50 cursor-pointer"
                >
                  {assigning ? 'Assigning...' : 'Save Role Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
