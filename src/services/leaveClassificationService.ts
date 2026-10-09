import { eq } from 'drizzle-orm';
import { getDb, isDbConfigured } from '../db/index.ts';
import { systemSettings } from '../db/schema.ts';
import { RequestClassification } from '../types/leave.ts';

export interface SystemTimingConfig {
  officeStartTime: string; // e.g. "08:30"
  normalLeaveCutoffTime: string; // e.g. "07:00" (same-day normal leave cutoff)
  normalFullDayCutoffTime?: string; // e.g. "07:00" (same-day cutoff for normal Full-Day leave)
  timezone: string; // e.g. "Asia/Kolkata"
}

export const DEFAULT_TIMING_CONFIG: SystemTimingConfig = {
  officeStartTime: '08:30',
  normalLeaveCutoffTime: '07:00',
  normalFullDayCutoffTime: '07:00',
  timezone: 'Asia/Kolkata',
};

let memoryTimingConfig: SystemTimingConfig = { ...DEFAULT_TIMING_CONFIG };
let customTimingOverrides: Partial<SystemTimingConfig> = {};

export class LeaveClassificationService {
  public static resetTimingConfig(): void {
    memoryTimingConfig = { ...DEFAULT_TIMING_CONFIG };
    customTimingOverrides = {};
  }

  public static setCustomTimingConfig(config: Partial<SystemTimingConfig>): void {
    customTimingOverrides = { ...customTimingOverrides, ...config };
    memoryTimingConfig = { ...memoryTimingConfig, ...config };
  }

