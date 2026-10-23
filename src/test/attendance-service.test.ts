import { AttendanceService } from '../services/attendanceService.ts';
import { ValidationError } from '../services/validation.ts';
import { AuthContext } from '../types/leave.ts';
import { canAccessAdminTab, canAccessModule, getVisibleAdminTabs, getVisibleNavModules } from '../lib/api.ts';

const HR_USER: AuthContext = { userId: 2, username: 'hruser', role: 'HR', employeeId: 2 };
const EMPLOYEE: AuthContext = { userId: 4, username: 'alice_emp', role: 'EMPLOYEE', employeeId: 4 };

async function runAttendanceServiceTests() {
  let passed = 0;
  let failed = 0;
  const assert = (condition: boolean, name: string) => {
    if (condition) {
      console.log('[PASS] ' + name);
      passed++;
    } else {
      console.error('[FAIL] ' + name);
      failed++;
    }
  };

  let invalidDateRejected = false;
  try {
    await AttendanceService.list('2026-02-31', HR_USER);
  } catch (error) {
    invalidDateRejected = error instanceof ValidationError;
  }
  assert(invalidDateRejected, 'Reject impossible calendar dates such as 2026-02-31');

  let selfPunchRejected = false;
  try {
    await AttendanceService.mark({ employeeId: 4, action: 'CHECK_IN' }, HR_USER);
  } catch (error: any) {
    selfPunchRejected = error instanceof ValidationError && /self-service punch in\/out is disabled/i.test(error.message);
  }
  assert(selfPunchRejected, 'Reject CHECK_IN action even when called by HR');

  let employeeWriteDenied = false;
  try {
    await AttendanceService.mark({ employeeId: 4, status: 'PRESENT' }, EMPLOYEE);
  } catch (error: any) {
    employeeWriteDenied = /forbidden/i.test(String(error?.message || error));
  }
  assert(employeeWriteDenied, 'Deny attendance writes from employee role');

  let missingEmployeeRejected = false;
  try {
    await AttendanceService.mark({ status: 'PRESENT' }, HR_USER);
  } catch (error) {
    missingEmployeeRejected = error instanceof ValidationError;
  }
  assert(missingEmployeeRejected, 'Require HR to select an explicit employee');

  assert(canAccessModule('attendance', 'EMPLOYEE'), 'Employee role can access read-only My Attendance module');
  assert(getVisibleNavModules('EMPLOYEE').includes('attendance'), 'My Attendance appears in eligible role navigation');
  assert(canAccessAdminTab('attendance', 'HR'), 'HR can access attendance administration tab');
  assert(getVisibleAdminTabs('HR').includes('attendance'), 'Attendance is included in visible admin tabs');

  console.log(`Attendance tests: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

runAttendanceServiceTests().catch((error) => {
  console.error('Attendance tests failed unexpectedly:', error);
  process.exitCode = 1;
});
