import React from 'react';
import { ExternalLink, UserCheck } from 'lucide-react';

export interface OpenEmployee360Payload {
  employeeId?: number | string | null;
  employeeCode?: string | null;
  userId?: number | string | null;
  employeeName?: string | null;
}

export const EMPLOYEE_360_STORAGE_KEY = 'maestro_active_employee_360';

export function openEmployee360Profile(payload: OpenEmployee360Payload): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(EMPLOYEE_360_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
  window.dispatchEvent(
    new CustomEvent<OpenEmployee360Payload>('open-employee-360', {
      detail: payload,
    })
  );
}

export function clearEmployee360ProfileState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(EMPLOYEE_360_STORAGE_KEY);
  } catch {}
}

export function getPersistedEmployee360ProfileState(): OpenEmployee360Payload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(EMPLOYEE_360_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OpenEmployee360Payload;
    if (parsed && (parsed.employeeCode || parsed.employeeId || parsed.userId || parsed.employeeName)) {
      return parsed;
    }
  } catch {}
  return null;
}

export interface Employee360BadgeProps {
  employeeId?: number | string | null;
  employeeCode?: string | null;
  userId?: number | string | null;
  employeeName?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  showCodeOnly?: boolean;
  showButton?: boolean;
  showIcon?: boolean;
  variant?: 'default' | 'badge' | 'button';
  className?: string;
  children?: React.ReactNode;
}

export const Employee360Link: React.FC<Employee360BadgeProps> = ({
  employeeId,
  employeeCode,
  userId,
  employeeName,
  departmentCode,
  departmentName,
  showCodeOnly = false,
  showButton = false,
  showIcon = false,
  variant = 'default',
  className = '',
  children,
}) => {
  const canDrillDown = Boolean(employeeCode || employeeId || userId || employeeName);
  const displayCode =
    employeeCode ||
    (employeeId !== undefined && employeeId !== null && String(employeeId).trim() !== ''
      ? String(employeeId)
      : userId
        ? `U-${userId}`
        : null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canDrillDown) return;
    openEmployee360Profile({
      employeeId: employeeCode || employeeId || employeeName,
      employeeCode: employeeCode || null,
      userId: userId || null,
      employeeName: employeeName || null,
    });
  };

  if (showButton || variant === 'button') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!canDrillDown}
        title={`Open Employee 360° Profile (${displayCode || employeeName || 'Employee'})`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 text-sky-900 hover:bg-sky-100 border border-sky-300 transition-colors cursor-pointer ${className}`}
      >
        <UserCheck className="w-3.5 h-3.5 text-sky-700" />
        <span>{children || '360° Profile'}</span>
        {!children && displayCode && (
          <span className="font-mono text-[11px] bg-white px-1.5 py-0.2 rounded border border-sky-200 text-slate-800">
            {displayCode}
          </span>
        )}
      </button>
    );
  }

  if (showCodeOnly || variant === 'badge') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!canDrillDown}
        title={`Open 360° Profile for ${employeeName || displayCode || 'Employee'}`}
        className={`inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 hover:bg-sky-50 hover:text-sky-900 hover:border-sky-300 border border-slate-300 transition-colors cursor-pointer ${className}`}
      >
        <span>{children || displayCode || employeeName || '—'}</span>
        <ExternalLink className="w-3 h-3 opacity-70" />
      </button>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={!canDrillDown}
        title={`Click to open Employee 360° Profile (${displayCode || employeeName || ''})`}
        className="group inline-flex items-center gap-1.5 text-left font-semibold text-neutral-900 hover:text-sky-800 transition-colors cursor-pointer"
      >
        <span className="group-hover:underline">
          {children || employeeName || displayCode || 'Employee'}
        </span>
        {showIcon && <ExternalLink className="w-3 h-3 opacity-70" />}
        {!children && displayCode && (
          <span className="inline-flex items-center gap-0.5 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300 group-hover:bg-sky-50 group-hover:text-sky-900 group-hover:border-sky-300">
            {displayCode}
            <ExternalLink className="w-2.5 h-2.5 opacity-75" />
          </span>
        )}
      </button>
      {(departmentCode || departmentName) && (
        <span className="inline-flex items-center font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200">
          {departmentCode ? `${departmentCode}${departmentName ? ` • ${departmentName}` : ''}` : departmentName}
        </span>
      )}
    </div>
  );
};

export const Employee360Trigger = Employee360Link;
