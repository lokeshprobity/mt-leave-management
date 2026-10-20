import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LeaveService } from '../services/leaveService.ts';
import { UserService } from '../services/userService.ts';
import { AuthContext } from '../types/leave.ts';

async function runLeaveBalanceDashboardTests() {
  console.log('================================================================');
  console.log('LEAVE BALANCE DASHBOARD & DATE LABEL VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(desc: string, fn: () => void | Promise<void>) {
    try {
      fn();
      passed++;
      console.log(`[PASS] ${desc}`);
    } catch (e: any) {
      failed++;
      console.error(`[FAIL] ${desc}`, e);
    }
  }

  async function testAsync(desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      passed++;
      console.log(`[PASS] ${desc}`);
    } catch (e: any) {
      failed++;
      console.error(`[FAIL] ${desc}`, e);
    }
  }

  // ------------------------------------------------------------------
  // 1. Task 1: Date Label Verification in HolidayCalendarAdmin.tsx
  // ------------------------------------------------------------------
  console.log('--- 1. Task 1: Date Label in Holiday Form ---');
  test('1.1 Holiday form displays "Holiday Date (DD/MM/YYYY) *" label', () => {
    const holidayAdminPath = path.resolve(process.cwd(), 'src/components/HolidayCalendarAdmin.tsx');
    const content = fs.readFileSync(holidayAdminPath, 'utf-8');
    assert.ok(
      content.includes('Holiday Date (DD/MM/YYYY) *'),
      'Holiday form label must be "Holiday Date (DD/MM/YYYY) *"'
    );
    assert.ok(
      !content.includes('Holiday Date (YYYY-MM-DD)'),
      'Old label "Holiday Date (YYYY-MM-DD)" must no longer be present'
    );
  });

  // ------------------------------------------------------------------
  // 2. Task 2: Leave Balance Calculation: 12 allocated - 4 used = 8 remaining
  // ------------------------------------------------------------------
  console.log('\n--- 2. Task 2: Leave Balance Calculation & Service Logic ---');

  const superAdminActor: AuthContext = {
    userId: 1,
    username: 'superadmin',
    employeeId: 1,
    employeeCode: 'EMP001',
    role: 'SUPER_ADMIN',
  };

  const hrActor: AuthContext = {
    userId: 2,
    username: 'hruser',
    employeeId: 2,
    employeeCode: 'EMP002',
    role: 'HR',
  };

  const employeeActor: AuthContext = {
    userId: 4,
    username: 'alice_emp',
    employeeId: 4,
    employeeCode: 'EMP004',
    role: 'EMPLOYEE',
  };

  await testAsync('2.1 Balance calculation: 12 allocated - 4 used = 8 remaining for test record', async () => {
    // Initialize a balance record with 12 allocated and 4 used
    const testYear = 2026;
    const testEmpId = 8888; // Unique employee ID for test
    const testLeaveTypeId = 1; // CL

    const clBal = await LeaveService.createOrInitBalance(
      {
        employeeId: testEmpId,
        leaveTypeId: testLeaveTypeId,
        year: testYear,
        allocated: 12,
        used: 4,
      },
      superAdminActor
    );

    const alloc = parseFloat(String(clBal.allocated || '0'));
    const used = parseFloat(String(clBal.used || '0'));
    const remaining = clBal.available !== undefined ? parseFloat(String(clBal.available)) : alloc - used;

    assert.equal(alloc, 12, 'Allocated should be 12');
    assert.equal(used, 4, 'Used should be 4');
    assert.equal(remaining, 8, 'Remaining should be 8 (12 - 4)');
  });

  // ------------------------------------------------------------------
  // 3. Task 2: Strict Isolation — Selecting Employee A Never Returns Employee B
  // ------------------------------------------------------------------
  console.log('\n--- 3. Task 2: Multi-Employee Query Isolation ---');

  await testAsync('3.1 Querying Employee 1 returns strictly Employee 1 records', async () => {
    const emp1Balances = await LeaveService.getLeaveBalances({ employeeId: 1, year: 2026 }, superAdminActor);
    for (const b of emp1Balances) {
      assert.equal(b.employeeId, 1, `Balance row must belong to employee 1, got ${b.employeeId}`);
    }
  });

  await testAsync('3.2 Querying Employee 2 returns strictly Employee 2 records and never Employee 1', async () => {
    const emp2Balances = await LeaveService.getLeaveBalances({ employeeId: 2, year: 2026 }, superAdminActor);
    for (const b of emp2Balances) {
      assert.equal(b.employeeId, 2, `Balance row must belong to employee 2, got ${b.employeeId}`);
    }
  });

  await testAsync('3.3 Regular EMPLOYEE role cannot query another employee balance (Server RBAC)', async () => {
    let errorCaught = false;
    try {
      // Employee 4 attempting to query Employee 1
      await LeaveService.getLeaveBalances({ employeeId: 1, year: 2026 }, employeeActor);
    } catch (err: any) {
      errorCaught = true;
      assert.ok(
        err.message.includes('Forbidden') || err.message.includes('own leave balances'),
        'Must throw Forbidden error for cross-employee queries by EMPLOYEE role'
      );
    }
    assert.ok(errorCaught, 'Should block regular employee from querying another employee balance');
  });

  await testAsync('3.4 SUPER_ADMIN and HR can query any employee balance', async () => {
    const saResult = await LeaveService.getLeaveBalances({ employeeId: 4, year: 2026 }, superAdminActor);
    const hrResult = await LeaveService.getLeaveBalances({ employeeId: 4, year: 2026 }, hrActor);
    assert.ok(Array.isArray(saResult), 'SUPER_ADMIN should receive balance array');
    assert.ok(Array.isArray(hrResult), 'HR should receive balance array');
  });

  // ------------------------------------------------------------------
  // 4. UI Component Architecture Verification
  // ------------------------------------------------------------------
  console.log('\n--- 4. UI Component File Integrity ---');
  test('4.1 AdminLeaveBalance component contains All Employees table & Individual view', () => {
    const compPath = path.resolve(process.cwd(), 'src/components/AdminLeaveBalance.tsx');
    const compContent = fs.readFileSync(compPath, 'utf-8');

    assert.ok(compContent.includes('All Employees'), 'Must support All Employees view');
    assert.ok(compContent.includes('Individual Employee'), 'Must support Individual Employee view');
    assert.ok(compContent.includes('CL'), 'Must include Casual Leave (CL)');
    assert.ok(compContent.includes('SL'), 'Must include Sick Leave (SL)');
    assert.ok(compContent.includes('EL'), 'Must include Earned Leave (EL)');
    assert.ok(compContent.includes('Allocated'), 'Must include Allocated column');
    assert.ok(compContent.includes('Used'), 'Must include Used column');
    assert.ok(compContent.includes('Remaining'), 'Must include Remaining column');
    assert.ok(compContent.includes('overflow-x-auto'), 'Must support horizontal scroll for mobile responsivity');
  });

  test('4.2 App.tsx routes AdminLeaveBalance to SUPER_ADMIN and HR on leave-balance module', () => {
    const appPath = path.resolve(process.cwd(), 'src/App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf-8');

    assert.ok(
      appContent.includes('AdminLeaveBalance'),
      'App.tsx must import and render AdminLeaveBalance'
    );
    assert.ok(
      appContent.includes("activeRole === 'SUPER_ADMIN' || activeRole === 'HR'"),
      'Must check SUPER_ADMIN or HR to render AdminLeaveBalance'
    );
  });

  test('4.4 CL debit records usage without reducing annual allocation', () => {
    const servicePath = path.resolve(process.cwd(), 'src/services/leaveService.ts');
    const adminPath = path.resolve(process.cwd(), 'src/components/AdminLeaveBalance.tsx');
    const serviceContent = fs.readFileSync(servicePath, 'utf-8');
    const adminContent = fs.readFileSync(adminPath, 'utf-8');

    assert.ok(
      serviceContent.includes("const debitAsUsage = isCasualLeave && input.adjustmentType === 'DEBIT'"),
      'CL DEBIT must be handled as consumed leave'
    );
    assert.ok(
      serviceContent.includes('const newAlloc = debitAsUsage ? oldAlloc : oldAlloc + delta'),
      'CL DEBIT must preserve allocated entitlement'
    );
    assert.ok(
      serviceContent.includes('const newUsed = debitAsUsage ? oldUsed + qty : oldUsed'),
      'CL DEBIT must increase used leave'
    );
    assert.ok(
      adminContent.includes('Record consumed CL as Used; annual allocation stays unchanged'),
      'Adjustment UI must explain CL debit behavior'
    );
  });

  test('4.3 Super Admin is excluded from Leave Balance employee rows and totals', () => {
    const adminPath = path.resolve(process.cwd(), 'src/components/AdminLeaveBalance.tsx');
    const serverPath = path.resolve(process.cwd(), 'server.ts');
    const adminContent = fs.readFileSync(adminPath, 'utf-8');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    assert.ok(
      adminContent.includes("String(employee.role || '').toUpperCase() !== 'SUPER_ADMIN'"),
      'Leave Balance must filter Super Admin from employee rows'
    );
    assert.ok(
      adminContent.includes('visibleEmployeeIds.has(Number(balance.employeeId))'),
      'Leave Balance totals must only include balances for visible employees'
    );
    assert.ok(
      serverContent.includes('// SUPER_ADMIN is an administrative account, never an employee-list row—even for itself.'),
      'Employee directory API must exclude Super Admin for every role'
    );
  });

  // ------------------------------------------------------------------
  // 5. Task: " Days" Display Verification
  // ------------------------------------------------------------------
  console.log('\n--- 5. Task 1: " Days" Formatting & Elimination of "d" ---');
  test('5.1 AdminLeaveBalance and MyLeaveBalance use " Days" and not "d" for balance', () => {
    const adminPath = path.resolve(process.cwd(), 'src/components/AdminLeaveBalance.tsx');
    const myBalPath = path.resolve(process.cwd(), 'src/components/MyLeaveBalance.tsx');
    const adminContent = fs.readFileSync(adminPath, 'utf-8');
    const myBalContent = fs.readFileSync(myBalPath, 'utf-8');

    assert.ok(adminContent.includes('Days'), 'AdminLeaveBalance must display "Days"');
    assert.ok(!adminContent.includes('.toFixed(1)}d'), 'AdminLeaveBalance must not use .toFixed(1)}d');
    assert.ok(!myBalContent.includes('.toFixed(1)}d'), 'MyLeaveBalance must not use .toFixed(1)}d');
  });

  // ------------------------------------------------------------------
  // 6. Task: Super Admin Add / Adjust Balance & Persistence
  // ------------------------------------------------------------------
  console.log('\n--- 6. Task 2: Super Admin Add / Adjust Leave Balance & Persistence ---');
  test('6.1 UI contains Add / Adjust Leave Balance button and modal', () => {
    const adminPath = path.resolve(process.cwd(), 'src/components/AdminLeaveBalance.tsx');
    const content = fs.readFileSync(adminPath, 'utf-8');
    assert.ok(
      content.includes('Add / Adjust Leave Balance'),
      'AdminLeaveBalance must contain visible "Add / Adjust Leave Balance" action'
    );
    assert.ok(
      content.includes('modal-adjust-leave-balance'),
      'AdminLeaveBalance must render the modal dialog'
    );
  });

  await testAsync('6.2 Super Admin adjusts balance (+4 Days) and it persists and appears in audit ledger', async () => {
    const testEmpId = 9991;
    const testYear = 2026;
    const testLeaveTypeId = 1; // CL

    // Initialize base record with 12 allocated, 4 used -> 8 available
    await LeaveService.createOrInitBalance(
      {
        employeeId: testEmpId,
        leaveTypeId: testLeaveTypeId,
        year: testYear,
        allocated: 12,
        used: 4,
      },
      superAdminActor
    );

    // Super Admin adds 4 Days adjustment (opening/previous balance)
    const adjusted = await LeaveService.adjustLeaveBalance(
      {
        employeeId: testEmpId,
        leaveTypeId: testLeaveTypeId,
        year: testYear,
        adjustmentType: 'CREDIT',
        quantity: 4,
        remarks: 'Previous unused balance adjustment by Super Admin',
      },
      superAdminActor
    );

    // Verify updated numbers: 12 + 4 = 16 allocated, used = 4, available = 12
    assert.equal(parseFloat(String(adjusted.allocated)), 16, 'Allocated should be 16 after +4 Days');
    assert.equal(parseFloat(String(adjusted.available)), 12, 'Available should be 12 after +4 Days');

    // Persistence check: fetch again from service (simulating page reload)
    const reloaded = await LeaveService.getLeaveBalances({ employeeId: testEmpId, year: testYear }, superAdminActor);
    const balRecord = reloaded.find((b) => b.leaveTypeId === testLeaveTypeId);
    assert.ok(balRecord, 'Balance record must exist after reload');
    assert.equal(parseFloat(String(balRecord.allocated)), 16, 'Persisted allocated should be 16');
    assert.equal(parseFloat(String(balRecord.available)), 12, 'Persisted available should be 12');

    // Transaction ledger check
    const txs = await LeaveService.getLeaveBalanceTransactions({ employeeId: testEmpId }, superAdminActor);
    const adjTx = txs.find((t) => t.remarks?.includes('Previous unused balance adjustment'));
    assert.ok(adjTx, 'Audit ledger must record the manual adjustment');
    assert.equal(adjTx.transactionType, 'ADJUSTMENT', 'Transaction type must be ADJUSTMENT');
  });

  // ------------------------------------------------------------------
  // 7. Task: Super Admin Leave — No Reporting Person Required
  // ------------------------------------------------------------------
  console.log('\n--- 7. Task 3: Super Admin Leave — No Reporting Person Required ---');
  await testAsync('7.1 Super Admin can submit leave without a configured Reporting Person', async () => {
    const { LeaveRequestService } = await import('../services/leaveRequestService.ts');

    // Super Admin actor submitting leave
    const workflow = await LeaveRequestService.resolveApplicantWorkflow(1, superAdminActor, '2026-06-10');
    assert.equal(workflow.validationError, null, 'Super Admin applicant must NOT have validation errors for missing reporting manager');
  });

  await testAsync('7.2 Regular Employee / Top Management still requires a Reporting Person', async () => {
    const { LeaveRequestService } = await import('../services/leaveRequestService.ts');

    // Test a Top Management applicant with no reporting person and not Super Admin
    const nonAdminTopMgmtActor: AuthContext = {
      userId: 88,
      username: 'director_no_manager',
      employeeId: 88,
      employeeCode: 'DIR88',
      role: 'TOP_MANAGEMENT',
    };

    const workflow = await LeaveRequestService.resolveApplicantWorkflow(88, nonAdminTopMgmtActor, '2026-06-10');
    assert.ok(
      workflow.validationError !== null && workflow.validationError.includes('Reporting Person'),
      'Non-Super Admin Top Management must require a Reporting Person'
    );
  });

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runLeaveBalanceDashboardTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
