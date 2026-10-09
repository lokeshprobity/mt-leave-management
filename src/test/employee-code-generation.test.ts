import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Server } from 'node:http';
import { registerApiRoutes } from '../../server.ts';
import { UserService } from '../services/userService.ts';
import { AuthContext } from '../types/leave.ts';

const superAdminActor: AuthContext = {
  userId: 1,
  username: 'superadmin',
  employeeId: 1,
  employeeCode: 'MT001',
  role: 'SUPER_ADMIN',
  operationalRole: 'TOP_MANAGEMENT',
  departmentId: 1,
  departmentCode: 'OPS',
};

async function runEmployeeCodeTests() {
  console.log('==========================================================');
  console.log('EMPLOYEE CODE GENERATION & PERSISTENCE VERIFICATION SUITE');
  console.log('==========================================================');

  // 1. Verify production on-disk roles_and_users.json has Super Admin = MT001 and no duplicate MT001
  const prodManifestPath = path.resolve('uploads', 'metadata', 'roles_and_users.json');
  assert.equal(fs.existsSync(prodManifestPath), true, 'Production roles_and_users.json must exist');
  const prodParsed = JSON.parse(fs.readFileSync(prodManifestPath, 'utf-8'));
  const prodSuperAdmin = prodParsed.users.find((u: any) => u.id === 1 && u.username === 'superadmin');
  assert.ok(prodSuperAdmin, 'Super Admin record must exist in production roles_and_users.json');
  assert.equal(
    prodSuperAdmin.employeeCode,
    'MT001',
    'Super Admin employeeCode persisted on disk must be MT001'
  );
  const prodMt001Owners = prodParsed.users.filter(
    (u: any) => String(u.employeeCode || '').trim().toUpperCase() === 'MT001'
  );
  assert.equal(
    prodMt001Owners.length,
    1,
    'Exactly one user (Super Admin) may own MT001 in production roles_and_users.json'
  );
  assert.equal(prodMt001Owners[0].id, 1);
  console.log('  [PASS] 1. Production roles_and_users.json persists Super Admin = MT001 with no duplicate MT001');

  // 2. Reset test memory stores and verify Super Admin is MT001 and next automatic sequence starts at MT002
  UserService.resetMemoryStores();

  const superAdminEmp = await UserService.getEmployeeById(1);
  assert.ok(superAdminEmp, 'Super Admin employee must exist');
  assert.equal(superAdminEmp.employeeCode, 'MT001', 'Super Admin employeeCode in memory must be MT001');
  assert.equal(UserService.getNextEmployeeCode(), 'MT002', 'Initial next automatic employeeCode must be MT002');
  console.log('  [PASS] 2. Super Admin is MT001 in memory and initial automatic code is MT002');

  // 3. Automatic sequence generation: MT002 -> MT003 -> MT004
  const empAuto1 = await UserService.createEmployee(
    {
      employeeName: 'Auto Employee Two',
      officialEmail: 'auto.mt002@company.com',
      departmentId: 1,
      designationId: 4,
    },
    superAdminActor
  );
  assert.equal(empAuto1.employeeCode, 'MT002');

  const empAuto2 = await UserService.createEmployee(
    {
      employeeCode: '   ',
      employeeName: 'Auto Employee Three',
      officialEmail: 'auto.mt003@company.com',
      departmentId: 1,
      designationId: 4,
    },
    superAdminActor
  );
  assert.equal(empAuto2.employeeCode, 'MT003');

  const empAuto3 = await UserService.createEmployee(
    {
      employeeName: 'Auto Employee Four',
      officialEmail: 'auto.mt004@company.com',
      departmentId: 1,
      designationId: 4,
    },
    superAdminActor
  );
  assert.equal(empAuto3.employeeCode, 'MT004');
  console.log('  [PASS] 3. Automatic generation increments sequentially: MT002 -> MT003 -> MT004');

  // 4. Manual higher code advances the next automatic sequence (Manual = MT010 -> Next Auto = MT011)
  const empManual10 = await UserService.createEmployee(
    {
      employeeCode: 'mt010',
      employeeName: 'Manual Employee Ten',
      officialEmail: 'manual.mt010@company.com',
      departmentId: 1,
      designationId: 4,
    },
    superAdminActor
  );
  assert.equal(empManual10.employeeCode, 'MT010');
  assert.equal(UserService.getNextEmployeeCode(), 'MT011');

  const empAuto11 = await UserService.createEmployee(
    {
      employeeName: 'Auto Employee Eleven',
      officialEmail: 'auto.mt011@company.com',
      departmentId: 1,
      designationId: 4,
    },
    superAdminActor
  );
  assert.equal(empAuto11.employeeCode, 'MT011');
  console.log('  [PASS] 4. Manual higher code (MT010) advances next automatic code to MT011');

  // 5. Lower manual code never reduces the counter (Manual = MT006 when highest is MT011 -> Next Auto = MT012)
  const empManual06 = await UserService.createEmployee(
    {
      employeeCode: 'MT006',
      employeeName: 'Manual Gap Employee Six',
      officialEmail: 'manual.mt006@company.com',
      departmentId: 1,
      designationId: 4,
    },
    superAdminActor
  );
  assert.equal(empManual06.employeeCode, 'MT006');
  assert.equal(
    UserService.getNextEmployeeCode(),
    'MT012',
    'Manual lower code MT006 must not reduce counter below MT012'
  );

  const empAuto12 = await UserService.createEmployee(
    {
      employeeName: 'Auto Employee Twelve',
      officialEmail: 'auto.mt012@company.com',
      departmentId: 1,
      designationId: 4,
    },
    superAdminActor
  );
  assert.equal(empAuto12.employeeCode, 'MT012');
  console.log('  [PASS] 5. Lower manual code (MT006) does not reduce counter; next automatic is MT012');

  // 6. Duplicate protection (case-insensitive) on create and update
  await assert.rejects(
    async () => {
      await UserService.createEmployee(
        {
          employeeCode: 'MT010',
          employeeName: 'Duplicate Ten Upper',
          officialEmail: 'dup10.upper@company.com',
          departmentId: 1,
          designationId: 4,
        },
        superAdminActor
      );
    },
    /already registered/i,
    'Duplicate MT010 must be rejected'
  );

  await assert.rejects(
    async () => {
      await UserService.createEmployee(
        {
          employeeCode: 'mt010',
          employeeName: 'Duplicate Ten Lower',
          officialEmail: 'dup10.lower@company.com',
          departmentId: 1,
          designationId: 4,
        },
        superAdminActor
      );
    },
    /already registered/i,
    'Case-insensitive duplicate mt010 must be rejected'
  );

  await assert.rejects(
    async () => {
      await UserService.createEmployee(
        {
          employeeCode: 'MT001',
          employeeName: 'Duplicate Super Admin Code',
          officialEmail: 'dup.mt001@company.com',
          departmentId: 1,
          designationId: 4,
        },
        superAdminActor
      );
    },
    /already registered/i,
    'Duplicate MT001 (owned by Super Admin) must be rejected'
  );

  await assert.rejects(
    async () => {
      await UserService.updateEmployee(
        empAuto12.id,
        { employeeCode: 'mt010' },
        superAdminActor
      );
    },
    /already registered/i,
    'Updating an employee to an existing code (mt010) must be rejected'
  );
  console.log('  [PASS] 6. Duplicate employee codes (MT010, mt010, MT001) are rejected case-insensitively');

  // 7. Persistence across simulated restart (including when highest employee was deleted before restart)
  const empManual20 = await UserService.createEmployee(
    {
      employeeCode: 'MT020',
      employeeName: 'Manual Twenty',
      officialEmail: 'manual.mt020@company.com',
      departmentId: 1,
      designationId: 4,
    },
    superAdminActor
  );
  assert.equal(empManual20.employeeCode, 'MT020');
  assert.equal(UserService.getNextEmployeeCode(), 'MT021');

  // Delete MT020 (which has no dependent records) and simulate server restart
  await UserService.deleteEmployee(empManual20.id, superAdminActor);
  UserService.simulateServerRestart();

  const superAdminAfterRestart = await UserService.getEmployeeById(1);
  assert.equal(superAdminAfterRestart?.employeeCode, 'MT001', 'Super Admin must remain MT001 after restart');
  assert.equal(
    UserService.getNextEmployeeCode(),
    'MT021',
    'Next automatic code must remain MT021 after restart even after deleting MT020'
  );

  const empAfterRestart = await UserService.createEmployee(
    {
      employeeName: 'Post Restart Employee',
      officialEmail: 'post.restart@company.com',
      departmentId: 1,
      designationId: 4,
    },
    superAdminActor
  );
  assert.equal(empAfterRestart.employeeCode, 'MT021');
  console.log('  [PASS] 7. Sequence counter and Super Admin MT001 survive save, reload, and simulated restart');

  // 8. Employee creation form & HTTP POST /api/employees automatic-code behavior
  const empAdminSource = fs.readFileSync(
    path.resolve('src', 'components', 'admin', 'EmployeeAdmin.tsx'),
    'utf-8'
  );
  const codeInputMatch = empAdminSource.match(/<input[^>]*id="input-emp-code"[^>]*>/);
  assert.ok(codeInputMatch, 'EmployeeAdmin.tsx must render #input-emp-code');
  assert.equal(
    /\brequired\b/.test(codeInputMatch[0]),
    false,
    '#input-emp-code in EmployeeAdmin.tsx must not have required attribute blocking blank auto-generation'
  );

  const app = express();
  registerApiRoutes(app);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const addr = server.address();
    const baseUrl = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';

    // Simulate EmployeeAdmin.tsx handleAddSubmit when employeeCode input is left blank
    const blankFormRes = await fetch(`${baseUrl}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
        'x-employee-id': '1',
      },
      body: JSON.stringify({
        employeeCode: undefined,
        employeeName: 'Form Blank Auto Employee',
        officialEmail: 'form.blank.auto@company.com',
        departmentId: 1,
        designationId: 4,
      }),
    });
    assert.equal(blankFormRes.status, 201);
    const blankFormData = await blankFormRes.json();
    assert.equal(blankFormData.employee.employeeCode, 'MT022');

    // Simulate EmployeeAdmin.tsx handleAddSubmit when manual employeeCode is entered
    const manualFormRes = await fetch(`${baseUrl}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
        'x-employee-id': '1',
      },
      body: JSON.stringify({
        employeeCode: 'MT025',
        employeeName: 'Form Manual Employee',
        officialEmail: 'form.manual.25@company.com',
        departmentId: 1,
        designationId: 4,
      }),
    });
    assert.equal(manualFormRes.status, 201);
    const manualFormData = await manualFormRes.json();
    assert.equal(manualFormData.employee.employeeCode, 'MT025');

    // Next automatic via HTTP form submission must be MT026
    const nextAutoFormRes = await fetch(`${baseUrl}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
        'x-employee-id': '1',
      },
      body: JSON.stringify({
        employeeName: 'Form Next Auto Employee',
        officialEmail: 'form.auto.26@company.com',
        departmentId: 1,
        designationId: 4,
      }),
    });
    assert.equal(nextAutoFormRes.status, 201);
    const nextAutoFormData = await nextAutoFormRes.json();
    assert.equal(nextAutoFormData.employee.employeeCode, 'MT026');
    console.log('  [PASS] 8. Employee creation form & POST /api/employees support blank auto-generation and manual code entry');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // Clean up test artifact file
  const testManifestPath = path.resolve('uploads', 'metadata', 'roles_and_users.test.json');
  if (fs.existsSync(testManifestPath)) {
    try {
      fs.unlinkSync(testManifestPath);
    } catch {}
  }

  console.log('\nALL 8 EMPLOYEE CODE GENERATION & PERSISTENCE TESTS PASSED!');
}

runEmployeeCodeTests().catch((err) => {
  console.error('Employee Code Generation Test Failed:', err);
  process.exit(1);
});
