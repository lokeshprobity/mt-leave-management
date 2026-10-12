import assert from 'node:assert';
import { UserService } from '../services/userService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { ApprovalService } from '../services/approvalService.ts';

async function runHrWorkflowToggleSuite() {
  console.log('\n============================================================');
  console.log('--- TEST SUITE: HR APPROVAL REQUIRED ON/OFF WORKFLOW ---');
  console.log('============================================================\n');

  UserService.resetMemoryStores({ preservePersistedMedia: true });

  const superAdminActor = {
    userId: 1,
    username: 'superadmin',
    role: 'SUPER_ADMIN' as const,
    operationalRole: 'TOP_MANAGEMENT' as const,
  };

  const hrActor = {
    userId: 2,
    username: 'hruser',
    role: 'HR' as const,
    operationalRole: 'HR' as const,
    employeeId: 2,
  };

  const empActor = {
    userId: 4,
    username: 'employee1',
    role: 'EMPLOYEE' as const,
    operationalRole: 'EMPLOYEE' as const,
    employeeId: 4,
  };

  // 1. Initial State / Default: ON
  console.log('1. Verifying default setting state...');
  UserService.updateSystemSetting('hr_approval_required', 'true');
  assert.strictEqual(UserService.isHrApprovalRequired(), true, 'Default setting must be ON (true)');
  console.log('   [PASS] hr_approval_required defaults to ON (true)');

  // 2. Resolve Applicant Workflow when ON
  console.log('2. Workflow routing when ON (Applicant -> TL -> HR -> Top Mgmt)...');
  const wfOn = await LeaveRequestService.resolveApplicantWorkflow(4, empActor, '2026-07-01');
  assert.strictEqual(wfOn.initialTlDecision, 'PENDING', 'Team Leader stage must be PENDING');
  assert.strictEqual(wfOn.initialHrDecision, 'PENDING', 'HR stage must be PENDING when ON');
  assert.strictEqual(wfOn.initialStageLabel, 'Pending Team Leader');
  console.log('   [PASS] Regular employee request initializes with HR PENDING when ON');

  // 3. Switch Setting to OFF
  console.log('3. Updating setting to OFF...');
  UserService.updateSystemSetting('hr_approval_required', 'false');
  assert.strictEqual(UserService.isHrApprovalRequired(), false, 'Setting must now be OFF (false)');
  console.log('   [PASS] hr_approval_required successfully switched to OFF (false)');

  // 4. Resolve Applicant Workflow when OFF
  console.log('4. Workflow routing when OFF (Applicant -> TL -> Top Mgmt)...');
  const wfOff = await LeaveRequestService.resolveApplicantWorkflow(4, empActor, '2026-07-01');
  assert.strictEqual(wfOff.initialTlDecision, 'PENDING', 'Team Leader stage must be PENDING');
  assert.strictEqual(wfOff.initialHrDecision, 'NOT_REQUIRED', 'HR stage must be NOT_REQUIRED when OFF');
  assert.strictEqual(wfOff.initialStageLabel, 'Pending Team Leader');
  console.log('   [PASS] Regular employee request initializes with HR NOT_REQUIRED when OFF');

  // 5. HR applicant self-routing safety
  console.log('5. HR applicant routing rules...');
  const hrWfOn = await LeaveRequestService.resolveApplicantWorkflow(2, hrActor, '2026-07-01');
  assert.strictEqual(hrWfOn.initialHrDecision, 'NOT_REQUIRED', 'HR applicant must not recommend own request when ON');
  const hrWfOff = await LeaveRequestService.resolveApplicantWorkflow(2, hrActor, '2026-07-01');
  assert.strictEqual(hrWfOff.initialHrDecision, 'NOT_REQUIRED', 'HR applicant must not recommend own request when OFF');
  console.log('   [PASS] HR applicant self-recommendation strictly excluded');

  // 6. HR queue exclusion when OFF
  console.log('6. HR queue access when OFF...');
  const hrQueue = await ApprovalService.getRequestsForHr({ status: 'PENDING' }, hrActor);
  assert.strictEqual(hrQueue.length, 0, 'No requests should enter HR pending queue when HR approval is OFF');
  console.log('   [PASS] HR pending queue empty when HR approval is OFF');

  // Restore to ON for standard environment
  UserService.updateSystemSetting('hr_approval_required', 'true');
  console.log('\n[ALL TESTS PASSED] HR Approval Required ON/OFF suite completed successfully!\n');
}

runHrWorkflowToggleSuite().catch((err) => {
  console.error('[TEST FAILED]', err);
  process.exit(1);
});
