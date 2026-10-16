import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
  UserCheck,
  Clock,
  Calendar,
  KeyRound,
  Save,
  CheckCircle2,
  AlertCircle,
  Shield,
  CalendarDays,
  ArrowLeft,
  Settings,
  FileText,
  History,
  Lock,
  UserCog,
  RefreshCw,
  Award,
  Activity,
  Ban,
  Play,
  UserX,
  Camera,
  Upload,
  Trash2,
  LogOut,
} from 'lucide-react';
import {
  CompleteUserProfileDto,
  DepartmentDto,
  DesignationDto,
  EmployeeDto,
  HolidayListDto,
  OperationalRole,
  RoleDto,
  ShiftDto,
  UserDto,
  UserRole,
} from '../types/leave.ts';
import {
  getActiveRole,
  getActiveUserId,
  getActiveEmployeeId,
  getAuthHeaders,
  updateActiveUserPhoto,
} from '../lib/api.ts';
import { formatDate } from '../utils/dateFormat.ts';
import {
  MT_COLOR_CARDS,
  getStatusBadgeClasses,
  getStatusCardClasses,
  getLeaveTypeBadgeClasses,
  getLeaveTypeCardClasses,
} from '../utils/theme.ts';
import {
  AuditEventDetailsView,
  formatAuditDateTime,
} from './SystemAuditAdmin.tsx';

interface MyProfileProps {
  currentRole?: UserRole;
  currentUserId?: number;
  currentEmployeeId?: number;
  targetUserId?: number | string | null;
  targetEmployeeId?: number | string | null;
  viewAsEmployee?: boolean;
  onBack?: () => void;
  onRequestLogout?: () => void;
}

