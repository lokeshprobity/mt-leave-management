import { LeaveService } from '../services/leaveService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { LeaveClassificationService } from '../services/leaveClassificationService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { ApprovalService, calculateFinalLeaveStatus } from '../services/approvalService.ts';
import { AuthContext } from '../types/leave.ts';

const EMP_AUTH: AuthContext = {
  userId: 4,
  username: 'alice_emp',
  role: 'EMPLOYEE',
  employeeId: 4,
};

const TL_AUTH: AuthContext = {
  userId: 5,
  username: 'tl_robert',
  role: 'TEAM_LEADER',
  employeeId: 5,
};

const HR_AUTH: AuthContext = {
  userId: 10,
  username: 'hr_sarah',
  role: 'HR',
  employeeId: 501,
};

const MGMT_AUTH: AuthContext = {
  userId: 20,
  username: 'mgmt_director',
  role: 'TOP_MANAGEMENT',
  employeeId: 901,
};

const ADMIN_AUTH: AuthContext = {
  userId: 99,
  username: 'admin_sys',
  role: 'SUPER_ADMIN',
  employeeId: 999,
};

async function runApprovalEngineTests() {
  console.log('--- STARTING STEP 5 HR + TOP MANAGEMENT APPROVAL ENGINE TEST SUITE ---');
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
    LeaveService.resetMemoryStores();
    WorkingDaysService.resetMemoryHolidays();
    LeaveClassificationService.resetTimingConfig();
    LeaveRequestService.resetMemoryStores();
    LeaveClassificationService.setCustomTimingConfig({
      officeStartTime: '08:30',
      normalLeaveCutoffTime: '07:00',
      timezone: 'UTC',
    });
  }

  async function createTestRequest(daysAhead = 14, totalDays = 2) {
    const start = new Date(Date.now() + daysAhead * 86400000);
    // Find next Monday (day 1) to avoid weekend and ensure clean working days
    while (start.getDay() !== 1) {
      start.setDate(start.getDate() + 1);
    }
    const end = new Date(start);
    end.setDate(end.getDate() + (totalDays - 1));

    const sStr = start.toISOString().split('T')[0];
    const eStr = end.toISOString().split('T')[0];

    return await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1, // CL
        startDate: sStr,
        endDate: eStr,
        dayType: 'FULL_DAY',
        reason: 'Annual family holiday trip',
      },
      EMP_AUTH
    );
  }

  // =========================================================================
  // Part 1: Pure Authoritative Matrix Tests (The 8 Combinations)
  // =========================================================================
  console.log('\n--- Authoritative Decision Combinations Check ---');

  // Combination 1: HR APPROVED + Mgmt APPROVED -> FINAL APPROVED
  assert(
    calculateFinalLeaveStatus('APPROVED', 'APPROVED') === 'APPROVED',
    'Combination 1: HR APPROVED + Mgmt APPROVED -> FINAL APPROVED'
  );

  // Combination 2: HR REJECTED + Mgmt APPROVED -> FINAL APPROVED
  assert(
    calculateFinalLeaveStatus('REJECTED', 'APPROVED') === 'APPROVED',
    'Combination 2: HR REJECTED + Mgmt APPROVED -> FINAL APPROVED'
  );

  // Combination 3: HR APPROVED + Mgmt REJECTED -> FINAL REJECTED
  assert(
    calculateFinalLeaveStatus('APPROVED', 'REJECTED') === 'REJECTED',
    'Combination 3: HR APPROVED + Mgmt REJECTED -> FINAL REJECTED'
  );

  // Combination 4: HR REJECTED + Mgmt REJECTED -> FINAL REJECTED
  assert(
    calculateFinalLeaveStatus('REJECTED', 'REJECTED') === 'REJECTED',
    'Combination 4: HR REJECTED + Mgmt REJECTED -> FINAL REJECTED'
  );

  // Combination 5: HR PENDING + Mgmt APPROVED -> FINAL APPROVED (Independent parallel approval!)
  assert(
    calculateFinalLeaveStatus('PENDING', 'APPROVED') === 'APPROVED',
    'Combination 5: HR PENDING + Mgmt APPROVED -> FINAL APPROVED (Independent approval)'
  );

  // Combination 6: HR PENDING + Mgmt REJECTED -> FINAL REJECTED
  assert(
    calculateFinalLeaveStatus('PENDING', 'REJECTED') === 'REJECTED',
    'Combination 6: HR PENDING + Mgmt REJECTED -> FINAL REJECTED'
  );

  // Combination 7: HR APPROVED + Mgmt PENDING -> FINAL PENDING (HR does not finalize)
  assert(
    calculateFinalLeaveStatus('APPROVED', 'PENDING') === 'PENDING',
    'Combination 7: HR APPROVED + Mgmt PENDING -> FINAL PENDING (HR review is recommendation only)'
  );

  // Combination 8: HR REJECTED + Mgmt PENDING -> FINAL PENDING
  assert(
    calculateFinalLeaveStatus('REJECTED', 'PENDING') === 'PENDING',
    'Combination 8: HR REJECTED + Mgmt PENDING -> FINAL PENDING'
  );

  // =========================================================================
  // Part 2: End-to-End Workflow & Persistence Tests
  // =========================================================================
  console.log('\n--- End-to-End Approval Workflows & State Integrity ---');

  // 9. Standard Sequential Workflow: HR Approves, then Management Approves -> FINAL APPROVED
  resetState();
  try {
    const req = await createTestRequest();
    assert(req.hrDecision === 'PENDING' && req.managementDecision === 'PENDING' && req.finalStatus === 'PENDING', 'Initial state is all PENDING');

    // Team Leader Approves (Stage 1)
    const tlResult = await ApprovalService.submitTeamLeaderDecision(
      req.id,
      { decision: 'APPROVED', comments: 'Team coverage verified' },
      TL_AUTH
    );
    assert(tlResult.teamLeaderDecision === 'APPROVED', 'Team Leader decision saved as APPROVED');

    // HR Approves (Stage 2)
    const hrResult = await ApprovalService.submitHrDecision(
      req.id,
      { decision: 'APPROVED', comments: 'Documents verified, policy compliant' },
      HR_AUTH
    );
    assert(hrResult.hrDecision === 'APPROVED', 'HR decision saved as APPROVED');
    assert(hrResult.finalStatus === 'PENDING', 'Final status remains PENDING after HR review');

    // Management Approves
    const mgmtResult = await ApprovalService.submitManagementDecision(
      req.id,
      { decision: 'APPROVED', comments: 'Approved by Director' },
      MGMT_AUTH
    );
    assert(mgmtResult.managementDecision === 'APPROVED', 'Management decision saved as APPROVED');
    assert(mgmtResult.finalStatus === 'APPROVED', 'Final status is now APPROVED');
    assert(mgmtResult.balancePosted === true, 'Balance is marked as posted upon FINAL APPROVED');
  } catch (err: any) {
    assert(false, 'Workflow: HR Approves -> Mgmt Approves', err.message);
  }

  // 10. Sequential Stage Protection: Management cannot bypass pending Team Leader or HR stages
  resetState();
  try {
    const req = await createTestRequest();
    let blockedWhileTlPending = false;
    try {
      await ApprovalService.submitManagementDecision(
        req.id,
        { decision: 'APPROVED', comments: 'Attempted direct management approval' },
        MGMT_AUTH
      );
    } catch (err: any) {
      blockedWhileTlPending = err.message.includes('Team Leader approval is still pending');
    }
    assert(blockedWhileTlPending, 'Management blocked while Team Leader stage is PENDING');

    await ApprovalService.submitTeamLeaderDecision(
      req.id,
      { decision: 'APPROVED', comments: 'Team Leader approved' },
      TL_AUTH
    );

    let blockedWhileHrPending = false;
    try {
      await ApprovalService.submitManagementDecision(
        req.id,
        { decision: 'APPROVED', comments: 'Attempted management approval before HR' },
        MGMT_AUTH
      );
    } catch (err: any) {
      blockedWhileHrPending = err.message.includes('HR review is still pending');
    }
    assert(blockedWhileHrPending, 'Management blocked while HR stage is PENDING');

    await ApprovalService.submitHrDecision(
      req.id,
      { decision: 'APPROVED', comments: 'HR reviewed and approved' },
      HR_AUTH
    );

    const mgmtResult = await ApprovalService.submitManagementDecision(
      req.id,
      { decision: 'APPROVED', comments: 'Final approval after TL and HR stages' },
      MGMT_AUTH
    );
    assert(mgmtResult.finalStatus === 'APPROVED', 'Final status becomes APPROVED after required stages complete');
  } catch (err: any) {
    assert(false, 'Workflow: Sequential stage protection before Management decision', err.message);
  }

  // 11. Overturn Rule: HR Rejects, but Management Approves -> Final is APPROVED
  resetState();
  try {
    const req = await createTestRequest();
    await ApprovalService.submitTeamLeaderDecision(
      req.id,
      { decision: 'APPROVED', comments: 'TL approved' },
      TL_AUTH
    );
    // HR Rejects
    await ApprovalService.submitHrDecision(
      req.id,
      { decision: 'REJECTED', comments: 'Notice period is tight' },
      HR_AUTH
    );
    // Management exercises final authority and Approves
    const mgmtResult = await ApprovalService.submitManagementDecision(
      req.id,
      { decision: 'APPROVED', comments: 'Executive waiver granted' },
      MGMT_AUTH
    );
    assert(mgmtResult.hrDecision === 'REJECTED', 'HR decision recorded as REJECTED');
    assert(mgmtResult.managementDecision === 'APPROVED', 'Management decision recorded as APPROVED');
    assert(mgmtResult.finalStatus === 'APPROVED', 'Top Management final decision overrides HR rejection');
  } catch (err: any) {
    assert(false, 'Workflow: HR Rejects, Management Approves -> FINAL APPROVED', err.message);
  }

  // 12. HR Cannot Modify a Request Already Finalized by Top Management
  resetState();
  try {
    const req = await createTestRequest();
    await ApprovalService.submitTeamLeaderDecision(
      req.id,
      { decision: 'APPROVED', comments: 'TL approved' },
      TL_AUTH
    );
    await ApprovalService.submitHrDecision(
      req.id,
      { decision: 'APPROVED', comments: 'HR approved' },
      HR_AUTH
    );
    await ApprovalService.submitManagementDecision(
      req.id,
      { decision: 'APPROVED', comments: 'Finalized by Management' },
      MGMT_AUTH
    );
    let hrBlockedAfterFinal = false;
    try {
      await ApprovalService.submitHrDecision(
        req.id,
        { decision: 'REJECTED', comments: 'Late audit attempt' },
        HR_AUTH
      );
    } catch (err: any) {
      hrBlockedAfterFinal =
        err.message.includes('already been finalized') ||
        err.message.includes('already been recorded');
    }
    assert(hrBlockedAfterFinal, 'HR review after Management finalization is blocked');
  } catch (err: any) {
    assert(false, 'HR review after Management does not overturn final authority', err.message);
  }

  // =========================================================================
  // Part 3: Balance Deduction Integrity
  // =========================================================================
  console.log('\n--- Balance Posting Integrity ---');

  // 13. Balance is deducted exactly once on FINAL APPROVED
  resetState();
  try {
    const balancesBefore = await LeaveService.getLeaveBalances({ employeeId: 4 });
    const clBalBefore = balancesBefore.find((b) => b.leaveTypeId === 1);
    const usedBefore = Number(clBalBefore?.used || 0);

    const req = await createTestRequest(12, 2); // 2 days leave
    await ApprovalService.submitTeamLeaderDecision(req.id, { decision: 'APPROVED' }, TL_AUTH);
    await ApprovalService.submitHrDecision(req.id, { decision: 'APPROVED' }, HR_AUTH);
    await ApprovalService.submitManagementDecision(
      req.id,
      { decision: 'APPROVED', comments: 'Approved' },
      MGMT_AUTH
    );

    const balancesAfter = await LeaveService.getLeaveBalances({ employeeId: 4 });
    const clBalAfter = balancesAfter.find((b) => b.leaveTypeId === 1);
    const usedAfter = Number(clBalAfter?.used || 0);

    assert(usedAfter === usedBefore + 2, 'Employee balance used was incremented by exactly 2 days');

    // Balance transactions table check
    const txs = await LeaveService.getLeaveBalanceTransactions({ employeeId: 4 });
    const foundTx = txs.find((t) => t.referenceId === String(req.id) && t.transactionType === 'USED');
    assert(!!foundTx && Number(foundTx.quantity) === 2, 'Balance transaction USED audit record created with quantity 2');
  } catch (err: any) {
    assert(false, 'Balance deduction on approval', err.message);
  }

  // 14. Balance is NOT deducted when Management gives FINAL REJECTED
  resetState();
  try {
    const balancesBefore = await LeaveService.getLeaveBalances({ employeeId: 4 });
    const clBalBefore = balancesBefore.find((b) => b.leaveTypeId === 1);
    const usedBefore = Number(clBalBefore?.used || 0);

    const req = await createTestRequest(15, 3);
    await ApprovalService.submitTeamLeaderDecision(req.id, { decision: 'APPROVED' }, TL_AUTH);
    await ApprovalService.submitHrDecision(req.id, { decision: 'APPROVED' }, HR_AUTH);
    await ApprovalService.submitManagementDecision(
      req.id,
      { decision: 'REJECTED', comments: 'Operational constraints prevent absence' },
      MGMT_AUTH
    );

    const balancesAfter = await LeaveService.getLeaveBalances({ employeeId: 4 });
    const clBalAfter = balancesAfter.find((b) => b.leaveTypeId === 1);
    const usedAfter = Number(clBalAfter?.used || 0);

    assert(usedAfter === usedBefore, 'Employee balance was NOT deducted for rejected request');
  } catch (err: any) {
    assert(false, 'No balance deduction on rejection', err.message);
  }

  // =========================================================================
  // Part 4: Security, RBAC & State Protection
  // =========================================================================
  console.log('\n--- Security, RBAC & State Protection ---');

  // 15. Employee cannot approve/reject
  resetState();
  try {
    const req = await createTestRequest();
    let threw = false;
    try {
      await ApprovalService.submitHrDecision(req.id, { decision: 'APPROVED' }, EMP_AUTH);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('Forbidden'), 'Employee blocked from HR approval action');
    }
    assert(threw, 'Employee attempting HR approval threw error');

    threw = false;
    try {
      await ApprovalService.submitManagementDecision(req.id, { decision: 'APPROVED' }, EMP_AUTH);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('Forbidden'), 'Employee blocked from Management approval action');
    }
    assert(threw, 'Employee attempting Management approval threw error');
  } catch (err: any) {
    assert(false, 'Employee permission check', err.message);
  }

  // 16. HR cannot perform Management final decision
  resetState();
  try {
    const req = await createTestRequest();
    let threw = false;
    try {
      await ApprovalService.submitManagementDecision(req.id, { decision: 'APPROVED' }, HR_AUTH);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('Forbidden'), 'HR blocked from performing Top Management final action');
    }
    assert(threw, 'HR attempting Management action threw forbidden error');
  } catch (err: any) {
    assert(false, 'HR cannot perform Management action', err.message);
  }

  // 17. Management cannot perform HR review action
  resetState();
  try {
    const req = await createTestRequest();
    let threw = false;
    try {
      await ApprovalService.submitHrDecision(req.id, { decision: 'APPROVED' }, MGMT_AUTH);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('Forbidden'), 'Top Management blocked from performing HR review action');
    }
    assert(threw, 'Management attempting HR action threw forbidden error');
  } catch (err: any) {
    assert(false, 'Management cannot perform HR action', err.message);
  }

  // 18. Cannot approve or reject a CANCELLED request
  resetState();
  try {
    const req = await createTestRequest();
    await LeaveRequestService.cancelLeaveRequest(req.id, 'Plans cancelled', EMP_AUTH);

    let threw = false;
    try {
      await ApprovalService.submitHrDecision(req.id, { decision: 'APPROVED' }, HR_AUTH);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('cancelled'), 'HR approval blocked on cancelled request');
    }
    assert(threw, 'HR decision on cancelled request threw error');

    threw = false;
    try {
      await ApprovalService.submitManagementDecision(req.id, { decision: 'APPROVED' }, MGMT_AUTH);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('cancelled'), 'Management approval blocked on cancelled request');
    }
    assert(threw, 'Management decision on cancelled request threw error');
  } catch (err: any) {
    assert(false, 'Cancelled request state protection', err.message);
  }

  // 19. Cannot re-submit decision (duplicate decision attempt)
  resetState();
  try {
    const req = await createTestRequest();
    await ApprovalService.submitTeamLeaderDecision(req.id, { decision: 'APPROVED' }, TL_AUTH);
    await ApprovalService.submitHrDecision(req.id, { decision: 'APPROVED' }, HR_AUTH);

    let threw = false;
    try {
      await ApprovalService.submitHrDecision(req.id, { decision: 'REJECTED', comments: 'Changed my mind' }, HR_AUTH);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('already been recorded'), 'Duplicate HR decision rejected');
    }
    assert(threw, 'Duplicate HR decision threw error');

    await ApprovalService.submitManagementDecision(req.id, { decision: 'APPROVED' }, MGMT_AUTH);
    threw = false;
    try {
      await ApprovalService.submitManagementDecision(req.id, { decision: 'REJECTED', comments: 'Revoke' }, MGMT_AUTH);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('already been recorded'), 'Duplicate Management decision rejected');
    }
    assert(threw, 'Duplicate Management decision threw error');
  } catch (err: any) {
    assert(false, 'Duplicate decision prevention', err.message);
  }

  // 20. Rejection requires a non-empty comment
  resetState();
  try {
    const req = await createTestRequest();
    await ApprovalService.submitTeamLeaderDecision(req.id, { decision: 'APPROVED' }, TL_AUTH);
    let threw = false;
    try {
      await ApprovalService.submitHrDecision(req.id, { decision: 'REJECTED', comments: '   ' }, HR_AUTH);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('comment is required'), 'HR rejection without comment rejected');
    }
    assert(threw, 'HR rejection without comment threw error');

    threw = false;
    try {
      await ApprovalService.submitManagementDecision(req.id, { decision: 'REJECTED', comments: '' }, MGMT_AUTH);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('comment is required'), 'Management rejection without comment rejected');
    }
    assert(threw, 'Management rejection without comment threw error');
  } catch (err: any) {
    assert(false, 'Rejection comment requirement', err.message);
  }

  // 21. Immutable event audit trail verified
  resetState();
  try {
    const req = await createTestRequest();
    await ApprovalService.submitTeamLeaderDecision(req.id, { decision: 'APPROVED', comments: 'TL Good' }, TL_AUTH);
    await ApprovalService.submitHrDecision(req.id, { decision: 'APPROVED', comments: 'HR Good' }, HR_AUTH);
    await ApprovalService.submitManagementDecision(req.id, { decision: 'APPROVED', comments: 'MGMT Approved' }, MGMT_AUTH);

    const details = await LeaveRequestService.getLeaveRequestById(req.id, ADMIN_AUTH);
    assert(!!details, 'Details retrieved');
    const events = details!.events;

    const hasSubmitted = events.some((e) => e.eventType === 'SUBMITTED');
    const hasHrApprove = events.some((e) => e.eventType === 'HR_APPROVED' && e.actorRole === 'HR');
    const hasMgmtApprove = events.some((e) => e.eventType === 'MANAGEMENT_APPROVED' && e.actorRole === 'TOP_MANAGEMENT');
    const hasFinalStatus = events.some((e) => e.eventType === 'FINAL_STATUS_CHANGED' && e.newDecision === 'APPROVED');

    assert(hasSubmitted, 'Audit trail contains SUBMITTED event');
    assert(hasHrApprove, 'Audit trail contains HR_APPROVED event with actorRole HR');
    assert(hasMgmtApprove, 'Audit trail contains MANAGEMENT_APPROVED event with actorRole TOP_MANAGEMENT');
    assert(hasFinalStatus, 'Audit trail contains FINAL_STATUS_CHANGED event');
  } catch (err: any) {
    assert(false, 'Audit events verification', err.message);
  }

  // 22. Employee history aggregation
  resetState();
  try {
    await createTestRequest(10, 1);
    await createTestRequest(20, 2);
    const history = await ApprovalService.getEmployeeApprovalHistory(4, HR_AUTH);
    assert(history.totalRequests === 2, 'History correctly aggregates total employee requests');
    assert(history.pendingRequests === 2, 'History correctly counts pending requests');
    assert(Array.isArray(history.balances) && history.balances.length > 0, 'History includes leave balances');
  } catch (err: any) {
    assert(false, 'Employee history aggregation', err.message);
  }

  console.log(`\n--- STEP 5 APPROVAL ENGINE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runApprovalEngineTests().catch((err) => {
  console.error('Test runner encountered fatal error:', err);
  process.exit(1);
});
