import { LeaveService } from '../services/leaveService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { LeaveClassificationService } from '../services/leaveClassificationService.ts';
import { AttachmentService } from '../services/attachmentService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { AuthContext } from '../types/leave.ts';

const EMP_1_AUTH: AuthContext = {
  userId: 1,
  username: 'emp1',
  role: 'EMPLOYEE',
  employeeId: 101,
};

const EMP_2_AUTH: AuthContext = {
  userId: 2,
  username: 'emp2',
  role: 'EMPLOYEE',
  employeeId: 102,
};

const ADMIN_AUTH: AuthContext = {
  userId: 99,
  username: 'admin',
  role: 'SUPER_ADMIN',
  employeeId: 999,
};

async function runEngineTests() {
  console.log('--- STARTING STEP 4 LEAVE APPLICATION ENGINE TEST SUITE ---');
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

  function resetState() {
    LeaveService.resetMemoryStores();
    WorkingDaysService.resetMemoryHolidays();
    LeaveClassificationService.resetTimingConfig();
    LeaveRequestService.resetMemoryStores();
    LeaveClassificationService.setCustomTimingConfig({
      officeStartTime: '08:30',
      normalLeaveCutoffTime: '07:00',
      timezone: 'UTC',
    });
  }

  // 1. Valid standard leave submission
  resetState();
  try {
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-10',
        endDate: '2026-06-12',
        dayType: 'FULL_DAY',
        reason: 'Family vacation trip',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(
      req.requestNumber.startsWith('MTL-2026-') &&
        req.status === 'PENDING' &&
        Number(req.totalDays) === 3 &&
        req.requestClassification === 'NORMAL_LEAVE_REQUEST',
      '1. Valid standard leave submission creates request with status PENDING'
    );
  } catch (e: any) {
    assert(false, '1. Valid standard leave submission', e.message);
  }

  // 2. Insufficient balance rejection
  resetState();
  try {
    const policies = await LeaveService.getLeavePolicies({ leaveTypeId: 1 });
    await LeaveService.updateLeavePolicy(policies[0].id, { maximumConsecutiveDays: 30 }, ADMIN_AUTH);
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-01',
        endDate: '2026-06-19', // 15 working days > 12 available
        dayType: 'FULL_DAY',
        reason: 'Extended break',
        applicationTimestampOverride: '2026-05-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '2. Insufficient balance is rejected with clear error message', 'Did not throw');
  } catch (e: any) {
    assert(
      /Insufficient leave balance/i.test(e.message),
      '2. Insufficient balance is rejected with clear error message',
      e.message
    );
  }

  // 3. Direct date overlap rejection
  resetState();
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-15',
        endDate: '2026-06-17',
        dayType: 'FULL_DAY',
        reason: 'Conference trip',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-16',
        endDate: '2026-06-18',
        dayType: 'FULL_DAY',
        reason: 'Personal work',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '3. Direct date overlap is rejected', 'Did not throw');
  } catch (e: any) {
    assert(
      /Overlapping leave request detected/i.test(e.message),
      '3. Direct date overlap is rejected with existing request reference',
      e.message
    );
  }

  // 4. Enclosed date range overlap is rejected
  resetState();
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-15',
        endDate: '2026-06-17',
        dayType: 'FULL_DAY',
        reason: 'Summer vacation',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 2,
        startDate: '2026-06-16',
        endDate: '2026-06-16',
        dayType: 'FULL_DAY',
        reason: 'Medical checkup',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '4. Enclosed date range overlap is rejected', 'Did not throw');
  } catch (e: any) {
    assert(
      /Overlapping leave request detected/i.test(e.message),
      '4. Enclosed date range overlap is rejected',
      e.message
    );
  }

  // 5. Cancelled request frees up the dates for re-application
  resetState();
  try {
    const original = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-07-06',
        endDate: '2026-07-08',
        dayType: 'FULL_DAY',
        reason: 'Planning trip',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    await LeaveRequestService.cancelLeaveRequest(original.id, 'Trip postponed', EMP_1_AUTH);
    const reapply = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-07-06',
        endDate: '2026-07-08',
        dayType: 'FULL_DAY',
        reason: 'Trip rescheduled',
        applicationTimestampOverride: '2026-06-02T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(
      reapply && reapply.status === 'PENDING',
      '5. Cancelled request frees up the dates for re-application'
    );
  } catch (e: any) {
    assert(false, '5. Cancelled request frees up dates', e.message);
  }

  // 6. Same-day half-day leave applied before cutoff is classified as NORMAL_LEAVE_REQUEST
  resetState();
  try {
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 2, // Sick Leave allows same-day
        startDate: '2026-06-10',
        endDate: '2026-06-10',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'FIRST_HALF',
        reason: 'Sudden fever',
        applicationTimestampOverride: '2026-06-10T06:59:00Z',
      },
      EMP_1_AUTH
    );
    assert(
      req.requestClassification === 'NORMAL_LEAVE_REQUEST',
      '6. Same-day leave applied before cutoff is classified as NORMAL_LEAVE_REQUEST'
    );
  } catch (e: any) {
    assert(false, '6. Same-day leave before cutoff', e.message);
  }

  // 7. Same-day leave rejected when policy disallows same_day_allowed
  resetState();
  try {
    const policies = await LeaveService.getLeavePolicies({ leaveTypeId: 1 });
    await LeaveService.updateLeavePolicy(policies[0].id, { sameDayAllowed: false }, ADMIN_AUTH);
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-10',
        endDate: '2026-06-10',
        dayType: 'FULL_DAY',
        reason: 'Emergency day off',
        applicationTimestampOverride: '2026-06-10T06:30:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '7. Same-day leave rejected by policy', 'Did not throw');
  } catch (e: any) {
    assert(
      /Same-day leave is not permitted/i.test(e.message),
      '7. Same-day leave rejected when policy disallows same-day applications',
      e.message
    );
  }

  // 8. Normal cutoff exact match (07:00:00 -> NORMAL_LEAVE_REQUEST)
  resetState();
  try {
    const res = await LeaveClassificationService.classifyLeaveRequest(
      '2026-06-10T07:00:00Z',
      '2026-06-10',
      { officeStartTime: '08:30', normalLeaveCutoffTime: '07:00', timezone: 'UTC' }
    );
    assert(
      res.classification === 'NORMAL_LEAVE_REQUEST' && !res.isLate && res.noticeMinutes === 90,
      '8. Exact 07:00:00 application is classified as NORMAL_LEAVE_REQUEST'
    );
  } catch (e: any) {
    assert(false, '8. Cutoff 07:00:00', e.message);
  }

  // 9. Late leave exact boundary (07:01:00 -> LATE_LEAVE_REQUEST)
  resetState();
  try {
    const res = await LeaveClassificationService.classifyLeaveRequest(
      '2026-06-10T07:01:00Z',
      '2026-06-10',
      { officeStartTime: '08:30', normalLeaveCutoffTime: '07:00', timezone: 'UTC' }
    );
    assert(
      res.classification === 'LATE_LEAVE_REQUEST' && res.isLate && res.noticeMinutes === 89,
      '9. Exact 07:01:00 application is classified as LATE_LEAVE_REQUEST'
    );
  } catch (e: any) {
    assert(false, '9. Late leave 07:01:00', e.message);
  }

  // 10. Late leave before office start (08:29:00 -> LATE_LEAVE_REQUEST)
  resetState();
  try {
    const res = await LeaveClassificationService.classifyLeaveRequest(
      '2026-06-10T08:29:00Z',
      '2026-06-10',
      { officeStartTime: '08:30', normalLeaveCutoffTime: '07:00', timezone: 'UTC' }
    );
    assert(
      res.classification === 'LATE_LEAVE_REQUEST' && res.isLate && res.noticeMinutes === 1,
      '10. Exact 08:29:00 application is classified as LATE_LEAVE_REQUEST'
    );
  } catch (e: any) {
    assert(false, '10. Late leave 08:29:00', e.message);
  }

  // 11. Post-start exact boundary (08:30:00 -> POST_START_LEAVE_REQUEST)
  resetState();
  try {
    const res = await LeaveClassificationService.classifyLeaveRequest(
      '2026-06-10T08:30:00Z',
      '2026-06-10',
      { officeStartTime: '08:30', normalLeaveCutoffTime: '07:00', timezone: 'UTC' }
    );
    assert(
      res.classification === 'POST_START_LEAVE_REQUEST' && res.isPostStart && res.noticeMinutes === 0,
      '11. Exact 08:30:00 application is classified as POST_START_LEAVE_REQUEST'
    );
  } catch (e: any) {
    assert(false, '11. Post-start 08:30:00', e.message);
  }

  // 12. Post-start after office start (08:31:00 -> POST_START_LEAVE_REQUEST)
  resetState();
  try {
    const res = await LeaveClassificationService.classifyLeaveRequest(
      '2026-06-10T08:31:00Z',
      '2026-06-10',
      { officeStartTime: '08:30', normalLeaveCutoffTime: '07:00', timezone: 'UTC' }
    );
    assert(
      res.classification === 'POST_START_LEAVE_REQUEST' && res.isPostStart && res.noticeMinutes === -1,
      '12. Exact 08:31:00 application is classified as POST_START_LEAVE_REQUEST'
    );
  } catch (e: any) {
    assert(false, '12. Post-start 08:31:00', e.message);
  }

  // 13. Late leave rejected when policy disallows
  resetState();
  try {
    const policies = await LeaveService.getLeavePolicies({ leaveTypeId: 2 });
    await LeaveService.updateLeavePolicy(
      policies[0].id,
      { lateRequestAllowed: false, emergencyExceptionAllowed: false },
      ADMIN_AUTH
    );
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 2,
        startDate: '2026-06-10',
        endDate: '2026-06-10',
        dayType: 'FULL_DAY',
        reasonCategory: 'OTHER',
        reason: 'Woke up late',
        applicationTimestampOverride: '2026-06-10T07:30:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '13. Late leave rejected when policy disallows', 'Did not throw');
  } catch (e: any) {
    assert(
      /Late leave requests are not permitted/i.test(e.message),
      '13. Late leave rejected when policy disallows late requests and no emergency exception',
      e.message
    );
  }

  // 14. Post-start leave rejected when policy disallows
  resetState();
  try {
    const policies = await LeaveService.getLeavePolicies({ leaveTypeId: 2 });
    await LeaveService.updateLeavePolicy(
      policies[0].id,
      { postStartRequestAllowed: false, emergencyExceptionAllowed: false },
      ADMIN_AUTH
    );
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 2,
        startDate: '2026-06-10',
        endDate: '2026-06-10',
        dayType: 'FULL_DAY',
        reasonCategory: 'OTHER',
        reason: 'Severe illness in the morning',
        applicationTimestampOverride: '2026-06-10T09:15:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '14. Post-start leave rejected when policy disallows', 'Did not throw');
  } catch (e: any) {
    assert(
      /Post-start leave requests.*not permitted/i.test(e.message),
      '14. Post-start leave rejected when policy disallows post-start requests and no exception',
      e.message
    );
  }

  // 15. Half-day leave supported and allowed (0.5 days)
  resetState();
  try {
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-10',
        endDate: '2026-06-10',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'FIRST_HALF',
        reason: 'Morning doctor visit',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(
      req.dayType === 'HALF_DAY' && req.halfDayPeriod === 'FIRST_HALF' && Number(req.totalDays) === 0.5,
      '15. Half-day leave calculation yields exactly 0.5 days'
    );
  } catch (e: any) {
    assert(false, '15. Half-day calculation', e.message);
  }

  // 16. Same-day half-day is allowed even when the full same-day policy toggle is disabled.
  resetState();
  try {
    const policies = await LeaveService.getLeavePolicies({ leaveTypeId: 1 });
    await LeaveService.updateLeavePolicy(policies[0].id, { sameDayAllowed: false }, ADMIN_AUTH);
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-10',
        endDate: '2026-06-10',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'FIRST_HALF',
        reason: 'Same-day appointment before cutoff',
        applicationTimestampOverride: '2026-06-10T06:59:00Z',
      },
      EMP_1_AUTH
    );
    assert(req.dayType === 'HALF_DAY' && Number(req.totalDays) === 0.5,
      '16. Same-day half-day allowed before cutoff even if sameDayAllowed is false');
  } catch (e: any) {
    assert(false, '16. Same-day half-day policy exception', e.message);
  }

  // 17. Half-day request exactly 30 calendar days ahead is allowed.
  resetState();
  try {
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-07-01',
        endDate: '2026-07-01',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'FIRST_HALF',
        reason: 'Appointment planned in advance',
        applicationTimestampOverride: '2026-06-01T06:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(req.dayType === 'HALF_DAY' && Number(req.totalDays) === 0.5,
      '17. Half-day request at the 30-day limit is allowed');
  } catch (e: any) {
    assert(false, '17. Half-day 30-day boundary', e.message);
  }

  // 18. Half-day request 31 calendar days ahead is rejected.
  resetState();
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-07-02',
        endDate: '2026-07-02',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'FIRST_HALF',
        reason: 'Appointment planned too far ahead',
        applicationTimestampOverride: '2026-06-01T06:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '18. Half-day request 31 days ahead is rejected', 'Did not throw');
  } catch (e: any) {
    assert(
      /within 30 days in advance/i.test(e.message),
      '18. Half-day request 31 days ahead is rejected',
      e.message
    );
  }

  // 19. Half-day leave rejected when leave type does not support
  resetState();
  try {
    const customType = await LeaveService.createLeaveType(
      { code: 'SPCL', name: 'Special Project Leave', supportsHalfDay: false },
      ADMIN_AUTH
    );
    await LeaveService.createLeavePolicy(
      { policyName: 'Special Policy', leaveTypeId: customType.id, annualAllocation: 10, halfDayAllowed: false, negativeBalanceAllowed: true },
      ADMIN_AUTH
    );
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: customType.id,
        startDate: '2026-06-10',
        endDate: '2026-06-10',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'SECOND_HALF',
        reason: 'Afternoon off',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '16. Half-day rejected when leave type does not support', 'Did not throw');
  } catch (e: any) {
    assert(
      /does not support half-day/i.test(e.message),
      '16. Half-day leave rejected when leave type supports_half_day is false',
      e.message
    );
  }

  // 17. Half-day leave rejected when policy does not allow
  resetState();
  try {
    const policies = await LeaveService.getLeavePolicies({ leaveTypeId: 1 });
    await LeaveService.updateLeavePolicy(policies[0].id, { halfDayAllowed: false }, ADMIN_AUTH);
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-10',
        endDate: '2026-06-10',
        dayType: 'HALF_DAY',
        halfDayPeriod: 'FIRST_HALF',
        reason: 'Personal work',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '17. Half-day rejected when policy disallows', 'Did not throw');
  } catch (e: any) {
    assert(
      /does not permit half-day leaves/i.test(e.message),
      '17. Half-day leave rejected when policy half_day_allowed is false',
      e.message
    );
  }

  // 18. Document mandatory: rejected when document missing
  resetState();
  try {
    const customType = await LeaveService.createLeaveType(
      { code: 'MED_DOC', name: 'Medical Hospitalization', requiresDocument: true },
      ADMIN_AUTH
    );
    await LeaveService.createLeavePolicy(
      { policyName: 'Hospitalization Policy', leaveTypeId: customType.id, annualAllocation: 10, documentRequired: true, negativeBalanceAllowed: true },
      ADMIN_AUTH
    );
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: customType.id,
        startDate: '2026-06-10',
        endDate: '2026-06-11',
        dayType: 'FULL_DAY',
        reason: 'Surgery',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '18. Document mandatory rejected when missing', 'Did not throw');
  } catch (e: any) {
    assert(
      /Supporting document is mandatory/i.test(e.message),
      '18. Document mandatory: rejected when supporting document is missing',
      e.message
    );
  }

  // 19. Document mandatory: succeeds when valid document provided
  resetState();
  try {
    const customType = await LeaveService.createLeaveType(
      { code: 'MED_DOC2', name: 'Medical Certificate Leave', requiresDocument: true },
      ADMIN_AUTH
    );
    await LeaveService.createLeavePolicy(
      { policyName: 'Medical Certificate Policy', leaveTypeId: customType.id, annualAllocation: 10, documentRequired: true, negativeBalanceAllowed: true },
      ADMIN_AUTH
    );
    const processedDoc = AttachmentService.validateAndProcessAttachment(
      'doctor_slip.pdf',
      1024 * 50,
      'application/pdf'
    );
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: customType.id,
        startDate: '2026-06-10',
        endDate: '2026-06-11',
        dayType: 'FULL_DAY',
        reason: 'Under medical care',
        attachmentPath: processedDoc.safeStoragePath,
        attachmentName: processedDoc.sanitizedOriginalName,
        attachmentSize: 51200,
        attachmentMime: 'application/pdf',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(
      req.attachmentRequired && req.attachmentPath === processedDoc.safeStoragePath,
      '19. Document mandatory: succeeds when valid processed document is attached'
    );
  } catch (e: any) {
    assert(false, '19. Document mandatory succeeds', e.message);
  }

  // 20. Minimum notice days: rejected when notice is insufficient
  resetState();
  try {
    const policies = await LeaveService.getLeavePolicies({ leaveTypeId: 1 });
    await LeaveService.updateLeavePolicy(policies[0].id, { minimumNoticeDays: 2 }, ADMIN_AUTH);
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-10',
        endDate: '2026-06-11',
        dayType: 'FULL_DAY',
        reasonCategory: 'OTHER',
        reason: 'Short notice leave',
        applicationTimestampOverride: '2026-06-09T09:00:00Z', // 1 day notice instead of 2
      },
      EMP_1_AUTH
    );
    assert(false, '20. Advance notice required rejected', 'Did not throw');
  } catch (e: any) {
    assert(
      /requires at least 2 day\(s\) advance notice/i.test(e.message),
      '20. Minimum notice days: rejected when notice is insufficient',
      e.message
    );
  }

  // 21. Advance notice emergency exception: succeeds for recognized emergency reason
  resetState();
  try {
    const policies = await LeaveService.getLeavePolicies({ leaveTypeId: 1 });
    await LeaveService.updateLeavePolicy(policies[0].id, { minimumNoticeDays: 2 }, ADMIN_AUTH);
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-10',
        endDate: '2026-06-11',
        dayType: 'FULL_DAY',
        reasonCategory: 'FAMILY_EMERGENCY',
        reason: 'Immediate urgent family medical assistance required',
        applicationTimestampOverride: '2026-06-09T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(
      req && req.status === 'PENDING',
      '21. Advance notice emergency exception: succeeds for recognized emergency reason'
    );
  } catch (e: any) {
    assert(false, '21. Advance notice emergency exception', e.message);
  }

  // 22. Working days excludes Saturday and Sunday by default
  resetState();
  try {
    const result = await WorkingDaysService.calculateWorkingDays(
      '2026-06-05',
      '2026-06-08',
      'FULL_DAY',
      { weeklyOffs: [0, 6] }
    );
    assert(
      result.totalDays === 2 &&
        result.workingDays.length === 2 &&
        result.weeklyOffDays.length === 2,
      '22. Working days excludes Saturday and Sunday by default'
    );
  } catch (e: any) {
    assert(false, '22. Working days weekly offs', e.message);
  }

  // 23. Working days excludes official holidays (e.g. 2026-10-02 Gandhi Jayanti)
  resetState();
  try {
    const result = await WorkingDaysService.calculateWorkingDays(
      '2026-10-01',
      '2026-10-05',
      'FULL_DAY'
    );
    assert(
      result.holidayDays.length === 1 &&
        result.holidayDays[0].name === 'Gandhi Jayanti' &&
        result.totalDays === 3,
      '23. Working days excludes official holidays (e.g. 2026-10-02 Gandhi Jayanti; Thu, Sat, Mon = 3 working days)'
    );
  } catch (e: any) {
    assert(false, '23. Working days holidays', e.message);
  }

  // 24. Request over weekly-off-only date (Sunday) contains 0 working days and is rejected
  resetState();
  try {
    await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-07',
        endDate: '2026-06-07',
        dayType: 'FULL_DAY',
        reason: 'Sunday leave',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    assert(false, '24. 0 working days rejected', 'Did not throw');
  } catch (e: any) {
    assert(
      /contains 0 working days/i.test(e.message),
      '24. Request over weekly-off-only dates contains 0 working days and is rejected',
      e.message
    );
  }

  // 25. Cancellation by owner employee updates status to CANCELLED and records audit event
  resetState();
  try {
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-22',
        endDate: '2026-06-24',
        dayType: 'FULL_DAY',
        reason: 'Summer vacation',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );
    const cancelled = await LeaveRequestService.cancelLeaveRequest(
      req.id,
      'Plans changed',
      EMP_1_AUTH
    );
    const details = await LeaveRequestService.getLeaveRequestById(req.id, EMP_1_AUTH);
    const cancelEvent = details?.events.find((e) => e.eventType === 'CANCELLED');
    assert(
      cancelled.status === 'CANCELLED' &&
        details?.request.status === 'CANCELLED' &&
        cancelEvent !== undefined &&
        cancelEvent.remarks === 'Plans changed',
      '25. Cancellation by owner employee updates status to CANCELLED and records audit event'
    );
  } catch (e: any) {
    assert(false, '25. Cancellation by owner employee', e.message);
  }

  // 26. Employee 2 cannot view or cancel Employee 1’s leave request
  resetState();
  try {
    const req = await LeaveRequestService.submitLeaveRequest(
      {
        leaveTypeId: 1,
        startDate: '2026-06-25',
        endDate: '2026-06-26',
        dayType: 'FULL_DAY',
        reason: 'Personal affairs',
        applicationTimestampOverride: '2026-06-01T09:00:00Z',
      },
      EMP_1_AUTH
    );

    let viewBlocked = false;
    try {
      await LeaveRequestService.getLeaveRequestById(req.id, EMP_2_AUTH);
    } catch {
      viewBlocked = true;
    }

    let cancelBlocked = false;
    try {
      await LeaveRequestService.cancelLeaveRequest(req.id, 'Malicious cancel', EMP_2_AUTH);
    } catch {
      cancelBlocked = true;
    }

    assert(
      viewBlocked && cancelBlocked,
      '26. Employee 2 cannot view or cancel Employee 1’s leave request (Forbidden)'
    );
  } catch (e: any) {
    assert(false, '26. Cross-employee protection', e.message);
  }

  console.log(`--- STEP 4 ENGINE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runEngineTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
