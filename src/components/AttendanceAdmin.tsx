import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, RefreshCw, Save } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { AttendanceHistoryDashboard } from './AttendanceHistoryDashboard.tsx';

type Status = '' | 'PRESENT' | 'ABSENT' | 'LATE' | 'POST_START' | 'HALF_DAY' | 'WEEKLY_OFF' | 'HOLIDAY' | 'ON_LEAVE';
type Employee = { id: number; employeeCode?: string; employeeId?: string; employeeName?: string; fullName?: string; role?: string };
type RecordRow = { id?: number; employeeId: number; employeeCode?: string; employeeName?: string; attendanceDate: string; status: Status; checkIn?: string | null; checkOut?: string | null; remarks?: string | null; source?: string };
const STATUSES: { value: Status; label: string }[] = [
  { value: 'PRESENT', label: 'Present' }, { value: 'ABSENT', label: 'Absent' }, { value: 'LATE', label: 'Late' }, { value: 'POST_START', label: 'Post Start (08:30+)' },
  { value: 'HALF_DAY', label: 'Half Day' }, { value: 'WEEKLY_OFF', label: 'Weekly Off' }, { value: 'HOLIDAY', label: 'Holiday' }, { value: 'ON_LEAVE', label: 'On Leave' },
];
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const inputClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
export function AttendanceAdmin({ canManage = true }: { canManage?: boolean }) {
  const [activeView, setActiveView] = useState<'dashboard' | 'input'>('dashboard');
  const [date, setDate] = useState(today());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<Record<number, RecordRow>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setMessage('');
    try {
      const response = await apiFetch('/api/attendance?date=' + encodeURIComponent(date), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load attendance.');
      setEmployees(Array.isArray(data.employees) ? data.employees : []);
      const next: Record<number, RecordRow> = {};
      for (const row of (data.records || []) as RecordRow[]) next[Number(row.employeeId)] = { ...row };
      setRows(next);
    } catch (e: any) { setMessage(e.message || 'Unable to load attendance.'); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);
  const visibleEmployees = useMemo(() => employees.filter(e => (e.role || '').toUpperCase() !== 'SUPER_ADMIN').filter(e => {
    const name = e.employeeName || e.fullName || '';
    const code = e.employeeCode || e.employeeId || '';
    return (name + ' ' + code).toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => String(a.employeeCode || a.employeeId || '').localeCompare(String(b.employeeCode || b.employeeId || ''), undefined, { numeric: true, sensitivity: 'base' })), [employees, search]);
  const update = (employee: Employee, patch: Partial<RecordRow>) => {
    const id = Number(employee.id);
    setRows(prev => {
      const current = prev[id] || { employeeId: id, attendanceDate: date, status: '' as Status, checkIn: null, checkOut: null, remarks: '' };
      return { ...prev, [id]: { ...current, ...patch, employeeId: id, attendanceDate: date } };
    });
  };
  const markAllPresent = () => setRows(prev => {
    const next = { ...prev };
    for (const e of visibleEmployees) {
      const id = Number(e.id);
      next[id] = { ...(next[id] || { employeeId: id, attendanceDate: date, checkIn: null, checkOut: null, remarks: '' }), status: 'PRESENT' };
    }
    return next;
  });
  const save = async () => {
    const changed = visibleEmployees.filter(e => rows[Number(e.id)] && rows[Number(e.id)].status !== '').map(e => rows[Number(e.id)]);
    if (!changed.length) { setMessage('Please select a Status for at least one employee before saving. Blank statuses will not be marked.'); return; }
    setSaving(true); setMessage('');
    try {
      const response = await apiFetch('/api/attendance/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attendanceDate: date, records: changed }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save attendance.');
      setMessage('Saved attendance for ' + data.count + ' employee(s).');
      await load();
    } catch (e: any) { setMessage(e.message || 'Unable to save attendance.'); }
    finally { setSaving(false); }
  };
  const exportExcel = () => {
    const safeCell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    const tableRows = [
      ['Employee Code', 'Employee Name', 'Date', 'Status', 'Remarks'],
      ...visibleEmployees.map(e => {
        const r = rows[Number(e.id)];
        return [e.employeeCode || e.employeeId || '', e.employeeName || e.fullName || '', date, r?.status || 'NOT_MARKED', r?.remarks || ''];
      }),
    ];
    const html = '<html><head><meta charset="UTF-8"></head><body><table>' +
      tableRows.map((row, index) => '<tr>' + row.map(value => '<td' + (index === 0 ? ' style="font-weight:bold"' : '') + '>' + safeCell(value) + '</td>').join('') + '</tr>').join('') +
      '</table></body></html>';
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'attendance-' + date + '.xls'; a.click();
    URL.revokeObjectURL(url);
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      <button onClick={() => setActiveView('dashboard')} className={activeView === 'dashboard' ? 'rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white' : inputClass}>Attendance Dashboard</button>
      <button onClick={() => setActiveView('input')} className={activeView === 'input' ? 'rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white' : inputClass}>Mark / Update Attendance</button>
    </div>
    {activeView === 'dashboard' ? <AttendanceHistoryDashboard /> : <>
    
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-xl font-bold text-slate-900">Employee Attendance</h2><p className="mt-1 text-sm text-slate-500">Only HR or Super Admin can mark or correct attendance for any employee, individually or in bulk. Employees can view their own records only; self-service punch in/out is disabled. Every change is audited.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => void load()} className={inputClass}><RefreshCw className="mr-1 inline h-4 w-4"/> Refresh</button><button onClick={exportExcel} className={inputClass}><Download className="mr-1 inline h-4 w-4"/> Download Excel</button></div>
    </div>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="grid gap-1 text-xs font-semibold text-slate-600"><span><CalendarDays className="mr-1 inline h-4 w-4"/> Attendance Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass}/></label>
      {canManage && <label className="grid min-w-56 flex-1 gap-1 text-xs font-semibold text-slate-600">Search employee<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or employee code" className={inputClass}/></label>}
      {canManage && <button onClick={markAllPresent} className={inputClass}>Mark visible employees Present</button>}
      {canManage && <button disabled={saving || loading} onClick={() => void save()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="mr-1 inline h-4 w-4"/>{saving ? 'Saving…' : 'Save Attendance'}</button>}
    </div>
    {message && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">{message}</div>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-[650px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Remarks</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? <tr><td colSpan={3} className="p-8 text-center text-slate-500">Loading attendance…</td></tr> : visibleEmployees.length ? visibleEmployees.map(e => {
            const id = Number(e.id); const r = rows[id] || { employeeId: id, attendanceDate: date, status: '' as Status, checkIn: null, checkOut: null, remarks: '' };
            return <tr key={id} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="font-semibold text-slate-900">{e.employeeName || e.fullName || 'Employee'}</div><div className="text-xs text-slate-500">{e.employeeCode || e.employeeId || ''}</div></td>
              <td className="px-4 py-3">{canManage ? <select value={r.status} onChange={ev => update(e, { status: ev.target.value as Status })} className={inputClass}><option value="">Select status</option>{STATUSES.filter(s => s.value !== '').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select> : <span className="font-medium">{rows[id] ? r.status.replace('_', ' ') : 'Not Marked'}</span>}</td>
              <td className="px-4 py-3">{canManage ? <input value={r.remarks || ''} onChange={ev => update(e, { remarks: ev.target.value })} maxLength={500} placeholder="Optional" className={inputClass}/> : (r.remarks || '—')}</td></tr>;
          }) : <tr><td colSpan={3} className="p-8 text-center text-slate-500">No employees found.</td></tr>}
        </tbody>
      </table>
    </div>
    </>}
  </div>;
}
