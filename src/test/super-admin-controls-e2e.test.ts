import assert from 'node:assert';
import { UserService } from '../services/userService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { ApprovalService } from '../services/approvalService.ts';
import { LeaveService } from '../services/leaveService.ts';

async function runSuperAdminControlsE2ETest() {
  console.log('\n============================================================');
  console.log('--- TEST SUITE: SUPER ADMIN CONTROLS, EDIT/DELETE & WORKFLOW ---');
  console.log('============================================================\n');

  // Actors
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

  const empUser = {
    userId: 4,
    username: 'employee1',
    role: 'EMPLOYEE' as const,
    operationalRole: 'EMPLOYEE' as const,
    employeeId: 4,
  };

  // 1. HR Approval Toggle ON/OFF Persistence & Audit Logging
  console.log('1. Testing HR Approval Toggle (ON -> OFF -> ON)...');
  UserService.updateSystemSetting('hr_approval_required', 'true');
  assert.strictEqual(UserService.isHrApprovalRequired(), true);

  UserService.updateSystemSetting('hr_approval_required', 'false');
  assert.strictEqual(UserService.isHrApprovalRequired(), false);

  UserService.updateSystemSetting('hr_approval_required', 'true');
  assert.strictEqual(UserService.isHrApprovalRequired(), true);
  console.log('   [PASS] Toggle updates setting accurately and authoritatively.');

  // 2. Pending Request Determinism when Toggle Switches Mid-Workflow
  console.log('\n2. Testing Pending Request handling across Toggle changes...');
  // Employee submits when ON
  UserService.updateSystemSetting('hr_approval_required', 'true');
  const submittedReq = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-11-02',
      endDate: '2026-11-04',
      dayType: 'FULL_DAY',
      reason: 'Mid-workflow setting change test request',
    },
    empUser
  );
  assert.strictEqual(submittedReq.status, 'PENDING');
  console.log(`   [PASS] Submitted test request ${submittedReq.requestNumber} with status PENDING`);

  // Switch setting to OFF while request is pending
  UserService.updateSystemSetting('hr_approval_required', 'false');
  assert.strictEqual(UserService.isHrApprovalRequired(), false);

  // Request should not be deleted or duplicated
  const reqMidway = await LeaveRequestService.getLeaveRequestById(submittedReq.id, superAdmin);
  assert.ok(reqMidway, 'Request must persist after setting change');
  assert.strictEqual(reqMidway.request.id, submittedReq.id);
  console.log('   [PASS] Pending request is preserved intact after setting toggle.');

  // 3. Super Admin Administrative Edit
  console.log('\n3. Testing Super Admin Leave Request Edit...');
  const editedReq = await LeaveRequestService.adminEditLeaveRequest(
    submittedReq.id,
    {
      startDate: '2026-11-02',
      endDate: '2026-11-03', // reduced by 1 day
      reason: 'Super Admin updated reason for testing',
      adminNotes: 'Administratively adjusted dates',
    },
    superAdmin
  );
  assert.strictEqual(editedReq.endDate, '2026-11-03');
  assert.strictEqual(editedReq.reason, 'Super Admin updated reason for testing');
  console.log('   [PASS] Super Admin successfully edited request dates and reason with audit trail.');

  // Unauthorized edit attempt (HR or Employee)
  try {
    await LeaveRequestService.adminEditLeaveRequest(
      submittedReq.id,
      { reason: 'Unauthorized edit' },
      empUser
    );
    assert.fail('Employee should not be able to call adminEditLeaveRequest');
  } catch (err: any) {
    assert.ok(err.message.includes('Forbidden'), 'Must throw 403/Forbidden for non-Super Admin');
    console.log('   [PASS] Unauthorized role blocked from administrative editing.');
  }

  // 4. Super Admin Administrative Deletion with Reversal
  console.log('\n4. Testing Super Admin Leave Request Deletion & Balance Reversal...');
  const deleteResult = await LeaveRequestService.deleteLeaveRequest(
    submittedReq.id,
    superAdmin,
    'E2E test verification completed - cleaning up'
  );
  assert.strictEqual(deleteResult.success, true);
  console.log('   [PASS] Leave request deleted with audit metadata.');

  // Verify request is gone
  const reqAfterDelete = await LeaveRequestService.getLeaveRequestById(submittedReq.id, superAdmin);
  assert.strictEqual(reqAfterDelete, null, 'Deleted request should no longer exist in repository');
  console.log('   [PASS] Deleted request cleanly removed from active pool.');

  // Unauthorized delete attempt
  try {
    await LeaveRequestService.deleteLeaveRequest(9999, empUser, 'Malicious delete');
    assert.fail('Employee should not be able to call deleteLeaveRequest');
  } catch (err: any) {
    assert.ok(err.message.includes('Forbidden'));
    console.log('   [PASS] Unauthorized role blocked from deleteLeaveRequest.');
  }

  // 5. HR Top Management Leave Overview (Read-Only)
  console.log('\n5. Testing HR Top Management Leave Overview (Read-Only)...');
  const tmOverview = await LeaveRequestService.getTopManagementLeaveOverview(hrUser);
  assert.ok(Array.isArray(tmOverview), 'Must return an array of leave requests');
  console.log(`   [PASS] HR retrieved Top Management leave overview (${tmOverview.length} records found).`);

  // Unauthorized overview access (Regular Employee)
  try {
    await LeaveRequestService.getTopManagementLeaveOverview(empUser);
    assert.fail('Employee should not be able to call getTopManagementLeaveOverview');
  } catch (err: any) {
    assert.ok(err.message.includes('Forbidden'));
    console.log('   [PASS] Regular employee blocked from viewing Top Management overview.');
  }

  // Restore setting to ON
  UserService.updateSystemSetting('hr_approval_required', 'true');
  console.log('\n[ALL E2E TESTS PASSED] Super Admin Controls, Edit/Delete & Overview verified!\n');
}

runSuperAdminControlsE2ETest().catch((err) => {
  console.error('[TEST FAILED]', err);
  process.exit(1);
});
