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
function validateDate(date: string): string {
  const value = String(date || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ValidationError('Attendance date must be a valid YYYY-MM-DD date.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new ValidationError('Attendance date must be a valid YYYY-MM-DD date.');
  }
  return value;
}
function validateTime(value: unknown, label: string): string {
  const time = String(value || '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ValidationError(label + ' must use 24-hour HH:mm format.');
  return time;
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
    if (actor.role !== 'SUPER_ADMIN') throw new Error('Forbidden: Attendance is currently available to Super Admin only.');
    const date = validateDate(dateInput || todayLocalDate());
    const all = await UserService.getAllEmployees();
    const visibleEmployees = all.filter((e: any) => actor.role === 'SUPER_ADMIN' || String(e.role || '').toUpperCase() !== 'SUPER_ADMIN');
    const employees = visibleEmployees;
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
      .map((r: any) => rowToDto(r, employeeById.get(Number(r.employeeId ?? r.employee_id))));
    return { employees, records };
  }

  static async mark(input: any, actor: AuthContext, dbOverride?: any): Promise<AttendanceRecordDto> {
    if (actor.role !== 'SUPER_ADMIN') throw new Error('Forbidden: Attendance is currently available to Super Admin only.');
    const action = String(input.action || '').toUpperCase();
    if (action === 'CHECK_IN' || action === 'CHECK_OUT') {
      throw new ValidationError('Self-service punch in/out is disabled. HR or Super Admin must mark attendance.');
    }
    const rawEmployeeId = input.employeeId ?? input.employeeCode;
    if (rawEmployeeId === undefined || rawEmployeeId === null || String(rawEmployeeId).trim() === '') {
      throw new ValidationError('A valid employee must be selected.');
    }
    const target = UserService.resolveEmployeeRecordSync(rawEmployeeId);
    if (!target) throw new ValidationError('A valid employee must be selected.');
    if (String(target.role || '').toUpperCase() === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: This employee record is not available.');
    }
    const date = validateDate(input.attendanceDate || input.date || todayLocalDate());
    const db = dbOverride ?? (isDbConfigured() ? getDb() : null);
    let status: AttendanceStatus;
    let checkIn: string | null = input.checkIn ? validateTime(input.checkIn, 'Check-in time') : null;
    let checkOut: string | null = input.checkOut ? validateTime(input.checkOut, 'Check-out time') : null;
    const source: AttendanceSource = 'HR';
    const existingMemory = memoryRecords.find((r) => r.employeeId === Number(target.id) && r.attendanceDate === date);
    let existingDb: any = null;
    if (db) {
      const found = await db.select().from(attendanceRecords).where(and(
        eq(attendanceRecords.employeeId, Number(target.id)),
        eq(attendanceRecords.attendanceDate, date)
      )).limit(1);
      existingDb = found[0] || null;
    }
    const existing: any = existingDb || existingMemory;
    status = String(input.status || '').toUpperCase() as AttendanceStatus;
    if (!ALLOWED_STATUSES.has(status)) throw new ValidationError('Select a valid attendance status.');
    if (checkIn && checkOut && checkOut < checkIn) throw new ValidationError('Check-out cannot be earlier than check-in.');
    const remarks = input.remarks == null ? (existing?.remarks ?? null) : String(input.remarks).trim().slice(0, 500) || null;
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
    if (actor.role !== 'SUPER_ADMIN') throw new Error('Forbidden: Attendance is currently available to Super Admin only.');
    const date = validateDate(input.attendanceDate || input.date || todayLocalDate());
    if (!Array.isArray(input.records) || input.records.length === 0) throw new ValidationError('Select at least one employee to mark attendance.');

    // Validate all rows before the first write, avoiding partial saves from predictable input errors.
    const seenEmployees = new Set<number>();
    const normalized = input.records.map((item: any) => {
      const rawEmployeeId = item?.employeeId ?? item?.employeeCode;
      if (rawEmployeeId === undefined || rawEmployeeId === null || String(rawEmployeeId).trim() === '') {
        throw new ValidationError('A valid employee must be selected for every attendance row.');
      }
      const target = UserService.resolveEmployeeRecordSync(rawEmployeeId);
      if (!target) throw new ValidationError('A valid employee must be selected for every attendance row.');
      if (String(target.role || '').toUpperCase() === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
        throw new ValidationError('This employee record is not available.');
      }
      if (seenEmployees.has(Number(target.id))) throw new ValidationError('An employee appears more than once in this bulk attendance request.');
      seenEmployees.add(Number(target.id));
      const action = String(item.action || '').toUpperCase();
      if (action === 'CHECK_IN' || action === 'CHECK_OUT') {
        throw new ValidationError('Self-service punch in/out is disabled. HR or Super Admin must mark attendance.');
      }
      const status = String(item.status || '').toUpperCase() as AttendanceStatus;
      if (!ALLOWED_STATUSES.has(status)) throw new ValidationError('Select a valid attendance status.');
      const checkIn = item.checkIn ? validateTime(item.checkIn, 'Check-in time') : null;
      const checkOut = item.checkOut ? validateTime(item.checkOut, 'Check-out time') : null;
      if (checkIn && checkOut && checkOut < checkIn) throw new ValidationError('Check-out cannot be earlier than check-in.');
      return { ...item, employeeId: Number(target.id), attendanceDate: date, status, checkIn, checkOut };
    });

    const db = isDbConfigured() ? getDb() : null;
    const saveRows = async (transactionDb?: any) => {
      const records: AttendanceRecordDto[] = [];
      for (const item of normalized) records.push(await this.mark(item, actor, transactionDb));
      return records;
    };
    const records = db?.transaction
      ? await db.transaction(async (tx: any) => saveRows(tx))
      : await saveRows();
    return { count: records.length, records };
  }
}
