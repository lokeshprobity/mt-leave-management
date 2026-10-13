import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { WorkingDaysService } from '../services/workingDaysService.ts';

async function runWeeklyOffNamesTests() {
  console.log('\n============================================================');
  console.log('--- TEST SUITE: WEEKLY OFF WEEKDAY NAMES & CALCULATIONS ---');
  console.log('============================================================\n');

  const EXPECTED_DAYS = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  // 1. Verify default 7-day schedule has all seven complete English weekday names
  console.log('1. Verifying default WorkingDaysService 7-day schedule...');
  const defaultSchedule = await WorkingDaysService.getWorkingDaysSchedule();
  assert.strictEqual(defaultSchedule.length, 7, 'Schedule must contain exactly 7 days');
  
  const scheduleDayNames = defaultSchedule.map((d) => d.dayName);
  for (const expected of EXPECTED_DAYS) {
    assert.ok(
      scheduleDayNames.includes(expected),
      `Schedule must include complete English weekday name: ${expected}`
    );
  }
  console.log('   [PASS] All 7 complete English weekday names present in default schedule.');

  // 2. Verify Monday-Saturday are working days and Sunday is weekly off by default
  console.log('\n2. Verifying default working days vs weekly off...');
  const sunday = defaultSchedule.find((d) => d.dayOfWeek === 0);
  assert.strictEqual(sunday?.dayName, 'Sunday', 'Day index 0 must be Sunday');
  assert.strictEqual(sunday?.isWorkingDay, false, 'Sunday must default to Weekly Off (isWorkingDay: false)');

  const monday = defaultSchedule.find((d) => d.dayOfWeek === 1);
  assert.strictEqual(monday?.dayName, 'Monday', 'Day index 1 must be Monday');
  assert.strictEqual(monday?.isWorkingDay, true, 'Monday must default to Working Day (isWorkingDay: true)');

  const saturday = defaultSchedule.find((d) => d.dayOfWeek === 6);
  assert.strictEqual(saturday?.dayName, 'Saturday', 'Day index 6 must be Saturday');
  assert.strictEqual(saturday?.isWorkingDay, true, 'Saturday must default to Working Day (isWorkingDay: true)');
  console.log('   [PASS] Monday-Saturday working, Sunday weekly off default preserved.');

  // 3. Verify date calculation logic with Sunday off
  console.log('\n3. Verifying working-day/leave-day calculation logic...');
  // Mon 2026-11-02 to Sun 2026-11-08: 7 calendar days => 6 working days (Mon-Sat), 1 weekly off (Sun)
  const calcResult = await WorkingDaysService.calculateWorkingDays('2026-11-02', '2026-11-08', 'FULL_DAY');
  assert.strictEqual(calcResult.totalDays, 6, 'Must calculate exactly 6 working days for full Mon-Sun week');
  assert.strictEqual(calcResult.weeklyOffDays.length, 1, 'Must identify exactly 1 weekly off day (Sunday)');
  assert.strictEqual(calcResult.weeklyOffDays[0], '2026-11-08', 'Weekly off date must be 2026-11-08 (Sunday)');
  console.log('   [PASS] Working-day/leave-day calculation correctly excludes Sunday weekly off.');

  // 4. Verify UI component sources display all seven complete English weekday names without truncation
  console.log('\n4. Verifying UI source files contain complete English weekday names...');
  const holidayAdminCode = fs.readFileSync(path.resolve('src/components/HolidayCalendarAdmin.tsx'), 'utf-8');
  for (const day of EXPECTED_DAYS) {
    assert.ok(
      holidayAdminCode.includes(day),
      `HolidayCalendarAdmin.tsx must include complete English name: ${day}`
    );
  }

  const workingDaysAdminCode = fs.readFileSync(path.resolve('src/components/admin/WorkingDaysAdmin.tsx'), 'utf-8');
  for (const day of EXPECTED_DAYS) {
    assert.ok(
      workingDaysAdminCode.includes(day),
      `WorkingDaysAdmin.tsx must include complete English name: ${day}`
    );
  }

  const employeeAdminCode = fs.readFileSync(path.resolve('src/components/admin/EmployeeAdmin.tsx'), 'utf-8');
  for (const day of EXPECTED_DAYS) {
    assert.ok(
      employeeAdminCode.includes(day),
      `EmployeeAdmin.tsx must include complete English name: ${day}`
    );
  }
  console.log('   [PASS] All UI components contain complete English weekday names without truncation.');

  console.log('\n============================================================');
  console.log('[ALL TESTS PASSED] WEEKLY OFF WEEKDAY NAMES VERIFIED!');
  console.log('============================================================\n');
}

runWeeklyOffNamesTests().catch((err) => {
  console.error('[TEST FAILED]', err);
  process.exit(1);
});
