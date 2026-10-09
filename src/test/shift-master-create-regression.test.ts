import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ShiftService } from '../services/shiftService.ts';
import { UserService } from '../services/userService.ts';
import { AuditService } from '../services/auditService.ts';
import { ValidationError } from '../services/validation.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function createTestServer() {
  const app = express();
  app.use(express.json());

  // Mock auth middleware injecting active user based on header
  app.use(async (req: any, _res, next) => {
    const roleHeader = (req.headers['x-user-role'] as string) || 'SUPER_ADMIN';
    const allUsers = await UserService.getUsers();
    const matched = allUsers.find((u: any) => u.role === roleHeader) || allUsers[0];
    req.user = matched;
    next();
  });

  app.get('/api/shifts', async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const shifts = await ShiftService.getShifts({ includeInactive });
      res.json({ success: true, shifts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/shifts/:id', async (req, res) => {
    try {
      const shift = await ShiftService.getShiftById(Number(req.params.id));
      if (!shift) return res.status(404).json({ error: 'Shift not found' });
      res.json({ success: true, shift });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/shifts', async (req: any, res) => {
    try {
      const created = await ShiftService.createShift(req.body, req.user);
      res.status(201).json({ success: true, shift: created });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/shifts/:id', async (req: any, res) => {
    try {
      const updated = await ShiftService.updateShift(Number(req.params.id), req.body, req.user);
      res.json({ success: true, shift: updated });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/shifts/:id', async (req: any, res) => {
    try {
      const result = await ShiftService.deleteShift(Number(req.params.id), req.user);
      res.json(result);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, isDependencyError: true });
      }
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/employee-shifts', async (req: any, res) => {
    try {
      const created = await ShiftService.assignShiftToEmployee(req.body, req.user);
      res.status(201).json({ success: true, assignment: created });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/employee-shifts/:id', async (req: any, res) => {
    try {
      const result = await ShiftService.deleteEmployeeAssignment(Number(req.params.id), req.user);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/employees/:employeeId/schedule', async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      const dateStr = (req.query.date as string) || '2026-08-10';
      const schedule = await ShiftService.resolveEmployeeSchedule(employeeId, dateStr);
      res.json({ success: true, schedule });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return { server, baseUrl };
}

async function runTests() {
  console.log('================================================================');
  console.log('SHIFT MASTER CREATE NEW SHIFT & PERSISTENCE REGRESSION TEST SUITE');
  console.log('================================================================\n');

  // Ensure clean test baseline
  ShiftService.resetMemoryStores();
  const { server, baseUrl } = await createTestServer();
  const persistenceFile = path.join(
    process.cwd(),
    'uploads',
    'metadata',
    'shifts_and_assignments.test.json'
  );

  try {
    // ------------------------------------------------------------------
    // 1. CREATE CUSTOM SHIFT (DAY Shift + SPLIT Shift + Duplicate Check)
    // ------------------------------------------------------------------
    console.log('--- 1. Create Custom Shift (DAY & SPLIT) + Validation ---');

    const createDayRes = await fetch(`${baseUrl}/api/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
      body: JSON.stringify({
        shiftCode: 'CUSTOM_DAY_01',
        shiftName: 'Custom Engineering Day Shift',
        shiftType: 'DAY',
        startTime: '08:30',
        endTime: '17:30',
        totalWorkingHours: 9.0,
        breakMinutes: 30,
        weeklyOff: 'Sunday',
        isActive: true,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        description: 'Standard 08:30-to-17:30 engineering day shift with 30m lunch break',
        segments: [
          {
            segmentSequence: 1,
            startTime: '08:30',
            endTime: '17:30',
            crossesMidnight: false,
            breakMinutes: 30,
          },
        ],
      }),
    });
    const createDayBody = await createDayRes.json();
    assert(createDayRes.status === 201 && createDayBody.success === true, 'POST /api/shifts creates custom DAY shift (201)');
    const customDayShift = createDayBody.shift;
    assert(customDayShift.shiftCode === 'CUSTOM_DAY_01', 'Created shift has code CUSTOM_DAY_01');
    assert(customDayShift.shiftName === 'Custom Engineering Day Shift', 'Created shift has expected shiftName');
    assert(customDayShift.shiftType === 'DAY', 'Created shift has shiftType DAY');
    assert(customDayShift.startTime === '08:30' && customDayShift.endTime === '17:30', 'Created shift has startTime 08:30 and endTime 17:30');
    assert(customDayShift.totalWorkingHours === 9 && customDayShift.breakMinutes === 30, 'Created shift has totalWorkingHours=9 and breakMinutes=30 (break included, not subtracted)');
    assert(customDayShift.weeklyOff === 'Sunday', 'Created shift has weeklyOff=Sunday');
    assert(customDayShift.isActive === true, 'Created shift has isActive=true');
    assert(customDayShift.effectiveFrom === '2026-01-01' && customDayShift.effectiveTo === '2026-12-31', 'Created shift has effectiveFrom and effectiveTo');

    // Create custom SPLIT shift with multiple working segments
    const createSplitRes = await fetch(`${baseUrl}/api/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
      body: JSON.stringify({
        shiftCode: 'CUSTOM_SPLIT_02',
        shiftName: 'Custom Split Operations Shift',
        shiftType: 'SPLIT',
        totalWorkingHours: 8.5,
        breakMinutes: 30,
        weeklyOff: 'Sunday',
        isActive: true,
        effectiveFrom: '2026-02-01',
        effectiveTo: null,
        description: 'Morning + Evening split operational shift',
        segments: [
          {
            segmentSequence: 1,
            startTime: '06:00',
            endTime: '10:00',
            crossesMidnight: false,
            breakMinutes: 0,
          },
          {
            segmentSequence: 2,
            startTime: '16:00',
            endTime: '20:30',
            crossesMidnight: false,
            breakMinutes: 30,
          },
        ],
      }),
    });
    const createSplitBody = await createSplitRes.json();
    assert(createSplitRes.status === 201 && createSplitBody.success === true, 'POST /api/shifts creates custom SPLIT shift with multiple segments');
    const customSplitShift = createSplitBody.shift;
    assert(customSplitShift.shiftType === 'SPLIT', 'SPLIT shift has shiftType SPLIT');
    assert(customSplitShift.segments.length === 2, 'SPLIT shift persists 2 working segments');
    assert(customSplitShift.startTime === '06:00' && customSplitShift.endTime === '20:30', 'SPLIT shift derives overall startTime 06:00 and endTime 20:30');
    assert(customSplitShift.totalWorkingHours === 8.5 && customSplitShift.breakMinutes === 30, 'SPLIT shift uses configured totalWorkingHours=8.5 (4h + 4.5h without subtracting break) and breakMinutes=30');

    // Verify Duplicate Shift Code is rejected
    const dupRes = await fetch(`${baseUrl}/api/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
      body: JSON.stringify({
        shiftCode: 'custom_day_01', // case-insensitive duplicate
        shiftName: 'Duplicate Attempt',
        shiftType: 'DAY',
        startTime: '08:00',
        endTime: '17:00',
      }),
    });
    const dupBody = await dupRes.json();
    assert(dupRes.status === 400 && dupBody.error.includes('already exists'), 'Duplicate Shift Code is rejected with 400 error');

    // Verify SPLIT shift with < 2 segments is rejected
    const badSplitRes = await fetch(`${baseUrl}/api/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
      body: JSON.stringify({
        shiftCode: 'BAD_SPLIT',
        shiftName: 'Invalid Single Segment Split',
        shiftType: 'SPLIT',
        segments: [
          { segmentSequence: 1, startTime: '08:00', endTime: '12:00', crossesMidnight: false, breakMinutes: 0 },
        ],
      }),
    });
    assert(badSplitRes.status === 400, 'SPLIT shift with fewer than 2 segments is rejected');

    // ------------------------------------------------------------------
    // 2. VERIFY DATABASE / DURABLE STORE PERSISTENCE
    // ------------------------------------------------------------------
    console.log('\n--- 2. Verify Database / Durable Persistence ---');
    assert(fs.existsSync(persistenceFile), 'Durable persistence store file exists on disk');
    const rawStore = JSON.parse(fs.readFileSync(persistenceFile, 'utf8'));
    const persistedDay = rawStore.shifts.find((s: any) => s.shiftCode === 'CUSTOM_DAY_01');
    const persistedSplit = rawStore.shifts.find((s: any) => s.shiftCode === 'CUSTOM_SPLIT_02');
    assert(Boolean(persistedDay), 'CUSTOM_DAY_01 is written to durable storage');
    assert(Boolean(persistedSplit), 'CUSTOM_SPLIT_02 is written to durable storage');
    assert(persistedSplit.segments.length === 2, 'CUSTOM_SPLIT_02 segments are persisted in storage');

    // ------------------------------------------------------------------
    // 3. REFRESH / SIMULATE SERVER RESTART AND VERIFY IT STILL EXISTS
    // ------------------------------------------------------------------
    console.log('\n--- 3. Simulate Server Restart / Refresh & Verify Shift Remains Available ---');
    ShiftService.simulateServerRestart();

    const listRes = await fetch(`${baseUrl}/api/shifts?includeInactive=true`);
    const listBody = await listRes.json();
    assert(listRes.status === 200 && Array.isArray(listBody.shifts), 'GET /api/shifts succeeds after server restart');
    const refreshedDay = listBody.shifts.find((s: any) => s.shiftCode === 'CUSTOM_DAY_01');
    const refreshedSplit = listBody.shifts.find((s: any) => s.shiftCode === 'CUSTOM_SPLIT_02');
    assert(Boolean(refreshedDay), 'CUSTOM_DAY_01 still exists in Shift Master after server restart/refresh');
    assert(Boolean(refreshedSplit), 'CUSTOM_SPLIT_02 still exists in Shift Master after server restart/refresh');
    assert(refreshedDay.shiftName === 'Custom Engineering Day Shift', 'Refreshed shift retains shiftName');
    assert(refreshedSplit.segments.length === 2, 'Refreshed SPLIT shift retains both working segments');

    // ------------------------------------------------------------------
    // 4. EDIT AND VERIFY PERSISTENCE
    // ------------------------------------------------------------------
    console.log('\n--- 4. Edit Newly Created Shift & Verify Persistence ---');
    const editRes = await fetch(`${baseUrl}/api/shifts/${customDayShift.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
      body: JSON.stringify({
        shiftCode: 'CUSTOM_DAY_01_REV',
        shiftName: 'Custom Engineering Day Shift (Updated)',
        shiftType: 'DAY',
        startTime: '08:00',
        endTime: '17:00',
        totalWorkingHours: 9.0,
        breakMinutes: 30,
        weeklyOff: 'Saturday, Sunday',
        isActive: true,
        effectiveFrom: '2026-03-01',
        effectiveTo: '2026-11-30',
        description: 'Updated timing and weekly off configuration',
        segments: [
          {
            segmentSequence: 1,
            startTime: '08:00',
            endTime: '17:00',
            crossesMidnight: false,
            breakMinutes: 30,
          },
        ],
      }),
    });
    const editBody = await editRes.json();
    assert(editRes.status === 200 && editBody.success === true, 'PUT /api/shifts/:id updates newly created shift');
    assert(editBody.shift.shiftCode === 'CUSTOM_DAY_01_REV', 'Edited shift code updated to CUSTOM_DAY_01_REV');
    assert(editBody.shift.shiftName === 'Custom Engineering Day Shift (Updated)', 'Edited shiftName updated');
    assert(editBody.shift.startTime === '08:00' && editBody.shift.endTime === '17:00', 'Edited startTime/endTime updated');
    assert(editBody.shift.totalWorkingHours === 9 && editBody.shift.breakMinutes === 30, 'Edited totalWorkingHours=9 and breakMinutes=30');
    assert(editBody.shift.weeklyOff === 'Saturday, Sunday', 'Edited weeklyOff updated to Saturday, Sunday');

    // Simulate restart and verify edit persisted
    ShiftService.simulateServerRestart();
    const getEditedRes = await fetch(`${baseUrl}/api/shifts/${customDayShift.id}`);
    const getEditedBody = await getEditedRes.json();
    assert(getEditedRes.status === 200, 'GET /api/shifts/:id retrieves edited shift after restart');
    assert(getEditedBody.shift.shiftCode === 'CUSTOM_DAY_01_REV', 'Edited shiftCode persisted across restart');
    assert(getEditedBody.shift.totalWorkingHours === 9 && getEditedBody.shift.breakMinutes === 30, 'Edited totalWorkingHours=9 and breakMinutes=30 persisted across restart');
    assert(getEditedBody.shift.weeklyOff === 'Saturday, Sunday', 'Edited weeklyOff persisted across restart');

    // ------------------------------------------------------------------
    // 5. ASSIGN NEWLY CREATED SHIFT TO AN EMPLOYEE
    // ------------------------------------------------------------------
    console.log('\n--- 5. Assign Newly Created Shift to an Employee ---');
    const assignRes = await fetch(`${baseUrl}/api/employee-shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
      body: JSON.stringify({
        employeeId: 103,
        shiftId: customSplitShift.id,
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-08-31',
        workDaysOfWeek: '1,2,3,4,5,6',
        assignmentReason: 'OPERATIONAL_CHANGE',
        remarks: 'Assigned to custom split shift for August operations',
      }),
    });
    const assignBody = await assignRes.json();
    assert(assignRes.status === 201 && assignBody.success === true, 'POST /api/employee-shifts assigns custom shift to employee #103');
    const createdAssignmentId = assignBody.assignment.id;
    assert(assignBody.assignment.shiftId === customSplitShift.id, 'Assignment references customSplitShift.id');
    assert(assignBody.assignment.shiftCode === 'CUSTOM_SPLIT_02', 'Assignment resolves shiftCode CUSTOM_SPLIT_02');

    // ------------------------------------------------------------------
    // 6. VERIFY SCHEDULE RESOLUTION FOR ASSIGNED EMPLOYEE
    // ------------------------------------------------------------------
    console.log('\n--- 6. Verify Schedule Resolution ---');
    const schedRes = await fetch(`${baseUrl}/api/employees/103/schedule?date=2026-08-10`); // Monday
    const schedBody = await schedRes.json();
    assert(schedRes.status === 200 && schedBody.success === true, 'GET /api/employees/103/schedule resolves schedule');
    const resolved = schedBody.schedule;
    assert(resolved.scheduleSource === 'EMPLOYEE_SHIFT' && resolved.shiftId === customSplitShift.id, 'Schedule resolver found the assigned custom shift');
    assert(resolved.shiftCode === 'CUSTOM_SPLIT_02', 'Resolved schedule shiftCode is CUSTOM_SPLIT_02');
    assert(resolved.shiftName === 'Custom Split Operations Shift', 'Resolved schedule shiftName matches');
    assert(resolved.isWorkingDay === true, 'Monday 2026-08-10 is resolved as a workday');
    assert(resolved.segments.length === 2, 'Resolved schedule contains 2 working segments for SPLIT shift');
    assert(resolved.segments[0].startTime === '06:00' && resolved.segments[0].endTime === '10:00', 'Segment 1 window resolved accurately');
    assert(resolved.segments[1].startTime === '16:00' && resolved.segments[1].endTime === '20:30', 'Segment 2 window resolved accurately');
    assert(resolved.totalScheduledHours === 8.5 && resolved.breakMinutes === 30, 'Resolved totalScheduledHours is 8.5 hrs and breakMinutes is 30');

    // ------------------------------------------------------------------
    // 7. VERIFY DEPENDENCY-SAFE DELETE & AUDIT LOGS
    // ------------------------------------------------------------------
    console.log('\n--- 7. Verify Dependency-Safe Delete & Audit Logging ---');
    // Attempt to delete customSplitShift while assigned to employee #103 -> MUST BE REJECTED
    const blockedDelRes = await fetch(`${baseUrl}/api/shifts/${customSplitShift.id}`, {
      method: 'DELETE',
      headers: { 'x-user-role': 'SUPER_ADMIN' },
    });
    const blockedDelBody = await blockedDelRes.json();
    assert(blockedDelRes.status === 400 && blockedDelBody.isDependencyError === true, 'Deleting shift assigned to employee is blocked (dependency-safe)');
    assert(blockedDelBody.error.includes('assigned to 1 employee'), 'Dependency error states employee assignment count');

    // Verify shift still exists after blocked delete
    const checkStillThere = await ShiftService.getShiftById(customSplitShift.id);
    assert(Boolean(checkStillThere), 'Blocked delete leaves shift intact in database');

    // Remove the employee assignment, then delete the shift -> MUST SUCCEED
    const removeAssignRes = await fetch(`${baseUrl}/api/employee-shifts/${createdAssignmentId}`, {
      method: 'DELETE',
      headers: { 'x-user-role': 'SUPER_ADMIN' },
    });
    assert(removeAssignRes.status === 200, 'Employee shift assignment removed cleanly');

    const okDelRes = await fetch(`${baseUrl}/api/shifts/${customSplitShift.id}`, {
      method: 'DELETE',
      headers: { 'x-user-role': 'SUPER_ADMIN' },
    });
    const okDelBody = await okDelRes.json();
    assert(okDelRes.status === 200 && okDelBody.success === true, 'Unassigned custom shift deletes cleanly');

    // Simulate restart and verify deleted shift does not come back
    ShiftService.simulateServerRestart();
    const checkDeleted = await ShiftService.getShiftById(customSplitShift.id);
    assert(checkDeleted === null, 'Deleted shift remains deleted after server restart');

    // Also clean up customDayShift
    const cleanDayRes = await fetch(`${baseUrl}/api/shifts/${customDayShift.id}`, {
      method: 'DELETE',
      headers: { 'x-user-role': 'SUPER_ADMIN' },
    });
    assert(cleanDayRes.status === 200, 'Cleaned up customDayShift');

    // Verify Audit Logs for SHIFT_CREATED, SHIFT_UPDATED, SHIFT_DELETED
    const auditLogs = await AuditService.getAuditLogs({ targetEntity: 'shifts' });
    const hasCreatedAudit = auditLogs.some((l) => l.action === 'SHIFT_CREATED');
    const hasUpdatedAudit = auditLogs.some((l) => l.action === 'SHIFT_UPDATED');
    const hasDeletedAudit = auditLogs.some((l) => l.action === 'SHIFT_DELETED');
    assert(hasCreatedAudit, 'Audit log recorded SHIFT_CREATED action');
    assert(hasUpdatedAudit, 'Audit log recorded SHIFT_UPDATED action');
    assert(hasDeletedAudit, 'Audit log recorded SHIFT_DELETED action');

    console.log('\n================================================================');
    console.log('🎉 ALL 7 REGRESSION CHECKS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    ShiftService.resetMemoryStores();
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
