import { AuthContext } from '../types/leave.ts';
import { TeamLeaderRotationService } from '../services/teamLeaderRotationService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { ApprovalService } from '../services/approvalService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { UserService } from '../services/userService.ts';
import { ShiftService } from '../services/shiftService.ts';
import { HolidayService } from '../services/holidayService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { NotificationService } from '../services/notificationService.ts';
import { AuditService } from '../services/auditService.ts';

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

const TL_ANIL: AuthContext = {
  userId: 8,
  username: 'anil',
  role: 'TEAM_LEADER',
  operationalRole: 'TEAM_LEADER',
  employeeId: 8,
};

const TL_AKASH: AuthContext = {
  userId: 9,
  username: 'akash',
  role: 'TEAM_LEADER',
  operationalRole: 'TEAM_LEADER',
  employeeId: 9,
};

const TL_ROBERT: AuthContext = {
  userId: 5,
  username: 'tl_robert',
  role: 'TEAM_LEADER',
  employeeId: 5,
};

const EMP_KIRAN: AuthContext = {
  userId: 10,
  username: 'kiran_imp',
  role: 'EMPLOYEE',
  operationalRole: 'EMPLOYEE',
  employeeId: 10,
};

const EMP_ALICE: AuthContext = {
  userId: 4,
  username: 'alice_emp',
  role: 'EMPLOYEE',
  employeeId: 4,
};

