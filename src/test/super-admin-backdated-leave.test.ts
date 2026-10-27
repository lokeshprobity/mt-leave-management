import assert from 'node:assert/strict';
import { UserService } from '../services/userService.ts';
import { ShiftService } from '../services/shiftService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { HolidayService } from '../services/holidayService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { AuthContext } from '../types/leave.ts';

const SUPER_ADMIN: AuthContext = {
  userId: 1,
  username: 'superadmin',
  role: 'SUPER_ADMIN',
  operationalRole: 'TOP_MANAGEMENT',
  employeeId: 1,
};

const EMPLOYEE: AuthContext = {
  userId: 4,
  username: 'alice_emp',
  role: 'EMPLOYEE',
  operationalRole: 'EMPLOYEE',
  employeeId: 4,
};

async function runSuperAdminBackdatedLeaveTest() {
  UserService.resetMemoryStores();
  ShiftService.resetMemoryStores();
  WorkingDaysService.resetMemoryHolidays();
  HolidayService.resetMemoryHolidays();
  LeaveService.resetMemoryStores();
  LeaveRequestService.resetMemoryStores();

  await UserService.updateEmployee(4, { departmentId: 2, reportingManagerId: 5 }, SUPER_ADMIN);

  const leaveTypes = await LeaveService.getLeaveTypes();
  const clType = leaveTypes.find((item) => item.code.trim().toUpperCase() === 'CL');
  assert.ok(clType, 'Casual Leave must exist for this regression test');

  // The Super Admin can apply on behalf of a regular employee for a past date.
  const adminRequest = await LeaveRequestService.submitLeaveRequest(
    {
      employeeId: 4,
      submittedOnBehalfOf: true,
      leaveTypeId: clType.id,
      startDate: '2026-10-26',
      endDate: '2026-10-26',
      dayType: 'HALF_DAY',
      halfDayPeriod: 'FIRST_HALF',
      reason: 'Employee could not submit the leave during the system outage.',
      reasonCategory: 'OTHER',
    },
    SUPER_ADMIN
  );
  assert.equal(adminRequest.employeeId, 4, 'The request must belong to the selected employee');
  assert.equal(adminRequest.applicantRole, 'EMPLOYEE', 'The request must retain the actual employee role');
  assert.equal(adminRequest.status, 'PENDING', 'The request must continue through normal approval routing');

  // A regular employee remains subject to the existing back-date/cutoff restrictions.
  let regularEmployeeBlocked = false;
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: clType.id,
        startDate: '2026-10-23',
        endDate: '2026-10-23',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'FIRST_HALF',
        reason: 'Employee is attempting to submit a leave request after the allowed cutoff.',
        reasonCategory: 'OTHER',
      },
      EMPLOYEE
    );
  } catch (error: any) {
    regularEmployeeBlocked =
      String(error?.message || '').includes('cutoff') ||
      String(error?.message || '').includes('past date');
  }
  assert.equal(regularEmployeeBlocked, true, 'Regular employees must remain blocked by existing cutoff rules');

  const preview = await LeaveRequestService.calculatePreview(
    {
      employeeId: 4,
      submittedOnBehalfOf: true,
      leaveTypeId: clType.id,
      startDate: '2026-10-22',
      endDate: '2026-10-22',
      dayType: 'HALF_DAY',
      halfDayPeriod: 'FIRST_HALF',
      reasonCategory: 'OTHER',
    },
    SUPER_ADMIN
  );
  assert.equal(
    preview.validationErrors.some((message) => /cutoff|past date|cannot be submitted/i.test(message)),
    false,
    'Super Admin on-behalf preview must not report date-cutoff errors'
  );

  console.log('[PASS] Super Admin backdated leave, regular-user cutoff protection, and preview exception.');
}

runSuperAdminBackdatedLeaveTest().catch((error) => {
  console.error('[FAIL] Super Admin backdated leave regression:', error);
  process.exit(1);
});
