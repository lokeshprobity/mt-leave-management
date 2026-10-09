import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Search,
  RefreshCw,
  Shield,
  FileText,
} from 'lucide-react';
import { SystemAuditLogDto } from '../types/leave.ts';
import { apiFetch, getActiveRole, hasClientPermission } from '../lib/api.ts';
import { Employee360Link } from './Employee360Trigger.tsx';
import { formatDate, formatDateTime } from '../utils/dateFormat.ts';

export interface FormattedAuditField {
  label: string;
  value: string;
}

export interface FormattedAuditSection {
  title: string;
  fields: FormattedAuditField[];
}

export interface FormattedAuditPresentation {
  title: string;
  fields: FormattedAuditField[];
  sections: FormattedAuditSection[];
  summaryText: string;
  lines: string[];
}

const KNOWN_ACRONYMS: Record<string, string> = {
  id: 'ID',
  url: 'URL',
  mime: 'MIME',
  ip: 'IP',
  hr: 'HR',
  ot: 'OT',
  rbac: 'RBAC',
  tl: 'TL',
};

export function formatAuditFieldLabel(rawKey: string): string {
  if (!rawKey) return 'Field';
  const exactMap: Record<string, string> = {
    targetUserId: 'User ID',
    targetUsername: 'User',
    userId: 'User ID',
    username: 'Username',
    employeeId: 'Employee ID',
    employeeCode: 'Employee Code',
    employeeName: 'Employee Name',
    fullName: 'Full Name',
    fileName: 'File',
    originalName: 'Original File',
    mimeType: 'Type',
    fileSizeBytes: 'Size',
    storagePath: 'Storage Path',
    credentialRedacted: 'Credential Status',
    credentialState: 'Credential State',
    changedBySelf: 'Changed By Self',
    resetBy: 'Reset By User ID',
    resetCompleted: 'Reset Completed',
    departmentId: 'Department ID',
    departmentName: 'Department',
    designationId: 'Designation ID',
    designationName: 'Designation',
    reportingManagerId: 'Reporting Manager ID',
    reportingManagerName: 'Reporting Person',
    operationalRole: 'Operational Role',
    employmentType: 'Employment Type',
    employmentStatus: 'Employment Status',
    joiningDate: 'Joining Date',
    officeLocation: 'Office Location',
    isActive: 'Active Status',
    roleId: 'Role ID',
    roleCode: 'Role Code',
    roleName: 'Role Name',
    displayName: 'Display Name',
    isSystemRole: 'Predefined / System Role',
    isSystem: 'Predefined / System Role',
    roleType: 'Role Classification',
    actedBySuperAdmin: 'Acting Super Admin',
    dependencyStatus: 'Dependency Verification',
    assignedUserCount: 'Assigned Users at Deletion',
    previousRole: 'Previous Role',
    newRole: 'New Role',
    unassignedRole: 'Unassigned Role',
    previousPermissions: 'Previous Permissions',
    newPermissions: 'Updated Permissions',
    permissions: 'Permissions',
  };
  if (exactMap[rawKey]) {
    return exactMap[rawKey];
  }

  const spaced = rawKey
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

  return spaced
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (KNOWN_ACRONYMS[lower]) return KNOWN_ACRONYMS[lower];
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function formatMimeTypeHuman(mime?: string | null): string {
  if (!mime) return '—';
  const normalized = String(mime).toLowerCase().trim();
  if (normalized === 'image/png') return 'PNG Image';
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'JPEG Image';
  if (normalized === 'image/webp') return 'WEBP Image';
  if (normalized === 'application/pdf') return 'PDF Document';
  if (normalized.startsWith('image/')) {
    return `${normalized.replace('image/', '').toUpperCase()} Image`;
  }
  return String(mime);
}

export function formatFileSizeBytes(bytes?: number | string | null): string {
  if (bytes === null || bytes === undefined || bytes === '') return '—';
  const num = Number(bytes);
  if (!Number.isFinite(num) || num < 0) return String(bytes);
  if (num >= 1024 * 1024) {
    return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (num >= 1024) {
    return `${(num / 1024).toFixed(2)} KB`;
  }
  return `${num} B`;
}

export function formatAuditDateTime(val?: string | Date | null): string {
  return formatDateTime(val);
}

export function formatAuditActionTitle(action: string): string {
  const actionMap: Record<string, string> = {
    USER_PROFILE_PHOTO_UPLOADED: 'Profile Photo Uploaded',
    USER_PROFILE_PHOTO_REMOVED: 'Profile Photo Removed',
    USER_PROFILE_PHOTO_REPLACED: 'Profile Photo Replaced',
    COMPANY_LOGO_UPLOADED: 'Company Logo Uploaded',
    COMPANY_LOGO_REMOVED: 'Company Logo Removed',
    COMPANY_LOGO_REPLACED: 'Company Logo Replaced',
    USER_LOGIN: 'User Login',
    USER_LOGOUT: 'User Logout',
    USER_CREATED: 'User Account Created',
    USER_UPDATED: 'User Profile Updated',
    USER_STATUS_TOGGLED: 'User Status Changed',
    USER_DEACTIVATED: 'User Account Deactivated',
    USER_DELETED: 'User Account Deleted',
    USER_PASSWORD_RESET: 'User Password Reset',
    USER_PASSWORD_CHANGED: 'User Password Changed',
    ROLE_CREATED: 'Custom Role Created',
    ROLE_UPDATED: 'Role Updated',
    ROLE_PERMISSIONS_UPDATED: 'Role Permissions Updated',
    ROLE_DELETED: 'Role Deleted',
    USER_ROLE_ASSIGNED: 'User Role Assigned',
    ROLE_ASSIGNED: 'User Role Assigned',
    ROLE_UNASSIGNED: 'User Role Unassigned',
    SHIFT_CREATED: 'Shift Created',
    SHIFT_UPDATED: 'Shift Updated',
    SHIFT_DELETED: 'Shift Deleted',
    SHIFT_DEACTIVATED: 'Shift Deactivated',
    SHIFT_ASSIGNED: 'Shift Assigned',
    SHIFT_CHANGED: 'Shift Assignment Updated',
    SHIFT_ASSIGNMENT_CANCELLED: 'Shift Assignment Cancelled',
    EMPLOYEE_SHIFT_ASSIGNED: 'Employee Shift Assigned',
    SHIFT_ASSIGNMENT_UPDATED: 'Shift Assignment Updated',
    OVERTIME_REQUESTED: 'Overtime Requested',
    OVERTIME_APPROVED: 'Overtime Approved',
    OVERTIME_REJECTED: 'Overtime Rejected',
  };
  if (actionMap[action]) return actionMap[action];
  return formatAuditFieldLabel(action);
}

function formatScalarAuditValue(key: string, value: any): string {
  if (value === null || value === undefined || value === '') return 'None';
  const lowerKey = key.toLowerCase();
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (lowerKey === 'mimetype') {
    return formatMimeTypeHuman(String(value));
  }
  if (lowerKey === 'filesizebytes' || lowerKey === 'sizebytes') {
    return formatFileSizeBytes(value);
  }
  if (
    (lowerKey === 'timestamp' || lowerKey === 'createdat' || lowerKey === 'updatedat') &&
    typeof value === 'string' &&
    value.includes('T')
  ) {
    return formatAuditDateTime(value);
  }
  if (typeof value === 'string' && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value.trim())) {
    return formatDate(value.trim());
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';
    return value
      .map((item) => {
        if (item === null || item === undefined) return 'None';
        if (typeof item === 'object') {
          return Object.entries(item)
            .map(([k, v]) => `${formatAuditFieldLabel(k)}: ${formatScalarAuditValue(k, v)}`)
            .join(', ');
        }
        return String(item);
      })
      .join(', ');
  }
  return String(value);
}

function extractFlatFieldsFromObject(obj: Record<string, any>, prefix = ''): FormattedAuditField[] {
  const fields: FormattedAuditField[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const label = prefix ? `${prefix} ${formatAuditFieldLabel(key)}` : formatAuditFieldLabel(key);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      fields.push(...extractFlatFieldsFromObject(value, label));
    } else {
      fields.push({
        label,
        value: formatScalarAuditValue(key, value),
      });
    }
  }
  return fields;
}

