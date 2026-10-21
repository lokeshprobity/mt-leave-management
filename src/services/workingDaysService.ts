import { desc, eq } from 'drizzle-orm';
import { getDb, isDbConfigured, isProductionRuntime } from '../db/index.ts';
import { employeeWeeklyOffAssignments, holidays, systemSettings } from '../db/schema.ts';
import {
  DayType,
  HolidayDto,
  WorkingDaysCalculationResult,
  WorkingDayConfigItem,
  EmployeeWeeklyOffDto,
  AssignWeeklyOffInput,
  AuthContext,
} from '../types/leave.ts';
import { HolidayService } from './holidayService.ts';
import { AuditService } from './auditService.ts';
import { ValidationError } from './validation.ts';

// Initial pre-configured holidays (e.g. 2026 calendar)
export const INITIAL_HOLIDAYS: HolidayDto[] = [
  {
    id: 1,
    holidayDate: '2026-01-26',
    holidayName: 'Republic Day',
    isOptional: false,
    isActive: true,
    year: 2026,
  },
  {
    id: 2,
    holidayDate: '2026-08-15',
    holidayName: 'Independence Day',
    isOptional: false,
    isActive: true,
    year: 2026,
  },
  {
    id: 3,
    holidayDate: '2026-10-02',
    holidayName: 'Gandhi Jayanti',
    isOptional: false,
    isActive: true,
    year: 2026,
  },
  {
    id: 4,
    holidayDate: '2026-12-25',
    holidayName: 'Christmas Day',
    isOptional: false,
    isActive: true,
    year: 2026,
  },
];

export const DEFAULT_WORKING_DAYS_SCHEDULE: WorkingDayConfigItem[] = [
  { dayOfWeek: 0, dayName: 'Sunday', isWorkingDay: false, officeStartTime: '09:00', officeEndTime: '18:00', startTime: '09:00', endTime: '18:00', graceMinutes: 15, remarks: 'Weekly Off' },
  { dayOfWeek: 1, dayName: 'Monday', isWorkingDay: true, officeStartTime: '09:00', officeEndTime: '18:00', startTime: '09:00', endTime: '18:00', graceMinutes: 15, remarks: 'Normal Office Working Day' },
  { dayOfWeek: 2, dayName: 'Tuesday', isWorkingDay: true, officeStartTime: '09:00', officeEndTime: '18:00', startTime: '09:00', endTime: '18:00', graceMinutes: 15, remarks: 'Normal Office Working Day' },
  { dayOfWeek: 3, dayName: 'Wednesday', isWorkingDay: true, officeStartTime: '09:00', officeEndTime: '18:00', startTime: '09:00', endTime: '18:00', graceMinutes: 15, remarks: 'Normal Office Working Day' },
  { dayOfWeek: 4, dayName: 'Thursday', isWorkingDay: true, officeStartTime: '09:00', officeEndTime: '18:00', startTime: '09:00', endTime: '18:00', graceMinutes: 15, remarks: 'Normal Office Working Day' },
  { dayOfWeek: 5, dayName: 'Friday', isWorkingDay: true, officeStartTime: '09:00', officeEndTime: '18:00', startTime: '09:00', endTime: '18:00', graceMinutes: 15, remarks: 'Normal Office Working Day' },
  { dayOfWeek: 6, dayName: 'Saturday', isWorkingDay: true, officeStartTime: '09:00', officeEndTime: '18:00', startTime: '09:00', endTime: '18:00', graceMinutes: 15, remarks: 'Normal Office Working Day' },
];

const DAY_NAMES_BY_INDEX = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function normalizeWorkingDayConfigItem(item: any, indexFallback = 0): WorkingDayConfigItem {
  const dayOfWeek = typeof item?.dayOfWeek === 'number' ? item.dayOfWeek : indexFallback;
  const start = item?.officeStartTime || item?.startTime || '09:00';
  const end = item?.officeEndTime || item?.endTime || '18:00';
  const grace =
    typeof item?.graceMinutes === 'number' && !isNaN(item.graceMinutes)
      ? item.graceMinutes
      : Number(item?.graceMinutes ?? 15) || 0;
  const isWorkingDay = typeof item?.isWorkingDay === 'boolean' ? item.isWorkingDay : dayOfWeek !== 0;

  return {
    dayOfWeek,
    dayName: item?.dayName || DAY_NAMES_BY_INDEX[dayOfWeek] || `Day ${dayOfWeek}`,
    isWorkingDay,
    officeStartTime: String(start),
    officeEndTime: String(end),
    startTime: String(start),
    endTime: String(end),
    graceMinutes: grace,
    effectiveFrom: item?.effectiveFrom,
    effectiveTo: item?.effectiveTo,
    remarks: item?.remarks ?? (isWorkingDay ? 'Normal Office Working Day' : 'Weekly Off'),
  };
}

