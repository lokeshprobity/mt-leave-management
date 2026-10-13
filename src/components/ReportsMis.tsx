import React, { useState, useEffect } from 'react';
import { strToU8, zipSync } from 'fflate';
import {
  BarChart3,
  Download,
  Filter,
  RefreshCw,
  Search,
  Calendar,
  Users,
  Building,
  Tag,
  Clock,
  CheckCircle,
  FileSpreadsheet,
  ShieldAlert,
} from 'lucide-react';
import { canAccessModule, getActiveRole, getAuthHeaders } from '../lib/api.ts';
import { Employee360Link } from './Employee360Trigger.tsx';
import { formatDate } from '../utils/dateFormat.ts';
import {
  MT_THEME,
  MT_COLOR_CARDS,
  getStatusBadgeClasses,
  getStatusCardClasses,
  getLeaveTypeBadgeClasses,
  getLeaveTypeBarColor,
} from '../utils/theme.ts';

type ReportTab =
  | 'employee'
  | 'department'
  | 'leave-type'
  | 'monthly'
  | 'pending'
  | 'balances'
  | 'holidays'
  | 'shifts'
  | 'overtime';

export function ReportsMis() {
  const activeRole = getActiveRole();
  const isAuthorizedForReports = canAccessModule('reports', activeRole);
  const [activeTab, setActiveTab] = useState<ReportTab>('employee');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Raw Data from backend
  const [data, setData] = useState<{
    employees: any[];
    leaveRequests: any[];
    leaveTypes: any[];
    holidays: any[];
    shifts: any[];
    overtimeRequests: any[];
    balances: any[];
  }>({
    employees: [],
    leaveRequests: [],
    leaveTypes: [],
    holidays: [],
    shifts: [],
    overtimeRequests: [],
    balances: [],
  });

  // Filters
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedEmp, setSelectedEmp] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const loadData = async () => {
    if (!isAuthorizedForReports) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/data', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to load reports dataset');
      const resData = await res.json();
      setData(resData);
    } catch (err: any) {
      setError(err.message || 'Error fetching report data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeRole, isAuthorizedForReports]);

  if (!isAuthorizedForReports) {
    return (
      <div
        id="reports-access-denied"
        className="bg-white rounded-xl border border-rose-200 p-8 shadow-xs max-w-xl mx-auto text-center space-y-3"
      >
        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-neutral-900">Access Restricted</h3>
        <p className="text-xs text-neutral-600">
          Reports &amp; MIS is restricted to HR, Top Management, and Super Admin roles.
        </p>
      </div>
    );
  }

  const empMap = new Map(data.employees.map((e) => [e.id, e]));

  // Helper: Export report rows as a native Excel workbook (.xlsx).
  const exportToExcel = (filename: string, rows: (string | number)[][]) => {
    const escapeXml = (value: unknown) =>
      String(value ?? '')
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
    const sheetName = filename.replace(/[_\W]+/g, ' ').trim().slice(0, 31) || 'Report';
    const worksheetRows = rows.map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => {
        const reference = columnName(columnIndex) + String(rowIndex + 1);
        if (typeof value === 'number' && Number.isFinite(value)) {
          return '<c r="' + reference + '" t="n"><v>' + String(value) + '</v></c>';
        }
        return '<c r="' + reference + '" t="inlineStr"><is><t xml:space="preserve">' +
          escapeXml(value) + '</t></is></c>';
      }).join('');
      return '<row r="' + String(rowIndex + 1) + '">' + cells + '</row>';
    }).join('');
    const worksheetXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData>' + worksheetRows + '</sheetData></worksheet>';
    const workbookXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + escapeXml(sheetName) + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const files = {
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>'
      ),
      '_rels/.rels': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'
      ),
      'xl/workbook.xml': strToU8(workbookXml),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>'
      ),
      'xl/worksheets/sheet1.xml': strToU8(worksheetXml),
    };
    const workbookBytes = zipSync(files);
    const workbookBlob = new Blob([workbookBytes.buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const downloadUrl = URL.createObjectURL(workbookBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  };

  // Filtered Leave Requests
  const filteredRequests = data.leaveRequests.filter((r) => {
    if (selectedEmp && String(r.employeeId) !== selectedEmp) return false;
    if (selectedType && String(r.leaveTypeId) !== selectedType) return false;
    if (selectedDept) {
      const emp = empMap.get(r.employeeId);
      if (emp?.departmentName !== selectedDept) return false;
    }
    if (startDate && r.startDate < startDate) return false;
    if (endDate && r.endDate > endDate) return false;
    return true;
  });

  // Unique Departments
  const departments = Array.from(
    new Set(data.employees.map((e) => e.departmentName).filter(Boolean))
  );

  const approvedTotal = filteredRequests.filter((r) => r.finalStatus === 'APPROVED').length;
  const pendingTotal = filteredRequests.filter((r) => r.finalStatus === 'PENDING').length;
  const rejectedTotal = filteredRequests.filter((r) => r.finalStatus === 'REJECTED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${MT_COLOR_CARDS.indigo} p-6`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 border border-indigo-300 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">
              <span>Reports & Management Information System (MIS)</span>
            </h1>
            <p className="text-xs text-slate-700 mt-0.5">
              Real-time multi-dimensional organizational reports, analytics, and CSV exports.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] sm:min-h-0 bg-white border border-indigo-300 rounded-xl sm:rounded-lg text-xs font-semibold text-indigo-900 hover:bg-indigo-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-700' : 'text-indigo-700'}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* MIS KPI Summary Strip — Distinct Semantic Coloured Cards + 5px Top Strips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className={`${MT_COLOR_CARDS.sky} p-4 flex items-center justify-between`}>
          <div>
            <span className="text-[11px] font-bold text-sky-900 uppercase tracking-wider block">Matching Records</span>
            <span className="text-xl font-bold text-neutral-900 mt-0.5 block">{filteredRequests.length}</span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${MT_THEME.badge.info}`}>Filtered</span>
        </div>
        <div className={`${MT_COLOR_CARDS.emerald} p-4 flex items-center justify-between`}>
          <div>
            <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block">Approved</span>
            <span className="text-xl font-bold text-emerald-800 mt-0.5 block">{approvedTotal}</span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${MT_THEME.badge.success}`}>Authorized</span>
        </div>
        <div className={`${MT_COLOR_CARDS.amber} p-4 flex items-center justify-between`}>
          <div>
            <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">Pending Action</span>
            <span className="text-xl font-bold text-amber-800 mt-0.5 block">{pendingTotal}</span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${MT_THEME.badge.warning}`}>In Queue</span>
        </div>
        <div className={`${MT_COLOR_CARDS.rose} p-4 flex items-center justify-between`}>
          <div>
            <span className="text-[11px] font-bold text-rose-900 uppercase tracking-wider block">Rejected</span>
            <span className="text-xl font-bold text-rose-800 mt-0.5 block">{rejectedTotal}</span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${MT_THEME.badge.danger}`}>Closed</span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className={`flex items-center gap-1.5 ${MT_COLOR_CARDS.slate} p-1.5 overflow-x-auto no-scrollbar`}>
        {[
          { id: 'employee', label: '1. Employee Leaves' },
          { id: 'department', label: '2. Department Leaves' },
          { id: 'leave-type', label: '3. Leave Type Summary' },
          { id: 'monthly', label: '4. Monthly Summary' },
          { id: 'pending', label: '5. Pending Approvals' },
          { id: 'balances', label: '6. Leave Balances' },
          { id: 'holidays', label: '7. Holiday Calendar' },
          { id: 'shifts', label: '8. Shift Roster' },
          { id: 'overtime', label: '9. Overtime Summary' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as ReportTab)}
            className={`px-3.5 py-2 min-h-[44px] sm:min-h-0 text-xs font-bold whitespace-nowrap rounded-lg transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-red-700 text-white shadow-xs'
                : 'text-neutral-600 hover:text-red-700 hover:bg-red-50/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Global Filters */}
      <div className={`grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-3 ${MT_COLOR_CARDS.slate} p-4 text-xs`}>
        <div className="flex items-center gap-1.5 text-slate-800 font-bold">
          <Filter className="w-3.5 h-3.5 text-indigo-700" />
          <span>Filters:</span>
        </div>

        {/* Department Filter */}
        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-700"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* Employee Filter */}
        <div className="flex items-center gap-1.5">
          <select
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-700"
          >
            <option value="">All Employees</option>
            {data.employees.map((emp: any) => (
              <option key={emp.id} value={emp.id}>
                {emp.employeeCode} — {emp.fullName || emp.employeeName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim()} — {emp.departmentName || 'General'}
              </option>
            ))}
          </select>
          {selectedEmp && (
            <Employee360Link
              employeeId={selectedEmp}
              variant="button"
              showIcon
            >
              360°
            </Employee360Link>
          )}
        </div>

        {/* Leave Type Filter */}
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-700"
        >
          <option value="">All Leave Types</option>
          {data.leaveTypes.map((lt: any) => (
            <option key={lt.id} value={lt.id}>
              {lt.code || lt.leaveCode} - {lt.name || lt.leaveName}
            </option>
          ))}
        </select>

        {/* Date From */}
        <div className="flex items-center gap-1">
          <span className="text-neutral-500">From:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1 border border-neutral-200 rounded-lg text-neutral-700 bg-white"
          />
        </div>

        {/* Date To */}
        <div className="flex items-center gap-1">
          <span className="text-neutral-500">To:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-1 border border-neutral-200 rounded-lg text-neutral-700 bg-white"
          />
        </div>

        {(selectedDept || selectedEmp || selectedType || startDate || endDate) && (
          <button
            onClick={() => {
              setSelectedDept('');
              setSelectedEmp('');
              setSelectedType('');
              setStartDate('');
              setEndDate('');
            }}
            className="text-neutral-500 hover:text-neutral-800 underline font-medium cursor-pointer ml-auto"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* TAB CONTENT */}

      {/* 1. EMPLOYEE LEAVE REPORT */}
      {activeTab === 'employee' && (
        <div className={`${MT_COLOR_CARDS.sky} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-sky-950">
              Employee Leave Records ({filteredRequests.length} results)
            </h2>
            <button
              onClick={() => {
                const header = [
                  'Request #',
                  'Employee ID',
                  'Employee Name',
                  'Department',
                  'Leave Type',
                  'Day Type',
                  'Start Date',
                  'End Date',
                  'Days',
                  'Team Leader Status',
                  'HR Status',
                  'Management Status',
                  'Final Status',
                ];
                const rows = filteredRequests.map((r) => {
                  const emp = empMap.get(r.employeeId);
                  return [
                    r.requestNumber,
                    emp?.employeeCode || r.employeeId,
                    r.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim(),
                    emp?.departmentName || 'General',
                    r.leaveTypeName || r.leaveTypeCode,
                    r.dayType || 'FULL_DAY',
                    formatDate(r.startDate),
                    formatDate(r.endDate),
                    r.totalDays,
                    r.teamLeaderDecision || 'PENDING',
                    r.hrDecision,
                    r.managementDecision,
                    r.finalStatus,
                  ];
                });
                exportToExcel('Employee_Leave_Report', [header, ...rows]);
              }}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] sm:min-h-0 bg-red-700 text-white rounded-xl sm:rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to Excel</span>
            </button>
          </div>

          {/* Mobile Employee Leave Report Cards (<768px) */}
          <div id="reports-employee-mobile-cards" className="md:hidden space-y-2.5">
            {filteredRequests.map((r) => {
              const emp = empMap.get(r.employeeId);
              return (
                <div
                  key={`mobile-rep-emp-${r.id}`}
                  className={`${getStatusCardClasses(r.finalStatus)} p-3.5 space-y-2 text-xs`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-[11px] font-bold text-slate-800 bg-white border border-slate-300 px-2 py-0.5 rounded">
                        {r.requestNumber}
                      </span>
                      <div className="font-bold text-neutral-900 mt-1 break-words">
                        <Employee360Link
                          employeeId={r.employeeId}
                          employeeCode={r.employeeCode || emp?.employeeCode}
                          employeeName={r.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName}
                        >
                          {r.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim()}
                        </Employee360Link>
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {r.employeeCode || emp?.employeeCode} &bull; {emp?.departmentName || 'General'}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${getStatusBadgeClasses(
                        r.finalStatus
                      )}`}
                    >
                      {r.finalStatus}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-neutral-700 pt-1 border-t border-neutral-200/70">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getLeaveTypeBadgeClasses(
                        r.leaveTypeCode || r.leaveTypeName
                      )}`}
                    >
                      {r.leaveTypeName || r.leaveTypeCode}
                    </span>
                    <span className="font-mono font-bold">
                      {r.totalDays} Days {r.dayType === 'HALF_DAY' ? '(Half)' : ''}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 font-mono">
                    {formatDate(r.startDate)} to {formatDate(r.endDate)}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-[10px] pt-1">
                    <div className="p-1.5 rounded bg-white border border-neutral-200 text-center">
                      <span className="block text-neutral-500">TL</span>
                      <span className="font-bold text-neutral-800">{r.teamLeaderDecision || 'PENDING'}</span>
                    </div>
                    <div className="p-1.5 rounded bg-white border border-neutral-200 text-center">
                      <span className="block text-neutral-500">HR</span>
                      <span className="font-bold text-neutral-800">{r.hrDecision}</span>
                    </div>
                    <div className="p-1.5 rounded bg-white border border-neutral-200 text-center">
                      <span className="block text-neutral-500">Mgmt</span>
                      <span className="font-bold text-neutral-800">{r.managementDecision}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Employee Leave Report Table (>=768px) */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="px-3 py-2.5">Request #</th>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Leave Type</th>
                  <th className="px-3 py-2.5">Dates</th>
                  <th className="px-3 py-2.5 text-right">Days</th>
                  <th className="px-3 py-2.5">Team Leader</th>
                  <th className="px-3 py-2.5">HR Review</th>
                  <th className="px-3 py-2.5">Management</th>
                  <th className="px-3 py-2.5">Final Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredRequests.map((r) => {
                  const emp = empMap.get(r.employeeId);
                  return (
                    <tr key={r.id} className="hover:bg-neutral-50/50">
                      <td className="px-3 py-2.5 font-mono font-medium text-neutral-800">
                        {r.requestNumber}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-neutral-900">
                        <div>
                          <Employee360Link
                            employeeId={r.employeeId}
                            employeeCode={r.employeeCode || emp?.employeeCode}
                            employeeName={r.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName}
                          >
                            {r.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim()}
                          </Employee360Link>
                        </div>
                        {(r.employeeCode || emp?.employeeCode) && (
                          <div className="mt-0.5">
                            <Employee360Link
                              employeeId={r.employeeId}
                              employeeCode={r.employeeCode || emp?.employeeCode}
                              employeeName={r.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName}
                              variant="badge"
                            >
                              {r.employeeCode || emp?.employeeCode}
                            </Employee360Link>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600">{emp?.departmentName || '-'}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold ${getLeaveTypeBadgeClasses(
                            r.leaveTypeCode || r.leaveTypeName
                          )}`}
                        >
                          {r.leaveTypeName || r.leaveTypeCode}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600">
                        {formatDate(r.startDate)} to {formatDate(r.endDate)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-neutral-800">
                        {r.totalDays} {r.dayType === 'HALF_DAY' ? '(Half)' : ''}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getStatusBadgeClasses(
                            r.teamLeaderDecision || 'PENDING'
                          )}`}
                        >
                          {r.teamLeaderDecision || 'PENDING'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getStatusBadgeClasses(
                            r.hrDecision
                          )}`}
                        >
                          {r.hrDecision}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getStatusBadgeClasses(
                            r.managementDecision
                          )}`}
                        >
                          {r.managementDecision}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${getStatusBadgeClasses(
                            r.finalStatus
                          )}`}
                        >
                          {r.finalStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. DEPARTMENT LEAVE REPORT */}
      {activeTab === 'department' && (
        <div className={`${MT_COLOR_CARDS.indigo} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-indigo-950">Department Leave Breakdown</h2>
            <button
              onClick={() => {
                const header = ['Department', 'Total Applications', 'Approved Leaves', 'Total Leave Days'];
                const deptMap: Record<string, { total: number; approved: number; days: number }> = {};
                for (const r of filteredRequests) {
                  const emp = empMap.get(r.employeeId);
                  const dept = emp?.departmentName || 'General';
                  if (!deptMap[dept]) deptMap[dept] = { total: 0, approved: 0, days: 0 };
                  deptMap[dept].total += 1;
                  if (r.finalStatus === 'APPROVED') {
                    deptMap[dept].approved += 1;
                    deptMap[dept].days += Number(r.totalDays || 1);
                  }
                }
                const rows = Object.entries(deptMap).map(([dept, data]) => [
                  dept,
                  data.total,
                  data.approved,
                  data.days,
                ]);
                exportToExcel('Department_Leave_Report', [header, ...rows]);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5 text-right">Total Requests</th>
                  <th className="px-4 py-2.5 text-right">Approved Requests</th>
                  <th className="px-4 py-2.5 text-right">Total Approved Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {(() => {
                  const deptMap: Record<string, { total: number; approved: number; days: number }> = {};
                  for (const r of filteredRequests) {
                    const emp = empMap.get(r.employeeId);
                    const dept = emp?.departmentName || 'General';
                    if (!deptMap[dept]) deptMap[dept] = { total: 0, approved: 0, days: 0 };
                    deptMap[dept].total += 1;
                    if (r.finalStatus === 'APPROVED') {
                      deptMap[dept].approved += 1;
                      deptMap[dept].days += Number(r.totalDays || 1);
                    }
                  }
                  return Object.entries(deptMap).map(([dept, val]) => (
                    <tr key={dept} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-2.5 font-bold text-neutral-900">{dept}</td>
                      <td className="px-4 py-2.5 text-right text-neutral-700">{val.total}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">
                        {val.approved}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-neutral-900">
                        {val.days.toFixed(1)}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. LEAVE TYPE SUMMARY */}
      {activeTab === 'leave-type' && (
        <div className={`${MT_COLOR_CARDS.teal} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-teal-950">Leave Type Consumption Summary</h2>
            <button
              onClick={() => {
                const header = ['Leave Code', 'Leave Name', 'Paid', 'Total Applications', 'Days Taken'];
                const ltMap: Record<string, { name: string; paid: boolean; count: number; days: number }> = {};
                for (const lt of data.leaveTypes as any[]) {
                  ltMap[lt.id] = { name: lt.name || lt.leaveName, paid: lt.isPaid, count: 0, days: 0 };
                }
                for (const r of filteredRequests) {
                  if (ltMap[r.leaveTypeId]) {
                    ltMap[r.leaveTypeId].count += 1;
                    if (r.finalStatus === 'APPROVED') {
                      ltMap[r.leaveTypeId].days += Number(r.totalDays || 1);
                    }
                  }
                }
                const rows = Object.entries(ltMap).map(([id, val]) => [
                  id,
                  val.name,
                  val.paid ? 'Yes' : 'No',
                  val.count,
                  val.days,
                ]);
                exportToExcel('Leave_Type_Summary', [header, ...rows]);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-2.5">Leave Code</th>
                  <th className="px-4 py-2.5">Leave Name</th>
                  <th className="px-4 py-2.5 text-center">Type</th>
                  <th className="px-4 py-2.5 text-right">Requests</th>
                  <th className="px-4 py-2.5 text-right">Days Consumed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {data.leaveTypes.map((lt) => {
                  const reqs = filteredRequests.filter((r) => r.leaveTypeId === lt.id);
                  const days = reqs
                    .filter((r) => r.finalStatus === 'APPROVED')
                    .reduce((acc, curr) => acc + Number(curr.totalDays || 1), 0);
                  const ltCode = (lt as any).code || lt.leaveCode;
                  const ltName = (lt as any).name || lt.leaveName;
                  return (
                    <tr key={lt.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${getLeaveTypeBadgeClasses(
                            ltCode || ltName
                          )}`}
                        >
                          {ltCode}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-700 font-medium">{ltName}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            lt.isPaid ? MT_THEME.badge.success : MT_THEME.badge.neutral
                          }`}
                        >
                          {lt.isPaid ? 'PAID' : 'UNPAID'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-neutral-600">{reqs.length}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-neutral-900">
                        <div className="flex items-center justify-end gap-2">
                          <span>{days.toFixed(1)}</span>
                          <div className="w-16 h-1.5 rounded-full bg-neutral-200/70 overflow-hidden hidden sm:block">
                            <div
                              className={`h-full rounded-full ${getLeaveTypeBarColor(ltCode || ltName)}`}
                              style={{ width: `${Math.min(100, days * 8)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. MONTHLY SUMMARY */}
      {activeTab === 'monthly' && (
        <div className={`${MT_COLOR_CARDS.cyan} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-cyan-950">Monthly Leave Distribution</h2>
            <button
              onClick={() => {
                const header = ['Year-Month', 'Total Applications', 'Approved Leaves', 'Total Days'];
                const monthMap: Record<string, { total: number; approved: number; days: number }> = {};
                for (const r of filteredRequests) {
                  const ym = r.startDate.slice(0, 7);
                  if (!monthMap[ym]) monthMap[ym] = { total: 0, approved: 0, days: 0 };
                  monthMap[ym].total += 1;
                  if (r.finalStatus === 'APPROVED') {
                    monthMap[ym].approved += 1;
                    monthMap[ym].days += Number(r.totalDays || 1);
                  }
                }
                const rows = Object.entries(monthMap).map(([ym, d]) => [
                  ym,
                  d.total,
                  d.approved,
                  d.days,
                ]);
                exportToExcel('Monthly_Leave_Summary', [header, ...rows]);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-2.5">Year - Month</th>
                  <th className="px-4 py-2.5 text-right">Total Requests</th>
                  <th className="px-4 py-2.5 text-right">Approved Requests</th>
                  <th className="px-4 py-2.5 text-right">Total Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {(() => {
                  const monthMap: Record<string, { total: number; approved: number; days: number }> = {};
                  for (const r of filteredRequests) {
                    const ym = r.startDate ? r.startDate.slice(0, 7) : 'Unknown';
                    if (!monthMap[ym]) monthMap[ym] = { total: 0, approved: 0, days: 0 };
                    monthMap[ym].total += 1;
                    if (r.finalStatus === 'APPROVED') {
                      monthMap[ym].approved += 1;
                      monthMap[ym].days += Number(r.totalDays || 1);
                    }
                  }
                  return Object.entries(monthMap)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([ym, val]) => (
                      <tr key={ym} className="hover:bg-neutral-50/50">
                        <td className="px-4 py-2.5 font-bold text-neutral-900">{ym}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-700">{val.total}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">
                          {val.approved}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-neutral-900">
                          {val.days.toFixed(1)}
                        </td>
                      </tr>
                    ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. PENDING APPROVALS */}
      {activeTab === 'pending' && (
        <div className={`${MT_COLOR_CARDS.amber} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-amber-950">Pending Decision Queue</h2>
            <button
              onClick={() => {
                const header = [
                  'Request #',
                  'Employee',
                  'Department',
                  'Leave Type',
                  'Dates',
                  'Days',
                  'Pending Authority',
                ];
                const pendings = filteredRequests.filter((r) => r.finalStatus === 'PENDING');
                const rows = pendings.map((r) => {
                  const emp = empMap.get(r.employeeId);
                  const auth =
                    (r.teamLeaderDecision || 'PENDING') === 'PENDING'
                      ? 'Pending Team Leader (Stage 1)'
                      : r.hrDecision === 'PENDING' && r.managementDecision === 'PENDING'
                      ? 'Pending HR (Stage 2)'
                      : 'Top Management Decision (Stage 3)';
                  return [
                    r.requestNumber,
                    r.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim(),
                    emp?.departmentName || 'General',
                    r.leaveTypeName || r.leaveTypeCode,
                    `${formatDate(r.startDate)} to ${formatDate(r.endDate)}`,
                    r.totalDays,
                    auth,
                  ];
                });
                exportToExcel('Pending_Approvals_Report', [header, ...rows]);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="px-3 py-2.5">Request #</th>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Leave Type</th>
                  <th className="px-3 py-2.5">Dates</th>
                  <th className="px-3 py-2.5 text-right">Days</th>
                  <th className="px-3 py-2.5">Awaiting Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredRequests
                  .filter((r) => r.finalStatus === 'PENDING')
                  .map((r) => {
                    const emp = empMap.get(r.employeeId);
                    return (
                      <tr key={r.id} className="hover:bg-neutral-50/50">
                        <td className="px-3 py-2.5 font-mono font-medium text-neutral-800">
                          {r.requestNumber}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-neutral-900">
                          <div>
                            <Employee360Link
                              employeeId={r.employeeId}
                              employeeCode={r.employeeCode || emp?.employeeCode}
                              employeeName={r.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName}
                            >
                              {r.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim()}
                            </Employee360Link>
                          </div>
                          {(r.employeeCode || emp?.employeeCode) && (
                            <div className="mt-0.5">
                              <Employee360Link
                                employeeId={r.employeeId}
                                employeeCode={r.employeeCode || emp?.employeeCode}
                                employeeName={r.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName}
                                variant="badge"
                              >
                                {r.employeeCode || emp?.employeeCode}
                              </Employee360Link>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-neutral-600">{emp?.departmentName || '-'}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded font-semibold ${getLeaveTypeBadgeClasses(
                              r.leaveTypeCode || r.leaveTypeName
                            )}`}
                          >
                            {r.leaveTypeName || r.leaveTypeCode}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-neutral-600">
                          {formatDate(r.startDate)} to {formatDate(r.endDate)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-neutral-800">
                          {r.totalDays}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${MT_THEME.badge.pending}`}>
                            {(r.teamLeaderDecision || 'PENDING') === 'PENDING'
                              ? 'Pending Team Leader (Stage 1)'
                              : r.hrDecision === 'PENDING' && r.managementDecision === 'PENDING'
                              ? 'Pending HR (Stage 2)'
                              : 'Top Management Decision (Stage 3)'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. LEAVE BALANCES */}
      {activeTab === 'balances' && (
        <div className={`${MT_COLOR_CARDS.sky} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-sky-950">Employee Leave Balance Ledger</h2>
            <button
              onClick={() => {
                const header = [
                  'Employee Code',
                  'Employee Name',
                  'Department',
                  'Leave Type',
                  'Year',
                  'Allocated',
                  'Used',
                  'Available',
                  'Carried Forward',
                ];
                const rows = data.balances.map((b) => {
                  const emp = empMap.get(b.employeeId);
                  return [
                    emp?.employeeCode || b.employeeId,
                    (emp as any)?.fullName || (emp as any)?.employeeName || (emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : `EMP #${b.employeeId}`),
                    emp?.departmentName || 'General',
                    b.leaveTypeCode || b.leaveTypeId,
                    b.year,
                    b.allocated,
                    b.used,
                    b.available,
                    (b as any).carryForward ?? b.carriedForward ?? '0.00',
                  ];
                });
                exportToExcel('Leave_Balance_Ledger', [header, ...rows]);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Leave Type</th>
                  <th className="px-3 py-2.5 text-right">Year</th>
                  <th className="px-3 py-2.5 text-right">Allocated</th>
                  <th className="px-3 py-2.5 text-right">Used</th>
                  <th className="px-3 py-2.5 text-right">Available</th>
                  <th className="px-3 py-2.5 text-right">Carried Fwd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {data.balances.map((b) => {
                  const emp = empMap.get(b.employeeId);
                  return (
                    <tr key={b.id} className="hover:bg-neutral-50/50">
                      <td className="px-3 py-2.5 font-semibold text-neutral-900">
                        <div>
                          <Employee360Link
                            employeeId={b.employeeId}
                            employeeCode={b.employeeCode || emp?.employeeCode}
                            employeeName={(emp as any)?.fullName || (emp as any)?.employeeName}
                          >
                            {(emp as any)?.fullName || (emp as any)?.employeeName || (emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : `EMP #${b.employeeId}`)}
                          </Employee360Link>
                        </div>
                        {(b.employeeCode || emp?.employeeCode) && (
                          <div className="mt-0.5">
                            <Employee360Link
                              employeeId={b.employeeId}
                              employeeCode={b.employeeCode || emp?.employeeCode}
                              employeeName={(emp as any)?.fullName || (emp as any)?.employeeName}
                              variant="badge"
                            >
                              {b.employeeCode || emp?.employeeCode}
                            </Employee360Link>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600">{emp?.departmentName || '-'}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold ${getLeaveTypeBadgeClasses(
                            b.leaveTypeCode
                          )}`}
                        >
                          {b.leaveTypeCode || `TYPE-${b.leaveTypeId}`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-neutral-600">{b.year}</td>
                      <td className="px-3 py-2.5 text-right text-neutral-700">{b.allocated}</td>
                      <td className="px-3 py-2.5 text-right text-neutral-700">{b.used}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                        {b.available}
                      </td>
                      <td className="px-3 py-2.5 text-right text-neutral-500">{(b as any).carryForward ?? b.carriedForward ?? '0.00'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. HOLIDAYS */}
      {activeTab === 'holidays' && (
        <div className={`${MT_COLOR_CARDS.emerald} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-emerald-950">Official Holiday Schedule</h2>
            <button
              onClick={() => {
                const header = ['Date', 'Holiday Name', 'Type', 'Scope', 'Half Day'];
                const rows = data.holidays.map((h) => [
                  formatDate(h.holidayDate),
                  h.holidayName,
                  h.holidayType || 'Public',
                  h.departmentName || (h.departmentId ? `Dept #${h.departmentId}` : 'All Departments'),
                  h.isHalfDay ? 'Yes' : 'No',
                ]);
                exportToExcel('Holiday_Calendar_Report', [header, ...rows]);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Holiday Name</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Scope</th>
                  <th className="px-4 py-2.5">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {data.holidays.map((h) => (
                  <tr key={h.id} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-2.5 font-mono font-medium text-neutral-900">
                      {formatDate(h.holidayDate)}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-neutral-800">{h.holidayName}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded bg-neutral-100 font-medium">
                        {h.holidayType || 'Public'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">
                      {h.departmentName || (h.departmentId ? `Dept #${h.departmentId}` : 'All Departments')}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">
                      {h.isHalfDay ? 'Half Day' : 'Full Day'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. SHIFT ROSTER */}
      {activeTab === 'shifts' && (
        <div className={`${MT_COLOR_CARDS.sky} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-sky-950">Configured Official Shifts Master</h2>
            <button
              onClick={() => {
                const header = [
                  'Shift Code',
                  'Shift Name',
                  'Timing',
                  'Duty Hours',
                  'Is Overnight',
                  'Configured',
                ];
                const rows = (data.shifts as any[]).map((s) => {
                  const segs = s.segments || [];
                  const timingStr = segs.length > 0
                    ? segs.map((seg: any) => `${seg.startTime}-${seg.endTime}`).join(', ')
                    : (s.startTime && s.endTime ? `${s.startTime} - ${s.endTime}` : 'Unconfigured');
                  const isOvernight = segs.some((seg: any) => seg.crossesMidnight) || Boolean(s.isOvernight);
                  return [
                    s.shiftCode,
                    s.shiftName,
                    timingStr,
                    s.totalScheduledHours ?? s.dutyHours ?? 0,
                    isOvernight ? 'Yes' : 'No',
                    s.timingConfigured ? 'Yes' : 'No',
                  ];
                });
                exportToExcel('Shift_Roster_Report', [header, ...rows]);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Schedule Timing</th>
                  <th className="px-4 py-2.5 text-right">Duty Hours</th>
                  <th className="px-4 py-2.5 text-center">Overnight</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {(data.shifts as any[]).map((s) => {
                  const segs = s.segments || [];
                  const timingStr = segs.length > 0
                    ? segs.map((seg: any) => `${seg.startTime} - ${seg.endTime}`).join(' | ')
                    : (s.startTime && s.endTime ? `${s.startTime} - ${s.endTime}` : 'Unconfigured');
                  const isOvernight = segs.some((seg: any) => seg.crossesMidnight) || Boolean(s.isOvernight);
                  return (
                  <tr key={s.id} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-2.5 font-bold font-mono text-neutral-900">
                      {s.shiftCode}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-neutral-800">{s.shiftName}</td>
                    <td className="px-4 py-2.5 text-neutral-600">
                      {timingStr}
                    </td>
                    <td className="px-4 py-2.5 text-right text-neutral-700">{s.totalScheduledHours ?? s.dutyHours ?? 0} hrs</td>
                    <td className="px-4 py-2.5 text-center">
                      {isOvernight ? (
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">
                          YES
                        </span>
                      ) : (
                        'No'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusBadgeClasses(
                          s.timingConfigured ? 'READY' : 'UNCONFIGURED'
                        )}`}
                      >
                        {s.timingConfigured ? 'READY' : 'UNCONFIGURED'}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. OVERTIME */}
      {activeTab === 'overtime' && (
        <div className={`${MT_COLOR_CARDS.purple} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-purple-950">Overtime Utilization Report</h2>
            <button
              onClick={() => {
                const header = [
                  'Request #',
                  'Employee',
                  'Overtime Date',
                  'Hours',
                  'Rate Multiplier',
                  'Status',
                ];
                const rows = (data.overtimeRequests as any[]).map((ot) => {
                  const emp = empMap.get(ot.employeeId);
                  return [
                    ot.requestNumber || `OT-${ot.id}`,
                    (emp as any)?.fullName || (emp as any)?.employeeName || (emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : ot.employeeId),
                    formatDate(ot.overtimeDate || ot.date),
                    ot.requestedHours ?? ot.hours ?? ot.overtimeHours,
                    ot.rateMultiplier ?? '1.5',
                    ot.status,
                  ];
                });
                exportToExcel('Overtime_Summary_Report', [header, ...rows]);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="px-3 py-2.5">Request #</th>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5 text-right">Hours</th>
                  <th className="px-3 py-2.5 text-center">Rate</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {data.overtimeRequests.length > 0 ? (
                  (data.overtimeRequests as any[]).map((ot) => {
                    const emp = empMap.get(ot.employeeId);
                    return (
                      <tr key={ot.id} className="hover:bg-neutral-50/50">
                        <td className="px-3 py-2.5 font-mono font-medium text-neutral-800">
                          {ot.requestNumber || `OT-${ot.id}`}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-neutral-900">
                          <div>
                            <Employee360Link
                              employeeId={ot.employeeId}
                              employeeCode={ot.employeeCode || emp?.employeeCode}
                              employeeName={ot.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName}
                            >
                              {ot.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName || (emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : `EMP #${ot.employeeId}`)}
                            </Employee360Link>
                          </div>
                          {(ot.employeeCode || emp?.employeeCode) && (
                            <div className="mt-0.5">
                              <Employee360Link
                                employeeId={ot.employeeId}
                                employeeCode={ot.employeeCode || emp?.employeeCode}
                                employeeName={ot.employeeName || (emp as any)?.fullName || (emp as any)?.employeeName}
                                variant="badge"
                              >
                                {ot.employeeCode || emp?.employeeCode}
                              </Employee360Link>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-neutral-600">{formatDate(ot.overtimeDate || ot.date)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-neutral-900">
                          {ot.requestedHours ?? ot.hours ?? ot.overtimeHours} hrs
                        </td>
                        <td className="px-3 py-2.5 text-center text-neutral-600">
                          {ot.rateMultiplier ?? '1.5'}x
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusBadgeClasses(
                              ot.status
                            )}`}
                          >
                            {ot.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-neutral-500 max-w-xs truncate" title={ot.reason}>
                          {ot.reason || '-'}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-neutral-500">
                      No overtime records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
