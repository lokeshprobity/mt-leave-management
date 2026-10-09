import { ShiftService } from '../services/shiftService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { HolidayService } from '../services/holidayService.ts';
import { LeaveClassificationService } from '../services/leaveClassificationService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { AuthContext } from '../types/leave.ts';

const ADMIN_AUTH: AuthContext = {
  userId: 1,
  username: 'super_admin',
  role: 'SUPER_ADMIN',
  employeeId: 999,
};

const HR_AUTH: AuthContext = {
  userId: 2,
  username: 'hr_manager',
  role: 'HR',
  employeeId: 501,
};

const EMP_AUTH: AuthContext = {
  userId: 101,
  username: 'emp_rahul',
  role: 'EMPLOYEE',
  employeeId: 101,
};

async function runStep7RegressionTests() {
  console.log('=== STARTING STEP 7 SHIFT & WORK SCHEDULE REGRESSION TEST SUITE ===');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  function resetState() {
    ShiftService.resetMemoryStores();
    WorkingDaysService.resetMemoryHolidays();
    LeaveService.resetMemoryStores();
    LeaveRequestService.resetMemoryStores();
  }

  resetState();

  try {
    // ----------------------------------------------------
    // TEST 1: Default initial shifts seeded correctly
    // ----------------------------------------------------
    const allShifts = await ShiftService.getShifts({ includeInactive: true });
    assert(
      allShifts.length >= 3,
      'Test 1: Pre-configured seed shifts exist (Day, Night, Split)',
      `Found ${allShifts.length} shifts`
    );

    // ----------------------------------------------------
    // TEST 2: Night shift (crosses midnight) calculates duration correctly without negative values
    // ----------------------------------------------------
    const nightShift = allShifts.find((s) => s.shiftCode === 'NIGHT_SHIFT');
    assert(
      Boolean(nightShift && nightShift.segments[0].crossesMidnight),
      'Test 2: Night shift has crossesMidnight flag set to true'
    );
    // 20:30 to 08:30 next day = 12 hours total (includes 1 hr break; break is NOT subtracted)
    const nightDuration = ShiftService.calculateSegmentDuration('20:30', '08:30', true, 60);
    assert(
      nightDuration === 12.0,
      'Test 2b: Overnight segment duration calculates accurately (12.0 hrs including break)',
      `Got ${nightDuration}`
    );

    // ----------------------------------------------------
    // TEST 3: Split shift with multiple segments
    // ----------------------------------------------------
    const splitShift = allShifts.find((s) => s.shiftCode === 'SPLIT_SHIFT');
    assert(
      Boolean(splitShift && splitShift.segments.length === 2),
      'Test 3: Split shift contains two normalized segments on same date',
      `Found ${splitShift?.segments.length} segments`
    );
    assert(
      splitShift?.totalScheduledHours === 9.0,
      'Test 3b: Split shift total scheduled hours matches sum of segments (3 + 6 = 9 hrs)',
      `Got ${splitShift?.totalScheduledHours}`
    );

    // ----------------------------------------------------
    // TEST 4: Validation rejects overlapping segments in a shift
    // ----------------------------------------------------
    let overlapRejected = false;
    try {
      ShiftService.validateSegments([
        { startTime: '08:00', endTime: '14:00', crossesMidnight: false },
        { startTime: '12:00', endTime: '18:00', crossesMidnight: false },
      ]);
    } catch (e: any) {
      overlapRejected = true;
    }
    assert(overlapRejected, 'Test 4: Shift validator rejects overlapping segments on same business date');

    // ----------------------------------------------------
    // TEST 5: Create a new custom shift by SUPER_ADMIN / HR
    // ----------------------------------------------------
    const newShift = await ShiftService.createShift(
      {
        shiftCode: 'ROTATING_EVENING',
        shiftName: 'Rotating Evening Shift',
        description: '14:00 to 22:30 with 30 min break',
        isActive: true,
        segments: [
          {
            segmentSequence: 1,
            startTime: '14:00',
            endTime: '22:30',
            crossesMidnight: false,
            breakMinutes: 30,
          },
        ],
      },
      ADMIN_AUTH
    );
    assert(
      newShift.shiftCode === 'ROTATING_EVENING' && newShift.totalScheduledHours === 8.5 && newShift.breakMinutes === 30,
      'Test 5: Successfully created new shift with calculated duration (8.5 hrs including 30m break)',
      `Got ${newShift.totalScheduledHours}`
    );

    // ----------------------------------------------------
    // TEST 6: Unauthorized role cannot create a shift (RBAC)
    // ----------------------------------------------------
    let empCreateBlocked = false;
    try {
      await ShiftService.createShift(
        {
          shiftCode: 'HACKED_SHIFT',
          shiftName: 'Hacked Shift',
          segments: [{ startTime: '09:00', endTime: '17:00' }],
        },
        EMP_AUTH
      );
    } catch {
      empCreateBlocked = true;
    }
    assert(empCreateBlocked, 'Test 6: EMPLOYEE role cannot create shifts (strictly 403 Forbidden)');

    // ----------------------------------------------------
    // TEST 7: Assign shift to employee with effective date range
    // ----------------------------------------------------
    const assignment = await ShiftService.assignShiftToEmployee(
      {
        employeeId: 101,
        shiftId: newShift.id,
        effectiveFrom: '2026-06-01',
        effectiveTo: '2026-06-30',
        workDaysOfWeek: '1,2,3,4,5',
      },
      HR_AUTH
    );
    assert(
      assignment.employeeId === 101 && assignment.shiftId === newShift.id,
      'Test 7: Assigned ROTATING_EVENING shift to employee 101 for June 2026'
    );

    // ----------------------------------------------------
    // TEST 8: Prevent overlapping active shift assignment for same employee
    // ----------------------------------------------------
    let duplicateAssignmentBlocked = false;
    try {
      await ShiftService.assignShiftToEmployee(
        {
          employeeId: 101,
          shiftId: 1, // standard shift
          effectiveFrom: '2026-06-15',
          effectiveTo: '2026-07-15',
        },
        HR_AUTH
      );
    } catch {
      duplicateAssignmentBlocked = true;
    }
    assert(
      duplicateAssignmentBlocked,
      'Test 8: System strictly blocks overlapping active shift assignments for the same employee'
    );

    // ----------------------------------------------------
    // TEST 9: Schedule Resolution Hierarchy — Within assignment date
    // ----------------------------------------------------
    const juneSchedule = await ShiftService.resolveEmployeeSchedule(101, '2026-06-10'); // Wednesday
    assert(
      juneSchedule.scheduleSource === 'EMPLOYEE_SHIFT' &&
        juneSchedule.shiftCode === 'ROTATING_EVENING' &&
        juneSchedule.earliestStartTime === '14:00',
      'Test 9: Schedule resolution uses employee-specific shift assignment within effective window',
      `Got source: ${juneSchedule.scheduleSource}, code: ${juneSchedule.shiftCode}`
    );

    // ----------------------------------------------------
    // TEST 10: Schedule Resolution Hierarchy — Outside assignment date (Fallback to Company Default)
    // ----------------------------------------------------
    const julySchedule = await ShiftService.resolveEmployeeSchedule(101, '2026-07-15'); // Wednesday after assignment expired
    assert(
      julySchedule.scheduleSource === 'COMPANY_DEFAULT' &&
        julySchedule.earliestStartTime === '08:30',
      'Test 10: Dates outside employee shift assignment fallback cleanly to Company Default office timing',
      `Got source: ${julySchedule.scheduleSource}, start: ${julySchedule.earliestStartTime}`
    );

    // ----------------------------------------------------
    // TEST 11: Schedule Resolution on Holiday overrides shift to OFF
    // ----------------------------------------------------
    // Add a holiday on June 10
    await HolidayService.createHoliday({
      holidayName: 'Special Company Day',
      holidayDate: '2026-06-10',
      isOptional: false,
    });

    const holidaySchedule = await ShiftService.resolveEmployeeSchedule(101, '2026-06-10');
    assert(
      !holidaySchedule.isWorkingDay && holidaySchedule.isHoliday && holidaySchedule.holidayName === 'Special Company Day',
      'Test 11: Holidays override scheduled shift so the day is recognized as OFF / Holiday'
    );

    // ----------------------------------------------------
    // TEST 12: Schedule Resolution on Weekly Off Day
    // ----------------------------------------------------
    const sundaySchedule = await ShiftService.resolveEmployeeSchedule(101, '2026-06-07'); // Sunday (0)
    assert(
      !sundaySchedule.isWorkingDay && sundaySchedule.isWeeklyOff,
      'Test 12: Weekly-off days are recognized as OFF'
    );

    // ----------------------------------------------------
    // TEST 13: Leave calculation preserves 1 FULL-DAY LEAVE = 1 LEAVE DAY
    // Regardless of whether shift is 8 hrs, 9 hrs, or 12 hrs night shift!
    // ----------------------------------------------------
    // Assign night shift (12 hours) to employee 102
    await ShiftService.assignShiftToEmployee(
      {
        employeeId: 102,
        shiftId: 2, // NIGHT_SHIFT
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-08-31',
        workDaysOfWeek: '1,2,3,4,5',
      },
      HR_AUTH
    );

    const workingDaysCalc = await WorkingDaysService.calculateWorkingDays(
      '2026-08-03', // Monday
      '2026-08-05', // Wednesday (3 days)
      'FULL_DAY',
      { employeeId: 102 }
    );
    assert(
      workingDaysCalc.totalDays === 3.0,
      'Test 13: Full-day leave for night-shift employee counts as 3 full leave days (NOT fractional hours)',
      `Got totalDays: ${workingDaysCalc.totalDays}`
    );

    // ----------------------------------------------------
    // TEST 14: Half-day leave calculation preserves 0.5 LEAVE DAY
    // ----------------------------------------------------
    const halfDayCalc = await WorkingDaysService.calculateWorkingDays(
      '2026-08-03',
      '2026-08-03',
      'HALF_DAY',
      { employeeId: 102 }
    );
    assert(
      halfDayCalc.totalDays === 0.5,
      'Test 14: Half-day leave for shift employee counts as exactly 0.5 leave day',
      `Got totalDays: ${halfDayCalc.totalDays}`
    );

    // ----------------------------------------------------
    // TEST 15: Shift-Aware Timing Classification — Evening shift same-day leave
    // An employee on 14:00 shift applying at 11:00 AM on same day is NORMAL leave,
    // whereas on standard 08:30 shift, 11:00 AM would be POST_START!
    // ----------------------------------------------------
    const eveningClassified = await LeaveClassificationService.classifyLeaveRequest(
      '2026-06-15T11:00:00+05:30', // 11:00 AM on June 15
      '2026-06-15',
      undefined,
      { employeeId: 101 } // has 14:00 shift
    );
    assert(
      eveningClassified.classification === 'LATE_LEAVE_REQUEST' ||
        eveningClassified.classification === 'NORMAL_LEAVE_REQUEST',
      'Test 15: 11:00 AM application for a 14:00 shift is evaluated before shift start (NOT post-start)',
      `Got classification: ${eveningClassified.classification}`
    );

    // ----------------------------------------------------
    // TEST 16: Post-start classification on evening shift
    // Applying at 14:30 for a 14:00 shift is POST_START
    // ----------------------------------------------------
    const postStartClassified = await LeaveClassificationService.classifyLeaveRequest(
      '2026-06-15T14:30:00+05:30', // 14:30 on June 15
      '2026-06-15',
      undefined,
      { employeeId: 101 } // shift starts at 14:00
    );
    assert(
      postStartClassified.classification === 'POST_START_LEAVE_REQUEST' && postStartClassified.isPostStart,
      'Test 16: Application after shift start time (14:30 vs 14:00) is classified as POST_START',
      `Got: ${postStartClassified.classification}`
    );

    // ----------------------------------------------------
    // TEST 17: Shift-aware Leave Request Preview
    // ----------------------------------------------------
    const preview = await LeaveRequestService.calculatePreview(
      {
        leaveTypeId: 1, // CL
        startDate: '2026-06-16', // Tuesday
        endDate: '2026-06-17', // Wednesday
        dayType: 'FULL_DAY',
      },
      EMP_AUTH
    );
    assert(
      preview.totalWorkingDays === 2.0 && preview.workingDays.length === 2,
      'Test 17: Leave request preview calculates 2 working days accurately for shift employee'
    );

    // ----------------------------------------------------
    // TEST 18: Range Schedule Resolver
    // ----------------------------------------------------
    const rangeSchedules = await ShiftService.resolveEmployeeScheduleRange(101, '2026-06-01', '2026-06-05');
    assert(
      rangeSchedules.length === 5,
      'Test 18: Multi-day schedule range resolver returns 5 daily schedules',
      `Got ${rangeSchedules.length} days`
    );

    // ----------------------------------------------------
    // TEST 19: Cross-midnight next day indicator
    // ----------------------------------------------------
    const nightSched = await ShiftService.resolveEmployeeSchedule(102, '2026-08-04');
    assert(
      nightSched.segments[0].crossesMidnight && nightSched.segments[0].nextDayIndicator,
      'Test 19: Night shift daily schedule indicates overnight +1 day next morning transition'
    );

    // ----------------------------------------------------
    // TEST 20: Regression safety — Standard company default fallback
    // ----------------------------------------------------
    const unassignedSchedule = await ShiftService.resolveEmployeeSchedule(999, '2026-09-02'); // Wednesday
    assert(
      unassignedSchedule.scheduleSource === 'COMPANY_DEFAULT' &&
        unassignedSchedule.segments[0].startTime === '08:30' &&
        unassignedSchedule.segments[0].endTime === '17:30',
      'Test 20: Unassigned employee seamlessly resolves to standard 08:30 - 17:30 company schedule'
    );

    // ----------------------------------------------------
    // TEST 21: Cross-Midnight Night Shift Cutoff Timing Classification
    // Shift starts at 20:30 on business date T
    // ----------------------------------------------------
    const nightBeforeStart = await LeaveClassificationService.classifyLeaveRequest(
      '2026-08-04T18:00:00+05:30', // 18:00 on Aug 4 (2.5 hrs before 20:30 start)
      '2026-08-04',
      undefined,
      { employeeId: 102 }
    );
    assert(
      !nightBeforeStart.isPostStart,
      'Test 21a: 18:00 application on date T for 20:30 night shift is correctly BEFORE shift start (not post-start)',
      `Got classification: ${nightBeforeStart.classification}`
    );

    const nightAfterStart = await LeaveClassificationService.classifyLeaveRequest(
      '2026-08-04T21:00:00+05:30', // 21:00 on Aug 4 (30 mins after 20:30 start)
      '2026-08-04',
      undefined,
      { employeeId: 102 }
    );
    assert(
      nightAfterStart.isPostStart && nightAfterStart.classification === 'POST_START_LEAVE_REQUEST',
      'Test 21b: 21:00 application on date T for 20:30 night shift is correctly classified as POST_START'
    );

    // ----------------------------------------------------
    // TEST 22: Split Shift Resolution and Leave Day Conservation
    // ----------------------------------------------------
    await ShiftService.assignShiftToEmployee(
      {
        employeeId: 103,
        shiftId: 3, // SPLIT_SHIFT (05:30-08:30 & 17:00-23:00)
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-09-30',
        workDaysOfWeek: '1,2,3,4,5',
      },
      HR_AUTH
    );

    const splitSched = await ShiftService.resolveEmployeeSchedule(103, '2026-09-02'); // Wednesday
    assert(
      splitSched.scheduleSource === 'EMPLOYEE_SHIFT' &&
        splitSched.segments.length === 2 &&
        splitSched.earliestStartTime === '05:30' &&
        splitSched.latestEndTime === '23:00' &&
        splitSched.totalScheduledHours === 9.0,
      'Test 22a: Split shift resolves both segments (05:30 and 17:00) on single business date',
      `Got segments: ${splitSched.segments.length}, totalHours: ${splitSched.totalScheduledHours}`
    );

    const splitDaysCalc = await WorkingDaysService.calculateWorkingDays(
      '2026-09-02',
      '2026-09-02',
      'FULL_DAY',
      { employeeId: 103 }
    );
    assert(
      splitDaysCalc.totalDays === 1.0,
      'Test 22b: 1 Full-day leave on a split shift consumes exactly 1.0 leave day (all segments covered)'
    );

    // ----------------------------------------------------
    // TEST 23: Split Shift Timing Classification (Earliest Segment Start 05:30)
    // ----------------------------------------------------
    const splitBefore = await LeaveClassificationService.classifyLeaveRequest(
      '2026-09-02T05:00:00+05:30', // 05:00 (before 05:30)
      '2026-09-02',
      undefined,
      { employeeId: 103 }
    );
    assert(
      !splitBefore.isPostStart,
      'Test 23a: Application before earliest segment start (05:00 vs 05:30) is NOT post-start'
    );

    const splitAfter = await LeaveClassificationService.classifyLeaveRequest(
      '2026-09-02T06:00:00+05:30', // 06:00 (after 05:30)
      '2026-09-02',
      undefined,
      { employeeId: 103 }
    );
    assert(
      splitAfter.isPostStart && splitAfter.classification === 'POST_START_LEAVE_REQUEST',
      'Test 23b: Application after earliest segment start (06:00 vs 05:30) is POST_START'
    );

    // ----------------------------------------------------
    // TEST 24: Department Shift Hierarchy (Tier 2 Resolution)
    // ----------------------------------------------------
    ShiftService.setEmployeeDepartment(104, 5); // Employee 104 in Dept 5
    await ShiftService.assignShiftToDepartment(
      {
        departmentId: 5,
        shiftId: 3, // SPLIT_SHIFT
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-09-30',
        workDaysOfWeek: '1,2,3,4,5',
      },
      HR_AUTH
    );

    const deptResolved = await ShiftService.resolveEmployeeSchedule(104, '2026-09-03'); // Thursday
    assert(
      deptResolved.scheduleSource === 'DEPARTMENT_SHIFT' &&
        deptResolved.shiftCode === 'SPLIT_SHIFT',
      'Test 24: Employee without individual shift inherits Department Shift (Tier 2)',
      `Got source: ${deptResolved.scheduleSource}, code: ${deptResolved.shiftCode}`
    );

    // ----------------------------------------------------
    // TEST 25: Precedence: Tier 1 Employee Shift Overrides Tier 2 Department Shift
    // ----------------------------------------------------
    ShiftService.setEmployeeDepartment(105, 5); // Also in Dept 5
    await ShiftService.assignShiftToEmployee(
      {
        employeeId: 105,
        shiftId: 1, // DAY_STANDARD
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-09-30',
        workDaysOfWeek: '1,2,3,4,5',
      },
      HR_AUTH
    );

    const precedenceResolved = await ShiftService.resolveEmployeeSchedule(105, '2026-09-03');
    assert(
      precedenceResolved.scheduleSource === 'EMPLOYEE_SHIFT' &&
        precedenceResolved.shiftCode === 'DAY_STANDARD',
      'Test 25: Individual Employee Shift strictly takes precedence over Department Shift'
    );

    // ----------------------------------------------------
    // TEST 26: Half-Day Holiday Interaction
    // ----------------------------------------------------
    await HolidayService.createHoliday({
      holidayName: 'Half-Day Festival',
      holidayDate: '2026-09-04',
      isOptional: false,
      isHalfDay: true,
    });

    const halfDayHolidaySchedule = await ShiftService.resolveEmployeeSchedule(105, '2026-09-04');
    assert(
      halfDayHolidaySchedule.isWorkingDay &&
        halfDayHolidaySchedule.isHoliday &&
        Boolean(halfDayHolidaySchedule.isHalfDayHoliday),
      'Test 26: Half-day holiday keeps day as working day with half-day holiday flag set',
      `isWorking: ${halfDayHolidaySchedule.isWorkingDay}, isHalfDayHoliday: ${halfDayHolidaySchedule.isHalfDayHoliday}`
    );

    // ----------------------------------------------------
    // TEST 27: Multi-segment shift (> 2 segments)
    // ----------------------------------------------------
    const multiSegmentShift = await ShiftService.createShift(
      {
        shiftCode: 'TRIPLE_SEGMENT',
        shiftName: 'Triple Segment Shift',
        description: '3 separated shifts: 06:00-09:00, 12:00-15:00, 18:00-21:00',
        isActive: true,
        segments: [
          { segmentSequence: 1, startTime: '06:00', endTime: '09:00', crossesMidnight: false, breakMinutes: 0 },
          { segmentSequence: 2, startTime: '12:00', endTime: '15:00', crossesMidnight: false, breakMinutes: 0 },
          { segmentSequence: 3, startTime: '18:00', endTime: '21:00', crossesMidnight: false, breakMinutes: 0 },
        ],
      },
      ADMIN_AUTH
    );
    assert(
      multiSegmentShift.segments.length === 3 && multiSegmentShift.totalScheduledHours === 9.0,
      'Test 27: Shift with > 2 segments (3 segments) creates and calculates cleanly (9.0 hrs)'
    );

    // ----------------------------------------------------
    // TEST 28: Validation blocks break duration exceeding or equal to working duration
    // ----------------------------------------------------
    let breakBlocked = false;
    try {
      ShiftService.calculateSegmentDuration('09:00', '10:00', false, 60); // 60 min break on 60 min shift
    } catch {
      breakBlocked = true;
    }
    assert(breakBlocked, 'Test 28: System rejects break duration that equals or exceeds gross shift duration');

  } catch (err: any) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log(`\n=== STEP 7 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runStep7RegressionTests().catch((e) => {
  console.error('Regression suite failed fatally:', e);
  process.exit(1);
});