export const MyProfile: React.FC<MyProfileProps> = ({
  currentRole: propRole,
  currentUserId: propUserId,
  currentEmployeeId: propEmployeeId,
  targetUserId,
  targetEmployeeId,
  viewAsEmployee = false,
  onBack,
  onRequestLogout,
}) => {
  const currentRole = propRole || getActiveRole();
  const currentUserId = propUserId || getActiveUserId();
  const currentEmployeeId = viewAsEmployee && targetEmployeeId != null
    ? Number(targetEmployeeId)
    : propEmployeeId || getActiveEmployeeId();
  const isSuperAdmin = currentRole === 'SUPER_ADMIN' && !viewAsEmployee;

  // Active target identifier (defaults to prop or logged-in user)
  const [selectedUserId, setSelectedUserId] = useState<number | string | null>(targetUserId ?? null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | string | null>(targetEmployeeId ?? null);
  const [timelineCategoryFilter, setTimelineCategoryFilter] = useState<string>('ALL');
  const [timelineSearch, setTimelineSearch] = useState<string>('');

  useEffect(() => {
    setSelectedUserId(targetUserId ?? null);
    setSelectedEmployeeId(targetEmployeeId ?? null);
  }, [targetUserId, targetEmployeeId]);

  const [completeProfile, setCompleteProfile] = useState<CompleteUserProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Master data for SUPER_ADMIN operations
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [designations, setDesignations] = useState<DesignationDto[]>([]);
  const [allEmployees, setAllEmployees] = useState<EmployeeDto[]>([]);
  const [allUsers, setAllUsers] = useState<UserDto[]>([]);
  const [allRoles, setAllRoles] = useState<RoleDto[]>([]);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [holidayLists, setHolidayLists] = useState<HolidayListDto[]>([]);

  // Active profile section tab
  const [activeTab, setActiveTab] = useState<
    'overview' | 'admin_edit' | 'schedule_holiday' | 'leave_context' | 'security_status' | 'audit_trail'
  >('overview');

  // Basic + Admin Profile Edit Form State
  const [editForm, setEditForm] = useState({
    fullName: '',
    username: '',
    email: '',
    employeeCode: '',
    mobile: '',
    departmentId: '' as string | number,
    designationId: '' as string | number,
    reportingManagerId: '' as string | number,
    role: 'EMPLOYEE' as UserRole,
    operationalRole: 'EMPLOYEE' as OperationalRole | '',
    employmentType: 'FULL_TIME',
    employmentStatus: 'ACTIVE',
    joiningDate: '',
    officeLocation: '',
    remarks: '',
    hrApprovalRequired: true,
    isActive: true,
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Effective-dated Shift Assignment Form State (for SUPER_ADMIN)
  const [shiftForm, setShiftForm] = useState({
    shiftId: '' as string | number,
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: '',
    assignmentReason: 'ADMIN_CORRECTION',
    remarks: '',
  });
  const [savingShift, setSavingShift] = useState(false);

  // Effective-dated Holiday List Assignment Form State (for SUPER_ADMIN)
  const [holidayForm, setHolidayForm] = useState({
    holidayListId: '' as string | number,
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: '',
    remarks: '',
  });
  const [savingHoliday, setSavingHoliday] = useState(false);

  // Self Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // SUPER_ADMIN Password Reset State
  const [adminResetPasswordVal, setAdminResetPasswordVal] = useState('');
  const [adminConfirmPasswordVal, setAdminConfirmPasswordVal] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // User Profile Photo Upload / Preview State
  const [pendingPhoto, setPendingPhoto] = useState<{
    fileName: string;
    mimeType: string;
    fileData: string;
    sizeBytes: number;
  } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      // Always include the server-issued session token. This profile-specific fetch
      // wrapper previously sent only role/identity headers, which production correctly
      // rejects as unauthenticated.
      const headers = new Headers(getAuthHeaders());
      new Headers(options.headers || {}).forEach((value, key) => headers.set(key, value));
      headers.set('Content-Type', 'application/json');
      headers.set('x-user-role', currentRole);
      headers.set('x-user-id', String(currentUserId));
      headers.set('x-employee-id', String(currentEmployeeId));
      return fetch(url, { ...options, headers });
    },
    [currentRole, currentUserId, currentEmployeeId]
  );

  const populateFormFromProfile = (profileData: CompleteUserProfileDto) => {
    const u = profileData.user;
    const emp = profileData.employee;
    setEditForm({
      fullName: emp?.employeeName || u.fullName || u.employeeName || u.username || '',
      username: u.username || '',
      email: emp?.officialEmail || u.email || '',
      employeeCode: emp?.employeeCode || u.employeeCode || '',
      mobile: emp?.mobile || u.mobile || '',
      departmentId: emp?.departmentId ?? u.departmentId ?? '',
      designationId: emp?.designationId ?? u.designationId ?? '',
      reportingManagerId: emp?.reportingManagerId ?? u.reportingManagerId ?? '',
      role: (u.roleName || u.role || 'EMPLOYEE') as UserRole,
      operationalRole: (u.operationalRole || emp?.operationalRole || '') as OperationalRole | '',
      employmentType: emp?.employmentType || u.employmentType || 'FULL_TIME',
      employmentStatus: emp?.employmentStatus || u.employmentStatus || (u.isActive ? 'ACTIVE' : 'INACTIVE'),
      joiningDate: emp?.joiningDate || u.joiningDate || u.employee?.joiningDate || '',
      officeLocation: emp?.officeLocation || u.officeLocation || '',
      remarks: emp?.remarks || u.remarks || '',
      hrApprovalRequired: emp?.hrApprovalRequired !== undefined ? Boolean(emp.hrApprovalRequired) : (u.hrApprovalRequired !== undefined ? Boolean(u.hrApprovalRequired) : true),
      isActive: u.isActive,
    });

    if (profileData.currentShiftAssignment?.shiftId) {
      setShiftForm((prev) => ({
        ...prev,
        shiftId: profileData.currentShiftAssignment!.shiftId,
      }));
    } else if (u.currentShift?.id) {
      setShiftForm((prev) => ({
        ...prev,
        shiftId: u.currentShift!.id,
      }));
    }

    if (profileData.effectiveHolidayCalendar?.holidayList?.id) {
      setHolidayForm((prev) => ({
        ...prev,
        holidayListId: profileData.effectiveHolidayCalendar.holidayList!.id,
      }));
    }
  };

  const fetchProfileData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const effectiveUserId = selectedUserId;
      const effectiveEmpId = selectedEmployeeId;

      let profileRes: Response;
      if (effectiveUserId) {
        profileRes = await apiFetch(`/api/users/${encodeURIComponent(String(effectiveUserId))}/complete-profile`);
      } else if (effectiveEmpId) {
        profileRes = await apiFetch(`/api/employees/${encodeURIComponent(String(effectiveEmpId))}/complete-profile`);
      } else {
        profileRes = await apiFetch(`/api/users/${currentUserId}/complete-profile`);
      }

      const data = await profileRes.json();
      if (!profileRes.ok) {
        throw new Error(data.error || 'Failed to load user profile');
      }

      const loadedProfile: CompleteUserProfileDto = data.profile;
      setCompleteProfile(loadedProfile);
      populateFormFromProfile(loadedProfile);

      // If SUPER_ADMIN, load master dropdowns for operating user profile
      if (isSuperAdmin) {
        const [deptRes, desigRes, empRes, usersRes, shiftRes, holRes, rolesRes] = await Promise.all([
          apiFetch('/api/departments'),
          apiFetch('/api/designations'),
          apiFetch('/api/employees'),
          apiFetch('/api/users'),
          apiFetch('/api/shifts'),
          apiFetch('/api/holiday-lists'),
          apiFetch('/api/roles').catch(() => null),
        ]);
        if (deptRes.ok) {
          const d = await deptRes.json();
          setDepartments(d.departments || []);
        }
        if (desigRes.ok) {
          const d = await desigRes.json();
          setDesignations(d.designations || []);
        }
        if (empRes.ok) {
          const d = await empRes.json();
          setAllEmployees(d.employees || []);
        }
        if (usersRes.ok) {
          const d = await usersRes.json();
          setAllUsers(d.users || []);
        }
        if (shiftRes.ok) {
          const d = await shiftRes.json();
          setShifts(d.shifts || []);
        }
        if (holRes.ok) {
          const d = await holRes.json();
          setHolidayLists(d.holidayLists || []);
        }
        if (rolesRes && rolesRes.ok) {
          const d = await rolesRes.json().catch(() => ({}));
          if (Array.isArray(d.roles)) {
            setAllRoles(d.roles);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, selectedUserId, selectedEmployeeId, currentUserId, isSuperAdmin]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  const profile = completeProfile?.user || null;
  const employee = completeProfile?.employee || null;
  const isViewingOtherUser =
    profile !== null &&
    (profile.id !== currentUserId || (profile.employeeId !== null && profile.employeeId !== currentEmployeeId));
  const canManageProfilePhoto =
    profile !== null && (isSuperAdmin || profile.id === currentUserId);

  const handleSelectProfilePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccessMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setError('Unsupported image format. Please select a JPEG, PNG, or WEBP image.');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo size exceeds the 5.0 MB maximum limit.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingPhoto({
          fileName: file.name,
          mimeType: file.type,
          fileData: reader.result,
          sizeBytes: file.size,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadProfilePhoto = async () => {
    if (!profile || !pendingPhoto || !canManageProfilePhoto) return;
    setUploadingPhoto(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch(`/api/users/${profile.id}/profile-photo`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: pendingPhoto.fileName,
          mimeType: pendingPhoto.mimeType,
          fileData: pendingPhoto.fileData,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload profile photo');
      }
      setPendingPhoto(null);
      if (profile.id === currentUserId) {
        updateActiveUserPhoto(data.profilePhotoUrl || null);
      }
      window.dispatchEvent(
        new CustomEvent('maestro-profile-photo-updated', {
          detail: { userId: profile.id, profilePhotoUrl: data.profilePhotoUrl || null },
        })
      );
      setSuccessMsg(
        isViewingOtherUser
          ? `Profile photo updated for ${profile.fullName} and recorded in audit trail.`
          : 'Your profile photo has been uploaded and saved.'
      );
      await fetchProfileData();
    } catch (err: any) {
      setError(err.message || 'Failed to upload profile photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemoveProfilePhoto = async () => {
    if (!profile || !canManageProfilePhoto) return;
    setUploadingPhoto(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch(`/api/users/${profile.id}/profile-photo`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove profile photo');
      }
      setPendingPhoto(null);
      if (profile.id === currentUserId) {
        updateActiveUserPhoto(null);
      }
      window.dispatchEvent(
        new CustomEvent('maestro-profile-photo-updated', {
          detail: { userId: profile.id, profilePhotoUrl: null },
        })
      );
      setSuccessMsg(
        isViewingOtherUser
          ? `Profile photo removed for ${profile.fullName} and default avatar restored.`
          : 'Your profile photo has been removed and default avatar restored.'
      );
      await fetchProfileData();
    } catch (err: any) {
      setError(err.message || 'Failed to remove profile photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Save Profile (Basic Self-Update for normal user OR Full Administrative Update for SUPER_ADMIN)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (isSuperAdmin) {
        const operateEndpoint =
          completeProfile?.linkedAccountStatus === 'STANDALONE_EMPLOYEE' || !profile.id
            ? `/api/employees/${encodeURIComponent(String(completeProfile?.employeeCode || employee?.id || profile.employeeId))}/complete-profile`
            : `/api/users/${profile.id}/complete-profile`;
        const res = await apiFetch(operateEndpoint, {
          method: 'PUT',
          body: JSON.stringify({
            fullName: editForm.fullName.trim(),
            employeeName: editForm.fullName.trim(),
            username: editForm.username.trim(),
            email: editForm.email.trim(),
            officialEmail: editForm.email.trim(),
            employeeCode: editForm.employeeCode.trim(),
            mobile: editForm.mobile.trim() || null,
            departmentId: editForm.departmentId ? Number(editForm.departmentId) : null,
            designationId: editForm.designationId ? Number(editForm.designationId) : null,
            reportingManagerId: editForm.reportingManagerId ? Number(editForm.reportingManagerId) : null,
            role: editForm.role,
            operationalRole: editForm.operationalRole ? (editForm.operationalRole as OperationalRole) : null,
            employmentType: editForm.employmentType,
            employmentStatus: editForm.employmentStatus,
            joiningDate: editForm.joiningDate || null,
            officeLocation: editForm.officeLocation.trim() || null,
            remarks: editForm.remarks.trim() || null,
            hrApprovalRequired: editForm.hrApprovalRequired,
            isActive: editForm.isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update user profile');
        setCompleteProfile(data.profile);
        populateFormFromProfile(data.profile);
        setSuccessMsg(`Profile and administrative settings for ${data.profile.user.fullName} updated and audited.`);
      } else {
        const targetEmpId = profile.employee?.id || profile.employeeId || currentEmployeeId;
        const res = await apiFetch(`/api/employees/${targetEmpId}`, {
          method: 'PUT',
          body: JSON.stringify({
            employeeName: editForm.fullName.trim(),
            mobile: editForm.mobile.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update profile');
        setSuccessMsg('Personal contact details updated successfully.');
        await fetchProfileData();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // Assign Shift (Effective-Dated, Preserving History)
  const handleAssignShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!shiftForm.shiftId) {
      setError('Please select a shift to assign.');
      return;
    }
    setSavingShift(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const operateEndpoint =
        completeProfile?.linkedAccountStatus === 'STANDALONE_EMPLOYEE' || !profile.id
          ? `/api/employees/${encodeURIComponent(String(completeProfile?.employeeCode || employee?.id || profile.employeeId))}/complete-profile`
          : `/api/users/${profile.id}/complete-profile`;
      const res = await apiFetch(operateEndpoint, {
        method: 'PUT',
        body: JSON.stringify({
          shiftAssignment: {
            shiftId: Number(shiftForm.shiftId),
            effectiveFrom: shiftForm.effectiveFrom || new Date().toISOString().split('T')[0],
            effectiveTo: shiftForm.effectiveTo || null,
            assignmentReason: shiftForm.assignmentReason || 'ADMIN_CORRECTION',
            remarks: shiftForm.remarks.trim() || 'Assigned by SUPER_ADMIN from User Profile',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign shift');
      setCompleteProfile(data.profile);
      populateFormFromProfile(data.profile);
      setSuccessMsg('Effective-dated shift assignment saved and audited.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingShift(false);
    }
  };

  // Assign Holiday List (Effective-Dated, Preserving History)
  const handleAssignHolidayList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!holidayForm.holidayListId) {
      setError('Please select a holiday list to assign.');
      return;
    }
    setSavingHoliday(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const operateEndpoint =
        completeProfile?.linkedAccountStatus === 'STANDALONE_EMPLOYEE' || !profile.id
          ? `/api/employees/${encodeURIComponent(String(completeProfile?.employeeCode || employee?.id || profile.employeeId))}/complete-profile`
          : `/api/users/${profile.id}/complete-profile`;
      const res = await apiFetch(operateEndpoint, {
        method: 'PUT',
        body: JSON.stringify({
          holidayAssignment: {
            holidayListId: Number(holidayForm.holidayListId),
            effectiveFrom: holidayForm.effectiveFrom || new Date().toISOString().split('T')[0],
            effectiveTo: holidayForm.effectiveTo || null,
            remarks: holidayForm.remarks.trim() || 'Assigned by SUPER_ADMIN from User Profile',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign holiday list');
      setCompleteProfile(data.profile);
      populateFormFromProfile(data.profile);
      setSuccessMsg('Effective-dated holiday calendar assignment saved and audited.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingHoliday(false);
    }
  };

  // Quick Employment Status / Account Action for SUPER_ADMIN
  const handleQuickEmploymentStatus = async (
    targetStatus: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | 'INACTIVE',
    targetActive: boolean
  ) => {
    if (!profile) return;
    setSavingProfile(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const operateEndpoint =
        completeProfile?.linkedAccountStatus === 'STANDALONE_EMPLOYEE' || !profile.id
          ? `/api/employees/${encodeURIComponent(String(completeProfile?.employeeCode || employee?.id || profile.employeeId))}/complete-profile`
          : `/api/users/${profile.id}/complete-profile`;
      const res = await apiFetch(operateEndpoint, {
        method: 'PUT',
        body: JSON.stringify({
          employmentStatus: targetStatus,
          isActive: targetActive,
          reason: `SUPER_ADMIN set employment status to ${targetStatus}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update employment status');
      setCompleteProfile(data.profile);
      populateFormFromProfile(data.profile);
      setSuccessMsg(`User employment status changed to ${targetStatus} and audited.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // Self Password Change
  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setSuccessMsg(null);

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await apiFetch(`/api/users/${profile.id}/change-password`, {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      setSuccessMsg('Your password has been changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setChangingPassword(false);
    }
  };

  // SUPER_ADMIN Secure Password Reset (Never exposes old password)
  const handleSuperAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setSuccessMsg(null);

    if (adminResetPasswordVal !== adminConfirmPasswordVal) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (adminResetPasswordVal.length < 6) {
      setError('Reset password must be at least 6 characters.');
      return;
    }

    setResettingPassword(true);
    try {
      const res = await apiFetch(`/api/users/${profile.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: adminResetPasswordVal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset user password');
      setAdminResetPasswordVal('');
      setAdminConfirmPasswordVal('');
      setSuccessMsg(`Password securely reset for ${profile.username}. Action logged in audit trail.`);
      await fetchProfileData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResettingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-neutral-500 text-sm">
        Loading complete user profile...
      </div>
    );
  }

  if (!profile || !completeProfile) {
    return (
      <div className="space-y-4">
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 px-3 py-1.5 rounded-lg shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Management List
          </button>
        )}
        <div className="p-8 text-center text-rose-600 text-sm bg-rose-50 border border-rose-200 rounded-xl">
          {error || 'Unable to load user profile.'}
        </div>
      </div>
    );
  }

  const currentShift = completeProfile.currentShiftAssignment?.shift || profile.currentShift;
  const effectiveHolidayList = completeProfile.effectiveHolidayCalendar?.holidayList;
  const holidaySource = completeProfile.effectiveHolidayCalendar?.source || 'NONE';

  return (
    <div id="my-profile-root" className="space-y-5 sm:space-y-6 max-w-6xl w-full max-w-full min-w-0 overflow-x-hidden">
      {/* Top Navigation & SUPER_ADMIN User Switcher Bar */}
      {(onBack || isSuperAdmin) && (
        <div
          id="super-admin-profile-console"
          className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-neutral-900 border-l-4 border-l-red-600 text-white p-3.5 sm:px-4 sm:py-3 rounded-xl shadow-sm w-full max-w-full min-w-0 overflow-hidden"
        >
          <div className="flex flex-wrap items-center gap-2.5 min-w-0 w-full md:w-auto">
            {onBack && (
              <button
                onClick={onBack}
                className="min-h-[44px] sm:min-h-0 inline-flex items-center gap-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-100 px-3 py-2 sm:py-1.5 rounded-lg border border-neutral-700 transition-colors shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                <span>Back</span>
              </button>
            )}
            <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
              <Shield className="w-4 h-4 text-red-400 shrink-0 mt-0.5 sm:mt-0" />
              <span className="text-xs font-semibold tracking-wide uppercase text-red-300 break-words min-w-0 leading-snug">
                {isViewingOtherUser
                  ? `SUPER_ADMIN Profile Access & Operate Mode — Managing ${profile.fullName}`
                  : isSuperAdmin
                    ? 'SUPER_ADMIN Profile Console'
                    : 'Employee Profile'}
              </span>
            </div>
          </div>

          {isSuperAdmin && allUsers.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full md:w-auto min-w-0 pt-2.5 md:pt-0 border-t border-neutral-800 md:border-t-0">
              <label
                htmlFor="select-inspect-operate-user"
                className="text-[11px] sm:text-xs text-neutral-300 font-semibold sm:font-medium shrink-0"
              >
                Inspect / Operate User:
              </label>
              <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
                <select
                  id="select-inspect-operate-user"
                  value={profile.id}
                  onChange={(e) => {
                    const nextId = Number(e.target.value);
                    setSelectedUserId(nextId);
                    setSelectedEmployeeId(null);
                    setSuccessMsg(null);
                    setError(null);
                  }}
                  className="flex-1 min-w-0 w-full sm:w-auto sm:max-w-[260px] lg:max-w-[320px] max-w-full truncate bg-neutral-800 text-white text-xs border border-neutral-700 rounded-lg px-2.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.employeeCode || u.username}) — {u.roleName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => fetchProfileData()}
                  className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1.5 shrink-0 inline-flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg border border-neutral-700 cursor-pointer"
                  title="Refresh Profile"
                >
                  <RefreshCw className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button onClick={() => setError(null)} className="text-rose-500 font-bold">
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {successMsg}
          </span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Profile Header Banner with Complete Identity Attributes — Neutral Slate Container with Semantic Inner Cards */}
      <div className={`${MT_COLOR_CARDS.slate} p-4 sm:p-6 w-full max-w-full min-w-0 overflow-hidden`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200 min-w-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 min-w-0 w-full lg:w-auto">
            {/* Avatar / Profile Photo with Upload, Preview, Replace & Remove Controls */}
            <div className="flex flex-row sm:flex-col items-center gap-3 sm:gap-2 shrink-0 w-full sm:w-auto">
              <div className="relative group shrink-0">
                {pendingPhoto ? (
                  <img
                    id="profile-photo-preview"
                    src={pendingPhoto.fileData}
                    alt={`${profile.fullName} Preview`}
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-red-600 shadow-sm"
                  />
                ) : profile.profilePhotoUrl ? (
                  <img
                    id="profile-photo-image"
                    src={profile.profilePhotoUrl}
                    alt={profile.fullName || profile.username}
                    className="w-20 h-20 rounded-2xl object-cover border border-neutral-200 shadow-sm"
                  />
                ) : (
                  <div
                    id="profile-photo-default-avatar"
                    className="w-20 h-20 rounded-2xl bg-red-700 text-white flex items-center justify-center font-bold text-2xl shadow-sm"
                  >
                    {(profile.fullName || profile.username || 'U').charAt(0).toUpperCase()}
                  </div>
                )}

                {canManageProfilePhoto && (
                  <label
                    htmlFor={`input-profile-photo-${profile.id}`}
                    className="absolute -bottom-1.5 -right-1.5 p-2 sm:p-1.5 rounded-full bg-red-700 text-white hover:bg-red-800 shadow-md cursor-pointer transition-colors"
                    title={profile.hasProfilePhoto ? 'Replace Profile Photo' : 'Upload Profile Photo'}
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </label>
                )}
                {canManageProfilePhoto && (
                  <input
                    id={`input-profile-photo-${profile.id}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleSelectProfilePhoto}
                    className="hidden"
                  />
                )}
              </div>

              {canManageProfilePhoto && (
                <div className="flex flex-wrap items-center justify-start sm:justify-center gap-1.5 min-w-0">
                  <label
                    htmlFor={`input-profile-photo-${profile.id}`}
                    className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:px-2 sm:py-1 rounded-xl sm:rounded-md text-xs sm:text-[10px] font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 border border-neutral-200 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0" />
                    <span>{profile.hasProfilePhoto ? 'Replace Photo' : 'Upload Photo'}</span>
                  </label>

                  {pendingPhoto && (
                    <button
                      id="btn-save-profile-photo"
                      type="button"
                      disabled={uploadingPhoto}
                      onClick={handleUploadProfilePhoto}
                      className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:px-2 sm:py-1 rounded-xl sm:rounded-md text-xs sm:text-[10px] font-semibold bg-red-700 text-white hover:bg-red-800 disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0" />
                      <span>{uploadingPhoto ? 'Saving...' : 'Save Photo'}</span>
                    </button>
                  )}

                  {pendingPhoto && (
                    <button
                      type="button"
                      disabled={uploadingPhoto}
                      onClick={() => setPendingPhoto(null)}
                      className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1 px-3 py-2 sm:px-2 sm:py-1 rounded-xl sm:rounded-md text-xs sm:text-[10px] font-semibold bg-neutral-100 text-neutral-600 hover:bg-neutral-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}

                  {profile.hasProfilePhoto && !pendingPhoto && (
                    <button
                      id="btn-remove-profile-photo"
                      type="button"
                      disabled={uploadingPhoto}
                      onClick={handleRemoveProfilePhoto}
                      className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:px-2 sm:py-1 rounded-xl sm:rounded-md text-xs sm:text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                      title="Remove Photo & Restore Default Avatar"
                    >
                      <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 w-full">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-neutral-900 break-words min-w-0">{profile.fullName}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-neutral-100 text-neutral-800 border border-neutral-200 break-all">
                  {employee?.employeeCode || profile.employeeCode || 'NO-CODE'}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold break-words ${
                    profile.roleName === 'SUPER_ADMIN'
                      ? 'bg-purple-100 text-purple-800'
                      : profile.roleName === 'TOP_MANAGEMENT'
                        ? 'bg-amber-100 text-amber-800'
                        : profile.roleName === 'HR'
                          ? 'bg-emerald-100 text-emerald-800'
                          : profile.roleName === 'TEAM_LEADER'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-neutral-100 text-neutral-700'
                  }`}
                >
                  Role: {profile.roleName.replace(/_/g, ' ')}
                </span>
                {profile.operationalRole && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 break-words">
                    Operational: {profile.operationalRole.replace(/_/g, ' ')}
                  </span>
                )}
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    profile.isActive &&
                    profile.employmentStatus !== 'SUSPENDED' &&
                    profile.employmentStatus !== 'TERMINATED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {employee?.employmentStatus || profile.employmentStatus || (profile.isActive ? 'ACTIVE' : 'INACTIVE')}
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-2 sm:mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0 break-words">
                <span className="min-w-0">
                  <strong className="text-neutral-700">Employee ID:</strong> {completeProfile.employeeCode || employee?.employeeCode || profile.employeeCode || 'N/A'}
                </span>
                <span className="min-w-0 break-all sm:break-normal">
                  <strong className="text-neutral-700">Username:</strong> @{profile.username}
                </span>
                <span className="min-w-0 break-all sm:break-normal">
                  <strong className="text-neutral-700">Email:</strong> {profile.email}
                </span>
                <span className="min-w-0">
                  <strong className="text-neutral-700">Mobile:</strong> {profile.mobile || 'Not provided'}
                </span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto min-w-0">
            {isSuperAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('admin_edit')}
                  className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl sm:rounded-lg text-xs font-semibold bg-red-700 text-white hover:bg-red-800 transition-colors shadow-sm cursor-pointer min-w-0"
                >
                  <UserCog className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Edit Profile & Assignments</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('schedule_holiday')}
                  className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl sm:rounded-lg text-xs font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer min-w-0"
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Shift & Holiday</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('security_status')}
                  className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl sm:rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer min-w-0"
                >
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Password & Status</span>
                </button>
              </>
            )}

            {!isViewingOtherUser && (
              <button
                id="btn-profile-logout"
                type="button"
                onClick={() => {
                  if (onRequestLogout) {
                    onRequestLogout();
                  } else {
                    window.dispatchEvent(new CustomEvent('maestro-request-logout'));
                  }
                }}
                className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl sm:rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer min-w-0"
                title="Sign out of your account"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Logout</span>
              </button>
            )}
          </div>
        </div>

        {/* Key Identity Summary Grid (All Required Profile Fields with Distinct Semantic Coloured Cards + 5px Top Strips) */}
        <div className="grid grid-cols-1 min-[375px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 pt-4 min-w-0">
          <div className={`${MT_COLOR_CARDS.sky} p-2.5 sm:p-3 min-w-0 overflow-hidden`}>
            <div className="text-[11px] font-bold text-sky-900 uppercase break-words">Business Employee ID</div>
            <div className="text-xs font-mono font-bold text-neutral-900 mt-0.5 break-words">
              {completeProfile.employeeCode || employee?.employeeCode || profile.employeeCode || '—'}
            </div>
          </div>
          <div className={`${MT_COLOR_CARDS.indigo} p-2.5 sm:p-3 min-w-0 overflow-hidden`}>
            <div className="text-[11px] font-bold text-indigo-900 uppercase break-words">Department (Code & Name)</div>
            <div className="text-xs font-semibold text-neutral-900 mt-0.5 break-words">
              {completeProfile.departmentCode || employee?.departmentCode || profile.departmentCode ? (
                <span className="font-mono font-bold text-indigo-800 mr-1">
                  [{completeProfile.departmentCode || employee?.departmentCode || profile.departmentCode}]
                </span>
              ) : null}
              {profile.departmentName || employee?.departmentName || 'Unassigned'}
            </div>
          </div>
          <div className={`${MT_COLOR_CARDS.teal} p-2.5 sm:p-3 min-w-0 overflow-hidden`}>
            <div className="text-[11px] font-bold text-teal-900 uppercase break-words">Designation</div>
            <div className="text-xs font-semibold text-neutral-900 mt-0.5 break-words">
              {profile.designationName || employee?.designationName || 'Unassigned'}
            </div>
          </div>
          <div className={`${MT_COLOR_CARDS.cyan} p-2.5 sm:p-3 min-w-0 overflow-hidden`}>
            <div className="text-[11px] font-bold text-cyan-900 uppercase break-words">Reporting / Team Leader</div>
            <div className="text-xs font-semibold text-neutral-900 mt-0.5 break-words">
              {completeProfile.teamLeadershipSummary?.currentTeamLeader
                ? `${completeProfile.teamLeadershipSummary.currentTeamLeader.teamLeaderName} (${completeProfile.teamLeadershipSummary.currentTeamLeader.teamLeaderEmployeeCode || 'TL'})`
                : profile.reportingManagerName || employee?.reportingManagerName || 'Direct / Top Management'}
            </div>
          </div>
          <div className={`${MT_COLOR_CARDS.emerald} p-2.5 sm:p-3 min-w-0 overflow-hidden`}>
            <div className="text-[11px] font-bold text-emerald-900 uppercase break-words">Joining Date</div>
            <div className="text-xs font-semibold text-neutral-900 mt-0.5 break-words">
              {employee?.joiningDate || profile.joiningDate || profile.employee?.joiningDate
                ? formatDate(employee?.joiningDate || profile.joiningDate || profile.employee?.joiningDate)
                : 'Not set'}
            </div>
          </div>
          <div className={`${MT_COLOR_CARDS.purple} p-2.5 sm:p-3 min-w-0 overflow-hidden`}>
            <div className="text-[11px] font-bold text-purple-900 uppercase break-words">System Role (RBAC)</div>
            <div className="text-xs font-semibold text-neutral-900 mt-0.5 break-words">
              {profile.roleName.replace(/_/g, ' ')}
            </div>
          </div>
          <div className={`${MT_COLOR_CARDS.amber} p-2.5 sm:p-3 min-w-0 overflow-hidden`}>
            <div className="text-[11px] font-bold text-amber-900 uppercase break-words">Operational Role</div>
            <div className="text-xs font-semibold text-neutral-900 mt-0.5 break-words">
              {(profile.operationalRole || employee?.operationalRole || 'Standard').replace(/_/g, ' ')}
            </div>
          </div>
          <div id="card-hr-workflow-status" className={`${(employee?.hrApprovalRequired ?? profile.hrApprovalRequired ?? true) ? MT_COLOR_CARDS.purple : MT_COLOR_CARDS.amber} p-2.5 sm:p-3 min-w-0 overflow-hidden`}>
            <div className="text-[11px] font-bold uppercase break-words text-neutral-900 flex items-center justify-between gap-1">
              <span>HR Approval Required</span>
            </div>
            <div className="text-xs font-bold text-neutral-900 mt-0.5 break-words flex items-center gap-1.5">
              <span>{(employee?.hrApprovalRequired ?? profile.hrApprovalRequired ?? true) ? 'ON (3-Stage Workflow)' : 'OFF (2-Stage Workflow)'}</span>
            </div>
            <div className="text-[10px] text-neutral-600 mt-0.5">
              {(employee?.hrApprovalRequired ?? profile.hrApprovalRequired ?? true)
                ? 'Applicant → Team Leader → HR → Top Management'
                : 'Applicant → Team Leader → Top Management (HR Bypassed)'}
            </div>
          </div>
          <div className={`${profile.isActive ? MT_COLOR_CARDS.emerald : MT_COLOR_CARDS.rose} p-2.5 sm:p-3 min-w-0 overflow-hidden`}>
            <div className={`text-[11px] font-bold uppercase break-words ${profile.isActive ? 'text-emerald-900' : 'text-rose-900'}`}>Employment Status</div>
            <div className="text-xs font-semibold text-neutral-900 mt-0.5 break-words">
              {employee?.employmentStatus || profile.employmentStatus} ({profile.isActive ? 'Active' : 'Inactive'})
            </div>
          </div>
          <div className={`${MT_COLOR_CARDS.sky} p-2.5 sm:p-3 min-w-0 overflow-hidden`}>
            <div className="text-[11px] font-bold text-sky-900 uppercase break-words">Current Shift</div>
            <div className="text-xs font-semibold text-sky-950 mt-0.5 break-words">
              {currentShift ? `${currentShift.shiftCode} (${currentShift.shiftName})` : 'Standard General'}
            </div>
          </div>
          <div className={`${MT_COLOR_CARDS.emerald} p-2.5 sm:p-3 min-w-0 overflow-hidden`}>
            <div className="text-[11px] font-bold text-emerald-900 uppercase break-words">Holiday List</div>
            <div className="text-xs font-semibold text-emerald-950 mt-0.5 break-words">
              {effectiveHolidayList
                ? `${effectiveHolidayList.listName || effectiveHolidayList.name} (${holidaySource})`
                : 'Default Calendar'}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        id="profile-navigation-tabs"
        className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 border-b border-neutral-200 pb-3 w-full max-w-full min-w-0"
      >
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`min-w-0 w-full sm:w-auto inline-flex items-center justify-start sm:justify-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 min-h-[44px] rounded-xl text-[11px] sm:text-xs font-bold leading-tight text-left sm:text-center transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-red-700 text-white shadow-sm'
              : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <User className="w-4 h-4 shrink-0" />
          <span className="break-words min-w-0">Profile Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('admin_edit')}
          className={`min-w-0 w-full sm:w-auto inline-flex items-center justify-start sm:justify-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 min-h-[44px] rounded-xl text-[11px] sm:text-xs font-bold leading-tight text-left sm:text-center transition-colors cursor-pointer ${
            activeTab === 'admin_edit'
              ? 'bg-red-700 text-white shadow-sm'
              : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span className="break-words min-w-0">{isSuperAdmin ? 'Edit Profile & Org' : 'Edit Contact Info'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('schedule_holiday')}
          className={`min-w-0 w-full sm:w-auto inline-flex items-center justify-start sm:justify-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 min-h-[44px] rounded-xl text-[11px] sm:text-xs font-bold leading-tight text-left sm:text-center transition-colors cursor-pointer ${
            activeTab === 'schedule_holiday'
              ? 'bg-red-700 text-white shadow-sm'
              : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span className="break-words min-w-0">Shift & Holidays</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('leave_context')}
          className={`min-w-0 w-full sm:w-auto inline-flex items-center justify-start sm:justify-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 min-h-[44px] rounded-xl text-[11px] sm:text-xs font-bold leading-tight text-left sm:text-center transition-colors cursor-pointer ${
            activeTab === 'leave_context'
              ? 'bg-red-700 text-white shadow-sm'
              : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span className="break-words min-w-0">Leave & Balances ({completeProfile.leaveRequests.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security_status')}
          className={`min-w-0 w-full sm:w-auto inline-flex items-center justify-start sm:justify-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 min-h-[44px] rounded-xl text-[11px] sm:text-xs font-bold leading-tight text-left sm:text-center transition-colors cursor-pointer ${
            activeTab === 'security_status'
              ? 'bg-red-700 text-white shadow-sm'
              : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Lock className="w-4 h-4 shrink-0" />
          <span className="break-words min-w-0">{isSuperAdmin ? 'Password & Status' : 'Password & Security'}</span>
        </button>

        {isSuperAdmin && (
        <button
          type="button"
          onClick={() => setActiveTab('audit_trail')}
          className={`min-w-0 w-full sm:w-auto inline-flex items-center justify-start sm:justify-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 min-h-[44px] rounded-xl text-[11px] sm:text-xs font-bold leading-tight text-left sm:text-center transition-colors cursor-pointer ${
            activeTab === 'audit_trail'
              ? 'bg-red-700 text-white shadow-sm'
              : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <History className="w-4 h-4 shrink-0" />
          <span className="break-words min-w-0">
            360° Activity ({(completeProfile.unifiedTimeline || completeProfile.auditLogs).length})
          </span>
        </button>
        )}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 min-w-0">
          {/* Organizational & Reporting Details */}
          <div className={`${MT_COLOR_CARDS.indigo} p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden`}>
            <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2 border-b border-indigo-200 pb-3 min-w-0">
              <Building2 className="w-4 h-4 text-indigo-700 shrink-0" />
              <span className="break-words min-w-0">Organizational & Role Assignment</span>
            </h3>
            <div className="space-y-2.5 text-xs min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-neutral-100 min-w-0">
                <span className="text-neutral-500">Employee ID</span>
                <span className="font-mono font-semibold text-neutral-800 break-words text-right">
                  {completeProfile.employeeCode || employee?.employeeCode || profile.employeeCode || 'N/A'}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-neutral-100 min-w-0">
                <span className="text-neutral-500">Department</span>
                <span className="font-semibold text-neutral-800 break-words text-right">
                  {profile.departmentName || 'Unassigned'}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-neutral-100 min-w-0">
                <span className="text-neutral-500">Designation</span>
                <span className="font-semibold text-neutral-800 break-words text-right">
                  {profile.designationName || 'Unassigned'}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-neutral-100 min-w-0">
                <span className="text-neutral-500">Reporting Person</span>
                <span className="font-semibold text-neutral-800 flex items-center gap-1 break-words text-right">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{profile.reportingManagerName || 'Direct / Top Management'}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-neutral-100 min-w-0">
                <span className="text-neutral-500">RBAC System Role</span>
                <span className="font-semibold text-red-700 break-words text-right">{profile.roleName}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-neutral-100 min-w-0">
                <span className="text-neutral-500">Operational Approval Role</span>
                <span className="font-semibold text-neutral-800 break-words text-right">
                  {profile.operationalRole || employee?.operationalRole || 'EMPLOYEE'}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-neutral-100 min-w-0">
                <span className="text-neutral-500">Employment Type / Status</span>
                <span className="font-semibold text-neutral-800 break-words text-right">
                  {profile.employmentType || 'FULL_TIME'} • {profile.employmentStatus}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 min-w-0">
                <span className="text-neutral-500">Date of Joining</span>
                <span className="font-semibold text-neutral-800 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  {employee?.joiningDate || profile.joiningDate
                    ? formatDate(employee?.joiningDate || profile.joiningDate)
                    : 'Not set'}
                </span>
              </div>
            </div>
          </div>

          {/* Effective Shift, Weekly Off & Holiday Summary */}
          <div className={`${MT_COLOR_CARDS.sky} p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden`}>
            <h3 className="text-sm font-bold text-sky-950 flex items-center gap-2 border-b border-sky-200 pb-3 min-w-0">
              <Clock className="w-4 h-4 text-sky-700 shrink-0" />
              <span className="break-words min-w-0">Effective Shift, Schedule & Holiday Summary</span>
            </h3>

            {currentShift ? (
              <div className="space-y-3 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-white/90 p-3 rounded-lg border border-sky-200 min-w-0">
                  <div className="min-w-0">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300">
                      {currentShift.shiftCode}
                    </span>
                    <p className="text-sm font-bold text-neutral-900 mt-1 break-words">{currentShift.shiftName}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-[11px] font-medium text-slate-600">Total Working Hours</span>
                    <p className="text-sm font-bold text-sky-900">
                      {currentShift.totalWorkingHours ?? currentShift.totalScheduledHours ?? 9} hrs/day
                    </p>
                    {currentShift.breakMinutes !== undefined && (
                      <span className="text-[10px] font-medium text-slate-600 block">
                        Break: {currentShift.breakMinutes} mins
                      </span>
                    )}
                  </div>
                </div>

                {currentShift.segments && currentShift.segments.length > 0 && (
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-xs font-semibold text-neutral-600">Configured Shift Timing:</p>
                    {currentShift.segments.map((seg, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap justify-between items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded text-xs border border-neutral-200 min-w-0"
                      >
                        <span className="text-neutral-600 font-medium">Segment {seg.segmentSequence ?? i + 1}</span>
                        <span className="font-mono font-semibold text-neutral-800">
                          {seg.startTime} – {seg.endTime}
                          {seg.crossesMidnight && (
                            <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                              Next Day
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs text-neutral-500">
                No explicit employee shift override assigned. Following department/default schedule.
              </div>
            )}

            <div className="pt-2 border-t border-neutral-100 space-y-2 text-xs min-w-0">
              <div className="flex flex-wrap justify-between items-center gap-2 min-w-0">
                <span className="text-neutral-500 flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Effective Holiday List:
                </span>
                <span className="font-semibold text-neutral-800 break-words text-right">
                  {effectiveHolidayList
                    ? `${effectiveHolidayList.listName || effectiveHolidayList.name} (${holidaySource})`
                    : 'Unassigned'}
                </span>
              </div>
              <div className="flex flex-wrap justify-between items-center gap-2 min-w-0">
                <span className="text-neutral-500">Weekly Off Days:</span>
                <span className="font-semibold text-neutral-800 break-words text-right">
                  {completeProfile.weeklyOffConfig
                    ? `${completeProfile.weeklyOffConfig.weeklyOffDays.join(', ')} (${completeProfile.weeklyOffConfig.source})`
                    : 'SUNDAY (DEFAULT)'}
                </span>
              </div>
              <div className="flex flex-wrap justify-between items-center gap-2 min-w-0">
                <span className="text-neutral-500">Overtime Rules Configured:</span>
                <span className="font-semibold text-neutral-800">
                  {completeProfile.overtimeAssignments.length} rule(s)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EDIT PROFILE & ORGANIZATION (Full controls for SUPER_ADMIN, Basic contact for self) */}
      {activeTab === 'admin_edit' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 shadow-sm min-w-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-4 mb-5 min-w-0">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-neutral-800 flex items-start sm:items-center gap-2 min-w-0">
                <UserCog className="w-4 h-4 text-red-700 shrink-0 mt-0.5 sm:mt-0" />
                <span className="break-words min-w-0">
                  {isSuperAdmin
                    ? `SUPER_ADMIN Profile & Organizational Management — ${profile.fullName}`
                    : 'Edit Personal Contact Information'}
                </span>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5 break-words">
                {isSuperAdmin
                  ? 'All changes made by SUPER_ADMIN are immediately applied and recorded in the system audit trail with before/after values.'
                  : 'Normal employees can update their display name and mobile number.'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-5 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
              <div className="min-w-0">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                />
              </div>

              <div className="min-w-0">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Mobile Number</label>
                <input
                  type="text"
                  value={editForm.mobile}
                  onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                />
              </div>

              <div className="min-w-0">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Username</label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className={`w-full max-w-full min-w-0 px-3 py-2 text-xs border rounded-lg ${
                    isSuperAdmin
                      ? 'border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-500 cursor-not-allowed'
                  }`}
                />
              </div>

              <div className="min-w-0">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Official Email</label>
                <input
                  type="email"
                  disabled={!isSuperAdmin}
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className={`w-full max-w-full min-w-0 px-3 py-2 text-xs border rounded-lg ${
                    isSuperAdmin
                      ? 'border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-500 cursor-not-allowed'
                  }`}
                />
              </div>

              <div className="min-w-0">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Employee Code</label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={editForm.employeeCode}
                  onChange={(e) => setEditForm({ ...editForm, employeeCode: e.target.value })}
                  className={`w-full max-w-full min-w-0 px-3 py-2 text-xs border rounded-lg font-mono ${
                    isSuperAdmin
                      ? 'border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-500 cursor-not-allowed'
                  }`}
                />
              </div>

              <div className="min-w-0">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Joining Date</label>
                <input
                  type="date"
                  disabled={!isSuperAdmin}
                  value={editForm.joiningDate}
                  onChange={(e) => setEditForm({ ...editForm, joiningDate: e.target.value })}
                  className={`w-full max-w-full min-w-0 px-3 py-2 text-xs border rounded-lg ${
                    isSuperAdmin
                      ? 'border-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-500 cursor-not-allowed'
                  }`}
                />
              </div>

              {isSuperAdmin && (
                <>
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Department</label>
                    <select
                      value={editForm.departmentId}
                      onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })}
                      className="w-full max-w-full min-w-0 truncate px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    >
                      <option value="">— Unassigned —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Designation</label>
                    <select
                      value={editForm.designationId}
                      onChange={(e) => setEditForm({ ...editForm, designationId: e.target.value })}
                      className="w-full max-w-full min-w-0 truncate px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    >
                      <option value="">— Unassigned —</option>
                      {designations.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Reporting Person</label>
                    <select
                      value={editForm.reportingManagerId}
                      onChange={(e) => setEditForm({ ...editForm, reportingManagerId: e.target.value })}
                      className="w-full max-w-full min-w-0 truncate px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    >
                      <option value="">— Direct / Top Management —</option>
                      {allEmployees
                        .filter((emp) => emp.id !== profile.employeeId)
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.employeeName} ({emp.employeeCode}) — {emp.role}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      RBAC Administrative Role
                    </label>
                    <select
                      value={editForm.role}
                      onChange={(e) => {
                        const nextRole = e.target.value as UserRole;
                        const isStd = ['EMPLOYEE', 'TEAM_LEADER', 'HR', 'TOP_MANAGEMENT'].includes(nextRole);
                        setEditForm({
                          ...editForm,
                          role: nextRole,
                          operationalRole: isStd
                            ? (nextRole as OperationalRole)
                            : editForm.operationalRole || 'EMPLOYEE',
                        });
                      }}
                      className="w-full max-w-full min-w-0 truncate px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    >
                      {allRoles.filter((r) => r.isActive !== false || r.name === editForm.role).length > 0 ? (
                        allRoles
                          .filter((r) => r.isActive !== false || r.name === editForm.role)
                          .map((r) => (
                            <option key={r.name} value={r.name}>
                              {r.displayName && r.displayName !== r.name
                                ? `${r.displayName} (${r.name})`
                                : r.name}
                            </option>
                          ))
                      ) : (
                        <>
                          <option value="EMPLOYEE">EMPLOYEE</option>
                          <option value="TEAM_LEADER">TEAM_LEADER</option>
                          <option value="HR">HR</option>
                          <option value="TOP_MANAGEMENT">TOP_MANAGEMENT</option>
                          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Operational Approval Role
                    </label>
                    <select
                      value={editForm.operationalRole}
                      onChange={(e) =>
                        setEditForm({ ...editForm, operationalRole: e.target.value as OperationalRole | '' })
                      }
                      className="w-full max-w-full min-w-0 truncate px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    >
                      <option value="EMPLOYEE">EMPLOYEE</option>
                      <option value="TEAM_LEADER">TEAM_LEADER</option>
                      <option value="HR">HR</option>
                      <option value="TOP_MANAGEMENT">TOP_MANAGEMENT</option>
                    </select>
                    <p className="text-[10px] text-neutral-500 mt-0.5 break-words">
                      Preserves distinct operational leave approval stage routing.
                    </p>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Employment Status</label>
                    <select
                      value={editForm.employmentStatus}
                      onChange={(e) => {
                        const st = e.target.value;
                        const activeStates = ['ACTIVE', 'PROBATION', 'ON_LEAVE'];
                        setEditForm({
                          ...editForm,
                          employmentStatus: st,
                          isActive: activeStates.includes(st),
                        });
                      }}
                      className="w-full max-w-full min-w-0 truncate px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="PROBATION">PROBATION</option>
                      <option value="ON_LEAVE">ON_LEAVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="RESIGNED">RESIGNED</option>
                      <option value="TERMINATED">TERMINATED</option>
                      <option value="INACTIVE">INACTIVE</option>
                      <option value="DEACTIVATED">DEACTIVATED</option>
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Employment Type</label>
                    <select
                      value={editForm.employmentType}
                      onChange={(e) => setEditForm({ ...editForm, employmentType: e.target.value })}
                      className="w-full max-w-full min-w-0 truncate px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    >
                      <option value="FULL_TIME">FULL_TIME</option>
                      <option value="PART_TIME">PART_TIME</option>
                      <option value="CONTRACT">CONTRACT</option>
                      <option value="INTERN">INTERN</option>
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Office Location</label>
                    <input
                      type="text"
                      value={editForm.officeLocation}
                      onChange={(e) => setEditForm({ ...editForm, officeLocation: e.target.value })}
                      placeholder="e.g. Head Office / CFS Terminal"
                      className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    />
                  </div>

                  {/* HR Approval Workflow Setting */}
                  <div className="sm:col-span-2 p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-purple-700" />
                        <span>HR Approval Required</span>
                      </label>
                      <span className={"text-[10px] font-bold px-2.5 py-0.5 rounded-full " + (
                        editForm.hrApprovalRequired ? "bg-purple-700 text-white" : "bg-amber-500 text-white"
                      )}>
                        {editForm.hrApprovalRequired ? "ON (3-Stage Workflow)" : "OFF (2-Stage Workflow)"}
                      </span>
                    </div>
                    <select
                      id="select-profile-hr-approval-required"
                      value={editForm.hrApprovalRequired ? 'true' : 'false'}
                      onChange={(e) =>
                        setEditForm({ ...editForm, hrApprovalRequired: e.target.value === 'true' })
                      }
                      className="w-full px-3 py-2 text-xs font-bold text-neutral-900 bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-700 shadow-2xs"
                    >
                      <option value="true">ON — 3-Stage Routing (Team Leader → HR Review → Top Management Final)</option>
                      <option value="false">OFF — 2-Stage Routing (Team Leader → Top Management Final, Bypassing HR)</option>
                    </select>
                    <p className="text-[11px] text-purple-800/80 leading-relaxed">
                      {editForm.hrApprovalRequired
                        ? "Active: Requests submitted by this employee follow the standard 3-stage process through Team Leader, HR recommendation, and Top Management."
                        : "Active: Requests submitted by this employee bypass the HR stage entirely upon Team Leader approval and route directly to Top Management for final decision."}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Audit Reason / Administrative Remarks
                    </label>
                    <input
                      type="text"
                      value={editForm.remarks}
                      onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                      placeholder="Reason for profile/assignment change"
                      className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 justify-center inline-flex items-center gap-1.5 px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-xl sm:rounded-lg transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {savingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: SHIFT, SCHEDULE & HOLIDAYS */}
      {activeTab === 'schedule_holiday' && (
        <div className="space-y-6 min-w-0">
          {isSuperAdmin && profile.employeeId && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 min-w-0">
              {/* Assign Shift Card */}
              <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 shadow-sm min-w-0 overflow-hidden">
                <h3 className="text-sm font-bold text-neutral-800 flex items-center gap-2 border-b border-neutral-100 pb-3 mb-4">
                  <Clock className="w-4 h-4 text-red-700 shrink-0" />
                  <span className="break-words min-w-0">Assign Effective-Dated Shift</span>
                </h3>
                <form onSubmit={handleAssignShift} className="space-y-3 min-w-0">
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Select Configured Shift *</label>
                    <select
                      required
                      value={shiftForm.shiftId}
                      onChange={(e) => setShiftForm({ ...shiftForm, shiftId: e.target.value })}
                      className="w-full max-w-full min-w-0 truncate px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    >
                      <option value="">— Select Shift —</option>
                      {shifts
                        .filter((s) => s.isActive && s.timingConfigured)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.shiftCode} — {s.shiftName} ({s.totalWorkingHours ?? s.totalScheduledHours ?? 9} hrs/day)
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">Effective From *</label>
                      <input
                        type="date"
                        required
                        value={shiftForm.effectiveFrom}
                        onChange={(e) => setShiftForm({ ...shiftForm, effectiveFrom: e.target.value })}
                        className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">Effective To (Optional)</label>
                      <input
                        type="date"
                        value={shiftForm.effectiveTo}
                        onChange={(e) => setShiftForm({ ...shiftForm, effectiveTo: e.target.value })}
                        className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Assignment Remarks</label>
                    <input
                      type="text"
                      value={shiftForm.remarks}
                      onChange={(e) => setShiftForm({ ...shiftForm, remarks: e.target.value })}
                      placeholder="e.g. Shift rotation / operational requirement"
                      className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingShift}
                    className="w-full min-h-[44px] sm:min-h-0 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-xl sm:rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {savingShift ? 'Assigning Shift...' : 'Assign Shift (Preserves History)'}
                  </button>
                </form>
              </div>

              {/* Assign Holiday List Card */}
              <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 shadow-sm min-w-0 overflow-hidden">
                <h3 className="text-sm font-bold text-neutral-800 flex items-center gap-2 border-b border-neutral-100 pb-3 mb-4">
                  <CalendarDays className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="break-words min-w-0">Assign Effective-Dated Holiday Calendar</span>
                </h3>
                <form onSubmit={handleAssignHolidayList} className="space-y-3 min-w-0">
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Select Holiday List *</label>
                    <select
                      required
                      value={holidayForm.holidayListId}
                      onChange={(e) => setHolidayForm({ ...holidayForm, holidayListId: e.target.value })}
                      className="w-full max-w-full min-w-0 truncate px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700"
                    >
                      <option value="">— Select Holiday List —</option>
                      {holidayLists
                        .filter((h) => h.isActive)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.listName || h.name} ({h.listCode || h.code}) — {h.year}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">Effective From *</label>
                      <input
                        type="date"
                        required
                        value={holidayForm.effectiveFrom}
                        onChange={(e) => setHolidayForm({ ...holidayForm, effectiveFrom: e.target.value })}
                        className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">Effective To (Optional)</label>
                      <input
                        type="date"
                        value={holidayForm.effectiveTo}
                        onChange={(e) => setHolidayForm({ ...holidayForm, effectiveTo: e.target.value })}
                        className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Assignment Remarks</label>
                    <input
                      type="text"
                      value={holidayForm.remarks}
                      onChange={(e) => setHolidayForm({ ...holidayForm, remarks: e.target.value })}
                      placeholder="e.g. Department holiday list override"
                      className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingHoliday}
                    className="w-full min-h-[44px] sm:min-h-0 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl sm:rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {savingHoliday ? 'Assigning Holiday List...' : 'Assign Holiday Calendar (Preserves History)'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Shift Assignment History & Holiday Calendar Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 min-w-0">
            <div className={`${MT_COLOR_CARDS.sky} p-4 sm:p-5 min-w-0 overflow-hidden`}>
              <h3 className="text-sm font-bold text-sky-950 mb-3 break-words">Shift Assignment History</h3>
              {completeProfile.shiftHistory.length === 0 ? (
                <p className="text-xs text-slate-600">No shift assignment records found.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto min-w-0">
                  {completeProfile.shiftHistory.map((sh) => (
                    <div
                      key={sh.id}
                      className="p-3 rounded-lg bg-white/90 border border-sky-200 flex flex-wrap items-center justify-between gap-2 text-xs min-w-0"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300">
                          {sh.shiftCode || sh.shift?.shiftCode}
                        </span>{' '}
                        <span className="font-semibold text-neutral-900 break-words">
                          {sh.shiftName || sh.shift?.shiftName}
                        </span>
                        <div className="text-[11px] text-slate-600 mt-0.5 break-words">
                          Effective: {formatDate(sh.effectiveFrom)} → {sh.effectiveTo ? formatDate(sh.effectiveTo) : 'Present'}
                        </div>
                        {sh.remarks && <div className="text-[11px] text-slate-600 break-words">{sh.remarks}</div>}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                          sh.isActive ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {sh.isActive ? 'Active' : 'Historical'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`${MT_COLOR_CARDS.emerald} p-4 sm:p-5 min-w-0 overflow-hidden`}>
              <h3 className="text-sm font-bold text-emerald-950 mb-3 break-words">
                Effective Holiday Calendar ({effectiveHolidayList?.listName || effectiveHolidayList?.name || 'None'})
              </h3>
              {effectiveHolidayList?.holidays && effectiveHolidayList.holidays.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto min-w-0">
                  {effectiveHolidayList.holidays.map((h) => (
                    <div
                      key={h.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/90 border border-emerald-200 text-xs min-w-0"
                    >
                      <span className="font-semibold text-neutral-900 break-words min-w-0">{h.holidayName}</span>
                      <span className="font-mono font-bold text-emerald-900 shrink-0">{formatDate(h.holidayDate)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600">No holidays listed in the active calendar.</p>
              )}
            </div>
          </div>

          {/* Overtime Records & Team Leadership Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 min-w-0">
            <div className={`${MT_COLOR_CARDS.purple} p-4 sm:p-5 min-w-0 overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 min-w-0">
                <h3 className="text-sm font-bold text-purple-950 break-words">
                  Overtime History ({completeProfile.overtimeRecords?.length || 0})
                </h3>
                {completeProfile.overtimeSummary && (
                  <span className="text-[11px] font-mono font-semibold text-purple-900 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded break-words">
                    Approved: {completeProfile.overtimeSummary.approvedHours}h / Requested:{' '}
                    {completeProfile.overtimeSummary.totalRequestedHours}h
                  </span>
                )}
              </div>
              {!completeProfile.overtimeRecords || completeProfile.overtimeRecords.length === 0 ? (
                <p className="text-xs text-neutral-500">No overtime requests or schedules recorded.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto min-w-0">
                  {completeProfile.overtimeRecords.map((ot) => (
                    <div
                      key={ot.id}
                      className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs min-w-0"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-800 break-words">
                          {formatDate(ot.overtimeDate)} • {ot.requestedHours}h (Approved: {ot.approvedHours}h)
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5 break-words">{ot.reason}</div>
                        {ot.approverName && (
                          <div className="text-[10px] text-neutral-500 break-words">
                            Actioned by: {ot.approverName} {ot.remarks ? `— "${ot.remarks}"` : ''}
                          </div>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${getStatusBadgeClasses(
                          String(ot.status)
                        )}`}
                      >
                        {ot.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`${MT_COLOR_CARDS.teal} p-4 sm:p-5 min-w-0 overflow-hidden`}>
              <h3 className="text-sm font-bold text-teal-950 mb-3 break-words">
                Team & Leadership Assignment History
              </h3>
              {completeProfile.teamLeadershipSummary ? (
                <div className="space-y-2 text-xs min-w-0">
                  <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 min-w-0">
                    <div className="font-semibold text-neutral-800 break-words">
                      Current Team Leader:{' '}
                      {completeProfile.teamLeadershipSummary.currentTeamLeader
                        ? `${completeProfile.teamLeadershipSummary.currentTeamLeader.teamLeaderName} (${completeProfile.teamLeadershipSummary.currentTeamLeader.teamLeaderEmployeeCode || 'TL'})`
                        : 'Direct / Top Management'}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-1">
                      Is Currently Active Team Leader:{' '}
                      <strong>
                        {completeProfile.teamLeadershipSummary.isCurrentTeamLeader ? 'Yes' : 'No'}
                      </strong>
                    </div>
                  </div>
                  {(completeProfile.teamLeadershipSummary.leadershipAssignments || []).map((la) => (
                    <div
                      key={la.id}
                      className="p-2.5 rounded-lg bg-red-50/50 border border-red-100 text-[11px] min-w-0"
                    >
                      <div className="font-semibold text-red-900 break-words">
                        Led Team #{la.teamId} ({la.selectionMode})
                      </div>
                      <div className="text-neutral-600 break-words">
                        {formatDate(la.effectiveFrom)} → {la.effectiveTo ? formatDate(la.effectiveTo) : 'Present'} ({la.rotationStatus})
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-500">No team leadership records available.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LEAVE BALANCES & APPLICATIONS CONTEXT */}
      {activeTab === 'leave_context' && (
        <div className="space-y-6">
          {/* Leave Balances */}
          <div className={`${MT_COLOR_CARDS.slate} p-5`}>
            <h3 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
              <Award className="w-4 h-4 text-sky-700" />
              Leave Balances ({new Date().getFullYear()})
            </h3>
            {completeProfile.leaveBalances.length === 0 ? (
              <p className="text-xs text-slate-600">No leave balances initialized for this employee.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {completeProfile.leaveBalances.map((b) => (
                  <div key={b.id} className={`${getLeaveTypeCardClasses(b.leaveTypeCode || b.leaveTypeName)} p-3.5`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-900">{b.leaveTypeName || b.leaveTypeCode}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${getLeaveTypeBadgeClasses(
                          b.leaveTypeCode || b.leaveTypeName
                        )}`}
                      >
                        {b.leaveTypeCode}
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-[11px] text-slate-700 font-medium">Available Balance</span>
                      <span className="text-lg font-bold text-neutral-900">{b.available} Days</span>
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-slate-200/80 flex justify-between text-[11px] text-slate-700">
                      <span>Used: {b.used} Days</span>
                      <span>Reserved: {b.reserved} Days</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Leave Applications & Current Approval Stage */}
          <div className={`${MT_COLOR_CARDS.sky} p-5`}>
            <h3 className="text-sm font-bold text-sky-950 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-700" />
              Leave Applications & Approval Stage Status
            </h3>
            {completeProfile.leaveRequests.length === 0 ? (
              <p className="text-xs text-slate-600">No leave applications submitted by this employee.</p>
            ) : (
              <>
                {/* Mobile Stacked Cards (<768px) */}
                <div className="md:hidden space-y-2.5">
                  {completeProfile.leaveRequests.map((req) => (
                    <div
                      key={`mobile-prof-req-${req.id}`}
                      className={`${getStatusCardClasses(req.status)} p-3.5 space-y-2 text-xs`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-slate-800">#{req.id}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${getLeaveTypeBadgeClasses(
                              req.leaveTypeCode || req.leaveTypeName
                            )}`}
                          >
                            {req.leaveTypeName || req.leaveTypeCode}
                          </span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClasses(
                            req.status
                          )}`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-neutral-600 font-mono text-[11px]">
                        <span>{formatDate(req.startDate)} → {formatDate(req.endDate)}</span>
                        <span className="font-bold text-neutral-900">{req.totalDays} Days</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-200/70">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${getStatusBadgeClasses(
                            req.approvalStageLabel || 'COMPLETED'
                          )}`}
                        >
                          {req.approvalStageLabel || 'COMPLETED'}
                        </span>
                        <span className="text-[11px] text-neutral-600 truncate max-w-[180px]">
                          {req.reason}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table (>=768px) */}
                <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 text-neutral-500 bg-neutral-50">
                      <th className="py-2.5 px-3 font-semibold">ID</th>
                      <th className="py-2.5 px-3 font-semibold">Leave Type</th>
                      <th className="py-2.5 px-3 font-semibold">Period</th>
                      <th className="py-2.5 px-3 font-semibold">Days</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 px-3 font-semibold">Current Approval Stage</th>
                      <th className="py-2.5 px-3 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {completeProfile.leaveRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-neutral-50">
                        <td className="py-2.5 px-3 font-mono font-semibold text-neutral-700">#{req.id}</td>
                        <td className="py-2.5 px-3 font-semibold text-neutral-800">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getLeaveTypeBadgeClasses(
                              req.leaveTypeCode || req.leaveTypeName
                            )}`}
                          >
                            {req.leaveTypeName || req.leaveTypeCode}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-neutral-600">
                          {formatDate(req.startDate)} → {formatDate(req.endDate)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-neutral-800">{req.totalDays} Days</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusBadgeClasses(
                              req.status
                            )}`}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${getStatusBadgeClasses(
                              req.approvalStageLabel || 'COMPLETED'
                            )}`}
                          >
                            {req.approvalStageLabel || 'COMPLETED'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-neutral-600 max-w-xs truncate">{req.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>

          {/* Step-by-Step Leave Approval Chain & Events */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-neutral-800 mb-3">
                Leave Workflow & Approval Chain History ({completeProfile.leaveRequestEvents?.length || 0})
              </h3>
              {!completeProfile.leaveRequestEvents || completeProfile.leaveRequestEvents.length === 0 ? (
                <p className="text-xs text-neutral-500">No leave workflow events recorded.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {completeProfile.leaveRequestEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-red-700">{ev.eventType}</span>
                        <span className="text-[10px] font-mono text-neutral-500">
                          {formatAuditDateTime(ev.createdAt)}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-700">
                        Request #{ev.leaveRequestId} • Actor:{' '}
                        <strong>
                          {ev.actorName || ev.actorRole} ({ev.actorRole})
                        </strong>
                      </div>
                      <div className="text-[11px] font-mono text-neutral-600">
                        {ev.previousStatus || '—'} &rarr;{' '}
                        <span className="font-bold text-red-700">{ev.newStatus || '—'}</span>
                      </div>
                      {ev.comments && (
                        <div className="text-[11px] text-neutral-500 italic">"{ev.comments}"</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leave Balance Transaction Ledger */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-neutral-800 mb-3">
                Leave Balance Ledger Transactions ({completeProfile.leaveBalanceTransactions?.length || 0})
              </h3>
              {!completeProfile.leaveBalanceTransactions ||
              completeProfile.leaveBalanceTransactions.length === 0 ? (
                <p className="text-xs text-neutral-500">No balance ledger transactions recorded.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {completeProfile.leaveBalanceTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-neutral-800">
                          {tx.leaveTypeCode || `Type #${tx.leaveTypeId}`}
                        </span>{' '}
                        • <span className="font-semibold text-red-700">{tx.transactionType}</span>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          {tx.remarks || tx.referenceType}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-neutral-900">{tx.quantity} Days</span>
                        <div className="text-[10px] font-mono text-neutral-500">
                          {formatAuditDateTime(tx.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PASSWORD RESET & ACCOUNT STATUS */}
      {activeTab === 'security_status' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 min-w-0">
          {/* Password Management Card */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 shadow-sm min-w-0 overflow-hidden">
            <h3 className="text-sm font-bold text-neutral-800 flex items-center gap-2 border-b border-neutral-100 pb-3 mb-4 min-w-0">
              <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="break-words min-w-0">
                {isSuperAdmin && isViewingOtherUser
                  ? `SUPER_ADMIN Password Reset — ${profile.username}`
                  : 'Change Password'}
              </span>
            </h3>

            {isSuperAdmin ? (
              <form onSubmit={handleSuperAdminResetPassword} className="space-y-3 min-w-0">
                <p className="text-xs text-neutral-500 break-words">
                  Securely reset the password for <strong>@{profile.username}</strong>. Existing passwords are never
                  displayed or logged.
                </p>
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    New Password (min 6 chars) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={adminResetPasswordVal}
                    onChange={(e) => setAdminResetPasswordVal(e.target.value)}
                    placeholder="Enter new password for user"
                    className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Confirm New Password *</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={adminConfirmPasswordVal}
                    onChange={(e) => setAdminConfirmPasswordVal(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={resettingPassword}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 justify-center inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl sm:rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span>{resettingPassword ? 'Resetting Password...' : 'Reset User Password'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleChangeOwnPassword} className="space-y-3 min-w-0">
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Current Password *</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    New Password (min 6 chars) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Confirm New Password *</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full max-w-full min-w-0 px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 justify-center inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl sm:rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span>{changingPassword ? 'Updating...' : 'Update Password'}</span>
                </button>
              </form>
            )}
          </div>

          {/* Account Activation / Suspension / Termination Controls (SUPER_ADMIN) */}
          {isSuperAdmin && (
            <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 shadow-sm space-y-4 min-w-0 overflow-hidden">
              <h3 className="text-sm font-bold text-neutral-800 flex items-center gap-2 border-b border-neutral-100 pb-3">
                <Activity className="w-4 h-4 text-red-700" />
                Account & Employment Status Operations
              </h3>
              <p className="text-xs text-neutral-500">
                Current Status:{' '}
                <strong className="text-neutral-800">
                  {profile.employmentStatus} ({profile.isActive ? 'Account Active' : 'Account Disabled'})
                </strong>
              </p>

              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2.5 sm:gap-3 pt-2 min-w-0">
                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={() => handleQuickEmploymentStatus('ACTIVE', true)}
                  className="min-h-[44px] sm:min-h-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl sm:rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 shrink-0" />
                  <span>Activate Account</span>
                </button>

                <button
                  type="button"
                  disabled={savingProfile || profile.id === currentUserId}
                  onClick={() => handleQuickEmploymentStatus('SUSPENDED', false)}
                  className="min-h-[44px] sm:min-h-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl sm:rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5 shrink-0" />
                  <span>Suspend User</span>
                </button>

                <button
                  type="button"
                  disabled={savingProfile || profile.id === currentUserId}
                  onClick={() => handleQuickEmploymentStatus('INACTIVE', false)}
                  className="min-h-[44px] sm:min-h-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl sm:rounded-lg text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-300 hover:bg-neutral-200 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Deactivate User</span>
                </button>

                <button
                  type="button"
                  disabled={savingProfile || profile.id === currentUserId}
                  onClick={() => handleQuickEmploymentStatus('TERMINATED', false)}
                  className="min-h-[44px] sm:min-h-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl sm:rounded-lg text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <UserX className="w-3.5 h-3.5 shrink-0" />
                  <span>Terminate Employment</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: 360° ACTIVITY & AUDIT TIMELINE */}
      {isSuperAdmin && activeTab === 'audit_trail' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-red-700" />
                  MNC-Standard 360° Business Activity & Audit Traceability Timeline
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Complete chronological traceability for{' '}
                  <span className="font-semibold text-neutral-800">{profile.fullName}</span> (
                  <span className="font-mono font-bold text-red-700">
                    {completeProfile.employeeCode || employee?.employeeCode || profile.employeeCode || '—'}
                  </span>
                  {completeProfile.departmentCode || employee?.departmentCode ? (
                    <span className="font-mono text-neutral-600">
                      {' '}
                      • Dept: {completeProfile.departmentCode || employee?.departmentCode}
                    </span>
                  ) : null}
                  ) — Who did what, when, who approved/actioned, status transitions, reasons, and next steps.
                </p>
              </div>
              <input
                type="text"
                value={timelineSearch}
                onChange={(e) => setTimelineSearch(e.target.value)}
                placeholder="Filter timeline by action, actor, status, reason..."
                className="px-3 py-1.5 text-xs border border-neutral-300 rounded-lg w-full sm:w-72"
              />
            </div>

            {/* Category Filter Buttons */}
            <div className="flex flex-wrap gap-1.5">
              {[
                'ALL',
                'LEAVE',
                'APPROVAL',
                'OVERTIME',
                'SHIFT',
                'HOLIDAY',
                'WEEKLY_OFF',
                'BALANCE',
                'TEAM_LEADERSHIP',
                'PROFILE',
                'AUDIT',
              ].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setTimelineCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    timelineCategoryFilter === cat
                      ? 'bg-red-700 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {cat.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            {(() => {
              const items = (completeProfile.unifiedTimeline || []).filter((item) => {
                if (timelineCategoryFilter !== 'ALL' && item.category !== timelineCategoryFilter) {
                  return false;
                }
                if (timelineSearch.trim()) {
                  const q = timelineSearch.trim().toLowerCase();
                  const hay = [
                    item.title,
                    item.summary,
                    item.action,
                    item.actorName,
                    item.actorEmployeeCode,
                    item.actorRole,
                    item.previousStatus,
                    item.newStatus,
                    item.reasonOrComment,
                    item.whatHappenedNext,
                    item.employeeCode,
                    item.departmentCode,
                  ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                  if (!hay.includes(q)) return false;
                }
                return true;
              });

              if (items.length === 0) {
                return (
                  <p className="text-xs text-neutral-500 py-6 text-center">
                    No matching activity timeline events found for this filter.
                  </p>
                );
              }

              return (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-xs space-y-2.5 hover:border-red-200 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-mono font-bold text-[10px]">
                            {item.category}
                          </span>
                          <span className="font-bold text-neutral-900 text-xs">{item.title}</span>
                          <span className="text-neutral-600 font-medium">— {item.summary}</span>
                        </div>
                        <span className="text-[11px] font-mono text-neutral-500">
                          {formatAuditDateTime(item.timestamp)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1 border-t border-neutral-200/70 text-[11px]">
                        <div>
                          <span className="text-neutral-500 font-semibold uppercase block text-[10px]">
                            Who (Employee & Dept)
                          </span>
                          <span className="font-semibold text-neutral-800">
                            {item.employeeName || profile.fullName}{' '}
                            <span className="font-mono text-red-700">
                              ({item.employeeCode || completeProfile.employeeCode || '—'})
                            </span>
                            {item.departmentCode ? (
                              <span className="font-mono text-neutral-600"> • {item.departmentCode}</span>
                            ) : null}
                          </span>
                        </div>

                        <div>
                          <span className="text-neutral-500 font-semibold uppercase block text-[10px]">
                            Actioned / Approved By
                          </span>
                          <span className="font-semibold text-neutral-800">
                            {item.actorName || 'System'}{' '}
                            {item.actorEmployeeCode ? (
                              <span className="font-mono text-red-700">({item.actorEmployeeCode})</span>
                            ) : null}{' '}
                            {item.actorRole ? (
                              <span className="text-neutral-500">[{item.actorRole}]</span>
                            ) : null}
                          </span>
                        </div>

                        <div>
                          <span className="text-neutral-500 font-semibold uppercase block text-[10px]">
                            Status Transition
                          </span>
                          <span className="font-mono font-semibold text-neutral-800">
                            {item.previousStatus || '—'} &rarr;{' '}
                            <span className="text-red-700 font-bold">{item.newStatus || '—'}</span>
                          </span>
                        </div>

                        <div>
                          <span className="text-neutral-500 font-semibold uppercase block text-[10px]">
                            What Happened Next
                          </span>
                          <span className="font-medium text-emerald-800">
                            {item.whatHappenedNext || 'Recorded'}
                          </span>
                        </div>
                      </div>

                      {item.reasonOrComment && (
                        <div className="p-2 rounded-lg bg-white border border-neutral-200/80 text-[11px] text-neutral-700">
                          <span className="font-bold text-neutral-600 uppercase text-[10px] mr-1.5">
                            Reason / Comment:
                          </span>
                          {item.reasonOrComment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Raw Immutable System Audit Entries */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-neutral-800 mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-700" />
              Raw System Audit Records ({completeProfile.auditLogs.length})
            </h3>
            {completeProfile.auditLogs.length === 0 ? (
              <p className="text-xs text-neutral-500">No audit events recorded for this employee yet.</p>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto">
                {completeProfile.auditLogs.map((log) => (
                  <div key={log.id} className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-mono font-bold text-[11px]">
                          {log.action}
                        </span>
                        {log.employeeCode && (
                          <span className="px-2 py-0.5 rounded bg-white border border-neutral-200 font-mono font-bold text-[11px] text-neutral-800">
                            Emp: {log.employeeCode}
                          </span>
                        )}
                        {log.departmentCode && (
                          <span className="px-2 py-0.5 rounded bg-white border border-neutral-200 font-mono font-semibold text-[11px] text-neutral-600">
                            Dept: {log.departmentCode}
                          </span>
                        )}
                        <span className="font-semibold text-neutral-700">
                          Actor: {log.actorName || log.actorRole} (
                          {log.actorEmployeeCode || `#${log.actorId ?? 'System'}`})
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-neutral-500">
                        {formatAuditDateTime(log.createdAt)}
                      </span>
                    </div>
                    {log.metadata && <AuditEventDetailsView log={log} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
