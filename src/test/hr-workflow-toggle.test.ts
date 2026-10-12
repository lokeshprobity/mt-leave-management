import assert from 'node:assert';
import { UserService } from '../services/userService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { ApprovalService } from '../services/approvalService.ts';

async function runEmployeeSpecificHrApprovalSuite() {
  console.log('\n============================================================');
  console.log('--- TEST SUITE: EMPLOYEE-SPECIFIC HR APPROVAL WORKFLOW ---');
  console.log('============================================================\n');

  // Reset stores to default state
  UserService.resetMemoryStores({ preservePersistedMedia: true });
  LeaveRequestService.resetMemoryStores();

  const superAdmin = {
    userId: 1,
    username: 'superadmin',
    role: 'SUPER_ADMIN' as const,
    operationalRole: 'TOP_MANAGEMENT' as const,
  };

  const hrUser = {
    userId: 2,
    username: 'hruser',
    role: 'HR' as const,
    operationalRole: 'HR' as const,
    employeeId: 2,
  };

  const teamLeader = {
    userId: 3,
    username: 'teamleader1',
    role: 'TEAM_LEADER' as const,
    operationalRole: 'TEAM_LEADER' as const,
    employeeId: 3,
  };

  const emp1Actor = {
    userId: 4,
    username: 'employee1',
    role: 'EMPLOYEE' as const,
    operationalRole: 'EMPLOYEE' as const,
    employeeId: 4,
  };

  const emp2Actor = {
    userId: 5,
    username: 'employee2',
    role: 'EMPLOYEE' as const,
    operationalRole: 'EMPLOYEE' as const,
    employeeId: 5,
  };

  // ----------------------------------------------------
  // TEST 1: Default Setting for Employees is ON (true)
  // ----------------------------------------------------
  console.log('1. Verifying default "HR Approval Required" state for employees...');
  assert.strictEqual(
    UserService.isHrApprovalRequired(4),
    true,
    'Default setting for Employee 1 (id: 4) must be ON (true)'
  );
  assert.strictEqual(
    UserService.isHrApprovalRequired(5),
    true,
    'Default setting for Employee 2 (id: 5) must be ON (true)'
  );
  console.log('   [PASS] Both employees default safely to ON (3-Stage Workflow).');

  // ----------------------------------------------------
  // TEST 2: Authorization Enforcement (Only Super Admin can change setting)
  // ----------------------------------------------------
  console.log('\n2. Verifying unauthorized roles CANNOT change "HR Approval Required"...');
  
  // Attempt 1: Regular employee tries to update own setting
  let employeeUnauthorizedError = false;
  try {
    await UserService.updateEmployee(4, { hrApprovalRequired: false }, emp1Actor);
  } catch (err: any) {
    employeeUnauthorizedError = err.message.includes('Forbidden');
  }
  assert.strictEqual(
    employeeUnauthorizedError,
    true,
    'Regular employee must be Forbidden from modifying hrApprovalRequired'
  );

  // Attempt 2: HR user tries to update employee setting
  let hrUnauthorizedError = false;
  try {
    await UserService.updateEmployee(4, { hrApprovalRequired: false }, hrUser);
  } catch (err: any) {
    hrUnauthorizedError = err.message.includes('Forbidden');
  }
  assert.strictEqual(
    hrUnauthorizedError,
    true,
    'HR user must be Forbidden from modifying hrApprovalRequired'
  );

  // Attempt 3: setEmployeeHrApprovalRequired helper enforces Super Admin
  let helperUnauthorizedError = false;
  try {
    await UserService.setEmployeeHrApprovalRequired(4, false, hrUser);
  } catch (err: any) {
    helperUnauthorizedError = err.message.includes('Forbidden');
  }
  assert.strictEqual(
    helperUnauthorizedError,
    true,
    'setEmployeeHrApprovalRequired must reject non-Super Admin callers'
  );

  console.log('   [PASS] Strict authorization confirmed: Only Super Admin can change the setting.');

  // ----------------------------------------------------
  // TEST 3: Super Admin Configures Two Employees Independently
  // ----------------------------------------------------
  console.log('\n3. Super Admin configuring Employee 1 = ON and Employee 2 = OFF...');

  // Set Employee 1: ON (true)
  await UserService.setEmployeeHrApprovalRequired(4, true, superAdmin);
  // Set Employee 2: OFF (false)
  await UserService.setEmployeeHrApprovalRequired(5, false, superAdmin);

  // Verify settings are independent
  assert.strictEqual(
    UserService.isHrApprovalRequired(4),
    true,
    'Employee 1 setting must remain ON (true)'
  );
  assert.strictEqual(
    UserService.isHrApprovalRequired(5),
    false,
    'Employee 2 setting must be OFF (false)'
  );

  // Verify Employee DTO reflects the setting
  const emp1Dto = await UserService.getEmployeeById(4);
  const emp2Dto = await UserService.getEmployeeById(5);
  assert.strictEqual(emp1Dto?.hrApprovalRequired, true, 'Employee 1 DTO must show hrApprovalRequired: true');
  assert.strictEqual(emp2Dto?.hrApprovalRequired, false, 'Employee 2 DTO must show hrApprovalRequired: false');

  console.log('   [PASS] Settings applied independently without cross-employee interference.');

  // ----------------------------------------------------
  // TEST 4: Submit Leave Requests for Both Employees Simultaneously
  // ----------------------------------------------------
  console.log('\n4. Submitting leave requests for Employee 1 (ON) and Employee 2 (OFF)...');

  // Employee 1 submits request (3-Stage expected)
  const req1 = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1, // Annual Leave
      startDate: '2026-11-10',
      endDate: '2026-11-11',
      dayType: 'FULL_DAY',
      reason: 'Employee 1 Annual Leave (3-Stage Workflow Test)',
    },
    emp1Actor
  );

  // Employee 2 submits request (2-Stage expected)
  const req2 = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1, // Annual Leave
      startDate: '2026-11-10',
      endDate: '2026-11-11',
      dayType: 'FULL_DAY',
      reason: 'Employee 2 Annual Leave (2-Stage Workflow Test)',
    },
    emp2Actor
  );

  // Check initial request workflow states
  assert.strictEqual(req1.teamLeaderDecision, 'PENDING', 'Req 1: Team Leader must be PENDING');
  assert.strictEqual(req1.hrDecision, 'PENDING', 'Req 1: HR must be PENDING (Setting ON)');
  assert.strictEqual(req1.managementDecision, 'PENDING', 'Req 1: Management must be PENDING');
  assert.strictEqual(req1.approvalStageLabel, 'Pending Team Leader', 'Req 1: Stage label must be Pending Team Leader');

  assert.strictEqual(req2.teamLeaderDecision, 'PENDING', 'Req 2: Team Leader must be PENDING');
  assert.strictEqual(req2.hrDecision, 'NOT_REQUIRED', 'Req 2: HR must be NOT_REQUIRED (Setting OFF)');
  assert.strictEqual(req2.managementDecision, 'PENDING', 'Req 2: Management must be PENDING');
  assert.strictEqual(req2.approvalStageLabel, 'Pending Team Leader', 'Req 2: Stage label must be Pending Team Leader');

  console.log('   [PASS] Req 1 initialized with HR = PENDING; Req 2 initialized with HR = NOT_REQUIRED.');

  // ----------------------------------------------------
  // TEST 5: Team Leader Approves Both Requests
  // ----------------------------------------------------
  console.log('\n5. Team Leader approves both requests...');

  const tlApprovedReq1 = await ApprovalService.processTeamLeaderDecision(
    req1.id,
    'APPROVED',
    'Team Leader approved Req 1',
    teamLeader
  );

  const tlApprovedReq2 = await ApprovalService.processTeamLeaderDecision(
    req2.id,
    'APPROVED',
    'Team Leader approved Req 2',
    teamLeader
  );

  // Req 1 (ON): Should now be at Stage 2 (HR)
  assert.strictEqual(
    tlApprovedReq1.approvalStageLabel,
    'Pending HR',
    'Req 1 must move to "Pending HR" stage after TL approval'
  );

  // Req 2 (OFF): Should bypass HR and move straight to Top Management
  assert.strictEqual(
    tlApprovedReq2.approvalStageLabel,
    'Pending Top Management',
    'Req 2 must bypass HR and move to "Pending Top Management" stage after TL approval'
  );

  console.log('   [PASS] Req 1 moved to "Pending HR"; Req 2 moved to "Pending Top Management".');

  // ----------------------------------------------------
  // TEST 6: Verify Pending Queues for HR & Top Management
  // ----------------------------------------------------
  console.log('\n6. Verifying pending queues for HR and Top Management...');

  // Check HR Queue
  const hrQueue = await ApprovalService.getPendingRequestsForActor(hrUser);
  const hrQueueIds = hrQueue.map((r) => r.id);
  assert.strictEqual(
    hrQueueIds.includes(req1.id),
    true,
    'Req 1 MUST appear in HR pending queue (Setting ON)'
  );
  assert.strictEqual(
    hrQueueIds.includes(req2.id),
    false,
    'Req 2 MUST NOT appear in HR pending queue (Setting OFF: Bypassed)'
  );

  // Check Top Management Queue
  const mgmtQueue = await ApprovalService.getPendingRequestsForActor(superAdmin);
  const mgmtQueueIds = mgmtQueue.map((r) => r.id);
  assert.strictEqual(
    mgmtQueueIds.includes(req1.id),
    false,
    'Req 1 MUST NOT appear in Top Management queue while HR review is still pending'
  );
  assert.strictEqual(
    mgmtQueueIds.includes(req2.id),
    true,
    'Req 2 MUST appear in Top Management queue immediately after TL approval (HR Bypassed)'
  );

  console.log('   [PASS] Pending queues correctly routed based on employee-specific settings.');

  // ----------------------------------------------------
  // TEST 7: Top Management Cannot Decide on Req 1 Before HR Review
  // ----------------------------------------------------
  console.log('\n7. Verifying Top Management cannot decide on Req 1 while HR is pending...');

  let mgmtPrematureError = false;
  try {
    await ApprovalService.processTopManagementDecision(
      req1.id,
      'APPROVED',
      'Premature Top Management approval attempt',
      superAdmin
    );
  } catch (err: any) {
    mgmtPrematureError = err.message.includes('HR review is still pending');
  }
  assert.strictEqual(
    mgmtPrematureError,
    true,
    'Top Management must be blocked while HR review is pending for Req 1'
  );
  console.log('   [PASS] Top Management blocked from skipping HR review on Req 1.');

  // ----------------------------------------------------
  // TEST 8: HR Cannot Decide on Req 2 (HR Approval Bypassed / Forbidden)
  // ----------------------------------------------------
  console.log('\n8. Verifying HR cannot decide on Req 2 (Setting OFF)...');

  let hrForbiddenError = false;
  try {
    await ApprovalService.processHrReview(
      req2.id,
      'APPROVED',
      'HR trying to approve a bypassed request',
      hrUser
    );
  } catch (err: any) {
    hrForbiddenError = err.message.includes('HR approval is not required');
  }
  assert.strictEqual(
    hrForbiddenError,
    true,
    'HR must be Forbidden from reviewing Req 2 because HR approval was bypassed'
  );
  console.log('   [PASS] HR review strictly forbidden for Req 2.');

  // ----------------------------------------------------
  // TEST 9: Top Management Decides on Req 2 (2-Stage Completion)
  // ----------------------------------------------------
  console.log('\n9. Top Management completes Req 2 (2-Stage: TL -> Top Mgmt)...');

  const finalReq2 = await ApprovalService.processTopManagementDecision(
    req2.id,
    'APPROVED',
    'Top Management final approval for Req 2',
    superAdmin
  );

  assert.strictEqual(finalReq2.finalStatus, 'APPROVED', 'Req 2 must be final APPROVED');
  assert.strictEqual(finalReq2.approvalStageLabel, 'Approved', 'Req 2 stage label must be Approved');
  assert.strictEqual(finalReq2.hrDecision, 'NOT_REQUIRED', 'Req 2 HR stage remained NOT_REQUIRED');
  console.log('   [PASS] Req 2 successfully completed 2-stage workflow: TL -> Top Management.');

  // ----------------------------------------------------
  // TEST 10: HR Review and Top Management Final Decision on Req 1 (3-Stage Completion)
  // ----------------------------------------------------
  console.log('\n10. Completing Req 1 via 3-Stage: TL -> HR -> Top Management...');

  // HR recommends approval
  const hrApprovedReq1 = await ApprovalService.processHrReview(
    req1.id,
    'APPROVED',
    'HR recommendation for Req 1',
    hrUser
  );
  assert.strictEqual(hrApprovedReq1.hrDecision, 'APPROVED', 'Req 1 HR decision must be APPROVED');
  assert.strictEqual(
    hrApprovedReq1.approvalStageLabel,
    'HR Approved → Pending Top Management',
    'Req 1 must now be in HR Approved -> Pending Top Management stage'
  );

  // Now Top Management approves Req 1
  const finalReq1 = await ApprovalService.processTopManagementDecision(
    req1.id,
    'APPROVED',
    'Top Management final decision for Req 1',
    superAdmin
  );
  assert.strictEqual(finalReq1.finalStatus, 'APPROVED', 'Req 1 must be final APPROVED');
  assert.strictEqual(finalReq1.approvalStageLabel, 'Approved', 'Req 1 stage label must be Approved');
  console.log('   [PASS] Req 1 successfully completed 3-stage workflow: TL -> HR -> Top Management.');

  // ----------------------------------------------------
  // TEST 11: Pending Request Preservation on Setting Changes
  // ----------------------------------------------------
  console.log('\n11. Verifying pending requests are preserved when employee setting changes...');

  // Employee 1 submits a new request with setting ON
  const pendingReq = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-11-20',
      endDate: '2026-11-21',
      dayType: 'FULL_DAY',
      reason: 'Employee 1 Pending Preservation Test',
    },
    emp1Actor
  );
  // Team Leader approves -> request is at HR stage (hrDecision: 'PENDING')
  await ApprovalService.processTeamLeaderDecision(pendingReq.id, 'APPROVED', 'TL Approved', teamLeader);

  // Now Super Admin changes Employee 1's setting to OFF
  await UserService.setEmployeeHrApprovalRequired(4, false, superAdmin);
  assert.strictEqual(UserService.isHrApprovalRequired(4), false);

  // The EXISTING pending request must NOT be silently re-routed or bypassed
  const retrievedPending = await LeaveRequestService.getLeaveRequestById(pendingReq.id, superAdmin);
  assert.strictEqual(
    retrievedPending.request.hrDecision,
    'PENDING',
    'Existing pending request must preserve hrDecision: PENDING'
  );
  assert.strictEqual(
    retrievedPending.request.approvalStageLabel,
    'Pending HR',
    'Existing pending request must preserve approvalStageLabel: Pending HR'
  );

  // Verify Top Management cannot approve this pending request until HR decides
  let stillBlocked = false;
  try {
    await ApprovalService.processTopManagementDecision(
      pendingReq.id,
      'APPROVED',
      'Should be blocked',
      superAdmin
    );
  } catch (err: any) {
    stillBlocked = err.message.includes('HR review is still pending');
  }
  assert.strictEqual(
    stillBlocked,
    true,
    'Existing pending request must still require HR review even if employee setting changed to OFF'
  );

  // Future requests from Employee 1 will follow the new 2-stage setting
  const futureReq = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-11-25',
      endDate: '2026-11-26',
      dayType: 'FULL_DAY',
      reason: 'Employee 1 Future Request After Setting Switched to OFF',
    },
    emp1Actor
  );
  assert.strictEqual(
    futureReq.hrDecision,
    'NOT_REQUIRED',
    'Future request from Employee 1 must follow new setting (OFF: NOT_REQUIRED)'
  );

  console.log('   [PASS] Pending requests preserved intact without silent re-routing.');

  // ----------------------------------------------------
  // TEST 12: Clean Up / Restore Default Settings
  // ----------------------------------------------------
  await UserService.setEmployeeHrApprovalRequired(4, true, superAdmin);
  await UserService.setEmployeeHrApprovalRequired(5, true, superAdmin);

  console.log('\n============================================================');
  console.log('[ALL 12 TESTS PASSED] EMPLOYEE-SPECIFIC HR WORKFLOW VERIFIED!');
  console.log('============================================================\n');
}

runEmployeeSpecificHrApprovalSuite().catch((err) => {
  console.error('[TEST SUITE FAILED]', err);
  process.exit(1);
});
