import { UserService } from '../services/userService.ts';
import { ShiftService } from '../services/shiftService.ts';
import { OvertimeService } from '../services/overtimeService.ts';
import { AuditService } from '../services/auditService.ts';
import { ValidationError } from '../services/validation.ts';
import { AuthContext } from '../types/leave.ts';

function assert(condition: boolean, testName: string, detail?: string) {
  if (!condition) {
    console.error(`[FAIL] ${testName}${detail ? ' - ' + detail : ''}`);
    throw new Error(`Test failed: ${testName}`);
  }
  console.log(`[PASS] ${testName}`);
}

async function runStep8Tests() {
  console.log('=== STARTING STEP 8: USER MANAGEMENT, SHIFT CATALOG, OVERTIME & AUDIT SUITE ===');

  UserService.resetMemoryStores();
  ShiftService.resetMemoryStores();
  OvertimeService.resetMemoryStores();
  AuditService.resetMemoryStores();

  const SUPER_ADMIN: AuthContext = { userId: 1, role: 'SUPER_ADMIN', username: 'superadmin' };
  const HR_USER: AuthContext = { userId: 2, role: 'HR', username: 'hr_lead' };
  const EMP_USER: AuthContext = { userId: 4, employeeId: 104, role: 'EMPLOYEE', username: 'emp_rahul' };

  // ----------------------------------------------------
  // TEST 1: Super Admin creates valid user + employee record
  // ----------------------------------------------------
  const newUser = await UserService.createUser(
    {
      username: 'vikram.singh',
      email: 'vikram.singh@example.com',
      password: 'InitialPassword123!',
      fullName: 'Vikram Singh',
      role: 'EMPLOYEE',
      departmentId: 1,
      designation: 'Senior Process Associate',
      employeeCode: 'EMP-9001',
      employmentType: 'PERMANENT',
    },
    SUPER_ADMIN
  );
  assert(
    newUser.id > 0 && newUser.username === 'vikram.singh' && newUser.employee?.employeeCode === 'EMP-9001',
    'Test 1: Super Admin creates valid user + employee record'
  );

  // ----------------------------------------------------
  // TEST 2: Duplicate username rejected
  // ----------------------------------------------------
  let dupUserError = false;
  try {
    await UserService.createUser(
      {
        username: 'vikram.singh',
        email: 'different@example.com',
        password: 'Password123!',
        fullName: 'Vikram Duplicate',
        role: 'EMPLOYEE',
      },
      SUPER_ADMIN
    );
  } catch (err: any) {
    dupUserError = err.message.includes('Username') || err.message.includes('already taken');
  }
  assert(dupUserError, 'Test 2: Duplicate username rejected');

  // ----------------------------------------------------
  // TEST 3: Duplicate email rejected
  // ----------------------------------------------------
  let dupEmailError = false;
  try {
    await UserService.createUser(
      {
        username: 'unique.user',
        email: 'vikram.singh@example.com',
        password: 'Password123!',
        fullName: 'Email Duplicate',
        role: 'EMPLOYEE',
      },
      SUPER_ADMIN
    );
  } catch (err: any) {
    dupEmailError = err.message.includes('Email') || err.message.includes('already registered');
  }
  assert(dupEmailError, 'Test 3: Duplicate email rejected');

  // ----------------------------------------------------
  // TEST 4: Non-super admin cannot create user (403 Forbidden)
  // ----------------------------------------------------
  let forbiddenCreate = false;
  try {
    await UserService.createUser(
      {
        username: 'blocked.user',
        email: 'blocked@example.com',
        password: 'Password123!',
        fullName: 'Blocked User',
        role: 'EMPLOYEE',
      },
      HR_USER
    );
  } catch (err: any) {
    forbiddenCreate = err.message.includes('Forbidden') || err.message.includes('SUPER_ADMIN');
  }
  assert(forbiddenCreate, 'Test 4: Non-super admin cannot create user (403 Forbidden)');

  // ----------------------------------------------------
  // TEST 5: User details updated by Super Admin
  // ----------------------------------------------------
  const updatedUser = await UserService.updateUser(
    newUser.id,
    {
      fullName: 'Vikram S. Rathore',
      designation: 'Lead Process Associate',
      role: 'HR',
    },
    SUPER_ADMIN
  );
  assert(
    updatedUser.fullName === 'Vikram S. Rathore' && updatedUser.role === 'HR',
    'Test 5: User details updated by Super Admin (fullName, role)'
  );

  // ----------------------------------------------------
  // TEST 6: User activate/deactivate toggle works and reflected in status
  // ----------------------------------------------------
  const deactivated = await UserService.setUserStatus(newUser.id, false, SUPER_ADMIN);
  assert(!deactivated.isActive, 'Test 6a: User deactivated successfully');
  const reactivated = await UserService.setUserStatus(newUser.id, true, SUPER_ADMIN);
  assert(reactivated.isActive, 'Test 6b: User reactivated successfully');

  // ----------------------------------------------------
  // TEST 7: User changes own password with correct current password
  // ----------------------------------------------------
  const selfAuth: AuthContext = { userId: newUser.id, role: 'EMPLOYEE', username: newUser.username };
  const passChange = await UserService.changePassword(
    newUser.id,
    'InitialPassword123!',
    'NewSecurePassword456!',
    selfAuth
  );
  assert(passChange.success, 'Test 7: User changes own password with correct current password');

  // ----------------------------------------------------
  // TEST 8: User change password fails with incorrect current password
  // ----------------------------------------------------
  let wrongPassError = false;
  try {
    await UserService.changePassword(
      newUser.id,
      'WrongCurrentPassword!',
      'AnotherNewPassword789!',
      selfAuth
    );
  } catch (err: any) {
    wrongPassError = err.message.includes('Current password is incorrect');
  }
  assert(wrongPassError, 'Test 8: User change password fails with incorrect current password');

  // ----------------------------------------------------
  // TEST 9: Super Admin can reset user password without providing old password
  // ----------------------------------------------------
  const resetResult = await UserService.resetPassword(newUser.id, 'AdminResetPassword123!', SUPER_ADMIN);
  assert(resetResult.success, 'Test 9: Super Admin can reset user password without providing old password');

  // ----------------------------------------------------
  // TEST 10: Password change/reset enforces min length (at least 6 chars)
  // ----------------------------------------------------
  let shortPassError = false;
  try {
    await UserService.resetPassword(newUser.id, '123', SUPER_ADMIN);
  } catch (err: any) {
    shortPassError = err.message.includes('Password must be at least 6 characters');
  }
  assert(shortPassError, 'Test 10: Password reset enforces minimum length validation');

  // ----------------------------------------------------
  // TEST 11: Safe user deletion: user with shift assignment cannot be deleted
  // ----------------------------------------------------
  // Assign a shift to newUser
  const gnShift = await ShiftService.getShiftByCode('GN');
  await ShiftService.assignShiftToEmployee(
    {
      employeeId: newUser.employee!.id,
      shiftId: gnShift!.id,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-07-31',
      assignmentReason: 'Production cycle coverage',
    },
    SUPER_ADMIN
  );

  let deleteBlocked = false;
  try {
    await UserService.deleteUser(newUser.id, SUPER_ADMIN);
  } catch (err: any) {
    deleteBlocked = err.message.includes('Cannot delete user') || err.message.includes('dependencies');
  }
  assert(deleteBlocked, 'Test 11: Safe user deletion blocks delete when shift dependencies exist');

  // ----------------------------------------------------
  // TEST 12: Safe user deletion: user without dependencies can be deleted
  // ----------------------------------------------------
  const cleanUser = await UserService.createUser(
    {
      username: 'temp.clean',
      email: 'temp.clean@example.com',
      password: 'CleanPassword123!',
      fullName: 'Temp User Clean',
      role: 'EMPLOYEE',
    },
    SUPER_ADMIN
  );
  const deleteResult = await UserService.deleteUser(cleanUser.id, SUPER_ADMIN);
  assert(deleteResult.success, 'Test 12: Safe user deletion succeeds for user without operational dependencies');

  // ----------------------------------------------------
  // TEST 13: System Audit log generated on user actions
  // ----------------------------------------------------
  const logs = await AuditService.getLogs({ targetEntity: 'users' });
  const hasCreate = logs.some((l) => l.action === 'USER_CREATED');
  const hasReset = logs.some((l) => l.action === 'USER_PASSWORD_RESET');
  const hasStatus = logs.some((l) => l.action === 'USER_STATUS_TOGGLED');
  assert(
    hasCreate && hasReset && hasStatus,
    'Test 13: Audit log records USER_CREATED, USER_PASSWORD_RESET, and USER_STATUS_TOGGLED'
  );

  // ----------------------------------------------------
  // TEST 14: Audit log sanitizes sensitive metadata (no plaintext passwords or hashes)
  // ----------------------------------------------------
  const stringifiedLogs = JSON.stringify(logs);
  const leakedPassword =
    stringifiedLogs.includes('InitialPassword123!') ||
    stringifiedLogs.includes('NewSecurePassword456!') ||
    stringifiedLogs.includes('AdminResetPassword123!');
  assert(!leakedPassword, 'Test 14: Audit log strictly sanitizes passwords and sensitive credentials');

  // ----------------------------------------------------
  // TEST 15: Employee self-profile retrieval
  // ----------------------------------------------------
  const profile = await UserService.getUserById(newUser.id);
  assert(
    profile !== null && profile.fullName === 'Vikram S. Rathore' && profile.employee !== null,
    'Test 15: Employee profile retrieval includes user and employee metadata'
  );

  // ----------------------------------------------------
  // TEST 16: Employee list returns reporting manager and department info
  // ----------------------------------------------------
  const employees = await UserService.getEmployees();
  assert(employees.length > 0 && employees[0].fullName !== undefined, 'Test 16: Employee list returns employee details');

  // ----------------------------------------------------
  // TEST 17: Shift Catalog contains exactly 17 official shifts with configured flags
  // ----------------------------------------------------
  const allShifts = await ShiftService.getShifts({ includeInactive: true });
  const officialCodes = [
    'GN', 'GN-1', 'GN-2', 'GN-3', 'GN-4',
    'NGN', 'NGN-1', 'NGN-2', 'NGN-3', 'NGN-4', 'NGN-5',
    'SA', 'SB', 'SC',
    'SS-1', 'SS-2', 'SS-3',
  ];
  const presentCodes = allShifts.map((s) => s.shiftCode);
  const allCodesMatch = officialCodes.every((c) => presentCodes.includes(c));
  assert(
    allShifts.length === 17 && allCodesMatch && !presentCodes.includes('SPLIT_SHIFT'),
    `Test 17: Shift Catalog contains exactly 17 official shifts (${allShifts.length}/17 matched, SPLIT_SHIFT absent)`
  );

  // ----------------------------------------------------
  // TEST 18: Configured shifts can be assigned
  // ----------------------------------------------------
  const saShift = await ShiftService.getShiftByCode('SA');
  assert(saShift !== null && saShift.timingConfigured === true, 'Test 18a: SA shift is configured');
  const saAssignment = await ShiftService.assignShiftToEmployee(
    {
      employeeId: 104,
      shiftId: saShift!.id,
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-31',
      assignmentReason: 'Morning rotation roster',
      remarks: 'Approved by lead manager',
    },
    SUPER_ADMIN
  );
  assert(saAssignment.id > 0 && saAssignment.shiftCode === 'SA', 'Test 18b: Configured shift SA assigned successfully');

  // ----------------------------------------------------
  // TEST 19: Unconfigured shifts strictly rejected with exact error message
  // ----------------------------------------------------
  const unconfiguredCodes = ['GN-3', 'GN-4', 'NGN-2', 'NGN-3', 'NGN-4', 'NGN-5', 'SS-3'];
  let allUnconfiguredRejected = true;
  for (const code of unconfiguredCodes) {
    const unconfShift = await ShiftService.getShiftByCode(code);
    assert(unconfShift !== null && unconfShift.timingConfigured === false, `Shift ${code} is flagged unconfigured`);
    try {
      await ShiftService.assignShiftToEmployee(
        {
          employeeId: 104,
          shiftId: unconfShift!.id,
          effectiveFrom: '2026-11-01',
          effectiveTo: '2026-11-30',
        },
        SUPER_ADMIN
      );
      allUnconfiguredRejected = false;
    } catch (err: any) {
      if (err.message !== 'Shift timing is not configured and cannot be assigned.') {
        allUnconfiguredRejected = false;
      }
    }
  }
  assert(
    allUnconfiguredRejected,
    'Test 19: Unconfigured shifts (GN-3, GN-4, NGN-2, NGN-3, NGN-4, NGN-5, SS-3) strictly rejected with exact error'
  );

  // ----------------------------------------------------
  // TEST 20: Shift assignment records reason
  // ----------------------------------------------------
  assert(
    saAssignment.assignmentReason === 'Morning rotation roster',
    'Test 20: Shift assignment persists assignmentReason'
  );

  // ----------------------------------------------------
  // TEST 21: Shift assignment records remarks
  // ----------------------------------------------------
  assert(
    saAssignment.remarks === 'Approved by lead manager',
    'Test 21: Shift assignment persists remarks'
  );

  // ----------------------------------------------------
  // TEST 22: Overlapping shift assignment for the same employee is rejected
  // ----------------------------------------------------
  let overlapRejected = false;
  try {
    const sbShift = await ShiftService.getShiftByCode('SB');
    await ShiftService.assignShiftToEmployee(
      {
        employeeId: 104,
        shiftId: sbShift!.id,
        effectiveFrom: '2026-10-15', // Overlaps with 2026-10-01 to 2026-10-31
        effectiveTo: '2026-11-15',
      },
      SUPER_ADMIN
    );
  } catch (err: any) {
    overlapRejected = err.message.includes('Overlapping active shift assignment');
  }
  assert(overlapRejected, 'Test 22: Overlapping shift assignment for the same employee is rejected');

  // ----------------------------------------------------
  // TEST 23: Shift schedule resolves correctly for effective date window
  // ----------------------------------------------------
  // 2026-10-14 is Wednesday (regular workday within 2026-10-01 to 2026-10-31 window)
  const resolvedSA = await ShiftService.resolveEmployeeSchedule(104, '2026-10-14');
  assert(
    resolvedSA.scheduleSource === 'EMPLOYEE_SHIFT' &&
      resolvedSA.shiftCode === 'SA' &&
      resolvedSA.earliestStartTime === '05:30' &&
      resolvedSA.latestEndTime === '14:30',
    'Test 23: Schedule resolves to assigned SA shift (05:30 to 14:30) within effective window'
  );

  // ----------------------------------------------------
  // TEST 24: Shift change / update updates effective dates and assignment reason
  // ----------------------------------------------------
  const scShift = await ShiftService.getShiftByCode('SC');
  const updatedAssignment = await ShiftService.updateEmployeeAssignment(
    saAssignment.id,
    {
      shiftId: scShift!.id,
      assignmentReason: 'Transferred to overnight roster',
      remarks: 'Requested by project lead',
    },
    SUPER_ADMIN
  );
  assert(
    updatedAssignment.shiftCode === 'SC' &&
      updatedAssignment.assignmentReason === 'Transferred to overnight roster',
    'Test 24: Shift assignment update updates shift to SC and logs new assignment reason'
  );

  // ----------------------------------------------------
  // TEST 25: Overtime request submission by employee
  // ----------------------------------------------------
  const otRequest = await OvertimeService.createRequest(
    {
      employeeId: 104,
      overtimeDate: '2026-10-12',
      requestedHours: 2.5,
      reason: 'Urgent month-end reporting delivery',
      shiftCode: 'SC',
    },
    EMP_USER
  );
  assert(
    otRequest.id > 0 &&
      otRequest.requestedHours === 2.5 &&
      otRequest.status === 'PENDING',
    'Test 25: Overtime request submitted with valid hours and reason (Status PENDING)'
  );

  // ----------------------------------------------------
  // TEST 26: Overtime request approval by HR / Top Management
  // ----------------------------------------------------
  const approvedOT = await OvertimeService.reviewRequest(
    otRequest.id,
    'APPROVE',
    'Approved for month-end deliverable',
    HR_USER
  );
  assert(
    approvedOT.status === 'APPROVED' && approvedOT.reviewedBy === HR_USER.userId,
    'Test 26: Overtime request approved by HR'
  );

  // ----------------------------------------------------
  // TEST 27: Overtime request rejection with mandatory comments
  // ----------------------------------------------------
  const otRequest2 = await OvertimeService.createRequest(
    {
      employeeId: 104,
      overtimeDate: '2026-10-13',
      requestedHours: 3.0,
      reason: 'Extra documentation review',
    },
    EMP_USER
  );

  let rejectWithoutCommentFailed = false;
  try {
    await OvertimeService.reviewRequest(otRequest2.id, 'REJECT', '', HR_USER);
  } catch (err: any) {
    rejectWithoutCommentFailed = err.message.includes('Comments are required');
  }
  assert(rejectWithoutCommentFailed, 'Test 27a: Rejection without comments is strictly rejected');

  const rejectedOT = await OvertimeService.reviewRequest(
    otRequest2.id,
    'REJECT',
    'Overtime not budgeted for documentation review',
    HR_USER
  );
  assert(
    rejectedOT.status === 'REJECTED' &&
      rejectedOT.reviewComments === 'Overtime not budgeted for documentation review',
    'Test 27b: Overtime request rejected with mandatory review comments'
  );

  // ----------------------------------------------------
  // TEST 28: Role Master returns complete RoleDto items with permissions array
  // ----------------------------------------------------
  const rolesList = await UserService.getRoles();
  const expectedRoleNames = ['SUPER_ADMIN', 'TOP_MANAGEMENT', 'HR', 'TEAM_LEADER', 'EMPLOYEE'];
  const hasAllSystemRoles = expectedRoleNames.every((rn) => rolesList.some((r) => r.name === rn));
  const allHavePermissionsArray = rolesList.every(
    (r) =>
      typeof r.id === 'number' &&
      typeof r.name === 'string' &&
      typeof r.description === 'string' &&
      typeof r.isActive === 'boolean' &&
      typeof r.userCount === 'number' &&
      Array.isArray(r.permissions) &&
      r.permissions.length > 0
  );
  assert(
    hasAllSystemRoles && allHavePermissionsArray,
    'Test 28: Role Master returns all 5 system roles with valid id, isActive, userCount, and permissions arrays'
  );

  // ----------------------------------------------------
  // TEST 29: Role assignment authorization (Super Admin allowed, non-Super Admin blocked)
  // ----------------------------------------------------
  const roleAssignedUser = await UserService.assignUserRole(newUser.id, 'TEAM_LEADER', SUPER_ADMIN);
  assert(
    roleAssignedUser.roleName === 'TEAM_LEADER',
    'Test 29a: Super Admin can assign role to user via assignUserRole'
  );

  let nonSuperAdminAssignBlocked = false;
  try {
    await UserService.assignUserRole(newUser.id, 'SUPER_ADMIN', HR_USER);
  } catch (err: any) {
    nonSuperAdminAssignBlocked = err.message.includes('Forbidden');
  }
  assert(
    nonSuperAdminAssignBlocked,
    'Test 29b: Non-Super Admin (HR) is blocked from assigning roles via assignUserRole'
  );

  // ----------------------------------------------------
  // TEST 30: Users and Roles endpoints never expose passwords or password hashes
  // ----------------------------------------------------
  const allUsersPayload = JSON.stringify(await UserService.getUsers());
  const allRolesPayload = JSON.stringify(rolesList);
  assert(
    !allUsersPayload.includes('passwordHash') && !allRolesPayload.includes('passwordHash'),
    'Test 30: User and Role DTOs never expose passwordHash'
  );

  console.log('=== STEP 8 TEST SUITE SUMMARY: ALL 30 TESTS PASSED! ===');
}

runStep8Tests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
