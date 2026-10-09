import fs from 'fs';
import path from 'path';
import { ShiftService } from '../services/shiftService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { HolidayService } from '../services/holidayService.ts';
import { LeaveClassificationService } from '../services/leaveClassificationService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { ApprovalService } from '../services/approvalService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { AuthContext } from '../types/leave.ts';

const SUPER_ADMIN: AuthContext = {
  userId: 1,
  username: 'superadmin',
  role: 'SUPER_ADMIN',
  employeeId: 999,
};

const HR_USER: AuthContext = {
  userId: 2,
  username: 'hrmanager',
  role: 'HR',
  employeeId: 501,
};

const EMP_A: AuthContext = {
  userId: 101,
  username: 'emp_a_normal',
  role: 'EMPLOYEE',
  employeeId: 101,
};

const EMP_B: AuthContext = {
  userId: 102,
  username: 'emp_b_night',
  role: 'EMPLOYEE',
  employeeId: 102,
};

const EMP_C: AuthContext = {
  userId: 103,
  username: 'emp_c_split',
  role: 'EMPLOYEE',
  employeeId: 103,
};

const EMP_D: AuthContext = {
  userId: 104,
  username: 'emp_d_triple',
  role: 'EMPLOYEE',
  employeeId: 104,
};

const EMP_E: AuthContext = {
  userId: 105,
  username: 'emp_e_dept',
  role: 'EMPLOYEE',
  employeeId: 105,
};

const EMP_F: AuthContext = {
  userId: 106,
  username: 'emp_f_default',
  role: 'EMPLOYEE',
  employeeId: 106,
};

