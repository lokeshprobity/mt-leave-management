import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, Download, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'POST_START' | 'HALF_DAY' | 'WEEKLY_OFF' | 'HOLIDAY' | 'ON_LEAVE';
type Employee = { id: number; employeeCode?: string; employeeId?: string; employeeName?: string; fullName?: string; role?: string };
type AttendanceRow = { employeeId: number; employeeCode?: string; employeeName?: string; attendanceDate: string; status: Status; remarks?: string | null };
const LABEL: Record<Status, string> = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', POST_START: 'Post Start', HALF_DAY: 'Half Day', WEEKLY_OFF: 'Weekly Off', HOLIDAY: 'Holiday', ON_LEAVE: 'On Leave' };
const COLORS: Record<Status, string> = { PRESENT: 'bg-emerald-100 text-emerald-800', ABSENT: 'bg-rose-100 text-rose-800', LATE: 'bg-amber-100 text-amber-900', POST_START: 'bg-orange-100 text-orange-800', HALF_DAY: 'bg-violet-100 text-violet-800', WEEKLY_OFF: 'bg-slate-100 text-slate-700', HOLIDAY: 'bg-sky-100 text-sky-800', ON_LEAVE: 'bg-indigo-100 text-indigo-800' };
const dateString = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => dateString(new Date());
const inputClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export function AttendanceHistoryDashboard() {
  const [fromDate, setFromDate] = useState(today().slice(0, 8) + '01');
  const [toDate, setToDate] = useState(today());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');

  const load = useCallback(async () => {
    if (!fromDate || !toDate || fromDate > toDate) { setMessage('Select a valid date range.'); return; }
    const start = new Date(fromDate + 'T12:00:00');
    const end = new Date(toDate + 'T12:00:00');
    const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (dayCount > 62) { setMessage('Select a date range of 62 days or less for the date-by-date grid.'); return; }
    setLoading(true); setMessage('');
    try {
      const dates: string[] = [];
      for (let i = 0; i < dayCount; i++) { const d = new Date(start); d.setDate(d.getDate() + i); dates.push(dateString(d)); }
      const results: any[] = [];
      for (let i = 0; i < dates.length; i += 7) {
        const batch = await Promise.all(dates.slice(i, i + 7).map(async date => {
          const response = await apiFetch('/api/attendance?date=' + encodeURIComponent(date), { cache: 'no-store' });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Unable to load attendance dashboard.');
          return data;
        }));
        results.push(...batch);
      }
      const first = results.find(x => Array.isArray(x.employees));
      const people: Employee[] = (first?.employees || []).filter((e: Employee) => (e.role || '').toUpperCase() !== 'SUPER_ADMIN');
      people.sort((a, b) => String(a.employeeCode || a.employeeId || '').localeCompare(String(b.employeeCode || b.employeeId || ''), undefined, { numeric: true, sensitivity: 'base' }));
      setEmployees(people);
      setRecords(results.flatMap(x => Array.isArray(x.records) ? x.records : []));
      setMessage('Attendance grid loaded for ' + dayCount + ' date(s).');
    } catch (error: any) { setEmployees([]); setRecords([]); setMessage(error?.message || 'Unable to load attendance dashboard.'); }
    finally { setLoading(false); }
  }, [fromDate, toDate]);
  useEffect(() => { void load(); }, [load]);

  const dates = useMemo(() => {
    if (!fromDate || !toDate || fromDate > toDate) return [];
    const start = new Date(fromDate + 'T12:00:00');
    const count = Math.min(62, Math.round((new Date(toDate + 'T12:00:00').getTime() - start.getTime()) / 86400000) + 1);
    return Array.from({ length: Math.max(0, count) }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return dateString(d); });
  }, [fromDate, toDate]);
  const visibleEmployees = useMemo(() => employees.filter(e => ((e.employeeName || e.fullName || '') + ' ' + (e.employeeCode || e.employeeId || '')).toLowerCase().includes(employeeSearch.toLowerCase())), [employees, employeeSearch]);
  const recordMap = useMemo(() => new Map(records.map(r => [String(r.employeeId) + '|' + r.attendanceDate, r])), [records]);
  const statusCounts = useMemo(() => { const out: Record<string, number> = { marked: 0 }; for (const r of records) { out.marked++; out[r.status] = (out[r.status] || 0) + 1; } return out; }, [records]);

  const exportExcel = () => {
    const safe = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\\-@\\t\\r]/.test(s)) s = "'" + s; return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    const rows = [['Employee Code', 'Employee Name', ...dates], ...visibleEmployees.map(e => [e.employeeCode || e.employeeId || '', e.employeeName || e.fullName || '', ...dates.map(d => { const r = recordMap.get(String(e.id) + '|' + d); return r ? LABEL[r.status] || r.status : ''; })])];
    const html = '<html><head><meta charset="UTF-8"></head><body><table>' + rows.map((row, i) => '<tr>' + row.map(v => '<td' + (i === 0 ? ' style="font-weight:bold"' : '') + '>' + safe(v) + '</td>').join('') + '</tr>').join('') + '</table></body></html>';
    const blob = new Blob(['\\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'attendance-matrix-' + fromDate + '-to-' + toDate + '.xls'; a.click(); URL.revokeObjectURL(url);
  };

  return <section className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex items-center gap-2"><CalendarRange className="h-5 w-5 text-blue-700" /><h2 className="text-xl font-bold text-slate-900">Attendance Dashboard</h2></div><p className="mt-1 text-sm text-slate-500">Employees are listed down the left; each date is a column across the top. Select up to 62 days.</p></div>
      <div className="flex gap-2"><button onClick={() => void load()} disabled={loading} className={inputClass}><RefreshCw className="mr-1 inline h-4 w-4" />Refresh</button><button onClick={exportExcel} disabled={!visibleEmployees.length || !dates.length} className={inputClass}><Download className="mr-1 inline h-4 w-4" />Export Excel</button></div>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-semibold text-slate-600">From date<input type="date" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)} className={inputClass} /></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">To date<input type="date" value={toDate} min={fromDate || undefined} max={today()} onChange={e => setToDate(e.target.value)} className={inputClass} /></label>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Marked entries</p><p className="mt-1 text-2xl font-bold">{statusCounts.marked || 0}</p></div>
      {(['PRESENT', 'ABSENT', 'LATE', 'POST_START'] as Status[]).map(s => <div key={s} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{LABEL[s]}</p><p className="mt-1 text-2xl font-bold">{statusCounts[s] || 0}</p></div>)}
    </div>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><input value={employeeSearch} onChange={e => setEmployeeSearch(e.target.value)} placeholder="Search employee name or code" className={inputClass + ' sm:max-w-sm'} /><p className="text-xs text-slate-500">Blank cell = attendance not marked</p></div>
    {message && <p className="text-sm text-slate-600" role="status">{message}</p>}
    <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead><tr><th className="sticky left-0 top-0 z-30 min-w-[220px] border-b border-r border-slate-200 bg-slate-100 px-3 py-3 text-left text-xs font-bold uppercase text-slate-600">Employee Name</th><th className="sticky top-0 z-20 min-w-[90px] border-b border-r border-slate-200 bg-slate-100 px-3 py-3 text-xs font-bold uppercase text-slate-600">Code</th>{dates.map(d => <th key={d} title={d} className="sticky top-0 z-10 min-w-[76px] border-b border-r border-slate-200 bg-slate-100 px-2 py-3 text-center"><div className="text-sm font-bold text-slate-800">{Number(d.slice(8, 10))}</div><div className="text-[10px] font-medium text-slate-500">{d.slice(5, 7)}/{d.slice(2, 4)}</div></th>)}</tr></thead>
        <tbody>{loading ? <tr><td colSpan={dates.length + 2} className="p-8 text-center text-slate-500">Loading attendance matrix…</td></tr> : visibleEmployees.length ? visibleEmployees.map(e => <tr key={e.id} className="hover:bg-slate-50">
          <th className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-3 py-2 text-left font-semibold text-slate-900"><div>{e.employeeName || e.fullName || 'Employee'}</div><div className="text-xs font-normal text-slate-500">{e.employeeCode || e.employeeId || ''}</div></th><td className="border-b border-r border-slate-100 px-3 py-2 text-xs text-slate-500">{e.employeeCode || e.employeeId || '—'}</td>
          {dates.map(d => { const r = recordMap.get(String(e.id) + '|' + d); return <td key={d} title={r ? d + ': ' + LABEL[r.status] + (r.remarks ? ' — ' + r.remarks : '') : d + ': Not marked'} className="border-b border-r border-slate-100 px-1.5 py-2 text-center"><span className={'inline-flex min-w-[68px] justify-center rounded-md px-1.5 py-1 text-[11px] font-semibold ' + (r ? COLORS[r.status] : 'text-slate-300')}>{r ? LABEL[r.status] : '—'}</span></td>; })}
        </tr>) : <tr><td colSpan={dates.length + 2} className="p-8 text-center text-slate-500">No employees found.</td></tr>}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap gap-2 text-xs">{(Object.entries(LABEL) as [Status, string][]).map(([s, label]) => <span key={s} className={'rounded-full px-2.5 py-1 font-semibold ' + COLORS[s]}>{label}</span>)}</div>
  </section>;
}
