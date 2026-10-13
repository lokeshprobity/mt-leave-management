import assert from 'node:assert';
import { UserService } from '../services/userService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { ApprovalService } from '../services/approvalService.ts';
import { ValidationError } from '../services/validation.ts';

async function runEmergencyLeaveSubmissionSuite() {
  console.log('\n============================================================');
  console.log('--- TEST SUITE: EMERGENCY LEAVE SUBMISSION & WAIVER LOGIC ---');
  console.log('============================================================\n');

  // Reset memory stores to pristine baseline
  UserService.resetMemoryStores({ preservePersistedMedia: false });
  LeaveRequestService.resetMemoryStores();
  LeaveService.resetMemoryStores();

  const superAdmin = {
    userId: 1,
    username: 'superadmin',
    role: 'SUPER_ADMIN' as const,
    operationalRole: 'TOP_MANAGEMENT' as const,
  };

  const teamLeader = {
    userId: 5,
    username: 'tl_robert',
    role: 'TEAM_LEADER' as const,
    operationalRole: 'TEAM_LEADER' as const,
    employeeId: 5,
  };

  const empAlice = {
    userId: 4,
    username: 'alice_emp',
    role: 'EMPLOYEE' as const,
    operationalRole: 'EMPLOYEE' as const,
    employeeId: 4,
  };

  // Configure Alice (emp 4) in non-rotating Dept 2 reporting to Robert Chen (5)
  await UserService.updateEmployee(4, { departmentId: 2, reportingManagerId: 5 }, superAdmin);

  // Retrieve leave types and policies
  const leaveTypes = await LeaveService.getLeaveTypes();
  const elType = leaveTypes.find((lt) => lt.code === 'EL' || lt.name.toLowerCase().includes('emergency'));
  const clType = leaveTypes.find((lt) => lt.code === 'CL' || lt.name.toLowerCase().includes('casual'));
  assert.ok(elType, 'Emergency Leave type (EL) must exist in system');
  assert.ok(clType, 'Casual Leave type (CL) must exist in system');

  // Ensure Alice has 0 balance for Emergency Leave
  const balances = await LeaveService.getLeaveBalances({ employeeId: 4, year: 2026 }, empAlice);
  const elBalance = balances.find((b) => b.leaveTypeId === elType.id);
  assert.ok(elBalance, 'Emergency Leave balance row must exist');

  // Set Alice's Emergency Leave allocated to 0 and used to 0, available = 0
  if (elBalance) {
    elBalance.allocated = 0;
    elBalance.openingBalance = 0;
    elBalance.carryForward = 0;
    elBalance.adjustments = 0;
    elBalance.used = 0;
    elBalance.pending = 0;
    elBalance.available = 0;
  }

  const refreshedBalances = await LeaveService.getLeaveBalances({ employeeId: 4, year: 2026 }, empAlice);
  const refreshedEl = refreshedBalances.find((b) => b.leaveTypeId === elType.id);
  assert.strictEqual(Number(refreshedEl?.available), 0, 'Alice Emergency Leave balance must be 0 for test');
  console.log('Baseline established: Employee 4 Emergency Leave available balance = 0.');

  // -------------------------------------------------------------------------
  // TEST 1: Zero Balance Emergency Leave WITHOUT waiver checkbox -> MUST FAIL
  // -------------------------------------------------------------------------
  console.log('\n1. Emergency Leave with 0 balance WITHOUT waiver checkbox...');
  let failedWithoutWaiver = false;
  let withoutWaiverError = '';
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: elType.id,
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        dayType: 'FULL_DAY',
        reason: 'Unforeseen urgent domestic matter',
        emergencyException: false,
      },
      empAlice
    );
  } catch (err: any) {
    failedWithoutWaiver = true;
    withoutWaiverError = err.message;
  }
  assert.strictEqual(failedWithoutWaiver, true, 'Submission must be blocked when waiver is not checked and balance is 0');
  assert.ok(
    withoutWaiverError.includes('Insufficient') && withoutWaiverError.includes('balance'),
    `Error message must indicate insufficient balance: ${withoutWaiverError}`
  );
  console.log('   [PASS] Zero balance without waiver checkbox is properly rejected.');

  // -------------------------------------------------------------------------
  // TEST 2: Zero Balance Emergency Leave WITH waiver checkbox -> MUST SUCCEED
  // -------------------------------------------------------------------------
  console.log('\n2. Emergency Leave with 0 balance WITH waiver checkbox...');
  const reqWithWaiver = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: elType.id,
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      dayType: 'FULL_DAY',
      reason: 'Urgent medical emergency requiring immediate travel',
      emergencyException: true,
    },
    empAlice
  );

  assert.ok(reqWithWaiver, 'Request must be successfully created');
  assert.strictEqual(reqWithWaiver.finalStatus, 'PENDING', 'Request status must be PENDING for approval workflow');
  assert.strictEqual(reqWithWaiver.teamLeaderDecision, 'PENDING', 'Team Leader stage must be PENDING');
  assert.strictEqual(reqWithWaiver.balancePosted, false, 'Balance must NOT be deducted at submission time');
  console.log('   [PASS] Emergency Leave submitted with waiver; routed to approval workflow.');

  // Verify balance was NOT negatively altered at submission
  const postSubmitBalances = await LeaveService.getLeaveBalances({ employeeId: 4, year: 2026 }, empAlice);
  const postEl = postSubmitBalances.find((b) => b.leaveTypeId === elType.id);
  assert.strictEqual(Number(postEl?.available), 0, 'Available balance must remain 0 at submission');
  assert.strictEqual(Number(postEl?.used), 0, 'Used balance must remain 0 at submission (no premature deduction)');
  console.log('   [PASS] No premature deduction or negative balance created at submission.');

  // -------------------------------------------------------------------------
  // TEST 3: Zero Balance Emergency HALF-DAY with waiver checkbox -> MUST SUCCEED
  // -------------------------------------------------------------------------
  console.log('\n3. Emergency Half-Day with 0 balance WITH waiver checkbox...');
  const halfDayReq = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: elType.id,
      startDate: '2026-11-12',
      endDate: '2026-11-12',
      dayType: 'HALF_DAY',
      halfDayPeriod: 'FIRST_HALF',
      reason: 'Sudden family health emergency first half',
      emergencyException: true,
    },
    empAlice
  );
  assert.ok(halfDayReq, 'Emergency Half-Day request with waiver must succeed');
  assert.strictEqual(halfDayReq.totalDays, '0.50', 'Half day must calculate 0.50 total days');
  assert.strictEqual(halfDayReq.finalStatus, 'PENDING', 'Half day request must be PENDING');
  console.log('   [PASS] Emergency Half-Day with 0 balance and waiver allowed.');

  // -------------------------------------------------------------------------
  // TEST 4: Same-Day Submission After Shift Start
  // -------------------------------------------------------------------------
  console.log('\n4. Same-day Emergency Leave submitted after shift start...');
  // Same-day: startDate = 2026-11-16. Application timestamp = 2026-11-16 10:30 (shift start is 08:30)
  const sameDayDate = '2026-11-16';
  const postShiftTimestamp = '2026-11-16T10:30:00+05:30';

  // 4a. WITHOUT waiver checkbox -> MUST FAIL for Full Day after shift start
  let failedPostShiftWithoutWaiver = false;
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: elType.id,
        startDate: sameDayDate,
        endDate: sameDayDate,
        dayType: 'FULL_DAY',
        reason: 'Emergency after shift start without waiver',
        emergencyException: false,
        applicationTimestampOverride: postShiftTimestamp,
      },
      empAlice
    );
  } catch (err: any) {
    failedPostShiftWithoutWaiver = true;
  }
  assert.strictEqual(
    failedPostShiftWithoutWaiver,
    true,
    'Emergency Full Day after shift start without waiver must be rejected'
  );
  console.log('   [PASS] Same-day Emergency Full Day after shift start without waiver rejected.');

  // 4b. WITH waiver checkbox -> MUST SUCCEED (permitted under Emergency Exception clause)
  const sameDayWithWaiver = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: elType.id,
      startDate: sameDayDate,
      endDate: sameDayDate,
      dayType: 'FULL_DAY',
      reason: 'Critical hospital admission after office hours started',
      emergencyException: true,
      applicationTimestampOverride: postShiftTimestamp,
    },
    empAlice
  );
  assert.ok(sameDayWithWaiver, 'Emergency Full Day after shift start with waiver must succeed');
  assert.strictEqual(sameDayWithWaiver.finalStatus, 'PENDING', 'Request must be PENDING for approver review');
  console.log('   [PASS] Same-day Emergency Full Day after shift start with waiver permitted.');

  // -------------------------------------------------------------------------
  // TEST 5: Casual Leave (CL) with 0 balance and waiver checkbox -> MUST FAIL
  // Bypass must NOT apply to Casual Leave, Sick Leave, or other types!
  // -------------------------------------------------------------------------
  console.log('\n5. Casual Leave with 0 balance and waiver checkbox ticked...');
  // Ensure Alice CL balance is 0
  const clBalance = balances.find((b) => b.leaveTypeId === clType.id);
  if (clBalance) {
    clBalance.available = 0;
  }

  let clFailed = false;
  let clError = '';
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: clType.id,
        startDate: '2026-11-20',
        endDate: '2026-11-20',
        dayType: 'FULL_DAY',
        reason: 'Casual leave attempt trying to use emergency exception',
        emergencyException: true, // Attempting to use waiver on non-emergency type
      },
      empAlice
    );
  } catch (err: any) {
    clFailed = true;
    clError = err.message;
  }
  assert.strictEqual(clFailed, true, 'Casual Leave with 0 balance MUST be rejected even if waiver checkbox is ticked');
  assert.ok(
    clError.includes('Insufficient') && clError.includes('balance'),
    `Error must be insufficient balance for Casual Leave: ${clError}`
  );
  console.log('   [PASS] Exception bypass strictly blocked for non-emergency leave types.');

  // -------------------------------------------------------------------------
  // TEST 6: Preview calculation endpoint implements identical rules
  // -------------------------------------------------------------------------
  console.log('\n6. Checking calculatePreview matches submission rules...');
  // Preview for Emergency Leave with 0 balance and waiver = true -> valid
  const previewValid = await LeaveRequestService.calculatePreview(
    {
      employeeId: 4,
      leaveTypeId: elType.id,
      startDate: '2026-11-25',
      endDate: '2026-11-25',
      dayType: 'FULL_DAY',
      emergencyException: true,
    },
    empAlice
  );
  assert.strictEqual(
    previewValid.validationErrors.some((e) => e.includes('Insufficient balance')),
    false,
    'Preview must NOT contain Insufficient balance error when waiver is checked for Emergency Leave'
  );

  // Preview for Emergency Leave with 0 balance and waiver = false -> invalid
  const previewInvalid = await LeaveRequestService.calculatePreview(
    {
      employeeId: 4,
      leaveTypeId: elType.id,
      startDate: '2026-11-25',
      endDate: '2026-11-25',
      dayType: 'FULL_DAY',
      emergencyException: false,
    },
    empAlice
  );
  assert.strictEqual(
    previewInvalid.validationErrors.some((e) => e.includes('Insufficient balance')),
    true,
    'Preview MUST contain Insufficient balance error when waiver is unchecked'
  );
  console.log('   [PASS] calculatePreview validation errors match backend submission logic perfectly.');

  console.log('\n============================================================');
  console.log('[ALL TESTS PASSED] EMERGENCY LEAVE SUBMISSION LOGIC VERIFIED!');
  console.log('============================================================\n');
}

runEmergencyLeaveSubmissionSuite().catch((err) => {
  console.error('[TEST FAILED]', err);
  process.exit(1);
});