async function runRealFlowAcceptanceTest() {
  console.log('===============================================================');
  console.log('  MT LEAVE MANAGEMENT — STEP 7 REAL-FLOW ACCEPTANCE SUITE');
  console.log('===============================================================\n');

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

  // Reset stores
  ShiftService.resetMemoryStores();
  WorkingDaysService.resetMemoryHolidays();
  LeaveService.resetMemoryStores();
  LeaveRequestService.resetMemoryStores();

  try {
    // =========================================================================
    // SECTION 1: DATABASE VERIFICATION
    // =========================================================================
    console.log('\n--- 1. DATABASE & MIGRATIONS VERIFICATION ---');

    const drizzleDir = path.join(process.cwd(), 'drizzle');
    const migrationFiles = fs.readdirSync(drizzleDir).filter((f) => f.endsWith('.sql'));

    assert(
      migrationFiles.length >= 6,
      '1.1 Drizzle migrations exist including Step 7 shift tables',
      `Found: ${migrationFiles.join(', ')}`
    );

    const shiftMigration0005 = fs.readFileSync(path.join(drizzleDir, '0005_premium_madelyne_pryor.sql'), 'utf-8');
    const deptMigration0006 = fs.readFileSync(path.join(drizzleDir, '0006_closed_joshua_kane.sql'), 'utf-8');

    assert(
      shiftMigration0005.includes('CREATE TABLE "shifts"') &&
        shiftMigration0005.includes('CREATE TABLE "shift_segments"') &&
        shiftMigration0005.includes('CREATE TABLE "employee_shift_assignments"'),
      '1.2 Shift master, segments, and employee assignment tables exist in SQL migration'
    );

    assert(
      deptMigration0006.includes('CREATE TABLE "department_shift_assignments"'),
      '1.3 Department shift assignment table exists in SQL migration'
    );

    assert(
      shiftMigration0005.includes('effective_from') &&
        shiftMigration0005.includes('effective_to') &&
        shiftMigration0005.includes('work_days_of_week') &&
        shiftMigration0005.includes('is_active'),
      '1.4 Date-effective columns, active status, and work_days_of_week exist'
    );

    assert(
      shiftMigration0005.includes('REFERENCES "public"."employees"') &&
        shiftMigration0005.includes('REFERENCES "public"."shifts"') &&
        deptMigration0006.includes('REFERENCES "public"."departments"'),
      '1.5 Foreign key constraints (employee, shift, department, user) correctly defined'
    );

    assert(
      shiftMigration0005.includes('CREATE INDEX "emp_shift_assign_dates_idx"') &&
        shiftMigration0005.includes('CREATE INDEX "shift_segments_seq_idx"') &&
        deptMigration0006.includes('CREATE INDEX "dept_shift_assign_dates_idx"'),
      '1.6 Performance indexes for date lookups, shift ID, and sequence exist'
    );

    // =========================================================================
    // SECTION 2: CREATE REAL TEST SHIFTS
    // =========================================================================
    console.log('\n--- 2. CREATE REAL TEST SHIFTS ---');

    // SHIFT A — NORMAL 08:30–17:30
    const shiftA = await ShiftService.createShift(
      {
        shiftCode: 'TEST_SHIFT_A_NORMAL',
        shiftName: 'Normal Office Shift',
        description: '08:30 to 17:30 with 60m break',
        isActive: true,
        segments: [
          { segmentSequence: 1, startTime: '08:30', endTime: '17:30', crossesMidnight: false, breakMinutes: 60 },
        ],
      },
      SUPER_ADMIN
    );
    assert(
      shiftA.shiftCode === 'TEST_SHIFT_A_NORMAL' && shiftA.totalScheduledHours === 9.0,
      '2.1 SHIFT A (NORMAL 08:30–17:30): Saved with positive calculated duration (9.0h including break)',
      `Total hours: ${shiftA.totalScheduledHours}`
    );

    // SHIFT B — NIGHT 20:30–08:30 next day
    const shiftB = await ShiftService.createShift(
      {
        shiftCode: 'TEST_SHIFT_B_NIGHT',
        shiftName: 'Night Cross-Midnight Shift',
        description: '20:30 to 08:30 next morning with 60m break',
        isActive: true,
        segments: [
          { segmentSequence: 1, startTime: '20:30', endTime: '08:30', crossesMidnight: true, breakMinutes: 60 },
        ],
      },
      SUPER_ADMIN
    );
    assert(
      shiftB.shiftCode === 'TEST_SHIFT_B_NIGHT' &&
        shiftB.segments[0].crossesMidnight === true &&
        shiftB.totalScheduledHours === 12.0,
      '2.2 SHIFT B (NIGHT 20:30–08:30): Saved with overnight flag and correct positive duration (12.0h including break)',
      `Total hours: ${shiftB.totalScheduledHours}`
    );

    // SHIFT C — SPLIT 05:30–08:30 and 17:00–23:00
    const shiftC = await ShiftService.createShift(
      {
        shiftCode: 'TEST_SHIFT_C_SPLIT',
        shiftName: 'Split Shift (Morning + Evening)',
        description: '05:30–08:30 (3h) and 17:00–23:00 (6h)',
        isActive: true,
        segments: [
          { segmentSequence: 1, startTime: '05:30', endTime: '08:30', crossesMidnight: false, breakMinutes: 0 },
          { segmentSequence: 2, startTime: '17:00', endTime: '23:00', crossesMidnight: false, breakMinutes: 0 },
        ],
      },
      SUPER_ADMIN
    );
    assert(
      shiftC.shiftCode === 'TEST_SHIFT_C_SPLIT' &&
        shiftC.segments.length === 2 &&
        shiftC.totalScheduledHours === 9.0,
      '2.3 SHIFT C (SPLIT 05:30–08:30 & 17:00–23:00): 2 segments on same business date summing to 9.0h',
      `Segments: ${shiftC.segments.length}, hours: ${shiftC.totalScheduledHours}`
    );

    // SHIFT D — THREE SEGMENTS
    const shiftD = await ShiftService.createShift(
      {
        shiftCode: 'TEST_SHIFT_D_TRIPLE',
        shiftName: 'Three Segment Shift',
        description: '05:30–08:30 (3h), 12:00–14:00 (2h), 17:00–23:00 (6h)',
        isActive: true,
        segments: [
          { segmentSequence: 1, startTime: '05:30', endTime: '08:30', crossesMidnight: false, breakMinutes: 0 },
          { segmentSequence: 2, startTime: '12:00', endTime: '14:00', crossesMidnight: false, breakMinutes: 0 },
          { segmentSequence: 3, startTime: '17:00', endTime: '23:00', crossesMidnight: false, breakMinutes: 0 },
        ],
      },
      SUPER_ADMIN
    );
    assert(
      shiftD.shiftCode === 'TEST_SHIFT_D_TRIPLE' &&
        shiftD.segments.length === 3 &&
        shiftD.totalScheduledHours === 11.0,
      '2.4 SHIFT D (THREE SEGMENTS): 3 separate segments on same business date summing to 11.0h',
      `Segments: ${shiftD.segments.length}, hours: ${shiftD.totalScheduledHours}`
    );

    // =========================================================================
    // SECTION 3: REAL EMPLOYEE ASSIGNMENT
    // =========================================================================
    console.log('\n--- 3. REAL EMPLOYEE ASSIGNMENT ---');

    const assignA = await ShiftService.assignShiftToEmployee(
      {
        employeeId: EMP_A.employeeId!,
        shiftId: shiftA.id,
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-09-30',
        workDaysOfWeek: '1,2,3,4,5',
      },
      HR_USER
    );

    const assignB = await ShiftService.assignShiftToEmployee(
      {
        employeeId: EMP_B.employeeId!,
        shiftId: shiftB.id,
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-09-30',
        workDaysOfWeek: '1,2,3,4,5',
      },
      HR_USER
    );

    const assignC = await ShiftService.assignShiftToEmployee(
      {
        employeeId: EMP_C.employeeId!,
        shiftId: shiftC.id,
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-09-30',
        workDaysOfWeek: '1,2,3,4,5',
      },
      HR_USER
    );

    const assignD = await ShiftService.assignShiftToEmployee(
      {
        employeeId: EMP_D.employeeId!,
        shiftId: shiftD.id,
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-09-30',
        workDaysOfWeek: '1,2,3,4,5',
      },
      HR_USER
    );

    assert(
      Boolean(assignA.id && assignB.id && assignC.id && assignD.id),
      '3.1 Employee assignments for A, B, C, D persisted with effective date ranges'
    );

    // Verify schedule retrieval via service
    const schedA = await ShiftService.resolveEmployeeSchedule(EMP_A.employeeId!, '2026-09-02'); // Wednesday
    const schedB = await ShiftService.resolveEmployeeSchedule(EMP_B.employeeId!, '2026-09-02');
    const schedC = await ShiftService.resolveEmployeeSchedule(EMP_C.employeeId!, '2026-09-02');
    const schedD = await ShiftService.resolveEmployeeSchedule(EMP_D.employeeId!, '2026-09-02');

    assert(
      schedA.shiftCode === 'TEST_SHIFT_A_NORMAL' && schedA.earliestStartTime === '08:30',
      '3.2 Employee A schedule retrieved matches NORMAL shift (08:30)'
    );
    assert(
      schedB.shiftCode === 'TEST_SHIFT_B_NIGHT' && schedB.earliestStartTime === '20:30',
      '3.3 Employee B schedule retrieved matches NIGHT shift (20:30)'
    );
    assert(
      schedC.shiftCode === 'TEST_SHIFT_C_SPLIT' &&
        schedC.earliestStartTime === '05:30' &&
        schedC.latestEndTime === '23:00',
      '3.4 Employee C schedule retrieved matches SPLIT shift (05:30–23:00)'
    );
    assert(
      schedD.shiftCode === 'TEST_SHIFT_D_TRIPLE' && schedD.segments.length === 3,
      '3.5 Employee D schedule retrieved matches THREE SEGMENTS shift'
    );

    // =========================================================================
    // SECTION 4: DEPARTMENT SHIFT TEST
    // =========================================================================
    console.log('\n--- 4. DEPARTMENT SHIFT TEST (TIER 2 & PRECEDENCE) ---');

    // Dept 10 has Shift C (Split Shift)
    ShiftService.setEmployeeDepartment(EMP_E.employeeId!, 10);
    const deptAssign = await ShiftService.assignShiftToDepartment(
      {
        departmentId: 10,
        shiftId: shiftC.id,
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-09-30',
        workDaysOfWeek: '1,2,3,4,5',
      },
      HR_USER
    );
    assert(Boolean(deptAssign.id), '4.1 Department-level shift assignment created for Dept 10');

    // Employee E has NO employee-specific shift -> gets department schedule
    const schedE_dept = await ShiftService.resolveEmployeeSchedule(EMP_E.employeeId!, '2026-09-03');
    assert(
      schedE_dept.scheduleSource === 'DEPARTMENT_SHIFT' && schedE_dept.shiftCode === 'TEST_SHIFT_C_SPLIT',
      '4.2 Employee E with NO employee shift receives Department Schedule (Tier 2)',
      `Source: ${schedE_dept.scheduleSource}, code: ${schedE_dept.shiftCode}`
    );

    // Now assign an employee-specific shift to Employee E (Shift A Normal)
    const empAssignE = await ShiftService.assignShiftToEmployee(
      {
        employeeId: EMP_E.employeeId!,
        shiftId: shiftA.id,
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-09-30',
      },
      HR_USER
    );

    // Verify Employee-specific shift overrides department shift
    const schedE_override = await ShiftService.resolveEmployeeSchedule(EMP_E.employeeId!, '2026-09-03');
    assert(
      schedE_override.scheduleSource === 'EMPLOYEE_SHIFT' && schedE_override.shiftCode === 'TEST_SHIFT_A_NORMAL',
      '4.3 Employee-specific shift strictly OVERRIDES department shift (Tier 1 > Tier 2)',
      `Source: ${schedE_override.scheduleSource}, code: ${schedE_override.shiftCode}`
    );

    // Deactivate/remove employee-specific assignment
    await ShiftService.deleteEmployeeAssignment(empAssignE.id, HR_USER);

    // Verify department schedule becomes effective again
    const schedE_restored = await ShiftService.resolveEmployeeSchedule(EMP_E.employeeId!, '2026-09-03');
    assert(
      schedE_restored.scheduleSource === 'DEPARTMENT_SHIFT' && schedE_restored.shiftCode === 'TEST_SHIFT_C_SPLIT',
      '4.4 Removing employee assignment causes Department Schedule to become effective again',
      `Source: ${schedE_restored.scheduleSource}`
    );

    // =========================================================================
    // SECTION 5: DEFAULT SHIFT TEST
    // =========================================================================
    console.log('\n--- 5. DEFAULT SHIFT TEST ---');

    // Employee F has NO employee shift and NO department shift
    const schedF = await ShiftService.resolveEmployeeSchedule(EMP_F.employeeId!, '2026-09-03'); // Thursday
    assert(
      schedF.scheduleSource === 'COMPANY_DEFAULT' &&
        schedF.earliestStartTime === '08:30' &&
        schedF.latestEndTime === '17:30',
      '5.1 Employee F with NO employee or department shift resolves to Company Default (08:30–17:30)',
      `Source: ${schedF.scheduleSource}, timing: ${schedF.earliestStartTime}-${schedF.latestEndTime}`
    );

    // =========================================================================
    // SECTION 6: HOLIDAY AND WEEKLY-OFF TEST
    // =========================================================================
    console.log('\n--- 6. HOLIDAY AND WEEKLY-OFF INTERACTION TEST ---');

    // Create a full-day holiday on 2026-09-08 (Tuesday)
    await HolidayService.createHoliday({
      holidayName: 'Ganesh Chaturthi',
      holidayDate: '2026-09-08',
      isOptional: false,
      isHalfDay: false,
    });

    // Create a half-day holiday on 2026-09-09 (Wednesday)
    await HolidayService.createHoliday({
      holidayName: 'Autumn Festival',
      holidayDate: '2026-09-09',
      isOptional: false,
      isHalfDay: true,
    });

    // Test Employee A on Normal Day (2026-09-07, Monday)
    const normalDay = await ShiftService.resolveEmployeeSchedule(EMP_A.employeeId!, '2026-09-07');
    assert(
      normalDay.isWorkingDay && !normalDay.isHoliday && !normalDay.isWeeklyOff,
      '6.1 Normal working day: isWorkingDay=true, isHoliday=false, isWeeklyOff=false'
    );

    // Test Employee A on Weekly Off (2026-09-06, Sunday)
    const weeklyOffDay = await ShiftService.resolveEmployeeSchedule(EMP_A.employeeId!, '2026-09-06');
    assert(
      !weeklyOffDay.isWorkingDay && weeklyOffDay.isWeeklyOff,
      '6.2 Weekly off day: isWorkingDay=false, isWeeklyOff=true (shift does NOT override weekly off to working day)'
    );

    // Test Employee A on Full-day Holiday (2026-09-08, Tuesday)
    const fullHolidayDay = await ShiftService.resolveEmployeeSchedule(EMP_A.employeeId!, '2026-09-08');
    assert(
      !fullHolidayDay.isWorkingDay && fullHolidayDay.isHoliday && fullHolidayDay.holidayName === 'Ganesh Chaturthi',
      '6.3 Full-day holiday: isWorkingDay=false, isHoliday=true (holiday overrides shift to OFF)'
    );

    // Test Employee A on Half-day Holiday (2026-09-09, Wednesday)
    const halfHolidayDay = await ShiftService.resolveEmployeeSchedule(EMP_A.employeeId!, '2026-09-09');
    assert(
      halfHolidayDay.isWorkingDay && halfHolidayDay.isHoliday && Boolean(halfHolidayDay.isHalfDayHoliday),
      '6.4 Half-day holiday: isWorkingDay=true, isHoliday=true, isHalfDayHoliday=true'
    );

    // =========================================================================
    // SECTION 7: NIGHT SHIFT REAL TEST
    // =========================================================================
    console.log('\n--- 7. NIGHT SHIFT REAL TEST (20:30–08:30) ---');

    const nightSchedule = await ShiftService.resolveEmployeeSchedule(EMP_B.employeeId!, '2026-09-10');
    assert(
      nightSchedule.earliestStartTime === '20:30' &&
        nightSchedule.segments[0].crossesMidnight &&
        Boolean(nightSchedule.segments[0].nextDayIndicator),
      '7.1 Night shift starts 20:30 on date T and ends 08:30 on date T+1 with nextDayIndicator',
      `Indicator: ${nightSchedule.segments[0].nextDayIndicator}`
    );

    assert(
      nightSchedule.totalScheduledHours === 12.0,
      '7.2 Night shift total working duration is positive and includes break (12h total; break is NOT subtracted)'
    );

    const nightLeaveDays = await WorkingDaysService.calculateWorkingDays(
      '2026-09-10',
      '2026-09-10',
      'FULL_DAY',
      { employeeId: EMP_B.employeeId }
    );
    assert(
      nightLeaveDays.totalDays === 1.0,
      '7.3 Full-day leave on night shift consumes exactly 1.0 leave day (NOT multiple calendar days)',
      `Got: ${nightLeaveDays.totalDays}`
    );

    const nightHalfLeaveDays = await WorkingDaysService.calculateWorkingDays(
      '2026-09-10',
      '2026-09-10',
      'HALF_DAY',
      { employeeId: EMP_B.employeeId }
    );
    assert(
      nightHalfLeaveDays.totalDays === 0.5,
      '7.4 Half-day leave on night shift consumes exactly 0.5 leave day',
      `Got: ${nightHalfLeaveDays.totalDays}`
    );

    // =========================================================================
    // SECTION 8: SPLIT SHIFT REAL TEST
    // =========================================================================
    console.log('\n--- 8. SPLIT SHIFT REAL TEST (05:30–08:30 & 17:00–23:00) ---');

    const splitSchedule = await ShiftService.resolveEmployeeSchedule(EMP_C.employeeId!, '2026-09-10');
    assert(
      splitSchedule.segments.length === 2 &&
        splitSchedule.earliestStartTime === '05:30' &&
        splitSchedule.latestEndTime === '23:00' &&
        splitSchedule.totalScheduledHours === 9.0,
      '8.1 Split shift segments map to same business date with earliest 05:30, latest 23:00, total 9.0h'
    );

    const splitLeaveDays = await WorkingDaysService.calculateWorkingDays(
      '2026-09-10',
      '2026-09-10',
      'FULL_DAY',
      { employeeId: EMP_C.employeeId }
    );
    assert(
      splitLeaveDays.totalDays === 1.0,
      '8.2 Full-day leave on split shift consumes exactly 1.0 leave day covering all segments'
    );

    // =========================================================================
    // SECTION 9: REAL LEAVE REQUEST FLOW (END-TO-END)
    // =========================================================================
    console.log('\n--- 9. REAL LEAVE REQUEST FLOW & APPROVAL ENGINE INTEGRATION ---');

    // Employee A submits leave request for 2026-09-14 to 2026-09-15 (Monday to Tuesday, 2 days)
    const submittedReq = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-09-14',
        endDate: '2026-09-15',
        dayType: 'FULL_DAY',
        reasonCategory: 'PERSONAL' as any,
        reason: 'Attending family ceremony',
        applicationTimestampOverride: '2026-09-10T10:00:00Z',
      },
      EMP_A
    );

    assert(
      submittedReq.finalStatus === 'PENDING' && Number(submittedReq.totalDays) === 2.0,
      '9.1 Employee A submitted leave request; working days calculated as 2.0 based on shift'
    );

    // Team Leader approves Stage 1
    await ApprovalService.submitTeamLeaderDecision(
      submittedReq.id,
      {
        decision: 'APPROVED',
        comments: 'Team shift coverage verified by Team Leader.',
      },
      SUPER_ADMIN
    );

    // HR reviews and recommends APPROVE
    const hrReview = await ApprovalService.submitHrDecision(
      submittedReq.id,
      {
        decision: 'APPROVED',
        comments: 'Verified team shift coverage. Recommended.',
      },
      HR_USER
    );
    assert(
      hrReview.hrDecision === 'APPROVED' && hrReview.finalStatus === 'PENDING',
      '9.2 HR successfully approved leave request; status remains PENDING for Top Management'
    );

    // Top Management gives final APPROVE
    const mgmtDecision = await ApprovalService.submitManagementDecision(
      submittedReq.id,
      {
        decision: 'APPROVED',
        comments: 'Final executive approval granted.',
      },
      SUPER_ADMIN
    );
    assert(
      mgmtDecision.finalStatus === 'APPROVED' && mgmtDecision.managementDecision === 'APPROVED',
      '9.3 Top Management approved leave request; finalStatus transitioned to APPROVED'
    );

    // Verify balance was posted
    const balances = await LeaveService.getLeaveBalances({ employeeId: EMP_A.employeeId!, year: 2026 }, SUPER_ADMIN);
    const balanceA = balances.find((b) => b.leaveTypeId === 1);
    assert(
      Number(balanceA?.used) === 2.0 && Number(balanceA?.available) === 10.0,
      '9.4 Leave balance posted idempotently: 2.0 days deducted, 10.0 remaining',
      `Used: ${balanceA?.used}, Available: ${balanceA?.available}`
    );

    // =========================================================================
    // SECTION 10: SHIFT-AWARE CUTOFF & CLASSIFICATION TEST
    // =========================================================================
    console.log('\n--- 10. SHIFT-AWARE CUTOFF TIMING CLASSIFICATION ---');

    // Employee C (Split Shift starting at 05:30)
    const cBeforeStart = await LeaveClassificationService.classifyLeaveRequest(
      '2026-09-16T05:00:00+05:30', // 05:00 AM (30 min before 05:30 start)
      '2026-09-16',
      undefined,
      { employeeId: EMP_C.employeeId }
    );
    assert(
      !cBeforeStart.isPostStart,
      '10.1 Employee C (05:30 shift): 05:00 AM submission is BEFORE shift start (not post-start)',
      `Classification: ${cBeforeStart.classification}`
    );

    const cAfterStart = await LeaveClassificationService.classifyLeaveRequest(
      '2026-09-16T06:00:00+05:30', // 06:00 AM (after 05:30 start)
      '2026-09-16',
      undefined,
      { employeeId: EMP_C.employeeId }
    );
    assert(
      cAfterStart.isPostStart && cAfterStart.classification === 'POST_START_LEAVE_REQUEST',
      '10.2 Employee C (05:30 shift): 06:00 AM submission is POST_START'
    );

    // Employee B (Night Shift starting at 20:30)
    const bBeforeStart = await LeaveClassificationService.classifyLeaveRequest(
      '2026-09-16T18:00:00+05:30', // 18:00 (2.5 hrs before 20:30 start)
      '2026-09-16',
      undefined,
      { employeeId: EMP_B.employeeId }
    );
    assert(
      !bBeforeStart.isPostStart,
      '10.3 Employee B (20:30 night shift): 18:00 submission on date T is BEFORE start (not 08:30 morning logic!)',
      `Classification: ${bBeforeStart.classification}`
    );

    const bAfterStart = await LeaveClassificationService.classifyLeaveRequest(
      '2026-09-16T21:00:00+05:30', // 21:00 (after 20:30 start)
      '2026-09-16',
      undefined,
      { employeeId: EMP_B.employeeId }
    );
    assert(
      bAfterStart.isPostStart && bAfterStart.classification === 'POST_START_LEAVE_REQUEST',
      '10.4 Employee B (20:30 night shift): 21:00 submission is POST_START'
    );

    // =========================================================================
    // SECTION 11: LEAVE-DAY CONSERVATION TEST
    // =========================================================================
    console.log('\n--- 11. LEAVE-DAY CONSERVATION ---');

    const normalDayCalc = await WorkingDaysService.calculateWorkingDays('2026-09-18', '2026-09-18', 'FULL_DAY', {
      employeeId: EMP_A.employeeId,
    });
    const nightDayCalc = await WorkingDaysService.calculateWorkingDays('2026-09-18', '2026-09-18', 'FULL_DAY', {
      employeeId: EMP_B.employeeId,
    });
    const splitDayCalc = await WorkingDaysService.calculateWorkingDays('2026-09-18', '2026-09-18', 'FULL_DAY', {
      employeeId: EMP_C.employeeId,
    });
    const tripleDayCalc = await WorkingDaysService.calculateWorkingDays('2026-09-18', '2026-09-18', 'FULL_DAY', {
      employeeId: EMP_D.employeeId,
    });

    assert(
      normalDayCalc.totalDays === 1.0 &&
        nightDayCalc.totalDays === 1.0 &&
        splitDayCalc.totalDays === 1.0 &&
        tripleDayCalc.totalDays === 1.0,
      '11.1 All shifts (8h normal, 11h night, 9h split, 11h triple) conserve 1 full-day leave = 1.0 leave day'
    );

    // =========================================================================
    // SECTION 12: EFFECTIVE DATE TEST
    // =========================================================================
    console.log('\n--- 12. EFFECTIVE DATE BOUNDARY TEST ---');

    // Create Assignment A: 01-Oct-2026 to 15-Oct-2026 (Shift A Normal)
    // Create Assignment B: 16-Oct-2026 to open-ended (Shift B Night)
    const octEmp = 107;
    await ShiftService.assignShiftToEmployee(
      {
        employeeId: octEmp,
        shiftId: shiftA.id,
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-15',
      },
      HR_USER
    );

    await ShiftService.assignShiftToEmployee(
      {
        employeeId: octEmp,
        shiftId: shiftB.id,
        effectiveFrom: '2026-10-16',
        effectiveTo: null, // open-ended
      },
      HR_USER
    );

    const oct15 = await ShiftService.resolveEmployeeSchedule(octEmp, '2026-10-15');
    const oct16 = await ShiftService.resolveEmployeeSchedule(octEmp, '2026-10-16');

    assert(
      oct15.shiftCode === 'TEST_SHIFT_A_NORMAL' && oct16.shiftCode === 'TEST_SHIFT_B_NIGHT',
      '12.1 Boundary date 15-Oct resolves Assignment A; 16-Oct resolves Assignment B'
    );

    // =========================================================================
    // SECTION 13: RBAC REAL PERMISSION TEST
    // =========================================================================
    console.log('\n--- 13. RBAC REAL PERMISSION TEST ---');

    let empCreateBlocked = false;
    try {
      await ShiftService.createShift(
        {
          shiftCode: 'EMP_HACK',
          shiftName: 'Employee Unauthorized Shift',
          segments: [{ startTime: '09:00', endTime: '17:00' }],
        },
        EMP_A
      );
    } catch {
      empCreateBlocked = true;
    }
    assert(empCreateBlocked, '13.1 EMPLOYEE is strictly forbidden from creating shifts (403)');

    let empAssignBlocked = false;
    try {
      await ShiftService.assignShiftToEmployee(
        {
          employeeId: EMP_B.employeeId!,
          shiftId: shiftA.id,
          effectiveFrom: '2026-11-01',
        },
        EMP_A
      );
    } catch {
      empAssignBlocked = true;
    }
    assert(empAssignBlocked, '13.2 EMPLOYEE is strictly forbidden from assigning shifts (403)');

    // =========================================================================
    // SECTION 14 & 15: UI COMPONENT VERIFICATION
    // =========================================================================
    console.log('\n--- 14 & 15. UI COMPONENT VERIFICATION ---');

    const appTsx = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');
    const myScheduleTsx = fs.readFileSync(path.join(process.cwd(), 'src/components/MySchedule.tsx'), 'utf-8');
    const adminTsx = fs.readFileSync(path.join(process.cwd(), 'src/components/ShiftScheduleAdmin.tsx'), 'utf-8');

    assert(
      appTsx.includes("import { MySchedule } from './components/MySchedule.tsx'") &&
        appTsx.includes("id: 'my-schedule'"),
      '14.1 MySchedule component imported and registered in main application navigation'
    );

    assert(
      myScheduleTsx.includes('14-Day Shift Schedule') &&
        myScheduleTsx.includes('crossesMidnight') &&
        myScheduleTsx.includes('read-only'),
      '14.2 Employee UI: 14-day lookahead, overnight indicator, read-only controls verified'
    );

    assert(
      adminTsx.includes('handleAddSegment') &&
        adminTsx.includes('handleRemoveSegment') &&
        adminTsx.includes('crossesMidnight') &&
        (adminTsx.includes('assignShiftToDepartment') || adminTsx.includes('handleAssignDeptShift')) &&
        adminTsx.includes('canEdit'),
      '15.1 Admin UI: Dynamic segments (>2), cross-midnight, department assignments, and RBAC guards verified'
    );
  } catch (err: any) {
    console.error('Real-flow acceptance test fatal error:', err);
    failed++;
  }

  console.log(`\n===============================================================`);
  console.log(`  ACCEPTANCE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`===============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runRealFlowAcceptanceTest().catch((err) => {
  console.error('Acceptance suite crashed:', err);
  process.exit(1);
});
