import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, Download, RefreshCw, Search } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'POST_START' | 'HALF_DAY' | 'WEEKLY_OFF' | 'HOLIDAY' | 'ON_LEAVE';
type Employee = { id: number; employeeCode?: string; employeeId?: string; employeeName?: string; fullName?: string; role?: string };
type AttendanceRow = { id?: number; employeeId: number; employeeCode?: string; employeeName?: string; attendanceDate: string; status: AttendanceStatus; remarks?: string | null };
const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', POST_START: 'Post Start', HALF_DAY: 'Half Day',
  WEEKLY_OFF: 'Weekly Off', HOLIDAY: 'Holiday', ON_LEAVE: 'On Leave',
};
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => localDate(new Date());
const firstOfMonth = () => today().slice(0, 8) + '01';
const fieldClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const statusClass: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-700', ABSENT: 'bg-rose-50 text-rose-700', LATE: 'bg-amber-50 text-amber-800',
  POST_START: 'bg-orange-50 text-orange-700', HALF_DAY: 'bg-violet-50 text-violet-700', WEEKLY_OFF: 'bg-slate-100 text-slate-700',
  HOLIDAY: 'bg-sky-50 text-sky-700', ON_LEAVE: 'bg-indigo-50 text-indigo-700',
};

export function AttendanceHistoryDashboard() {
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(today());
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!fromDate || !toDate || fromDate > toDate) { setMessage('Please select a valid date range.'); return; }
    const start = new Date(fromDate + 'T12:00:00');
    const end = new Date(toDate + 'T12:00:00');
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (days > 366) { setMessage('Please select a date range of 366 days or less.'); return; }
    setLoading(true); setMessage('');
    try {
      const dates: string[] = [];
      for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(d.getDate() + i); dates.push(localDate(d)); }
      const allRecords: AttendanceRow[] = [];
      let employeeList: Employee[] = [];
      for (let i = 0; i < dates.length; i += 7) {
        const batch = await Promise.all(dates.slice(i, i + 7).map(async date => {
          const response = await apiFetch('/api/attendance?date=' + encodeURIComponent(date), { cache: 'no-store' });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Unable to load attendance history.');
          return data;
        }));
        for (const data of batch) {
          if (Array.isArray(data.employees)) employeeList = data.employees;
          if (Array.isArray(data.records)) allRecords.push(...data.records);
        }
      }
      setEmployees(employeeList.filter(e => (e.role || '').toUpperCase() !== 'SUPER_ADMIN')
        .sort((a, b) => String(a.employeeCode || a.employeeId || '').localeCompare(String(b.employeeCode || b.employeeId || ''), undefined, { numeric: true, sensitivity: 'base' })));
      setRecords(allRecords.filter(r => r.attendanceDate >= fromDate && r.attendanceDate <= toDate));
      setMessage('Loaded attendance records for ' + days + ' calendar day(s).');
    } catch (error: any) { setRecords([]); setMessage(error?.message || 'Unable to load attendance history.'); }
    finally { setLoading(false); }
  }, [fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const employeeById = new Map(employees.map(e => [Number(e.id), e]));
    return records.map(r => {
      const employee = employeeById.get(Number(r.employeeId));
      return { ...r, employeeCode: r.employeeCode || employee?.employeeCode || employee?.employeeId || '', employeeName: r.employeeName || employee?.employeeName || employee?.fullName || 'Employee' };
    }).filter(r => employeeFilter === 'all' || String(r.employeeId) === employeeFilter)
      .filter(r => statusFilter === 'all' || r.status === statusFilter)
      .filter(r => (String(r.employeeName) + ' ' + String(r.employeeCode)).toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate) || String(a.employeeCode).localeCompare(String(b.employeeCode), undefined, { numeric: true, sensitivity: 'base' }));
  }, [records, employees, employeeFilter, statusFilter, search]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { total: filtered.length };
    for (const row of filtered) result[row.status] = (result[row.status] || 0) + 1;
    return result;
  }, [filtered]);

  const exportExcel = () => {
    const escape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rows = [['Employee Code', 'Employee Name', 'Date', 'Attendance Status', 'Remarks'], ...filtered.map(r => [r.employeeCode, r.employeeName, r.attendanceDate, STATUS_LABELS[r.status] || r.status, r.remarks || ''])];
    const html = '<html><head><meta charset="UTF-8"></head><body><table>' + rows.map((row, i) => '<tr>' + row.map(v => '<td' + (i === 0 ? ' style="font-weight:bold"' : '') + '>' + escape(v) + '</td>').join('') + '</tr>').join('') + '</table></body></html>';
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'attendance-history-' + fromDate + '-to-' + toDate + '.xls'; a.click(); URL.revokeObjectURL(url);
  };

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex items-center gap-2"><CalendarRange className="h-5 w-5 text-blue-700" /><h3 className="text-lg font-bold text-slate-900">Attendance History Dashboard</h3></div><p className="mt-1 text-sm text-slate-500">Choose a date range to review each employee’s recorded attendance by date and status.</p></div>
      <div className="flex gap-2"><button onClick={() => void load()} disabled={loading} className={fieldClass}><RefreshCw className="mr-1 inline h-4 w-4" />Refresh</button><button onClick={exportExcel} disabled={!filtered.length} className={fieldClass}><Download className="mr-1 inline h-4 w-4" />Export Excel</button></div>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-1 text-xs font-semibold text-slate-600">From date<input type="date" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)} className={fieldClass} /></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">To date<input type="date" value={toDate} min={fromDate || undefined} max={today()} onChange={e => setToDate(e.target.value)} className={fieldClass} /></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">Employee<select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)} className={fieldClass}><option value="all">All employees</option>{employees.map(e => <option key={e.id} value={String(e.id)}>{e.employeeName || e.fullName || 'Employee'} ({e.employeeCode || e.employeeId || '—'})</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">Attendance status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={fieldClass}><option value="all">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee name or code" className={fieldClass + ' w-full pl-9'} /></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Records shown</p><p className="mt-1 text-2xl font-bold text-slate-900">{counts.total || 0}</p></div>
      {(['PRESENT', 'ABSENT', 'LATE', 'POST_START'] as AttendanceStatus[]).map(status => <div key={status} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{STATUS_LABELS[status]}</p><p className="mt-1 text-2xl font-bold text-slate-900">{counts[status] || 0}</p></div>)}
    </div>
    {message && <p className="text-sm text-slate-600" role="status">{message}</p>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-[700px] w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Employee Name</th><th className="px-4 py-3">Employee Code</th><th className="px-4 py-3">Attendance Status</th><th className="px-4 py-3">Remarks</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading attendance history…</td></tr> : filtered.length ? filtered.map((r, index) => <tr key={String(r.employeeId) + '-' + r.attendanceDate + '-' + index} className="hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{r.attendanceDate}</td><td className="px-4 py-3 font-semibold text-slate-900">{r.employeeName}</td><td className="px-4 py-3 text-slate-600">{r.employeeCode || '—'}</td><td className="px-4 py-3"><span className={'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ' + (statusClass[r.status] || 'bg-slate-100 text-slate-700')}>{STATUS_LABELS[r.status] || r.status}</span></td><td className="max-w-xs px-4 py-3 text-slate-600">{r.remarks || '—'}</td></tr>) : <tr><td colSpan={5} className="p-8 text-center text-slate-500">{loading ? 'Loading…' : 'No attendance records found for the selected filters and date range.'}</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="text-xs text-slate-500">Only saved attendance entries appear in this history. Employees with a blank status are not counted as marked attendance.</p>
  </section>;
}
