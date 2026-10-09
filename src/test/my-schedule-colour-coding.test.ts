import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { registerApiRoutes } from '../../server.ts';
import { ShiftService } from '../services/shiftService.ts';
import { HolidayService } from '../services/holidayService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { UserService } from '../services/userService.ts';
import {
  SCHEDULE_CATEGORY_STYLES,
  SCHEDULE_LEGEND_ITEMS,
  resolveDailyScheduleVisualState,
} from '../components/MySchedule.tsx';
import { LeaveRequestDto } from '../types/leave.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, details?: any) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
    if (details !== undefined) {
      console.error('     Details:', JSON.stringify(details, null, 2));
    }
  }
}

async function runMyScheduleTests() {
  console.log('================================================================');
  console.log('MT LEAVE MANAGEMENT — MY SCHEDULE COLOUR CODING & DISPLAY SUITE');
  console.log('================================================================\n');

  UserService.resetMemoryStores();
  ShiftService.resetMemoryStores();
  WorkingDaysService.resetMemoryHolidays();
  LeaveService.resetMemoryStores();
  LeaveRequestService.resetMemoryStores();

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  registerApiRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ================================================================
    // 1. DISTINCT VISUAL CLASSES & LEGEND COMPLETENESS
    // ================================================================
    console.log('1. DISTINCT VISUAL CLASSES & LEGEND COMPLETENESS');

    const categories = Object.keys(SCHEDULE_CATEGORY_STYLES) as Array<
      keyof typeof SCHEDULE_CATEGORY_STYLES
    >;
    const containerClasses = new Set(
      categories.map((cat) => SCHEDULE_CATEGORY_STYLES[cat].containerClass)
    );
    const badgeClasses = new Set(
      categories.map((cat) => SCHEDULE_CATEGORY_STYLES[cat].badgeClass)
    );

    assert(
      categories.length === 9 &&
        containerClasses.size === 9 &&
        badgeClasses.size === 9 &&
        SCHEDULE_LEGEND_ITEMS.length === 9,
      '1.1 All 9 schedule categories have mutually distinct container and badge background classes and appear in SCHEDULE_LEGEND_ITEMS'
    );

    // 1.2 Weekly Off has its own distinct visual class/style and label
    const sundaySchedule = await ShiftService.resolveEmployeeSchedule(101, '2026-06-07'); // Sunday
    const weeklyOffVisual = resolveDailyScheduleVisualState(sundaySchedule, [], []);
    const workingMondaySchedule = await ShiftService.resolveEmployeeSchedule(101, '2026-06-08'); // Monday
    const workingVisual = resolveDailyScheduleVisualState(workingMondaySchedule, [], []);

    assert(
      weeklyOffVisual.primaryCategory === 'WEEKLY_OFF' &&
        weeklyOffVisual.primaryLabel === 'Weekly Off' &&
        weeklyOffVisual.containerClass.includes('bg-slate-100') &&
        weeklyOffVisual.containerClass !== workingVisual.containerClass &&
        weeklyOffVisual.conditions.some((c) => c.category === 'WEEKLY_OFF' && c.label === 'Weekly Off'),
      '1.2 Weekly Off has its own distinct visual class (bg-slate-100) and label ("Weekly Off") distinct from Working Day (bg-emerald-50/70)',
      { weeklyOffVisual, workingVisual }
    );

    // ================================================================
    // 2. DEPARTMENT HOLIDAY VS PUBLIC HOLIDAY & DEPARTMENT CALENDAR SCOPE
    // ================================================================
    console.log('\n2. DEPARTMENT HOLIDAY VS PUBLIC HOLIDAY & DEPARTMENT CALENDAR SCOPE');

    // Employee 501 in Maestro_Import (deptId: 5)
    // Employee 601 in A R Transportation (deptId: 6)
    ShiftService.setEmployeeDepartment(501, 5);
    ShiftService.setEmployeeDepartment(601, 6);

    // 2026-05-01 is Maestro Port Operations Day (departmentId: 5, Maestro_Import)
    const maestroMay1 = await ShiftService.resolveEmployeeSchedule(501, '2026-05-01');
    const maestroMay1Holidays = await HolidayService.getHolidaysForEmployee(501, 2026);
    const maestroMay1Visual = resolveDailyScheduleVisualState(maestroMay1, [], maestroMay1Holidays);

    // For Employee 601 (A R Transportation), 2026-05-01 is a normal working day!
    const transportMay1 = await ShiftService.resolveEmployeeSchedule(601, '2026-05-01');
    const transportMay1Holidays = await HolidayService.getHolidaysForEmployee(601, 2026);
    const transportMay1Visual = resolveDailyScheduleVisualState(
      transportMay1,
      [],
      transportMay1Holidays
    );

    // 2026-01-26 is Republic Day (Public Holiday, departmentId: null)
    const publicJan26 = await ShiftService.resolveEmployeeSchedule(501, '2026-01-26');
    const publicJan26Visual = resolveDailyScheduleVisualState(
      publicJan26,
      [],
      maestroMay1Holidays
    );

    assert(
      maestroMay1Visual.primaryCategory === 'DEPARTMENT_HOLIDAY' &&
        maestroMay1Visual.primaryLabel === 'Department Holiday' &&
        maestroMay1Visual.isDepartmentHoliday === true &&
        maestroMay1Visual.holidayDepartmentName === 'Maestro_Import' &&
        maestroMay1Visual.containerClass.includes('bg-purple-50') &&
        maestroMay1Visual.containerClass !== publicJan26Visual.containerClass &&
        maestroMay1Visual.containerClass !== weeklyOffVisual.containerClass,
      '2.1 Department Holiday has its own distinct visual class (bg-purple-50) and label ("Department Holiday") with department name ("Maestro_Import")',
      maestroMay1Visual
    );

    assert(
      publicJan26Visual.primaryCategory === 'PUBLIC_HOLIDAY' &&
        publicJan26Visual.primaryLabel === 'Public Holiday' &&
        publicJan26Visual.isDepartmentHoliday === false &&
        publicJan26Visual.containerClass.includes('bg-amber-50'),
      '2.2 Public Holiday uses its own distinct visual class (bg-amber-50) and label ("Public Holiday")',
      publicJan26Visual
    );

    assert(
      transportMay1Visual.primaryCategory === 'WORKING_DAY' &&
        transportMay1.isWorkingDay === true &&
        transportMay1.isHoliday === false,
      '2.3 Department-specific holiday for Maestro_Import (2026-05-01) is displayed as a normal Working Day for A R Transportation employee',
      transportMay1Visual
    );

    // Conversely, 2026-09-17 is Transport Fleet Maintenance Holiday (departmentId: 6, A R Transportation)
    const transportSep17 = await ShiftService.resolveEmployeeSchedule(601, '2026-09-17');
    const transportSep17Visual = resolveDailyScheduleVisualState(
      transportSep17,
      [],
      transportMay1Holidays
    );
    const maestroSep17 = await ShiftService.resolveEmployeeSchedule(501, '2026-09-17');
    const maestroSep17Visual = resolveDailyScheduleVisualState(
      maestroSep17,
      [],
      maestroMay1Holidays
    );

    assert(
      transportSep17Visual.primaryCategory === 'DEPARTMENT_HOLIDAY' &&
        transportSep17Visual.holidayDepartmentName === 'A R Transportation' &&
        maestroSep17Visual.primaryCategory === 'WORKING_DAY',
      '2.4 A R Transportation department holiday (2026-09-17) is shown as DEPARTMENT_HOLIDAY for Transport employee and WORKING_DAY for Maestro_Import employee'
    );

    // ================================================================
    // 3. APPROVED vs PENDING vs REJECTED vs CANCELLED LEAVE
    // ================================================================
    console.log('\n3. APPROVED vs PENDING vs REJECTED vs CANCELLED LEAVE');

    const workScheduleJune9 = await ShiftService.resolveEmployeeSchedule(101, '2026-06-09'); // Tuesday

    const approvedLeaveReq: LeaveRequestDto = {
      id: 9001,
      requestNumber: 'LR-2026-9001',
      employeeId: 101,
      leaveTypeId: 1,
      leaveTypeCode: 'CL',
      leaveTypeName: 'Casual Leave',
      startDate: '2026-06-09',
      endDate: '2026-06-09',
      totalDays: 1,
      dayType: 'FULL_DAY',
      reason: 'Personal work',
      requestClassification: 'NORMAL_LEAVE_REQUEST',
      applicationTimestamp: '2026-06-01T09:00:00Z',
      status: 'APPROVED',
      hrDecision: 'APPROVED',
      managementDecision: 'APPROVED',
      finalStatus: 'APPROVED',
      attachmentRequired: false,
      createdAt: '2026-06-01T09:00:00Z',
      updatedAt: '2026-06-01T09:00:00Z',
    };

    const pendingLeaveReq: LeaveRequestDto = {
      ...approvedLeaveReq,
      id: 9002,
      requestNumber: 'LR-2026-9002',
      status: 'PENDING',
      hrDecision: 'PENDING',
      managementDecision: 'PENDING',
      finalStatus: 'PENDING',
    };

    const rejectedLeaveReq: LeaveRequestDto = {
      ...approvedLeaveReq,
      id: 9003,
      requestNumber: 'LR-2026-9003',
      status: 'REJECTED',
      hrDecision: 'REJECTED',
      managementDecision: 'REJECTED',
      finalStatus: 'REJECTED',
    };

    const cancelledLeaveReq: LeaveRequestDto = {
      ...approvedLeaveReq,
      id: 9004,
      requestNumber: 'LR-2026-9004',
      status: 'CANCELLED',
      hrDecision: 'PENDING',
      managementDecision: 'PENDING',
      finalStatus: 'CANCELLED',
    };

    const approvedVisual = resolveDailyScheduleVisualState(workScheduleJune9, [approvedLeaveReq]);
    const pendingVisual = resolveDailyScheduleVisualState(workScheduleJune9, [pendingLeaveReq]);
    const rejectedVisual = resolveDailyScheduleVisualState(workScheduleJune9, [rejectedLeaveReq]);
    const cancelledVisual = resolveDailyScheduleVisualState(workScheduleJune9, [cancelledLeaveReq]);

    assert(
      approvedVisual.primaryCategory === 'APPROVED_LEAVE' &&
        pendingVisual.primaryCategory === 'PENDING_LEAVE' &&
        approvedVisual.containerClass.includes('bg-sky-50') &&
        pendingVisual.containerClass.includes('bg-orange-50') &&
        approvedVisual.containerClass !== pendingVisual.containerClass &&
        approvedVisual.primaryLabel === 'Approved Leave' &&
        pendingVisual.primaryLabel === 'Pending Leave',
      '3.1 Approved Leave (bg-sky-50) is visually distinct from Pending Leave (bg-orange-50)'
    );

    assert(
      rejectedVisual.primaryCategory === 'REJECTED_LEAVE' &&
        String(rejectedVisual.primaryCategory) !== 'APPROVED_LEAVE' &&
        rejectedVisual.primaryLabel === 'Rejected Leave' &&
        rejectedVisual.containerClass.includes('bg-rose-50') &&
        !rejectedVisual.conditions.some((c) => c.category === 'APPROVED_LEAVE'),
      '3.2 Rejected Leave is styled as REJECTED_LEAVE (bg-rose-50) and never shown as Approved'
    );

    assert(
      cancelledVisual.primaryCategory === 'CANCELLED_LEAVE' &&
        String(cancelledVisual.primaryCategory) !== 'APPROVED_LEAVE' &&
        cancelledVisual.primaryLabel === 'Cancelled Leave' &&
        cancelledVisual.containerClass.includes('bg-stone-100') &&
        !cancelledVisual.conditions.some((c) => c.category === 'APPROVED_LEAVE'),
      '3.3 Cancelled Leave is styled as CANCELLED_LEAVE (bg-stone-100) and never shown as Approved'
    );

    // ================================================================
    // 4. HALF-DAY LEAVE PARTIAL-DAY REPRESENTATION
    // ================================================================
    console.log('\n4. HALF-DAY LEAVE PARTIAL-DAY REPRESENTATION');

    const halfDayApprovedReq: LeaveRequestDto = {
      ...approvedLeaveReq,
      id: 9005,
      requestNumber: 'LR-2026-9005',
      dayType: 'HALF_DAY',
      halfDayPeriod: 'FIRST_HALF',
      totalDays: 0.5,
    };

    const halfDaySecondHalfPendingReq: LeaveRequestDto = {
      ...pendingLeaveReq,
      id: 9006,
      requestNumber: 'LR-2026-9006',
      dayType: 'HALF_DAY',
      halfDayPeriod: 'SECOND_HALF',
      totalDays: 0.5,
    };

    const halfDayApprovedVisual = resolveDailyScheduleVisualState(workScheduleJune9, [
      halfDayApprovedReq,
    ]);
    const halfDayPendingVisual = resolveDailyScheduleVisualState(workScheduleJune9, [
      halfDaySecondHalfPendingReq,
    ]);

    assert(
      halfDayApprovedVisual.primaryCategory === 'HALF_DAY_LEAVE' &&
        String(halfDayApprovedVisual.primaryCategory) !== 'APPROVED_LEAVE' &&
        halfDayApprovedVisual.isHalfDayLeave === true &&
        halfDayApprovedVisual.containerClass.includes('bg-teal-50') &&
        Boolean(halfDayApprovedVisual.halfDaySplit) &&
        halfDayApprovedVisual.halfDaySplit?.firstHalfCategory === 'HALF_DAY_LEAVE' &&
        halfDayApprovedVisual.halfDaySplit?.secondHalfCategory === 'WORKING_DAY' &&
        halfDayApprovedVisual.conditions.some((c) => c.category === 'HALF_DAY_LEAVE') &&
        halfDayApprovedVisual.conditions.some((c) => c.category === 'WORKING_DAY'),
      '4.1 First-Half Approved Leave is represented as HALF_DAY_LEAVE (bg-teal-50) with split First-Half Leave + Second-Half Working Shift instead of full-day absence',
      halfDayApprovedVisual.halfDaySplit
    );

    assert(
      halfDayPendingVisual.primaryCategory === 'HALF_DAY_LEAVE' &&
        halfDayPendingVisual.isHalfDayLeave === true &&
        halfDayPendingVisual.halfDaySplit?.firstHalfCategory === 'WORKING_DAY' &&
        halfDayPendingVisual.halfDaySplit?.secondHalfCategory === 'HALF_DAY_LEAVE' &&
        halfDayPendingVisual.halfDaySplit?.leaveStatus === 'PENDING' &&
        halfDayPendingVisual.conditions.some((c) => c.category === 'PENDING_LEAVE'),
      '4.2 Second-Half Pending Leave preserves First-Half Working Shift + Second-Half Pending Leave without showing as Approved',
      halfDayPendingVisual.halfDaySplit
    );

    // ================================================================
    // 5. MULTIPLE CONDITIONS ON ONE DATE
    // ================================================================
    console.log('\n5. MULTIPLE CONDITIONS ON ONE DATE');

    // 5.1 Multi-day leave spanning across a Department Holiday (2026-05-01 for Maestro_Import)
    const multiDayLeaveSpanningHoliday: LeaveRequestDto = {
      ...approvedLeaveReq,
      id: 9007,
      employeeId: 501,
      startDate: '2026-04-30',
      endDate: '2026-05-02',
      totalDays: 2,
    };
    const multiHolidayLeaveVisual = resolveDailyScheduleVisualState(
      maestroMay1,
      [multiDayLeaveSpanningHoliday],
      maestroMay1Holidays
    );
    assert(
      multiHolidayLeaveVisual.hasMultipleConditions === true &&
        multiHolidayLeaveVisual.conditions.some((c) => c.category === 'DEPARTMENT_HOLIDAY') &&
        multiHolidayLeaveVisual.conditions.some((c) => c.category === 'APPROVED_LEAVE'),
      '5.1 When an approved leave range spans a Department Holiday, both DEPARTMENT_HOLIDAY and APPROVED_LEAVE badges are preserved and neither is hidden',
      multiHolidayLeaveVisual.conditions
    );

    // 5.2 Cancelled leave + new Pending leave + Scheduled Shift on the same working day
    const multiLeaveWorkingDayVisual = resolveDailyScheduleVisualState(workScheduleJune9, [
      cancelledLeaveReq,
      pendingLeaveReq,
    ]);
    assert(
      multiLeaveWorkingDayVisual.primaryCategory === 'PENDING_LEAVE' &&
        multiLeaveWorkingDayVisual.hasMultipleConditions === true &&
        multiLeaveWorkingDayVisual.conditions.some((c) => c.category === 'CANCELLED_LEAVE') &&
        multiLeaveWorkingDayVisual.conditions.some((c) => c.category === 'PENDING_LEAVE') &&
        multiLeaveWorkingDayVisual.conditions.some((c) => c.category === 'WORKING_DAY'),
      '5.2 Cancelled Leave, Pending Leave, and Scheduled Shift on the same date are all preserved in conditions list',
      multiLeaveWorkingDayVisual.conditions
    );

    // ================================================================
    // 6. EXISTING SHIFT, WEEKLY-OFF & LEAVE CALCULATIONS UNCHANGED + HTTP API
    // ================================================================
    console.log('\n6. EXISTING SHIFT, WEEKLY-OFF & LEAVE CALCULATIONS + HTTP API');

    const scheduleRangeRes = await fetch(
      `${baseUrl}/api/employees/501/schedule-range?startDate=2026-04-30&endDate=2026-05-04`,
      {
        headers: {
          'x-user-role': 'EMPLOYEE',
          'x-user-id': '501',
          'x-employee-id': '501',
        },
      }
    );
    const scheduleRangeBody = await scheduleRangeRes.json();
    const may1FromApi = scheduleRangeBody.schedules?.find((s: any) => s.date === '2026-05-01');
    const may3SundayFromApi = scheduleRangeBody.schedules?.find(
      (s: any) => s.date === '2026-05-03'
    );

    assert(
      scheduleRangeRes.status === 200 &&
        may1FromApi?.isHoliday === true &&
        may1FromApi?.isDepartmentHoliday === true &&
        may1FromApi?.holidayDepartmentName === 'Maestro_Import' &&
        may1FromApi?.totalScheduledHours === 0 &&
        may3SundayFromApi?.isWeeklyOff === true &&
        may3SundayFromApi?.totalScheduledHours === 0,
      '6.1 /api/employees/:id/schedule-range returns department holiday metadata and preserves exact weekly-off and shift hour calculations',
      { may1FromApi, may3SundayFromApi }
    );

    // ================================================================
    // 7. RESPONSIVE DESKTOP & MOBILE LAYOUT VERIFICATION
    // ================================================================
    console.log('\n7. RESPONSIVE DESKTOP & MOBILE LAYOUT VERIFICATION');

    const myScheduleSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/MySchedule.tsx'),
      'utf-8'
    );

    assert(
      myScheduleSrc.includes('id="my-schedule-legend"') &&
        myScheduleSrc.includes('grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5') &&
        myScheduleSrc.includes('flex-col sm:flex-row') &&
        myScheduleSrc.includes('flex-wrap') &&
        myScheduleSrc.includes('break-words') &&
        myScheduleSrc.includes('min-w-0'),
      '7.1 MySchedule.tsx implements responsive grid/stacking classes (grid-cols-1 sm:grid-cols-2, flex-col sm:flex-row, flex-wrap, break-words, min-w-0) preventing mobile clipping or overlap'
    );
  } finally {
    UserService.resetMemoryStores();
    ShiftService.resetMemoryStores();
    WorkingDaysService.resetMemoryHolidays();
    LeaveService.resetMemoryStores();
    LeaveRequestService.resetMemoryStores();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n================================================================');
  console.log(`MY SCHEDULE COLOUR CODING SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runMyScheduleTests().catch((err) => {
  console.error('Unhandled error in my-schedule-colour-coding.test.ts:', err);
  process.exit(1);
});
