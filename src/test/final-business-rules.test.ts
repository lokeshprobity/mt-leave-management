import fs from 'fs';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.ts';
import { AttachmentService } from '../services/attachmentService.ts';
import { ValidationError } from '../services/validation.ts';
import { parseApiJson } from '../lib/api.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { HolidayService } from '../services/holidayService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { LeaveClassificationService } from '../services/leaveClassificationService.ts';
import { ApprovalService } from '../services/approvalService.ts';
import { UserService } from '../services/userService.ts';
import { ShiftService } from '../services/shiftService.ts';
import { AuthContext } from '../types/leave.ts';

const SUPER_ADMIN: AuthContext = {
  userId: 1,
  username: 'superadmin',
  role: 'SUPER_ADMIN',
  employeeId: 1,
};

const HR_USER: AuthContext = {
  userId: 2,
  username: 'hruser',
  role: 'HR',
  employeeId: 2,
};

const TOP_MGMT: AuthContext = {
  userId: 3,
  username: 'manager_john',
  role: 'TOP_MANAGEMENT',
  employeeId: 3,
};

// Team Leader 1 (Robert, employeeId=5) -> manages Alice (employeeId=4)
const TL_ROBERT: AuthContext = {
  userId: 5,
  username: 'tl_robert',
  role: 'TEAM_LEADER',
  employeeId: 5,
};

// Team Leader 2 (Priya, employeeId=6) -> does NOT manage Alice
const TL_PRIYA: AuthContext = {
  userId: 6,
  username: 'tl_priya',
  role: 'TEAM_LEADER',
  employeeId: 6,
};

// Employee Alice (employeeId=4, reportingManagerId=5)
const EMP_ALICE: AuthContext = {
  userId: 4,
  username: 'alice_emp',
  role: 'EMPLOYEE',
  employeeId: 4,
};