let memoryWeeklyOffs: number[] = [0]; // 0 = Sunday (Default: 6 days working Monday to Saturday)
let memoryWorkingDaysSchedule: WorkingDayConfigItem[] = [...DEFAULT_WORKING_DAYS_SCHEDULE];

interface MemoryEmployeeWeeklyOff {
  id: number;
  employeeId: number;
  weeklyOffDays: number[];
  effectiveFrom: string;
  effectiveTo?: string | null;
  remarks?: string;
  createdAt: Date;
}

let memoryEmployeeWeeklyOffs: MemoryEmployeeWeeklyOff[] = [];
let nextWeeklyOffId = 1;
let empWeeklyOffDbSynced = false;

function mapDbRowToMemoryWeeklyOff(row: typeof employeeWeeklyOffAssignments.$inferSelect): MemoryEmployeeWeeklyOff {
  const rawDays = Array.isArray(row.weeklyOffDays)
    ? row.weeklyOffDays
    : String(row.weeklyOffDays || '0').split(',');
  const days = rawDays
    .map((s) => Number(String(s).trim()))
    .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
  return {
    id: row.id,
    employeeId: row.employeeId,
    weeklyOffDays: days.length > 0 ? Array.from(new Set(days)).sort((a, b) => a - b) : [0],
    effectiveFrom: String(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? String(row.effectiveTo) : null,
    remarks: row.remarks ?? undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt)),
  };
}

export class WorkingDaysService {
  public static resetMemoryHolidays(): void {
    HolidayService.resetMemoryHolidays();
    memoryWeeklyOffs = [0];
    memoryWorkingDaysSchedule = [...DEFAULT_WORKING_DAYS_SCHEDULE];
    memoryEmployeeWeeklyOffs = [];
    nextWeeklyOffId = 1;
    empWeeklyOffDbSynced = false;
  }

  public static async syncEmployeeWeeklyOffsFromDb(): Promise<void> {
    if (!isDbConfigured()) {
      if (isProductionRuntime()) {
        throw new Error('[WorkingDaysService] PostgreSQL database must be configured in production.');
      }
      return;
    }
    const db = getDb()!;
    const rows = await db
      .select()
      .from(employeeWeeklyOffAssignments)
      .orderBy(desc(employeeWeeklyOffAssignments.effectiveFrom), desc(employeeWeeklyOffAssignments.id));
    memoryEmployeeWeeklyOffs = rows.map(mapDbRowToMemoryWeeklyOff);
    const maxId = memoryEmployeeWeeklyOffs.reduce((max, r) => Math.max(max, r.id), 0);
    nextWeeklyOffId = maxId + 1;
    empWeeklyOffDbSynced = true;
  }

  public static setCustomHolidays(list: HolidayDto[]): void {
    HolidayService.setMemoryHolidays(list);
  }

  public static setCustomWeeklyOffs(days: number[]): void {
    memoryWeeklyOffs = [...days];
  }

