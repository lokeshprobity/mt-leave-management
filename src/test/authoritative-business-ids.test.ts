import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { UserService } from '../services/userService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { HolidayService } from '../services/holidayService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { TeamLeaderRotationService } from '../services/teamLeaderRotationService.ts';
import { ShiftService } from '../services/shiftService.ts';
import { OvertimeService } from '../services/overtimeService.ts';
import { NotificationService } from '../services/notificationService.ts';
import { ApprovalService } from '../services/approvalService.ts';
import { AuditService } from '../services/auditService.ts';
import { AuthContext } from '../types/leave.ts';

async function runAuthoritativeBusinessIdsTest() {
  console.log('==========================================================');
  console.log('AUTHORITATIVE EMPLOYEE ID & DEPARTMENT ID PROPAGATION TEST');
  console.log('==========================================================');

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

  // Clean up any leftover test entities from previous interrupted test runs
  UserService.resetMemoryStores();
  ShiftService.resetMemoryStores();
  TeamLeaderRotationService.resetMemoryStores();
  LeaveRequestService.resetMemoryStores();

  // ------------------------------------------------------------------
  // 1 & 2. Department created with IMP001 remains IMP001 & Employee created with MT001 remains MT001
  // ------------------------------------------------------------------
  console.log('\n[1 & 2] Creating Department IMP001 and Employee MT001 / Team Leader MT002...');

  const dept = await UserService.createDepartment(
    {
      name: 'Maestro Import Operations',
      code: 'IMP001',
      description: 'Authoritative department IMP001 for E2E verification',
      isActive: true,
    },
    superAdminActor
  );

  assert.equal(dept.code, 'IMP001', 'Department code must remain IMP001');
  assert.equal(dept.departmentCode, 'IMP001', 'Department business departmentCode must equal IMP001');

  const resolvedDeptByCode = UserService.resolveDepartmentRecordSync('IMP001');
  assert.ok(resolvedDeptByCode, 'Department IMP001 must resolve by business code');
  assert.equal(resolvedDeptByCode.code, 'IMP001');
  assert.equal(resolvedDeptByCode.id, dept.id);

  // Create Team Leader employee MT002 in IMP001
  const tlEmployee = await UserService.createEmployee(
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

  assert.equal(tlEmployee.employeeCode, 'MT002', 'Team Leader employeeCode must remain MT002');
  assert.equal(tlEmployee.departmentCode, 'IMP001', 'Team Leader departmentCode must resolve to IMP001');

  // Create Employee MT001 in IMP001
  const emp = await UserService.createEmployee(
    {
      employeeCode: 'MT001',
      employeeName: 'Arjun Maestro Import',
      officialEmail: 'arjun.mt001@maestro.com',
      departmentId: 'IMP001',
      designationId: 5,
      reportingManagerId: 'MT002',
      joiningDate: '2025-02-01',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
    },
    superAdminActor
  );

  assert.equal(emp.employeeCode, 'MT001', 'Employee created with MT001 must remain MT001');
  assert.equal(emp.departmentId, dept.id, 'Employee internal departmentId FK must match IMP001 id');
  assert.equal(emp.departmentCode, 'IMP001', 'Employee business departmentCode must be IMP001');
  assert.equal(emp.teamCode, 'IMP001', 'Employee business teamCode must be IMP001');
  assert.equal(emp.reportingManagerCode, 'MT002', 'Employee reportingManagerCode must resolve to MT002');

  console.log('  ✓ Department IMP001 and Employee MT001 preserved authoritative business IDs.');

  // ------------------------------------------------------------------
  // 3. User created for MT001 resolves to the correct employee without creating a second employee
  // ------------------------------------------------------------------
  console.log('\n[3] Creating User account linked to existing Employee MT001...');

  const employeesBeforeUserCreate = await UserService.getAllEmployees({ search: 'MT001' });
  assert.equal(employeesBeforeUserCreate.length, 1, 'Exactly 1 employee with MT001 should exist before user creation');

  const createdUser = await UserService.createUser(
    {
      username: 'arjun.mt001',
      email: 'arjun.mt001@maestro.com',
      password: 'Password@123',
      role: 'EMPLOYEE',
      employeeId: 'MT001',
      departmentId: 'IMP001',
    },
    superAdminActor
  );

  assert.equal(createdUser.employeeId, emp.id, 'User internal employeeId must link to existing MT001 employee id');
  assert.equal(createdUser.employeeCode, 'MT001', 'User employeeCode must remain MT001');
  assert.equal(createdUser.departmentCode, 'IMP001', 'User departmentCode must remain IMP001');

  const employeesAfterUserCreate = await UserService.getAllEmployees({ search: 'MT001' });
  assert.equal(employeesAfterUserCreate.length, 1, 'Creating User for MT001 must NOT create a duplicate employee record');

  const authenticatedUser = await UserService.authenticateUser('arjun.mt001', 'Password@123');
  assert.ok(authenticatedUser, 'User for MT001 must authenticate');
  assert.equal(authenticatedUser.employeeCode, 'MT001', 'Authenticated user must carry employeeCode MT001');
  assert.equal(authenticatedUser.departmentCode, 'IMP001', 'Authenticated user must carry departmentCode IMP001');

  const mt001Actor: AuthContext = {
    userId: createdUser.id,
    username: createdUser.username,
    employeeId: emp.id,
    employeeCode: 'MT001',
    role: 'EMPLOYEE',
    operationalRole: 'EMPLOYEE',
    departmentId: dept.id,
    departmentCode: 'IMP001',
  };

  console.log('  ✓ User created for MT001 links to existing employee MT001 without duplicate identity.');

  // ------------------------------------------------------------------
  // 6. Department-specific holiday resolution uses actual department IMP001
  // ------------------------------------------------------------------
  console.log('\n[6] Configuring Department Holiday List for IMP001 & verifying resolution...');

  const impHolidayList = await HolidayService.createHolidayList(
    {
      listCode: 'HL-IMP001-2026',
      listName: 'IMP001 Custom Holidays 2026',
      year: 2026,
      departmentId: 'IMP001',
      isDefault: false,
      isActive: true,
    },
    superAdminActor
  );

  assert.equal(impHolidayList.departmentId, dept.id);
  assert.equal(impHolidayList.departmentCode, 'IMP001', 'Holiday list must carry departmentCode IMP001');

  await HolidayService.createHoliday({
    holidayListId: impHolidayList.id,
    holidayName: 'Import Dock Charter Day',
    holidayDate: '2026-11-11',
    departmentId: 'IMP001',
    isOptional: false,
    isActive: true,
  });

  const resolvedHolidayForMt001 = await HolidayService.resolveHolidayListForEmployee(
    'MT001',
    'IMP001',
    '2026-11-11'
  );

  assert.ok(resolvedHolidayForMt001.holidayList, 'Holiday list must resolve for MT001');
  assert.equal(resolvedHolidayForMt001.holidayList.id, impHolidayList.id);
  assert.equal(resolvedHolidayForMt001.holidayList.departmentCode, 'IMP001');

  const workingDaysCalc = await WorkingDaysService.calculateWorkingDays(
    '2026-11-10',
    '2026-11-12',
    'FULL_DAY',
    {
      departmentId: 'IMP001',
      employeeId: 'MT001',
    }
  );
  // 2026-11-10 (Tue), 2026-11-11 (Wed - Holiday for IMP001), 2026-11-12 (Thu) => 2 working days
  assert.equal(workingDaysCalc.holidayDays.length, 1, 'Department holiday on 2026-11-11 must be excluded for MT001 in IMP001');
  assert.equal(workingDaysCalc.totalDays, 2);

  console.log('  ✓ Department-specific holiday & working-days resolution verified for MT001 / IMP001.');

  // ------------------------------------------------------------------
  // 7. Team Leader resolution uses actual employee/team (MT002 / IMP001)
  // ------------------------------------------------------------------
  console.log('\n[7] Configuring Team Leader assignment for IMP001 with MT002...');

  const tlAssignment = await TeamLeaderRotationService.createAssignment(
    {
      teamId: 'IMP001',
      teamLeaderEmployeeId: 'MT002',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      isActive: true,
      remarks: 'MT002 leads IMP001',
    },
    superAdminActor
  );

  assert.equal(tlAssignment.teamId, dept.id);
  assert.equal(tlAssignment.teamCode, 'IMP001', 'Team Leader assignment must carry teamCode IMP001');
  assert.equal(tlAssignment.teamLeaderEmployeeCode, 'MT002', 'Team Leader assignment must carry teamLeaderEmployeeCode MT002');

  const resolvedTl = await TeamLeaderRotationService.resolveTeamLeaderForEmployee(
    'MT001',
    '2026-11-10'
  );
  assert.ok(resolvedTl, 'Resolved Team Leader context must exist for MT001');
  assert.equal(resolvedTl.teamId, dept.id);
  assert.equal(resolvedTl.teamCode, 'IMP001', 'Resolved Team Leader context must carry teamCode IMP001');
  assert.equal(resolvedTl.teamLeaderEmployeeId, tlEmployee.id);
  assert.equal(resolvedTl.teamLeaderEmployeeCode, 'MT002', 'Resolved active Team Leader must carry employeeCode MT002');

  console.log('  ✓ Team Leader resolution verified for MT001 -> IMP001 -> MT002.');

  // ------------------------------------------------------------------
  // 4 & 5. Leave Balance & Leave Request for MT001 resolve actual employee & department IMP001
  // ------------------------------------------------------------------
  console.log('\n[4 & 5] Allocating Leave Balance & Submitting Leave Request for MT001...');

  const leaveTypes = await LeaveService.getLeaveTypes();
  const casualLeave = leaveTypes.find((lt) => lt.code === 'CL') || leaveTypes[0];
  assert.ok(casualLeave, 'At least one leave type must exist');

  const allocatedBalance = await LeaveService.createOrInitBalance(
    {
      employeeId: 'MT001',
      leaveTypeId: casualLeave.id,
      year: 2026,
      allocated: 12,
    },
    superAdminActor
  );

  assert.equal(allocatedBalance.employeeId, emp.id);
  assert.equal(allocatedBalance.employeeCode, 'MT001', 'Leave balance must carry employeeCode MT001');
  assert.equal(allocatedBalance.departmentCode, 'IMP001', 'Leave balance must carry departmentCode IMP001');

  const createdLeave = await LeaveRequestService.submitLeaveRequest(
    {
      employeeId: 'MT001',
      leaveTypeId: casualLeave.id,
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      dayType: 'FULL_DAY',
      reason: 'Family event in Chennai',
    },
    mt001Actor
  );

  assert.equal(createdLeave.employeeId, emp.id);
  assert.equal(createdLeave.employeeCode, 'MT001', 'Leave request must carry authoritative employeeCode MT001');
  assert.equal(createdLeave.departmentId, dept.id);
  assert.equal(createdLeave.departmentCode, 'IMP001', 'Leave request must carry authoritative departmentCode IMP001');
  assert.equal(Number(createdLeave.totalDays), 2, 'Leave request totalDays must exclude IMP001 holiday on 2026-11-11');
  assert.equal(createdLeave.assignedTeamLeaderId, tlEmployee.id);

  const approvalHistory = await ApprovalService.getEmployeeApprovalHistory('MT001', superAdminActor);
  assert.equal(approvalHistory.employeeCode, 'MT001', 'Approval history must preserve employeeCode MT001');
  assert.equal(approvalHistory.departmentCode, 'IMP001', 'Approval history must preserve departmentCode IMP001');

  console.log('  ✓ Leave balance, leave request, and approval history verified for MT001 / IMP001.');

  // ------------------------------------------------------------------
  // 8. Shift / Schedule resolution uses the correct employee MT001 and department IMP001
  // ------------------------------------------------------------------
  console.log('\n[8] Assigning Shift & resolving My Schedule for MT001...');

  const shifts = await ShiftService.getShifts();
  const targetShift = shifts[0];
  assert.ok(targetShift, 'At least one shift must exist');

  const shiftAssignment = await ShiftService.assignShiftToEmployee(
    {
      employeeId: 'MT001',
      shiftId: targetShift.id,
      effectiveFrom: '2026-01-01',
      assignmentReason: 'DEPARTMENT_REQUIREMENT',
      remarks: 'Shift assigned to MT001',
    },
    superAdminActor
  );

  assert.equal(shiftAssignment.employeeId, emp.id);
  assert.equal(shiftAssignment.employeeCode, 'MT001', 'Shift assignment must preserve employeeCode MT001');
  assert.equal(shiftAssignment.departmentCode, 'IMP001', 'Shift assignment must preserve departmentCode IMP001');

  const scheduleDayWork = await ShiftService.resolveEmployeeSchedule('MT001', '2026-11-10');
  assert.equal(scheduleDayWork.isWorkingDay, true);
  assert.equal(scheduleDayWork.shiftId, targetShift.id);

  const scheduleDayHoliday = await ShiftService.resolveEmployeeSchedule('MT001', '2026-11-11');
  assert.equal(scheduleDayHoliday.isHoliday, true, 'Schedule for MT001 on 2026-11-11 must recognize IMP001 holiday');

  console.log('  ✓ Shift assignment & schedule resolution verified for MT001 / IMP001.');

  // ------------------------------------------------------------------
  // 9. Overtime uses the correct employee MT001 and department IMP001
  // ------------------------------------------------------------------
  console.log('\n[9] Creating & querying Overtime request for MT001...');

  const otRequest = await OvertimeService.createRequest(
    {
      employeeId: 'MT001',
      otDate: '2026-11-10',
      startTime: '18:30',
      endTime: '20:30',
      reason: 'Urgent vessel manifest clearance',
      notes: 'Handled import container batch',
    },
    mt001Actor
  );

  assert.equal(otRequest.employeeId, emp.id);
  assert.equal(otRequest.employeeCode, 'MT001', 'Overtime request must preserve employeeCode MT001');
  assert.equal(otRequest.departmentId, dept.id);
  assert.equal(otRequest.departmentCode, 'IMP001', 'Overtime request must preserve departmentCode IMP001');

  const fetchedOt = await OvertimeService.getRequests({
    employeeId: 'MT001',
    departmentId: 'IMP001',
  });
  assert.ok(fetchedOt.some((r) => r.id === otRequest.id && r.employeeCode === 'MT001' && r.departmentCode === 'IMP001'));

  console.log('  ✓ Overtime request creation & filtering verified for MT001 / IMP001.');

  // ------------------------------------------------------------------
  // 10. Notifications resolve the correct employee/user
  // ------------------------------------------------------------------
  console.log('\n[10] Verifying Notification resolution for MT001...');

  const mt001NotifResult = await NotificationService.getNotificationsForUser(mt001Actor);
  assert.ok(mt001NotifResult.notifications.length > 0, 'MT001 must receive notifications (leave submitted / shift assigned)');
  assert.ok(
    mt001NotifResult.notifications.every(
      (n) => n.recipientEmployeeCode === 'MT001' || n.recipientEmployeeId === emp.id
    ),
    'All notifications retrieved for MT001 must resolve to MT001'
  );

  console.log('  ✓ Notifications resolution verified for MT001.');

  // ------------------------------------------------------------------
  // 11. Audit records preserve the correct business Employee ID (MT001) & Department ID (IMP001)
  // ------------------------------------------------------------------
  console.log('\n[11] Verifying Audit Log metadata preserves MT001 & IMP001...');

  const allLogs = await AuditService.getLogs({ limit: 100 });
  const mt001Logs = allLogs.filter(
    (log) =>
      log.metadata?.employeeCode === 'MT001' ||
      log.metadata?.newEmployeeCode === 'MT001'
  );
  assert.ok(mt001Logs.length >= 3, 'Audit logs must preserve employeeCode MT001 across employee, leave, shift, and OT events');

  const imp001Logs = allLogs.filter(
    (log) =>
      log.metadata?.departmentCode === 'IMP001' ||
      log.metadata?.code === 'IMP001' ||
      log.metadata?.teamCode === 'IMP001'
  );
  assert.ok(imp001Logs.length >= 3, 'Audit logs must preserve departmentCode IMP001 across department, employee, holiday, and TL events');

  console.log('  ✓ Audit records verified for authoritative MT001 and IMP001.');

  // Clean up test artifacts from .test.json files
  for (const file of ['roles_and_users.test.json', 'team_leader_rotation.test.json']) {
    const p = path.resolve('uploads', 'metadata', file);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
  }

  console.log('\nALL 11 AUTHORITATIVE EMPLOYEE ID & DEPARTMENT ID E2E ASSERTIONS PASSED!');
}

runAuthoritativeBusinessIdsTest().catch((err) => {
  console.error('Authoritative Business IDs E2E Test Failed:', err);
  process.exit(1);
});
