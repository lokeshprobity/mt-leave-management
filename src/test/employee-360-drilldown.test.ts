import assert from 'node:assert/strict';
import { UserService } from '../services/userService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { ApprovalService } from '../services/approvalService.ts';
import { ShiftService } from '../services/shiftService.ts';
import { OvertimeService } from '../services/overtimeService.ts';
import { TeamLeaderRotationService } from '../services/teamLeaderRotationService.ts';
import { AuditService } from '../services/auditService.ts';
import { AuthContext } from '../types/leave.ts';

async function runEmployee360DrilldownTest() {
  console.log('==========================================================');
  console.log('UNIVERSAL EMPLOYEE 360° DRILL-DOWN & MNC AUDIT E2E TEST');
  console.log('==========================================================');

  UserService.resetMemoryStores();
  ShiftService.resetMemoryStores();
  TeamLeaderRotationService.resetMemoryStores();
  LeaveRequestService.resetMemoryStores();

  const superAdminActor: AuthContext = {
    userId: 1,
    username: 'superadmin',
    employeeId: 1,
    employeeCode: 'EMP001',
    role: 'SUPER_ADMIN',
    operationalRole: 'TOP_MANAGEMENT',
    departmentId: 1,
    departmentCode: 'OPS',
  };

  const hrActor: AuthContext = {
    userId: 2,
    username: 'hruser',
    employeeId: 2,
    employeeCode: 'EMP002',
    role: 'HR',
    operationalRole: 'HR',
    departmentId: 2,
    departmentCode: 'HR',
  };

  const mgmtActor: AuthContext = {
    userId: 3,
    username: 'mgmtuser',
    employeeId: 3,
    employeeCode: 'EMP003',
    role: 'TOP_MANAGEMENT',
    operationalRole: 'TOP_MANAGEMENT',
    departmentId: 1,
    departmentCode: 'OPS',
  };

  // 1. Setup Department IMP001, Team Leader MT002, and Employee MT001
  console.log('\n[1] Setting up Department IMP001, Team Leader MT002, and Employee MT001...');
  const dept = await UserService.createDepartment(
    {
      name: 'Maestro Import Operations',
      code: 'IMP001',
      description: 'Import Operations Department',
      isActive: true,
    },
    superAdminActor
  );

  const tlEmp = await UserService.createEmployee(
    {
      employeeCode: 'MT002',
      employeeName: 'Vikram Import Lead',
      officialEmail: 'vikram.mt002@maestro.com',
      departmentId: 'IMP001',
      designationId: 3,
      joiningDate: '2025-01-10',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      initialRole: 'TEAM_LEADER',
    },
    superAdminActor
  );

  const emp = await UserService.createEmployee(
    {
      employeeCode: 'MT001',
      employeeName: 'Test Employee',
      officialEmail: 'test.mt001@maestro.com',
      departmentId: 'IMP001',
      designationId: 5,
      reportingManagerId: 'MT002',
      joiningDate: '2025-02-01',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
    },
    superAdminActor
  );

  const createdUser = await UserService.createUser(
    {
      username: 'test.mt001',
      email: 'test.mt001@maestro.com',
      password: 'Password@123',
      role: 'EMPLOYEE',
      employeeId: 'MT001',
      departmentId: 'IMP001',
    },
    superAdminActor
  );

  const tlActor: AuthContext = {
    userId: tlEmp.userId || tlEmp.id,
    username: 'vikram.mt002',
    employeeId: tlEmp.id,
    employeeCode: 'MT002',
    role: 'TEAM_LEADER',
    operationalRole: 'TEAM_LEADER',
    departmentId: dept.id,
    departmentCode: 'IMP001',
  };

  const empActor: AuthContext = {
    userId: createdUser.id,
    username: createdUser.username,
    employeeId: emp.id,
    employeeCode: 'MT001',
    role: 'EMPLOYEE',
    operationalRole: 'EMPLOYEE',
    departmentId: dept.id,
    departmentCode: 'IMP001',
  };

  await TeamLeaderRotationService.createAssignment(
    {
      teamId: 'IMP001',
      teamLeaderEmployeeId: 'MT002',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      isActive: true,
      remarks: 'MT002 assigned to IMP001',
    },
    superAdminActor
  );

  console.log('  ✓ Authoritative records IMP001, MT001, and MT002 initialized.');

  // 2. Verify Universal Employee 360° Resolution (ID, Name, Selector String)
  console.log('\n[2] Verifying Employee 360° resolves identical authoritative record by Code, Name, and Selector...');
  const profileByCode = await UserService.getCompleteUserProfile({ employeeId: 'MT001' }, superAdminActor);
  const profileByName = await UserService.getCompleteUserProfile({ employeeId: 'Test Employee' }, superAdminActor);
  const profileBySelector = await UserService.getCompleteUserProfile(
    { employeeId: 'MT001 | Test Employee | IMP001 - Maestro Import Operations' },
    superAdminActor
  );
  const profileByUserId = await UserService.getCompleteUserProfile({ userId: createdUser.id }, superAdminActor);

  assert.equal(profileByCode.employeeCode, 'MT001');
  assert.equal(profileByCode.departmentCode, 'IMP001');
  assert.equal(profileByName.employeeCode, 'MT001', 'Resolution by employee name must resolve to MT001');
  assert.equal(profileBySelector.employeeCode, 'MT001', 'Resolution by selector string must resolve to MT001');
  assert.equal(profileByUserId.employeeCode, 'MT001', 'Resolution by userId must resolve to MT001');
  assert.equal(profileByCode.employee?.id, emp.id);
  assert.equal(profileByName.employee?.id, emp.id);
  assert.equal(profileBySelector.employee?.id, emp.id);

  const allMatchingMt001 = await UserService.getAllEmployees({ search: 'MT001' });
  assert.equal(allMatchingMt001.length, 1, 'Employee 360° resolution must never create duplicate employees');
  console.log('  ✓ Code, Name, Selector, and UserId all resolve to the single authoritative Employee 360° record.');

  // 3. Verify Leave Approval History Preservation (HR Reject -> Top Management Approve)
  console.log('\n[3] Verifying complete historical workflow (Submit -> TL Approve -> HR Reject -> Management Approve)...');
  const leaveTypes = await LeaveService.getLeaveTypes();
  const casualLeave = leaveTypes.find((lt) => lt.code === 'CL') || leaveTypes[0];

  await LeaveService.createOrInitBalance(
    {
      employeeId: 'MT001',
      leaveTypeId: casualLeave.id,
      year: 2026,
      allocated: 12,
    },
    superAdminActor
  );

  const leaveReq = await LeaveRequestService.submitLeaveRequest(
    {
      employeeId: 'MT001',
      leaveTypeId: casualLeave.id,
      startDate: '2026-10-12',
      endDate: '2026-10-13',
      dayType: 'FULL_DAY',
      reason: 'Personal family visit',
    },
    empActor
  );

  // Stage 1: Team Leader Approves
  await ApprovalService.submitTeamLeaderDecision(
    leaveReq.id,
    { decision: 'APPROVED', remarks: 'TL approved workload coverage' },
    tlActor
  );

  // Stage 2: HR Rejects (recommends rejection, forwards to Top Management)
  const afterHrReject = await ApprovalService.submitHrDecision(
    leaveReq.id,
    { decision: 'REJECTED', remarks: 'HR notes peak season' },
    hrActor
  );
  assert.equal(afterHrReject.hrDecision, 'REJECTED', 'HR decision must be recorded as REJECTED');
  assert.equal(
    afterHrReject.finalStatus,
    'PENDING',
    'After HR rejection/recommendation, request must still await Top Management final decision'
  );

  // Stage 3: Top Management Approves (overrides HR rejection)
  const afterMgmtApprove = await ApprovalService.submitManagementDecision(
    leaveReq.id,
    { decision: 'APPROVED', remarks: 'Management grants final approval' },
    mgmtActor
  );
  assert.equal(afterMgmtApprove.finalStatus, 'APPROVED', 'Final status must be APPROVED after Top Management approval');
  assert.equal(afterMgmtApprove.hrDecision, 'REJECTED', 'Historical HR decision REJECTED must not be overwritten');
  assert.equal(afterMgmtApprove.managementDecision, 'APPROVED');

  console.log('  ✓ Leave workflow preserves HR rejection history while final status is APPROVED by Top Management.');

  // 4. Add Shift & Overtime and Verify Employee 360° Complete Sections & Audit Trail
  console.log('\n[4] Verifying Shift, Overtime, Unified Timeline, and MNC Audit Trail in Employee 360°...');
  const shifts = await ShiftService.getShifts();
  await ShiftService.assignShiftToEmployee(
    {
      employeeId: 'MT001',
      shiftId: shifts[0].id,
      effectiveFrom: '2026-01-01',
      assignmentReason: 'NEW_JOINING',
      remarks: 'Initial shift for MT001',
    },
    superAdminActor
  );

  const otReq = await OvertimeService.createRequest(
    {
      employeeId: 'MT001',
      otDate: '2026-10-10',
      startTime: '18:00',
      endTime: '20:00',
      reason: 'Shipment documentation',
    },
    empActor
  );
  await OvertimeService.reviewRequest(
    otReq.id,
    { status: 'APPROVED', remarks: 'Approved OT for shipment' },
    hrActor
  );

  const full360 = await UserService.getCompleteUserProfile({ employeeId: 'MT001' }, superAdminActor);
  assert.equal(full360.employeeCode, 'MT001');
  assert.equal(full360.departmentCode, 'IMP001');
  assert.ok(full360.leaveBalances.length >= 1, '360° must include leave balances');
  assert.ok(full360.leaveRequests.length >= 1, '360° must include leave requests');
  assert.ok(
    full360.leaveRequestEvents && full360.leaveRequestEvents.length >= 4,
    '360° must include all 4 leave workflow events (SUBMITTED, TL, HR, MGMT)'
  );
  const eventTypes = full360.leaveRequestEvents.map((e) => e.eventType);
  assert.ok(eventTypes.includes('SUBMITTED'));
  assert.ok(eventTypes.includes('TEAM_LEADER_APPROVED'));
  assert.ok(eventTypes.includes('HR_REJECTED'));
  assert.ok(eventTypes.includes('MANAGEMENT_APPROVED'));

  assert.ok(full360.currentShiftAssignment, '360° must include current shift assignment');
  assert.ok(full360.shiftHistory.length >= 1, '360° must include shift history');
  assert.ok(full360.overtimeRecords && full360.overtimeRecords.length >= 1, '360° must include overtime records');
  assert.equal(full360.overtimeSummary?.approvedHours, 2, '360° overtime summary must reflect 2 approved hours');
  assert.equal(
    full360.teamLeadershipSummary?.currentTeamLeader?.teamLeaderEmployeeCode,
    'MT002',
    '360° must show resolved current Team Leader MT002'
  );
  assert.ok(full360.unifiedTimeline && full360.unifiedTimeline.length >= 5, '360° must include unified timeline');
  assert.ok(full360.auditLogs.length >= 4, '360° must include enriched audit logs');

  // Verify audit log enrichment fields (WHO, ROLE, WHAT, ENTITY, WHEN, BEFORE/AFTER)
  const mgmtAuditLog = full360.auditLogs.find((l) => l.action === 'MANAGEMENT_APPROVED');
  assert.ok(mgmtAuditLog, 'Audit trail must include MANAGEMENT_APPROVED event');
  assert.equal(mgmtAuditLog.actorRole, 'TOP_MANAGEMENT');
  assert.equal(mgmtAuditLog.employeeCode, 'MT001');
  assert.equal(mgmtAuditLog.departmentCode, 'IMP001');
  assert.ok(mgmtAuditLog.createdAt, 'Audit log must have server timestamp');

  console.log('  ✓ Employee 360° sections, approval chain, and MNC audit trail verified.');

  // 5. Verify Role-Based Authorization on Employee 360°
  console.log('\n[5] Verifying Role-Based Authorization on Employee 360°...');
  const self360 = await UserService.getCompleteUserProfile({ employeeId: 'MT001' }, empActor);
  assert.equal(self360.employeeCode, 'MT001', 'Employee can view own 360° profile');

  let forbiddenCaught = false;
  try {
    await UserService.getCompleteUserProfile({ employeeId: 'MT002' }, empActor);
  } catch (err: any) {
    if (err.message?.includes('Forbidden')) {
      forbiddenCaught = true;
    }
  }
  assert.equal(forbiddenCaught, true, 'Normal employee must be forbidden from viewing another employee 360° profile');

  const hrView360 = await UserService.getCompleteUserProfile({ employeeId: 'MT001' }, hrActor);
  assert.equal(hrView360.employeeCode, 'MT001', 'HR can view Employee 360° profile');

  const tlView360 = await UserService.getCompleteUserProfile({ employeeId: 'MT001' }, tlActor);
  assert.equal(tlView360.employeeCode, 'MT001', 'Team Leader can view Employee 360° profile');

  console.log('  ✓ Role-based access control verified.');
  console.log('\nALL EMPLOYEE 360° DRILL-DOWN & MNC AUDIT ASSERTIONS PASSED!');
}

runEmployee360DrilldownTest().catch((err) => {
  console.error('Employee 360° Drill-Down Test Failed:', err);
  process.exit(1);
});
