import { LeaveService } from '../services/leaveService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { LeaveClassificationService } from '../services/leaveClassificationService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { ApprovalService, calculateFinalLeaveStatus } from '../services/approvalService.ts';
import { AuthContext } from '../types/leave.ts';

const EMP_1_AUTH: AuthContext = {
  userId: 1,
  username: 'emp_one',
  role: 'EMPLOYEE',
  employeeId: 101,
};

const EMP_2_AUTH: AuthContext = {
  userId: 2,
  username: 'emp_two',
  role: 'EMPLOYEE',
  employeeId: 102,
};

const HR_AUTH: AuthContext = {
  userId: 10,
  username: 'hr_reviewer',
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
  username: 'admin_audit',
  role: 'SUPER_ADMIN',
  employeeId: 999,
};

async function runDeepAuditTests() {
  console.log('=== RUNNING COMPREHENSIVE 25-POINT DEEP AUDIT TEST SUITE ===');
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

  // =========================================================================
  // Section 1: Overlap Audit & Date Edge Cases (Audit Checklist #14)
  // =========================================================================
  console.log('\n--- 1. Overlap Audit & Edge Cases ---');

  // 1.1 Re-application on dates of a REJECTED request must succeed
  resetState();
  try {
    const req1 = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-09',
        endDate: '2026-11-11',
        dayType: 'FULL_DAY',
        reason: 'Project break in November',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    // Reject it via Management after TL and HR review
    await ApprovalService.submitTeamLeaderDecision(
      req1.id,
      { decision: 'APPROVED', comments: 'TL forwarded' },
      ADMIN_AUTH
    );
    await ApprovalService.submitHrDecision(
      req1.id,
      { decision: 'APPROVED', comments: 'HR forwarded' },
      HR_AUTH
    );
    await ApprovalService.submitManagementDecision(
      req1.id,
      { decision: 'REJECTED', comments: 'Peak work period' },
      MGMT_AUTH
    );

    // Apply again for exact same dates
    const req2 = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-09',
        endDate: '2026-11-11',
        dayType: 'FULL_DAY',
        reason: 'Re-applying with adjusted coverage',
        applicationTimestampOverride: '2026-10-02T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(
      req2.id !== req1.id && req2.status === 'PENDING',
      '1.1 Re-applying on dates of a REJECTED leave request is permitted'
    );
  } catch (e: any) {
    assert(false, '1.1 Re-applying on dates of a REJECTED request failed', e.message);
  }

  // 1.2 Half-day non-conflicting periods on same date (FIRST_HALF + SECOND_HALF)
  resetState();
  try {
    const half1 = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-18',
        endDate: '2026-11-18',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'FIRST_HALF',
        reason: 'Doctor appointment morning',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    const half2 = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-18',
        endDate: '2026-11-18',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'SECOND_HALF',
        reason: 'Family event afternoon',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    assert(
      half1.id !== half2.id && half1.halfDayPeriod === 'FIRST_HALF' && half2.halfDayPeriod === 'SECOND_HALF',
      '1.2 Distinct half-day requests (FIRST_HALF and SECOND_HALF) on the same date are allowed'
    );
  } catch (e: any) {
    assert(false, '1.2 Distinct half-day requests on same date failed', e.message);
  }

  // 1.3 Same half-day period on same date must be rejected
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-18',
        endDate: '2026-11-18',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'FIRST_HALF',
        reason: 'Duplicate morning leave',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '1.3 Duplicate FIRST_HALF on same date was allowed', 'Should have thrown');
  } catch (e: any) {
    assert(/Overlapping leave request detected/i.test(e.message), '1.3 Duplicate FIRST_HALF on same date is rejected');
  }

  // 1.4 Full day request overlapping an existing half day must be rejected
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-18',
        endDate: '2026-11-18',
        dayType: 'FULL_DAY',
        reason: 'Full day instead',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '1.4 FULL_DAY on date with existing HALF_DAY was allowed', 'Should have thrown');
  } catch (e: any) {
    assert(/Overlapping leave request detected/i.test(e.message), '1.4 FULL_DAY conflicting with HALF_DAY is rejected');
  }

  // =========================================================================
  // Section 2: Concurrency & State Invariant Audit (Audit Checklist #7, #4, #3)
  // =========================================================================
  console.log('\n--- 2. Concurrency & State Invariant Audit ---');

  // 2.1 Concurrent dual management decision race condition
  resetState();
  try {
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-23',
        endDate: '2026-11-25',
        dayType: 'FULL_DAY',
        reason: 'November vacation',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    await ApprovalService.submitTeamLeaderDecision(req.id, { decision: 'APPROVED' }, ADMIN_AUTH);
    await ApprovalService.submitHrDecision(req.id, { decision: 'APPROVED' }, HR_AUTH);

    // Simulate simultaneous Management approval calls
    const p1 = ApprovalService.submitManagementDecision(req.id, { decision: 'APPROVED' }, MGMT_AUTH);
    const p2 = ApprovalService.submitManagementDecision(req.id, { decision: 'APPROVED' }, MGMT_AUTH);

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(
      fulfilled.length === 1 && rejected.length === 1,
      '2.1 Dual simultaneous Management decisions: exactly one succeeds, other is rejected with conflict'
    );
  } catch (e: any) {
    assert(false, '2.1 Dual simultaneous management decision failed', e.message);
  }

  // 2.2 Concurrent dual HR decision race condition
  resetState();
  try {
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-30',
        endDate: '2026-12-02',
        dayType: 'FULL_DAY',
        reason: 'Conference leave',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    await ApprovalService.submitTeamLeaderDecision(req.id, { decision: 'APPROVED' }, ADMIN_AUTH);

    const p1 = ApprovalService.submitHrDecision(req.id, { decision: 'APPROVED' }, HR_AUTH);
    const p2 = ApprovalService.submitHrDecision(req.id, { decision: 'APPROVED' }, HR_AUTH);

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert(
      fulfilled.length === 1 && rejected.length === 1,
      '2.2 Dual simultaneous HR decisions: exactly one succeeds, other is rejected with conflict'
    );
  } catch (e: any) {
    assert(false, '2.2 Dual simultaneous HR decision failed', e.message);
  }

  // 2.3 Concurrent Management Approval vs Cancellation race
  resetState();
  try {
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-12-07',
        endDate: '2026-12-09',
        dayType: 'FULL_DAY',
        reason: 'Travel',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    // Employee cancels first
    await LeaveRequestService.cancelLeaveRequest(req.id, 'Change of travel plans', EMP_1_AUTH);

    // Management tries to approve cancelled request
    try {
      await ApprovalService.submitManagementDecision(req.id, { decision: 'APPROVED' }, MGMT_AUTH);
      assert(false, '2.3 Management approval on cancelled request succeeded', 'Should have thrown');
    } catch (e: any) {
      assert(
        /Cannot review or decide on a cancelled leave request/i.test(e.message),
        '2.3 Management cannot approve an already cancelled request'
      );
    }
  } catch (e: any) {
    assert(false, '2.3 Cancellation race test failed', e.message);
  }

  // 2.4 Cancellation blocked once Management has decided
  resetState();
  try {
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-12-14',
        endDate: '2026-12-16',
        dayType: 'FULL_DAY',
        reason: 'Family trip',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    // Team Leader, HR, and Management approve sequentially
    await ApprovalService.submitTeamLeaderDecision(req.id, { decision: 'APPROVED' }, ADMIN_AUTH);
    await ApprovalService.submitHrDecision(req.id, { decision: 'APPROVED' }, HR_AUTH);
    await ApprovalService.submitManagementDecision(req.id, { decision: 'APPROVED' }, MGMT_AUTH);

    // Employee tries to cancel approved leave
    try {
      await LeaveRequestService.cancelLeaveRequest(req.id, 'Cancel after approval', EMP_1_AUTH);
      assert(false, '2.4 Cancel approved leave succeeded', 'Should have thrown');
    } catch (e: any) {
      assert(
        /Cannot cancel leave request with status 'APPROVED'/i.test(e.message),
        '2.4 Employee cannot cancel an already approved leave request'
      );
    }
  } catch (e: any) {
    assert(false, '2.4 Cancel after approval failed', e.message);
  }

  // 2.5 HR REJECTED recommendation overridden by Management APPROVED final status
  resetState();
  try {
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-12-21',
        endDate: '2026-12-23',
        dayType: 'FULL_DAY',
        reason: 'Winter travel',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    // Team Leader approves Stage 1
    await ApprovalService.submitTeamLeaderDecision(req.id, { decision: 'APPROVED' }, ADMIN_AUTH);

    // HR reviews with REJECTED recommendation
    await ApprovalService.submitHrDecision(
      req.id,
      { decision: 'REJECTED', comments: 'HR thinks coverage is tight' },
      HR_AUTH
    );

    // Management exercises final authority and approves
    const updated = await ApprovalService.submitManagementDecision(
      req.id,
      { decision: 'APPROVED', comments: 'Executive override' },
      MGMT_AUTH
    );

    assert(
      updated.hrDecision === 'REJECTED' &&
        updated.managementDecision === 'APPROVED' &&
        updated.finalStatus === 'APPROVED',
      '2.5 HR REJECTED recommendation overridden by Management final APPROVED status'
    );
  } catch (e: any) {
    assert(false, '2.5 Late HR review test failed', e.message);
  }

  // =========================================================================
  // Section 3: Audit Trail & Metadata Integrity (Audit Checklist #16)
  // =========================================================================
  console.log('\n--- 3. Audit Trail & Metadata Integrity ---');

  resetState();
  try {
    const auditMeta = {
      ipAddress: '192.168.1.50',
      userAgent: 'Mozilla/5.0 (Audit-Tester)',
    };

    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-12-28',
        endDate: '2026-12-30',
        dayType: 'FULL_DAY',
        reason: 'Audit verification trip',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH,
      auditMeta
    );

    await ApprovalService.submitTeamLeaderDecision(
      req.id,
      { decision: 'APPROVED', comments: 'TL approves' },
      ADMIN_AUTH,
      auditMeta
    );

    await ApprovalService.submitHrDecision(
      req.id,
      { decision: 'APPROVED', comments: 'HR approves' },
      HR_AUTH,
      auditMeta
    );

    await ApprovalService.submitManagementDecision(
      req.id,
      { decision: 'APPROVED', comments: 'Management final ok' },
      MGMT_AUTH,
      auditMeta
    );

    const details = await LeaveRequestService.getLeaveRequestById(req.id, ADMIN_AUTH);
    assert(Boolean(details), '3.1 Details retrieved for audit verification');

    const events = details!.events;
    const submittedEv = events.find((e) => e.eventType === 'SUBMITTED');
    const hrEv = events.find((e) => e.eventType === 'HR_APPROVED');
    const mgmtEv = events.find((e) => e.eventType === 'MANAGEMENT_APPROVED');
    const finalEv = events.find((e) => e.eventType === 'FINAL_STATUS_CHANGED');

    assert(
      Boolean(submittedEv && submittedEv.actorRole === 'EMPLOYEE' && submittedEv.ipAddress === '192.168.1.50'),
      '3.2 SUBMITTED event has correct role and metadata'
    );
    assert(
      Boolean(hrEv && hrEv.actorRole === 'HR' && hrEv.newDecision === 'APPROVED' && hrEv.ipAddress === '192.168.1.50'),
      '3.3 HR_APPROVED event has correct role, decision, and metadata'
    );
    assert(
      Boolean(
        mgmtEv &&
          mgmtEv.actorRole === 'TOP_MANAGEMENT' &&
          mgmtEv.newDecision === 'APPROVED' &&
          mgmtEv.ipAddress === '192.168.1.50'
      ),
      '3.4 MANAGEMENT_APPROVED event has correct role, decision, and metadata'
    );
    assert(
      Boolean(finalEv && finalEv.newDecision === 'APPROVED'),
      '3.5 FINAL_STATUS_CHANGED event is recorded with new decision APPROVED'
    );
  } catch (e: any) {
    assert(false, '3. Audit trail verification failed', e.message);
  }

  // =========================================================================
  // Section 4: Balance Posting Idempotency & Zero-Deduction on Rejection
  // =========================================================================
  console.log('\n--- 4. Balance Posting Idempotency & Rejection Integrity ---');

  resetState();
  try {
    const balancesInitial = await LeaveService.getLeaveBalances({ employeeId: 101, year: 2026 }, EMP_1_AUTH);
    const initialUsed = Number(balancesInitial.find((b) => b.leaveTypeId === 1)?.used || 0);

    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-02',
        endDate: '2026-11-04', // 3 working days
        dayType: 'FULL_DAY',
        reason: 'Project completion rest',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    // Reject via management after TL and HR stages
    await ApprovalService.submitTeamLeaderDecision(
      req.id,
      { decision: 'APPROVED', comments: 'TL approved' },
      ADMIN_AUTH
    );
    await ApprovalService.submitHrDecision(
      req.id,
      { decision: 'APPROVED', comments: 'HR approved' },
      HR_AUTH
    );
    await ApprovalService.submitManagementDecision(
      req.id,
      { decision: 'REJECTED', comments: 'Critical deadline during this week' },
      MGMT_AUTH
    );

    const balancesAfterRejection = await LeaveService.getLeaveBalances({ employeeId: 101, year: 2026 }, EMP_1_AUTH);
    const usedAfterRejection = Number(balancesAfterRejection.find((b) => b.leaveTypeId === 1)?.used || 0);

    assert(
      usedAfterRejection === initialUsed,
      '4.1 Rejected leave request does NOT deduct any days from employee balance'
    );

    // Submit new approved leave for 2 days
    const reqApproved = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-05',
        endDate: '2026-11-06', // 2 working days
        dayType: 'FULL_DAY',
        reason: 'Approved vacation',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    await ApprovalService.submitTeamLeaderDecision(
      reqApproved.id,
      { decision: 'APPROVED', comments: 'TL approved' },
      ADMIN_AUTH
    );
    await ApprovalService.submitHrDecision(
      reqApproved.id,
      { decision: 'APPROVED', comments: 'HR approved' },
      HR_AUTH
    );
    await ApprovalService.submitManagementDecision(
      reqApproved.id,
      { decision: 'APPROVED', comments: 'Approved' },
      MGMT_AUTH
    );

    const balancesAfterApproval = await LeaveService.getLeaveBalances({ employeeId: 101, year: 2026 }, EMP_1_AUTH);
    const usedAfterApproval = Number(balancesAfterApproval.find((b) => b.leaveTypeId === 1)?.used || 0);

    assert(
      usedAfterApproval === initialUsed + 2,
      '4.2 Approved leave request deducts exactly the requested working days (2 days)'
    );

    const transactions = await LeaveService.getLeaveBalanceTransactions({ employeeId: 101 });
    const usedTx = transactions.filter((t) => t.referenceId === String(reqApproved.id));
    assert(
      usedTx.length === 1 && Number(usedTx[0].quantity) === 2,
      '4.3 Exactly one balance transaction record created with correct quantity'
    );
  } catch (e: any) {
    assert(false, '4. Balance integrity test failed', e.message);
  }

  // =========================================================================
  // Section 5: Strict Ownership & Tenant Security (Audit Checklist #8, #9, #10)
  // =========================================================================
  console.log('\n--- 5. Ownership & Authorization Audit ---');

  resetState();
  try {
    const emp1Req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-09',
        endDate: '2026-11-11',
        dayType: 'FULL_DAY',
        reason: 'Emp1 private leave',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    // Employee 2 attempts to view Employee 1's request
    try {
      await LeaveRequestService.getLeaveRequestById(emp1Req.id, EMP_2_AUTH);
      assert(false, '5.1 Employee 2 viewing Employee 1 request succeeded', 'Should have thrown Forbidden');
    } catch (e: any) {
      assert(/Forbidden/i.test(e.message), '5.1 Employee 2 is forbidden from viewing Employee 1 request');
    }

    // Employee 2 attempts to cancel Employee 1's request
    try {
      await LeaveRequestService.cancelLeaveRequest(emp1Req.id, 'Malicious cancel', EMP_2_AUTH);
      assert(false, '5.2 Employee 2 cancelling Employee 1 request succeeded', 'Should have thrown Forbidden');
    } catch (e: any) {
      assert(/Forbidden/i.test(e.message), '5.2 Employee 2 is forbidden from cancelling Employee 1 request');
    }

    // Employee 1 attempts to approve their own request as HR
    try {
      await ApprovalService.submitHrDecision(emp1Req.id, { decision: 'APPROVED' }, EMP_1_AUTH);
      assert(false, '5.3 Employee performing HR approval succeeded', 'Should have thrown Forbidden');
    } catch (e: any) {
      assert(/Forbidden/i.test(e.message), '5.3 Employee is forbidden from submitting HR approvals');
    }

    // Employee 1 attempts to approve their own request as Management
    try {
      await ApprovalService.submitManagementDecision(emp1Req.id, { decision: 'APPROVED' }, EMP_1_AUTH);
      assert(false, '5.4 Employee performing Management approval succeeded', 'Should have thrown Forbidden');
    } catch (e: any) {
      assert(/Forbidden/i.test(e.message), '5.4 Employee is forbidden from submitting Management approvals');
    }
  } catch (e: any) {
    assert(false, '5. Ownership audit failed', e.message);
  }

  // =========================================================================
  // Section 6: Preview Engine Consistency (Audit Checklist #11)
  // =========================================================================
  console.log('\n--- 6. Preview Engine Consistency ---');

  resetState();
  try {
    const preview = await LeaveRequestService.calculatePreview(
      {
        leaveTypeId: 1,
        startDate: '2026-11-16',
        endDate: '2026-11-18',
        dayType: 'FULL_DAY',
        applicationTimestamp: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    assert(
      preview.isValid === true &&
        preview.totalWorkingDays === 3 &&
        preview.classification === 'NORMAL_LEAVE_REQUEST',
      '6.1 Preview calculation is valid and matches expected 3 working days'
    );

    const actual = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-11-16',
        endDate: '2026-11-18',
        dayType: 'FULL_DAY',
        reason: 'Autumn holiday',
        applicationTimestampOverride: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    assert(
      Number(actual.totalDays) === preview.totalWorkingDays &&
        actual.requestClassification === preview.classification,
      '6.2 Submitted leave request exactly matches calculatePreview output'
    );

    // Check that preview now catches date overlap!
    const overlapPreview = await LeaveRequestService.calculatePreview(
      {
        leaveTypeId: 1,
        startDate: '2026-11-17',
        endDate: '2026-11-19',
        dayType: 'FULL_DAY',
        applicationTimestamp: '2026-10-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    assert(
      overlapPreview.isValid === false &&
        overlapPreview.validationErrors.some((e) => /overlap/i.test(e)),
      '6.3 calculatePreview detects and reports date overlaps in real-time'
    );
  } catch (e: any) {
    assert(false, '6. Preview consistency failed', e.message);
  }

  console.log(`\n=== DEEP AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runDeepAuditTests().catch((err) => {
  console.error('Audit run error:', err);
  process.exit(1);
});
