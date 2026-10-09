import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Server } from 'node:http';
import { registerApiRoutes } from '../../server.ts';
import { UserService } from '../services/userService.ts';
import {
  canAccessAdminTab,
  canAccessModule,
  getActiveRole,
  getClientSession,
  getVisibleAdminTabs,
  getVisibleNavModules,
  hasClientPermission,
  loginUserSession,
  logoutUserSession,
  setActiveRole,
} from '../lib/api.ts';

let server: Server;
let baseUrl = '';

async function startTestServer(): Promise<void> {
  const app = express();
  registerApiRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
}

async function stopTestServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function apiRequest(
  method: string,
  urlPath: string,
  options: {
    role?: string;
    userId?: number;
    employeeId?: number;
    body?: any;
  } = {}
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.role) headers['x-user-role'] = options.role;
  if (options.userId !== undefined) headers['x-user-id'] = String(options.userId);
  if (options.employeeId !== undefined) headers['x-employee-id'] = String(options.employeeId);

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function runTests() {
  console.log('================================================================');
  console.log('FINAL UI / ACCESS CLEANUP & RBAC VERIFICATION SUITE');
  console.log('================================================================');

  await startTestServer();
  UserService.resetMemoryStores();
  await apiRequest('POST', '/api/users/4/reset-password', {
    role: 'SUPER_ADMIN',
    userId: 1,
    employeeId: 1,
    body: { newPassword: 'Employee@123' },
  });
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      passed++;
      console.log(`  [PASS] ${name}`);
    } catch (err: any) {
      failed++;
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err?.message || err}`);
    }
  }

  try {
    // ----------------------------------------------------------------
    // SECTION 1: ACTIVE ROLE SELECTOR REMOVED FROM PRODUCTION UI
    // ----------------------------------------------------------------
    console.log('\n--- 1. Active Role Selector Removal & Client Session Integrity ---');

    await test('1.1 App.tsx does not import or render RoleSwitcher in production UI', () => {
      const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
      assert.equal(
        appSource.includes('<RoleSwitcher'),
        false,
        'App.tsx must not render <RoleSwitcher /> in production UI'
      );
      assert.equal(
        appSource.includes('Quick Role Sign-In'),
        false,
        'App.tsx must not expose Quick Role Sign-In selector on login screen'
      );
    });

    await test('1.2 RoleSwitcher component renders null by default in production', () => {
      const switcherSource = fs.readFileSync(
        path.join(process.cwd(), 'src/components/RoleSwitcher.tsx'),
        'utf8'
      );
      assert.equal(
        switcherSource.includes('return null'),
        true,
        'RoleSwitcher must return null in production UI'
      );
      assert.equal(
        switcherSource.includes('<select'),
        false,
        'RoleSwitcher must not render a role switching <select> dropdown'
      );
    });

    await test('1.3 Logged-in EMPLOYEE cannot escalate role to SUPER_ADMIN or HR via setActiveRole()', async () => {
      const loginRes = await apiRequest('POST', '/api/auth/login', {
        body: { identifier: 'alice_emp', password: 'Employee@123' },
      });
      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.data.user.role, 'EMPLOYEE');

      loginUserSession(loginRes.data.user);
      assert.equal(getActiveRole(), 'EMPLOYEE');

      // Attempt client-side role switch while authenticated as EMPLOYEE
      setActiveRole('SUPER_ADMIN');
      assert.equal(
        getActiveRole(),
        'EMPLOYEE',
        'Authenticated EMPLOYEE must not be able to switch active role to SUPER_ADMIN'
      );

      setActiveRole('HR');
      assert.equal(
        getActiveRole(),
        'EMPLOYEE',
        'Authenticated EMPLOYEE must not be able to switch active role to HR'
      );

      const session = getClientSession();
      assert.equal(session.role, 'EMPLOYEE');
      assert.equal(session.userId, 4);
    });

    await test('1.4 Logged-in TEAM_LEADER cannot escalate role to HR or TOP_MANAGEMENT', async () => {
      const loginRes = await apiRequest('POST', '/api/auth/login', {
        body: { identifier: 'tl_robert', password: 'Leader@123' },
      });
      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.data.user.role, 'TEAM_LEADER');

      loginUserSession(loginRes.data.user);
      assert.equal(getActiveRole(), 'TEAM_LEADER');

      setActiveRole('HR');
      assert.equal(getActiveRole(), 'TEAM_LEADER');

      setActiveRole('TOP_MANAGEMENT');
      assert.equal(getActiveRole(), 'TEAM_LEADER');
    });

    await test('1.5 Logged-in HR cannot escalate role to TOP_MANAGEMENT or SUPER_ADMIN', async () => {
      const loginRes = await apiRequest('POST', '/api/auth/login', {
        body: { identifier: 'hruser', password: 'HrManager@123' },
      });
      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.data.user.role, 'HR');

      loginUserSession(loginRes.data.user);
      assert.equal(getActiveRole(), 'HR');

      setActiveRole('TOP_MANAGEMENT');
      assert.equal(getActiveRole(), 'HR');

      setActiveRole('SUPER_ADMIN');
      assert.equal(getActiveRole(), 'HR');
    });

    // ----------------------------------------------------------------
    // SECTION 2: EMPLOYEE PORTAL NAVIGATION & MODULE VISIBILITY
    // ----------------------------------------------------------------
    console.log('\n--- 2. Employee Portal Navigation & Module Access Restrictions ---');

    await test('2.1 EMPLOYEE navigation shows only Employee self-service items', () => {
      const employeeModules = getVisibleNavModules('EMPLOYEE');
      assert.deepEqual(employeeModules, [
        'dashboard',
        'my-leave',
        'leave-balance',
        'my-schedule',
        'holidays',
        'my-profile',
      ]);
      assert.equal(employeeModules.includes('reports'), false, 'EMPLOYEE must not see Reports & MIS');
      assert.equal(
        employeeModules.includes('administration'),
        false,
        'EMPLOYEE must not see Administration'
      );
      assert.equal(
        employeeModules.includes('team-leader'),
        false,
        'EMPLOYEE must not see Team Leader Desk'
      );
      assert.equal(employeeModules.includes('hr'), false, 'EMPLOYEE must not see HR Desk');
      assert.equal(
        employeeModules.includes('management'),
        false,
        'EMPLOYEE must not see Top Management Desk'
      );
    });

    await test('2.2 EMPLOYEE cannot access Reports & MIS, Administration, or Approval Desks via direct route check', () => {
      assert.equal(canAccessModule('EMPLOYEE', 'reports'), false);
      assert.equal(canAccessModule('EMPLOYEE', 'administration'), false);
      assert.equal(canAccessModule('EMPLOYEE', 'team-leader'), false);
      assert.equal(canAccessModule('EMPLOYEE', 'hr'), false);
      assert.equal(canAccessModule('EMPLOYEE', 'management'), false);

      // Permitted employee routes
      assert.equal(canAccessModule('EMPLOYEE', 'dashboard'), true);
      assert.equal(canAccessModule('EMPLOYEE', 'my-leave'), true);
      assert.equal(canAccessModule('EMPLOYEE', 'leave-balance'), true);
      assert.equal(canAccessModule('EMPLOYEE', 'my-schedule'), true);
      assert.equal(canAccessModule('EMPLOYEE', 'holidays'), true);
      assert.equal(canAccessModule('EMPLOYEE', 'my-profile'), true);
    });

    await test('2.3 EMPLOYEE has zero visible Administration sub-tabs', () => {
      const empAdminTabs = getVisibleAdminTabs('EMPLOYEE');
      assert.deepEqual(empAdminTabs, []);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'users'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'roles'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'employees'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'departments'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'designations'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'working-days'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'leave-types'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'leave-policies'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'leave-balance'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'holidays'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'shifts'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'overtime'), false);
      assert.equal(canAccessAdminTab('EMPLOYEE', 'audit'), false);
    });

    // ----------------------------------------------------------------
    // SECTION 3: ROLE-SPECIFIC MODULE & TAB ACCESS FOR ALL ROLES
    // ----------------------------------------------------------------
    console.log('\n--- 3. Role-Based Navigation & Admin Tab Matrix ---');

    await test('3.1 TEAM_LEADER sees Team Leader Desk + personal items, but NOT Reports, Administration, HR, or Management', () => {
      const tlModules = getVisibleNavModules('TEAM_LEADER');
      assert.equal(tlModules.includes('team-leader'), true);
      assert.equal(tlModules.includes('dashboard'), true);
      assert.equal(tlModules.includes('my-leave'), true);
      assert.equal(tlModules.includes('reports'), false);
      assert.equal(tlModules.includes('administration'), false);
      assert.equal(tlModules.includes('hr'), false);
      assert.equal(tlModules.includes('management'), false);
      assert.deepEqual(getVisibleAdminTabs('TEAM_LEADER'), []);
    });

    await test('3.2 HR sees HR Desk, Reports & MIS, and permitted HR Administration tabs, but NOT Super Admin-only tabs or Management Desk', () => {
      const hrModules = getVisibleNavModules('HR');
      assert.equal(hrModules.includes('hr'), true);
      assert.equal(hrModules.includes('reports'), true);
      assert.equal(hrModules.includes('administration'), true);
      assert.equal(hrModules.includes('management'), false);
      assert.equal(hrModules.includes('team-leader'), false);

      const hrAdminTabs = getVisibleAdminTabs('HR');
      assert.equal(hrAdminTabs.includes('employees'), true);
      assert.equal(hrAdminTabs.includes('departments'), true);
      assert.equal(hrAdminTabs.includes('designations'), true);
      assert.equal(hrAdminTabs.includes('working-days'), true);
      assert.equal(hrAdminTabs.includes('leave-balance'), true);
      assert.equal(hrAdminTabs.includes('holidays'), true);
      assert.equal(hrAdminTabs.includes('shifts'), true);
      assert.equal(hrAdminTabs.includes('overtime'), true);

      // Super Admin-only tabs must be hidden from HR
      assert.equal(hrAdminTabs.includes('users'), false);
      assert.equal(hrAdminTabs.includes('roles'), false);
      assert.equal(hrAdminTabs.includes('leave-types'), false);
      assert.equal(hrAdminTabs.includes('leave-policies'), false);
      assert.equal(hrAdminTabs.includes('audit'), false);
    });

    await test('3.3 TOP_MANAGEMENT sees Management Desk and Reports & MIS, but NOT Administration, HR Desk, or Team Leader Desk', () => {
      const tmModules = getVisibleNavModules('TOP_MANAGEMENT');
      assert.equal(tmModules.includes('management'), true);
      assert.equal(tmModules.includes('reports'), true);
      assert.equal(tmModules.includes('administration'), false);
      assert.equal(tmModules.includes('hr'), false);
      assert.equal(tmModules.includes('team-leader'), false);
      assert.deepEqual(getVisibleAdminTabs('TOP_MANAGEMENT'), []);
    });

    await test('3.4 SUPER_ADMIN has full access to all 11 navigation modules and all 13 Administration sub-tabs', () => {
      const saModules = getVisibleNavModules('SUPER_ADMIN');
      assert.equal(saModules.length, 11);
      assert.equal(saModules.includes('reports'), true);
      assert.equal(saModules.includes('administration'), true);

      const saAdminTabs = getVisibleAdminTabs('SUPER_ADMIN');
      assert.equal(saAdminTabs.length, 13);
      assert.equal(saAdminTabs.includes('users'), true);
      assert.equal(saAdminTabs.includes('roles'), true);
      assert.equal(saAdminTabs.includes('audit'), true);
      assert.equal(hasClientPermission('system.settings.manage', 'SUPER_ADMIN'), true);
      assert.equal(hasClientPermission('system.settings.manage', 'EMPLOYEE'), false);
    });

    // ----------------------------------------------------------------
    // SECTION 4: BACKEND API ENFORCEMENT FOR REPORTS & ADMINISTRATION
    // ----------------------------------------------------------------
    console.log('\n--- 4. Backend API Authorization Enforcement ---');

    await test('4.1 GET /api/reports/data denies EMPLOYEE (403) and TEAM_LEADER (403), allows HR, TOP_MANAGEMENT, SUPER_ADMIN (200)', async () => {
      const empRes = await apiRequest('GET', '/api/reports/data', {
        role: 'EMPLOYEE',
        userId: 5,
        employeeId: 5,
      });
      assert.equal(empRes.status, 403, 'EMPLOYEE must be denied access to /api/reports/data');

      const tlRes = await apiRequest('GET', '/api/reports/data', {
        role: 'TEAM_LEADER',
        userId: 4,
        employeeId: 4,
      });
      assert.equal(tlRes.status, 403, 'TEAM_LEADER must be denied access to /api/reports/data');

      const hrRes = await apiRequest('GET', '/api/reports/data', {
        role: 'HR',
        userId: 2,
        employeeId: 2,
      });
      assert.equal(hrRes.status, 200, 'HR must be allowed access to /api/reports/data');

      const tmRes = await apiRequest('GET', '/api/reports/data', {
        role: 'TOP_MANAGEMENT',
        userId: 3,
        employeeId: 3,
      });
      assert.equal(tmRes.status, 200, 'TOP_MANAGEMENT must be allowed access to /api/reports/data');

      const saRes = await apiRequest('GET', '/api/reports/data', {
        role: 'SUPER_ADMIN',
        userId: 1,
        employeeId: 1,
      });
      assert.equal(saRes.status, 200, 'SUPER_ADMIN must be allowed access to /api/reports/data');
    });

    await test('4.2 Administration APIs deny EMPLOYEE (403) across Users, Roles, Settings, Audit, Employees, Departments, Designations, Working Days, Shifts, Leave Types, and Policies', async () => {
      const empCtx = { role: 'EMPLOYEE', userId: 5, employeeId: 5 };

      const usersRes = await apiRequest('GET', '/api/users', empCtx);
      assert.equal(usersRes.status, 403, 'GET /api/users must deny EMPLOYEE');

      const createUserRes = await apiRequest('POST', '/api/users', {
        ...empCtx,
        body: { username: 'hacker', email: 'hacker@maestro.com', role: 'SUPER_ADMIN' },
      });
      assert.equal(createUserRes.status, 403, 'POST /api/users must deny EMPLOYEE');

      const rolesRes = await apiRequest('GET', '/api/roles', empCtx);
      assert.equal(rolesRes.status, 403, 'GET /api/roles must deny EMPLOYEE');

      const updateRoleRes = await apiRequest('PUT', '/api/roles/5/permissions', {
        ...empCtx,
        body: { permissions: ['*'] },
      });
      assert.equal(updateRoleRes.status, 403, 'PUT /api/roles/:id/permissions must deny EMPLOYEE');

      const settingsGetRes = await apiRequest('GET', '/api/settings', empCtx);
      assert.equal(settingsGetRes.status, 403, 'GET /api/settings must deny EMPLOYEE');

      const settingsPutRes = await apiRequest('PUT', '/api/settings/company_name', {
        ...empCtx,
        body: { settingValue: 'Unauthorized Corp' },
      });
      assert.equal(settingsPutRes.status, 403, 'PUT /api/settings/:key must deny EMPLOYEE');

      const auditRes = await apiRequest('GET', '/api/audit-logs', empCtx);
      assert.equal(auditRes.status, 403, 'GET /api/audit-logs must deny EMPLOYEE');

      const empsRes = await apiRequest('GET', '/api/employees', empCtx);
      assert.equal(empsRes.status, 403, 'GET /api/employees must deny EMPLOYEE');

      const deptCreateRes = await apiRequest('POST', '/api/departments', {
        ...empCtx,
        body: { departmentCode: 'HACK', departmentName: 'Hack Dept' },
      });
      assert.equal(deptCreateRes.status, 403, 'POST /api/departments must deny EMPLOYEE');

      const desigCreateRes = await apiRequest('POST', '/api/designations', {
        ...empCtx,
        body: { designationCode: 'HACK', designationName: 'Hacker' },
      });
      assert.equal(desigCreateRes.status, 403, 'POST /api/designations must deny EMPLOYEE');

      const workDaysPutRes = await apiRequest('PUT', '/api/working-days/schedule', {
        ...empCtx,
        body: { schedule: [] },
      });
      assert.equal(workDaysPutRes.status, 403, 'PUT /api/working-days/schedule must deny EMPLOYEE');

      const weeklyOffListRes = await apiRequest('GET', '/api/weekly-off/assignments', empCtx);
      assert.equal(weeklyOffListRes.status, 403, 'GET /api/weekly-off/assignments must deny EMPLOYEE');

      const shiftCreateRes = await apiRequest('POST', '/api/shifts', {
        ...empCtx,
        body: { shiftCode: 'HK', shiftName: 'Hack Shift' },
      });
      assert.equal(shiftCreateRes.status, 403, 'POST /api/shifts must deny EMPLOYEE');

      const leaveTypeCreateRes = await apiRequest('POST', '/api/leave-types', {
        ...empCtx,
        body: { leaveCode: 'HK', leaveName: 'Hack Leave' },
      });
      assert.equal(leaveTypeCreateRes.status, 403, 'POST /api/leave-types must deny EMPLOYEE');

      const leavePolicyCreateRes = await apiRequest('POST', '/api/leave-policies', {
        ...empCtx,
        body: { leaveTypeId: 1, annualAllocation: 99 },
      });
      assert.equal(leavePolicyCreateRes.status, 403, 'POST /api/leave-policies must deny EMPLOYEE');
    });

    await test('4.3 Approval Desk APIs enforce role boundaries (EMPLOYEE denied TL/HR/Management queues)', async () => {
      const empCtx = { role: 'EMPLOYEE', userId: 5, employeeId: 5 };

      const tlQueueRes = await apiRequest('GET', '/api/team-leader/leave-requests', empCtx);
      assert.equal(tlQueueRes.status, 403, 'GET /api/team-leader/leave-requests must deny EMPLOYEE');

      const hrQueueRes = await apiRequest('GET', '/api/hr/leave-requests', empCtx);
      assert.equal(hrQueueRes.status, 403, 'GET /api/hr/leave-requests must deny EMPLOYEE');

      const mgmtQueueRes = await apiRequest('GET', '/api/management/leave-requests', empCtx);
      assert.equal(mgmtQueueRes.status, 403, 'GET /api/management/leave-requests must deny EMPLOYEE');
    });

    await test('4.4 Logout clears authenticated session and subsequent login restores exact user role', async () => {
      await logoutUserSession();
      const postLogoutSession = getClientSession();
      assert.equal(postLogoutSession.isAuthenticated, false);

      const saLoginRes = await apiRequest('POST', '/api/auth/login', {
        body: { identifier: 'superadmin', password: 'SuperAdmin@123' },
      });
      assert.equal(saLoginRes.status, 200);
      const sess = loginUserSession(saLoginRes.data.user);
      assert.equal(sess.isAuthenticated, true);
      assert.equal(sess.role, 'SUPER_ADMIN');
      assert.equal(getActiveRole(), 'SUPER_ADMIN');
    });
  } finally {
    await stopTestServer();
  }

  console.log('\n================================================================');
  console.log(`FINAL UI / ACCESS CLEANUP SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in ui-access-cleanup test suite:', err);
  process.exit(1);
});