  /**
   * Retrieves configured weekly off day indices (0=Sun, 1=Mon, ..., 6=Sat)
   * from system_settings or memory fallback.
   */
  public static async getWeeklyOffs(): Promise<number[]> {
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const setting = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.settingKey, 'weekly_off_days'));
          if (setting.length > 0 && setting[0].settingValue) {
            return setting[0].settingValue
              .split(',')
              .map((s) => Number(s.trim()))
              .filter((n) => !isNaN(n));
          }
        } catch {}
      }
    }
    return memoryWeeklyOffs;
  }

  /**
   * Updates configured weekly off days in system_settings and memory fallback.
   */
  public static async setWeeklyOffs(days: number[]): Promise<number[]> {
    const validDays = Array.from(new Set(days.filter((d) => d >= 0 && d <= 6))).sort((a, b) => a - b);
    const settingValue = validDays.join(',');

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          await db
            .insert(systemSettings)
            .values({
              settingKey: 'weekly_off_days',
              settingValue,
              description: 'Configured weekly off day indices (0=Sun..6=Sat)',
            })
            .onConflictDoUpdate({
              target: systemSettings.settingKey,
              set: {
                settingValue,
                updatedAt: new Date(),
              },
            });
        } catch (e) {
          console.warn('Failed to persist weekly off days to database:', e);
        }
      }
    }

    memoryWeeklyOffs = validDays;
    return validDays;
  }

  /**
   * Retrieves full Monday-Sunday working days schedule with timings & grace minutes
   */
  public static async getWorkingDaysSchedule(): Promise<WorkingDayConfigItem[]> {
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const row = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.settingKey, 'working_days_schedule'));
          if (row.length > 0 && row[0].settingValue) {
            const parsed = JSON.parse(row[0].settingValue);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed.map((item, idx) => normalizeWorkingDayConfigItem(item, idx));
            }
          }
        } catch {}
      }
    }
    return memoryWorkingDaysSchedule.map((item, idx) => normalizeWorkingDayConfigItem(item, idx));
  }

  /**
   * Updates full Monday-Sunday working days schedule
   */
  public static async updateWorkingDaysSchedule(
    schedule: WorkingDayConfigItem[],
    actor?: AuthContext
  ): Promise<WorkingDayConfigItem[]> {
    if (actor && actor.role !== 'SUPER_ADMIN' && actor.role !== 'HR') {
      throw new Error('Forbidden: Only Super Admin and HR can configure working days.');
    }

    if (!Array.isArray(schedule) || schedule.length !== 7) {
      throw new ValidationError('Working days schedule must contain configuration for all 7 days (Sunday through Saturday).');
    }

    const normalizedSchedule = schedule.map((item, idx) => normalizeWorkingDayConfigItem(item, idx));
    const jsonStr = JSON.stringify(normalizedSchedule);
    const weeklyOffs = normalizedSchedule.filter((s) => !s.isWorkingDay).map((s) => s.dayOfWeek);

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          await db
            .insert(systemSettings)
            .values({
              settingKey: 'working_days_schedule',
              settingValue: jsonStr,
              description: 'Organization-level 7-day working schedule and office timings',
            })
            .onConflictDoUpdate({
              target: systemSettings.settingKey,
              set: {
                settingValue: jsonStr,
                updatedAt: new Date(),
              },
            });
        } catch (e) {
          console.warn('Failed to persist working_days_schedule to DB:', e);
        }
      }
    }

    memoryWorkingDaysSchedule = normalizedSchedule;
    await this.setWeeklyOffs(weeklyOffs);

    await AuditService.logEvent({
      actorId: actor?.userId || null,
      actorRole: actor?.role || 'SUPER_ADMIN',
      action: 'WORKING_DAY_CHANGED',
      targetEntity: 'system_settings',
      targetId: 'working_days_schedule',
      metadata: {
        weeklyOffs,
        updatedCount: normalizedSchedule.length,
      },
    });

    return normalizedSchedule;
  }

  // ----------------------------------------------------
  // Employee-Wise Weekly Off Management
  // ----------------------------------------------------

  private static formatDays(days: number[]): string {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days.sort((a, b) => a - b).map((d) => names[d] || `Day ${d}`).join(', ');
  }

  /**
   * Assign employee-specific weekly off schedule with effective dates
   */
  public static async assignEmployeeWeeklyOff(
    input: AssignWeeklyOffInput,
    actor?: AuthContext
  ): Promise<EmployeeWeeklyOffDto> {
    if (actor && actor.role !== 'SUPER_ADMIN' && actor.role !== 'HR') {
      throw new Error('Forbidden: Only Super Admin or HR can assign employee weekly offs.');
    }

    if (!input.employeeId) {
      throw new ValidationError('Employee ID is required.');
    }
    if (!Array.isArray(input.weeklyOffDays) || input.weeklyOffDays.length === 0) {
      throw new ValidationError('At least one weekly off day must be selected.');
    }
    const validDays = Array.from(new Set(input.weeklyOffDays.filter((d) => d >= 0 && d <= 6))).sort((a, b) => a - b);
    if (validDays.length === 0) {
      throw new ValidationError('Invalid weekly off days specified. Must be between 0 (Sunday) and 6 (Saturday).');
    }
    if (!input.effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
      throw new ValidationError('Effective From date must be in YYYY-MM-DD format.');
    }
    if (input.effectiveTo && !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveTo)) {
      throw new ValidationError('Effective To date must be in YYYY-MM-DD format.');
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new ValidationError('Effective To date cannot be earlier than Effective From date.');
    }

    let targetEmpId = Number(input.employeeId);
    let resolvedEmp: any = null;
    try {
      const { UserService } = await import('./userService.ts');
      resolvedEmp = UserService.resolveEmployeeRecordSync(input.employeeId);
      if (resolvedEmp) {
        targetEmpId = resolvedEmp.id;
      }
    } catch {}

    let newRecord: MemoryEmployeeWeeklyOff;

    const previousDay = (date: string) => {
      const d = new Date(`${date}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    };
    const nextDay = (date: string) => {
      const d = new Date(`${date}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    };
    const newEnd = input.effectiveTo || null;

    if (isDbConfigured()) {
      const db = getDb()!;
      const existingRows = await db.select().from(employeeWeeklyOffAssignments)
        .where(eq(employeeWeeklyOffAssignments.employeeId, targetEmpId));

      // Replace overlapping schedules so a previous Sunday assignment cannot remain active after switching to Saturday.
      for (const oldRow of existingRows) {
        const oldStart = String(oldRow.effectiveFrom).slice(0, 10);
        const oldEnd = oldRow.effectiveTo ? String(oldRow.effectiveTo).slice(0, 10) : null;
        const overlaps = oldStart <= (newEnd || '9999-12-31') && (!oldEnd || oldEnd >= input.effectiveFrom);
        if (!overlaps) continue;

        if (oldStart < input.effectiveFrom) {
          await db.update(employeeWeeklyOffAssignments)
            .set({ effectiveTo: previousDay(input.effectiveFrom) })
            .where(eq(employeeWeeklyOffAssignments.id, oldRow.id));
          if (newEnd && (!oldEnd || oldEnd > newEnd)) {
            await db.insert(employeeWeeklyOffAssignments).values({
              employeeId: targetEmpId,
              weeklyOffDays: oldRow.weeklyOffDays,
              effectiveFrom: nextDay(newEnd),
              effectiveTo: oldEnd,
              remarks: oldRow.remarks,
              createdBy: oldRow.createdBy,
            });
          }
        } else if (newEnd && (!oldEnd || oldEnd > newEnd)) {
          await db.update(employeeWeeklyOffAssignments)
            .set({ effectiveFrom: nextDay(newEnd) })
            .where(eq(employeeWeeklyOffAssignments.id, oldRow.id));
        } else {
          await db.delete(employeeWeeklyOffAssignments).where(eq(employeeWeeklyOffAssignments.id, oldRow.id));
        }
      }

      const [inserted] = await db.insert(employeeWeeklyOffAssignments).values({
        employeeId: targetEmpId,
        weeklyOffDays: validDays,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: newEnd,
        remarks: input.remarks?.trim() || null,
        createdBy: actor?.userId || null,
      }).returning();
      newRecord = mapDbRowToMemoryWeeklyOff(inserted);
      await this.syncEmployeeWeeklyOffsFromDb();
    } else {
      if (isProductionRuntime()) {
        throw new Error('[WorkingDaysService] PostgreSQL database must be configured in production.');
      }
      const existingRows = memoryEmployeeWeeklyOffs.filter((row) => row.employeeId === targetEmpId);
      for (const oldRow of existingRows) {
        const oldEnd = oldRow.effectiveTo || null;
        const overlaps = oldRow.effectiveFrom <= (newEnd || '9999-12-31') && (!oldEnd || oldEnd >= input.effectiveFrom);
        if (!overlaps) continue;
        if (oldRow.effectiveFrom < input.effectiveFrom) {
          oldRow.effectiveTo = previousDay(input.effectiveFrom);
          if (newEnd && (!oldEnd || oldEnd > newEnd)) {
            memoryEmployeeWeeklyOffs.push({ ...oldRow, id: nextWeeklyOffId++, effectiveFrom: nextDay(newEnd), effectiveTo: oldEnd, createdAt: new Date() });
          }
        } else if (newEnd && (!oldEnd || oldEnd > newEnd)) {
          oldRow.effectiveFrom = nextDay(newEnd);
        } else {
          memoryEmployeeWeeklyOffs = memoryEmployeeWeeklyOffs.filter((row) => row.id !== oldRow.id);
        }
      }
      newRecord = {
        id: nextWeeklyOffId++,
        employeeId: targetEmpId,
        weeklyOffDays: validDays,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: newEnd || undefined,
        remarks: input.remarks?.trim() || undefined,
        createdAt: new Date(),
      };
      memoryEmployeeWeeklyOffs.unshift(newRecord);
    }

    await AuditService.logEvent({
      actorId: actor?.userId || null,
      actorRole: actor?.role || 'SUPER_ADMIN',
      action: 'WEEKLY_OFF_ASSIGNED',
      targetEntity: 'employees',
      targetId: String(targetEmpId),
      metadata: {
        employeeId: targetEmpId,
        employeeCode: resolvedEmp?.employeeCode || null,
        weeklyOffDays: validDays,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo || null,
        remarks: input.remarks,
      },
    });

    return {
      id: newRecord.id,
      employeeId: newRecord.employeeId,
      employeeCode: resolvedEmp?.employeeCode || undefined,
      employeeName: resolvedEmp?.employeeName || undefined,
      weeklyOffDays: newRecord.weeklyOffDays,
      weeklyOffDaysFormatted: this.formatDays(newRecord.weeklyOffDays),
      effectiveFrom: newRecord.effectiveFrom,
      effectiveTo: newRecord.effectiveTo,
      remarks: newRecord.remarks,
      createdAt: newRecord.createdAt,
    };
  }

  /**
   * Retrieves all employee weekly off assignments
   */
  public static async getAllEmployeeWeeklyOffs(): Promise<EmployeeWeeklyOffDto[]> {
    if (isDbConfigured()) {
      await this.syncEmployeeWeeklyOffsFromDb();
    } else if (isProductionRuntime()) {
      throw new Error('[WorkingDaysService] PostgreSQL database must be configured in production.');
    }
    let userService: any = null;
    try {
      const mod = await import('./userService.ts');
      userService = mod.UserService;
    } catch {}
    return memoryEmployeeWeeklyOffs.map((rec) => {
      const emp = userService?.resolveEmployeeRecordSync?.(rec.employeeId);
      return {
        id: rec.id,
        employeeId: rec.employeeId,
        employeeCode: emp?.employeeCode || undefined,
        employeeName: emp?.employeeName || undefined,
        weeklyOffDays: rec.weeklyOffDays,
        weeklyOffDaysFormatted: this.formatDays(rec.weeklyOffDays),
        effectiveFrom: rec.effectiveFrom,
        effectiveTo: rec.effectiveTo,
        remarks: rec.remarks,
        createdAt: rec.createdAt,
      };
    });
  }

  /**
   * Retrieves weekly off assignment history for an employee
   */
  public static async getEmployeeWeeklyOffHistory(employeeId: number | string): Promise<EmployeeWeeklyOffDto[]> {
    if (isDbConfigured()) {
      await this.syncEmployeeWeeklyOffsFromDb();
    } else if (isProductionRuntime()) {
      throw new Error('[WorkingDaysService] PostgreSQL database must be configured in production.');
    }
    let targetEmpId = Number(employeeId);
    let emp: any = null;
    try {
      const { UserService } = await import('./userService.ts');
      emp = UserService.resolveEmployeeRecordSync(employeeId);
      if (emp) targetEmpId = emp.id;
    } catch {}
    return memoryEmployeeWeeklyOffs
      .filter((rec) => rec.employeeId === targetEmpId)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
      .map((rec) => ({
        id: rec.id,
        employeeId: rec.employeeId,
        employeeCode: emp?.employeeCode || undefined,
        employeeName: emp?.employeeName || undefined,
        weeklyOffDays: rec.weeklyOffDays,
        weeklyOffDaysFormatted: this.formatDays(rec.weeklyOffDays),
        effectiveFrom: rec.effectiveFrom,
        effectiveTo: rec.effectiveTo,
        remarks: rec.remarks,
        createdAt: rec.createdAt,
      }));
  }

  /**
   * Delete / cancel an employee weekly off assignment
   */
  public static async deleteEmployeeWeeklyOff(id: number, actor?: AuthContext): Promise<{ success: boolean; message: string }> {
    if (actor && actor.role !== 'SUPER_ADMIN' && actor.role !== 'HR') {
      throw new Error('Forbidden: Only Super Admin or HR can cancel employee weekly off assignments.');
    }
    let removed: MemoryEmployeeWeeklyOff | undefined;

    if (isDbConfigured()) {
      const db = getDb()!;
      const [existing] = await db
        .select()
        .from(employeeWeeklyOffAssignments)
        .where(eq(employeeWeeklyOffAssignments.id, Number(id)))
        .limit(1);
      if (!existing) {
        throw new ValidationError(`Weekly off assignment with ID ${id} not found.`);
      }
      removed = mapDbRowToMemoryWeeklyOff(existing);
      await db.delete(employeeWeeklyOffAssignments).where(eq(employeeWeeklyOffAssignments.id, Number(id)));
      await this.syncEmployeeWeeklyOffsFromDb();
    } else {
      if (isProductionRuntime()) {
        throw new Error('[WorkingDaysService] PostgreSQL database must be configured in production.');
      }
      const idx = memoryEmployeeWeeklyOffs.findIndex((w) => w.id === Number(id));
      if (idx === -1) {
        throw new ValidationError(`Weekly off assignment with ID ${id} not found.`);
      }
      removed = memoryEmployeeWeeklyOffs.splice(idx, 1)[0];
    }

    await AuditService.logEvent({
      actorId: actor?.userId || null,
      actorRole: actor?.role || 'SUPER_ADMIN',
      action: 'WEEKLY_OFF_CHANGED',
      targetEntity: 'employees',
      targetId: String(removed.employeeId),
      metadata: {
        action: 'CANCELLED',
        assignmentId: id,
        cancelledWeeklyOffDays: removed.weeklyOffDays,
      },
    });

    return { success: true, message: 'Weekly off assignment removed successfully.' };
  }

  /**
   * Returns whether an explicit employee-specific weekly-off assignment applies on a date.
   * When present, it is authoritative over shift-level and department-level weekly-off settings.
   */
  public static async hasEmployeeWeeklyOffAssignmentForDate(
    employeeId: number | string,
    targetDateStr: string
  ): Promise<boolean> {
    let targetEmpId = Number(employeeId);
    try {
      const { UserService } = await import('./userService.ts');
      const emp = UserService.resolveEmployeeRecordSync(employeeId);
      if (emp) targetEmpId = emp.id;
    } catch {}

    if (isDbConfigured() && !empWeeklyOffDbSynced) {
      await this.syncEmployeeWeeklyOffsFromDb();
    }

    return memoryEmployeeWeeklyOffs.some(
      (rec) =>
        rec.employeeId === targetEmpId &&
        targetDateStr >= rec.effectiveFrom &&
        (!rec.effectiveTo || targetDateStr <= rec.effectiveTo)
    );
  }

  /**
   * Date-effective employee weekly off lookup:
   * 1. Checks specific employee weekly off table for date
   * 2. Checks employee shift assignment workDaysOfWeek override
   * 3. Falls back to company default weekly offs
   */
  public static async getEmployeeWeeklyOffsForDate(employeeId: number | string, targetDateStr: string): Promise<number[]> {
    let targetEmpId = Number(employeeId);
    try {
      const { UserService } = await import('./userService.ts');
      const emp = UserService.resolveEmployeeRecordSync(employeeId);
      if (emp) targetEmpId = emp.id;
    } catch {}

    if (isDbConfigured() && !empWeeklyOffDbSynced) {
      await this.syncEmployeeWeeklyOffsFromDb();
    }

    // 1. Check direct employee weekly off assignment
    const empOff = memoryEmployeeWeeklyOffs.find(
      (rec) =>
        rec.employeeId === targetEmpId &&
        targetDateStr >= rec.effectiveFrom &&
        (!rec.effectiveTo || targetDateStr <= rec.effectiveTo)
    );
    if (empOff) {
      return empOff.weeklyOffDays;
    }

    // 2. Check employee shift assignment workDaysOfWeek
    try {
      const mod = await import('./shiftService.ts');
      const assignments = await mod.ShiftService.getEmployeeAssignments(targetEmpId, { includeInactive: false });
      const effectiveShift = assignments.find((a) => {
        if (targetDateStr < a.effectiveFrom) return false;
        if (a.effectiveTo && targetDateStr > a.effectiveTo) return false;
        return true;
      });

      if (effectiveShift && effectiveShift.workDaysOfWeek) {
        const allowedDays = effectiveShift.workDaysOfWeek
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => !isNaN(n));
        const allDays = [0, 1, 2, 3, 4, 5, 6];
        return allDays.filter((d) => !allowedDays.includes(d));
      }
    } catch {}

    // 3. Fallback to company default weekly offs
    return this.getWeeklyOffs();
  }

  /**
   * Retrieves active holidays via HolidayService (DB backed with fallback)
   * Resolves department-specific holiday calendar when departmentId or employeeId is provided
   */
  public static async getHolidays(departmentId?: number | string | null, employeeId?: number | string): Promise<HolidayDto[]> {
    if (employeeId) {
      const empHolidays = await HolidayService.getHolidaysForEmployee(employeeId);
      return empHolidays.filter((h) => !h.isOptional);
    }
    if (departmentId) {
      const deptHolidays = await HolidayService.getDepartmentHolidays(departmentId);
      return deptHolidays.filter((h) => !h.isOptional);
    }
    const all = await HolidayService.getHolidays({ isActive: true });
    return all.filter((h) => !h.isOptional); // Official non-optional holidays count as non-working days
  }

  /**
   * Core working-day calculation engine.
   * Parses YYYY-MM-DD cleanly without local timezone shifts.
   * Accurately resolves employee-specific weekly off and department-wise holiday calendar per date!
   */
  public static async calculateWorkingDays(
    startDateStr: string,
    endDateStr: string,
    dayType: DayType = 'FULL_DAY',
    customConfig?: {
      weeklyOffs?: number[];
      holidays?: HolidayDto[];
      employeeId?: number | string;
      departmentId?: number | string;
    }
  ): Promise<WorkingDaysCalculationResult> {
    const defaultWeeklyOffs = customConfig?.weeklyOffs ?? (await this.getWeeklyOffs());
    let employeeId: number | undefined =
      customConfig?.employeeId !== undefined ? Number(customConfig.employeeId) : undefined;
    let departmentId: number | undefined =
      customConfig?.departmentId !== undefined ? Number(customConfig.departmentId) : undefined;

    if (customConfig?.employeeId !== undefined || customConfig?.departmentId !== undefined) {
      try {
        const { UserService } = await import('./userService.ts');
        if (customConfig?.employeeId !== undefined) {
          const emp = UserService.resolveEmployeeRecordSync(customConfig.employeeId);
          if (emp) {
            employeeId = emp.id;
          }
        }
        if (customConfig?.departmentId !== undefined) {
          const dept = UserService.resolveDepartmentRecordSync(customConfig.departmentId);
          if (dept) {
            departmentId = dept.id;
          }
        }
      } catch {}
    }

    const holidayList =
      customConfig?.holidays ?? (await this.getHolidays(departmentId ?? customConfig?.departmentId, employeeId ?? customConfig?.employeeId));

    const holidayMap = new Map<string, { name: string; isHalfDay?: boolean }>();
    for (const h of holidayList) {
      holidayMap.set(h.holidayDate, { name: h.holidayName, isHalfDay: h.isHalfDay });
    }

    const startParts = startDateStr.split('-').map(Number);
    const endParts = endDateStr.split('-').map(Number);

    if (
      startParts.length !== 3 ||
      endParts.length !== 3 ||
      startParts.some(isNaN) ||
      endParts.some(isNaN)
    ) {
      throw new Error(`Invalid date format. Expected YYYY-MM-DD: got ${startDateStr} to ${endDateStr}`);
    }

    const startDate = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
    const endDate = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));

    if (startDate.getTime() > endDate.getTime()) {
      throw new Error(`Start date (${startDateStr}) cannot be after end date (${endDateStr})`);
    }

    // Lazy load ShiftService if employeeId is provided
    let shiftService: any = null;
    if (employeeId) {
      try {
        const mod = await import('./shiftService.ts');
        shiftService = mod.ShiftService;
      } catch {}
    }

    // Cache of departmentId -> holidayMap for date-effective department transfer support
    const deptHolidayMapCache = new Map<number, Map<string, { name: string; isHalfDay?: boolean }>>();
    const getHolidayMetaForDate = async (dateStr: string): Promise<{ name: string; isHalfDay?: boolean } | undefined> => {
      if (customConfig?.holidays) {
        return holidayMap.get(dateStr);
      }
      if (employeeId) {
        const assignedList = await HolidayService.resolveEmployeeHolidayListForDate(employeeId, dateStr);
        if (assignedList) {
          const hol = await HolidayService.resolveHolidayForEmployeeOnDate(dateStr, { employeeId });
          return hol ? { name: hol.holidayName, isHalfDay: hol.isHalfDay } : undefined;
        }
      }
      if (employeeId && shiftService && !departmentId) {
        const effectiveDeptId = shiftService.getEmployeeDepartment(employeeId, dateStr);
        if (effectiveDeptId !== undefined) {
          let cachedMap = deptHolidayMapCache.get(effectiveDeptId);
          if (!cachedMap) {
            const deptHols = await this.getHolidays(effectiveDeptId, undefined);
            cachedMap = new Map<string, { name: string; isHalfDay?: boolean }>();
            for (const h of deptHols) {
              cachedMap.set(h.holidayDate, { name: h.holidayName, isHalfDay: h.isHalfDay });
            }
            deptHolidayMapCache.set(effectiveDeptId, cachedMap);
          }
          return cachedMap.get(dateStr);
        }
      }
      return holidayMap.get(dateStr);
    };

    const workingDays: string[] = [];
    const weeklyOffDays: string[] = [];
    const holidayDays: Array<{ date: string; name: string }> = [];
    let accumulatedWorkingHours = 0;

    let current = new Date(startDate.getTime());
    let isStartDayWorking = false;
    let isFirstDay = true;

    while (current.getTime() <= endDate.getTime()) {
      const year = current.getUTCFullYear();
      const month = String(current.getUTCMonth() + 1).padStart(2, '0');
      const day = String(current.getUTCDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const dayOfWeek = current.getUTCDay(); // 0 = Sunday, 6 = Saturday

      const holidayMeta = await getHolidayMetaForDate(dateStr);

      // Date-effective employee weekly off evaluation
      let isWeeklyOff = false;
      let dailyShiftHours = 9.0;
      if (employeeId) {
        const effectiveEmpOffs = await this.getEmployeeWeeklyOffsForDate(employeeId, dateStr);
        isWeeklyOff = effectiveEmpOffs.includes(dayOfWeek);

        if (shiftService) {
          try {
            const schedule = await shiftService.resolveEmployeeSchedule(employeeId, dateStr);
            if (schedule.scheduleSource === 'EMPLOYEE_SHIFT') {
              isWeeklyOff = schedule.isWeeklyOff;
            }
            const resolvedHrs = schedule.totalWorkingHours ?? schedule.totalScheduledHours;
            if (resolvedHrs !== undefined && resolvedHrs > 0) {
              dailyShiftHours = Number(resolvedHrs);
            }
          } catch {}
        }
      } else {
        isWeeklyOff = defaultWeeklyOffs.includes(dayOfWeek);
      }

      if (isWeeklyOff) {
        weeklyOffDays.push(dateStr);
      } else if (holidayMeta) {
        holidayDays.push({ date: dateStr, name: holidayMeta.name });
      } else {
        workingDays.push(dateStr);
        accumulatedWorkingHours += dailyShiftHours;
        if (isFirstDay) {
          isStartDayWorking = true;
        }
      }

      isFirstDay = false;
      current.setUTCDate(current.getUTCDate() + 1);
    }

    let totalDays = 0;
    let totalWorkingHours = 0;
    if (dayType === 'HALF_DAY') {
      // Half-day counts as 0.5 for each working day (applied for a single day)
      totalDays = workingDays.length > 0 ? 0.5 : 0;
      totalWorkingHours =
        workingDays.length > 0 ? Math.round((accumulatedWorkingHours / workingDays.length / 2) * 100) / 100 : 0;
    } else {
      totalDays = workingDays.length * 1.0;
      totalWorkingHours = Math.round(accumulatedWorkingHours * 100) / 100;
    }

    return {
      totalDays,
      totalWorkingHours,
      workingDays,
      weeklyOffDays,
      holidayDays,
      isStartDayWorking,
    };
  }
}

