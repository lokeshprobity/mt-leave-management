import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { registerApiRoutes } from '../../server.ts';
import { UserService } from '../services/userService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { AuditService } from '../services/auditService.ts';
import {
  loginUserSession,
  canAccessModule,
  canAccessAdminTab,
  canAccessFrontendRoute,
  setActiveRole,
} from '../lib/api.ts';
import { formatAuditLogForDisplay } from '../components/SystemAuditAdmin.tsx';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, details?: any) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
    if (details !== undefined) {
      console.error('     Details:', JSON.stringify(details, null, 2));
    }
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('MT LEAVE MANAGEMENT — ROLE MASTER CRUD ENHANCEMENT TEST SUITE');
  console.log('================================================================\n');

  UserService.resetMemoryStores();
  LeaveService.resetMemoryStores();
  AuditService.resetMemoryAuditLogs();

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  registerApiRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  const superAdminHeaders = {
    'Content-Type': 'application/json',
    'x-user-role': 'SUPER_ADMIN',
    'x-user-id': '1',
    'x-employee-id': '1',
    'x-username': 'superadmin',
  };

  try {
    // ================================================================
    // 1. CREATE CUSTOM ROLE & VALIDATION
    // ================================================================
    console.log('1. CREATE CUSTOM ROLE & VALIDATION');

    // 1.1 Reject missing role name
    const missingNameRes = await fetch(`${baseUrl}/api/roles`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        displayName: '   ',
        code: 'EMPTY_NAME_ROLE',
        permissions: ['LEAVE_APPLY'],
      }),
    });
    assert(missingNameRes.status === 400, '1.1 Reject creating role when role name is empty');

    // 1.2 Reject missing role code when explicitly empty
    const missingCodeRes = await fetch(`${baseUrl}/api/roles`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        displayName: 'Valid Display Name',
        code: '   ',
        permissions: ['LEAVE_APPLY'],
      }),
    });
    assert(missingCodeRes.status === 400, '1.2 Reject creating role when role code is empty');

    // 1.3 Reject invalid permission key
    const badPermRes = await fetch(`${baseUrl}/api/roles`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        displayName: 'Bad Permission Role',
        code: 'BAD_PERM_ROLE',
        permissions: ['LEAVE_APPLY', 'NON_EXISTENT_PERMISSION_XYZ'],
      }),
    });
    const badPermBody = await badPermRes.json();
    assert(
      badPermRes.status === 400 && String(badPermBody.error || '').includes('NON_EXISTENT_PERMISSION_XYZ'),
      '1.3 Reject creating role with invalid permission code',
      badPermBody
    );

    // 1.4 Create custom role with normalized code, displayName, description, and permissions
    const createRes = await fetch(`${baseUrl}/api/roles`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        displayName: 'Payroll & MIS Auditor',
        code: 'payroll-mis auditor',
        description: 'Audits attendance, leave, and MIS reports across departments.',
        isActive: true,
        permissions: [
          'LEAVE_APPLY',
          'LEAVE_VIEW_OWN',
          'PROFILE_VIEW_OWN',
          'SCHEDULE_VIEW_OWN',
          'REPORT_VIEW',
        ],
      }),
    });
    const createBody = await createRes.json();
    const createdRole = createBody.role;
    assert(
      createRes.status === 201 &&
        createdRole?.name === 'PAYROLL_MIS_AUDITOR' &&
        createdRole?.code === 'PAYROLL_MIS_AUDITOR' &&
        createdRole?.displayName === 'Payroll & MIS Auditor' &&
        createdRole?.isSystem === false &&
        createdRole?.isActive === true &&
        createdRole?.permissions.includes('REPORT_VIEW'),
      '1.4 Create custom role normalizes code to PAYROLL_MIS_AUDITOR and stores displayName, description, permissions',
      createBody
    );

    // 1.5 Reject duplicate role code or duplicate role name
    const dupCodeRes = await fetch(`${baseUrl}/api/roles`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        displayName: 'Another Name',
        code: 'PAYROLL_MIS_AUDITOR',
        permissions: ['LEAVE_APPLY'],
      }),
    });
    const dupNameRes = await fetch(`${baseUrl}/api/roles`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        displayName: 'Payroll & MIS Auditor',
        code: 'DIFFERENT_CODE_AUDITOR',
        permissions: ['LEAVE_APPLY'],
      }),
    });
    const dupBuiltInRes = await fetch(`${baseUrl}/api/roles`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        displayName: 'Super Admin Duplicate',
        code: 'SUPER_ADMIN',
        permissions: ['LEAVE_APPLY'],
      }),
    });
    assert(
      dupCodeRes.status === 400 && dupNameRes.status === 400 && dupBuiltInRes.status === 400,
      '1.5 Reject duplicate custom role code, duplicate role name, and built-in role code collision'
    );

    // 1.6 Verify new role immediately appears in GET /api/roles and GET /api/roles/:id
    const listRolesRes = await fetch(`${baseUrl}/api/roles`, { headers: superAdminHeaders });
    const listRolesBody = await listRolesRes.json();
    const singleRoleRes = await fetch(`${baseUrl}/api/roles/${createdRole.id}`, {
      headers: superAdminHeaders,
    });
    const singleRoleBody = await singleRoleRes.json();
    assert(
      listRolesRes.status === 200 &&
        listRolesBody.roles.some((r: any) => r.name === 'PAYROLL_MIS_AUDITOR') &&
        singleRoleRes.status === 200 &&
        singleRoleBody.role?.displayName === 'Payroll & MIS Auditor',
      '1.6 Newly created role is immediately returned by GET /api/roles and GET /api/roles/:id'
    );

    // ================================================================
    // 2. EDIT CUSTOM ROLE & IMMUTABILITY / SYSTEM ROLE PROTECTION
    // ================================================================
    console.log('\n2. EDIT CUSTOM ROLE & SYSTEM ROLE PROTECTIONS');

    // 2.1 Edit custom role displayName, description, and permissions via PUT /api/roles/:id
    const editRes = await fetch(`${baseUrl}/api/roles/${createdRole.id}`, {
      method: 'PUT',
      headers: superAdminHeaders,
      body: JSON.stringify({
        displayName: 'Senior Payroll & MIS Auditor',
        description: 'Updated description for Senior Payroll & MIS Auditor.',
        isActive: true,
        permissions: [
          'LEAVE_APPLY',
          'LEAVE_VIEW_OWN',
          'PROFILE_VIEW_OWN',
          'SCHEDULE_VIEW_OWN',
          'REPORT_VIEW',
          'SHIFT_VIEW',
        ],
      }),
    });
    const editBody = await editRes.json();
    assert(
      editRes.status === 200 &&
        editBody.role?.name === 'PAYROLL_MIS_AUDITOR' &&
        editBody.role?.displayName === 'Senior Payroll & MIS Auditor' &&
        editBody.role?.description === 'Updated description for Senior Payroll & MIS Auditor.' &&
        editBody.role?.permissions.includes('SHIFT_VIEW'),
      '2.1 Edit custom role updates displayName, description, and permissions while keeping code PAYROLL_MIS_AUDITOR',
      editBody
    );

    // 2.2 Role code is immutable after creation
    const changeCodeRes = await fetch(`${baseUrl}/api/roles/${createdRole.id}`, {
      method: 'PUT',
      headers: superAdminHeaders,
      body: JSON.stringify({
        code: 'MUTATED_ROLE_CODE',
      }),
    });
    assert(
      changeCodeRes.status === 400,
      '2.2 Attempting to change custom role code after creation is rejected with HTTP 400'
    );

    // 2.3 Protect SUPER_ADMIN and built-in system roles from rename, code change, or deactivation
    const disableSuperAdminRes = await fetch(`${baseUrl}/api/roles/SUPER_ADMIN`, {
      method: 'PUT',
      headers: superAdminHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    const renameSuperAdminRes = await fetch(`${baseUrl}/api/roles/SUPER_ADMIN`, {
      method: 'PUT',
      headers: superAdminHeaders,
      body: JSON.stringify({ displayName: 'Hacked Admin' }),
    });
    const disableHrRes = await fetch(`${baseUrl}/api/roles/HR`, {
      method: 'PUT',
      headers: superAdminHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    const changeEmployeeCodeRes = await fetch(`${baseUrl}/api/roles/EMPLOYEE`, {
      method: 'PUT',
      headers: superAdminHeaders,
      body: JSON.stringify({ code: 'STAFF_MEMBER' }),
    });
    assert(
      disableSuperAdminRes.status === 400 &&
        renameSuperAdminRes.status === 400 &&
        disableHrRes.status === 400 &&
        changeEmployeeCodeRes.status === 400,
      '2.3 Built-in system roles (SUPER_ADMIN, HR, EMPLOYEE) cannot be disabled, renamed, or have their role code altered'
    );

    // 2.4 Inactive custom role cannot be assigned to a user; re-activating allows assignment
    const deactivateCustomRes = await fetch(`${baseUrl}/api/roles/${createdRole.id}`, {
      method: 'PATCH',
      headers: superAdminHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    const assignInactiveRes = await fetch(`${baseUrl}/api/users/4/role`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({ role: 'PAYROLL_MIS_AUDITOR' }),
    });
    const reactivateCustomRes = await fetch(`${baseUrl}/api/roles/${createdRole.id}`, {
      method: 'PATCH',
      headers: superAdminHeaders,
      body: JSON.stringify({ isActive: true }),
    });
    assert(
      deactivateCustomRes.status === 200 &&
        assignInactiveRes.status === 400 &&
        reactivateCustomRes.status === 200,
      '2.4 Inactive custom role cannot be assigned to users; re-activating restores assignability'
    );

    // ================================================================
    // 3. USER ASSIGNMENT, AUTHENTICATION & RBAC ENFORCEMENT
    // ================================================================
    console.log('\n3. USER ASSIGNMENT, AUTHENTICATION & RBAC ENFORCEMENT');

    // 3.1 Assign PAYROLL_MIS_AUDITOR to User 4 (alice_emp)
    const assignRes = await fetch(`${baseUrl}/api/users/4/role`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({ role: 'PAYROLL_MIS_AUDITOR' }),
    });
    const assignBody = await assignRes.json();
    assert(
      assignRes.status === 200 && assignBody.user?.roleName === 'PAYROLL_MIS_AUDITOR',
      '3.1 Assign custom role PAYROLL_MIS_AUDITOR to User 4 succeeds'
    );

    // 3.2 Authenticate as User 4 and verify permissions in login payload
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail: 'alice_emp', password: 'Employee@123' }),
    });
    const loginBody = await loginRes.json();
    assert(
      loginRes.status === 200 &&
        loginBody.user?.roleName === 'PAYROLL_MIS_AUDITOR' &&
        loginBody.user?.permissions.includes('REPORT_VIEW') &&
        loginBody.user?.permissions.includes('SHIFT_VIEW'),
      '3.2 User 4 logs in and receives PAYROLL_MIS_AUDITOR role and configured permissions'
    );

    // 3.3 Verify frontend session & module/route guards
    const session = loginUserSession(loginBody.user);
    assert(
      session.role === 'PAYROLL_MIS_AUDITOR' &&
        canAccessModule('reports') === true &&
        canAccessFrontendRoute('/reports') === true &&
        canAccessAdminTab('shifts') === true &&
        canAccessModule('hr') === false &&
        canAccessModule('management') === false &&
        canAccessModule('team-leader') === false &&
        canAccessAdminTab('roles') === false &&
        canAccessAdminTab('audit') === false &&
        canAccessFrontendRoute('/system-overview') === false,
      '3.3 Frontend session grants access to permitted modules (reports, shifts tab) and blocks unpermitted desks, roles, audit, and system settings'
    );

    // 3.4 Verify backend API enforcement for custom role
    const customUserHeaders = {
      'Content-Type': 'application/json',
      'x-user-role': 'PAYROLL_MIS_AUDITOR',
      'x-user-id': '4',
      'x-employee-id': '4',
      'x-username': 'alice_emp',
    };
    const allowedReportRes = await fetch(`${baseUrl}/api/reports/data?reportType=LEAVE`, {
      headers: customUserHeaders,
    });
    const allowedShiftsRes = await fetch(`${baseUrl}/api/shifts`, {
      headers: customUserHeaders,
    });
    const forbiddenCreateRole = await fetch(`${baseUrl}/api/roles`, {
      method: 'POST',
      headers: customUserHeaders,
      body: JSON.stringify({ name: 'UNAUTHORIZED_ROLE', code: 'UNAUTHORIZED_ROLE' }),
    });
    const forbiddenEditRole = await fetch(`${baseUrl}/api/roles/${createdRole.id}`, {
      method: 'PUT',
      headers: customUserHeaders,
      body: JSON.stringify({ description: 'Unauthorized edit' }),
    });
    const forbiddenDeleteRole = await fetch(`${baseUrl}/api/roles/${createdRole.id}`, {
      method: 'DELETE',
      headers: customUserHeaders,
    });
    assert(
      allowedReportRes.status === 200 &&
        allowedShiftsRes.status === 200 &&
        forbiddenCreateRole.status === 403 &&
        forbiddenEditRole.status === 403 &&
        forbiddenDeleteRole.status === 403,
      '3.4 Backend API permits REPORT_VIEW/SHIFT_VIEW routes and returns 403 Forbidden for Role CRUD by non-Super Admin'
    );

    // 3.5 Verify HR, TOP_MANAGEMENT, TEAM_LEADER, and EMPLOYEE cannot create, edit, or delete roles
    for (const nonSaRole of ['EMPLOYEE', 'TEAM_LEADER', 'HR', 'TOP_MANAGEMENT']) {
      const h = {
        'Content-Type': 'application/json',
        'x-user-role': nonSaRole,
        'x-user-id': '2',
      };
      const pRes = await fetch(`${baseUrl}/api/roles`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ name: 'NO_ACCESS', code: 'NO_ACCESS' }),
      });
      const uRes = await fetch(`${baseUrl}/api/roles/${createdRole.id}`, {
        method: 'PUT',
        headers: h,
        body: JSON.stringify({ description: 'Nope' }),
      });
      const dRes = await fetch(`${baseUrl}/api/roles/${createdRole.id}`, {
        method: 'DELETE',
        headers: h,
      });
      assert(
        pRes.status === 403 && uRes.status === 403 && dRes.status === 403,
        `3.5.${nonSaRole} Role '${nonSaRole}' receives HTTP 403 Forbidden on POST/PUT/DELETE /api/roles`
      );
    }

    // ================================================================
    // 4. DELETE ROLE SAFEGUARDS & CLEANUP FLOW (CUSTOM & PREDEFINED ROLES)
    // ================================================================
    console.log('\n4. DELETE ROLE SAFEGUARDS & CLEANUP FLOW (CUSTOM & PREDEFINED ROLES)');

    // 4.1 Prevent deleting custom role while assigned to User 4
    const delAssignedRes = await fetch(`${baseUrl}/api/roles/${createdRole.id}`, {
      method: 'DELETE',
      headers: superAdminHeaders,
    });
    const delAssignedBody = await delAssignedRes.json();
    assert(
      delAssignedRes.status === 400 &&
        String(delAssignedBody.error || '').includes(
          'This role is assigned to 1 user. Reassign those users before deleting this role.'
        ),
      '4.1 Deleting custom role assigned to 1 user is blocked with exact dependency message',
      delAssignedBody
    );

    // 4.2 Unassign User 4 from PAYROLL_MIS_AUDITOR back to EMPLOYEE via DELETE /api/users/4/role
    const unassignRes = await fetch(`${baseUrl}/api/users/4/role`, {
      method: 'DELETE',
      headers: superAdminHeaders,
      body: JSON.stringify({ fallbackRole: 'EMPLOYEE' }),
    });
    const unassignBody = await unassignRes.json();
    assert(
      unassignRes.status === 200 && unassignBody.user?.roleName === 'EMPLOYEE',
      '4.2 Unassigning User 4 restores EMPLOYEE role and clears dependency on PAYROLL_MIS_AUDITOR',
      unassignBody
    );

    // 4.3 Delete unassigned custom role succeeds and removes it from GET /api/roles
    const delUnassignedRes = await fetch(`${baseUrl}/api/roles/${createdRole.id}`, {
      method: 'DELETE',
      headers: superAdminHeaders,
    });
    const delUnassignedBody = await delUnassignedRes.json();
    const afterDeleteListRes = await fetch(`${baseUrl}/api/roles`, { headers: superAdminHeaders });
    const afterDeleteListBody = await afterDeleteListRes.json();
    assert(
      delUnassignedRes.status === 200 &&
        delUnassignedBody.deleted === true &&
        delUnassignedBody.role?.isSystem === false &&
        !afterDeleteListBody.roles.some((r: any) => r.name === 'PAYROLL_MIS_AUDITOR'),
      '4.3 Deleting unassigned custom role succeeds and removes PAYROLL_MIS_AUDITOR from Role Master',
      delUnassignedBody
    );

    // 4.4 Assigned predefined/system roles cannot be deleted until user dependencies are resolved
    for (const sysRole of ['SUPER_ADMIN', 'TOP_MANAGEMENT', 'HR', 'TEAM_LEADER', 'EMPLOYEE']) {
      const delSysRes = await fetch(`${baseUrl}/api/roles/${sysRole}`, {
        method: 'DELETE',
        headers: superAdminHeaders,
      });
      const delSysBody = await delSysRes.json();
      assert(
        delSysRes.status === 400 &&
          delSysBody.isDependencyError === true &&
          String(delSysBody.error || '').includes('Reassign those users before deleting this role.') &&
          String(delSysBody.error || '').includes('Affected user'),
        `4.4.${sysRole} Assigned predefined role '${sysRole}' is blocked from deletion by dependency validation with affected user info`,
        delSysBody
      );
    }

    // 4.5 Non-SUPER_ADMIN cannot delete a predefined/system role
    for (const nonSaRole of ['EMPLOYEE', 'TEAM_LEADER', 'HR', 'TOP_MANAGEMENT']) {
      const delPredefinedForbiddenRes = await fetch(`${baseUrl}/api/roles/TEAM_LEADER`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': nonSaRole,
          'x-user-id': '2',
        },
      });
      assert(
        delPredefinedForbiddenRes.status === 403,
        `4.5.${nonSaRole} Non-SUPER_ADMIN role '${nonSaRole}' receives HTTP 403 Forbidden when attempting to delete predefined role TEAM_LEADER`
      );
    }

    // 4.6 Reassign all users currently assigned to predefined role TEAM_LEADER to EMPLOYEE
    const usersBeforeTlDeleteRes = await fetch(`${baseUrl}/api/users`, { headers: superAdminHeaders });
    const usersBeforeTlDeleteBody = await usersBeforeTlDeleteRes.json();
    const tlAssignedUsers = (usersBeforeTlDeleteBody.users || []).filter(
      (u: any) => String(u.roleName || u.role || '').toUpperCase() === 'TEAM_LEADER' || u.roleId === 5
    );
    assert(
      tlAssignedUsers.length > 0,
      '4.6.a Verify predefined role TEAM_LEADER initially has assigned users before reassignment'
    );
    for (const tlUser of tlAssignedUsers) {
      const reassignTlRes = await fetch(`${baseUrl}/api/users/${tlUser.id}/role`, {
        method: 'DELETE',
        headers: superAdminHeaders,
        body: JSON.stringify({ fallbackRole: 'EMPLOYEE' }),
      });
      assert(
        reassignTlRes.status === 200,
        `4.6.b Reassign user @${tlUser.username} (ID: ${tlUser.id}) from TEAM_LEADER to EMPLOYEE`
      );
    }

    // 4.7 After dependencies are cleared, SUPER_ADMIN can delete predefined role TEAM_LEADER
    const delPredefinedTlRes = await fetch(`${baseUrl}/api/roles/TEAM_LEADER`, {
      method: 'DELETE',
      headers: superAdminHeaders,
    });
    const delPredefinedTlBody = await delPredefinedTlRes.json();
    const rolesAfterTlDeleteRes = await fetch(`${baseUrl}/api/roles`, { headers: superAdminHeaders });
    const rolesAfterTlDeleteBody = await rolesAfterTlDeleteRes.json();
    const getDeletedTlRes = await fetch(`${baseUrl}/api/roles/TEAM_LEADER`, { headers: superAdminHeaders });
    assert(
      delPredefinedTlRes.status === 200 &&
        delPredefinedTlBody.deleted === true &&
        delPredefinedTlBody.role?.name === 'TEAM_LEADER' &&
        delPredefinedTlBody.role?.isSystem === true &&
        !rolesAfterTlDeleteBody.roles.some((r: any) => r.name === 'TEAM_LEADER') &&
        getDeletedTlRes.status === 404,
      '4.7 Predefined system role TEAM_LEADER is successfully deleted by SUPER_ADMIN after dependencies are cleared and no longer appears in Role Master',
      delPredefinedTlBody
    );

    // 4.8 Verify no orphaned user assignments or permission records remain for deleted predefined role
    const usersAfterTlDeleteRes = await fetch(`${baseUrl}/api/users`, { headers: superAdminHeaders });
    const usersAfterTlDeleteBody = await usersAfterTlDeleteRes.json();
    const orphanedTlUsers = (usersAfterTlDeleteBody.users || []).filter(
      (u: any) => String(u.roleName || u.role || '').toUpperCase() === 'TEAM_LEADER' || u.roleId === 5
    );
    const assignDeletedTlRes = await fetch(`${baseUrl}/api/users/5/role`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({ role: 'TEAM_LEADER' }),
    });
    const deletedTlPerms = await UserService.getRolePermissions('TEAM_LEADER');
    assert(
      orphanedTlUsers.length === 0 &&
        assignDeletedTlRes.status === 400 &&
        Array.isArray(deletedTlPerms) &&
        deletedTlPerms.length === 0,
      '4.8 No orphaned user role assignments or active permissions remain for deleted predefined role TEAM_LEADER, and assigning deleted role is rejected'
    );

    // ================================================================
    // 5. AUDIT TRAIL & UI VERIFICATION
    // ================================================================
    console.log('\n5. AUDIT TRAIL & UI VERIFICATION');

    const auditLogs = await AuditService.getAuditLogs({ limit: 500 });
    const roleCreatedLog = auditLogs.find(
      (l) => l.action === 'ROLE_CREATED' && l.metadata?.roleCode === 'PAYROLL_MIS_AUDITOR'
    );
    const roleUpdatedLog = auditLogs.find(
      (l) => l.action === 'ROLE_UPDATED' && l.metadata?.roleCode === 'PAYROLL_MIS_AUDITOR'
    );
    const rolePermsUpdatedLog = auditLogs.find(
      (l) => l.action === 'ROLE_PERMISSIONS_UPDATED' && l.metadata?.roleName === 'PAYROLL_MIS_AUDITOR'
    );
    const roleAssignedLog = auditLogs.find(
      (l) => l.action === 'ROLE_ASSIGNED' && l.metadata?.newRole === 'PAYROLL_MIS_AUDITOR'
    );
    const roleUnassignedLog = auditLogs.find(
      (l) => l.action === 'ROLE_UNASSIGNED' && l.metadata?.unassignedRole === 'PAYROLL_MIS_AUDITOR'
    );
    const roleDeletedLog = auditLogs.find(
      (l) => l.action === 'ROLE_DELETED' && l.metadata?.roleCode === 'PAYROLL_MIS_AUDITOR'
    );
    const predefinedRoleDeletedLog = auditLogs.find(
      (l) => l.action === 'ROLE_DELETED' && l.metadata?.roleCode === 'TEAM_LEADER'
    );

    assert(
      Boolean(roleCreatedLog && roleCreatedLog.actorId === 1 && roleCreatedLog.metadata?.after),
      '5.1 Audit trail records ROLE_CREATED with actor, timestamp, target role, and after snapshot'
    );
    assert(
      Boolean(
        roleUpdatedLog &&
          roleUpdatedLog.metadata?.before &&
          roleUpdatedLog.metadata?.after &&
          rolePermsUpdatedLog
      ),
      '5.2 Audit trail records ROLE_UPDATED and ROLE_PERMISSIONS_UPDATED with before/after values'
    );
    assert(
      Boolean(roleAssignedLog && roleUnassignedLog),
      '5.3 Audit trail records ROLE_ASSIGNED and ROLE_UNASSIGNED with before/after role values'
    );
    assert(
      Boolean(
        roleDeletedLog &&
          roleDeletedLog.metadata?.isSystemRole === false &&
          roleDeletedLog.metadata?.before &&
          roleDeletedLog.metadata?.after === null
      ),
      '5.4 Audit trail records ROLE_DELETED for custom role with actor, timestamp, isSystemRole=false, and before snapshot'
    );
    assert(
      Boolean(
        predefinedRoleDeletedLog &&
          predefinedRoleDeletedLog.action === 'ROLE_DELETED' &&
          predefinedRoleDeletedLog.actorRole === 'SUPER_ADMIN' &&
          predefinedRoleDeletedLog.actorId === 1 &&
          predefinedRoleDeletedLog.metadata?.roleId === 5 &&
          predefinedRoleDeletedLog.metadata?.roleCode === 'TEAM_LEADER' &&
          predefinedRoleDeletedLog.metadata?.roleName === 'Team Leader' &&
          predefinedRoleDeletedLog.metadata?.isSystemRole === true &&
          predefinedRoleDeletedLog.metadata?.actedBySuperAdmin &&
          predefinedRoleDeletedLog.metadata?.timestamp &&
          predefinedRoleDeletedLog.metadata?.dependencyStatus &&
          predefinedRoleDeletedLog.metadata?.before?.isSystem === true &&
          predefinedRoleDeletedLog.metadata?.after === null
      ),
      '5.5 Audit trail records complete ROLE_DELETED entry for predefined role TEAM_LEADER (roleId, roleName, roleCode, isSystemRole=true, acting SUPER_ADMIN, timestamp, dependencyStatus, before/after)',
      predefinedRoleDeletedLog
    );

    // 5.6 Verify human-readable audit formatting for all role audit actions including predefined ROLE_DELETED
    for (const log of [
      roleCreatedLog!,
      roleUpdatedLog!,
      rolePermsUpdatedLog!,
      roleAssignedLog!,
      roleUnassignedLog!,
      roleDeletedLog!,
      predefinedRoleDeletedLog!,
    ]) {
      const formatted = formatAuditLogForDisplay(log);
      assert(
        Boolean(formatted.title) &&
          (formatted.fields.length > 0 || formatted.sections.length > 0) &&
          !formatted.lines.some((line) => line.trim().startsWith('{')),
        `5.6.${log.action}.${log.metadata?.roleCode || log.metadata?.newRole} formatAuditLogForDisplay renders human-readable fields for ${log.action}`
      );
    }

    // 5.7 Verify RoleAdmin.tsx UI controls give predefined roles the same enabled Delete Role action as custom roles
    const roleAdminSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/admin/RoleAdmin.tsx'),
      'utf-8'
    );
    assert(
      roleAdminSrc.includes('Create New Role') &&
        roleAdminSrc.includes('Edit Role') &&
        roleAdminSrc.includes('Delete Role') &&
        roleAdminSrc.includes('Configure Permissions') &&
        roleAdminSrc.includes('Assign Role to User') &&
        roleAdminSrc.includes('Select All') &&
        roleAdminSrc.includes('Clear All') &&
        roleAdminSrc.includes('Confirm Delete Role') &&
        roleAdminSrc.includes('Delete predefined system role') &&
        !roleAdminSrc.includes('Built-in system roles are protected and cannot be deleted'),
      '5.7 RoleAdmin.tsx visibly provides the enabled Delete Role action for both predefined/system roles and custom roles with dependency validation and confirmation'
    );

    setActiveRole('SUPER_ADMIN', 1, 1);
  } finally {
    UserService.resetMemoryStores();
    LeaveService.resetMemoryStores();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n================================================================');
  console.log(`ROLE MASTER CRUD SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error in role-master-crud.test.ts:', err);
  process.exit(1);
});
