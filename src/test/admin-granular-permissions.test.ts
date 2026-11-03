import http from 'http';
import express from 'express';
import { registerApiRoutes } from '../../server.ts';
import { UserService } from '../services/userService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { AuditService } from '../services/auditService.ts';

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string, details?: unknown) {
  if (condition) {
    passed++;
    console.log('[PASS] ' + message);
  } else {
    failed++;
    console.error('[FAIL] ' + message, details ?? '');
  }
}

async function run() {
  UserService.resetMemoryStores();
  LeaveService.resetMemoryStores();
  AuditService.resetMemoryAuditLogs();

  const superAdmin = { userId: 1, employeeId: 1, username: 'superadmin', role: 'SUPER_ADMIN' as const };
  const allPermissions = UserService.getAvailablePermissions()
    .map((permission) => permission.code)
    .filter((code) => code !== 'ALL_PERMISSIONS');

  await UserService.createRole({
    displayName: 'Admin',
    code: 'ADMIN',
    permissions: allPermissions,
    isActive: true,
  }, superAdmin);
  await UserService.assignUserRole(4, 'ADMIN', superAdmin);

  await UserService.createRole({
    displayName: 'No Privilege',
    code: 'NO_PRIVILEGE',
    permissions: [],
    isActive: true,
  }, superAdmin);
  await UserService.assignUserRole(5, 'NO_PRIVILEGE', superAdmin);

  const adminContext = { userId: 4, employeeId: 4, username: 'alice_emp', role: 'ADMIN' };
  const noPrivilegeContext = { userId: 5, employeeId: 5, username: 'tl_user', role: 'NO_PRIVILEGE' };
  assert(await UserService.hasPermission(adminContext, 'ROLE_ASSIGN'), 'Admin receives granular ROLE_ASSIGN permission');
  assert(await UserService.hasPermission(adminContext, 'SYSTEM_SETTINGS_MANAGE'), 'Admin receives system settings permission');
  assert(await UserService.hasPermission(adminContext, 'LEAVE_TYPE_MANAGE'), 'Admin receives leave type permission');
  assert(await UserService.hasPermission(adminContext, 'HR_APPROVAL_WORKFLOW_MANAGE'), 'Admin receives HR approval workflow permission');
  assert(!(await UserService.hasPermission(adminContext, 'ALL_PERMISSIONS')), 'Custom Admin never receives protected ALL_PERMISSIONS wildcard');
  assert(!(await UserService.hasPermission(noPrivilegeContext, 'SYSTEM_SETTINGS_MANAGE')), 'Unprivileged custom role has no implicit settings access');

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  registerApiRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = 'http://127.0.0.1:' + port;

  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-user-role': 'ADMIN',
    'x-user-id': '4',
    'x-employee-id': '4',
    'x-username': 'alice_emp',
  };
  const noPrivilegeHeaders = {
    'Content-Type': 'application/json',
    'x-user-role': 'NO_PRIVILEGE',
    'x-user-id': '5',
    'x-employee-id': '5',
    'x-username': 'tl_user',
  };

  try {
    const adminSettings = await fetch(baseUrl + '/api/settings', { headers: adminHeaders });
    const deniedSettings = await fetch(baseUrl + '/api/settings', { headers: noPrivilegeHeaders });
    assert(adminSettings.status === 200, 'Admin can access settings route with SYSTEM_SETTINGS_MANAGE');
    assert(deniedSettings.status === 403, 'Custom role without SYSTEM_SETTINGS_MANAGE is denied settings route');

    const createRole = await fetch(baseUrl + '/api/roles', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        displayName: 'Admin-created role',
        code: 'ADMIN_CREATED_ROLE',
        permissions: ['LEAVE_APPLY'],
      }),
    });
    assert(createRole.status === 201, 'Admin can create roles with ROLE_ASSIGN');

    const denyCreateRole = await fetch(baseUrl + '/api/roles', {
      method: 'POST',
      headers: noPrivilegeHeaders,
      body: JSON.stringify({
        displayName: 'Should be denied',
        code: 'SHOULD_BE_DENIED',
        permissions: [],
      }),
    });
    assert(denyCreateRole.status === 403, 'Custom role without ROLE_ASSIGN cannot create roles');

    const protectedPrimaryAccount = await fetch(baseUrl + '/api/users/1/role', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ role: 'EMPLOYEE' }),
    });
    assert(protectedPrimaryAccount.status === 400 || protectedPrimaryAccount.status === 403,
      'Admin cannot downgrade the primary Super Administrator account');

    const selfElevation = await fetch(baseUrl + '/api/users/4', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ role: 'SUPER_ADMIN' }),
    });
    assert(selfElevation.status === 400 || selfElevation.status === 403,
      'Admin cannot elevate its own account to SUPER_ADMIN');

    const catalog = await fetch(baseUrl + '/api/roles/permissions-catalog', { headers: adminHeaders });
    assert(catalog.status === 200, 'Admin can view permission catalog when role administration is granted');
    const catalogBody = await catalog.json();
    assert(!(catalogBody.permissions || []).some((permission: any) => permission.code === 'ALL_PERMISSIONS'),
      'Permission catalog never exposes the protected wildcard');

    const roleList = await fetch(baseUrl + '/api/roles', { headers: adminHeaders });
    const roleListBody = await roleList.json();
    assert(roleList.status === 200, 'Admin can load Role Master with ROLE_ASSIGN');
    assert(!(roleListBody.roles || []).some((role: any) => String(role.code || role.name).toUpperCase() === 'SUPER_ADMIN'),
      'Role Master API never exposes the protected administrative role');
    assert(!(roleListBody.availablePermissions || []).some((permission: any) => permission.code === 'ALL_PERMISSIONS'),
      'Role Master API never exposes the protected wildcard');

    const hiddenRole = await fetch(baseUrl + '/api/roles/SUPER_ADMIN', { headers: adminHeaders });
    assert(hiddenRole.status === 404, 'Protected administrative role detail is not available through the API');

    const userList = await fetch(baseUrl + '/api/users', { headers: adminHeaders });
    const userListBody = await userList.json();
    assert(userList.status === 200, 'Admin can load the user directory with USER_VIEW');
    assert(!(userListBody.users || []).some((user: any) => String(user.role || user.roleName || '').toUpperCase() === 'SUPER_ADMIN'),
      'User directory API never exposes the protected administrative account');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    UserService.resetMemoryStores();
    LeaveService.resetMemoryStores();
  }

  console.log('ADMIN GRANULAR PERMISSIONS: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error('Admin granular permission test failed:', error);
  process.exit(1);
});
