import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Download, RefreshCw, Save } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'POST_START' | 'HALF_DAY' | 'WEEKLY_OFF' | 'HOLIDAY' | 'ON_LEAVE';
type Employee = { id: number; employeeCode?: string; employeeId?: string; employeeName?: string; fullName?: string; role?: string };
type RecordRow = { id?: number; employeeId: number; employeeCode?: string; employeeName?: string; attendanceDate: string; status: Status; checkIn?: string | null; checkOut?: string | null; remarks?: string | null; source?: string };
const STATUSES: { value: Status; label: string }[] = [
  { value: 'PRESENT', label: 'Present' }, { value: 'ABSENT', label: 'Absent' }, { value: 'LATE', label: 'Late' }, { value: 'POST_START', label: 'Post Start (08:30+)' },
  { value: 'HALF_DAY', label: 'Half Day' }, { value: 'WEEKLY_OFF', label: 'Weekly Off' }, { value: 'HOLIDAY', label: 'Holiday' }, { value: 'ON_LEAVE', label: 'On Leave' },
];
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const inputClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
export function AttendanceAdmin({ canManage = true }: { canManage?: boolean }) {
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
  const visibleEmployees = useMemo(() => employees.filter(e => {
    const name = e.employeeName || e.fullName || '';
    const code = e.employeeCode || e.employeeId || '';
    return (name + ' ' + code).toLowerCase().includes(search.toLowerCase());
  }), [employees, search]);
  const update = (employee: Employee, patch: Partial<RecordRow>) => {
    const id = Number(employee.id);
    setRows(prev => {
      const current = prev[id] || { employeeId: id, attendanceDate: date, status: 'PRESENT' as Status, checkIn: null, checkOut: null, remarks: '' };
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
    const changed = visibleEmployees.filter(e => rows[Number(e.id)]).map(e => rows[Number(e.id)]);
    if (!changed.length) { setMessage('Please mark attendance for at least one employee.'); return; }
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
  const exportCsv = () => {
    const csvRows = [['Employee Code', 'Employee Name', 'Date', 'Status', 'Check In', 'Check Out', 'Remarks']];
    for (const e of visibleEmployees) {
      const r = rows[Number(e.id)];
      csvRows.push([e.employeeCode || e.employeeId || '', e.employeeName || e.fullName || '', date, r?.status || 'NOT_MARKED', r?.checkIn || '', r?.checkOut || '', r?.remarks || '']);
    }
    const csv = csvRows.map(row => row.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'attendance-' + date + '.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const selfAction = async (action: 'CHECK_IN' | 'CHECK_OUT') => {
    setSaving(true); setMessage('');
    try {
      const response = await apiFetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, attendanceDate: date }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to record attendance.');
      setMessage(action === 'CHECK_IN' ? 'Check-in recorded.' : 'Check-out recorded.');
      await load();
    } catch (e: any) { setMessage(e.message || 'Unable to record attendance.'); }
    finally { setSaving(false); }
  };
  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-xl font-bold text-slate-900">Employee Attendance</h2><p className="mt-1 text-sm text-slate-500">HR can mark or correct attendance for any employee, individually or in bulk. Every change is audited.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => void load()} className={inputClass}><RefreshCw className="mr-1 inline h-4 w-4"/> Refresh</button><button onClick={exportCsv} className={inputClass}><Download className="mr-1 inline h-4 w-4"/> Export CSV</button></div>
    </div>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="grid gap-1 text-xs font-semibold text-slate-600"><span><CalendarDays className="mr-1 inline h-4 w-4"/> Attendance Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass}/></label>
      {canManage && <label className="grid min-w-56 flex-1 gap-1 text-xs font-semibold text-slate-600">Search employee<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or employee code" className={inputClass}/></label>}
      {canManage && <button onClick={markAllPresent} className={inputClass}>Mark visible employees Present</button>}
      {canManage && <button disabled={saving || loading} onClick={() => void save()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="mr-1 inline h-4 w-4"/>{saving ? 'Saving…' : 'Save Attendance'}</button>}
    </div>
    {message && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">{message}</div>}
    {!canManage && <div className="flex flex-wrap gap-2"><button disabled={saving} onClick={() => void selfAction('CHECK_IN')} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Clock3 className="mr-1 inline h-4 w-4"/> Check In</button><button disabled={saving} onClick={() => void selfAction('CHECK_OUT')} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><CheckCircle2 className="mr-1 inline h-4 w-4"/> Check Out</button></div>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-[850px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Check In</th><th className="px-4 py-3">Check Out</th><th className="px-4 py-3">Remarks</th><th className="px-4 py-3">Source</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading attendance…</td></tr> : visibleEmployees.length ? visibleEmployees.map(e => {
            const id = Number(e.id); const r = rows[id] || { employeeId: id, attendanceDate: date, status: 'PRESENT' as Status, checkIn: null, checkOut: null, remarks: '' };
            return <tr key={id} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="font-semibold text-slate-900">{e.employeeName || e.fullName || 'Employee'}</div><div className="text-xs text-slate-500">{e.employeeCode || e.employeeId || ''}</div></td>
              <td className="px-4 py-3">{canManage ? <select value={r.status} onChange={ev => update(e, { status: ev.target.value as Status })} className={inputClass}>{STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select> : <span className="font-medium">{r.status.replace('_', ' ')}</span>}</td>
              <td className="px-4 py-3">{canManage ? <input type="time" value={r.checkIn || ''} onChange={ev => update(e, { checkIn: ev.target.value || null })} className={inputClass}/> : (r.checkIn || '—')}</td>
              <td className="px-4 py-3">{canManage ? <input type="time" value={r.checkOut || ''} onChange={ev => update(e, { checkOut: ev.target.value || null })} className={inputClass}/> : (r.checkOut || '—')}</td>
              <td className="px-4 py-3">{canManage ? <input value={r.remarks || ''} onChange={ev => update(e, { remarks: ev.target.value })} maxLength={500} placeholder="Optional" className={inputClass}/> : (r.remarks || '—')}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{r.source || 'Not marked'}</td></tr>;
          }) : <tr><td colSpan={6} className="p-8 text-center text-slate-500">No employees found.</td></tr>}
        </tbody>
      </table>
    </div>
    {!canManage && <p className="text-xs text-slate-500">Self check-in/check-out is recorded with server time. HR can correct attendance when required.</p>}
  </div>;
}