  /**
   * Reads system settings dynamically from persisted settings, DB, or memory overrides
   */
  public static async getTimingConfig(): Promise<SystemTimingConfig> {
    const config: SystemTimingConfig = { ...DEFAULT_TIMING_CONFIG };

    try {
      const { UserService } = await import('./userService.ts');
      const savedSettings = UserService.getSystemSettings();
      const hasExplicitNormalCutoff = savedSettings.some(
        (s) => s.settingKey === 'normal_leave_cutoff_time' && Boolean(s.settingValue)
      );
      for (const row of savedSettings) {
        if (row.settingKey === 'office_start_time' && row.settingValue) {
          config.officeStartTime = row.settingValue;
        }
        if (row.settingKey === 'normal_leave_cutoff_time' && row.settingValue) {
          config.normalLeaveCutoffTime = row.settingValue;
          config.normalFullDayCutoffTime = row.settingValue;
        }
        if (
          (row.settingKey === 'leave_cutoff_time' ||
            row.settingKey === 'normal_full_day_cutoff_time') &&
          row.settingValue
        ) {
          config.normalFullDayCutoffTime = row.settingValue;
          if (!hasExplicitNormalCutoff) {
            config.normalLeaveCutoffTime = row.settingValue;
          }
        }
        if (row.settingKey === 'timezone' && row.settingValue) {
          config.timezone = row.settingValue;
        }
      }
    } catch {}

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const rows = await db.select().from(systemSettings);
          for (const row of rows) {
            if (row.settingKey === 'office_start_time' && row.settingValue) {
              config.officeStartTime = row.settingValue;
            }
            if (row.settingKey === 'normal_leave_cutoff_time' && row.settingValue) {
              config.normalLeaveCutoffTime = row.settingValue;
              config.normalFullDayCutoffTime = row.settingValue;
            }
            if (
              (row.settingKey === 'leave_cutoff_time' ||
                row.settingKey === 'normal_full_day_cutoff_time') &&
              row.settingValue
            ) {
              config.normalFullDayCutoffTime = row.settingValue;
            }
            if (row.settingKey === 'timezone' && row.settingValue) {
              config.timezone = row.settingValue;
            }
          }
        } catch {}
      }
    }

    if (customTimingOverrides.officeStartTime) {
      config.officeStartTime = customTimingOverrides.officeStartTime;
    }
    if (customTimingOverrides.normalLeaveCutoffTime) {
      config.normalLeaveCutoffTime = customTimingOverrides.normalLeaveCutoffTime;
      if (!customTimingOverrides.normalFullDayCutoffTime) {
        config.normalFullDayCutoffTime = customTimingOverrides.normalLeaveCutoffTime;
      }
    }
    if (customTimingOverrides.normalFullDayCutoffTime) {
      config.normalFullDayCutoffTime = customTimingOverrides.normalFullDayCutoffTime;
    }
    if (customTimingOverrides.timezone) {
      config.timezone = customTimingOverrides.timezone;
    }

    return config;
  }

  /**
   * Helper to parse "HH:mm" into total minutes from 00:00
   */
  public static parseTimeToMinutes(timeStr: string): number {
    const parts = timeStr.trim().split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      return 0;
    }
    return parts[0] * 60 + parts[1];
  }

  /**
   * Extracts date components in target timezone
   */
  public static getDateTimeInTimezone(
    date: Date,
    timeZone: string
  ): { dateStr: string; timeStr: string; minutes: number; year: number; month: number; day: number } {
    try {
      const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = dtf.formatToParts(date);
      const partObj: Record<string, string> = {};
      for (const p of parts) {
        partObj[p.type] = p.value;
      }

      const year = Number(partObj.year);
      const month = Number(partObj.month);
      const day = Number(partObj.day);
      const hour = Number(partObj.hour === '24' ? '00' : partObj.hour);
      const minute = Number(partObj.minute);

      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const minutes = hour * 60 + minute;

      return { dateStr, timeStr, minutes, year, month, day };
    } catch {
      // Fallback to UTC if timezone is unrecognized
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const day = date.getUTCDate();
      const hour = date.getUTCHours();
      const minute = date.getUTCMinutes();
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      return { dateStr, timeStr, minutes: hour * 60 + minute, year, month, day };
    }
  }

  /**
   * Classifies a leave application based on application timestamp and requested leave start date.
   * Supports employee-specific shift schedule if provided (or resolved via employeeId).
   */
  public static async classifyLeaveRequest(
    applicationTimestamp: Date | string,
    leaveStartDateStr: string,
    customTiming?: SystemTimingConfig,
    shiftOptions?: {
      employeeId?: number;
      resolvedStartTime?: string; // "HH:mm"
      resolvedCutoffTime?: string; // "HH:mm"
      dayType?: 'FULL_DAY' | 'HALF_DAY';
      isEmergency?: boolean;
    }
  ): Promise<{
    classification: RequestClassification;
    noticeMinutes: number;
    noticeDays: number;
    isSameDay: boolean;
    isLate: boolean;
    isPostStart: boolean;
    isBeforeNormalFullDayCutoff: boolean;
    isBeforeShiftStart: boolean;
    normalFullDayCutoffDateStr: string;
    normalFullDayCutoffTimeUsed: string;
    applicationDateStr: string;
    applicationTimeStr: string;
    shiftStartTimeUsed?: string;
    shiftCutoffTimeUsed?: string;
  }> {
    const timing = customTiming ? { ...DEFAULT_TIMING_CONFIG, ...customTiming } : await this.getTimingConfig();
    let appDate: Date;
    if (typeof applicationTimestamp === 'string') {
      const trimmedTs = applicationTimestamp.trim();
      const hasTzOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmedTs);
      if (!hasTzOffset && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmedTs)) {
        const normalizedIso = trimmedTs.replace(' ', 'T');
        const suffix = timing.timezone === 'Asia/Kolkata' ? '+05:30' : 'Z';
        appDate = new Date(`${normalizedIso}${suffix}`);
      } else {
        appDate = new Date(trimmedTs);
      }
    } else {
      appDate = applicationTimestamp;
    }

    if (isNaN(appDate.getTime())) {
      throw new Error(`Invalid application timestamp: ${applicationTimestamp}`);
    }

    const { dateStr: appDateStr, timeStr: appTimeStr, minutes: appMinutes } =
      this.getDateTimeInTimezone(appDate, timing.timezone);

    let effectiveStartTimeStr = timing.officeStartTime || '08:30';
    let effectiveCutoffTimeStr =
      timing.normalLeaveCutoffTime || timing.normalFullDayCutoffTime || '07:00';

    // Check if shift-specific start time was provided or can be resolved for the requested leave date
    if (shiftOptions?.resolvedStartTime) {
      effectiveStartTimeStr = shiftOptions.resolvedStartTime;
      if (shiftOptions.resolvedCutoffTime) {
        effectiveCutoffTimeStr = shiftOptions.resolvedCutoffTime;
      } else {
        const shiftStartMins = this.parseTimeToMinutes(effectiveStartTimeStr);
        const autoCutoffMins = Math.max(0, shiftStartMins - 90);
        const autoH = Math.floor(autoCutoffMins / 60);
        const autoM = autoCutoffMins % 60;
        effectiveCutoffTimeStr = `${String(autoH).padStart(2, '0')}:${String(autoM).padStart(2, '0')}`;
      }
    } else if (shiftOptions?.employeeId) {
      try {
        const { ShiftService } = await import('./shiftService.ts');
        const schedule = await ShiftService.resolveEmployeeSchedule(shiftOptions.employeeId, leaveStartDateStr);
        if (schedule.scheduleSource === 'EMPLOYEE_SHIFT' || schedule.scheduleSource === 'DEPARTMENT_SHIFT') {
          if (schedule.earliestStartTime) {
            effectiveStartTimeStr = schedule.earliestStartTime;
          } else if (schedule.shiftId) {
            const shiftObj = await ShiftService.getShiftById(schedule.shiftId);
            const firstSeg = shiftObj?.segments
              ?.filter((s) => s.isActive)
              .sort((a, b) => a.segmentSequence - b.segmentSequence)[0];
            if (firstSeg?.startTime) {
              effectiveStartTimeStr = firstSeg.startTime;
            }
          }
          const shiftStartMins = this.parseTimeToMinutes(effectiveStartTimeStr);
          const autoCutoffMins = Math.max(0, shiftStartMins - 90);
          const autoH = Math.floor(autoCutoffMins / 60);
          const autoM = autoCutoffMins % 60;
          effectiveCutoffTimeStr = `${String(autoH).padStart(2, '0')}:${String(autoM).padStart(2, '0')}`;
        } else if (schedule.shiftId) {
          // Off/Holiday on date D, but employee or department had a shiftId attached
          const shiftObj = await ShiftService.getShiftById(schedule.shiftId);
          const firstSeg = shiftObj?.segments
            ?.filter((s) => s.isActive)
            .sort((a, b) => a.segmentSequence - b.segmentSequence)[0];
          if (firstSeg?.startTime) {
            effectiveStartTimeStr = firstSeg.startTime;
            const shiftStartMins = this.parseTimeToMinutes(effectiveStartTimeStr);
            const autoCutoffMins = Math.max(0, shiftStartMins - 90);
            const autoH = Math.floor(autoCutoffMins / 60);
            const autoM = autoCutoffMins % 60;
            effectiveCutoffTimeStr = `${String(autoH).padStart(2, '0')}:${String(autoM).padStart(2, '0')}`;
          }
        } else if (schedule.earliestStartTime && !customTiming?.officeStartTime) {
          effectiveStartTimeStr = timing.officeStartTime || schedule.earliestStartTime;
        }
      } catch {}
    }

    const normalFullDayCutoffTimeStr =
      customTiming?.normalFullDayCutoffTime ||
      effectiveCutoffTimeStr ||
      timing.normalFullDayCutoffTime ||
      timing.normalLeaveCutoffTime ||
      '07:00';

    const officeStartMinutes = this.parseTimeToMinutes(effectiveStartTimeStr);
    const normalCutoffMinutes = this.parseTimeToMinutes(effectiveCutoffTimeStr);
    const normalFullDayCutoffMinutes = this.parseTimeToMinutes(normalFullDayCutoffTimeStr);

    // Calculate calendar day difference between start date and application date
    const [sY, sM, sD] = leaveStartDateStr.split('-').map(Number);
    const [aY, aM, aD] = appDateStr.split('-').map(Number);

    const startUtcDays = Math.floor(Date.UTC(sY, sM - 1, sD) / 86400000);
    const appUtcDays = Math.floor(Date.UTC(aY, aM - 1, aD) / 86400000);
    const noticeDays = startUtcDays - appUtcDays;

    const normalFullDayCutoffDateStr = leaveStartDateStr;

    const isSameDay = noticeDays === 0;

    // Authoritative Normal Full-Day Cutoff Check:
    // Normal cutoff = 07:00 AM on leave start date (or configured normal cutoff time).
    // Late window = 07:01 AM to 08:29 AM (after normal cutoff and strictly before office start).
    // Post-start = 08:30 AM onward (at or after office/shift start).
    const isBeforeNormalFullDayCutoff =
      noticeDays > 0 || (noticeDays === 0 && appMinutes <= normalFullDayCutoffMinutes);

    // Authoritative Shift/Office Start Time Check for Date D:
    // Must be submitted strictly BEFORE the employee's applicable office/shift start time for date D.
    // e.g. Office/shift starts 08:30 on 26/09/2026:
    // 26/09/2026 07:00 -> true
    // 26/09/2026 08:29 -> true
    // 26/09/2026 08:30 -> false
    // 26/09/2026 14:10 -> false
    const isBeforeShiftStart =
      noticeDays > 0 || (noticeDays === 0 && appMinutes < officeStartMinutes);

    let classification: RequestClassification = 'NORMAL_LEAVE_REQUEST';
    let isLate = false;
    let isPostStart = false;

    // Minutes relative to shift start on the leave start date
    const minutesBeforeOfficeStart = noticeDays * 24 * 60 + (officeStartMinutes - appMinutes);

    if (noticeDays > 0) {
      classification = 'NORMAL_LEAVE_REQUEST';
      isLate = false;
      isPostStart = false;
    } else if (noticeDays === 0) {
      // Same-day leave: check cutoff (07:00 AM) and shift start (08:30 AM) boundaries
      if (appMinutes <= normalCutoffMinutes) {
        // At or before normal same-day cutoff (<= 07:00 AM)
        classification = 'NORMAL_LEAVE_REQUEST';
        isLate = false;
        isPostStart = false;
      } else if (appMinutes < officeStartMinutes) {
        // Late window: 07:01 AM to 08:29 AM (after cutoff, strictly before shift start)
        classification = 'LATE_LEAVE_REQUEST';
        isLate = true;
        isPostStart = false;
      } else {
        // Post-start: 08:30 AM onward (at or after shift start)
        classification = 'POST_START_LEAVE_REQUEST';
        isLate = false;
        isPostStart = true;
      }
    } else {
      // noticeDays < 0: retroactive application
      classification = 'POST_START_LEAVE_REQUEST';
      isLate = false;
      isPostStart = true;
    }

    return {
      classification,
      noticeMinutes: minutesBeforeOfficeStart,
      noticeDays,
      isSameDay,
      isLate,
      isPostStart,
      isBeforeNormalFullDayCutoff,
      isBeforeShiftStart,
      normalFullDayCutoffDateStr,
      normalFullDayCutoffTimeUsed: normalFullDayCutoffTimeStr,
      applicationDateStr: appDateStr,
      applicationTimeStr: appTimeStr,
      shiftStartTimeUsed: effectiveStartTimeStr,
      shiftCutoffTimeUsed: effectiveCutoffTimeStr,
    };
  }
}

