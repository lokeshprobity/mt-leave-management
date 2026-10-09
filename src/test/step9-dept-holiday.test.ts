import assert from 'assert';
import { HolidayService } from '../services/holidayService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { ShiftService } from '../services/shiftService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { UserService } from '../services/userService.ts';
import { ValidationError } from '../services/validation.ts';

async function runStep9Tests() {
  console.log('=== STARTING STEP 9: DEPARTMENT-WISE GOVERNMENT HOLIDAY CALENDAR SUITE ===');

  HolidayService.resetMemoryHolidays();

  // Test 1: Department-specific holiday creation
  console.log('\n--- 1. Department Holiday Provisioning ---');
  const hMaestro = await HolidayService.createHoliday({
    holidayDate: '2026-06-10',
    holidayName: 'Maestro Import Customs Day',
    departmentId: 5,
    description: 'Customs clearance annual holiday for Maestro_Import',
    isHalfDay: false,
    isOptional: false,
    isActive: true,
  });
  assert(hMaestro.id > 0, '1. Maestro Import holiday created');
  assert(hMaestro.departmentId === 5, '1b. Correct departmentId 5 attached');
  assert(hMaestro.departmentName === 'Maestro_Import', '1c. Correct departmentName resolved');
  console.log('[PASS] Test 1: Created department-specific holiday for Maestro_Import');

  const hTransport = await HolidayService.createHoliday({
    holidayDate: '2026-06-12',
    holidayName: 'A R Transportation Drivers Day',
    departmentId: 6,
    description: 'Annual fleet and driver celebration for A R Transportation',
    isHalfDay: false,
    isOptional: false,
    isActive: true,
  });
  assert(hTransport.id > 0, '2. A R Transportation holiday created');
  assert(hTransport.departmentId === 6, '2b. Correct departmentId 6 attached');
  assert(hTransport.departmentName === 'A R Transportation', '2c. Correct departmentName resolved');
  console.log('[PASS] Test 2: Created department-specific holiday for A R Transportation');

  // Test 3: Same date in different departments is permitted (no collision)
  console.log('\n--- 2. Multi-Department Date Independence ---');
  const hMaestroShared = await HolidayService.createHoliday({
    holidayDate: '2026-07-20',
    holidayName: 'Maestro Port Mid-Year Closure',
    departmentId: 5,
  });
  const hTransportShared = await HolidayService.createHoliday({
    holidayDate: '2026-07-20',
    holidayName: 'Transport Mid-Year Fleet Service',
    departmentId: 6,
  });
  assert(hMaestroShared.id !== hTransportShared.id, '3. Distinct IDs created for same date in different departments');
  console.log('[PASS] Test 3: Permitted separate holidays on the same date for distinct departments');

  // Test 4: Duplicate date within same department is blocked
  let duplicateThrew = false;
  try {
    await HolidayService.createHoliday({
      holidayDate: '2026-06-10',
      holidayName: 'Duplicate Maestro Day',
      departmentId: 5,
    });
  } catch (err: any) {
    duplicateThrew = true;
    assert(err instanceof ValidationError, '4a. Error is ValidationError');
    assert(err.message.includes('already configured'), '4b. Error message indicates duplicate');
  }
  assert(duplicateThrew, '4c. Duplicate holiday rejected for same department');
  console.log('[PASS] Test 4: Strict duplicate prevention within the same department');

  // Test 5: Working Days Calculation respects Department Scope
  console.log('\n--- 3. Working Days & Leave Calculation by Department ---');
  // Employee 501 in Maestro_Import (deptId: 5)
  // Employee 601 in A R Transportation (deptId: 6)
  ShiftService.setEmployeeDepartment(501, 5);
  ShiftService.setEmployeeDepartment(601, 6);

  // Date 2026-06-10 (Wednesday)
  // For Maestro_Import (501): Holiday -> 0 working days
  const resultMaestro = await WorkingDaysService.calculateWorkingDays('2026-06-10', '2026-06-10', 'FULL_DAY', {
    employeeId: 501,
  });
  assert(resultMaestro.totalDays === 0, '5a. Maestro employee has 0 working days on 2026-06-10');
  assert(resultMaestro.holidayDays.length === 1, '5b. Marked as holiday for Maestro employee');
  assert(resultMaestro.holidayDays[0].name === 'Maestro Import Customs Day', '5c. Correct holiday name in breakdown');

  // For A R Transportation (601): Normal working day -> 1 working day
  const resultTransport = await WorkingDaysService.calculateWorkingDays('2026-06-10', '2026-06-10', 'FULL_DAY', {
    employeeId: 601,
  });
  assert(resultTransport.totalDays === 1, '5d. Transport employee has 1 normal working day on 2026-06-10');
  assert(resultTransport.holidayDays.length === 0, '5e. No holiday for Transport employee on 2026-06-10');
  console.log('[PASS] Test 5: 2026-06-10 is a Holiday for Maestro_Import but a Working Day for A R Transportation');

  // Conversely, 2026-06-12 (Friday):
  // For A R Transportation (601): Holiday -> 0 working days
  const resultTransportFriday = await WorkingDaysService.calculateWorkingDays('2026-06-12', '2026-06-12', 'FULL_DAY', {
    employeeId: 601,
  });
  assert(resultTransportFriday.totalDays === 0, '6a. Transport employee has 0 working days on 2026-06-12');
  assert(resultTransportFriday.holidayDays.length === 1, '6b. Marked as holiday for Transport employee');

  // For Maestro_Import (501): Normal working day -> 1 working day
  const resultMaestroFriday = await WorkingDaysService.calculateWorkingDays('2026-06-12', '2026-06-12', 'FULL_DAY', {
    employeeId: 501,
  });
  assert(resultMaestroFriday.totalDays === 1, '6c. Maestro employee has 1 normal working day on 2026-06-12');
  console.log('[PASS] Test 6: 2026-06-12 is a Holiday for A R Transportation but a Working Day for Maestro_Import');

  // Test 7: Company-wide public holidays apply to all departments
  console.log('\n--- 4. Company-Wide Base Holidays ---');
  // 2026-01-26 is Republic Day (Monday)
  const repDayMaestro = await WorkingDaysService.calculateWorkingDays('2026-01-26', '2026-01-26', 'FULL_DAY', {
    employeeId: 501,
  });
  const repDayTransport = await WorkingDaysService.calculateWorkingDays('2026-01-26', '2026-01-26', 'FULL_DAY', {
    employeeId: 601,
  });
  assert(repDayMaestro.totalDays === 0 && repDayMaestro.holidayDays.length === 1, '7a. Republic Day is holiday for Maestro');
  assert(repDayTransport.totalDays === 0 && repDayTransport.holidayDays.length === 1, '7b. Republic Day is holiday for Transport');
  console.log('[PASS] Test 7: Company-wide public holidays apply to all departments seamlessly');

  // Test 8: Employee department transfer updates applicable calendar
  console.log('\n--- 5. Dynamic Department Transfer ---');
  // Employee 701 initially in Maestro_Import
  ShiftService.setEmployeeDepartment(701, 5);
  const beforeTransfer = await WorkingDaysService.calculateWorkingDays('2026-06-10', '2026-06-10', 'FULL_DAY', {
    employeeId: 701,
  });
  assert(beforeTransfer.totalDays === 0, '8a. In Maestro_Import: 2026-06-10 is a holiday');

  // Transfer to A R Transportation
  ShiftService.setEmployeeDepartment(701, 6);
  const afterTransfer = await WorkingDaysService.calculateWorkingDays('2026-06-10', '2026-06-10', 'FULL_DAY', {
    employeeId: 701,
  });
  assert(afterTransfer.totalDays === 1, '8b. In A R Transportation: 2026-06-10 is now a regular working day');
  console.log('[PASS] Test 8: Employee department change automatically shifts to the new department holiday calendar');

  // Test 9: Shift Schedule Resolution respects Department Holidays
  console.log('\n--- 6. Shift Schedule Integration ---');
  const schedMaestro = await ShiftService.resolveEmployeeSchedule(501, '2026-06-10');
  assert(schedMaestro.isHoliday === true, '9a. Schedule correctly marks isHoliday = true for Maestro employee');

  const schedTransport = await ShiftService.resolveEmployeeSchedule(601, '2026-06-10');
  assert(schedTransport.isHoliday === false, '9b. Schedule correctly marks isHoliday = false for Transport employee');
  console.log('[PASS] Test 9: Shift schedule resolution accurately reflects department holiday calendars');

  // Test 10: Maestro CFS Department Holiday + Full E2E Leave Deduction Chain
  console.log('\n--- 7. End-to-End Multi-Department Leave Deduction Chain (Maestro_Import, A R Transportation, Maestro CFS) ---');
  const hCfs = await HolidayService.createHoliday({
    holidayDate: '2026-06-11',
    holidayName: 'Maestro CFS Container Yard Inspection Day',
    departmentId: 7, // Maestro CFS
    isHalfDay: false,
    isOptional: false,
    isActive: true,
  });
  assert(hCfs.departmentName === 'Maestro CFS', '10a. Maestro CFS holiday created with departmentName');

  // Employee 101 in Maestro_Import (deptId 5) vs Employee 102 in A R Transportation (deptId 6)
  // Both apply for 2026-06-10 to 2026-06-11 (2 calendar weekdays: Wed Jun 10 & Thu Jun 11)
  // For Maestro_Import (101): 2026-06-10 is a department holiday, so only 1.0 working day is deducted!
  // For A R Transportation (102): neither Jun 10 nor Jun 11 is a holiday (their holiday is Jun 12), so 2.0 working days are deducted!
  ShiftService.setEmployeeDepartment(101, 5); // Maestro_Import
  ShiftService.setEmployeeDepartment(102, 6); // A R Transportation

  const reqMaestro = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-06-10',
      endDate: '2026-06-11',
      dayType: 'FULL_DAY',
      reason: 'Personal work across June 10-11',
      applicationTimestampOverride: '2026-05-25T09:00:00Z',
    },
    { userId: 101, employeeId: 101, username: 'emp_maestro', role: 'EMPLOYEE' }
  );

  const reqTransport = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-06-10',
      endDate: '2026-06-11',
      dayType: 'FULL_DAY',
      reason: 'Personal work across June 10-11',
      applicationTimestampOverride: '2026-05-25T09:00:00Z',
    },
    { userId: 102, employeeId: 102, username: 'emp_transport', role: 'EMPLOYEE' }
  );

  assert(
    Number(reqMaestro.totalDays) === 1,
    `10b. Maestro_Import employee charged 1.0 leave day for Jun 10-11 (got ${reqMaestro.totalDays})`
  );
  assert(
    Number(reqTransport.totalDays) === 2,
    `10c. A R Transportation employee charged 2.0 leave days for Jun 10-11 (got ${reqTransport.totalDays})`
  );
  console.log('[PASS] Test 10: Full leave-day deduction chain independently honors Maestro_Import, A R Transportation, and Maestro CFS holiday calendars');

  console.log('\n=== ALL STEP 9 DEPARTMENT-WISE HOLIDAY CALENDAR TESTS PASSED! ===');
}

runStep9Tests().catch((err) => {
  console.error('STEP 9 TEST SUITE FAILED:', err);
  process.exit(1);
});
