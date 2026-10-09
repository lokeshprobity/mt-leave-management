import fs from 'fs';
import path from 'path';
import { formatDate, formatDateTime, formatDateRange } from '../utils/dateFormat.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, details?: unknown) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
    if (details !== undefined) {
      console.error('     Details:', details);
    }
  }
}

async function runDateFormatTests() {
  console.log('================================================================');
  console.log('USER-FACING DATE FORMAT (DD/MM/YYYY) VERIFICATION SUITE');
  console.log('================================================================\n');

  // 1. Direct unit tests for formatDate, formatDateTime, formatDateRange
  console.log('1. Shared Date Formatter Unit Tests (DD/MM/YYYY)');
  assert(
    formatDate('2026/10/01') === '01/10/2026',
    '2026/10/01 -> 01/10/2026',
    { actual: formatDate('2026/10/01') }
  );
  assert(
    formatDate('2026/09/30') === '30/09/2026',
    '2026/09/30 -> 30/09/2026',
    { actual: formatDate('2026/09/30') }
  );
  assert(
    formatDate('2026-10-01') === '01/10/2026',
    '2026-10-01 -> 01/10/2026',
    { actual: formatDate('2026-10-01') }
  );
  assert(
    formatDate('2026-09-30') === '30/09/2026',
    '2026-09-30 -> 30/09/2026',
    { actual: formatDate('2026-09-30') }
  );
  assert(
    formatDate('01/10/2026') === '01/10/2026',
    'Already formatted 01/10/2026 remains 01/10/2026',
    { actual: formatDate('01/10/2026') }
  );
  assert(
    formatDate('2026-10-01T10:30:00+05:30') === '01/10/2026',
    'ISO timestamp 2026-10-01T10:30:00+05:30 -> 01/10/2026 in Asia/Kolkata',
    { actual: formatDate('2026-10-01T10:30:00+05:30') }
  );
  assert(
    formatDateTime('2026-09-30 07:00') === '30/09/2026 07:00',
    'Date with time 2026-09-30 07:00 -> 30/09/2026 07:00',
    { actual: formatDateTime('2026-09-30 07:00') }
  );
  assert(
    formatDateRange('2026-09-30', '2026-10-01') === '30/09/2026 to 01/10/2026',
    'Date range 2026-09-30..2026-10-01 -> 30/09/2026 to 01/10/2026',
    { actual: formatDateRange('2026-09-30', '2026-10-01') }
  );
  assert(
    formatDate(null) === '—' && formatDate(undefined) === '—' && formatDate('') === '—',
    'Null/empty inputs return fallback "—"'
  );

  // 2. Verify key user-facing screens use shared dateFormat.ts
  console.log('\n2. User-Facing Screens Shared Formatter Integration');
  const screensToCheck = [
    { file: 'src/components/MyLeavePortal.tsx', name: 'Leave Application & My Leave History' },
    { file: 'src/components/TeamLeaderApprovalDashboard.tsx', name: 'Team Leader Approval Screen' },
    { file: 'src/components/HrApprovalDashboard.tsx', name: 'HR Approval Screen' },
    { file: 'src/components/ManagementApprovalDashboard.tsx', name: 'Management Approval Screen' },
    { file: 'src/components/MyProfile.tsx', name: 'Employee / Profile Screen' },
    { file: 'src/components/HolidayCalendarAdmin.tsx', name: 'Holiday Calendar Screen' },
    { file: 'src/components/ShiftScheduleAdmin.tsx', name: 'Shift Schedule Admin Screen' },
    { file: 'src/components/MySchedule.tsx', name: 'My Schedule Screen' },
    { file: 'src/components/ReportsMis.tsx', name: 'Reports / MIS Screen' },
    { file: 'src/components/Dashboard.tsx', name: 'Main Dashboard Screen' },
    { file: 'src/components/AdminLeaveBalance.tsx', name: 'Leave Balance Ledger Screen' },
    { file: 'src/components/OvertimeAdmin.tsx', name: 'Overtime Admin Screen' },
    { file: 'src/components/NotificationCenter.tsx', name: 'Notification Center Screen' },
    { file: 'src/components/SystemAuditAdmin.tsx', name: 'System Audit Trail Screen' },
    { file: 'src/components/admin/DepartmentAdmin.tsx', name: 'Department Team Leader Rotation Screen' },
    { file: 'src/components/admin/WorkingDaysAdmin.tsx', name: 'Working Days & Weekly Off Screen' },
  ];

  for (const screen of screensToCheck) {
    const content = fs.readFileSync(path.join(process.cwd(), screen.file), 'utf-8');
    const usesSharedFormatter =
      content.includes('dateFormat.ts') &&
      (content.includes('formatDate(') || content.includes('formatDateTime('));
    assert(
      usesSharedFormatter,
      `${screen.name} (${screen.file}) uses shared DD/MM/YYYY formatter from dateFormat.ts`
    );
  }

  // 3. Verify Leave Application cutoff & preview display uses DD/MM/YYYY while preserving API YYYY-MM-DD
  console.log('\n3. Backend API Date Storage & Calculation Preservation');
  const actor = { userId: 101, employeeId: 101, username: 'emp101', role: 'EMPLOYEE' as const };
  const previewOct1 = await LeaveRequestService.calculatePreview(
    {
      employeeId: 101,
      leaveTypeId: 1,
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      dayType: 'FULL_DAY',
      applicationTimestampOverride: '2026-09-30T10:00:00+05:30',
    },
    actor
  );
  const previewSep30 = await LeaveRequestService.calculatePreview(
    {
      employeeId: 101,
      leaveTypeId: 1,
      startDate: '2026-09-30',
      endDate: '2026-09-30',
      dayType: 'FULL_DAY',
      applicationTimestampOverride: '2026-09-29T10:00:00+05:30',
    },
    actor
  );

  assert(
    previewOct1.startDate === '2026-10-01' &&
      previewOct1.normalFullDayCutoffDateStr === '2026-10-01' &&
      previewSep30.startDate === '2026-09-30' &&
      previewSep30.normalFullDayCutoffDateStr === '2026-09-30',
    'Backend API calculation preserves ISO YYYY-MM-DD strings (2026-10-01 and 2026-09-30)',
    {
      oct1: previewOct1.normalFullDayCutoffDateStr,
      sep30: previewSep30.normalFullDayCutoffDateStr,
    }
  );

  const renderedOct1Cutoff = `${formatDate(previewOct1.normalFullDayCutoffDateStr)} ${previewOct1.normalFullDayCutoffTimeUsed || '07:00'}`;
  const renderedSep30Cutoff = `${formatDate(previewSep30.normalFullDayCutoffDateStr)} ${previewSep30.normalFullDayCutoffTimeUsed || '07:00'}`;
  const renderedEmergencyCutoff = `Before ${formatDate(previewOct1.startDate)} ${previewOct1.shiftStartTimeUsed}`;
  assert(
    renderedOct1Cutoff === '01/10/2026 07:00' && renderedSep30Cutoff === '30/09/2026 07:00',
    'Leave Application UI formats Normal Full-Day Cutoff as "01/10/2026 07:00" and "30/09/2026 07:00"',
    { renderedOct1Cutoff, renderedSep30Cutoff }
  );
  assert(
    renderedEmergencyCutoff === 'Before 01/10/2026 08:30',
    'Leave Application UI formats Emergency Cutoff as "Before 01/10/2026 08:30"',
    { renderedEmergencyCutoff }
  );

  console.log('\n================================================================');
  console.log(`DATE FORMAT VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runDateFormatTests().catch((err) => {
  console.error('Unhandled error in date-format.test.ts:', err);
  process.exit(1);
});
