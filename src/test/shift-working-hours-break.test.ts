import fs from 'node:fs';
import path from 'node:path';
import { ShiftService } from '../services/shiftService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import type { AuthContext } from '../types/leave.ts';

const SUPER_ADMIN: AuthContext = {
  userId: 1,
  employeeId: 100,
  username: 'admin',
  role: 'SUPER_ADMIN',
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runWorkingHoursBreakRegressionTests() {
  console.log('\n====================================================================');
  console.log('🧪 WORKING HOURS & BREAK CALCULATION RULE REGRESSION SUITE');
  console.log('====================================================================\n');

  ShiftService.resetMemoryStores();

  // -------------------------------------------------------------------------
  // 1. Canonical Example: Start 08:30, End 17:30, Total Working Hours 9, Break 30 mins
  // -------------------------------------------------------------------------
  console.log('--- 1. Canonical Example (08:30 - 17:30, Total Working Hours = 9, Break = 30 mins) ---');
  const gn2 = await ShiftService.getShiftByCode('GN-2');
  assert(Boolean(gn2), 'Pre-seeded shift GN-2 (08:30 - 17:30) exists');
  assert(gn2?.startTime === '08:30', `GN-2 startTime is 08:30 (got ${gn2?.startTime})`);
  assert(gn2?.endTime === '17:30', `GN-2 endTime is 17:30 (got ${gn2?.endTime})`);
  assert(gn2?.totalWorkingHours === 9, `GN-2 totalWorkingHours is 9 (NOT 8.5), got ${gn2?.totalWorkingHours}`);
  assert(gn2?.totalScheduledHours === 9, `GN-2 totalScheduledHours is 9 (NOT 8.5), got ${gn2?.totalScheduledHours}`);
  assert(gn2?.breakMinutes === 30, `GN-2 breakMinutes is 30, got ${gn2?.breakMinutes}`);
  assert(
    gn2?.segments[0]?.durationHours === 9,
    `GN-2 segment durationHours is 9 (includes break, NOT 8.5), got ${gn2?.segments[0]?.durationHours}`
  );

  // Create a custom DAY shift with Start 08:30, End 17:30, Total Working Hours 9, Break 30 minutes
  const createdDayShift = await ShiftService.createShift(
    {
      shiftCode: 'WH-DAY-9',
      shiftName: 'Day 9h With 30m Break',
      shiftType: 'DAY',
      startTime: '08:30',
      endTime: '17:30',
      totalWorkingHours: 9,
      breakMinutes: 30,
      weeklyOff: 'Sunday',
      isActive: true,
      effectiveFrom: '2026-01-01',
      description: 'Canonical example: 08:30 to 17:30, 9 hrs total, 30 mins break',
    },
    SUPER_ADMIN
  );

  assert(
    createdDayShift.totalWorkingHours === 9,
    `Created DAY shift totalWorkingHours === 9 (got ${createdDayShift.totalWorkingHours})`
  );
  assert(
    createdDayShift.totalScheduledHours === 9,
    `Created DAY shift totalScheduledHours === 9 (got ${createdDayShift.totalScheduledHours})`
  );
  assert(
    createdDayShift.breakMinutes === 30,
    `Created DAY shift breakMinutes === 30 (got ${createdDayShift.breakMinutes})`
  );
  assert(
    createdDayShift.segments[0]?.durationHours === 9,
    `Created DAY shift segment durationHours === 9 (got ${createdDayShift.segments[0]?.durationHours})`
  );
  assert(
    createdDayShift.totalWorkingHours !== 8.5 && createdDayShift.totalScheduledHours !== 8.5,
    'Break (30 mins) is NEVER subtracted from Total Working Hours (never 8.5)'
  );

  // -------------------------------------------------------------------------
  // 2. Refresh / Reload Persistence & Editing Break Without Altering Total Hours
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Persistence After Refresh/Reload & Editing Break Minutes ---');
  ShiftService.simulateServerRestart();
  const reloadedDayShift = await ShiftService.getShiftByCode('WH-DAY-9');
  assert(Boolean(reloadedDayShift), 'WH-DAY-9 shift persists after server restart / reload');
  assert(
    reloadedDayShift?.totalWorkingHours === 9,
    `After reload: totalWorkingHours remains 9 (got ${reloadedDayShift?.totalWorkingHours})`
  );
  assert(
    reloadedDayShift?.breakMinutes === 30,
    `After reload: breakMinutes remains 30 (got ${reloadedDayShift?.breakMinutes})`
  );

  // Edit break minutes from 30 -> 45 without passing totalWorkingHours; totalWorkingHours must stay 9
  const updatedDayShift = await ShiftService.updateShift(
    reloadedDayShift!.id,
    {
      breakMinutes: 45,
    },
    SUPER_ADMIN
  );
  assert(
    updatedDayShift.totalWorkingHours === 9,
    `After editing break to 45 mins: totalWorkingHours remains 9 (got ${updatedDayShift.totalWorkingHours})`
  );
  assert(
    updatedDayShift.breakMinutes === 45,
    `After editing break to 45 mins: breakMinutes is 45 (got ${updatedDayShift.breakMinutes})`
  );

  // Restore break to 30 mins and verify after reload
  await ShiftService.updateShift(
    reloadedDayShift!.id,
    {
      totalWorkingHours: 9,
      breakMinutes: 30,
    },
    SUPER_ADMIN
  );
  ShiftService.simulateServerRestart();
  const afterSecondReload = await ShiftService.getShiftByCode('WH-DAY-9');
  assert(
    afterSecondReload?.totalWorkingHours === 9 && afterSecondReload?.breakMinutes === 30,
    `After second reload: Total Working Hours = ${afterSecondReload?.totalWorkingHours} hrs/day; Break = ${afterSecondReload?.breakMinutes} mins`
  );

  // -------------------------------------------------------------------------
  // 3. NIGHT Shift Support (Overnight Cross-Midnight + Break Included)
  // -------------------------------------------------------------------------
  console.log('\n--- 3. NIGHT Shift Support (Overnight 20:30 - 08:30, Total = 12 hrs, Break = 60 mins) ---');
  const ngn1 = await ShiftService.getShiftByCode('NGN-1');
  assert(
    ngn1?.totalWorkingHours === 12 && ngn1?.totalScheduledHours === 12 && ngn1?.breakMinutes === 60,
    `NGN-1 Night Shift has Total Working Hours = 12 hrs/day (NOT 11), Break = 60 mins (got ${ngn1?.totalWorkingHours}, break ${ngn1?.breakMinutes})`
  );

  const customNightShift = await ShiftService.createShift(
    {
      shiftCode: 'WH-NIGHT-9',
      shiftName: 'Night 9h With 30m Break',
      shiftType: 'NIGHT',
      startTime: '22:00',
      endTime: '07:00',
      totalWorkingHours: 9,
      breakMinutes: 30,
      weeklyOff: 'Sunday',
      isActive: true,
    },
    SUPER_ADMIN
  );
  assert(
    customNightShift.totalWorkingHours === 9 &&
      customNightShift.totalScheduledHours === 9 &&
      customNightShift.breakMinutes === 30,
    `Custom NIGHT shift preserves Total Working Hours = 9 hrs/day; Break = 30 mins (got ${customNightShift.totalWorkingHours}, break ${customNightShift.breakMinutes})`
  );

  // -------------------------------------------------------------------------
  // 4. SPLIT Shift Support (Explicitly Configured Total Hours + Break Preservation)
  // -------------------------------------------------------------------------
  console.log('\n--- 4. SPLIT Shift Support (Explicitly Configured Total Working Hours & Break) ---');
  // Split shift with 2 segments (08:00-12:00 [4h, 15m break] + 13:00-18:00 [5h, 15m break])
  // Explicitly configured totalWorkingHours: 9 (and also test custom explicit totalWorkingHours: 8)
  const splitShift9 = await ShiftService.createShift(
    {
      shiftCode: 'WH-SPLIT-9',
      shiftName: 'Split Shift 9h With 30m Break',
      shiftType: 'SPLIT',
      totalWorkingHours: 9,
      breakMinutes: 30,
      weeklyOff: 'Sunday',
      isActive: true,
      segments: [
        { segmentSequence: 1, startTime: '08:00', endTime: '12:00', crossesMidnight: false, breakMinutes: 15 },
        { segmentSequence: 2, startTime: '13:00', endTime: '18:00', crossesMidnight: false, breakMinutes: 15 },
      ],
    },
    SUPER_ADMIN
  );

  assert(
    splitShift9.shiftType === 'SPLIT' && splitShift9.segments.length === 2,
    `Split shift WH-SPLIT-9 has 2 segments`
  );
  assert(
    splitShift9.segments[0].durationHours === 4 && splitShift9.segments[1].durationHours === 5,
    `Split shift segment durations do NOT subtract breaks (4h + 5h, got ${splitShift9.segments[0].durationHours}h + ${splitShift9.segments[1].durationHours}h)`
  );
  assert(
    splitShift9.totalWorkingHours === 9 && splitShift9.totalScheduledHours === 9,
    `Split shift uses configured Total Working Hours = 9 hrs/day (NOT 8.5), got ${splitShift9.totalWorkingHours}`
  );
  assert(
    splitShift9.breakMinutes === 30,
    `Split shift Break = 30 mins, got ${splitShift9.breakMinutes}`
  );

  // Also test split shift where explicitly configured totalWorkingHours (e.g. 8) differs from segment span (9)
  const splitShiftExplicit8 = await ShiftService.createShift(
    {
      shiftCode: 'WH-SPLIT-8',
      shiftName: 'Split Shift Explicit 8h Configured',
      shiftType: 'SPLIT',
      totalWorkingHours: 8,
      breakMinutes: 30,
      weeklyOff: 'Sunday',
      isActive: true,
      segments: [
        { segmentSequence: 1, startTime: '08:00', endTime: '12:30', crossesMidnight: false, breakMinutes: 15 },
        { segmentSequence: 2, startTime: '13:30', endTime: '18:00', crossesMidnight: false, breakMinutes: 15 },
      ],
    },
    SUPER_ADMIN
  );

  assert(
    splitShiftExplicit8.totalWorkingHours === 8 && splitShiftExplicit8.totalScheduledHours === 8,
    `Split shift with explicit totalWorkingHours=8 preserves 8 hrs/day (got ${splitShiftExplicit8.totalWorkingHours})`
  );
  assert(
    splitShiftExplicit8.breakMinutes === 30,
    `Split shift WH-SPLIT-8 preserves breakMinutes=30 (got ${splitShiftExplicit8.breakMinutes})`
  );

  // Reload from disk and verify both split shifts keep their authoritative totalWorkingHours and breakMinutes
  ShiftService.simulateServerRestart();
  const reloadedSplit9 = await ShiftService.getShiftByCode('WH-SPLIT-9');
  const reloadedSplit8 = await ShiftService.getShiftByCode('WH-SPLIT-8');
  assert(
    reloadedSplit9?.totalWorkingHours === 9 && reloadedSplit9?.breakMinutes === 30,
    `After reload: WH-SPLIT-9 retains Total Working Hours = 9 hrs/day; Break = 30 mins`
  );
  assert(
    reloadedSplit8?.totalWorkingHours === 8 && reloadedSplit8?.breakMinutes === 30,
    `After reload: WH-SPLIT-8 retains explicitly configured Total Working Hours = 8 hrs/day; Break = 30 mins`
  );

  // -------------------------------------------------------------------------
  // 5. Schedule Views & Working-Day Calculations Consistency
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Schedule Resolution & Working-Day Calculations ---');
  // Assign WH-DAY-9 (08:30-17:30, 9h, 30m break) to Employee 701
  await ShiftService.assignShiftToEmployee(
    {
      employeeId: 701,
      shiftId: afterSecondReload!.id,
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-31',
    },
    SUPER_ADMIN
  );

  const resolvedDay = await ShiftService.resolveEmployeeSchedule(701, '2026-10-05'); // Monday
  assert(
    resolvedDay.isWorkingDay === true &&
      resolvedDay.totalScheduledHours === 9 &&
      resolvedDay.totalWorkingHours === 9 &&
      resolvedDay.breakMinutes === 30 &&
      resolvedDay.segments[0]?.breakMinutes === 30,
    `Resolved schedule for WH-DAY-9 has Total Working Hours = 9 hrs/day; Break = 30 mins (got hours=${resolvedDay.totalWorkingHours}, break=${resolvedDay.breakMinutes})`
  );

  const emp701Assignments = await ShiftService.getEmployeeAssignments(701);
  assert(
    emp701Assignments[0]?.shift?.breakMinutes === 30 &&
      emp701Assignments[0]?.shift?.totalWorkingHours === 9,
    `Shift assignment for Employee 701 shows Break = 30 mins and Total Working Hours = 9 hrs`
  );

  // Verify COMPANY_DEFAULT fallback schedule uses 30 mins break and 9 hrs working time (08:30-17:30)
  const resolvedCompanyDefault = await ShiftService.resolveEmployeeSchedule(799, '2026-10-05'); // Unassigned employee on Monday
  assert(
    resolvedCompanyDefault.scheduleSource === 'COMPANY_DEFAULT' &&
      resolvedCompanyDefault.totalWorkingHours === 9 &&
      resolvedCompanyDefault.totalScheduledHours === 9 &&
      resolvedCompanyDefault.breakMinutes === 30 &&
      resolvedCompanyDefault.segments[0]?.breakMinutes === 30,
    `COMPANY_DEFAULT (08:30-17:30) resolves Total Working Hours = 9 hrs and Break = 30 mins (got hours=${resolvedCompanyDefault.totalWorkingHours}, break=${resolvedCompanyDefault.breakMinutes})`
  );

  // Verify creating a shift without explicit breakMinutes defaults to 30 mins and 9 hrs (08:30-17:30)
  const defaultBreakShift = await ShiftService.createShift(
    {
      shiftCode: 'WH-DEFAULT-BREAK',
      shiftName: 'Default Break 30m Shift',
      shiftType: 'DAY',
      startTime: '08:30',
      endTime: '17:30',
    },
    SUPER_ADMIN
  );
  assert(
    defaultBreakShift.totalWorkingHours === 9 &&
      defaultBreakShift.totalScheduledHours === 9 &&
      defaultBreakShift.breakMinutes === 30 &&
      defaultBreakShift.segments[0]?.breakMinutes === 30,
    `Shift created without explicit breakMinutes defaults to Break = 30 mins and Total Working Hours = 9 hrs (got hours=${defaultBreakShift.totalWorkingHours}, break=${defaultBreakShift.breakMinutes})`
  );

  const workingDaysDay = await WorkingDaysService.calculateWorkingDays('2026-10-05', '2026-10-07', 'FULL_DAY', {
    employeeId: 701,
  });
  assert(
    workingDaysDay.totalDays === 3 && workingDaysDay.totalWorkingHours === 27,
    `WorkingDaysService for 3 working days on 9h shift returns totalDays=3, totalWorkingHours=27 (got days=${workingDaysDay.totalDays}, hours=${workingDaysDay.totalWorkingHours})`
  );

  // Assign WH-SPLIT-8 (explicit 8h total, 30m break) to Employee 702
  await ShiftService.assignShiftToEmployee(
    {
      employeeId: 702,
      shiftId: reloadedSplit8!.id,
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-31',
    },
    SUPER_ADMIN
  );

  const resolvedSplit = await ShiftService.resolveEmployeeSchedule(702, '2026-10-05'); // Monday
  assert(
    resolvedSplit.isWorkingDay === true &&
      resolvedSplit.totalScheduledHours === 8 &&
      resolvedSplit.totalWorkingHours === 8 &&
      resolvedSplit.breakMinutes === 30,
    `Resolved schedule for WH-SPLIT-8 uses explicitly configured 8 hrs/day and Break = 30 mins (got hours=${resolvedSplit.totalWorkingHours}, break=${resolvedSplit.breakMinutes})`
  );

  const workingDaysSplit = await WorkingDaysService.calculateWorkingDays('2026-10-05', '2026-10-06', 'FULL_DAY', {
    employeeId: 702,
  });
  assert(
    workingDaysSplit.totalDays === 2 && workingDaysSplit.totalWorkingHours === 16,
    `WorkingDaysService for 2 working days on explicit 8h split shift returns totalDays=2, totalWorkingHours=16 (got days=${workingDaysSplit.totalDays}, hours=${workingDaysSplit.totalWorkingHours})`
  );

  // -------------------------------------------------------------------------
  // 6. UI Display Verification in ShiftScheduleAdmin.tsx & MySchedule.tsx
  // -------------------------------------------------------------------------
  console.log('\n--- 6. UI Display Verification ---');
  const adminTsx = fs.readFileSync(path.join(process.cwd(), 'src/components/ShiftScheduleAdmin.tsx'), 'utf8');
  assert(
    adminTsx.includes('Total Working Hours = {s.totalWorkingHours ?? s.totalScheduledHours ?? 0} hrs/day') &&
      adminTsx.includes('Break = {s.breakMinutes ?? 0} mins'),
    'ShiftScheduleAdmin.tsx displays "Total Working Hours = X hrs/day; Break = Y mins"'
  );

  console.log(`\n====================================================================`);
  console.log(`✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log(`====================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runWorkingHoursBreakRegressionTests().catch((err) => {
  console.error('Unhandled error in working hours regression suite:', err);
  process.exit(1);
});