export function formatAuditLogForDisplay(log: {
  action: string;
  targetId?: string | null;
  createdAt?: string | Date;
  metadata?: Record<string, any> | null;
}): FormattedAuditPresentation {
  const action = log.action || 'AUDIT_EVENT';
  const title = formatAuditActionTitle(action);
  const meta = log.metadata && typeof log.metadata === 'object' ? log.metadata : {};
  const fields: FormattedAuditField[] = [];
  const sections: FormattedAuditSection[] = [];

  if (
    action === 'USER_PROFILE_PHOTO_UPLOADED' ||
    action === 'USER_PROFILE_PHOTO_REPLACED'
  ) {
    const afterPhoto = meta.after && typeof meta.after === 'object' ? meta.after : meta;
    const beforePhoto = meta.before && typeof meta.before === 'object' ? meta.before : null;
    const username = meta.targetUsername || meta.username || '—';
    const userId = meta.targetUserId ?? meta.userId ?? log.targetId ?? '—';
    const empId = meta.employeeId ?? '—';
    const fileName =
      afterPhoto?.originalName ||
      afterPhoto?.fileName ||
      meta.originalName ||
      meta.fileName ||
      '—';
    const mimeLabel = formatMimeTypeHuman(afterPhoto?.mimeType || meta.mimeType);
    const sizeLabel = formatFileSizeBytes(afterPhoto?.fileSizeBytes ?? meta.fileSizeBytes);
    const uploadedAt = formatAuditDateTime(meta.timestamp || log.createdAt);

    fields.push(
      { label: 'User', value: String(username) },
      { label: 'User ID', value: String(userId) },
      { label: 'Employee ID', value: String(empId) },
      { label: 'File', value: String(fileName) },
      { label: 'Type', value: mimeLabel },
      { label: 'Size', value: sizeLabel },
      { label: 'Uploaded', value: uploadedAt }
    );

    if (beforePhoto && (beforePhoto.originalName || beforePhoto.fileName)) {
      fields.push({
        label: 'Previous File',
        value: String(beforePhoto.originalName || beforePhoto.fileName),
      });
    }
  } else if (action === 'USER_PROFILE_PHOTO_REMOVED') {
    const beforePhoto = meta.before && typeof meta.before === 'object' ? meta.before : meta;
    const username = meta.targetUsername || meta.username || '—';
    const userId = meta.targetUserId ?? meta.userId ?? log.targetId ?? '—';
    const empId = meta.employeeId ?? '—';
    const prevFileName =
      beforePhoto?.originalName ||
      beforePhoto?.fileName ||
      meta.originalName ||
      meta.fileName ||
      'None';
    const mimeLabel = formatMimeTypeHuman(beforePhoto?.mimeType || meta.mimeType);
    const sizeLabel = formatFileSizeBytes(beforePhoto?.fileSizeBytes ?? meta.fileSizeBytes);
    const removedAt = formatAuditDateTime(meta.timestamp || log.createdAt);

    fields.push(
      { label: 'User', value: String(username) },
      { label: 'User ID', value: String(userId) },
      { label: 'Employee ID', value: String(empId) },
      { label: 'Previous File', value: String(prevFileName) },
      { label: 'Type', value: mimeLabel },
      { label: 'Size', value: sizeLabel },
      { label: 'Removed', value: removedAt }
    );
  } else if (
    action === 'COMPANY_LOGO_UPLOADED' ||
    action === 'COMPANY_LOGO_REPLACED'
  ) {
    const afterLogo = meta.after && typeof meta.after === 'object' ? meta.after : meta;
    const beforeLogo = meta.before && typeof meta.before === 'object' ? meta.before : null;
    fields.push(
      { label: 'Application', value: String(meta.applicationName || 'Maestro Leave Management') },
      { label: 'File', value: String(afterLogo?.originalName || afterLogo?.fileName || '—') },
      { label: 'Type', value: formatMimeTypeHuman(afterLogo?.mimeType || meta.mimeType) },
      { label: 'Size', value: formatFileSizeBytes(afterLogo?.fileSizeBytes ?? meta.fileSizeBytes) },
      { label: 'Uploaded', value: formatAuditDateTime(meta.timestamp || log.createdAt) }
    );
    if (beforeLogo && (beforeLogo.originalName || beforeLogo.fileName)) {
      fields.push({
        label: 'Previous File',
        value: String(beforeLogo.originalName || beforeLogo.fileName),
      });
    }
  } else if (action === 'COMPANY_LOGO_REMOVED') {
    const beforeLogo = meta.before && typeof meta.before === 'object' ? meta.before : meta;
    fields.push(
      { label: 'Application', value: String(meta.applicationName || 'Maestro Leave Management') },
      { label: 'Previous File', value: String(beforeLogo?.originalName || beforeLogo?.fileName || 'None') },
      { label: 'Type', value: formatMimeTypeHuman(beforeLogo?.mimeType || meta.mimeType) },
      { label: 'Size', value: formatFileSizeBytes(beforeLogo?.fileSizeBytes ?? meta.fileSizeBytes) },
      { label: 'Removed', value: formatAuditDateTime(meta.timestamp || log.createdAt) }
    );
  } else {
    // Generic human-readable key/value presentation for all other / unknown / future audit event types
    for (const [key, value] of Object.entries(meta)) {
      if (value === undefined) continue;
      if (key === 'before' || key === 'after' || key === 'changes') continue;

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const nestedFields = extractFlatFieldsFromObject(value);
        if (nestedFields.length > 0) {
          sections.push({
            title: formatAuditFieldLabel(key),
            fields: nestedFields,
          });
        }
      } else {
        fields.push({
          label: formatAuditFieldLabel(key),
          value: formatScalarAuditValue(key, value),
        });
      }
    }

    if (meta.changes && typeof meta.changes === 'object' && !Array.isArray(meta.changes)) {
      const changeFields: FormattedAuditField[] = [];
      for (const [cKey, cVal] of Object.entries(meta.changes)) {
        if (cVal && typeof cVal === 'object' && ('before' in cVal || 'after' in cVal)) {
          const bStr = formatScalarAuditValue(cKey, (cVal as any).before);
          const aStr = formatScalarAuditValue(cKey, (cVal as any).after);
          changeFields.push({
            label: formatAuditFieldLabel(cKey),
            value: `${bStr} → ${aStr}`,
          });
        } else {
          changeFields.push({
            label: formatAuditFieldLabel(cKey),
            value: formatScalarAuditValue(cKey, cVal),
          });
        }
      }
      if (changeFields.length > 0) {
        sections.push({
          title: 'Updated Values',
          fields: changeFields,
        });
      }
    }

    if (meta.before !== undefined && meta.before !== null) {
      if (typeof meta.before === 'object' && !Array.isArray(meta.before)) {
        const beforeFields = extractFlatFieldsFromObject(meta.before);
        if (beforeFields.length > 0) {
          sections.push({
            title: 'Before',
            fields: beforeFields,
          });
        }
      } else {
        sections.push({
          title: 'Before',
          fields: [{ label: 'Previous Value', value: formatScalarAuditValue('before', meta.before) }],
        });
      }
    }

    if (meta.after !== undefined && meta.after !== null) {
      if (typeof meta.after === 'object' && !Array.isArray(meta.after)) {
        const afterFields = extractFlatFieldsFromObject(meta.after);
        if (afterFields.length > 0) {
          sections.push({
            title: 'After',
            fields: afterFields,
          });
        }
      } else {
        sections.push({
          title: 'After',
          fields: [{ label: 'Updated Value', value: formatScalarAuditValue('after', meta.after) }],
        });
      }
    }
  }

  const lines: string[] = [title];
  for (const f of fields) {
    lines.push(`${f.label}: ${f.value}`);
  }
  for (const s of sections) {
    lines.push(s.title);
    for (const sf of s.fields) {
      lines.push(`${sf.label}: ${sf.value}`);
    }
  }

  const summaryParts = fields.slice(0, 4).map((f) => `${f.label}: ${f.value}`);
  const summaryText =
    summaryParts.length > 0
      ? `${title} — ${summaryParts.join(' • ')}`
      : title;

  return {
    title,
    fields,
    sections,
    summaryText,
    lines,
  };
}