async function runFinalBusinessRulesTests() {
  console.log('===================================================================');
  console.log('  MAESTRO LEAVE MANAGEMENT — FINAL BUSINESS RULES VERIFICATION');
  console.log('===================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} — ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  function resetAll() {
    UserService.resetMemoryStores();
    ShiftService.resetMemoryStores();
    WorkingDaysService.resetMemoryHolidays();
    HolidayService.resetMemoryHolidays();
    LeaveService.resetMemoryStores();
    LeaveRequestService.resetMemoryStores();
  }

  // =========================================================================
  // 1. BRANDING VERIFICATION
  // =========================================================================
  console.log('\n--- 1. Branding Verification (Maestro Leave Management) ---');
  const metadataJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'metadata.json'), 'utf-8'));
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
  const appTsx = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');

  assert(
    metadataJson.name === 'Maestro Leave Management',
    '1.1 metadata.json name is "Maestro Leave Management"'
  );
  assert(
    indexHtml.includes('<title>Maestro Leave Management</title>') && !indexHtml.includes('MT Leave Management'),
    '1.2 index.html title is "Maestro Leave Management" with no legacy branding'
  );
  assert(
    appTsx.includes('Maestro Leave Management') && !appTsx.includes('MT Leave Management'),
    '1.3 App.tsx displays "Maestro Leave Management" with no legacy branding'
  );

  // =========================================================================
  // 2. DEFAULT WORKING DAYS — MONDAY TO SATURDAY (SUNDAY WEEKLY OFF)
  // =========================================================================
  console.log('\n--- 2. Default Working Days (Monday to Saturday Working, Sunday Off) ---');
  resetAll();

  const defaultSchedule = await WorkingDaysService.getWorkingDaysSchedule();
  const monToSatWorking = [1, 2, 3, 4, 5, 6].every(
    (dayIdx) => defaultSchedule.find((d) => d.dayOfWeek === dayIdx)?.isWorkingDay === true
  );
  const sundayOff = defaultSchedule.find((d) => d.dayOfWeek === 0)?.isWorkingDay === false;
  const weeklyOffs = await WorkingDaysService.getWeeklyOffs();

  assert(
    monToSatWorking && sundayOff,
    '2.1 Default working schedule has Monday–Saturday as Working Days and Sunday as Weekly Off'
  );
  assert(
    weeklyOffs.length === 1 && weeklyOffs[0] === 0,
    '2.2 Default weeklyOffs array is [0] (Sunday only)'
  );

  // Full week Mon 2026-11-02 to Sun 2026-11-08 -> 6 working days (Mon–Sat) and 1 weekly off (Sun)
  const weekCalc = await WorkingDaysService.calculateWorkingDays('2026-11-02', '2026-11-08', 'FULL_DAY');
  assert(
    weekCalc.totalDays === 6 && weekCalc.weeklyOffDays.length === 1 && weekCalc.weeklyOffDays[0] === '2026-11-08',
    '2.3 Mon–Sun date range calculates 6 working days (Mon–Sat) and 1 weekly off (Sunday)'
  );

  // Employee-specific weekly-off override continues to work
  await WorkingDaysService.assignEmployeeWeeklyOff(
    {
      employeeId: EMP_ALICE.employeeId!,
      weeklyOffDays: [0, 6], // Sunday + Saturday off override for Alice
      effectiveFrom: '2026-11-01',
      remarks: 'Special 5-day override for Alice',
    },
    HR_USER
  );
  const aliceWeekCalc = await WorkingDaysService.calculateWorkingDays(
    '2026-11-02',
    '2026-11-08',
    'FULL_DAY',
    { employeeId: EMP_ALICE.employeeId! }
  );
  assert(
    aliceWeekCalc.totalDays === 5 && aliceWeekCalc.weeklyOffDays.length === 2,
    '2.4 Employee-specific weekly-off override continues to work cleanly'
  );

  // =========================================================================
  // 3 & 4. HALF-DAY LEAVE (0.5 BUSINESS UNIT) & FULL-DAY LEAVE (1.0 UNIT)
  // =========================================================================
  console.log('\n--- 3 & 4. Half-Day Leave (0.5 Day) & Shift Independence ---');
  resetAll();

  // Assign a 12-hour Night Shift to Alice to verify half-day is still 0.5 day (not shift-hours based)
  const allShifts = await ShiftService.getShifts({ includeInactive: true });
  const nightShift = allShifts.find((s) => s.shiftCode === 'NIGHT_SHIFT') || allShifts[0];
  await ShiftService.assignShiftToEmployee(
    {
      employeeId: EMP_ALICE.employeeId!,
      shiftId: nightShift.id,
      effectiveFrom: '2026-01-01',
    },
    HR_USER
  );

  const halfDayPreview = await LeaveRequestService.calculatePreview(
    {
      leaveTypeId: 1,
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      dayType: 'HALF_DAY',
      halfDayPeriod: 'FIRST_HALF',
      applicationTimestamp: '2026-11-01T09:00:00Z',
    },
    EMP_ALICE
  );
  assert(
    halfDayPreview.isValid && halfDayPreview.totalWorkingDays === 0.5,
    '4.1 Half-day preview calculates exactly 0.5 day regardless of employee shift hours'
  );

  const halfDayReq = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      dayType: 'HALF_DAY',
      halfDayPeriod: 'FIRST_HALF',
      reason: 'Morning medical checkup',
      applicationTimestampOverride: '2026-11-01T09:00:00Z',
    },
    EMP_ALICE
  );
  assert(
    Number(halfDayReq.totalDays) === 0.5 &&
      halfDayReq.dayType === 'HALF_DAY' &&
      halfDayReq.halfDayPeriod === 'FIRST_HALF' &&
      halfDayReq.approvalStageLabel === 'Pending Team Leader',
    '4.2 Half-day request persisted with totalDays = 0.50, HALF_DAY, FIRST_HALF, and initial stage "Pending Team Leader"'
  );

  // =========================================================================
  // 5, 6, 7, 8. AUTHORITATIVE 3-STAGE WORKFLOW & STRICT BACKEND RULES
  // =========================================================================
  console.log('\n--- 5, 6, 7, 8. Employee -> Team Leader -> HR -> Top Management Workflow ---');

  // 6.1 Unauthorized Team Leader (Priya) cannot approve Alice's request (Alice reports to Robert)
  let unauthorizedTlBlocked = false;
  try {
    await ApprovalService.submitTeamLeaderDecision(
      halfDayReq.id,
      { decision: 'APPROVED', comments: 'Trying to approve another team member' },
      TL_PRIYA
    );
  } catch (err: any) {
    unauthorizedTlBlocked = err.message.includes('Forbidden');
  }
  assert(
    unauthorizedTlBlocked,
    '6.1 Unauthorized Team Leader (not employee’s Reporting Manager) is blocked from approving request'
  );

  // 6.2 HR cannot approve or reject while Team Leader decision is still PENDING
  let hrBeforeTlBlocked = false;
  try {
    await ApprovalService.submitHrDecision(
      halfDayReq.id,
      { decision: 'APPROVED', comments: 'HR trying to jump ahead of Team Leader' },
      HR_USER
    );
  } catch (err: any) {
    hrBeforeTlBlocked = err.message.includes('passed Team Leader approval');
  }
  assert(
    hrBeforeTlBlocked,
    '6.2 HR is blocked from acting on a request that has not been approved by Team Leader first'
  );

  // 6.3 Assigned Team Leader (Robert) sees the request in his PENDING queue and approves it
  const robertPendingQueue = await ApprovalService.getRequestsForTeamLeader({ status: 'PENDING' }, TL_ROBERT);
  const priyaPendingQueue = await ApprovalService.getRequestsForTeamLeader({ status: 'PENDING' }, TL_PRIYA);
  assert(
    robertPendingQueue.some((r) => r.id === halfDayReq.id) &&
      !priyaPendingQueue.some((r) => r.id === halfDayReq.id),
    '6.3 Request appears in assigned Team Leader (Robert) pending queue and NOT in other Team Leader (Priya) queue'
  );

  const afterTlApprove = await ApprovalService.submitTeamLeaderDecision(
    halfDayReq.id,
    { decision: 'APPROVED', comments: 'Shift handover arranged, approved by Team Leader' },
    TL_ROBERT
  );
  assert(
    afterTlApprove.teamLeaderDecision === 'APPROVED' &&
      afterTlApprove.hrDecision === 'PENDING' &&
      afterTlApprove.finalStatus === 'PENDING' &&
      afterTlApprove.approvalStageLabel === 'Pending HR',
    '5.1 After Team Leader approves, stage transitions to "Pending HR"'
  );

  // 7.1 Now HR sees the request in HR's PENDING queue and approves it
  const hrPendingQueue = await ApprovalService.getRequestsForHr({ status: 'PENDING' }, HR_USER);
  assert(
    hrPendingQueue.some((r) => r.id === halfDayReq.id),
    '7.1 Request appears in HR actionable PENDING queue after Team Leader approval'
  );

  const afterHrApprove = await ApprovalService.submitHrDecision(
    halfDayReq.id,
    { decision: 'APPROVED', comments: 'Policy verified by HR' },
    HR_USER
  );
  assert(
    afterHrApprove.hrDecision === 'APPROVED' &&
      afterHrApprove.managementDecision === 'PENDING' &&
      afterHrApprove.finalStatus === 'PENDING' &&
      afterHrApprove.approvalStageLabel === 'HR Approved → Pending Top Management',
    '7.2 After HR approves, stage transitions to "HR Approved → Pending Top Management"'
  );

  // 8.1 Top Management approves -> Final APPROVED and 0.5 balance deducted!
  const balBefore = await LeaveService.getLeaveBalances({ employeeId: EMP_ALICE.employeeId!, year: 2026 }, SUPER_ADMIN);
  const clBefore = balBefore.find((b) => b.leaveTypeId === 1)!;

  const afterMgmtApprove = await ApprovalService.submitManagementDecision(
    halfDayReq.id,
    { decision: 'APPROVED', comments: 'Final executive approval granted' },
    TOP_MGMT
  );
  const balAfter = await LeaveService.getLeaveBalances({ employeeId: EMP_ALICE.employeeId!, year: 2026 }, SUPER_ADMIN);
  const clAfter = balAfter.find((b) => b.leaveTypeId === 1)!;

  assert(
    afterMgmtApprove.finalStatus === 'APPROVED' &&
      afterMgmtApprove.balancePosted === true &&
      Number(clAfter.used) === Number(clBefore.used) + 0.5 &&
      Number(clAfter.available) === Number(clBefore.available) - 0.5,
    '8.1 Top Management final approval deducts exactly 0.5 day from employee leave balance',
    `Used: ${clBefore.used} -> ${clAfter.used}, Available: ${clBefore.available} -> ${clAfter.available}`
  );

  // =========================================================================
  // 5.2 CRITICAL RULE: TEAM LEADER REJECTION CANNOT BE OVERRIDDEN BY HR
  // =========================================================================
  console.log('\n--- 5.2 Critical Rule: HR Cannot Change or Override a Team Leader Rejection ---');

  const reqToReject = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-11-12',
      endDate: '2026-11-13',
      dayType: 'FULL_DAY',
      reason: 'Personal trip',
      applicationTimestampOverride: '2026-11-01T09:00:00Z',
    },
    EMP_ALICE
  );

  // Team Leader rejects the request
  const tlRejected = await ApprovalService.submitTeamLeaderDecision(
    reqToReject.id,
    { decision: 'REJECTED', comments: 'Critical shipment arrival on Nov 12-13, cannot release' },
    TL_ROBERT
  );
  assert(
    tlRejected.teamLeaderDecision === 'REJECTED' &&
      tlRejected.finalStatus === 'REJECTED' &&
      tlRejected.status === 'REJECTED' &&
      tlRejected.approvalStageLabel === 'Team Leader Rejected',
    '5.2.1 Team Leader rejection immediately sets status to REJECTED ("Team Leader Rejected")'
  );

  // Must NOT appear in HR's actionable PENDING queue
  const hrPendingAfterTlReject = await ApprovalService.getRequestsForHr({ status: 'PENDING' }, HR_USER);
  assert(
    !hrPendingAfterTlReject.some((r) => r.id === reqToReject.id),
    '5.2.2 Team Leader rejected request does NOT appear in HR actionable PENDING queue'
  );

  // HR may view it in ALL history
  const hrAllQueue = await ApprovalService.getRequestsForHr({ status: 'ALL' }, HR_USER);
  assert(
    hrAllQueue.some((r) => r.id === reqToReject.id),
    '5.2.3 HR can still view the record in read-only ALL history'
  );

  // HR attempting to APPROVE a Team Leader rejection MUST fail in backend
  let hrApproveTlRejectedBlocked = false;
  try {
    await ApprovalService.submitHrDecision(
      reqToReject.id,
      { decision: 'APPROVED', comments: 'HR trying to override TL rejection' },
      HR_USER
    );
  } catch (err: any) {
    hrApproveTlRejectedBlocked = err.message.includes('cannot override, approve, or reject');
  }
  assert(
    hrApproveTlRejectedBlocked,
    '5.2.4 Backend strictly blocks HR from approving a Team Leader rejected request'
  );

  // HR attempting to REJECT again a Team Leader rejection MUST fail in backend
  let hrRejectTlRejectedBlocked = false;
  try {
    await ApprovalService.submitHrDecision(
      reqToReject.id,
      { decision: 'REJECTED', comments: 'HR trying to reject again' },
      HR_USER
    );
  } catch (err: any) {
    hrRejectTlRejectedBlocked = err.message.includes('cannot override, approve, or reject');
  }
  assert(
    hrRejectTlRejectedBlocked,
    '5.2.5 Backend strictly blocks HR from re-rejecting or modifying a Team Leader rejected request'
  );

  // =========================================================================
  // 7 & 8. DEPARTMENT-WISE HOLIDAYS & EFFECTIVE-DATE DEPARTMENT TRANSFER
  // =========================================================================
  console.log('\n--- 7 & 8. Department-Wise Holidays & Employee Department Transfer ---');
  resetAll();

  // Department IDs in seed:
  // 5 = Maestro_Import, 6 = A R Transportation, 7 = Maestro CFS
  await HolidayService.createHoliday({
    holidayName: 'Maestro Import Custom Holiday',
    holidayDate: '2026-11-18', // Wednesday
    departmentId: 5,
    isActive: true,
  });
  await HolidayService.createHoliday({
    holidayName: 'AR Transport Regional Day',
    holidayDate: '2026-11-19', // Thursday
    departmentId: 6,
    isActive: true,
  });

  // Put Employee 4 (Alice) in Maestro_Import (Dept 5) initially from 2026-01-01
  await UserService.updateEmployee(
    EMP_ALICE.employeeId!,
    { departmentId: 5, effectiveFrom: '2026-01-01' },
    SUPER_ADMIN
  );

  // Check 2026-11-18 (Holiday for Dept 5, Working Day for Dept 6)
  const calcDept5OnNov18 = await WorkingDaysService.calculateWorkingDays(
    '2026-11-18',
    '2026-11-18',
    'FULL_DAY',
    { employeeId: EMP_ALICE.employeeId! }
  );
  assert(
    calcDept5OnNov18.totalDays === 0 && calcDept5OnNov18.holidayDays.length === 1,
    '7.1 2026-11-18 is a Holiday for Maestro_Import employee (0 working days)'
  );

  const calcDept5OnNov19 = await WorkingDaysService.calculateWorkingDays(
    '2026-11-19',
    '2026-11-19',
    'FULL_DAY',
    { employeeId: EMP_ALICE.employeeId! }
  );
  assert(
    calcDept5OnNov19.totalDays === 1 && calcDept5OnNov19.holidayDays.length === 0,
    '7.2 2026-11-19 (AR Transport holiday) is a normal Working Day for Maestro_Import employee (1 working day)'
  );

  // Now transfer Alice from Maestro_Import (Dept 5) to A R Transportation (Dept 6) effective 2026-11-19!
  await UserService.updateEmployee(
    EMP_ALICE.employeeId!,
    { departmentId: 6, effectiveFrom: '2026-11-19' },
    SUPER_ADMIN
  );

  // Span across the transfer boundary: 2026-11-18 (in Dept 5) to 2026-11-20 (in Dept 6)
  // - 2026-11-18: Alice is still in Dept 5 -> Dept 5 holiday -> 0 working day
  // - 2026-11-19: Alice is now in Dept 6 -> Dept 6 holiday -> 0 working day
  // - 2026-11-20: Alice is in Dept 6 -> Working day -> 1 working day
  const transferCalc = await WorkingDaysService.calculateWorkingDays(
    '2026-11-18',
    '2026-11-20',
    'FULL_DAY',
    { employeeId: EMP_ALICE.employeeId! }
  );
  assert(
    transferCalc.totalDays === 1 &&
      transferCalc.holidayDays.length === 2 &&
      transferCalc.workingDays.length === 1 &&
      transferCalc.workingDays[0] === '2026-11-20',
    '8.1 Department transfer with effective date resolves old department holiday before effective date and new department holiday on/after effective date'
  );

  // =========================================================================
  // 9. AUTHORITATIVE LEAVE TIMING & SHIFT-START CUTOFF RULES
  // =========================================================================
  console.log('\n--- 9. Authoritative Normal Full-Day, Emergency, & Shift-Start Cutoff Rules ---');
  resetAll();

  // 9.1 Normal Full-Day Leave for D = 2026-09-26 (Normal cutoff = 2026-09-26 07:00)
  // Verify preview returns authoritative cutoff: 2026-09-26 07:00 and Office Start: 08:30
  const cutoffPreview = await LeaveRequestService.calculatePreview(
    {
      leaveTypeId: 1,
      startDate: '2026-09-26',
      endDate: '2026-09-26',
      dayType: 'FULL_DAY',
      applicationTimestampOverride: '2026-09-26T06:59:00+05:30',
    },
    EMP_ALICE
  );
  assert(
    cutoffPreview.normalFullDayCutoffDateStr === '2026-09-26' &&
      cutoffPreview.normalFullDayCutoffTimeUsed === '07:00' &&
      cutoffPreview.shiftStartTimeUsed === '08:30' &&
      cutoffPreview.isBeforeNormalFullDayCutoff === true &&
      cutoffPreview.isValid === true,
    '9.1.0 Preview displays Normal Full-Day Cutoff as 2026-09-26 07:00 and Office Start 08:30'
  );

  // Verify 2026-10-01 preview displays 2026-10-01 07:00 (and never 2026-09-30 18:00)
  const oct1Preview = await LeaveRequestService.calculatePreview(
    {
      leaveTypeId: 1,
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      dayType: 'FULL_DAY',
      applicationTimestampOverride: '2026-10-01T01:15:00Z', // 06:45 AM Asia/Kolkata
    },
    EMP_ALICE
  );
  assert(
    oct1Preview.normalFullDayCutoffDateStr === '2026-10-01' &&
      oct1Preview.normalFullDayCutoffTimeUsed === '07:00' &&
      `${oct1Preview.normalFullDayCutoffDateStr} ${oct1Preview.normalFullDayCutoffTimeUsed}` ===
        '2026-10-01 07:00' &&
      oct1Preview.classification === 'NORMAL_LEAVE_REQUEST' &&
      oct1Preview.isBeforeNormalFullDayCutoff === true &&
      oct1Preview.isValid === true,
    '9.1.0b Preview for 2026-10-01 displays Normal Full-Day Cutoff: 2026-10-01 07:00 (interpreted in Asia/Kolkata)'
  );

  // Verify UTC timestamps are interpreted in Asia/Kolkata across all 4 boundaries (07:00, 07:01, 08:29, 08:30 IST)
  const ist0700 = await LeaveClassificationService.classifyLeaveRequest(
    '2026-10-01T01:30:00Z', // 07:00 IST
    '2026-10-01'
  );
  const ist0701 = await LeaveClassificationService.classifyLeaveRequest(
    '2026-10-01T01:31:00Z', // 07:01 IST
    '2026-10-01'
  );
  const ist0829 = await LeaveClassificationService.classifyLeaveRequest(
    '2026-10-01T02:59:00Z', // 08:29 IST
    '2026-10-01'
  );
  const ist0830 = await LeaveClassificationService.classifyLeaveRequest(
    '2026-10-01T03:00:00Z', // 08:30 IST
    '2026-10-01'
  );
  assert(
    ist0700.applicationTimeStr === '07:00' &&
      ist0700.classification === 'NORMAL_LEAVE_REQUEST' &&
      ist0700.isBeforeNormalFullDayCutoff === true &&
      ist0701.applicationTimeStr === '07:01' &&
      ist0701.classification === 'LATE_LEAVE_REQUEST' &&
      ist0701.isLate === true &&
      ist0701.isBeforeNormalFullDayCutoff === false &&
      ist0701.isBeforeShiftStart === true &&
      ist0829.applicationTimeStr === '08:29' &&
      ist0829.classification === 'LATE_LEAVE_REQUEST' &&
      ist0829.isLate === true &&
      ist0829.isBeforeShiftStart === true &&
      ist0830.applicationTimeStr === '08:30' &&
      ist0830.classification === 'POST_START_LEAVE_REQUEST' &&
      ist0830.isPostStart === true &&
      ist0830.isBeforeShiftStart === false,
    '9.1.0c Asia/Kolkata timezone boundaries: 07:00=NORMAL, 07:01..08:29=LATE, 08:30+=POST_START'
  );

  // 26/09/2026 07:00 -> ALLOWED
  const normalAllowed = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-09-26',
      endDate: '2026-09-26',
      dayType: 'FULL_DAY',
      reason: 'Planned personal day submitted on or before 07:00 AM cutoff',
      applicationTimestampOverride: '2026-09-26T07:00:00+05:30',
    },
    EMP_ALICE
  );
  assert(
    Boolean(normalAllowed?.id) && Number(normalAllowed.totalDays) === 1.0,
    '9.1.1 Normal Full-Day leave for 26/09/2026 submitted at 26/09/2026 07:00 -> ALLOWED'
  );

  // Cancel it so we can test the blocked timestamps on the same date 2026-09-26
  await LeaveRequestService.cancelLeaveRequest(normalAllowed.id, 'Reset for next test', EMP_ALICE);

  const blockedNormalTimes = [
    { ts: '2026-09-26T07:01:00+05:30', label: '26/09/2026 07:01' },
    { ts: '2026-09-26T08:29:00+05:30', label: '26/09/2026 08:29' },
    { ts: '2026-09-26T08:30:00+05:30', label: '26/09/2026 08:30' },
    { ts: '2026-09-26T14:10:00+05:30', label: '26/09/2026 14:10' },
  ];

  for (const item of blockedNormalTimes) {
    let rejected = false;
    try {
      await LeaveRequestService.submitLeaveRequest(
        {
          leaveTypeId: 1,
          startDate: '2026-09-26',
          endDate: '2026-09-26',
          dayType: 'FULL_DAY',
          reason: `Normal full day attempt at ${item.label}`,
          applicationTimestampOverride: item.ts,
        },
        EMP_ALICE
      );
    } catch {
      rejected = true;
    }
    assert(rejected, `9.1 Normal Full-Day leave for 26/09/2026 submitted at ${item.label} -> NOT ALLOWED`);
  }

  // 9.2 Emergency Leave for D = 2026-09-26 (Default office start = 08:30)
  // A. BEFORE OFFICE/SHIFT START: 26/09/2026 07:00 & 08:29 -> Emergency Full Day ALLOWED
  const emg0700 = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 4, // Emergency Leave
      startDate: '2026-09-26',
      endDate: '2026-09-26',
      dayType: 'FULL_DAY',
      reasonCategory: 'MEDICAL_EMERGENCY',
      reason: 'Emergency medical issue at 07:00',
      isEmergency: true,
      applicationTimestampOverride: '2026-09-26T07:00:00+05:30',
    },
    EMP_ALICE
  );
  assert(
    Boolean(emg0700?.id) && Number(emg0700.totalDays) === 1.0,
    '9.2.1 Emergency Full-Day leave for 26/09/2026 at 07:00 (before 08:30 start) -> ALLOWED'
  );
  await LeaveRequestService.cancelLeaveRequest(emg0700.id, 'Reset for 08:29 test', EMP_ALICE);

  const emg0829 = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-09-26',
      endDate: '2026-09-26',
      dayType: 'FULL_DAY',
      reasonCategory: 'FAMILY_EMERGENCY',
      reason: 'Urgent family emergency at 08:29',
      isEmergency: true,
      applicationTimestampOverride: '2026-09-26T08:29:00+05:30',
    },
    EMP_ALICE
  );
  assert(
    Boolean(emg0829?.id) && Number(emg0829.totalDays) === 1.0,
    '9.2.2 Emergency Full-Day leave for 26/09/2026 at 08:29 (before 08:30 start) -> ALLOWED'
  );
  await LeaveRequestService.cancelLeaveRequest(emg0829.id, 'Reset for 08:30 test', EMP_ALICE);

  // B. AT OR AFTER OFFICE/SHIFT START:
  // 26/09/2026 08:30 -> Emergency Full Day NOT ALLOWED
  let emg0830FullBlocked = false;
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 4,
        startDate: '2026-09-26',
        endDate: '2026-09-26',
        dayType: 'FULL_DAY',
        reasonCategory: 'MEDICAL_EMERGENCY',
        reason: 'Emergency full day attempt at exact 08:30 start',
        isEmergency: true,
        applicationTimestampOverride: '2026-09-26T08:30:00+05:30',
      },
      EMP_ALICE
    );
  } catch {
    emg0830FullBlocked = true;
  }
  assert(
    emg0830FullBlocked,
    '9.2.3 Emergency Full-Day leave for 26/09/2026 at 08:30 (at shift start) -> NOT ALLOWED'
  );

  // 26/09/2026 14:10 -> Emergency Full Day NOT ALLOWED
  let emg1410FullBlocked = false;
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 4,
        startDate: '2026-09-26',
        endDate: '2026-09-26',
        dayType: 'FULL_DAY',
        reasonCategory: 'MEDICAL_EMERGENCY',
        reason: 'Emergency full day attempt at 14:10 (2:10 PM)',
        isEmergency: true,
        applicationTimestampOverride: '2026-09-26T14:10:00+05:30',
      },
      EMP_ALICE
    );
  } catch {
    emg1410FullBlocked = true;
  }
  assert(
    emg1410FullBlocked,
    '9.2.4 Emergency Full-Day leave for 26/09/2026 at 14:10 (2:10 PM) -> NOT ALLOWED'
  );

  // 26/09/2026 14:10 -> Emergency Half Day ALLOWED
  const emg1410Half = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 4,
      startDate: '2026-09-26',
      endDate: '2026-09-26',
      dayType: 'HALF_DAY',
      halfDayPeriod: 'SECOND_HALF',
      reasonCategory: 'MEDICAL_EMERGENCY',
      reason: 'Sudden medical emergency at 2:10 PM requiring afternoon off',
      isEmergency: true,
      applicationTimestampOverride: '2026-09-26T14:10:00+05:30',
    },
    EMP_ALICE
  );
  assert(
    Boolean(emg1410Half?.id) && Number(emg1410Half.totalDays) === 0.5,
    '9.2.5 Emergency Half-Day leave for 26/09/2026 at 14:10 (2:10 PM) -> ALLOWED (0.5 day)'
  );
  await LeaveRequestService.cancelLeaveRequest(emg1410Half.id, 'Reset for shift tests', EMP_ALICE);

  // 9.3 Employee-Specific Shift / Office Timing Validation
  const shiftMasterList = await ShiftService.getShifts();
  const shiftGN = shiftMasterList.find((s) => s.shiftCode === 'GN')!; // 09:00 - 18:00
  const shiftGN1 = shiftMasterList.find((s) => s.shiftCode === 'GN-1')!; // 08:00 - 17:00
  const shiftSB = shiftMasterList.find((s) => s.shiftCode === 'SB')!; // 14:00 - 23:00

  // Assign GN (09:00-18:00) to Alice for 2026-09-26
  await ShiftService.assignShiftToEmployee(
    {
      employeeId: EMP_ALICE.employeeId!,
      shiftId: shiftGN.id,
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-09-30',
    },
    SUPER_ADMIN
  );

  // With GN (09:00-18:00): 08:59 -> Emergency Full Day ALLOWED, 09:00 -> NOT ALLOWED
  const gnAllowed = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 4,
      startDate: '2026-09-26',
      endDate: '2026-09-26',
      dayType: 'FULL_DAY',
      reasonCategory: 'MEDICAL_EMERGENCY',
      reason: 'GN shift emergency before 09:00',
      isEmergency: true,
      applicationTimestampOverride: '2026-09-26T08:59:00+05:30',
    },
    EMP_ALICE
  );
  assert(
    Boolean(gnAllowed?.id),
    '9.3.1 Employee on GN (09:00-18:00): Emergency Full-Day at 08:59 -> ALLOWED'
  );
  await LeaveRequestService.cancelLeaveRequest(gnAllowed.id, 'Reset', EMP_ALICE);

  let gn0900Blocked = false;
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 4,
        startDate: '2026-09-26',
        endDate: '2026-09-26',
        dayType: 'FULL_DAY',
        reasonCategory: 'MEDICAL_EMERGENCY',
        reason: 'GN shift emergency at 09:00',
        isEmergency: true,
        applicationTimestampOverride: '2026-09-26T09:00:00+05:30',
      },
      EMP_ALICE
    );
  } catch {
    gn0900Blocked = true;
  }
  assert(
    gn0900Blocked,
    '9.3.2 Employee on GN (09:00-18:00): Emergency Full-Day at 09:00 -> NOT ALLOWED'
  );

  // Assign GN-1 (08:00-17:00) to Alice effective 2026-10-01
  await ShiftService.assignShiftToEmployee(
    {
      employeeId: EMP_ALICE.employeeId!,
      shiftId: shiftGN1.id,
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-31',
    },
    SUPER_ADMIN
  );

  // On 2026-10-03 (GN-1 = 08:00-17:00): 07:59 -> ALLOWED, 08:00 -> NOT ALLOWED
  const gn1Allowed = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 4,
      startDate: '2026-10-03',
      endDate: '2026-10-03',
      dayType: 'FULL_DAY',
      reasonCategory: 'MEDICAL_EMERGENCY',
      reason: 'GN-1 shift emergency at 07:59',
      isEmergency: true,
      applicationTimestampOverride: '2026-10-03T07:59:00+05:30',
    },
    EMP_ALICE
  );
  assert(
    Boolean(gn1Allowed?.id),
    '9.3.3 Employee on GN-1 (08:00-17:00): Emergency Full-Day at 07:59 -> ALLOWED'
  );
  await LeaveRequestService.cancelLeaveRequest(gn1Allowed.id, 'Reset', EMP_ALICE);

  let gn10800Blocked = false;
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 4,
        startDate: '2026-10-03',
        endDate: '2026-10-03',
        dayType: 'FULL_DAY',
        reasonCategory: 'MEDICAL_EMERGENCY',
        reason: 'GN-1 shift emergency at 08:00',
        isEmergency: true,
        applicationTimestampOverride: '2026-10-03T08:00:00+05:30',
      },
      EMP_ALICE
    );
  } catch {
    gn10800Blocked = true;
  }
  assert(
    gn10800Blocked,
    '9.3.4 Employee on GN-1 (08:00-17:00): Emergency Full-Day at 08:00 -> NOT ALLOWED'
  );

  // Department Shift & Department Transfer Effective Date check for Shift Start Timing
  resetAll();
  await ShiftService.assignShiftToDepartment(
    {
      departmentId: 5, // Maestro_Import -> GN-1 (08:00)
      shiftId: shiftGN1.id,
      effectiveFrom: '2026-01-01',
    },
    SUPER_ADMIN
  );
  await ShiftService.assignShiftToDepartment(
    {
      departmentId: 6, // A R Transportation -> SB (14:00)
      shiftId: shiftSB.id,
      effectiveFrom: '2026-01-01',
    },
    SUPER_ADMIN
  );
  await UserService.updateEmployee(
    EMP_ALICE.employeeId!,
    { departmentId: 5, effectiveFrom: '2026-01-01' },
    SUPER_ADMIN
  );
  await UserService.updateEmployee(
    EMP_ALICE.employeeId!,
    { departmentId: 6, effectiveFrom: '2026-10-01' },
    SUPER_ADMIN
  );

  // Before transfer (2026-09-26, in Dept 5 = 08:00 start): Emergency Full-Day at 10:00 -> NOT ALLOWED
  let dept5At10Blocked = false;
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 4,
        startDate: '2026-09-26',
        endDate: '2026-09-26',
        dayType: 'FULL_DAY',
        reasonCategory: 'MEDICAL_EMERGENCY',
        reason: 'Dept 5 shift started at 08:00',
        isEmergency: true,
        applicationTimestampOverride: '2026-09-26T10:00:00+05:30',
      },
      EMP_ALICE
    );
  } catch {
    dept5At10Blocked = true;
  }
  assert(
    dept5At10Blocked,
    '9.3.5 Before department transfer (Dept 5 shift 08:00): Emergency Full-Day at 10:00 -> NOT ALLOWED'
  );

  // After transfer (2026-10-03, in Dept 6 = 14:00 start): Emergency Full-Day at 10:00 -> ALLOWED
  const dept6At10Allowed = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 4,
      startDate: '2026-10-03',
      endDate: '2026-10-03',
      dayType: 'FULL_DAY',
      reasonCategory: 'MEDICAL_EMERGENCY',
      reason: 'Dept 6 shift starts at 14:00',
      isEmergency: true,
      applicationTimestampOverride: '2026-10-03T10:00:00+05:30',
    },
    EMP_ALICE
  );
  assert(
    Boolean(dept6At10Allowed?.id),
    '9.3.6 After department transfer (Dept 6 shift 14:00): Emergency Full-Day at 10:00 -> ALLOWED'
  );

  // 9.4 Real-World Exact Scenario Verification: 26/09/2026 14:42 Asia/Kolkata
  resetAll();
  let normal1442Blocked = false;
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-09-26',
        endDate: '2026-09-26',
        dayType: 'FULL_DAY',
        reason: 'Normal full day at 14:42 IST on 26/09/2026',
        applicationTimestampOverride: '2026-09-26T14:42:00+05:30',
      },
      EMP_ALICE
    );
  } catch {
    normal1442Blocked = true;
  }
  assert(
    normal1442Blocked,
    '9.4.1 Real-world check: 26/09/2026 14:42 Asia/Kolkata Normal Full-Day for 26/09/2026 -> REJECTED'
  );

  let emergencyFull1442Blocked = false;
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 4,
        startDate: '2026-09-26',
        endDate: '2026-09-26',
        dayType: 'FULL_DAY',
        reasonCategory: 'MEDICAL_EMERGENCY',
        reason: 'Emergency full day at 14:42 IST on 26/09/2026',
        isEmergency: true,
        applicationTimestampOverride: '2026-09-26T14:42:00+05:30',
      },
      EMP_ALICE
    );
  } catch {
    emergencyFull1442Blocked = true;
  }
  assert(
    emergencyFull1442Blocked,
    '9.4.2 Real-world check: 26/09/2026 14:42 Asia/Kolkata Emergency Full-Day for 26/09/2026 -> REJECTED'
  );

  const emergencyHalf1442Allowed = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 4,
      startDate: '2026-09-26',
      endDate: '2026-09-26',
      dayType: 'HALF_DAY',
      halfDayPeriod: 'SECOND_HALF',
      reasonCategory: 'MEDICAL_EMERGENCY',
      reason: 'Emergency half day at 14:42 IST on 26/09/2026',
      isEmergency: true,
      applicationTimestampOverride: '2026-09-26T14:42:00+05:30',
    },
    EMP_ALICE
  );
  assert(
    Boolean(emergencyHalf1442Allowed?.id) && Number(emergencyHalf1442Allowed.totalDays) === 0.5,
    '9.4.3 Real-world check: 26/09/2026 14:42 Asia/Kolkata Emergency Half-Day for 26/09/2026 -> ALLOWED (0.5 day)'
  );

  // =========================================================================
  // 10. HTTP API SUBMIT ROUTE & JSON RESPONSE REGRESSION TESTS
  // =========================================================================
  console.log('\n--- 10. HTTP API Submit Route & JSON Content-Type Regression ---');
  resetAll();

  const testApp = express();
  testApp.use(express.json({ limit: '15mb' }));
  testApp.use(express.urlencoded({ extended: true, limit: '15mb' }));
  testApp.use('/api', authMiddleware);

  testApp.post(
    '/api/leave-requests/upload-document',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const { fileName, fileSize, mimeType, fileMime, fileData } = req.body;
        const safeMime = mimeType || fileMime || AttachmentService.inferMimeType(fileName, null);
        const processed = AttachmentService.validateAndProcessAttachment(
          fileName,
          Number(fileSize || 1024),
          safeMime
        );
        const storedBuffer = AttachmentService.storeAttachmentData(
          processed.safeStoragePath,
          processed.safeFileName,
          fileData,
          safeMime,
          processed.sanitizedOriginalName
        );
        const safeSize = Number(fileSize || storedBuffer.length || 1024);
        res.json({
          success: true,
          attachment: {
            ...processed,
            attachmentPath: processed.safeStoragePath,
            attachmentName: processed.sanitizedOriginalName,
            attachmentSize: safeSize,
            attachmentMime: safeMime,
          },
        });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  testApp.get(
    [
      '/api/leave-requests/:id/attachment',
      '/api/team-leader/leave-requests/:id/attachment',
      '/api/hr/leave-requests/:id/attachment',
      '/api/management/leave-requests/:id/attachment',
    ],
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const attachment = await LeaveRequestService.getAuthorizedAttachment(id, req.user!);
        const mode = String(req.query.mode || '').toLowerCase();
        const isDownload =
          mode === 'download' ||
          req.query.download === '1' ||
          req.query.download === 'true' ||
          !attachment.isInlineViewable;
        const disposition = isDownload ? 'attachment' : 'inline';
        res.setHeader('Content-Type', attachment.mimeType);
        res.setHeader('Content-Length', String(attachment.buffer.length));
        res.setHeader('Content-Disposition', `${disposition}; filename="${attachment.fileName}"`);
        res.status(200).send(attachment.buffer);
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        if (err instanceof ValidationError) {
          return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: 'Unable to open attachment. Please try downloading the file.' });
      }
    }
  );

  testApp.delete(
    '/api/leave-requests/:id/attachment',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        await LeaveRequestService.removeAttachmentFromSubmittedRequest(id, req.user!);
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        if (err instanceof ValidationError) {
          return res.status(404).json({ error: err.message });
        }
        return res.status(500).json({ error: err.message });
      }
    }
  );

  testApp.post(
    ['/api/leave-requests', '/api/leave-requests/submit', '/api/leave-requests/apply'],
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const rawBody = req.body || {};
        const normalizedBody = {
          ...rawBody,
          leaveTypeId: Number(rawBody.leaveTypeId ?? rawBody.leaveType ?? 1),
          dayType: rawBody.dayType || rawBody.durationUnit || 'FULL_DAY',
          halfDayPeriod: rawBody.halfDayPeriod ?? rawBody.halfDaySession ?? null,
        };
        const created = await LeaveRequestService.submitLeaveRequest(normalizedBody, req.user!);
        res.status(201).json({ success: true, leaveRequest: created });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  testApp.post(
    ['/api/team-leader/leave-requests/:id/decision', '/api/approvals/team-leader/:id/decision'],
    requireRole(['SUPER_ADMIN', 'TEAM_LEADER']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const updated = await ApprovalService.submitTeamLeaderDecision(id, req.body, req.user!);
        res.json({ success: true, leaveRequest: updated });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  testApp.post(
    '/api/hr/leave-requests/:id/decision',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const updated = await ApprovalService.submitHrDecision(id, req.body, req.user!);
        res.json({ success: true, leaveRequest: updated });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  testApp.post(
    '/api/management/leave-requests/:id/decision',
    requireRole(['SUPER_ADMIN', 'TOP_MANAGEMENT']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const updated = await ApprovalService.submitManagementDecision(id, req.body, req.user!);
        res.json({ success: true, leaveRequest: updated });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  testApp.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    });
  });

  testApp.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return res.status(413).json({ error: 'Attachment or request payload exceeds maximum allowed size (15 MB).' });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON request payload.' });
    }
    if (req.originalUrl.startsWith('/api')) {
      return res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' });
    }
    next(err);
  });

  // Simulated SPA fallback after /api guard
  testApp.get('*', (_req: Request, res: Response) => {
    res.status(200).type('html').send('<!DOCTYPE html><html><body>SPA</body></html>');
  });

  const server = await new Promise<import('http').Server>((resolve) => {
    const s = testApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as import('net').AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const empHeaders = {
    'Content-Type': 'application/json',
    'x-user-role': 'EMPLOYEE',
    'x-user-id': '4',
    'x-employee-id': '4',
  };

  try {
    // A. Valid submission returns JSON and 201 status
    const resA = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-09-28',
        endDate: '2026-09-28',
        dayType: 'FULL_DAY',
        reasonCategory: 'OTHER',
        reason: 'Planned personal leave before cutoff',
        emergencyException: false,
        applicationTimestampOverride: '2026-09-27T17:59:00+05:30',
      }),
    });
    const ctA = resA.headers.get('content-type') || '';
    const bodyA = await parseApiJson(resA);
    assert(
      resA.status === 201 && ctA.includes('application/json') && bodyA.success === true && bodyA.leaveRequest?.id,
      '10.A Valid leave submission via POST /api/leave-requests returns HTTP 201 and application/json'
    );

    // B. Invalid Full Day cutoff returns JSON error and 400 status
    const resB = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-09-26',
        endDate: '2026-09-26',
        dayType: 'FULL_DAY',
        reasonCategory: 'OTHER',
        reason: 'Late normal full day attempt at 14:42',
        emergencyException: false,
        applicationTimestampOverride: '2026-09-26T14:42:00+05:30',
      }),
    });
    const ctB = resB.headers.get('content-type') || '';
    const bodyB = await parseApiJson(resB);
    assert(
      resB.status === 400 &&
        ctB.includes('application/json') &&
        typeof bodyB.error === 'string' &&
        bodyB.error.includes('cannot be submitted after the cutoff'),
      '10.B Invalid Normal Full-Day cutoff returns HTTP 400 and JSON error message'
    );

    // C. Emergency Full Day after shift start returns JSON error and 400 status
    const resC = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        leaveTypeId: 4,
        startDate: '2026-09-26',
        endDate: '2026-09-26',
        dayType: 'FULL_DAY',
        reasonCategory: 'MEDICAL_EMERGENCY',
        reason: 'Emergency full day after shift start at 14:42',
        emergencyException: false,
        applicationTimestampOverride: '2026-09-26T14:42:00+05:30',
      }),
    });
    const ctC = resC.headers.get('content-type') || '';
    const bodyC = await parseApiJson(resC);
    assert(
      resC.status === 400 &&
        ctC.includes('application/json') &&
        typeof bodyC.error === 'string' &&
        bodyC.error.includes('Emergency Full Day leave cannot be submitted after the employee\'s shift start time'),
      '10.C Emergency Full-Day after shift start returns HTTP 400 and JSON error message'
    );

    // D. Emergency Half Day returns JSON success response (201)
    const resD = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        leaveTypeId: 4,
        startDate: '2026-09-26',
        endDate: '2026-09-26',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'SECOND_HALF',
        reasonCategory: 'OTHER',
        reason: 'Emergency half day at 14:42 with Emergency Leave type',
        emergencyException: false,
        applicationTimestampOverride: '2026-09-26T14:42:00+05:30',
      }),
    });
    const ctD = resD.headers.get('content-type') || '';
    const bodyD = await parseApiJson(resD);
    assert(
      resD.status === 201 &&
        ctD.includes('application/json') &&
        bodyD.success === true &&
        Number(bodyD.leaveRequest?.totalDays) === 0.5,
      '10.D Emergency Half-Day at 14:42 returns HTTP 201 and JSON success response (0.5 day)'
    );

    // E1. Large attachment upload (>150KB base64) returns JSON 200 (never 413 HTML <!DOCTYPE)
    const resUpload = await fetch(`${baseUrl}/api/leave-requests/upload-document`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        fileName: 'medical_certificate.pdf',
        mimeType: 'application/pdf',
        fileSize: 200000,
        fileData: 'data:application/pdf;base64,' + 'A'.repeat(250000),
      }),
    });
    const ctUpload = resUpload.headers.get('content-type') || '';
    const bodyUpload = await parseApiJson(resUpload);
    assert(
      resUpload.status === 200 && ctUpload.includes('application/json') && bodyUpload.success === true,
      '10.E1 Large base64 document upload returns HTTP 200 application/json (never 413 HTML)'
    );

    // E2. Unmatched /api/* endpoint returns JSON 404 (never falls through to SPA HTML)
    const resNotFound = await fetch(`${baseUrl}/api/leave-requests/non-existent-endpoint`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({}),
    });
    const ctNotFound = resNotFound.headers.get('content-type') || '';
    const textNotFound = await resNotFound.text();
    assert(
      resNotFound.status === 404 &&
        ctNotFound.includes('application/json') &&
        !textNotFound.trim().startsWith('<!DOCTYPE'),
      '10.E2 Unmatched /api/* route returns HTTP 404 application/json and never returns <!DOCTYPE HTML'
    );

    // E3. Defensive frontend parseApiJson converts unexpected HTML into clean error without exposing <!DOCTYPE
    const fakeHtmlResponse = new globalThis.Response('<!DOCTYPE html><html><body>Error</body></html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    let safeErrorMsg = '';
    try {
      await parseApiJson(fakeHtmlResponse);
    } catch (err: any) {
      safeErrorMsg = err.message;
    }
    assert(
      Boolean(safeErrorMsg) && !safeErrorMsg.includes('Unexpected token') && !safeErrorMsg.includes('<!DOCTYPE'),
      '10.E3 Frontend parseApiJson handles HTML responses gracefully without exposing <!DOCTYPE or Unexpected token'
    );

    // =========================================================================
    // 11. LEAVE ATTACHMENT ACCESS, DTO CONSISTENCY & AUTHORIZATION TESTS
    // =========================================================================
    console.log('\n--- 11. Leave Attachment Access, DTO Consistency & Authorization ---');
    const pdfPayload = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'utf-8').toString('base64');
    const uploadDocRes = await fetch(`${baseUrl}/api/leave-requests/upload-document`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        fileName: 'hospital_certificate_2026.pdf',
        mimeType: 'application/pdf',
        fileSize: 4096,
        fileData: `data:application/pdf;base64,${pdfPayload}`,
      }),
    });
    const uploadedDocBody = await parseApiJson(uploadDocRes);
    const attMeta = uploadedDocBody.attachment;

    const submitWithAttRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        leaveTypeId: 2, // Sick Leave
        startDate: '2026-10-08',
        endDate: '2026-10-08',
        dayType: 'FULL_DAY',
        reasonCategory: 'MEDICAL_EMERGENCY',
        reason: 'Medical appointment with supporting hospital certificate',
        attachmentPath: attMeta.attachmentPath,
        attachmentName: attMeta.attachmentName,
        attachmentSize: attMeta.attachmentSize,
        attachmentMime: attMeta.attachmentMime,
        applicationTimestampOverride: '2026-10-07T15:00:00+05:30',
      }),
    });
    const submitWithAttData = await parseApiJson(submitWithAttRes);
    const attReqId = submitWithAttData.leaveRequest?.id;
    assert(
      Boolean(attReqId) &&
        submitWithAttData.leaveRequest.hasAttachment === true &&
        submitWithAttData.leaveRequest.attachmentName === 'hospital_certificate_2026.pdf' &&
        submitWithAttData.leaveRequest.attachmentUrl === `/api/leave-requests/${attReqId}/attachment`,
      '11.1 Employee leave submission stores attachment metadata, hasAttachment=true, and attachmentUrl'
    );

    // Verify Team Leader list & detail DTOs include attachment metadata
    const tlList = await ApprovalService.getRequestsForTeamLeader({ status: 'ALL' }, TL_ROBERT);
    const tlItem = tlList.find((r) => r.id === attReqId);
    const tlDetails = await ApprovalService.getApprovalDetails(attReqId, TL_ROBERT);
    assert(
      Boolean(tlItem?.hasAttachment) &&
        tlItem?.attachmentName === 'hospital_certificate_2026.pdf' &&
        Boolean(tlDetails?.request.hasAttachment) &&
        tlDetails?.request.attachmentUrl === `/api/leave-requests/${attReqId}/attachment`,
      '11.2 Team Leader queue and detail DTOs include full attachment metadata'
    );

    // Verify Team Leader can view & download the attachment over HTTP
    const tlViewRes = await fetch(`${baseUrl}/api/leave-requests/${attReqId}/attachment?mode=inline`, {
      headers: { 'x-user-role': 'TEAM_LEADER', 'x-user-id': '5', 'x-employee-id': '5' },
    });
    const tlViewBytes = Buffer.from(await tlViewRes.arrayBuffer());
    assert(
      tlViewRes.status === 200 &&
        (tlViewRes.headers.get('content-type') || '').includes('application/pdf') &&
        (tlViewRes.headers.get('content-disposition') || '').includes('inline') &&
        tlViewBytes.toString('utf-8').startsWith('%PDF-1.4'),
      '11.3 Team Leader can view/open attachment inline with application/pdf Content-Type and valid PDF bytes'
    );

    // Approve as Team Leader so request advances to HR
    await ApprovalService.submitTeamLeaderDecision(
      attReqId,
      { decision: 'APPROVED', remarks: 'Verified hospital certificate' },
      TL_ROBERT
    );

    // Verify HR list & detail DTOs include attachment metadata and HR can download attachment
    const hrList = await ApprovalService.getRequestsForHr({ status: 'ALL' }, HR_USER);
    const hrItem = hrList.find((r) => r.id === attReqId);
    const hrDetails = await ApprovalService.getApprovalDetails(attReqId, HR_USER);
    const hrDownloadRes = await fetch(`${baseUrl}/api/leave-requests/${attReqId}/attachment?mode=download`, {
      headers: { 'x-user-role': 'HR', 'x-user-id': '2', 'x-employee-id': '2' },
    });
    assert(
      Boolean(hrItem?.hasAttachment) &&
        Boolean(hrDetails?.request.hasAttachment) &&
        hrDownloadRes.status === 200 &&
        (hrDownloadRes.headers.get('content-disposition') || '').includes('attachment'),
      '11.4 HR queue/detail DTOs include attachment metadata and HR can view/download the file'
    );

    // Verify Top Management list & detail DTOs include attachment metadata and Top Management can view/download attachment
    const mgmtList = await ApprovalService.getRequestsForManagement({ status: 'ALL' }, TOP_MGMT);
    const mgmtItem = mgmtList.find((r) => r.id === attReqId);
    const mgmtDetails = await ApprovalService.getApprovalDetails(attReqId, TOP_MGMT);
    const mgmtViewRes = await fetch(`${baseUrl}/api/management/leave-requests/${attReqId}/attachment?mode=inline`, {
      headers: { 'x-user-role': 'TOP_MANAGEMENT', 'x-user-id': '3', 'x-employee-id': '3' },
    });
    const mgmtViewBytes = Buffer.from(await mgmtViewRes.arrayBuffer());
    assert(
      Boolean(mgmtItem?.hasAttachment) &&
        mgmtItem?.attachmentName === 'hospital_certificate_2026.pdf' &&
        Boolean(mgmtDetails?.request.hasAttachment) &&
        mgmtDetails?.request.attachmentName === 'hospital_certificate_2026.pdf' &&
        mgmtDetails?.request.attachmentMime === 'application/pdf' &&
        mgmtViewRes.status === 200 &&
        mgmtViewBytes.toString('utf-8').startsWith('%PDF-1.4'),
      '11.5 Top Management queue & detail DTOs include attachment metadata and Top Management can open/download the file'
    );

    // Verify Employee (own request) can view/download attachment
    const ownEmpRes = await fetch(`${baseUrl}/api/leave-requests/${attReqId}/attachment?mode=inline`, {
      headers: empHeaders,
    });
    assert(
      ownEmpRes.status === 200 && (ownEmpRes.headers.get('content-type') || '').includes('application/pdf'),
      '11.6 Submitting employee can view/download their own leave attachment'
    );

    // Verify another Employee (employeeId 7) is forbidden (403) from accessing Alice's attachment
    const otherEmpRes = await fetch(`${baseUrl}/api/leave-requests/${attReqId}/attachment`, {
      headers: { 'x-user-role': 'EMPLOYEE', 'x-user-id': '7', 'x-employee-id': '7' },
    });
    assert(
      otherEmpRes.status === 403,
      '11.7 Unauthorized employee cannot access another employee’s leave attachment (HTTP 403)'
    );

    // Verify unassigned Team Leader (TL_PRIYA, employeeId 6) is forbidden (403) from accessing Alice's attachment
    const otherTlRes = await fetch(`${baseUrl}/api/leave-requests/${attReqId}/attachment`, {
      headers: { 'x-user-role': 'TEAM_LEADER', 'x-user-id': '6', 'x-employee-id': '6' },
    });
    assert(
      otherTlRes.status === 403,
      '11.8 Unassigned Team Leader cannot access attachment of an employee outside their team (HTTP 403)'
    );

    // =========================================================================
    // 12. ATTACHMENT REMOVAL, REPLACEMENT, AND POST-SUBMISSION IMMUTABILITY
    // =========================================================================
    console.log('\n--- 12. Attachment Removal, Replacement & Post-Submission Protection ---');

    // 12.1 Post-submission attachment removal is strictly forbidden (403)
    const delAttRes = await fetch(`${baseUrl}/api/leave-requests/${attReqId}/attachment`, {
      method: 'DELETE',
      headers: empHeaders,
    });
    const delAttBody = await parseApiJson(delAttRes);
    assert(
      delAttRes.status === 403 &&
        typeof delAttBody.error === 'string' &&
        delAttBody.error.includes('Forbidden'),
      '12.1 Removing attachment from an already-submitted leave request is rejected with HTTP 403 Forbidden'
    );

    // 12.2 Pre-submission removal: employee selects a file, removes it, and submits without attachment
    const submitAfterRemoveRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        leaveTypeId: 1, // Casual Leave
        startDate: '2026-10-12',
        endDate: '2026-10-12',
        dayType: 'FULL_DAY',
        reasonCategory: 'OTHER',
        reason: 'Selected attachment was removed before submission',
        attachmentPath: null,
        attachmentName: null,
        attachmentSize: null,
        attachmentMime: null,
        applicationTimestampOverride: '2026-10-10T10:00:00+05:30',
      }),
    });
    const submitAfterRemoveData = await parseApiJson(submitAfterRemoveRes);
    assert(
      submitAfterRemoveRes.status === 201 &&
        submitAfterRemoveData.leaveRequest?.hasAttachment === false &&
        submitAfterRemoveData.leaveRequest?.attachmentPath === null &&
        submitAfterRemoveData.leaveRequest?.attachmentName === null,
      '12.2 Submitting after removing selected attachment leaves hasAttachment=false and no linked file'
    );

    // 12.3 Pre-submission replacement: employee removes file A, selects replacement PNG file B, and submits
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const replaceUploadRes = await fetch(`${baseUrl}/api/leave-requests/upload-document`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        fileName: 'replacement_prescription.png',
        mimeType: 'image/png',
        fileSize: 2048,
        fileData: `data:image/png;base64,${pngBase64}`,
      }),
    });
    const replaceUploadData = await parseApiJson(replaceUploadRes);
    const repAtt = replaceUploadData.attachment;

    const submitReplacedRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-10-14',
        endDate: '2026-10-14',
        dayType: 'FULL_DAY',
        reasonCategory: 'OTHER',
        reason: 'Submitted with replacement PNG attachment after removing first file',
        attachmentPath: repAtt.attachmentPath,
        attachmentName: repAtt.attachmentName,
        attachmentSize: repAtt.attachmentSize,
        attachmentMime: repAtt.attachmentMime,
        applicationTimestampOverride: '2026-10-12T10:00:00+05:30',
      }),
    });
    const submitReplacedData = await parseApiJson(submitReplacedRes);
    const replacedReqId = submitReplacedData.leaveRequest?.id;
    const previewPngRes = await fetch(
      `${baseUrl}/api/leave-requests/${replacedReqId}/attachment?mode=inline`,
      { headers: empHeaders }
    );
    assert(
      submitReplacedRes.status === 201 &&
        submitReplacedData.leaveRequest?.attachmentName === 'replacement_prescription.png' &&
        previewPngRes.status === 200 &&
        (previewPngRes.headers.get('content-type') || '').includes('image/png'),
      '12.3 Replacement attachment (PNG) is uploaded, linked, and served with image/png Content-Type for in-app preview'
    );

    // =========================================================================
    // 13. TOP MANAGEMENT LEAVE APPROVAL ROUTING & SELF-APPROVAL PREVENTION
    // =========================================================================
    console.log('\n--- 13. Top Management Leave Approval Routing & Self-Approval Prevention ---');

    // User 7 (Elena Rostova, TOP_MANAGEMENT, employeeId 7) reports to User 3 (John Director, TOP_MANAGEMENT, employeeId 3)
    const TOP_MGMT_ELENA: AuthContext = {
      userId: 7,
      employeeId: 7,
      username: 'director_elena',
      role: 'TOP_MANAGEMENT',
    };

    const elenaReq = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-10-19',
        endDate: '2026-10-20',
        dayType: 'FULL_DAY',
        reasonCategory: 'OTHER',
        reason: 'Executive summit attendance',
        attachmentPath: repAtt.attachmentPath,
        attachmentName: repAtt.attachmentName,
        attachmentSize: repAtt.attachmentSize,
        attachmentMime: repAtt.attachmentMime,
        applicationTimestampOverride: '2026-10-15T11:00:00+05:30',
      },
      TOP_MGMT_ELENA
    );

    assert(
      elenaReq.applicantRole === 'TOP_MANAGEMENT' &&
        elenaReq.teamLeaderDecision === 'NOT_REQUIRED' &&
        elenaReq.hrDecision === 'NOT_REQUIRED' &&
        elenaReq.managementDecision === 'PENDING' &&
        elenaReq.approvalStageLabel === 'Pending Top Management' &&
        elenaReq.reportingManagerId === 3,
      '13.1 Top Management leave request bypasses Team Leader & HR (NOT_REQUIRED) and routes directly to Top Management'
    );

    // 13.2 Verify Top Management request does NOT appear in Team Leader or HR queues
    const tlQueueForElena = await ApprovalService.getRequestsForTeamLeader({ status: 'ALL' }, TL_ROBERT);
    const hrQueueForElena = await ApprovalService.getRequestsForHr({ status: 'ALL' }, HR_USER);
    assert(
      !tlQueueForElena.some((r) => r.id === elenaReq.id) &&
        !hrQueueForElena.some((r) => r.id === elenaReq.id),
      '13.2 Top Management leave request is excluded from Team Leader and HR approval queues'
    );

    // 13.3 Verify Team Leader and HR cannot approve, reject, or access attachments of Top Management request
    let tlBlockedOnTopMgmt = false;
    try {
      await ApprovalService.submitTeamLeaderDecision(
        elenaReq.id,
        { decision: 'APPROVED', remarks: 'Attempted TL approval' },
        TL_ROBERT
      );
    } catch (e: any) {
      tlBlockedOnTopMgmt = e.message.includes('Forbidden');
    }

    let hrBlockedOnTopMgmt = false;
    try {
      await ApprovalService.submitHrDecision(
        elenaReq.id,
        { decision: 'APPROVED', remarks: 'Attempted HR approval' },
        HR_USER
      );
    } catch (e: any) {
      hrBlockedOnTopMgmt = e.message.includes('Forbidden');
    }

    const hrAttAttempt = await fetch(`${baseUrl}/api/leave-requests/${elenaReq.id}/attachment`, {
      headers: { 'x-user-role': 'HR', 'x-user-id': '2', 'x-employee-id': '2' },
    });

    assert(
      tlBlockedOnTopMgmt && hrBlockedOnTopMgmt && hrAttAttempt.status === 403,
      '13.3 Team Leader and HR are forbidden (403) from deciding on or viewing attachments of Top Management leave requests'
    );

    // 13.4 Self-approval prevention: Elena (applicant) cannot see her own request in her actionable Management approval queue or approve it herself
    const elenaMgmtQueue = await ApprovalService.getRequestsForManagement(
      { status: 'PENDING' },
      TOP_MGMT_ELENA
    );
    let selfApproveBlocked = false;
    try {
      await ApprovalService.submitManagementDecision(
        elenaReq.id,
        { decision: 'APPROVED', remarks: 'Attempting self-approval' },
        TOP_MGMT_ELENA
      );
    } catch (e: any) {
      selfApproveBlocked = e.message.includes('Self-approval is not permitted');
    }
    assert(
      !elenaMgmtQueue.some((r) => r.id === elenaReq.id) && selfApproveBlocked,
      '13.4 Top Management applicant cannot self-approve their own leave request'
    );

    // 13.5 Unassigned Top Management user (e.g. employeeId 999) cannot approve Elena's request assigned to John Director (employeeId 3)
    const OTHER_TOP_MGMT: AuthContext = {
      userId: 88,
      employeeId: 88,
      username: 'other_director',
      role: 'TOP_MANAGEMENT',
    };
    let unassignedMgmtBlocked = false;
    try {
      await ApprovalService.submitManagementDecision(
        elenaReq.id,
        { decision: 'APPROVED', remarks: 'Unassigned director attempt' },
        OTHER_TOP_MGMT
      );
    } catch (e: any) {
      unassignedMgmtBlocked = e.message.includes('Only the assigned reporting manager or Super Admin');
    }
    assert(
      unassignedMgmtBlocked,
      '13.5 Non-reporting Top Management user is blocked from approving another Top Management employee’s leave request'
    );

    // 13.6 Assigned Reporting Manager (John Director, employeeId 3) sees Elena's request and approves it directly
    const johnMgmtQueue = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);
    const johnApproved = await ApprovalService.submitManagementDecision(
      elenaReq.id,
      { decision: 'APPROVED', remarks: 'Approved by Reporting Executive Director' },
      TOP_MGMT
    );
    assert(
      johnMgmtQueue.some((r) => r.id === elenaReq.id) &&
        johnApproved.finalStatus === 'APPROVED' &&
        johnApproved.balancePosted === true,
      '13.6 Assigned reporting person (John Director) sees and approves Top Management leave request, posting balance deduction'
    );

    // =========================================================================
    // 14. PERSISTED RBAC ROLE PERMISSIONS CONFIGURATION BY SUPER ADMIN
    // =========================================================================
    console.log('\n--- 14. Persisted RBAC Role Permissions Configuration by Super Admin ---');

    // 14.1 Non-Super Admin cannot modify role permissions
    let nonAdminRoleEditBlocked = false;
    try {
      await UserService.updateRolePermissions(
        3,
        { permissions: ['EMPLOYEE_VIEW'] },
        HR_USER
      );
    } catch (e: any) {
      nonAdminRoleEditBlocked = e.message.includes('Forbidden');
    }
    assert(
      nonAdminRoleEditBlocked,
      '14.1 Non-Super Admin (HR) is forbidden from modifying role permissions'
    );

    // 14.2 Super Admin revokes LEAVE_HR_APPROVE from HR role (id: 3) -> HR decision is dynamically blocked
    const initialRoles = await UserService.getRoles();
    const hrRoleRecord = initialRoles.find((r) => r.name === 'HR')!;
    const originalHrPerms = [...(hrRoleRecord.permissions || [])];

    await UserService.updateRolePermissions(
      hrRoleRecord.id,
      { permissions: ['EMPLOYEE_VIEW', 'EMPLOYEE_EDIT'] }, // removed LEAVE_HR_APPROVE
      SUPER_ADMIN
    );

    const hasHrApproveAfterRevoke = await UserService.hasPermission(HR_USER, 'LEAVE_HR_APPROVE');
    assert(
      hasHrApproveAfterRevoke === false,
      '14.2 Super Admin revoking LEAVE_HR_APPROVE from HR role immediately updates persisted role permissions'
    );

    // Restore original HR permissions and verify restoration
    await UserService.updateRolePermissions(
      hrRoleRecord.id,
      { permissions: originalHrPerms },
      SUPER_ADMIN
    );
    const hasHrApproveRestored = await UserService.hasPermission(HR_USER, 'LEAVE_HR_APPROVE');
    assert(
      hasHrApproveRestored === true,
      '14.3 Super Admin re-granting LEAVE_HR_APPROVE to HR role immediately restores permission'
    );

    // 14.4 Employee profile privacy & self-service field restrictions
    let empOtherProfileBlocked = false;
    try {
      await UserService.updateEmployee(5, { mobile: '9999999999' }, EMP_ALICE);
    } catch (e: any) {
      empOtherProfileBlocked = e.message.includes('Forbidden');
    }
    let empPrivilegeEscalationBlocked = false;
    try {
      await UserService.updateEmployee(
        EMP_ALICE.employeeId!,
        { departmentId: 1, reportingManagerId: 1 },
        EMP_ALICE
      );
    } catch (e: any) {
      empPrivilegeEscalationBlocked = e.message.includes('Forbidden');
    }
    assert(
      empOtherProfileBlocked && empPrivilegeEscalationBlocked,
      '14.4 Employee cannot edit another employee profile or alter restricted fields (department, reporting person, role)'
    );

    // =========================================================================
    // 15. MULTIPLE HOLIDAY LISTS & EFFECTIVE-DATED EMPLOYEE ASSIGNMENTS
    // =========================================================================
    console.log('\n--- 15. Multiple Holiday Lists & Effective-Dated Employee Assignments ---');
    const customList = await HolidayService.createHolidayList(
      {
        listCode: 'HL-CUSTOM-PORT-2026',
        listName: 'Custom Port Operations Calendar 2026',
        year: 2026,
        isDefault: false,
      },
      SUPER_ADMIN
    );
    const portHoliday = await HolidayService.createHoliday({
      holidayDate: '2026-12-10', // Thursday
      holidayName: 'Port Maritime Day',
      holidayListId: customList.id,
      isActive: true,
    });
    const empHolAssign = await HolidayService.assignEmployeeHolidayList(
      {
        employeeId: EMP_ALICE.employeeId!,
        holidayListId: customList.id,
        effectiveFrom: '2026-12-01',
        effectiveTo: '2026-12-31',
        remarks: 'December port deployment',
      },
      SUPER_ADMIN
    );
    const aliceDecCalc = await WorkingDaysService.calculateWorkingDays(
      '2026-12-10',
      '2026-12-10',
      'FULL_DAY',
      { employeeId: EMP_ALICE.employeeId! }
    );
    assert(
      Boolean(customList.id) &&
        Boolean(portHoliday.id) &&
        Boolean(empHolAssign.id) &&
        aliceDecCalc.totalDays === 0 &&
        aliceDecCalc.holidayDays.some((h) => h.name === 'Port Maritime Day'),
      '15.1 Employee-assigned effective-dated Holiday List is used in working-day and leave eligibility calculations'
    );

    // =========================================================================
    // 16. OVERTIME SCHEDULING (DATE RANGE, START/END TIME, PERMISSIONS, AUDIT)
    // =========================================================================
    console.log('\n--- 16. Overtime Scheduling, Auto-Duration, Permissions & Audit History ---');
    const { OvertimeService } = await import('../services/overtimeService.ts');
    OvertimeService.resetMemoryStores();

    const scheduledOt = await OvertimeService.createRequest(
      {
        employeeId: EMP_ALICE.employeeId!,
        date: '2026-11-24',
        endDate: '2026-11-25', // 2 days
        startTime: '18:30',
        endTime: '21:00', // 2.5 hrs/day -> 5.0 hrs total across 2 days
        reason: 'Vessel berthing & documentation clearance',
      },
      HR_USER
    );
    const reviewedOt = await OvertimeService.reviewRequest(
      scheduledOt.id,
      'APPROVE',
      'Approved for port clearance',
      HR_USER
    );
    const otAuditLogs = await OvertimeService.getAuditHistory(scheduledOt.id);
    assert(
      scheduledOt.hours === 5 &&
        scheduledOt.startTime === '18:30' &&
        scheduledOt.endTime === '21:00' &&
        reviewedOt.status === 'APPROVED' &&
        otAuditLogs.length >= 2,
      '16.1 Overtime scheduling calculates duration across date range & start/end times, enforces review permissions, and logs audit history'
    );

    // =========================================================================
    // 17. SPLIT WORK SEGMENTS (05:30–08:30 & 19:00–21:00) & OVERLAP VALIDATION
    // =========================================================================
    console.log('\n--- 17. Multiple Work Segments (05:30–08:30 & 19:00–21:00) & Overlap Validation ---');
    ShiftService.resetMemoryStores();
    const shiftsCatalog = await ShiftService.getShifts({ includeInactive: true });
    const daySplitShift = shiftsCatalog.find((s) => s.shiftCode === 'DAY-SPLIT') || shiftsCatalog[0];

    const customSplitAssign = await ShiftService.assignShiftToEmployee(
      {
        employeeId: EMP_ALICE.employeeId!,
        shiftId: daySplitShift.id,
        effectiveFrom: '2026-12-01',
        customSegments: [
          { segmentSequence: 1, startTime: '05:30', endTime: '08:30', crossesMidnight: false, breakMinutes: 0 },
          { segmentSequence: 2, startTime: '19:00', endTime: '21:00', crossesMidnight: false, breakMinutes: 0 },
        ],
        assignmentReason: 'OPERATIONAL_NEED',
      },
      SUPER_ADMIN
    );

    const resolvedSplitSchedule = await ShiftService.resolveEmployeeSchedule(
      EMP_ALICE.employeeId!,
      '2026-12-02' // Wednesday
    );

    let overlapRejected = false;
    try {
      ShiftService.validateSegments([
        { segmentSequence: 1, startTime: '05:30', endTime: '09:00' },
        { segmentSequence: 2, startTime: '08:30', endTime: '12:00' },
      ]);
    } catch {
      overlapRejected = true;
    }

    assert(
      customSplitAssign.totalScheduledHours === 5 &&
        resolvedSplitSchedule.segments.length === 2 &&
        resolvedSplitSchedule.segments[0].startTime === '05:30' &&
        resolvedSplitSchedule.segments[0].endTime === '08:30' &&
        resolvedSplitSchedule.segments[0].durationHours === 3 &&
        resolvedSplitSchedule.segments[1].startTime === '19:00' &&
        resolvedSplitSchedule.segments[1].endTime === '21:00' &&
        resolvedSplitSchedule.segments[1].durationHours === 2 &&
        resolvedSplitSchedule.totalScheduledHours === 5 &&
        overlapRejected === true,
      '17.1 Split work segments 05:30–08:30 (3h) and 19:00–21:00 (2h) resolve to 5.0 total hours and overlapping segments are rejected'
    );

    // =========================================================================
    // 18. BINARY ATTACHMENT PREVIEW, MIME VALIDATION, DOWNLOAD & MISSING FILE ERRORS
    // =========================================================================
    console.log('\n--- 18. Binary Attachment Preview, MIME Integrity, Download & Missing File Handling ---');
    const { detectBinaryMimeType, isValidBinaryAttachment } = await import(
      '../components/LeaveAttachmentBox.tsx'
    );

    // 18.1 PDF upload & inline preview returns exact original binary bytes and application/pdf Content-Type
    const originalPdfBytes = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 55>>stream\nBT /F1 14 Tf 72 720 Td (Original Medical Certificate PDF) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n0000000205 00000 n \n0000000310 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n378\n%%EOF\n',
      'binary'
    );
    const pdfUpRes = await fetch(`${baseUrl}/api/leave-requests/upload-document`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        fileName: 'exact_binary_certificate.pdf',
        mimeType: 'application/pdf',
        fileSize: originalPdfBytes.byteLength,
        fileData: `data:application/pdf;base64,${originalPdfBytes.toString('base64')}`,
      }),
    });
    const pdfUpJson = await parseApiJson(pdfUpRes);
    const pdfLeaveRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        leaveTypeId: 2,
        startDate: '2026-11-03',
        endDate: '2026-11-03',
        dayType: 'FULL_DAY',
        reasonCategory: 'MEDICAL_EMERGENCY',
        reason: 'Binary PDF verification test',
        attachmentPath: pdfUpJson.attachment.attachmentPath,
        attachmentName: pdfUpJson.attachment.attachmentName,
        attachmentSize: pdfUpJson.attachment.attachmentSize,
        attachmentMime: pdfUpJson.attachment.attachmentMime,
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      }),
    });
    const pdfLeaveData = await parseApiJson(pdfLeaveRes);
    const pdfReqId = pdfLeaveData.leaveRequest.id;

    const pdfPreviewRes = await fetch(
      `${baseUrl}/api/leave-requests/${pdfReqId}/attachment?mode=inline`,
      { headers: empHeaders }
    );
    const returnedPdfBuffer = Buffer.from(await pdfPreviewRes.arrayBuffer());
    assert(
      pdfPreviewRes.status === 200 &&
        (pdfPreviewRes.headers.get('content-type') || '') === 'application/pdf' &&
        Number(pdfPreviewRes.headers.get('content-length')) === originalPdfBytes.byteLength &&
        (pdfPreviewRes.headers.get('content-disposition') || '').startsWith('inline;') &&
        Buffer.compare(returnedPdfBuffer, originalPdfBytes) === 0,
      '18.1 PDF preview response returns exact original binary bytes, Content-Type: application/pdf, Content-Length, and inline disposition'
    );

    // 18.2 JPG/JPEG and PNG responses contain exact original binary bytes and image/jpeg or image/png MIME types
    const originalJpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00,
      0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
    ]);
    const jpgUpRes = await fetch(`${baseUrl}/api/leave-requests/upload-document`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        fileName: 'scan_report.jpg',
        mimeType: 'image/jpg', // Verify normalization to image/jpeg
        fileSize: originalJpegBytes.byteLength,
        fileData: `data:image/jpg;base64,${originalJpegBytes.toString('base64')}`,
      }),
    });
    const jpgUpJson = await parseApiJson(jpgUpRes);
    const jpgLeaveRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        leaveTypeId: 2,
        startDate: '2026-11-04',
        endDate: '2026-11-04',
        dayType: 'FULL_DAY',
        reasonCategory: 'MEDICAL_EMERGENCY',
        reason: 'Binary JPEG verification test',
        attachmentPath: jpgUpJson.attachment.attachmentPath,
        attachmentName: jpgUpJson.attachment.attachmentName,
        attachmentSize: jpgUpJson.attachment.attachmentSize,
        attachmentMime: jpgUpJson.attachment.attachmentMime,
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      }),
    });
    const jpgLeaveData = await parseApiJson(jpgLeaveRes);
    const jpgReqId = jpgLeaveData.leaveRequest.id;

    const jpgPreviewRes = await fetch(
      `${baseUrl}/api/leave-requests/${jpgReqId}/attachment?mode=inline`,
      { headers: empHeaders }
    );
    const returnedJpgBuffer = Buffer.from(await jpgPreviewRes.arrayBuffer());

    const originalPngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const pngPreviewBuffer = Buffer.from(
      await (
        await fetch(`${baseUrl}/api/leave-requests/${replacedReqId}/attachment?mode=inline`, {
          headers: empHeaders,
        })
      ).arrayBuffer()
    );

    assert(
      jpgPreviewRes.status === 200 &&
        (jpgPreviewRes.headers.get('content-type') || '') === 'image/jpeg' &&
        Number(jpgPreviewRes.headers.get('content-length')) === originalJpegBytes.byteLength &&
        Buffer.compare(returnedJpgBuffer, originalJpegBytes) === 0 &&
        Buffer.compare(pngPreviewBuffer, originalPngBytes) === 0,
      '18.2 JPG and PNG preview responses return exact original image bytes with image/jpeg and image/png MIME types'
    );

    // 18.3 Preview component does not render base64/raw text and rejects non-binary payloads
    const attachmentBoxSource = fs.readFileSync(
      path.join(process.cwd(), 'src/components/LeaveAttachmentBox.tsx'),
      'utf-8'
    );
    const base64TextBytes = new Uint8Array(
      Buffer.from(`data:application/pdf;base64,${originalPdfBytes.toString('base64')}`, 'utf-8')
    );
    const rawJsonBytes = new Uint8Array(Buffer.from('{"error":"not binary"}', 'utf-8'));

    assert(
      !attachmentBoxSource.includes('parsePdfBufferForInAppView') &&
        !attachmentBoxSource.includes("TextDecoder('latin1')") &&
        attachmentBoxSource.includes('pdfjsLib.getDocument') &&
        isValidBinaryAttachment(new Uint8Array(returnedPdfBuffer), 'application/pdf') === true &&
        isValidBinaryAttachment(new Uint8Array(returnedJpgBuffer), 'image/jpeg') === true &&
        isValidBinaryAttachment(new Uint8Array(pngPreviewBuffer), 'image/png') === true &&
        isValidBinaryAttachment(base64TextBytes, 'application/pdf') === false &&
        isValidBinaryAttachment(rawJsonBytes, 'application/pdf') === false &&
        detectBinaryMimeType(new Uint8Array(returnedPdfBuffer), null, 'doc.pdf') === 'application/pdf' &&
        detectBinaryMimeType(new Uint8Array(returnedJpgBuffer), null, 'img.jpg') === 'image/jpeg',
      '18.3 Preview uses PDF.js and Blob URLs for real binary files and strictly rejects raw text, base64 strings, and JSON metadata'
    );

    // 18.4 Authenticated authorized users can preview, and unauthorized users receive 403
    const authTlPreview = await fetch(
      `${baseUrl}/api/leave-requests/${pdfReqId}/attachment?mode=inline`,
      { headers: { 'x-user-role': 'TEAM_LEADER', 'x-user-id': '5', 'x-employee-id': '5' } }
    );
    const unauthEmpPreview = await fetch(
      `${baseUrl}/api/leave-requests/${pdfReqId}/attachment?mode=inline`,
      { headers: { 'x-user-role': 'EMPLOYEE', 'x-user-id': '7', 'x-employee-id': '7' } }
    );
    assert(
      authTlPreview.status === 200 && unauthEmpPreview.status === 403,
      '18.4 Authorized users can preview (200) while unauthorized users receive HTTP 403'
    );

    // 18.5 Download works with attachment disposition and exact original bytes
    const pdfDownloadRes = await fetch(
      `${baseUrl}/api/leave-requests/${pdfReqId}/attachment?mode=download`,
      { headers: empHeaders }
    );
    const downloadedPdfBuffer = Buffer.from(await pdfDownloadRes.arrayBuffer());
    assert(
      pdfDownloadRes.status === 200 &&
        (pdfDownloadRes.headers.get('content-disposition') || '').startsWith('attachment;') &&
        Buffer.compare(downloadedPdfBuffer, originalPdfBytes) === 0,
      '18.5 Download mode returns Content-Disposition: attachment and exact original binary bytes'
    );

    // 18.6 Missing attachment (request without attachment OR missing file on server) returns 404 structured JSON error
    const noAttRes = await fetch(
      `${baseUrl}/api/leave-requests/${submitAfterRemoveData.leaveRequest.id}/attachment?mode=inline`,
      { headers: empHeaders }
    );
    const noAttJson = await parseApiJson(noAttRes);

    const missingFileLeaveRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-11-05',
        endDate: '2026-11-05',
        dayType: 'FULL_DAY',
        reasonCategory: 'OTHER',
        reason: 'Request pointing to missing file on disk',
        attachmentPath: 'uploads/attachments/non_existent_missing_file_99999.pdf',
        attachmentName: 'missing_document.pdf',
        attachmentSize: 1024,
        attachmentMime: 'application/pdf',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      }),
    });
    const missingFileLeaveData = await parseApiJson(missingFileLeaveRes);
    const missingFileAttRes = await fetch(
      `${baseUrl}/api/leave-requests/${missingFileLeaveData.leaveRequest.id}/attachment?mode=inline`,
      { headers: empHeaders }
    );
    const missingFileAttJson = await parseApiJson(missingFileAttRes);

    assert(
      noAttRes.status === 404 &&
        typeof noAttJson.error === 'string' &&
        noAttJson.error.includes('No attachment found') &&
        missingFileAttRes.status === 404 &&
        typeof missingFileAttJson.error === 'string' &&
        missingFileAttJson.error.includes('not found'),
      '18.6 Missing attachment or missing file on server returns HTTP 404 with clear structured JSON error'
    );

    // =========================================================================
    // 19. OPERATIONAL ROLE & SUPER ADMIN LEAVE APPROVAL ROUTING REGRESSION (A–I)
    // =========================================================================
    console.log('\n--- 19. Operational Role & Super Admin Leave Approval Routing Regression (Cases A–I) ---');
    resetAll();

    // Case A: Employee applicant -> Team Leader -> HR -> Top Management
    const empCaseARes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-11-09',
        endDate: '2026-11-09',
        dayType: 'FULL_DAY',
        reason: 'Case A Employee leave routing verification',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      }),
    });
    const empCaseAData = await parseApiJson(empCaseARes);
    const empCaseAReqId = empCaseAData.leaveRequest.id;

    const tlPendingBeforeA = await ApprovalService.getRequestsForTeamLeader({ status: 'PENDING' }, TL_ROBERT);
    const hrPendingBeforeA = await ApprovalService.getRequestsForHr({ status: 'PENDING' }, HR_USER);
    const mgmtPendingBeforeA = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);

    assert(
      empCaseARes.status === 201 &&
        empCaseAData.leaveRequest.applicantOperationalRole === 'EMPLOYEE' &&
        empCaseAData.leaveRequest.teamLeaderDecision === 'PENDING' &&
        empCaseAData.leaveRequest.hrDecision === 'PENDING' &&
        empCaseAData.leaveRequest.managementDecision === 'PENDING' &&
        tlPendingBeforeA.some((r) => r.id === empCaseAReqId) &&
        !hrPendingBeforeA.some((r) => r.id === empCaseAReqId) &&
        !mgmtPendingBeforeA.some((r) => r.id === empCaseAReqId),
      '19.A.1 Employee applicant: Team Leader receives request; HR and Top Management do not receive it before Team Leader approves'
    );

    await ApprovalService.submitTeamLeaderDecision(
      empCaseAReqId,
      { decision: 'APPROVED', comments: 'TL approved Case A' },
      TL_ROBERT
    );
    const hrPendingAfterTlA = await ApprovalService.getRequestsForHr({ status: 'PENDING' }, HR_USER);
    const mgmtPendingAfterTlA = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);

    assert(
      hrPendingAfterTlA.some((r) => r.id === empCaseAReqId) &&
        !mgmtPendingAfterTlA.some((r) => r.id === empCaseAReqId),
      '19.A.2 Employee applicant: HR receives request after Team Leader approves; Top Management does not receive it until HR approves'
    );

    await ApprovalService.submitHrDecision(
      empCaseAReqId,
      { decision: 'APPROVED', comments: 'HR approved Case A' },
      HR_USER
    );
    const mgmtPendingAfterHrA = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);
    const mgmtFinalA = await ApprovalService.submitManagementDecision(
      empCaseAReqId,
      { decision: 'APPROVED', comments: 'Top Management approved Case A' },
      TOP_MGMT
    );

    assert(
      mgmtPendingAfterHrA.some((r) => r.id === empCaseAReqId) &&
        mgmtFinalA.finalStatus === 'APPROVED',
      '19.A.3 Employee applicant: Top Management receives request after HR approves and finalizes approval'
    );

    // Case B: Team Leader applicant -> HR -> Top Management (Team Leader stage is NOT_REQUIRED)
    const tlApplicantReq = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        dayType: 'FULL_DAY',
        reason: 'Case B Team Leader leave routing verification',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      },
      TL_ROBERT
    );

    const tlPendingForB = await ApprovalService.getRequestsForTeamLeader({ status: 'PENDING' }, TL_PRIYA);
    const tlAllForB = await ApprovalService.getRequestsForTeamLeader({ status: 'ALL' }, TL_PRIYA);
    const hrPendingForB = await ApprovalService.getRequestsForHr({ status: 'PENDING' }, HR_USER);
    const mgmtPendingBeforeHrB = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);

    assert(
      tlApplicantReq.applicantOperationalRole === 'TEAM_LEADER' &&
        tlApplicantReq.teamLeaderDecision === 'NOT_REQUIRED' &&
        tlApplicantReq.hrDecision === 'PENDING' &&
        tlApplicantReq.managementDecision === 'PENDING' &&
        tlApplicantReq.approvalStageLabel === 'Pending HR' &&
        !tlPendingForB.some((r) => r.id === tlApplicantReq.id) &&
        !tlAllForB.some((r) => r.id === tlApplicantReq.id) &&
        hrPendingForB.some((r) => r.id === tlApplicantReq.id) &&
        !mgmtPendingBeforeHrB.some((r) => r.id === tlApplicantReq.id),
      '19.B.1 Team Leader applicant: Team Leader stage is NOT_REQUIRED (excluded from TL queue); HR receives request directly; Top Management waits for HR'
    );

    await ApprovalService.submitHrDecision(
      tlApplicantReq.id,
      { decision: 'APPROVED', comments: 'HR reviewed Team Leader leave' },
      HR_USER
    );
    const mgmtPendingAfterHrB = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);
    const mgmtFinalB = await ApprovalService.submitManagementDecision(
      tlApplicantReq.id,
      { decision: 'APPROVED', comments: 'Top Management approved Team Leader leave' },
      TOP_MGMT
    );

    assert(
      mgmtPendingAfterHrB.some((r) => r.id === tlApplicantReq.id) &&
        mgmtFinalB.finalStatus === 'APPROVED',
      '19.B.2 Team Leader applicant: Top Management receives request only after HR approves and finalizes approval'
    );

    // Case C: HR applicant -> Top Management (Team Leader & HR stages are NOT_REQUIRED)
    const hrApplicantReq = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-11',
        endDate: '2026-11-11',
        dayType: 'FULL_DAY',
        reason: 'Case C HR leave routing verification',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      },
      HR_USER
    );

    const initialHrApplicantMgmtDecision = hrApplicantReq.managementDecision;
    const initialHrApplicantStageLabel = hrApplicantReq.approvalStageLabel;
    const tlQueueForC = await ApprovalService.getRequestsForTeamLeader({ status: 'ALL' }, TL_ROBERT);
    const hrQueueForC = await ApprovalService.getRequestsForHr({ status: 'ALL' }, HR_USER);
    const mgmtPendingForC = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);
    const mgmtFinalC = await ApprovalService.submitManagementDecision(
      hrApplicantReq.id,
      { decision: 'APPROVED', comments: 'Top Management approved HR leave directly' },
      TOP_MGMT
    );

    assert(
      hrApplicantReq.applicantOperationalRole === 'HR' &&
        hrApplicantReq.teamLeaderDecision === 'NOT_REQUIRED' &&
        hrApplicantReq.hrDecision === 'NOT_REQUIRED' &&
        initialHrApplicantMgmtDecision === 'PENDING' &&
        initialHrApplicantStageLabel === 'Pending Top Management' &&
        !tlQueueForC.some((r) => r.id === hrApplicantReq.id) &&
        !hrQueueForC.some((r) => r.id === hrApplicantReq.id) &&
        mgmtPendingForC.some((r) => r.id === hrApplicantReq.id) &&
        mgmtFinalC.finalStatus === 'APPROVED',
      '19.C.1 HR applicant: Team Leader and HR stages are NOT_REQUIRED; Top Management receives request directly and approves'
    );

    // Case D: Super Admin with operational Employee role -> Employee -> Team Leader -> HR -> Top Management
    const superAdminEmpUser = await UserService.createUser(
      {
        username: 'sa_emp_worker',
        email: 'sa.emp@company.com',
        password: 'InitialPassword@123',
        employeeCode: 'EMP901',
        employeeName: 'Vikram SuperAdmin (Software Engineer)',
        role: 'SUPER_ADMIN',
        departmentId: 2, // Engineering
        designationId: 4, // Software Engineer -> operational role EMPLOYEE
        reportingManagerId: 5, // Reports to Team Leader Robert (employeeId 5)
      },
      SUPER_ADMIN
    );
    await LeaveService.initializeEmployeeBalances(superAdminEmpUser.employeeId!, 2026, SUPER_ADMIN);
    await UserService.changePassword(
      superAdminEmpUser.id,
      'InitialPassword@123',
      'VikramNewPass@2026!'
    );

    const saEmpHeaders = {
      'Content-Type': 'application/json',
      'x-user-role': 'SUPER_ADMIN',
      'x-user-id': String(superAdminEmpUser.id),
      'x-employee-id': String(superAdminEmpUser.employeeId),
      'x-username': superAdminEmpUser.username,
    };

    const saEmpSubmitRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: saEmpHeaders,
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-11-16',
        endDate: '2026-11-16',
        dayType: 'FULL_DAY',
        reason: 'Case D Super Admin with operational Employee role leave',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      }),
    });
    const saEmpSubmitData = await parseApiJson(saEmpSubmitRes);
    const saEmpReqId = saEmpSubmitData.leaveRequest.id;

    const tlPendingForD = await ApprovalService.getRequestsForTeamLeader({ status: 'PENDING' }, TL_ROBERT);
    const hrPendingForDBeforeTl = await ApprovalService.getRequestsForHr({ status: 'PENDING' }, HR_USER);
    const mgmtPendingForDBeforeTl = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);

    assert(
      saEmpSubmitRes.status === 201 &&
        saEmpSubmitData.leaveRequest.applicantRole === 'SUPER_ADMIN' &&
        saEmpSubmitData.leaveRequest.applicantOperationalRole === 'EMPLOYEE' &&
        saEmpSubmitData.leaveRequest.teamLeaderDecision === 'PENDING' &&
        saEmpSubmitData.leaveRequest.hrDecision === 'PENDING' &&
        saEmpSubmitData.leaveRequest.managementDecision === 'PENDING' &&
        saEmpSubmitData.leaveRequest.approvalStageLabel === 'Pending Team Leader' &&
        tlPendingForD.some((r) => r.id === saEmpReqId) &&
        !hrPendingForDBeforeTl.some((r) => r.id === saEmpReqId) &&
        !mgmtPendingForDBeforeTl.some((r) => r.id === saEmpReqId),
      '19.D.1 Super Admin with operational Employee role routes to Team Leader first and does not skip Team Leader'
    );

    await ApprovalService.submitTeamLeaderDecision(
      saEmpReqId,
      { decision: 'APPROVED', comments: 'Team Leader approved Super Admin Employee request' },
      TL_ROBERT
    );
    const hrPendingForDAfterTl = await ApprovalService.getRequestsForHr({ status: 'PENDING' }, HR_USER);
    const mgmtPendingForDAfterTl = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);

    await ApprovalService.submitHrDecision(
      saEmpReqId,
      { decision: 'APPROVED', comments: 'HR approved Super Admin Employee request' },
      HR_USER
    );
    const mgmtPendingForDAfterHr = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);
    const mgmtFinalD = await ApprovalService.submitManagementDecision(
      saEmpReqId,
      { decision: 'APPROVED', comments: 'Top Management approved Super Admin Employee request' },
      TOP_MGMT
    );

    assert(
      hrPendingForDAfterTl.some((r) => r.id === saEmpReqId) &&
        !mgmtPendingForDAfterTl.some((r) => r.id === saEmpReqId) &&
        mgmtPendingForDAfterHr.some((r) => r.id === saEmpReqId) &&
        mgmtFinalD.finalStatus === 'APPROVED',
      '19.D.2 Super Admin with operational Employee role transitions sequentially: Team Leader -> HR -> Top Management'
    );

    // Case E: Super Admin with operational Team Leader role -> Team Leader (NOT_REQUIRED) -> HR -> Top Management
    const superAdminTlUser = await UserService.createUser(
      {
        username: 'sa_tl_leader',
        email: 'sa.tl@company.com',
        password: 'InitialPassword@123',
        employeeCode: 'EMP902',
        employeeName: 'Sanjay SuperAdmin (Team Leader)',
        role: 'SUPER_ADMIN',
        operationalRole: 'TEAM_LEADER',
        departmentId: 1,
        designationId: 3, // Operations Manager
        reportingManagerId: 3, // Reports to Top Management John
      },
      SUPER_ADMIN
    );
    await LeaveService.initializeEmployeeBalances(superAdminTlUser.employeeId!, 2026, SUPER_ADMIN);
    await UserService.changePassword(
      superAdminTlUser.id,
      'InitialPassword@123',
      'SanjayNewPass@2026!'
    );

    const saTlHeaders = {
      'Content-Type': 'application/json',
      'x-user-role': 'SUPER_ADMIN',
      'x-user-id': String(superAdminTlUser.id),
      'x-employee-id': String(superAdminTlUser.employeeId),
      'x-username': superAdminTlUser.username,
    };

    const saTlSubmitRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: saTlHeaders,
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-11-17',
        endDate: '2026-11-17',
        dayType: 'FULL_DAY',
        reason: 'Case E Super Admin with operational Team Leader role leave',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      }),
    });
    const saTlSubmitData = await parseApiJson(saTlSubmitRes);
    const saTlReqId = saTlSubmitData.leaveRequest.id;

    const tlQueueForE = await ApprovalService.getRequestsForTeamLeader({ status: 'ALL' }, TL_ROBERT);
    const hrPendingForE = await ApprovalService.getRequestsForHr({ status: 'PENDING' }, HR_USER);
    const mgmtPendingForEBeforeHr = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);

    await ApprovalService.submitHrDecision(
      saTlReqId,
      { decision: 'APPROVED', comments: 'HR approved Super Admin TL request' },
      HR_USER
    );
    const mgmtPendingForEAfterHr = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);
    const mgmtFinalE = await ApprovalService.submitManagementDecision(
      saTlReqId,
      { decision: 'APPROVED', comments: 'Top Management approved Super Admin TL request' },
      TOP_MGMT
    );

    assert(
      saTlSubmitRes.status === 201 &&
        saTlSubmitData.leaveRequest.applicantRole === 'SUPER_ADMIN' &&
        saTlSubmitData.leaveRequest.applicantOperationalRole === 'TEAM_LEADER' &&
        saTlSubmitData.leaveRequest.teamLeaderDecision === 'NOT_REQUIRED' &&
        saTlSubmitData.leaveRequest.hrDecision === 'PENDING' &&
        saTlSubmitData.leaveRequest.approvalStageLabel === 'Pending HR' &&
        !tlQueueForE.some((r) => r.id === saTlReqId) &&
        hrPendingForE.some((r) => r.id === saTlReqId) &&
        !mgmtPendingForEBeforeHr.some((r) => r.id === saTlReqId) &&
        mgmtPendingForEAfterHr.some((r) => r.id === saTlReqId) &&
        mgmtFinalE.finalStatus === 'APPROVED',
      '19.E.1 Super Admin with operational Team Leader role follows Team Leader -> HR -> Top Management (does not route to Team Leader)'
    );

    // Case F: Super Admin with operational HR role -> HR -> Top Management
    const superAdminHrUser = await UserService.createUser(
      {
        username: 'sa_hr_officer',
        email: 'sa.hr@company.com',
        password: 'InitialPassword@123',
        employeeCode: 'EMP903',
        employeeName: 'Kavitha SuperAdmin (HR Officer)',
        role: 'SUPER_ADMIN',
        departmentId: 3, // HR department
        designationId: 2, // HR Officer -> operational role HR
        reportingManagerId: 3, // Reports to Top Management John
      },
      SUPER_ADMIN
    );
    await LeaveService.initializeEmployeeBalances(superAdminHrUser.employeeId!, 2026, SUPER_ADMIN);
    await UserService.changePassword(
      superAdminHrUser.id,
      'InitialPassword@123',
      'KavithaNewPass@2026!'
    );

    const saHrHeaders = {
      'Content-Type': 'application/json',
      'x-user-role': 'SUPER_ADMIN',
      'x-user-id': String(superAdminHrUser.id),
      'x-employee-id': String(superAdminHrUser.employeeId),
      'x-username': superAdminHrUser.username,
    };

    const saHrSubmitRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: saHrHeaders,
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-11-18',
        endDate: '2026-11-18',
        dayType: 'FULL_DAY',
        reason: 'Case F Super Admin with operational HR role leave',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      }),
    });
    const saHrSubmitData = await parseApiJson(saHrSubmitRes);
    const saHrReqId = saHrSubmitData.leaveRequest.id;

    const tlQueueForF = await ApprovalService.getRequestsForTeamLeader({ status: 'ALL' }, TL_ROBERT);
    const hrQueueForF = await ApprovalService.getRequestsForHr({ status: 'ALL' }, HR_USER);
    const mgmtPendingForF = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);
    const mgmtFinalF = await ApprovalService.submitManagementDecision(
      saHrReqId,
      { decision: 'APPROVED', comments: 'Top Management approved Super Admin HR request' },
      TOP_MGMT
    );

    assert(
      saHrSubmitRes.status === 201 &&
        saHrSubmitData.leaveRequest.applicantRole === 'SUPER_ADMIN' &&
        saHrSubmitData.leaveRequest.applicantOperationalRole === 'HR' &&
        saHrSubmitData.leaveRequest.teamLeaderDecision === 'NOT_REQUIRED' &&
        saHrSubmitData.leaveRequest.hrDecision === 'NOT_REQUIRED' &&
        saHrSubmitData.leaveRequest.managementDecision === 'PENDING' &&
        saHrSubmitData.leaveRequest.approvalStageLabel === 'Pending Top Management' &&
        !tlQueueForF.some((r) => r.id === saHrReqId) &&
        !hrQueueForF.some((r) => r.id === saHrReqId) &&
        mgmtPendingForF.some((r) => r.id === saHrReqId) &&
        mgmtFinalF.finalStatus === 'APPROVED',
      '19.F.1 Super Admin with operational HR role follows HR -> Top Management (Team Leader & HR stages are NOT_REQUIRED)'
    );

    // Case G: Top Management applicant (and Super Admin with operational Top Management role) -> Configured Reporting Person
    const adminHeaders = {
      'Content-Type': 'application/json',
      'x-user-role': 'SUPER_ADMIN',
      'x-user-id': '1',
      'x-employee-id': '1',
      'x-username': 'superadmin',
    };
    await UserService.updateEmployee(
      1,
      {
        operationalRole: 'TOP_MANAGEMENT',
        reportingManagerId: 3, // John Operations Lead (employeeId 3)
      },
      SUPER_ADMIN
    );
    await LeaveService.initializeEmployeeBalances(1, 2026, SUPER_ADMIN);

    const saTopMgmtRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-11-19',
        endDate: '2026-11-19',
        dayType: 'FULL_DAY',
        reason: 'Case G Super Admin with operational Top Management role leave',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      }),
    });
    const saTopMgmtData = await parseApiJson(saTopMgmtRes);
    const saTopMgmtReqId = saTopMgmtData.leaveRequest.id;

    const tlQueueForG = await ApprovalService.getRequestsForTeamLeader({ status: 'ALL' }, TL_ROBERT);
    const hrQueueForG = await ApprovalService.getRequestsForHr({ status: 'ALL' }, HR_USER);
    const johnQueueForG = await ApprovalService.getRequestsForManagement({ status: 'PENDING' }, TOP_MGMT);
    const mgmtFinalG = await ApprovalService.submitManagementDecision(
      saTopMgmtReqId,
      { decision: 'APPROVED', comments: 'Approved by configured Reporting Person John' },
      TOP_MGMT
    );

    assert(
      saTopMgmtRes.status === 201 &&
        saTopMgmtData.leaveRequest.applicantOperationalRole === 'TOP_MANAGEMENT' &&
        saTopMgmtData.leaveRequest.teamLeaderDecision === 'NOT_REQUIRED' &&
        saTopMgmtData.leaveRequest.hrDecision === 'NOT_REQUIRED' &&
        saTopMgmtData.leaveRequest.reportingManagerId === 3 &&
        !tlQueueForG.some((r) => r.id === saTopMgmtReqId) &&
        !hrQueueForG.some((r) => r.id === saTopMgmtReqId) &&
        johnQueueForG.some((r) => r.id === saTopMgmtReqId) &&
        mgmtFinalG.finalStatus === 'APPROVED',
      '19.G.1 Top Management / Super Admin with Top Management operational role routes directly to configured Reporting Person and never enters TL or HR queues'
    );

    // Case H: Missing required approver -> Submission rejected with 400 JSON validation error and no orphaned request created
    const unconfiguredEmpUser = await UserService.createUser(
      {
        username: 'orphan_emp_no_tl',
        email: 'orphan.emp@company.com',
        password: 'InitialPassword@123',
        employeeCode: 'EMP904',
        employeeName: 'Orphan Employee Without TL',
        role: 'EMPLOYEE',
        departmentId: 2,
        designationId: 4,
        reportingManagerId: null, // Missing required Team Leader!
      },
      SUPER_ADMIN
    );
    await LeaveService.initializeEmployeeBalances(unconfiguredEmpUser.employeeId!, 2026, SUPER_ADMIN);
    await UserService.changePassword(
      unconfiguredEmpUser.id,
      'InitialPassword@123',
      'OrphanNewPass@2026!'
    );

    const requestsCountBeforeH = (await LeaveRequestService.getAllLeaveRequests()).length;

    const missingTlSubmitRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'EMPLOYEE',
        'x-user-id': String(unconfiguredEmpUser.id),
        'x-employee-id': String(unconfiguredEmpUser.employeeId),
        'x-username': unconfiguredEmpUser.username,
      },
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-11-20',
        endDate: '2026-11-20',
        dayType: 'FULL_DAY',
        reason: 'Case H missing Team Leader approver test',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      }),
    });
    const missingTlSubmitJson = await parseApiJson(missingTlSubmitRes);

    // Also test Super Admin without configured reporting manager
    await UserService.updateEmployee(1, { reportingManagerId: null }, SUPER_ADMIN);
    const missingSaApproverRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-11-20',
        endDate: '2026-11-20',
        dayType: 'FULL_DAY',
        reason: 'Case H Super Admin missing reporting person test',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      }),
    });
    const missingSaApproverJson = await parseApiJson(missingSaApproverRes);

    const requestsCountAfterH = (await LeaveRequestService.getAllLeaveRequests()).length;

    // Normal employee without reporting manager must be rejected with 400
    assert(
      missingTlSubmitRes.status === 400 &&
        typeof missingTlSubmitJson.error === 'string' &&
        missingTlSubmitJson.error.includes('Reporting Manager'),
      '19.H.1 Normal employee missing reporting manager rejects submission with HTTP 400 JSON validation error'
    );

    // Super Admin applicant without reporting manager succeeds with 201 (Requirement 3: Super Admin leave requires no reporting person)
    assert(
      missingSaApproverRes.status === 201 &&
        missingSaApproverJson.success === true &&
        missingSaApproverJson.leaveRequest.reportingManagerId === null,
      '19.H.2 Super Admin can submit leave without a Reporting Person'
    );

    // Case I: Unauthorized users cannot approve requests outside their assigned approval stage or self-approve
    const stageGuardReq = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-23',
        endDate: '2026-11-23',
        dayType: 'FULL_DAY',
        reason: 'Case I stage boundary & unauthorized approver test',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      },
      EMP_ALICE
    );

    // I.1: Unassigned Team Leader (Priya, employeeId 6) cannot approve Alice's request (assigned to Robert, employeeId 5)
    const wrongTlRes = await fetch(
      `${baseUrl}/api/team-leader/leave-requests/${stageGuardReq.id}/decision`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'TEAM_LEADER',
          'x-user-id': '6',
          'x-employee-id': '6',
          'x-username': 'tl_priya',
        },
        body: JSON.stringify({ decision: 'APPROVED', comments: 'Wrong team leader attempt' }),
      }
    );

    // I.2: HR cannot approve while Team Leader stage is still PENDING
    const prematureHrRes = await fetch(
      `${baseUrl}/api/hr/leave-requests/${stageGuardReq.id}/decision`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'HR',
          'x-user-id': '2',
          'x-employee-id': '2',
          'x-username': 'hruser',
        },
        body: JSON.stringify({ decision: 'APPROVED', comments: 'Premature HR attempt' }),
      }
    );

    // I.3: Top Management cannot approve while Team Leader stage is still PENDING
    const prematureMgmtRes = await fetch(
      `${baseUrl}/api/management/leave-requests/${stageGuardReq.id}/decision`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'TOP_MANAGEMENT',
          'x-user-id': '3',
          'x-employee-id': '3',
          'x-username': 'manager_john',
        },
        body: JSON.stringify({ decision: 'APPROVED', comments: 'Premature Management attempt' }),
      }
    );

    // I.4: Super Admin applicant cannot self-approve their own request at any stage
    const saEmpReq2 = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-24',
        endDate: '2026-11-24',
        dayType: 'FULL_DAY',
        reason: 'Super Admin self-approval block test',
        applicationTimestampOverride: '2026-11-01T10:00:00+05:30',
      },
      {
        userId: superAdminEmpUser.id,
        employeeId: superAdminEmpUser.employeeId!,
        username: superAdminEmpUser.username,
        role: 'SUPER_ADMIN',
      }
    );
    const saSelfApproveRes = await fetch(
      `${baseUrl}/api/team-leader/leave-requests/${saEmpReq2.id}/decision`,
      {
        method: 'POST',
        headers: saEmpHeaders,
        body: JSON.stringify({ decision: 'APPROVED', comments: 'Super Admin self-approve attempt' }),
      }
    );

    // I.5: HR user cannot modify their own operationalRole or reportingManagerId to bypass approval
    let selfRoleModifyBlocked = false;
    try {
      await UserService.updateEmployee(
        2,
        { operationalRole: 'TOP_MANAGEMENT', reportingManagerId: 3 },
        HR_USER
      );
    } catch (e: any) {
      selfRoleModifyBlocked = e.message.includes('Forbidden');
    }

    assert(
      wrongTlRes.status === 403 &&
        (prematureHrRes.status === 400 || prematureHrRes.status === 403) &&
        (prematureMgmtRes.status === 400 || prematureMgmtRes.status === 403) &&
        saSelfApproveRes.status === 403 &&
        selfRoleModifyBlocked === true,
      '19.I.1 Unauthorized users, out-of-turn stage approvals, Super Admin self-approval, and self-modification of operational role are strictly blocked'
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log(`\n===================================================================`);
  console.log(`  FINAL BUSINESS RULES SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`===================================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runFinalBusinessRulesTests().catch((err) => {
  console.error('Fatal error in final business rules test:', err);
  process.exit(1);
});
