import express from 'express';
import { registerApiRoutes } from '../../server.ts';
import { UserService } from '../services/userService.ts';
import { ShiftService } from '../services/shiftService.ts';
import { HolidayService } from '../services/holidayService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { AuditService } from '../services/auditService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

async function runTests() {
  console.log('\n==========================================================');
  console.log('🧪 RUNNING SUPER_ADMIN USER PROFILE ACCESS & OPERATE TESTS');
  console.log('==========================================================\n');

  // Reset in-memory state cleanly
  UserService.resetMemoryStores();
  ShiftService.resetMemoryStores();
  HolidayService.resetMemoryHolidays();
  LeaveService.resetMemoryStores();
  LeaveRequestService.resetMemoryStores();
  AuditService.resetMemoryAuditLogs();

  const app = express();
  app.use(express.json());
  registerApiRoutes(app);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  const apiCall = async (
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
    } = {}
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  };

  const superAdminHeaders = {
    'x-user-role': 'SUPER_ADMIN',
    'x-user-id': '1',
    'x-employee-id': '1',
  };

  const employeeHeaders = {
    'x-user-role': 'EMPLOYEE',
    'x-user-id': '4',
    'x-employee-id': '4',
  };

  const teamLeaderHeaders = {
    'x-user-role': 'TEAM_LEADER',
    'x-user-id': '5',
    'x-employee-id': '5',
  };

  const hrHeaders = {
    'x-user-role': 'HR',
    'x-user-id': '2',
    'x-employee-id': '2',
  };

  const topManagementHeaders = {
    'x-user-role': 'TOP_MANAGEMENT',
    'x-user-id': '3',
    'x-employee-id': '3',
  };

  try {
    // ---------------------------------------------------------
    // 1. SUPER_ADMIN can list users and employees
    // ---------------------------------------------------------
    const listUsersRes = await apiCall('/api/users', { headers: superAdminHeaders });
    assert(
      listUsersRes.status === 200 && Array.isArray(listUsersRes.data.users) && listUsersRes.data.users.length >= 5,
      '1a. SUPER_ADMIN can list all users via GET /api/users'
    );

    const listEmpsRes = await apiCall('/api/employees', { headers: superAdminHeaders });
    assert(
      listEmpsRes.status === 200 &&
        Array.isArray(listEmpsRes.data.employees) &&
        listEmpsRes.data.employees.length >= 5,
      '1b. SUPER_ADMIN can list all employees via GET /api/employees'
    );

    // ---------------------------------------------------------
    // 2. SUPER_ADMIN can open any user's complete profile
    // ---------------------------------------------------------
    const openUser4Res = await apiCall('/api/users/4/complete-profile', { headers: superAdminHeaders });
    assert(openUser4Res.status === 200 && openUser4Res.data.success === true, '2a. SUPER_ADMIN can open user #4 complete profile');

    const profile4 = openUser4Res.data.profile;
    assert(
      profile4.user.id === 4 &&
        profile4.user.employeeId === 4 &&
        profile4.user.username === 'alice_emp' &&
        profile4.user.email === 'alice@company.com' &&
        profile4.user.roleName === 'EMPLOYEE' &&
        profile4.user.operationalRole === 'EMPLOYEE' &&
        profile4.employee.employeeCode === 'EMP004' &&
        Array.isArray(profile4.leaveBalances) &&
        Array.isArray(profile4.leaveRequests) &&
        Array.isArray(profile4.shiftHistory) &&
        profile4.effectiveHolidayCalendar !== undefined,
      '2b. Complete profile contains Employee ID, User ID, Name, Username, Email, Role, Operational Role, Department, Designation, Reporting Person, Status, Shift, Holiday List, Joining Date, and Leave Context'
    );

    const openEmp5Res = await apiCall('/api/employees/5/complete-profile', { headers: superAdminHeaders });
    assert(
      openEmp5Res.status === 200 &&
        openEmp5Res.data.profile.user.id === 5 &&
        openEmp5Res.data.profile.employee.id === 5,
      '2c. SUPER_ADMIN can open employee #5 complete profile by employeeId'
    );

    // ---------------------------------------------------------
    // 3. SUPER_ADMIN can edit basic profile fields + audit check
    // ---------------------------------------------------------
    const editBasicRes = await apiCall('/api/users/4/complete-profile', {
      method: 'PUT',
      headers: superAdminHeaders,
      body: {
        fullName: 'Arjun K. Mehta',
        mobile: '+91-9811122233',
        joiningDate: '2024-03-15',
        officeLocation: 'Mumbai CFS Terminal',
        remarks: 'Updated contact and joining info by SUPER_ADMIN',
      },
    });
    assert(
      editBasicRes.status === 200 &&
        editBasicRes.data.profile.user.fullName === 'Arjun K. Mehta' &&
        editBasicRes.data.profile.user.mobile === '+91-9811122233' &&
        editBasicRes.data.profile.user.joiningDate === '2024-03-15' &&
        editBasicRes.data.profile.user.officeLocation === 'Mumbai CFS Terminal',
      '3. SUPER_ADMIN can edit user basic profile fields (name, mobile, joiningDate, officeLocation)'
    );

    // ---------------------------------------------------------
    // 4. SUPER_ADMIN can change administrative assignments:
    //    Department, Designation, Reporting Person, Role, Operational Role,
    //    Shift Assignment (effective-dated), Holiday List Assignment (effective-dated)
    // ---------------------------------------------------------
    // First assign an initial shift GN-2 and holiday list 1 so we can verify before/after history preservation
    const gn2Shift = await ShiftService.getShiftByCode('GN-2');
    const saShift = await ShiftService.getShiftByCode('SA');
    assert(Boolean(gn2Shift && saShift), '4a. Shifts GN-2 and SA exist and are configured');

    await apiCall('/api/users/4/complete-profile', {
      method: 'PUT',
      headers: superAdminHeaders,
      body: {
        departmentId: 5, // Maestro_Import
        shiftAssignment: {
          shiftId: gn2Shift!.id,
          effectiveFrom: '2026-01-01',
          remarks: 'Initial shift GN-2',
        },
        holidayAssignment: {
          holidayListId: 1,
          effectiveFrom: '2026-01-01',
          remarks: 'Initial holiday list 1',
        },
      },
    });

    // Now change Department from Maestro_Import (5) -> Maestro CFS (7),
    // Designation -> Operations Manager (3), Reporting Person -> 3 (John Operations Lead),
    // Shift from GN-2 -> SA (effective 2026-06-01), Holiday List from 1 -> 2 (effective 2026-06-01)
    const adminOperateRes = await apiCall('/api/users/4/complete-profile', {
      method: 'PUT',
      headers: superAdminHeaders,
      body: {
        departmentId: 7, // Maestro CFS
        designationId: 3, // Operations Manager
        reportingManagerId: 3, // John Operations Lead
        reason: 'Administrative transfer to Maestro CFS & shift rotation',
        shiftAssignment: {
          shiftId: saShift!.id,
          effectiveFrom: '2026-06-01',
          remarks: 'Transferred to SA shift',
        },
        holidayAssignment: {
          holidayListId: 2,
          effectiveFrom: '2026-06-01',
          remarks: 'Assigned Maestro_Import / alternate holiday calendar',
        },
      },
    });

    assert(adminOperateRes.status === 200, '4b. SUPER_ADMIN administrative assignment update succeeds');
    const updatedP4 = adminOperateRes.data.profile;
    assert(
      updatedP4.user.departmentId === 7 &&
        updatedP4.user.departmentName === 'Maestro CFS' &&
        updatedP4.user.designationId === 3 &&
        updatedP4.user.reportingManagerId === 3 &&
        updatedP4.user.currentShiftCode === 'SA',
      '4c. Department (Maestro CFS), Designation, Reporting Person, and Shift (SA) updated accurately'
    );

    // Verify historical shift assignment was NOT overwritten/deleted, but auto-closed at 2026-05-31
    const shiftHistory = updatedP4.shiftHistory;
    const closedGn2 = shiftHistory.find((s: any) => s.shiftCode === 'GN-2');
    const activeSa = shiftHistory.find((s: any) => s.shiftCode === 'SA' && s.isActive);
    assert(
      Boolean(closedGn2 && closedGn2.effectiveTo === '2026-05-31' && activeSa && activeSa.effectiveFrom === '2026-06-01'),
      '4d. Effective-dated shift assignment preserves historical record (GN-2 closed on 2026-05-31, SA active from 2026-06-01)'
    );

    // Verify historical holiday assignment was preserved
    const holidayHistory = updatedP4.holidayAssignments;
    const closedHol1 = holidayHistory.find((h: any) => h.holidayListId === 1);
    const activeHol2 = holidayHistory.find((h: any) => h.holidayListId === 2 && h.isActive);
    assert(
      Boolean(closedHol1 && closedHol1.effectiveTo === '2026-05-31' && activeHol2 && activeHol2.effectiveFrom === '2026-06-01'),
      '4e. Effective-dated holiday list assignment preserves historical record'
    );

    // Restore reportingManagerId of employee 4 back to 5 (Robert Chen TL) & designation to 4 (Software Engineer)
    // so standard approval routing tests can also verify Employee -> Team Leader -> HR -> Top Management
    await apiCall('/api/users/4/complete-profile', {
      method: 'PUT',
      headers: superAdminHeaders,
      body: {
        designationId: 4,
        reportingManagerId: 5,
        role: 'EMPLOYEE',
        operationalRole: 'EMPLOYEE',
      },
    });

    // ---------------------------------------------------------
    // 5. SUPER_ADMIN can suspend / activate / terminate user status
    // ---------------------------------------------------------
    const suspendRes = await apiCall('/api/users/4/complete-profile', {
      method: 'PUT',
      headers: superAdminHeaders,
      body: {
        employmentStatus: 'SUSPENDED',
        reason: 'Temporary administrative suspension',
      },
    });
    assert(
      suspendRes.status === 200 &&
        suspendRes.data.profile.user.employmentStatus === 'SUSPENDED' &&
        suspendRes.data.profile.user.isActive === false,
      '5a. SUPER_ADMIN can suspend user account (Active -> Suspended)'
    );

    const reactivateRes = await apiCall('/api/users/4/complete-profile', {
      method: 'PUT',
      headers: superAdminHeaders,
      body: {
        employmentStatus: 'ACTIVE',
        isActive: true,
        reason: 'Reinstated to active service',
      },
    });
    assert(
      reactivateRes.status === 200 &&
        reactivateRes.data.profile.user.employmentStatus === 'ACTIVE' &&
        reactivateRes.data.profile.user.isActive === true,
      '5b. SUPER_ADMIN can reactivate suspended user account (Suspended -> Active)'
    );

    // ---------------------------------------------------------
    // 6. SUPER_ADMIN can reset user password without seeing password
    // ---------------------------------------------------------
    const resetPwdRes = await apiCall('/api/users/4/reset-password', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { newPassword: 'NewSecureReset@2026' },
    });
    assert(resetPwdRes.status === 200 && resetPwdRes.data.success === true, '6a. SUPER_ADMIN can reset user password');

    // Verify password is NEVER exposed in complete profile response while redacted audit history is preserved
    const checkProfileAfterReset = await apiCall('/api/users/4/complete-profile', {
      headers: superAdminHeaders,
    });
    const serializedProfile = JSON.stringify(checkProfileAfterReset.data);
    const profilePwdAudit = (checkProfileAfterReset.data?.profile?.auditLogs || []).find(
      (l: any) => l.action === 'USER_PASSWORD_RESET'
    );
    assert(
      !serializedProfile.includes('NewSecureReset@2026') &&
        !serializedProfile.includes('passwordHash') &&
        !serializedProfile.includes('hashed_') &&
        Boolean(profilePwdAudit) &&
        JSON.stringify(profilePwdAudit.metadata || {}).includes('[REDACTED]'),
      '6b. User profile response never exposes password or passwordHash while preserving [REDACTED] audit history'
    );

    // Verify user can authenticate with the newly reset password
    const authUser = await UserService.authenticateUser('alice_emp', 'NewSecureReset@2026');
    assert(authUser.id === 4, '6c. User can authenticate with the password reset by SUPER_ADMIN');

    // Restore default password for alice_emp so subsequent test suites or demo logins remain consistent
    await apiCall('/api/users/4/reset-password', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { newPassword: 'Employee@123' },
    });

    // ---------------------------------------------------------
    // 7. Audit verification: actor = SUPER_ADMIN, before/after values,
    //    and NO password leaked in audit logs
    // ---------------------------------------------------------
    const allLogs = await AuditService.getLogs({ limit: 200 });
    const deptChangeLog = allLogs.find(
      (l: any) =>
        l.action === 'USER_UPDATED' &&
        l.actorRole === 'SUPER_ADMIN' &&
        l.metadata?.before?.departmentName === 'Maestro_Import' &&
        l.metadata?.after?.departmentName === 'Maestro CFS'
    );
    assert(
      Boolean(deptChangeLog),
      '7a. Audit log records SUPER_ADMIN department change with before=Maestro_Import and after=Maestro CFS'
    );

    const shiftChangeLog = allLogs.find(
      (l: any) =>
        (l.action === 'SHIFT_ASSIGNED' || l.action === 'EMPLOYEE_SHIFT_ASSIGNED') &&
        l.actorRole === 'SUPER_ADMIN' &&
        (l.metadata?.before === 'GN-2' || l.metadata?.before?.shiftCode === 'GN-2') &&
        (l.metadata?.after === 'SA' || l.metadata?.after?.shiftCode === 'SA')
    );
    assert(
      Boolean(shiftChangeLog),
      '7b. Audit log records SUPER_ADMIN shift change with before=GN-2 and after=SA'
    );

    const statusChangeLog = allLogs.find(
      (l: any) =>
        l.action === 'USER_UPDATED' &&
        l.actorRole === 'SUPER_ADMIN' &&
        l.metadata?.before?.employmentStatus === 'ACTIVE' &&
        l.metadata?.after?.employmentStatus === 'SUSPENDED'
    );
    assert(
      Boolean(statusChangeLog),
      '7c. Audit log records SUPER_ADMIN employment status change with before=ACTIVE and after=SUSPENDED'
    );

    const pwdResetLog = allLogs.find(
      (l: any) => l.action === 'USER_PASSWORD_RESET' && l.actorRole === 'SUPER_ADMIN' && l.targetId === '4'
    );
    const allLogsString = JSON.stringify(allLogs);
    assert(
      Boolean(pwdResetLog) && !allLogsString.includes('NewSecureReset@2026'),
      '7d. Audit log records USER_PASSWORD_RESET by SUPER_ADMIN and NEVER logs the password itself'
    );

    // ---------------------------------------------------------
    // 8. Leave context inside profile & Leave Approval Routing Integrity
    //    Opening/operating a profile as SUPER_ADMIN must NOT make SUPER_ADMIN
    //    the employee's approval stage
    // ---------------------------------------------------------
    const submitLeaveRes = await apiCall('/api/leave-requests', {
      method: 'POST',
      headers: employeeHeaders,
      body: {
        leaveTypeId: 1,
        startDate: '2026-11-16',
        endDate: '2026-11-17',
        dayType: 'FULL_DAY',
        reasonCategory: 'OTHER',
        reason: 'Family event in hometown with sufficient advance notice',
      },
    });
    assert(
      submitLeaveRes.status === 201 &&
        submitLeaveRes.data.leaveRequest.teamLeaderDecision === 'PENDING' &&
        String(submitLeaveRes.data.leaveRequest.approvalStageLabel || '').includes('Team Leader'),
      '8a. Employee leave request routes to Team Leader (Stage 1) and is unaffected by SUPER_ADMIN profile operations'
    );

    const profileWithLeaveRes = await apiCall('/api/users/4/complete-profile', {
      headers: superAdminHeaders,
    });
    const empLeaveReqs = profileWithLeaveRes.data.profile.leaveRequests;
    assert(
      empLeaveReqs.length >= 1 &&
        empLeaveReqs[0].status === 'PENDING' &&
        empLeaveReqs[0].teamLeaderDecision === 'PENDING',
      '8b. SUPER_ADMIN can view employee leave balance, leave applications, status, and current approval stage inside profile'
    );

    // ---------------------------------------------------------
    // 9. Normal EMPLOYEE restrictions (Self-Only Access & No Admin APIs)
    // ---------------------------------------------------------
    // Normal employee CAN open their own profile
    const empSelfProfileRes = await apiCall('/api/users/4/complete-profile', {
      headers: employeeHeaders,
    });
    assert(empSelfProfileRes.status === 200, '9a. Normal EMPLOYEE can open their own profile');

    // Normal employee CANNOT open another employee's profile
    const empOtherUserRes = await apiCall('/api/users/5/complete-profile', {
      headers: employeeHeaders,
    });
    assert(empOtherUserRes.status === 403, '9b. Normal EMPLOYEE cannot open another user profile (403 Forbidden)');

    const empOtherEmpRes = await apiCall('/api/employees/5/complete-profile', {
      headers: employeeHeaders,
    });
    assert(empOtherEmpRes.status === 403, '9c. Normal EMPLOYEE cannot open another employee profile by employeeId (403 Forbidden)');

    // Normal employee CANNOT edit another employee's profile
    const empEditOtherRes = await apiCall('/api/users/5/complete-profile', {
      method: 'PUT',
      headers: employeeHeaders,
      body: { fullName: 'Unauthorized Edit' },
    });
    assert(empEditOtherRes.status === 403, '9d. Normal EMPLOYEE cannot edit another employee profile (403 Forbidden)');

    // Normal employee CANNOT modify their own department/role/status/shift via complete-profile API
    const empEscalateSelfRes = await apiCall('/api/users/4/complete-profile', {
      method: 'PUT',
      headers: employeeHeaders,
      body: { role: 'SUPER_ADMIN', departmentId: 3 },
    });
    assert(empEscalateSelfRes.status === 403, '9e. Normal EMPLOYEE cannot modify administrative fields on their own profile (403 Forbidden)');

    // Normal employee CANNOT call password reset API
    const empResetPwdRes = await apiCall('/api/users/5/reset-password', {
      method: 'POST',
      headers: employeeHeaders,
      body: { newPassword: 'HackedPassword123' },
    });
    assert(empResetPwdRes.status === 403, '9f. Normal EMPLOYEE cannot call SUPER_ADMIN password reset API (403 Forbidden)');

    // ---------------------------------------------------------
    // 10. Existing Team Leader, HR, and Top Management permissions & workflow
    // ---------------------------------------------------------
    const leaveId = submitLeaveRes.data.leaveRequest.id;

    // Stage 1: Team Leader approves
    const tlApproveRes = await apiCall(`/api/team-leader/leave-requests/${leaveId}/decision`, {
      method: 'POST',
      headers: teamLeaderHeaders,
      body: { decision: 'APPROVED', comments: 'Approved by TL' },
    });
    assert(
      tlApproveRes.status === 200 &&
        (tlApproveRes.data.request || tlApproveRes.data.leaveRequest)?.teamLeaderDecision === 'APPROVED' &&
        (tlApproveRes.data.request || tlApproveRes.data.leaveRequest)?.hrDecision === 'PENDING',
      '10a. Team Leader Stage 1 approval works and routes to HR (Stage 2)'
    );

    // Stage 2: HR approves
    const hrApproveRes = await apiCall(`/api/hr/leave-requests/${leaveId}/decision`, {
      method: 'POST',
      headers: hrHeaders,
      body: { decision: 'APPROVED', comments: 'Verified by HR' },
    });
    assert(
      hrApproveRes.status === 200 &&
        (hrApproveRes.data.request || hrApproveRes.data.leaveRequest)?.hrDecision === 'APPROVED' &&
        (hrApproveRes.data.request || hrApproveRes.data.leaveRequest)?.managementDecision === 'PENDING',
      '10b. HR Stage 2 approval works and routes to TOP_MANAGEMENT (Stage 3)'
    );

    // Stage 3: Top Management final approves
    const tmApproveRes = await apiCall(`/api/management/leave-requests/${leaveId}/decision`, {
      method: 'POST',
      headers: topManagementHeaders,
      body: { decision: 'APPROVED', comments: 'Final approval by Top Management' },
    });
    assert(
      tmApproveRes.status === 200 &&
        (tmApproveRes.data.request || tmApproveRes.data.leaveRequest)?.status === 'APPROVED',
      '10c. Top Management Stage 3 final approval completes leave workflow'
    );

    console.log('\n🎉 ALL SUPER_ADMIN PROFILE ACCESS & OPERATE TESTS PASSED!\n');
  } finally {
    server.close();
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
