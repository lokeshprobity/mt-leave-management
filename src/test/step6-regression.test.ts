import { HolidayService } from '../services/holidayService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { NotificationService } from '../services/notificationService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { ApprovalService } from '../services/approvalService.ts';
import { AuthContext } from '../types/leave.ts';

const EMP_AUTH: AuthContext = {
  userId: 4,
  username: 'alice_emp',
  role: 'EMPLOYEE',
  employeeId: 4,
};

const TL_AUTH: AuthContext = {
  userId: 5,
  username: 'tl_robert',
  role: 'TEAM_LEADER',
  employeeId: 5,
};

const HR_AUTH: AuthContext = {
  userId: 2,
  username: 'hr_tester',
  role: 'HR',
  employeeId: 501,
};

const MGMT_AUTH: AuthContext = {
  userId: 3,
  username: 'mgmt_tester',
  role: 'TOP_MANAGEMENT',
  employeeId: 901,
};

const ADMIN_AUTH: AuthContext = {
  userId: 1,
  username: 'admin_tester',
  role: 'SUPER_ADMIN',
  employeeId: 999,
};

async function runStep6RegressionTests() {
  console.log('=== STARTING STEP 6 CALENDAR & NOTIFICATION REGRESSION TEST SUITE ===');
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
    HolidayService.resetMemoryHolidays();
    NotificationService.resetMemoryNotifications();
    LeaveRequestService.resetMemoryStores();
  }

  // ----------------------------------------------------
  // SECTION 1: HOLIDAY MANAGEMENT & DATES
  // ----------------------------------------------------
  console.log('\n--- 1. Holiday Calendar Management ---');
  resetState();

  // Test 1: Fetch initial holidays
  const initialHolidays = await HolidayService.getHolidays({ year: 2026 });
  assert(initialHolidays.length >= 4, '1. Initial holiday calendar contains default gazetted holidays');

  // Test 2: Create new holiday
  const newHoliday = await HolidayService.createHoliday({
    holidayDate: '2026-11-15',
    holidayName: 'Special Company Foundation Day',
    description: 'Annual corporate celebration',
    isHalfDay: false,
    isOptional: false,
    isActive: true,
  });
  assert(newHoliday.id > 0 && newHoliday.holidayDate === '2026-11-15', '2. New holiday created successfully with valid date');

  // Test 3: Duplicate holiday date rejected
  let duplicateThrew = false;
  try {
    await HolidayService.createHoliday({
      holidayDate: '2026-11-15',
      holidayName: 'Conflicting Holiday',
    });
  } catch (err: any) {
    duplicateThrew = true;
    assert(err.message.includes('already configured') || err.message.includes('already exists'), '3. Duplicate holiday date correctly rejected with conflict error');
  }
  assert(duplicateThrew, '3. Duplicate holiday creation threw ValidationError');

  // Test 4: Invalid date format rejected
  let invalidDateThrew = false;
  try {
    await HolidayService.createHoliday({
      holidayDate: '15-11-2026',
      holidayName: 'Wrong Format Day',
    });
  } catch (err: any) {
    invalidDateThrew = true;
    assert(err.message.includes('YYYY-MM-DD'), '4. Invalid date format rejected');
  }
  assert(invalidDateThrew, '4. Invalid holiday date format threw ValidationError');

  // Test 5: Update holiday
  const updatedHoliday = await HolidayService.updateHoliday(newHoliday.id, {
    holidayName: 'Special Corporate Foundation Day (Updated)',
    isHalfDay: true,
  });
  assert(
    updatedHoliday.holidayName === 'Special Corporate Foundation Day (Updated)' && updatedHoliday.isHalfDay === true,
    '5. Holiday updated successfully (name and half-day flag)'
  );

  // Test 6: Working day calculation incorporates new holiday
  // 2026-11-15 is Sunday, let's test a weekday holiday: 2026-11-18 (Wednesday)
  await HolidayService.createHoliday({
    holidayDate: '2026-11-18',
    holidayName: 'Midweek Festival Day',
    isHalfDay: false,
    isActive: true,
  });
  // Calculate working days from Mon 2026-11-16 to Fri 2026-11-20 (5 calendar days, 1 holiday -> 4 working days)
  const calcResult = await WorkingDaysService.calculateWorkingDays(
    '2026-11-16',
    '2026-11-20',
    'FULL_DAY'
  );
  assert(calcResult.totalDays === 4, '6. Working days calculation correctly excludes newly configured holiday (5 days - 1 holiday = 4)');
  assert(calcResult.holidayDays.some((h) => h.date === '2026-11-18'), '6. Working days breakdown marks date as holiday');

  // Test 7: Delete holiday
  await HolidayService.deleteHoliday(newHoliday.id);
  const fetchedDeleted = await HolidayService.getHolidayById(newHoliday.id);
  assert(fetchedDeleted === null, '7. Holiday deleted successfully and no longer returned');

  // ----------------------------------------------------
  // SECTION 2: WEEKLY OFF CONFIGURATION
  // ----------------------------------------------------
  console.log('\n--- 2. Weekly-Off Configuration ---');
  // Default is [0] (Sunday only, Mon-Sat working)
  const defaultOffs = await WorkingDaysService.getWeeklyOffs();
  assert(defaultOffs.length === 1 && defaultOffs.includes(0) && !defaultOffs.includes(6), '8. Default weekly offs is Sunday (0) only (Monday to Saturday working)');

  // Calculate days for a weekend: 2026-11-21 (Sat) to 2026-11-22 (Sun)
  // Saturday is a WORKING day, Sunday is WEEKLY_OFF -> total 1 day
  const satCalc = await WorkingDaysService.calculateWorkingDays(
    '2026-11-21',
    '2026-11-22',
    'FULL_DAY'
  );
  assert(satCalc.totalDays === 1, '9. Saturday is counted as a working day by default');

  // Test configurable weekly offs (e.g. Sun + Sat = [0, 6])
  await WorkingDaysService.setWeeklyOffs([0, 6]);
  const newOffs = await WorkingDaysService.getWeeklyOffs();
  assert(newOffs.includes(0) && newOffs.includes(6), '10. Weekly off remains configurable when changed by Admin');
  // Revert back to default 6-day week (Sunday only)
  await WorkingDaysService.setWeeklyOffs([0]);

  // ----------------------------------------------------
  // SECTION 3: IN-APP NOTIFICATIONS WORKFLOW
  // ----------------------------------------------------
  console.log('\n--- 3. In-App Notifications Lifecycle ---');
  resetState();

  // Test 11: Leave Submission triggers notifications to HR and Management
  const submittedReq = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-11-02',
      endDate: '2026-11-04',
      dayType: 'FULL_DAY',
      reason: 'Family vacation trip',
      applicationTimestampOverride: '2026-10-01T09:00:00Z',
    },
    EMP_AUTH
  );

  const hrNotifs = await NotificationService.getNotificationsForUser(HR_AUTH);
  assert(
    hrNotifs.notifications.some((n) => n.relatedLeaveRequestId === submittedReq.id && n.type === 'LEAVE_SUBMITTED'),
    '11. HR received LEAVE_SUBMITTED notification for new request'
  );
  assert(hrNotifs.unreadCount >= 1, '11. HR unread count is at least 1');

  const mgmtNotifs = await NotificationService.getNotificationsForUser(MGMT_AUTH);
  assert(
    mgmtNotifs.notifications.some((n) => n.relatedLeaveRequestId === submittedReq.id && n.type === 'LEAVE_SUBMITTED'),
    '12. Top Management received LEAVE_SUBMITTED notification for new request'
  );

  // Test 13: Strict RBAC - Employee does NOT see HR/Mgmt submission notifications
  const empNotifsBefore = await NotificationService.getNotificationsForUser(EMP_AUTH);
  assert(
    !empNotifsBefore.notifications.some((n) => n.type === 'LEAVE_SUBMITTED'),
    '13. Employee does NOT receive manager-facing submission alert'
  );

  // Test 14: Team Leader approves first, then HR Review generates HR_DECIDED notification to employee
  await ApprovalService.submitTeamLeaderDecision(
    submittedReq.id,
    { decision: 'APPROVED', comments: 'Team Leader approved' },
    TL_AUTH
  );
  await ApprovalService.submitHrDecision(
    submittedReq.id,
    { decision: 'APPROVED', comments: 'Documents verified and policy compliant' },
    HR_AUTH
  );

  const empNotifsAfterHr = await NotificationService.getNotificationsForUser(EMP_AUTH);
  assert(
    empNotifsAfterHr.notifications.some((n) => n.relatedLeaveRequestId === submittedReq.id && n.type === 'HR_DECIDED'),
    '14. Employee received HR_DECIDED notification after HR recommendation'
  );

  // Test 15: Management Final Approval generates FINAL_APPROVED notification
  await ApprovalService.submitManagementDecision(
    submittedReq.id,
    { decision: 'APPROVED', comments: 'Final approval granted by Management' },
    MGMT_AUTH
  );

  const empNotifsAfterMgmt = await NotificationService.getNotificationsForUser(EMP_AUTH);
  const finalApprovedNotif = empNotifsAfterMgmt.notifications.find(
    (n) => n.relatedLeaveRequestId === submittedReq.id && n.type === 'FINAL_APPROVED'
  );
  assert(finalApprovedNotif !== undefined, '15. Employee received FINAL_APPROVED notification with balance posting confirmation');

  // Test 16: Mark Single Notification as Read
  if (finalApprovedNotif) {
    assert(finalApprovedNotif.isRead === false, '16. Notification initial status is unread (isRead=false)');
    await NotificationService.markAsRead(finalApprovedNotif.id, EMP_AUTH);
    const refreshedEmp = await NotificationService.getNotificationsForUser(EMP_AUTH);
    const updatedNotif = refreshedEmp.notifications.find((n) => n.id === finalApprovedNotif.id);
    assert(updatedNotif?.isRead === true, '16. Notification is marked as read (isRead=true)');
  }

  // Test 17: Mark All as Read
  await NotificationService.markAllAsRead(HR_AUTH);
  const hrAfterMarkAll = await NotificationService.getNotificationsForUser(HR_AUTH);
  assert(hrAfterMarkAll.unreadCount === 0, '17. Mark all as read resets unread count to 0 for actor');

  // Test 18: Cancellation notification lifecycle
  const req2 = await LeaveRequestService.submitLeaveRequest(
    {
      leaveTypeId: 1,
      startDate: '2026-12-10',
      endDate: '2026-12-11',
      dayType: 'FULL_DAY',
      reason: 'Personal errands',
      applicationTimestampOverride: '2026-11-01T09:00:00Z',
    },
    EMP_AUTH
  );
  await LeaveRequestService.cancelLeaveRequest(req2.id, 'Plans postponed', EMP_AUTH);

  const hrCancelNotifs = await NotificationService.getNotificationsForUser(HR_AUTH);
  assert(
    hrCancelNotifs.notifications.some((n) => n.relatedLeaveRequestId === req2.id && n.type === 'LEAVE_CANCELLED'),
    '18. HR received LEAVE_CANCELLED notification upon employee cancellation'
  );

  console.log(`\n=== STEP 6 REGRESSION SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runStep6RegressionTests().catch((e) => {
  console.error('Test suite failed unexpectedly:', e);
  process.exit(1);
});
