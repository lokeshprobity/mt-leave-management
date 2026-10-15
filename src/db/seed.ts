import * as dotenv from 'dotenv';
dotenv.config();

import { eq, and, sql } from 'drizzle-orm';
import { getDb, isDbConfigured } from './index.ts';
import { leaveTypes, roles, systemSettings, shifts, shiftSegments, users, employees, departments } from './schema.ts';
import { INITIAL_SHIFTS } from '../services/shiftService.ts';
import { UserService } from '../services/userService.ts';

export const INITIAL_LEAVE_TYPES = [
  {
    code: 'CL',
    name: 'Casual Leave',
    description: 'Leave for urgent or unforeseen personal matters',
    isPaid: true,
    requiresDocument: false,
    supportsHalfDay: true,
    isActive: true,
    displayOrder: 1,
  },
  {
    code: 'SL',
    name: 'Sick Leave',
    description: 'Leave granted for medical recovery, treatment, or illness',
    isPaid: true,
    requiresDocument: true,
    supportsHalfDay: true,
    isActive: true,
    displayOrder: 2,
  },
  {
    code: 'EL',
    name: 'Earned Leave',
    description: 'Privilege or annual leave earned by days worked',
    isPaid: true,
    requiresDocument: false,
    supportsHalfDay: false,
    isActive: true,
    displayOrder: 3,
  },
  {
    code: 'EMERGENCY',
    name: 'Emergency Leave',
    description: 'Unplanned urgent leave for unexpected critical incidents',
    isPaid: true,
    requiresDocument: false,
    supportsHalfDay: true,
    isActive: true,
    displayOrder: 4,
  },
  {
    code: 'LWP',
    name: 'Leave Without Pay',
    description: 'Unpaid authorized absence when paid leave balances are exhausted',
    isPaid: false,
    requiresDocument: false,
    supportsHalfDay: true,
    isActive: true,
    displayOrder: 5,
  },
];

export const INITIAL_ROLES = [
  {
    name: 'EMPLOYEE',
    description: 'Standard organization employee with leave application and balance self-service',
    permissions: ['LEAVE_APPLY', 'LEAVE_VIEW_OWN', 'OT_APPLY', 'OT_VIEW_OWN', 'PROFILE_VIEW_OWN'],
  },
  {
    name: 'TEAM_LEADER',
    description: 'Team Leader with Stage 1 operational leave approval authority for assigned team members',
    permissions: [
      'LEAVE_APPLY',
      'LEAVE_VIEW_OWN',
      'LEAVE_TEAM_LEADER_APPROVE',
      'EMPLOYEE_VIEW',
      'PROFILE_VIEW_OWN',
    ],
  },
  {
    name: 'HR',
    description: 'Human Resources department officer with employee management and Stage 2 leave review rights',
    permissions: [
      'EMPLOYEE_VIEW',
      'EMPLOYEE_EDIT',
      'LEAVE_HR_APPROVE',
      'SHIFT_ASSIGN',
      'OT_APPROVE',
      'HOLIDAY_MANAGE',
      'AUDIT_VIEW',
    ],
  },
  {
    name: 'TOP_MANAGEMENT',
    description: 'Executive and top management approver for final leave decisions',
    permissions: ['EMPLOYEE_VIEW', 'LEAVE_FINAL_APPROVE', 'OT_APPROVE', 'REPORTS_VIEW'],
  },
  {
    name: 'SUPER_ADMIN',
    description: 'System administrator with full administrative access and system configuration control',
    permissions: ['ALL_PERMISSIONS'],
  },
];

export const INITIAL_SYSTEM_SETTINGS = [
  {
    settingKey: 'office_start_time',
    settingValue: '08:30',
    description: 'Standard daily office start time',
  },
  {
    settingKey: 'office_end_time',
    settingValue: '17:30',
    description: 'Standard daily office end time',
  },
  {
    settingKey: 'leave_cutoff_time',
    settingValue: '07:00',
    description: 'Daily leave request cutoff time (07:00 AM on leave start date)',
  },
  {
    settingKey: 'normal_leave_cutoff_time',
    settingValue: '07:00',
    description: 'Daily cutoff time for submitting regular same-day leave applications (07:00 AM)',
  },
  {
    settingKey: 'normal_full_day_cutoff_time',
    settingValue: '07:00',
    description: 'Cutoff time on leave start date for submitting normal full-day leave applications (07:00 AM)',
  },
  {
    settingKey: 'weekly_off_days',
    settingValue: '0',
    description: 'Default weekly off day indices (0=Sunday; Monday to Saturday Working)',
  },
  {
    settingKey: 'working_days_per_week',
    settingValue: '6',
    description: 'Default working days per week (Monday to Saturday)',
  },
  {
    settingKey: 'standard_daily_work_hours',
    settingValue: '9',
    description: 'Standard configured daily work hours (08:30-17:30 = 9 hours)',
  },
  {
    settingKey: 'fiscal_year_start_month',
    settingValue: '1',
    description: 'Fiscal / leave cycle start month (1=January)',
  },
  {
    settingKey: 'hr_approval_required',
    settingValue: 'true',
    description: 'HR Approval Required workflow setting (true = 3-stage with HR; false = 2-stage without HR)',
  },
  {
    settingKey: 'timezone',
    settingValue: 'Asia/Kolkata',
    description: 'Operational timezone for Maestro Leave Management calculation and cutoff checks',
  },
];

