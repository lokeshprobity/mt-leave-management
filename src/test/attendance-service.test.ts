import fs from 'node:fs';
import { AttendanceService } from '../services/attendanceService.ts';
import { ValidationError } from '../services/validation.ts';
import { AuthContext } from '../types/leave.ts';
import { canAccessAdminTab, canAccessModule, getVisibleAdminTabs, getVisibleNavModules } from '../lib/api.ts';

const SUPER_ADMIN: AuthContext = { userId: 1, username: 'superadmin', role: 'SUPER_ADMIN', employeeId: 1 };
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
    await AttendanceService.list('2026-02-31', SUPER_ADMIN);
  } catch (error) {
    invalidDateRejected = error instanceof ValidationError;
  }
  assert(invalidDateRejected, 'Reject impossible calendar dates such as 2026-02-31');

  let selfPunchRejected = false;
  try {
    await AttendanceService.mark({ employeeId: 4, action: 'CHECK_IN' }, SUPER_ADMIN);
  } catch (error: any) {
    selfPunchRejected = error instanceof ValidationError && /self-service punch in\/out is disabled/i.test(error.message);
  }
  assert(selfPunchRejected, 'Reject CHECK_IN action even when called by Super Admin');

  let employeeWriteDenied = false;
  try {
    await AttendanceService.mark({ employeeId: 4, status: 'PRESENT' }, EMPLOYEE);
  } catch (error: any) {
    employeeWriteDenied = /forbidden/i.test(String(error?.message || error));
  }
  assert(employeeWriteDenied, 'Deny attendance writes from employee role');

  let missingEmployeeRejected = false;
  try {
    await AttendanceService.mark({ status: 'PRESENT' }, SUPER_ADMIN);
  } catch (error) {
    missingEmployeeRejected = error instanceof ValidationError;
  }
  assert(missingEmployeeRejected, 'Require Super Admin to select an explicit employee');

  let hrReadDenied = false;
  try { await AttendanceService.list('2026-10-23', HR_USER); } catch (error: any) { hrReadDenied = /forbidden/i.test(String(error?.message || error)); }
  assert(hrReadDenied, 'Deny HR access while attendance is Super Admin-only');
  assert(!canAccessModule('attendance', 'EMPLOYEE'), 'Employee cannot access attendance module');
  assert(!getVisibleNavModules('EMPLOYEE').includes('attendance'), 'Attendance is absent from employee navigation');
  assert(!canAccessAdminTab('attendance', 'HR'), 'HR cannot access attendance administration tab');
  assert(!getVisibleAdminTabs('HR').includes('attendance'), 'Attendance is absent from HR admin tabs');
  assert(canAccessAdminTab('attendance', 'SUPER_ADMIN'), 'Super Admin can access attendance administration tab');
  assert(getVisibleAdminTabs('SUPER_ADMIN').includes('attendance'), 'Attendance appears in Super Admin admin tabs');

  const attendanceServiceSource = fs.readFileSync('src/services/attendanceService.ts', 'utf8');
  assert(!attendanceServiceSource.includes('statusFromCheckIn') && !attendanceServiceSource.includes("status = derivedStatus"),
    'Preserve the attendance status explicitly selected by Super Admin, regardless of check-in time');

  const attendanceUi = fs.readFileSync('src/components/AttendanceAdmin.tsx', 'utf8');
  assert(!attendanceUi.includes('Check In</button>') && !attendanceUi.includes('Check Out</button>'),
    'Attendance UI contains no employee Punch In/Punch Out buttons');

  console.log(`Attendance tests: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

runAttendanceServiceTests().catch((error) => {
  console.error('Attendance tests failed unexpectedly:', error);
  process.exitCode = 1;
});
