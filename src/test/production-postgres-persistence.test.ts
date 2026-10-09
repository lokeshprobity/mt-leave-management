import assert from 'node:assert';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  assertProductionDbConfigured,
  schema,
  setCustomDbInstance,
} from '../db/index.ts';
import {
  departments,
  designations,
  employees,
  employeeWeeklyOffAssignments,
  leaveBalances,
  leaveBalanceTransactions,
  leavePolicies,
  leaveRequestEvents,
  leaveRequests,
  leaveTypes,
  passwordResetTokens,
  storedAttachments,
  users,
} from '../db/schema.ts';
import { verifyServerDatabaseReadiness } from '../../server.ts';
import { AttachmentService } from '../services/attachmentService.ts';
import { EmailService } from '../services/emailService.ts';
import { UserService } from '../services/userService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';

async function runTests() {
  console.log('=== Running Production PostgreSQL Persistence & Guard Verification ===');
  let passed = 0;

  // 1. Verify Drizzle Migration SQL files (0000 through 0010) execute cleanly on real PostgreSQL 16 (PGlite)
  const pg = new PGlite();
  const journalRaw = fs.readFileSync('./drizzle/meta/_journal.json', 'utf-8');
  const journal = JSON.parse(journalRaw) as { entries: Array<{ tag: string }> };
  for (const entry of journal.entries) {
    const sqlPath = `./drizzle/${entry.tag}.sql`;
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    const statements = sqlContent
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await pg.exec(stmt);
    }
  }
  console.log(`✓ Applied all ${journal.entries.length} Drizzle PostgreSQL migrations (0000..0011) cleanly`);
  passed++;

  // 2. Bind Drizzle ORM to the live PostgreSQL instance
  UserService.resetMemoryStores();
  const pgliteDb = drizzle(pg, { schema });
  setCustomDbInstance(pgliteDb as any);

  await UserService.syncFromDatabase();
  const adminActor = {
    userId: 1,
    username: 'superadmin',
    role: 'SUPER_ADMIN' as const,
    employeeId: 1,
  };

  // 3. Department & Designation PostgreSQL persistence
  const createdDept = await UserService.createDepartment(
    {
      name: 'Production Engineering PG',
      code: 'PGENG01',
      description: 'PostgreSQL backed department',
    },
    adminActor
  );
  const dbDeptRows = await pgliteDb.select().from(departments);
  assert.ok(
    dbDeptRows.some((d) => d.code === 'PGENG01' && d.description === 'PostgreSQL backed department'),
    'Created department must persist in PostgreSQL departments table'
  );
  console.log('✓ Department creation persisted to PostgreSQL departments table');
  passed++;

  const createdDesig = await UserService.createDesignation(
    {
      name: 'Principal Database Architect',
      code: 'PGDBA01',
      description: 'PostgreSQL backed designation',
    },
    adminActor
  );
  const dbDesigRows = await pgliteDb.select().from(designations);
  assert.ok(
    dbDesigRows.some((d) => d.code === 'PGDBA01' && d.description === 'PostgreSQL backed designation'),
    'Created designation must persist in PostgreSQL designations table'
  );
  console.log('✓ Designation creation persisted to PostgreSQL designations table');
  passed++;

  // 4. Employee creation + User onboarding + mustChangePassword + credentialEmail in PostgreSQL
  const createdEmp = await UserService.createEmployee(
    {
      employeeCode: 'MT950',
      employeeName: 'Postgres Verified Employee',
      officialEmail: 'pg.employee@maestrotires.com',
      mobile: '9876543210',
      departmentId: createdDept.id,
      designationId: createdDesig.id,
      joiningDate: '2026-02-01',
      officeLocation: 'Chennai Plant 1',
      remarks: 'Persisted in PostgreSQL',
      initialPassword: 'Temp#Pg950!',
    } as any,
    adminActor
  );

  const dbEmpRows = await pgliteDb.select().from(employees);
  const pgEmp = dbEmpRows.find((e) => e.employeeCode === 'MT950');
  assert.ok(pgEmp, 'Employee MT950 must exist in PostgreSQL employees table');
  assert.strictEqual(pgEmp!.officeLocation, 'Chennai Plant 1');
  assert.strictEqual(pgEmp!.remarks, 'Persisted in PostgreSQL');

  const dbUserRows = await pgliteDb.select().from(users);
  const pgUser = dbUserRows.find((u) => u.email === 'pg.employee@maestrotires.com');
  assert.ok(pgUser, 'Linked user must exist in PostgreSQL users table');
  assert.strictEqual(pgUser!.mustChangePassword, true, 'must_change_password must be true in PostgreSQL');
  assert.ok(pgUser!.passwordHash.includes(':'), 'password_hash must be scrypt salt:hash');
  assert.ok(pgUser!.credentialEmail, 'credential_email JSON metadata must be persisted in PostgreSQL');
  console.log('✓ Employee & User creation persisted to PostgreSQL employees & users tables');
  passed++;

  // 5. Authenticate & changePassword persistence in PostgreSQL
  const authBeforeChange = await UserService.authenticateUser('MT950', 'Temp#Pg950!');
  assert.strictEqual(authBeforeChange.mustChangePassword, true);

  await UserService.changePassword(pgUser!.id, 'Temp#Pg950!', 'NewSecure#Pg950!');
  const dbUsersAfterChange = await pgliteDb.select().from(users);
  const pgUserAfterChange = dbUsersAfterChange.find((u) => u.id === pgUser!.id)!;
  assert.strictEqual(
    pgUserAfterChange.mustChangePassword,
    false,
    'must_change_password must be updated to false in PostgreSQL after password change'
  );
  const authAfterChange = await UserService.authenticateUser('MT950', 'NewSecure#Pg950!');
  assert.strictEqual(authAfterChange.mustChangePassword, false);
  console.log('✓ Forced first-login password change persisted to PostgreSQL users table');
  passed++;

  // 6. Password reset token SHA-256 hash persistence & single-use invalidation in PostgreSQL
  EmailService.resetOutbox();
  const dispatchedEmails: Array<{ to: string; text: string }> = [];
  EmailService.setTransport(async (msg) => {
    dispatchedEmails.push(msg);
    return { messageId: `<pg-test-${Date.now()}@maestro.local>` };
  });
  await UserService.requestPasswordReset('pg.employee@maestrotires.com');
  assert.ok(dispatchedEmails.length > 0, 'Password reset email should be dispatched');
  const latestEmail = dispatchedEmails[0];
  const tokenMatch = latestEmail.text.match(/One-Time Reset Token:\s*([a-f0-9]{64})/i);
  assert.ok(tokenMatch, 'Reset email must include 64-hex reset token');
  const rawToken = tokenMatch![1];

  const dbTokenRows = await pgliteDb.select().from(passwordResetTokens);
  assert.ok(dbTokenRows.length > 0, 'password_reset_tokens table in PostgreSQL must contain token hash');
  assert.ok(
    !dbTokenRows.some((t) => t.tokenHash === rawToken),
    'Raw token must NEVER be stored in PostgreSQL password_reset_tokens'
  );

  await UserService.completePasswordReset({
    token: rawToken,
    newPassword: 'ResetDone#Pg950!',
    confirmPassword: 'ResetDone#Pg950!',
  });

  const dbTokenRowsAfter = await pgliteDb.select().from(passwordResetTokens);
  assert.ok(
    dbTokenRowsAfter.every((t) => t.usedAt !== null || t.invalidatedAt !== null),
    'Reset token must be marked used in PostgreSQL after completion'
  );
  const authAfterReset = await UserService.authenticateUser('MT950', 'ResetDone#Pg950!');
  assert.strictEqual(authAfterReset.username, 'mt950');
  console.log('✓ Password reset token SHA-256 lifecycle persisted in PostgreSQL password_reset_tokens table');
  passed++;

  // 7. Weekly off & Stored Attachment persistence in PostgreSQL
  await WorkingDaysService.assignEmployeeWeeklyOff(
    {
      employeeId: createdEmp.id,
      weeklyOffDays: [0, 6],
      effectiveFrom: '2026-03-01',
      remarks: 'PG weekend off',
    },
    adminActor
  );
  const dbWeeklyOffs = await pgliteDb.select().from(employeeWeeklyOffAssignments);
  assert.ok(
    dbWeeklyOffs.some((w) => w.employeeId === createdEmp.id && Array.isArray(w.weeklyOffDays) && w.weeklyOffDays.includes(6)),
    'Employee weekly off must persist as JSON array in PostgreSQL employee_weekly_off_assignments'
  );

  AttachmentService.storeAttachmentData(
    'uploads/attachments/doc_pg_test.pdf',
    'doc_pg_test.pdf',
    '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF',
    'application/pdf',
    'medical_cert.pdf'
  );
  // Allow async fire-and-forget insert to settle
  await new Promise((r) => setTimeout(r, 50));
  const dbAttachments = await pgliteDb.select().from(storedAttachments);
  assert.ok(
    dbAttachments.some((a) => a.fileName === 'doc_pg_test.pdf' && a.originalName === 'medical_cert.pdf'),
    'Attachment metadata and payload must persist in PostgreSQL stored_attachments'
  );
  console.log('✓ Weekly-off history and stored attachments persisted in PostgreSQL');
  passed++;

  // 8. Leave Workflow Database Schema Verification (leaveRequests, events, balances, transactions, policies)
  const [createdLeaveType] = await pgliteDb
    .insert(leaveTypes)
    .values({
      code: 'CL_TEST',
      name: 'Casual Leave Test',
      isPaid: true,
      requiresDocument: false,
      supportsHalfDay: true,
      isActive: true,
    })
    .returning();
  assert.ok(createdLeaveType.id > 0, 'Leave type must insert into PostgreSQL');

  const [createdPolicy] = await pgliteDb
    .insert(leavePolicies)
    .values({
      leaveTypeId: createdLeaveType.id,
      policyName: 'Standard Casual Leave Policy',
      description: 'Annual casual leave with emergency exception',
      documentRequiredAfterDays: 3,
      annualAllocation: '12.00',
      isActive: true,
    })
    .returning();
  assert.strictEqual(createdPolicy.description, 'Annual casual leave with emergency exception');
  assert.strictEqual(createdPolicy.documentRequiredAfterDays, 3);

  const [createdBalance] = await pgliteDb
    .insert(leaveBalances)
    .values({
      employeeId: createdEmp.id,
      leaveTypeId: createdLeaveType.id,
      departmentId: createdDept.id,
      departmentCode: createdDept.code,
      departmentName: createdDept.name,
      openingBalance: '12.00',
      allocated: '12.00',
      available: '12.00',
      year: 2026,
    })
    .returning();
  assert.strictEqual(createdBalance.departmentCode, 'PGENG01');
  assert.strictEqual(createdBalance.available, '12.00');

  const [createdTx] = await pgliteDb
    .insert(leaveBalanceTransactions)
    .values({
      employeeId: createdEmp.id,
      leaveTypeId: createdLeaveType.id,
      leaveBalanceId: createdBalance.id,
      leaveTypeCode: 'CL_TEST',
      leaveTypeName: 'Casual Leave Test',
      transactionType: 'ALLOCATION',
      quantity: '12.00',
      remarks: 'Initial 2026 allocation',
      createdBy: adminActor.userId,
    })
    .returning();
  assert.strictEqual(createdTx.leaveTypeCode, 'CL_TEST');
  assert.strictEqual(createdTx.transactionType, 'ALLOCATION');

  const [createdRequest] = await pgliteDb
    .insert(leaveRequests)
    .values({
      requestNumber: 'MTL-2026-TEST01',
      employeeId: createdEmp.id,
      leaveTypeId: createdLeaveType.id,
      startDate: '2026-04-10',
      endDate: '2026-04-12',
      totalDays: '3.00',
      dayType: 'FULL_DAY',
      reasonCategory: 'FAMILY_EMERGENCY',
      reason: 'Attending urgent family event in hometown',
      requestClassification: 'NORMAL_LEAVE_REQUEST',
      status: 'PENDING',
      applicantRole: 'EMPLOYEE',
      applicantOperationalRole: 'EMPLOYEE',
      departmentId: createdDept.id,
      departmentCode: createdDept.code,
      departmentName: createdDept.name,
      teamId: createdDept.id,
      teamName: createdDept.name,
      assignedTeamLeaderId: null,
      assignedTeamLeaderUserId: null,
      assignedTeamLeaderName: 'Unassigned Team Leader',
      teamLeaderDecision: 'PENDING',
      hrDecision: 'PENDING',
      managementDecision: 'PENDING',
      finalStatus: 'PENDING',
      currentApprovalStage: 'STAGE_1_TEAM_LEADER',
      approvalStageLabel: 'Pending Team Leader',
      isEscalated: false,
      escalationRequired: false,
      autoEscalated: false,
      hasAttachment: true,
      attachmentPath: 'uploads/attachments/doc_pg_test.pdf',
      attachmentName: 'medical_cert.pdf',
      attachmentMime: 'application/pdf',
    })
    .returning();
  assert.strictEqual(createdRequest.requestNumber, 'MTL-2026-TEST01');
  assert.strictEqual(createdRequest.applicantRole, 'EMPLOYEE');
  assert.strictEqual(createdRequest.currentApprovalStage, 'STAGE_1_TEAM_LEADER');
  assert.strictEqual(createdRequest.isEscalated, false);
  assert.strictEqual(createdRequest.hasAttachment, true);

  const [createdEvent] = await pgliteDb
    .insert(leaveRequestEvents)
    .values({
      leaveRequestId: createdRequest.id,
      eventType: 'SUBMITTED',
      action: 'SUBMITTED',
      previousDecision: null,
      newDecision: 'PENDING',
      previousStatus: null,
      newStatus: 'PENDING',
      actorId: adminActor.userId,
      actorUserId: adminActor.userId,
      actorEmployeeCode: 'MT001',
      actorRole: 'SUPER_ADMIN',
      actorName: 'Super Administrator',
      remarks: 'Submitted 3.00 day(s) leave request',
      comments: 'All documents verified',
    })
    .returning();
  assert.strictEqual(createdEvent.leaveRequestId, createdRequest.id);
  assert.strictEqual(createdEvent.newStatus, 'PENDING');
  assert.strictEqual(createdEvent.actorRole, 'SUPER_ADMIN');
  assert.strictEqual(createdEvent.comments, 'All documents verified');
  console.log('✓ Leave workflow tables (policies, balances, transactions, requests, events) verified in PostgreSQL');
  passed++;

  // 9. Production DB Guard verification (NODE_ENV=production without SQL_* env vars must fail clearly)
  setCustomDbInstance(null);
  const prevNodeEnv = process.env.NODE_ENV;
  const prevHost = process.env.SQL_HOST;
  const prevDb = process.env.SQL_DB_NAME;
  const prevUser = process.env.SQL_USER;
  const prevPass = process.env.SQL_PASSWORD;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.SQL_HOST;
    delete process.env.SQL_DB_NAME;
    delete process.env.SQL_USER;
    delete process.env.SQL_PASSWORD;

    let guardThrew = false;
    try {
      assertProductionDbConfigured();
    } catch (err: any) {
      guardThrew = true;
      assert.ok(
        err.message.includes('Missing required PostgreSQL environment variable(s)'),
        'Guard error must list missing SQL_* variables'
      );
    }
    assert.strictEqual(guardThrew, true, 'assertProductionDbConfigured must throw in production when SQL_* vars are missing');

    let startupThrew = false;
    try {
      await verifyServerDatabaseReadiness();
    } catch {
      startupThrew = true;
    }
    assert.strictEqual(startupThrew, true, 'verifyServerDatabaseReadiness must fail in production when DB is not configured');

    let authThrew = false;
    try {
      await UserService.authenticateUser('superadmin', 'SuperAdmin@123');
    } catch (err: any) {
      authThrew = true;
      assert.ok(err.message.includes('Production Database Error'));
    }
    assert.strictEqual(authThrew, true, 'UserService.authenticateUser must refuse demo fallback in production when DB is missing');
    console.log('✓ Production DB Guard strictly blocks startup and demo/memory fallback when SQL_* vars are missing');
    passed++;
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevHost !== undefined) process.env.SQL_HOST = prevHost;
    if (prevDb !== undefined) process.env.SQL_DB_NAME = prevDb;
    if (prevUser !== undefined) process.env.SQL_USER = prevUser;
    if (prevPass !== undefined) process.env.SQL_PASSWORD = prevPass;
    UserService.resetMemoryStores();
  }

  await pg.close();
  console.log(`\n=== ALL ${passed} PRODUCTION POSTGRESQL PERSISTENCE & GUARD TESTS PASSED ===`);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