export async function seedDatabase() {
  if (!isDbConfigured()) {
    console.warn(
      '[Maestro Leave Management] Database credentials (SQL_HOST, SQL_DB_NAME, SQL_USER) are not configured. Skipping seed.'
    );
    return {
      success: false,
      message: 'Database not configured. Set SQL_HOST, SQL_DB_NAME, SQL_USER to enable database seeding.',
    };
  }

  const db = getDb();
  if (!db) {
    throw new Error('Failed to initialize database connection for seeding.');
  }

  console.log('[Maestro Leave Management] Seeding initial roles...');
  for (const role of INITIAL_ROLES) {
    await db
      .insert(roles)
      .values(role)
      .onConflictDoNothing({ target: roles.name });
  }
  console.log('[Maestro Leave Management] Roles seeded successfully.');

  console.log('[Maestro Leave Management] Seeding default system settings...');
  for (const setting of INITIAL_SYSTEM_SETTINGS) {
    await db
      .insert(systemSettings)
      .values(setting)
      .onConflictDoNothing({ target: systemSettings.settingKey });
  }
  console.log('[Maestro Leave Management] System settings seeded successfully.');

  console.log('[Maestro Leave Management] Seeding initial leave types...');
  for (const lt of INITIAL_LEAVE_TYPES) {
    await db
      .insert(leaveTypes)
      .values(lt)
      .onConflictDoNothing({ target: leaveTypes.code });
  }
  console.log('[Maestro Leave Management] Leave types seeded successfully.');

  console.log('[Maestro Leave Management] Ensuring 17 official shifts and their segments...');
  for (const s of INITIAL_SHIFTS) {
    const segments = s.segments || [];
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    const shiftCode = String(s.shiftCode).trim().toUpperCase();
    const inferredShiftType =
      shiftCode.startsWith('SS-') || segments.length > 1
        ? 'SPLIT'
        : shiftCode.startsWith('NGN') || shiftCode === 'SC' || segments.some((segment) => segment.crossesMidnight)
          ? 'NIGHT'
          : 'DAY';

    const [existingShift] = await db
      .select()
      .from(shifts)
      .where(eq(shifts.shiftCode, s.shiftCode))
      .limit(1);

    let targetShift = existingShift;
    if (!targetShift) {
      const [insertedShift] = await db
        .insert(shifts)
        .values({
          shiftCode: s.shiftCode,
          shiftName: s.shiftName,
          shiftType: inferredShiftType,
          category: s.category || 'Standard',
          description: s.description || null,
          startTime: firstSegment?.startTime || null,
          endTime: lastSegment?.endTime || null,
          totalWorkingHours: s.totalWorkingHours != null ? String(s.totalWorkingHours) : null,
          breakMinutes: s.breakMinutes || 0,
          weeklyOff: (s as any).weeklyOff || 'Sunday',
          effectiveFrom: '2026-01-01',
          timingConfigured: s.timingConfigured ?? (segments.length > 0),
          isActive: s.isActive ?? true,
        })
        .onConflictDoNothing({ target: shifts.shiftCode })
        .returning();
      targetShift = insertedShift;
      // If another startup inserted the same code first, resolve its actual database ID.
      if (!targetShift) {
        const [resolvedShift] = await db
          .select()
          .from(shifts)
          .where(eq(shifts.shiftCode, s.shiftCode))
          .limit(1);
        targetShift = resolvedShift;
      }
    }

    if (!targetShift) {
      throw new Error(`Unable to initialize official shift '${s.shiftCode}'.`);
    }

    // Correct only default DAY values that conflict with the official shift-code convention.
    // Any existing non-default administrative choice is preserved.
    if (targetShift.shiftType === 'DAY' && inferredShiftType !== 'DAY') {
      await db
        .update(shifts)
        .set({ shiftType: inferredShiftType, updatedAt: new Date() })
        .where(eq(shifts.id, targetShift.id));
    }

    for (const seg of segments) {
      const [existingSegment] = await db
        .select()
        .from(shiftSegments)
        .where(and(
          eq(shiftSegments.shiftId, targetShift.id),
          eq(shiftSegments.segmentSequence, seg.segmentSequence)
        ))
        .limit(1);
      if (existingSegment) continue;
      await db.insert(shiftSegments).values({
        shiftId: targetShift.id,
        segmentSequence: seg.segmentSequence,
        startTime: seg.startTime,
        endTime: seg.endTime,
        crossesMidnight: seg.crossesMidnight,
        breakMinutes: seg.breakMinutes || 0,
        isActive: seg.isActive ?? true,
      });
    }
  }
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('shifts', 'id'), COALESCE((SELECT MAX(id) FROM shifts), 1), true)`);
  console.log('[Maestro Leave Management] Official shifts and segments are ready.');

  return {
    success: true,
    rolesCount: INITIAL_ROLES.length,
    settingsCount: INITIAL_SYSTEM_SETTINGS.length,
    leaveTypesCount: INITIAL_LEAVE_TYPES.length,
    shiftsCount: INITIAL_SHIFTS.length,
  };
}

// Allow standalone execution via CLI (e.g., npm run db:seed)
if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase()
    .then((result) => {
      console.log('Seed result:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed with error:', err);
      process.exit(1);
    });
}
