import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import {
  schema,
  setCustomDbInstance,
} from '../db/index.ts';
import {
  roles,
  departments,
  designations,
  users,
  employees,
  holidayLists,
  holidays,
  shifts,
  shiftSegments,
  teamLeaderRotations,
  systemAuditLogs,
} from '../db/schema.ts';
import { DataImportService } from '../services/dataImportService.ts';
import { UserService } from '../services/userService.ts';

async function runTests() {
  console.log('================================================================');
  console.log('NEON POSTGRESQL DATA IMPORT & RELATIONSHIP VERIFICATION SUITE');
  console.log('================================================================\n');
  let passed = 0;

  // 1. Initialize real PostgreSQL 16 (PGlite) and run all 0000..0011 Drizzle migrations
  console.log('1. PostgreSQL Engine & Migration Setup');
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
  const pgliteDb = drizzle(pg, { schema });
  setCustomDbInstance(pgliteDb as any);
  console.log(`  [PASS] Applied all ${journal.entries.length} PostgreSQL migrations successfully.`);
  passed++;

  // 2. Pre-seed a Live SUPER_ADMIN to verify Requirement 10: Existing Neon SUPER_ADMIN must remain intact
  console.log('\n2. SUPER_ADMIN Account Preservation');
  const initialAdminHash = 'custom_live_neon_hash_never_overwrite_123';
  await pgliteDb
    .insert(roles)
    .values({
      id: 4,
      name: 'SUPER_ADMIN',
      code: 'SUPER_ADMIN',
      displayName: 'Super Administrator',
      description: 'Super Admin Role',
      permissions: ['ALL_PERMISSIONS'],
      isSystem: true,
      isActive: true,
    })
    .onConflictDoNothing();

  await pgliteDb
    .insert(users)
    .values({
      id: 1,
      username: 'superadmin',
      email: 'lokesh@maestrotire.com',
      passwordHash: initialAdminHash,
      roleId: 4,
      isActive: true,
    })
    .onConflictDoNothing();

  // 3. Execute DataImportService
  console.log('\n3. Executing Local Metadata -> PostgreSQL Data Import');
  const report = await DataImportService.importLocalMetadataToDatabase(pgliteDb);
  assert.equal(report.success, true, 'Import must report success');
  console.log(`  [PASS] DataImportService completed: ${report.message}`);
  passed++;

  // 4. Verify Database Record Counts against Local Metadata Counts
  console.log('\n4. Record Count Verification');
  const dbRoles = await pgliteDb.select().from(roles);
  const dbDepts = await pgliteDb.select().from(departments);
  const dbDesigs = await pgliteDb.select().from(designations);
  const dbUsers = await pgliteDb.select().from(users);
  const dbEmps = await pgliteDb.select().from(employees);
  const dbLists = await pgliteDb.select().from(holidayLists);
  const dbHolidays = await pgliteDb.select().from(holidays);
  const dbShifts = await pgliteDb.select().from(shifts);
  const dbSegments = await pgliteDb.select().from(shiftSegments);
  const dbRotations = await pgliteDb.select().from(teamLeaderRotations);
  const dbAudit = await pgliteDb.select().from(systemAuditLogs);

  console.log(`  Roles: Source ${report.sourceCounts.roles} | Neon DB ${dbRoles.length}`);
  console.log(`  Departments: Source ${report.sourceCounts.departments} | Neon DB ${dbDepts.length}`);
  console.log(`  Designations: Source ${report.sourceCounts.designations} | Neon DB ${dbDesigs.length}`);
  console.log(`  Users: Source ${report.sourceCounts.users} | Neon DB ${dbUsers.length}`);
  console.log(`  Employees: Source ${report.sourceCounts.employees} | Neon DB ${dbEmps.length}`);
  console.log(`  Holiday Lists: Source ${report.sourceCounts.holidayLists} | Neon DB ${dbLists.length}`);
  console.log(`  Holidays: Source ${report.sourceCounts.holidays} | Neon DB ${dbHolidays.length}`);
  console.log(`  Shifts: Source ${report.sourceCounts.shifts} | Neon DB ${dbShifts.length}`);
  console.log(`  Shift Segments: Source ${report.sourceCounts.shiftSegments} | Neon DB ${dbSegments.length}`);
  console.log(`  TL Rotations: Source ${report.sourceCounts.teamLeaderRotations} | Neon DB ${dbRotations.length}`);
  console.log(`  Audit Logs: Source ${report.sourceCounts.auditLogs} | Neon DB ${dbAudit.length}`);

  assert.equal(dbRoles.length, 5, 'Roles count in DB must be 5');
  assert.equal(dbDepts.length, 8, 'Departments count in DB must be 8');
  assert.equal(dbDesigs.length, 5, 'Designations count in DB must be 5');
  assert.equal(dbUsers.length, 11, 'Users count in DB must be 11');
  assert.equal(dbEmps.length, 11, 'Employees count in DB must be 11');
  assert.equal(dbLists.length, 4, 'Holiday Lists count in DB must be 4');
  assert.equal(dbHolidays.length, 7, 'Holidays count in DB must be 7');
  assert.equal(dbShifts.length, 17, 'Shifts count in DB must be 17');
  assert.equal(dbSegments.length, 10, 'Shift Segments count in DB must be 10');
  assert.equal(dbRotations.length, 1, 'Team Leader Rotations count in DB must be 1');
  assert.ok(dbAudit.length >= 50, 'Audit logs must be imported into system_audit_logs');
  console.log('  [PASS] All 11 entity record counts verified.');
  passed++;

  // 5. Verify SUPER_ADMIN Preservation
  console.log('\n5. Existing SUPER_ADMIN Verification');
  const [adminUser] = await pgliteDb.select().from(users).where(eq(users.id, 1));
  assert.ok(adminUser, 'Super Admin record must exist');
  assert.equal(
    adminUser.passwordHash,
    initialAdminHash,
    'Existing Neon SUPER_ADMIN passwordHash must remain completely unchanged'
  );
  console.log('  [PASS] Existing SUPER_ADMIN account preserved intact with unchanged password hash.');
  passed++;

  // 6. Verify User -> Role & Employee -> User Relationship
  console.log('\n6. User, Employee & Role Relationships');
  const [empAlice] = await pgliteDb.select().from(employees).where(eq(employees.employeeCode, 'EMP004'));
  assert.ok(empAlice, 'Alice employee record must exist');
  assert.equal(empAlice.userId, 4, 'Alice employee must link to userId 4');

  const [userAlice] = await pgliteDb.select().from(users).where(eq(users.id, 4));
  assert.ok(userAlice, 'Alice user record must exist');
  assert.equal(userAlice.roleId, 1, 'Alice roleId must be 1 (EMPLOYEE)');
  assert.equal(userAlice.username, 'alice_emp', 'Alice username must match');
  console.log('  [PASS] Employee EMP004 -> User 4 -> Role 1 relationship verified.');
  passed++;

  // 7. Verify Department & Designation Relationships
  console.log('\n7. Department & Designation Relationships');
  assert.equal(empAlice.departmentId, 2, 'Alice must belong to Department 2 (Engineering)');
  assert.equal(empAlice.designationId, 4, 'Alice must belong to Designation 4 (Software Engineer)');

  const [deptImport] = await pgliteDb.select().from(departments).where(eq(departments.id, 8));
  assert.ok(deptImport, 'Import Team department must exist');
  assert.equal(deptImport.headEmployeeId, 8, 'Import Team headEmployeeId must link to Employee 8 (ANIL)');
  console.log('  [PASS] Department & Designation foreign keys verified (including department headEmployeeId).');
  passed++;

  // 8. Verify Employee Reporting Manager Self-Referencing Relationship
  console.log('\n8. Self-Referencing Reporting Manager Hierarchy');
  assert.equal(empAlice.reportingManagerId, 5, 'Alice (EMP004) reports to Robert Chen (EMP005)');

  const [empRobert] = await pgliteDb.select().from(employees).where(eq(employees.id, 5));
  assert.equal(empRobert.reportingManagerId, 3, 'Robert Chen (EMP005) reports to John (EMP003)');

  const [empJohn] = await pgliteDb.select().from(employees).where(eq(employees.id, 3));
  assert.equal(empJohn.reportingManagerId, 1, 'John (EMP003) reports to Super Admin (EMP001)');

  const [empAdmin] = await pgliteDb.select().from(employees).where(eq(employees.id, 1));
  assert.equal(empAdmin.reportingManagerId, null, 'Super Admin has no reporting manager');

  const [empKiran] = await pgliteDb.select().from(employees).where(eq(employees.id, 10));
  assert.equal(empKiran.reportingManagerId, 8, 'Kiran (EMP010) reports to Anil (EMP008)');
  console.log('  [PASS] Multi-tier reporting hierarchy (Alice -> Robert -> John -> Admin) verified.');
  passed++;

  // 9. Verify Holiday & Holiday List Relationships & Schema Integrity
  console.log('\n9. Holiday & Holiday List Relationships');
  const [hlImport] = await pgliteDb.select().from(holidayLists).where(eq(holidayLists.id, 2));
  assert.ok(hlImport, 'Holiday list 2 (Maestro_Import) must exist');
  assert.equal(hlImport.departmentId, 5, 'Holiday list 2 must reference Department 5 (Maestro_Import)');

  const [hPort] = await pgliteDb.select().from(holidays).where(eq(holidays.holidayName, 'Maestro Port Operations Day'));
  assert.ok(hPort, 'Maestro Port Operations Day holiday must exist');
  assert.equal(hPort.departmentId, 5, 'Port holiday must link to Department 5');
  assert.equal(hPort.holidayListId, 2, 'Port holiday must link to Holiday List 2');

  const [hCFS] = await pgliteDb.select().from(holidays).where(eq(holidays.holidayName, 'CFS Terminal Foundation Day'));
  assert.ok(hCFS, 'CFS Terminal Foundation Day holiday must exist');
  assert.equal(hCFS.departmentId, 7, 'CFS holiday must link to Department 7');
  assert.equal(hCFS.holidayListId, 4, 'CFS holiday must link to Holiday List 4');
  console.log('  [PASS] Holiday -> Holiday List & Department relationships verified.');
  passed++;

  // 10. Verify Shifts & Shift Segments
  console.log('\n10. Shift & Shift Segments');
  const [shiftGen] = await pgliteDb.select().from(shifts).where(eq(shifts.shiftCode, 'GN'));
  assert.ok(shiftGen, 'General shift must exist');
  assert.equal(shiftGen.shiftType, 'DAY');

  const gnSegments = await pgliteDb.select().from(shiftSegments).where(eq(shiftSegments.shiftId, shiftGen.id));
  assert.equal(gnSegments.length, 1, 'General shift has 1 segment');
  assert.equal(gnSegments[0].startTime, '09:00');
  assert.equal(gnSegments[0].endTime, '18:00');

  const [shiftNight] = await pgliteDb.select().from(shifts).where(eq(shifts.shiftCode, 'NGN-1'));
  const ngnSegments = await pgliteDb.select().from(shiftSegments).where(eq(shiftSegments.shiftId, shiftNight.id));
  assert.equal(ngnSegments[0].crossesMidnight, true, 'Night shift segment crosses midnight');
  console.log('  [PASS] Shift -> Shift Segment relationships verified.');
  passed++;

  // 11. Verify Team Leader Rotation
  console.log('\n11. Team Leader Rotation');
  const [rot] = await pgliteDb.select().from(teamLeaderRotations).where(eq(teamLeaderRotations.teamId, 8));
  assert.ok(rot, 'Team Leader rotation for team 8 must exist');
  assert.equal(rot.firstHalfLeaderId, 8, 'First half leader is Employee 8 (ANIL)');
  assert.equal(rot.secondHalfLeaderId, 9, 'Second half leader is Employee 9 (AKASH)');
  assert.equal(rot.rotationType, 'FIRST_HALF_SECOND_HALF');
  console.log('  [PASS] Team Leader rotation for Import Team (01-15 ANIL, 16-End AKASH) verified.');
  passed++;

  // 12. Verify System Audit Logs
  console.log('\n12. System Audit Logs');
  const [auditSample] = await pgliteDb.select().from(systemAuditLogs).where(eq(systemAuditLogs.id, 56));
  assert.ok(auditSample, 'Audit log #56 must exist');
  assert.equal(auditSample.actorRole, 'SUPER_ADMIN');
  assert.equal(auditSample.action, 'USER_LOGIN');
  console.log('  [PASS] Audit logs persisted into system_audit_logs with metadata.');
  passed++;

  // 13. Verify Idempotency: Re-running DataImportService must not duplicate rows
  console.log('\n13. Idempotency Verification');
  const secondReport = await DataImportService.importLocalMetadataToDatabase(pgliteDb);
  assert.equal(secondReport.success, true);
  const recheckUsers = await pgliteDb.select().from(users);
  const recheckHolidays = await pgliteDb.select().from(holidays);
  const recheckDepts = await pgliteDb.select().from(departments);
  assert.equal(recheckUsers.length, 11, 'Users count must remain 11 after re-run');
  assert.equal(recheckHolidays.length, 7, 'Holidays count must remain 7 after re-run');
  assert.equal(recheckDepts.length, 8, 'Departments count must remain 8 after re-run');
  console.log('  [PASS] Second import execution is completely idempotent with no row duplication.');
  passed++;

  // 14. Verify Application Live Service Sync (UserService.syncFromDatabase)
  console.log('\n14. Live Service Synchronization (UserService.syncFromDatabase)');
  await UserService.syncFromDatabase();
  const allEmployees = await UserService.getAllEmployees();
  assert.equal(allEmployees.length, 11, 'UserService.getAllEmployees() must return all 11 employees from DB');
  const empAliceFromService = await UserService.getEmployeeById(4);
  assert.equal(empAliceFromService?.employeeName, 'Alice Johnson');
  assert.equal(empAliceFromService?.departmentName, 'Engineering');
  assert.equal(empAliceFromService?.designationName, 'Software Engineer');
  assert.equal(empAliceFromService?.reportingManagerName, 'Robert Chen (Team Leader)');
  console.log('  [PASS] UserService seamlessly loaded real data directly from PostgreSQL.');
  passed++;

  console.log('\n================================================================');
  console.log(`ALL ${passed} VERIFICATION CHECKS PASSED SUCCESSFULLY!`);
  console.log('================================================================');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