export function AuditEventDetailsView({ log }: { log: SystemAuditLogDto }) {
  const presentation = formatAuditLogForDisplay(log);

  return (
    <div className="mt-2.5 rounded-lg bg-white border border-neutral-200/90 p-3.5 text-xs space-y-3 shadow-2xs">
      <div className="font-bold text-neutral-900 text-xs border-b border-neutral-100 pb-2">
        {presentation.title}
      </div>

      {presentation.fields.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {presentation.fields.map((field, idx) => (
            <div
              key={`${field.label}-${idx}`}
              className="flex items-baseline justify-between sm:justify-start gap-2 py-0.5"
            >
              <dt className="text-neutral-500 font-medium shrink-0">{field.label}:</dt>
              <dd className="text-neutral-900 font-semibold break-all">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {presentation.sections.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {presentation.sections.map((section, sIdx) => (
            <div
              key={`${section.title}-${sIdx}`}
              className="rounded-lg bg-neutral-50 border border-neutral-200/80 p-2.5 space-y-1.5"
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 border-b border-neutral-200/70 pb-1">
                {section.title}
              </div>
              <dl className="space-y-1">
                {section.fields.map((f, fIdx) => (
                  <div
                    key={`${f.label}-${fIdx}`}
                    className="flex items-baseline justify-between gap-2 text-[11px]"
                  >
                    <dt className="text-neutral-500 font-medium shrink-0">{f.label}:</dt>
                    <dd className="text-neutral-800 font-semibold text-right break-all">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SystemAuditAdmin() {
  const activeRole = getActiveRole();
  const canViewAudit = hasClientPermission('audit.view', activeRole);
  const [logs, setLogs] = useState<SystemAuditLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [employeeCodeFilter, setEmployeeCodeFilter] = useState('');
  const [departmentCodeFilter, setDepartmentCodeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<SystemAuditLogDto | null>(null);

  const loadLogs = async () => {
    if (!canViewAudit) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (actionFilter !== 'ALL') params.set('action', actionFilter);
      if (employeeCodeFilter.trim()) params.set('employeeCode', employeeCodeFilter.trim());
      if (departmentCodeFilter.trim()) params.set('departmentCode', departmentCodeFilter.trim());
      params.set('limit', '250');
      const url = `/api/audit-logs?${params.toString()}`;
      const res = await apiFetch(url, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load audit logs');
      setLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message || 'Error loading audit trail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [actionFilter, canViewAudit]);

  if (!canViewAudit) {
    return (
      <div className="bg-white rounded-xl border border-rose-200 p-8 shadow-xs max-w-xl mx-auto text-center space-y-2">
        <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto" />
        <h3 className="text-sm font-bold text-neutral-900">Access Restricted</h3>
        <p className="text-xs text-neutral-600">
          System Audit Trail is restricted to Super Admin.
        </p>
      </div>
    );
  }

  const filteredLogs = logs.filter((l) => {
    if (employeeCodeFilter.trim()) {
      const ec = employeeCodeFilter.trim().toUpperCase();
      const matchEmp =
        l.employeeCode?.toUpperCase().includes(ec) ||
        l.actorEmployeeCode?.toUpperCase().includes(ec) ||
        String(l.metadata?.employeeCode || '').toUpperCase().includes(ec);
      if (!matchEmp) return false;
    }
    if (departmentCodeFilter.trim()) {
      const dc = departmentCodeFilter.trim().toUpperCase();
      const matchDept =
        l.departmentCode?.toUpperCase().includes(dc) ||
        String(l.metadata?.departmentCode || '').toUpperCase().includes(dc);
      if (!matchDept) return false;
    }
    const q = search.toLowerCase();
    if (!q) return true;
    const formatted = formatAuditLogForDisplay(l);
    const matchesSearch =
      l.action.toLowerCase().includes(q) ||
      formatted.title.toLowerCase().includes(q) ||
      formatted.summaryText.toLowerCase().includes(q) ||
      l.targetEntity.toLowerCase().includes(q) ||
      (l.targetId && l.targetId.toLowerCase().includes(q)) ||
      (l.employeeCode && l.employeeCode.toLowerCase().includes(q)) ||
      (l.employeeName && l.employeeName.toLowerCase().includes(q)) ||
      (l.departmentCode && l.departmentCode.toLowerCase().includes(q)) ||
      (l.actorName && l.actorName.toLowerCase().includes(q)) ||
      (l.actorEmployeeCode && l.actorEmployeeCode.toLowerCase().includes(q)) ||
      (l.actorRole && l.actorRole.toLowerCase().includes(q));
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-indigo-300 border-t-[5px] border-t-indigo-600 bg-indigo-50/75 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
            <ShieldAlert className="w-5 h-5 text-indigo-700" />
            <span>System Audit Trail & Compliance Log</span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Immutable log of system events: user management, credentials changes, profile photos, status toggles, shift reassignments, and authorizations.
          </p>
        </div>

        <button
          onClick={loadLogs}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 border border-neutral-200 text-neutral-700 rounded-lg text-xs font-semibold hover:bg-neutral-50 transition-colors shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Logs</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-300 border-t-[5px] border-t-slate-600 bg-slate-50/85 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search action, employee ID (e.g. MT001), dept (e.g. IMP001), actor, status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700 transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Employee ID (e.g. MT001)"
            value={employeeCodeFilter}
            onChange={(e) => setEmployeeCodeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg w-40 font-mono"
          />
          <input
            type="text"
            placeholder="Dept ID (e.g. IMP001)"
            value={departmentCodeFilter}
            onChange={(e) => setDepartmentCodeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg w-36 font-mono"
          />
          <span className="text-xs text-neutral-500 font-medium">Event Filter:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-700 focus:outline-none focus:border-red-700"
          >
            <option value="ALL">All Actions</option>
            <option value="LEAVE_SUBMITTED">LEAVE_SUBMITTED</option>
            <option value="TEAM_LEADER_APPROVED">TEAM_LEADER_APPROVED</option>
            <option value="TEAM_LEADER_REJECTED">TEAM_LEADER_REJECTED</option>
            <option value="HR_APPROVED">HR_APPROVED</option>
            <option value="HR_REJECTED">HR_REJECTED</option>
            <option value="MANAGEMENT_APPROVED">MANAGEMENT_APPROVED</option>
            <option value="MANAGEMENT_REJECTED">MANAGEMENT_REJECTED</option>
            <option value="LEAVE_CANCELLED">LEAVE_CANCELLED</option>
            <option value="EMPLOYEE_CREATED">EMPLOYEE_CREATED</option>
            <option value="EMPLOYEE_UPDATED">EMPLOYEE_UPDATED</option>
            <option value="USER_CREATED">USER_CREATED</option>
            <option value="USER_UPDATED">USER_UPDATED</option>
            <option value="USER_STATUS_TOGGLED">USER_STATUS_TOGGLED</option>
            <option value="USER_PASSWORD_CHANGED">USER_PASSWORD_CHANGED</option>
            <option value="USER_PASSWORD_RESET">USER_PASSWORD_RESET</option>
            <option value="SHIFT_ASSIGNED">SHIFT_ASSIGNED</option>
            <option value="EMPLOYEE_SHIFT_ASSIGNED">EMPLOYEE_SHIFT_ASSIGNED</option>
            <option value="OVERTIME_REQUESTED">OVERTIME_REQUESTED</option>
            <option value="OVERTIME_SCHEDULED">OVERTIME_SCHEDULED</option>
            <option value="OVERTIME_APPROVED">OVERTIME_APPROVED</option>
            <option value="OVERTIME_REJECTED">OVERTIME_REJECTED</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-indigo-300 border-t-[5px] border-t-indigo-600 overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-neutral-500 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Loading audit events...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-xs">
            No system audit events found matching the criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-700">
              <thead className="bg-indigo-50/80 border-b border-indigo-200 text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Employee & Dept (360°)</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Status / Transition</th>
                  <th className="px-4 py-3">Audit Summary & Reason</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70">
                {filteredLogs.map((log) => {
                  const formatted = formatAuditLogForDisplay(log);
                  const empCode = log.employeeCode || log.metadata?.employeeCode || null;
                  const empName = log.employeeName || log.metadata?.employeeName || null;
                  const empId = log.metadata?.employeeId || null;
                  const deptCode = log.departmentCode || log.metadata?.departmentCode || null;
                  return (
                    <tr key={log.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-500 font-mono text-[11px]">
                        {formatAuditDateTime(log.createdAt)}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-neutral-900 text-xs">
                          {formatted.title}
                        </div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded font-semibold text-[10px] bg-neutral-100 text-neutral-600 border border-neutral-200 font-mono">
                          {log.action}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {empCode || empId ? (
                          <Employee360Link
                            employeeId={empCode || empId}
                            employeeCode={empCode}
                            employeeName={empName || empCode}
                            departmentCode={deptCode}
                          />
                        ) : (
                          <span className="text-neutral-500 text-[11px]">
                            {formatAuditFieldLabel(log.targetEntity)} {log.targetId ? `#${log.targetId}` : ''}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-neutral-900 flex items-center gap-1">
                          <Shield className="w-3 h-3 text-neutral-500" />
                          <span>{log.actorName || log.actorRole || 'SYSTEM'}</span>
                        </div>
                        <div className="text-[10px] text-neutral-500 font-mono">
                          {log.actorEmployeeCode
                            ? `${log.actorEmployeeCode} (${log.actorRole})`
                            : log.actorId
                              ? `User #${log.actorId} (${log.actorRole})`
                              : 'System Agent'}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-[11px]">
                        {log.previousStatus || log.newStatus ? (
                          <span className="font-mono font-semibold text-neutral-800">
                            {log.previousStatus || '—'} &rarr;{' '}
                            <span className="text-red-700 font-bold">{log.newStatus || '—'}</span>
                          </span>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                        {log.nextStep && (
                          <div className="text-[10px] text-emerald-700 font-medium truncate max-w-[180px]">
                            {log.nextStep}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 max-w-[300px] text-[11px] text-neutral-700">
                        <div className="truncate font-medium">{formatted.summaryText}</div>
                        {log.reason && (
                          <div className="truncate text-[10px] text-neutral-500 italic">
                            Reason: {log.reason}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:text-neutral-900 border border-neutral-200 rounded hover:bg-neutral-50 cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Inspect Audit Event Details */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="font-bold text-neutral-900 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-neutral-700" />
                  <span>{formatAuditActionTitle(selectedLog.action)}</span>
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5 font-mono">
                  {selectedLog.action} &bull; Event #{selectedLog.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 mt-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200">
                  <span className="text-neutral-500 block">Actor</span>
                  <span className="font-semibold text-neutral-900">
                    {selectedLog.actorRole || 'SYSTEM'} (#{selectedLog.actorId ?? 'System'})
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200">
                  <span className="text-neutral-500 block">Target</span>
                  <span className="font-semibold text-neutral-900">
                    {formatAuditFieldLabel(selectedLog.targetEntity)}{' '}
                    {selectedLog.targetId ? `(#${selectedLog.targetId})` : ''}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200">
                  <span className="text-neutral-500 block">Recorded At</span>
                  <span className="font-semibold text-neutral-900">
                    {formatAuditDateTime(selectedLog.createdAt)}
                  </span>
                </div>
              </div>

              <AuditEventDetailsView log={selectedLog} />
            </div>

            <div className="flex justify-end pt-4 border-t border-neutral-100 mt-4">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