async function runTeamLeaderRotationTests() {
  console.log('===================================================================');
  console.log('  MAESTRO LEAVE MANAGEMENT — 15-DAY TEAM LEADER ROTATION TESTS');
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
    NotificationService.resetMemoryNotifications();
    AuditService.resetMemoryStores();
    TeamLeaderRotationService.resetMemoryStores();
  }

  resetAll();

  const AR_TEAM_ID = UserService.resolveDepartmentRecordSync('AR_TRANS')?.id ?? 6;
  const IMPORT_TEAM_ID = 8; // Test-only team; rotation is configured explicitly below.

  assert(
    TeamLeaderRotationService.hasTeamDateEffectiveConfig(AR_TEAM_ID),
    'TEST 0A: Default 15-day rotation is assigned to AR Transport'
  );
  assert(
    !TeamLeaderRotationService.hasTeamDateEffectiveConfig(IMPORT_TEAM_ID),
    'TEST 0B: Import Team does not receive the AR-only default rotation'
  );

  const defaultArFirstHalf = await TeamLeaderRotationService.resolveTeamLeader(
    AR_TEAM_ID,
    '2026-10-15'
  );
  const defaultArSecondHalf = await TeamLeaderRotationService.resolveTeamLeader(
    AR_TEAM_ID,
    '2026-10-16'
  );
  assert(
    defaultArFirstHalf?.teamLeaderName?.toUpperCase().includes('ANIL') &&
      defaultArSecondHalf?.teamLeaderName?.toUpperCase().includes('AKASH'),
    'TEST 0C: AR rotation resolves Anil on days 1–15 and Akash on days 16–month end'
  );

  // Existing date-boundary and approval tests use an explicit test-only Import Team rule.
  await TeamLeaderRotationService.configureRotationRule(
    {
      teamId: IMPORT_TEAM_ID,
      rotationType: 'FIRST_HALF_SECOND_HALF',
      firstHalfLeaderEmployeeId: TL_ANIL.employeeId!,
      secondHalfLeaderEmployeeId: TL_AKASH.employeeId!,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      remarks: 'Test-only rotation fixture; not a production default',
      replaceExistingActive: true,
    },
    SUPER_ADMIN
  );

  // ------------------------------------------------------------------
  // TEST 1: Basic 15-Day Rotation Rule (01–15 → ANIL, 16–30 → AKASH)
  // ------------------------------------------------------------------
  const sep01 = await TeamLeaderRotationService.resolveTeamLeader(IMPORT_TEAM_ID, '2026-09-01');
  const sep15 = await TeamLeaderRotationService.resolveTeamLeader(IMPORT_TEAM_ID, '2026-09-15');
  const sep16 = await TeamLeaderRotationService.resolveTeamLeader(IMPORT_TEAM_ID, '2026-09-16');
  const sep30 = await TeamLeaderRotationService.resolveTeamLeader(IMPORT_TEAM_ID, '2026-09-30');

  assert(
    sep01?.teamLeaderName === 'ANIL' && sep15?.teamLeaderName === 'ANIL',
    'TEST 1A: Days 01–15 resolve to ANIL',
    `Got ${sep01?.teamLeaderName} on Sep 01 and ${sep15?.teamLeaderName} on Sep 15`
  );
  assert(
    sep16?.teamLeaderName === 'AKASH' && sep30?.teamLeaderName === 'AKASH',
    'TEST 1B: Days 16–30 resolve to AKASH',
    `Got ${sep16?.teamLeaderName} on Sep 16 and ${sep30?.teamLeaderName} on Sep 30`
  );

  // ------------------------------------------------------------------
  // TEST 2: 31-day month (October: 01–15 → ANIL, 16–31 → AKASH)
  // ------------------------------------------------------------------
  const oct10 = await TeamLeaderRotationService.resolveTeamLeader(IMPORT_TEAM_ID, '2026-10-10');
  const oct16 = await TeamLeaderRotationService.resolveTeamLeader(IMPORT_TEAM_ID, '2026-10-16');
  const oct31 = await TeamLeaderRotationService.resolveTeamLeader(IMPORT_TEAM_ID, '2026-10-31');

  assert(
    oct10?.teamLeaderName === 'ANIL' &&
      oct10?.effectiveFrom === '2026-10-01' &&
      oct10?.effectiveTo === '2026-10-15',
    'TEST 2A: 31-day month (October) 01–15 resolves to ANIL (2026-10-01 to 2026-10-15)',
    `Got ${JSON.stringify(oct10)}`
  );
  assert(
    oct16?.teamLeaderName === 'AKASH' &&
      oct31?.teamLeaderName === 'AKASH' &&
      oct31?.effectiveFrom === '2026-10-16' &&
      oct31?.effectiveTo === '2026-10-31',
    'TEST 2B: 31-day month (October) 16–31 resolves to AKASH through day 31',
    `Got ${JSON.stringify(oct31)}`
  );

  // ------------------------------------------------------------------
  // TEST 3: 30-day month (September: 01–15 → ANIL, 16–30 → AKASH)
  // ------------------------------------------------------------------
  assert(
    sep30?.teamLeaderName === 'AKASH' &&
      sep30?.effectiveFrom === '2026-09-16' &&
      sep30?.effectiveTo === '2026-09-30' &&
      sep30?.periodLabel === '16–30 Sep',
    'TEST 3: 30-day month (September) 16–30 resolves to AKASH with exact 30th month-end',
    `Got ${JSON.stringify(sep30)}`
  );

  // ------------------------------------------------------------------
  // TEST 4: Non-leap February 28 (2026: 01–15 → ANIL, 16–28 → AKASH)
  // ------------------------------------------------------------------
  const feb14 = await TeamLeaderRotationService.resolveTeamLeader(IMPORT_TEAM_ID, '2026-02-14');
  const feb28 = await TeamLeaderRotationService.resolveTeamLeader(IMPORT_TEAM_ID, '2026-02-28');

  assert(
    feb14?.teamLeaderName === 'ANIL' &&
      feb14?.effectiveFrom === '2026-02-01' &&
      feb14?.effectiveTo === '2026-02-15',
    'TEST 4A: Non-leap February 2026 (01–15) resolves to ANIL',
    `Got ${JSON.stringify(feb14)}`
  );
  assert(
    feb28?.teamLeaderName === 'AKASH' &&
      feb28?.effectiveFrom === '2026-02-16' &&
      feb28?.effectiveTo === '2026-02-28' &&
      feb28?.periodLabel === '16–28 Feb',
    'TEST 4B: Non-leap February 2026 (16–28) resolves to AKASH with 28th month-end',
    `Got ${JSON.stringify(feb28)}`
  );

  // ------------------------------------------------------------------
  // TEST 5: Leap-year February 29 (2028: 01–15 → ANIL, 16–29 → AKASH)
  // ------------------------------------------------------------------
  const leapFeb15 = await TeamLeaderRotationService.resolveTeamLeader(IMPORT_TEAM_ID, '2028-02-15');
  const leapFeb29 = await TeamLeaderRotationService.resolveTeamLeader(IMPORT_TEAM_ID, '2028-02-29');

  assert(
    leapFeb15?.teamLeaderName === 'ANIL' &&
      leapFeb29?.teamLeaderName === 'AKASH' &&
      leapFeb29?.effectiveFrom === '2028-02-16' &&
      leapFeb29?.effectiveTo === '2028-02-29' &&
      leapFeb29?.periodLabel === '16–29 Feb',
    'TEST 5: Leap-year February 2028 (16–29) resolves to AKASH with 29th month-end',
    `Got ${JSON.stringify(leapFeb29)}`
  );

  // ------------------------------------------------------------------
  // TEST 6: Leave on 10th September → Routed to ANIL
  // ------------------------------------------------------------------
  const leaveSep10 = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1, // Casual Leave
      startDate: '2026-09-10',
      endDate: '2026-09-10',
      dayType: 'FULL_DAY',
      reasonCategory: 'OTHER',
      reason: 'Personal work on 10th September',
      applicationTimestampOverride: '2026-09-05T10:00:00.000Z',
    },
    EMP_KIRAN
  );

  assert(
    leaveSep10.assignedTeamLeaderId === TL_ANIL.employeeId &&
      leaveSep10.assignedTeamLeaderName === 'ANIL' &&
      leaveSep10.reportingManagerId === TL_ANIL.employeeId,
    'TEST 6: Leave on 10th September resolves and routes to ANIL',
    `Got assignedTeamLeaderName=${leaveSep10.assignedTeamLeaderName}, id=${leaveSep10.assignedTeamLeaderId}`
  );

  // Verify notification went to ANIL (userId=8) and NOT AKASH (userId=9)
  const allMemNotifs10 = NotificationService.getMemoryNotifications();
  const anilNotifs10 = allMemNotifs10.filter((n) => n.recipientUserId === TL_ANIL.userId);
  const akashNotifs10 = allMemNotifs10.filter((n) => n.recipientUserId === TL_AKASH.userId);
  assert(
    anilNotifs10.some((n) => n.relatedLeaveRequestId === leaveSep10.id) &&
      !akashNotifs10.some((n) => n.relatedLeaveRequestId === leaveSep10.id),
    'TEST 6B: Leave on 10th September notifies ANIL (and does not notify AKASH)',
    `Anil notifs: ${anilNotifs10.length}, Akash notifs: ${akashNotifs10.length}`
  );

  // ------------------------------------------------------------------
  // TEST 7: Leave on 20th September → Routed to AKASH
  // ------------------------------------------------------------------
  const leaveSep20 = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-09-21',
      endDate: '2026-09-21',
      dayType: 'FULL_DAY',
      reasonCategory: 'OTHER',
      reason: 'Personal trip in second half of September',
      applicationTimestampOverride: '2026-09-12T10:00:00.000Z',
    },
    EMP_KIRAN
  );

  const resolvedDirectSep20 = await TeamLeaderRotationService.resolveTeamLeaderForEmployee(
    EMP_KIRAN.employeeId!,
    '2026-09-20'
  );

  assert(
    resolvedDirectSep20?.teamLeaderName === 'AKASH' &&
      leaveSep20.assignedTeamLeaderId === TL_AKASH.employeeId &&
      leaveSep20.assignedTeamLeaderName === 'AKASH' &&
      leaveSep20.reportingManagerId === TL_AKASH.employeeId,
    'TEST 7: Leave in second half of September (20th/21st) resolves and routes to AKASH',
    `Got assignedTeamLeaderName=${leaveSep20.assignedTeamLeaderName}, id=${leaveSep20.assignedTeamLeaderId}`
  );

  const akashNotifs20 = NotificationService.getMemoryNotifications().filter(
    (n) => n.recipientUserId === TL_AKASH.userId
  );
  assert(
    akashNotifs20.some((n) => n.relatedLeaveRequestId === leaveSep20.id),
    'TEST 7B: Second-half September leave notifies AKASH',
    `Akash notifs count=${akashNotifs20.length}`
  );

  // ------------------------------------------------------------------
  // TEST 8: Multi-Day Leave Spanning Two Rotation Periods (14th–17th Sep → ANIL)
  // ------------------------------------------------------------------
  const leaveSep14To17 = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 3, // Earned Leave (supports up to 14 consecutive days)
      startDate: '2026-09-14',
      endDate: '2026-09-17',
      dayType: 'FULL_DAY',
      reasonCategory: 'OTHER',
      reason: 'Multi-day family event spanning 14th to 17th September',
      applicationTimestampOverride: '2026-09-01T10:00:00.000Z',
    },
    EMP_KIRAN
  );

  assert(
    leaveSep14To17.assignedTeamLeaderId === TL_ANIL.employeeId &&
      leaveSep14To17.assignedTeamLeaderName === 'ANIL' &&
      leaveSep14To17.teamLeaderDecision === 'PENDING',
    'TEST 8: Multi-day leave 14th–17th September resolves to ANIL based on start date (14th) as a single workflow',
    `Got assignedTeamLeaderName=${leaveSep14To17.assignedTeamLeaderName}`
  );

  // Verify AKASH cannot approve the 14th–17th leave request (belongs to ANIL)
  let akashBlockedOnAnilReq = false;
  try {
    await ApprovalService.submitTeamLeaderDecision(
      leaveSep14To17.id,
      { decision: 'APPROVED', remarks: 'Trying to approve Anil request' },
      TL_AKASH
    );
  } catch (err: any) {
    akashBlockedOnAnilReq = err.message.includes('Forbidden');
  }
  assert(
    akashBlockedOnAnilReq,
    'TEST 8B: AKASH is blocked from approving leave starting 14th Sep (assigned to ANIL)'
  );

  // ------------------------------------------------------------------
  // TEST 9: Historical Approval Integrity & HR Rejection + TOP_MANAGEMENT Override
  // ------------------------------------------------------------------
  await TeamLeaderRotationService.configureRotationRule(
    {
      teamId: IMPORT_TEAM_ID,
      firstHalfLeaderEmployeeId: TL_AKASH.employeeId,
      secondHalfLeaderEmployeeId: TL_ANIL.employeeId,
      effectiveFrom: '2026-11-01',
      remarks: 'Future November swap',
    },
    SUPER_ADMIN
  );

  const fetchedSep14Req = await LeaveRequestService.getLeaveRequestById(
    leaveSep14To17.id,
    TL_ANIL
  );
  assert(
    fetchedSep14Req?.request.assignedTeamLeaderId === TL_ANIL.employeeId &&
      fetchedSep14Req?.request.assignedTeamLeaderName === 'ANIL',
    'TEST 9A: Historical approval integrity preserved — existing leave retains ANIL after rotation update'
  );

  // ANIL approves Stage 1
  const afterTlApprove = await ApprovalService.submitTeamLeaderDecision(
    leaveSep14To17.id,
    { decision: 'APPROVED', remarks: 'Approved by Anil for 14-17 Sep' },
    TL_ANIL
  );
  assert(
    afterTlApprove.teamLeaderDecision === 'APPROVED' && afterTlApprove.finalStatus === 'PENDING',
    'TEST 9B: ANIL (resolved Team Leader) approves Stage 1 -> moves to HR Pending'
  );

  // HR rejects Stage 2, then TOP_MANAGEMENT approves Stage 3 -> Final status MUST be APPROVED
  const afterHrReject = await ApprovalService.submitHrDecision(
    leaveSep14To17.id,
    { decision: 'REJECTED', remarks: 'HR recommends rejection due to peak import week' },
    HR_USER
  );
  assert(
    afterHrReject.hrDecision === 'REJECTED' && afterHrReject.finalStatus === 'PENDING',
    'TEST 9C: HR rejection keeps finalStatus PENDING for Top Management final decision'
  );

  const afterMgmtApprove = await ApprovalService.submitManagementDecision(
    leaveSep14To17.id,
    { decision: 'APPROVED', remarks: 'Top Management overrides HR rejection and approves' },
    TOP_MGMT
  );
  assert(
    afterMgmtApprove.managementDecision === 'APPROVED' &&
      afterMgmtApprove.finalStatus === 'APPROVED',
    'TEST 9D: TOP_MANAGEMENT remains final authority (HR rejects + TOP_MANAGEMENT approves => APPROVED)'
  );

  // ------------------------------------------------------------------
  // TEST 10: Exception / Temporary Replacement Override & Validation
  // ------------------------------------------------------------------
  const tempOverride = await TeamLeaderRotationService.createAssignment(
    {
      teamId: IMPORT_TEAM_ID,
      teamLeaderEmployeeId: TL_ROBERT.employeeId!,
      effectiveFrom: '2026-09-05',
      effectiveTo: '2026-09-07',
      assignmentType: 'TEMPORARY_REPLACEMENT',
      reason: 'Temporary replacement while ANIL is on personal leave',
    },
    SUPER_ADMIN
  );

  const resolvedSep06 = await TeamLeaderRotationService.resolveTeamLeader(
    IMPORT_TEAM_ID,
    '2026-09-06'
  );
  const resolvedSep08 = await TeamLeaderRotationService.resolveTeamLeader(
    IMPORT_TEAM_ID,
    '2026-09-08'
  );

  assert(
    resolvedSep06?.teamLeaderEmployeeId === TL_ROBERT.employeeId &&
      resolvedSep06?.source === 'OVERRIDE_ASSIGNMENT',
    'TEST 10A: Temporary replacement override resolves to Robert on 2026-09-06',
    `Got ${JSON.stringify(resolvedSep06)}`
  );
  assert(
    resolvedSep08?.teamLeaderName === 'ANIL' && resolvedSep08?.source === 'ROTATION_RULE',
    'TEST 10B: After temporary override ends (2026-09-08), resolution automatically returns to ANIL'
  );

  // Validation: overlapping active override on same team & date must be rejected
  let overlapRejected = false;
  try {
    await TeamLeaderRotationService.createAssignment(
      {
        teamId: IMPORT_TEAM_ID,
        teamLeaderEmployeeId: TL_AKASH.employeeId!,
        effectiveFrom: '2026-09-06',
        effectiveTo: '2026-09-08',
        assignmentType: 'OVERRIDE',
      },
      SUPER_ADMIN
    );
  } catch (err: any) {
    overlapRejected = err.message.includes('Overlapping');
  }
  assert(
    overlapRejected,
    'TEST 10C: Overlapping active override assignment on the same team is rejected'
  );

  // Validation: non-TEAM_LEADER employee (e.g., Alice) cannot be assigned as Team Leader
  let unauthorizedLeaderRejected = false;
  try {
    await TeamLeaderRotationService.createAssignment(
      {
        teamId: IMPORT_TEAM_ID,
        teamLeaderEmployeeId: EMP_ALICE.employeeId!,
        effectiveFrom: '2026-12-01',
        effectiveTo: '2026-12-15',
        assignmentType: 'STANDARD',
      },
      SUPER_ADMIN
    );
  } catch (err: any) {
    unauthorizedLeaderRejected = err.message.includes('not authorized for the TEAM_LEADER role');
  }
  assert(
    unauthorizedLeaderRejected,
    'TEST 10D: Employee without TEAM_LEADER role cannot be assigned as Team Leader'
  );

  // Validation: EMPLOYEE and TEAM_LEADER cannot create/modify Team Leader assignments
  let empForbidden = false;
  let tlForbidden = false;
  try {
    await TeamLeaderRotationService.createAssignment(
      {
        teamId: IMPORT_TEAM_ID,
        teamLeaderEmployeeId: TL_ANIL.employeeId!,
        effectiveFrom: '2026-12-01',
        effectiveTo: '2026-12-15',
      },
      EMP_KIRAN
    );
  } catch (err: any) {
    empForbidden = err.message.includes('Forbidden');
  }
  try {
    await TeamLeaderRotationService.createAssignment(
      {
        teamId: IMPORT_TEAM_ID,
        teamLeaderEmployeeId: TL_ANIL.employeeId!,
        effectiveFrom: '2026-12-01',
        effectiveTo: '2026-12-15',
      },
      TL_ANIL
    );
  } catch (err: any) {
    tlForbidden = err.message.includes('Forbidden');
  }
  assert(
    empForbidden && tlForbidden,
    'TEST 10E: EMPLOYEE and TEAM_LEADER are forbidden from modifying Team Leader assignments'
  );

  // Deactivating override preserves historical assignment record and logs audit event
  await TeamLeaderRotationService.deactivateAssignment(
    tempOverride.id,
    'Override completed',
    SUPER_ADMIN
  );
  const allTeamAssignments = await TeamLeaderRotationService.getAssignments({
    teamId: IMPORT_TEAM_ID,
  });
  assert(
    allTeamAssignments.some((a) => a.id === tempOverride.id && a.status === 'INACTIVE'),
    'TEST 10F: Deactivated assignment is preserved in history with INACTIVE status'
  );

  const auditLogs = await AuditService.getLogs({
    targetEntity: 'team_leader_assignments',
  });
  assert(
    auditLogs.length >= 2,
    'TEST 10G: Administrative audit log records Team Leader assignment creations and deactivations'
  );

  // ------------------------------------------------------------------
  // TEST 11: Shift & Holiday Independence from Team Leader Rotation
  // ------------------------------------------------------------------
  const scheduleFirstHalf = await ShiftService.resolveEmployeeSchedule(
    EMP_KIRAN.employeeId!,
    '2026-09-10'
  );
  const scheduleSecondHalf = await ShiftService.resolveEmployeeSchedule(
    EMP_KIRAN.employeeId!,
    '2026-09-21'
  );
  assert(
    scheduleFirstHalf.shiftId === scheduleSecondHalf.shiftId &&
      scheduleFirstHalf.totalScheduledHours === scheduleSecondHalf.totalScheduledHours,
    'TEST 11: Employee shift and working hours remain unchanged when Team Leader rotates from ANIL to AKASH'
  );

  // Reset back to clean default state after test suite finishes
  resetAll();

  console.log('===================================================================');
  console.log(`  15-DAY TEAM LEADER ROTATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('===================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTeamLeaderRotationTests().catch((err) => {
  console.error('Fatal error in team-leader-rotation.test.ts:', err);
  process.exit(1);
});
