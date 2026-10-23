import { and, asc, eq } from 'drizzle-orm';
import { getDb, isDbConfigured } from '../db/index.ts';
import { attendanceRecords } from '../db/schema.ts';
import { AuthContext } from '../types/leave.ts';
import { AuditService } from './auditService.ts';
import { UserService } from './userService.ts';
import { ValidationError } from './validation.ts';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'POST_START' | 'HALF_DAY' | 'WEEKLY_OFF' | 'HOLIDAY' | 'ON_LEAVE';
export type AttendanceSource = 'HR' | 'SELF_SERVICE';

export interface AttendanceRecordDto {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  attendanceDate: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  source: AttendanceSource;
  remarks: string | null;
  markedBy: number | null;
  updatedBy: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

const ALLOWED_STATUSES = new Set<AttendanceStatus>([
  'PRESENT', 'ABSENT', 'LATE', 'POST_START', 'HALF_DAY', 'WEEKLY_OFF', 'HOLIDAY', 'ON_LEAVE',
]);
let memoryRecords: AttendanceRecordDto[] = [];
let nextId = 1;

function todayLocalDate(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function currentTime(): string {
  const now = new Date();
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}
function validateDate(date: string): string {
  const value = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z'))) {
    throw new ValidationError('Attendance date must be a valid YYYY-MM-DD date.');
  }
  return value;
}
function validateTime(value: unknown, label: string): string {
  const time = String(value || '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ValidationError(label + ' must use 24-hour HH:mm format.');
  return time;
}
function statusFromCheckIn(checkIn: string): AttendanceStatus {
  // Office policy: LATE is 07:01–08:29; arrival at/after 08:30 is POST_START.
  if (checkIn > '07:00' && checkIn < '08:30') return 'LATE';
  if (checkIn >= '08:30') return 'POST_START';
  return 'PRESENT';
}
function rowToDto(row: any, employee?: any): AttendanceRecordDto {
  return {
    id: Number(row.id),
    employeeId: Number(row.employeeId ?? row.employee_id),
    employeeCode: employee?.employeeCode || employee?.employeeId || '',
    employeeName: employee?.employeeName || employee?.fullName || 'Employee',
    attendanceDate: row.attendanceDate ?? row.attendance_date,
    status: row.status,
    checkIn: row.checkIn ?? row.check_in ?? null,
    checkOut: row.checkOut ?? row.check_out ?? null,
    source: row.source || 'HR',
    remarks: row.remarks ?? null,
    markedBy: row.markedBy ?? row.marked_by ?? null,
    updatedBy: row.updatedBy ?? row.updated_by ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

export class AttendanceService {
  static resetMemoryStores(): void { memoryRecords = []; nextId = 1; }

  static async list(dateInput: string, actor: AuthContext): Promise<{ employees: any[]; records: AttendanceRecordDto[] }> {
    const date = validateDate(dateInput || todayLocalDate());
    const all = await UserService.getAllEmployees();
    const visibleEmployees = all.filter((e: any) => actor.role === 'SUPER_ADMIN' || String(e.role || '').toUpperCase() !== 'SUPER_ADMIN');
    const canManage = actor.role === 'SUPER_ADMIN' || actor.role === 'HR';
    const employees = canManage ? visibleEmployees : visibleEmployees.filter((e: any) =>
      Number(e.id) === Number(actor.employeeId) || String(e.employeeCode || '').toUpperCase() === String(actor.employeeCode || '').toUpperCase()
    );
    let rows: any[] = [];
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const query = await db.select().from(attendanceRecords).where(eq(attendanceRecords.attendanceDate, date)).orderBy(asc(attendanceRecords.employeeId));
        rows = query;
      }
    } else {
      rows = memoryRecords.filter((r) => r.attendanceDate === date);
    }
    const employeeById = new Map(employees.map((e: any) => [Number(e.id), e]));
    const records = rows
      .filter((r: any) => canManage || employeeById.has(Number(r.employeeId ?? r.employee_id)))
      .map((r: any) => rowToDto(r, employeeById.get(Number(r.employeeId ?? r.employee_id))));
    return { employees, records };
  }

  static async mark(input: any, actor: AuthContext): Promise<AttendanceRecordDto> {
    const canManage = actor.role === 'SUPER_ADMIN' || actor.role === 'HR';
    const rawEmployeeId = input.employeeId ?? input.employeeCode ?? actor.employeeId;
    const target = UserService.resolveEmployeeRecordSync(rawEmployeeId);
    if (!target) throw new ValidationError('A valid employee must be selected.');
    if (!canManage && Number(target.id) !== Number(actor.employeeId)) {
      throw new Error('Forbidden: You can only record your own attendance.');
    }
    if (String(target.role || '').toUpperCase() === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: This employee record is not available.');
    }
    const date = validateDate(input.attendanceDate || input.date || todayLocalDate());
    const action = String(input.action || '').toUpperCase();
    let status: AttendanceStatus;
    let checkIn: string | null = input.checkIn ? validateTime(input.checkIn, 'Check-in time') : null;
    let checkOut: string | null = input.checkOut ? validateTime(input.checkOut, 'Check-out time') : null;
    let source: AttendanceSource = canManage ? 'HR' : 'SELF_SERVICE';
    const existingMemory = memoryRecords.find((r) => r.employeeId === Number(target.id) && r.attendanceDate === date);
    let existingDb: any = null;
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const rows = await db.select().from(attendanceRecords).where(and(
          eq(attendanceRecords.employeeId, Number(target.id)),
          eq(attendanceRecords.attendanceDate, date)
        )).limit(1);
        existingDb = rows[0] || null;
      }
    }
    const existing: any = existingDb || existingMemory;
    if (action === 'CHECK_IN') {
      if (existing?.checkIn || existing?.check_in) throw new ValidationError('Check-in is already recorded for this date.');
      checkIn = currentTime();
      checkOut = existing?.checkOut ?? existing?.check_out ?? null;
      status = statusFromCheckIn(checkIn);
      source = 'SELF_SERVICE';
    } else if (action === 'CHECK_OUT') {
      if (!(existing?.checkIn || existing?.check_in)) throw new ValidationError('Please check in before checking out.');
      if (existing?.checkOut || existing?.check_out) throw new ValidationError('Check-out is already recorded for this date.');
      checkIn = existing.checkIn ?? existing.check_in;
      checkOut = currentTime();
      status = (existing.status === 'LATE' ? 'LATE' : existing.status) as AttendanceStatus;
      source = 'SELF_SERVICE';
    } else {
      status = String(input.status || '').toUpperCase() as AttendanceStatus;
      if (!ALLOWED_STATUSES.has(status)) throw new ValidationError('Select a valid attendance status.');
      if (input.checkIn) checkIn = validateTime(input.checkIn, 'Check-in time');
      if (input.checkOut) checkOut = validateTime(input.checkOut, 'Check-out time');
      if (checkIn && checkOut && checkOut < checkIn) throw new ValidationError('Check-out cannot be earlier than check-in.');
      if (status === 'PRESENT' && checkIn && statusFromCheckIn(checkIn) === 'LATE') status = 'LATE';
    }
    const remarks = input.remarks == null ? (existing?.remarks ?? null) : String(input.remarks).trim().slice(0, 500) || null;
    const db = isDbConfigured() ? getDb() : null;
    let saved: any;
    if (db) {
      const values = {
        employeeId: Number(target.id), attendanceDate: date, status, checkIn, checkOut, source, remarks,
        markedBy: existing?.markedBy ?? existing?.marked_by ?? actor.userId ?? null,
        updatedBy: actor.userId ?? null, updatedAt: new Date(),
      };
      const result = await db.insert(attendanceRecords).values(values).onConflictDoUpdate({
        target: [attendanceRecords.employeeId, attendanceRecords.attendanceDate],
        set: { status, checkIn, checkOut, source, remarks, updatedBy: actor.userId ?? null, updatedAt: new Date() },
      }).returning();
      saved = result[0];
    } else {
      const now = new Date().toISOString();
      if (existingMemory) {
        Object.assign(existingMemory, { status, checkIn, checkOut, source, remarks, updatedBy: actor.userId ?? null, updatedAt: now });
        saved = existingMemory;
      } else {
        saved = { id: nextId++, employeeId: Number(target.id), attendanceDate: date, status, checkIn, checkOut, source, remarks,
          markedBy: actor.userId ?? null, updatedBy: actor.userId ?? null, createdAt: now, updatedAt: now };
        memoryRecords.unshift(saved);
      }
    }
    await AuditService.logEvent({
      actorId: actor.userId, actorRole: actor.role, action: existing ? 'ATTENDANCE_UPDATED' : 'ATTENDANCE_MARKED',
      targetEntity: 'attendance_records', targetId: String(target.id),
      metadata: { employeeId: target.id, employeeCode: target.employeeCode, employeeName: target.employeeName,
        attendanceDate: date, status, checkIn, checkOut, source, remarks },
    });
    return rowToDto(saved, target);
  }

  static async markBulk(input: any, actor: AuthContext): Promise<{ count: number; records: AttendanceRecordDto[] }> {
    if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'HR') throw new Error('Forbidden: Only HR or Super Admin can mark attendance for employees.');
    const date = validateDate(input.attendanceDate || input.date || todayLocalDate());
    if (!Array.isArray(input.records) || input.records.length === 0) throw new ValidationError('Select at least one employee to mark attendance.');
    const records: AttendanceRecordDto[] = [];
    for (const item of input.records) {
      records.push(await this.mark({ ...item, attendanceDate: date }, actor));
    }
    return { count: records.length, records };
  }
}
