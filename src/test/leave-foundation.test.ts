import { LeaveService } from '../services/leaveService.ts';
import { ValidationError } from '../services/validation.ts';
import { AuthContext } from '../types/leave.ts';

const superAdmin: AuthContext = {
  userId: 1,
  username: 'admin',
  role: 'SUPER_ADMIN',
};

const employeeUser: AuthContext = {
  userId: 2,
  employeeId: 101,
  username: 'john.doe',
  role: 'EMPLOYEE',
};

const hrUser: AuthContext = {
  userId: 3,
  username: 'hr.manager',
  role: 'HR',
};

async function runTests() {
  console.log('--- STARTING STEP 3 LEAVE FOUNDATION TEST SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // Reset in-memory state for clean testing
  LeaveService.resetMemoryStores(true);

  // 1. Leave Type Creation
  try {
    const newType = await LeaveService.createLeaveType(
      {
        code: 'MATERNITY',
        name: 'Maternity Leave',
        description: 'Statutory maternity leave for mothers',
        isPaid: true,
        requiresDocument: true,
        supportsHalfDay: false,
      },
      superAdmin
    );
    assert(newType.code === 'MATERNITY' && newType.id > 0, '1. Leave Type Creation');
  } catch (err: any) {
    assert(false, '1. Leave Type Creation', err.message);
  }

  // 2. Duplicate Leave Type Code Rejected
  try {
    await LeaveService.createLeaveType(
      {
        code: 'CL', // Already exists as Casual Leave
        name: 'Casual Duplicate',
      },
      superAdmin
    );
    assert(false, '2. Duplicate Leave Type Code Rejected', 'Expected duplicate code to be rejected');
  } catch (err: any) {
    const isValidation = err instanceof ValidationError || err.message?.includes('already exists');
    assert(isValidation, '2. Duplicate Leave Type Code Rejected', err.message);
  }

  // 3. Leave Type Update
  try {
    const types = await LeaveService.getLeaveTypes({ includeInactive: true });
    const target = types.find((t) => t.code === 'MATERNITY') || types[0];
    const updated = await LeaveService.updateLeaveType(
      target.id,
      {
        name: 'Maternity Benefit Leave',
        supportsHalfDay: true,
      },
      superAdmin
    );
    assert(
      updated.name === 'Maternity Benefit Leave' && updated.supportsHalfDay === true,
      '3. Leave Type Update'
    );
  } catch (err: any) {
    assert(false, '3. Leave Type Update', err.message);
  }

  // 4. Leave Type Activation / Deactivation
  try {
    const types = await LeaveService.getLeaveTypes({ includeInactive: true });
    const target = types[0];
    const deactivated = await LeaveService.updateLeaveType(
      target.id,
      { isActive: false },
      superAdmin
    );
    const activeList = await LeaveService.getLeaveTypes({ includeInactive: false });
    const isExcluded = !activeList.some((t) => t.id === target.id);

    const reactivated = await LeaveService.updateLeaveType(
      target.id,
      { isActive: true },
      superAdmin
    );
    assert(
      !deactivated.isActive && isExcluded && reactivated.isActive,
      '4. Leave Type Activation / Deactivation'
    );
  } catch (err: any) {
    assert(false, '4. Leave Type Activation / Deactivation', err.message);
  }

  // 5. Policy Creation
  let createdPolicyId = 0;
  try {
    const types = await LeaveService.getLeaveTypes();
    const clType = types.find((t) => t.code === 'CL') || types[0];
    const policy = await LeaveService.createLeavePolicy(
      {
        leaveTypeId: clType.id,
        policyName: 'Standard Casual Leave Policy',
        annualAllocation: 12,
        allocationFrequency: 'ANNUAL',
        carryForwardAllowed: false,
        maximumConsecutiveDays: 3,
        minimumNoticeDays: 1,
        sameDayAllowed: true,
      },
      superAdmin
    );
    createdPolicyId = policy.id;
    assert(policy.id > 0 && Number(policy.annualAllocation) === 12, '5. Policy Creation');
  } catch (err: any) {
    assert(false, '5. Policy Creation', err.message);
  }

  // 6. Invalid Policy Rejected (Negative allocation and invalid dates)
  try {
    await LeaveService.createLeavePolicy(
      {
        leaveTypeId: 1,
        policyName: 'Invalid Negative Policy',
        annualAllocation: -5, // Invalid negative
      },
      superAdmin
    );
    assert(false, '6. Invalid Policy Rejected (Negative Allocation)', 'Should have thrown ValidationError');
  } catch (err: any) {
    assert(err instanceof ValidationError, '6. Invalid Policy Rejected (Negative Allocation)');
  }

  try {
    await LeaveService.createLeavePolicy(
      {
        leaveTypeId: 1,
        policyName: 'Invalid Dates Policy',
        annualAllocation: 10,
        effectiveFrom: '2026-12-31',
        effectiveTo: '2026-01-01', // Invalid range: From > To
      },
      superAdmin
    );
    assert(false, '6. Invalid Policy Rejected (Invalid Date Range)', 'Should have thrown ValidationError');
  } catch (err: any) {
    assert(err instanceof ValidationError, '6. Invalid Policy Rejected (Invalid Date Range)');
  }

  // 7. Employee Balance Uniqueness
  try {
    await LeaveService.createOrInitBalance(
      {
        employeeId: 101,
        leaveTypeId: 1,
        year: 2026,
        openingBalance: 5,
        allocated: 10,
      },
      superAdmin
    );

    // Second call with same employee, leaveType, year MUST fail
    let duplicateRejected = false;
    try {
      await LeaveService.createOrInitBalance(
        {
          employeeId: 101,
          leaveTypeId: 1,
          year: 2026,
          openingBalance: 0,
        },
        superAdmin
      );
    } catch (dupErr: any) {
      duplicateRejected = true;
    }
    assert(duplicateRejected, '7. Employee Balance Uniqueness Enforcement');
  } catch (err: any) {
    assert(false, '7. Employee Balance Uniqueness Enforcement', err.message);
  }

  // 8. Balance Retrieval
  try {
    const empBalances = await LeaveService.getLeaveBalances({ employeeId: 101, year: 2026 }, employeeUser);
    assert(
      empBalances.length === 1 &&
      Number(empBalances[0].openingBalance) === 5 &&
      Number(empBalances[0].allocated) === 10 &&
      Number(empBalances[0].available) === 15,
      '8. Balance Retrieval and Formula Check'
    );
  } catch (err: any) {
    assert(false, '8. Balance Retrieval and Formula Check', err.message);
  }

  // 9. Unauthorized Employee Policy Modification Rejected
  try {
    await LeaveService.createLeavePolicy(
      {
        leaveTypeId: 1,
        policyName: 'Hacked Policy',
        annualAllocation: 50,
      },
      employeeUser // EMPLOYEE role must be forbidden
    );
    assert(false, '9. Unauthorized Employee Policy Modification Rejected', 'Employee should not create policy');
  } catch (err: any) {
    assert(err.message?.includes('Forbidden'), '9. Unauthorized Employee Policy Modification Rejected');
  }

  // 10. Unauthorized Balance Modification Rejected
  try {
    await LeaveService.createOrInitBalance(
      {
        employeeId: 101,
        leaveTypeId: 2,
        year: 2026,
        openingBalance: 99,
      },
      employeeUser // EMPLOYEE role must be forbidden
    );
    assert(false, '10. Unauthorized Balance Modification Rejected', 'Employee should not create balance');
  } catch (err: any) {
    assert(err.message?.includes('Forbidden'), '10. Unauthorized Balance Modification Rejected');
  }

  console.log(`\n--- TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
