import fs from 'fs';
import path from 'path';
import { sql, eq } from 'drizzle-orm';
import { getDb, isDbConfigured } from '../db/index.ts';
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
  employeeShiftAssignments,
  teamLeaderRotations,
  systemAuditLogs,
  systemSettings,
} from '../db/schema.ts';

export interface DataImportReport {
  success: boolean;
  message: string;
  sourceCounts: {
    roles: number;
    departments: number;
    designations: number;
    users: number;
    employees: number;
    holidayLists: number;
    holidays: number;
    shifts: number;
    shiftSegments: number;
    teamLeaderRotations: number;
    auditLogs: number;
  };
  neonCounts: {
    roles: number;
    departments: number;
    designations: number;
    users: number;
    employees: number;
    holidayLists: number;
    holidays: number;
    shifts: number;
    shiftSegments: number;
    teamLeaderRotations: number;
    auditLogs: number;
  };
  superAdminPreserved: boolean;
  limitations: string[];
}

export class DataImportService {
  private static readonly METADATA_DIR = path.resolve('uploads', 'metadata');

  public static async importLocalMetadataToDatabase(customDb?: any): Promise<DataImportReport> {
    const db = customDb || getDb();
    if (!db) {
      return {
        success: false,
        message: 'Database is not configured or connection pool could not be established.',
        sourceCounts: {
          roles: 0,
          departments: 0,
          designations: 0,
          users: 0,
          employees: 0,
          holidayLists: 0,
          holidays: 0,
          shifts: 0,
          shiftSegments: 0,
          teamLeaderRotations: 0,
          auditLogs: 0,
        },
        neonCounts: {
          roles: 0,
          departments: 0,
          designations: 0,
          users: 0,
          employees: 0,
          holidayLists: 0,
          holidays: 0,
          shifts: 0,
          shiftSegments: 0,
          teamLeaderRotations: 0,
          auditLogs: 0,
        },
        superAdminPreserved: true,
        limitations: ['Database pool is null; skipped import.'],
      };
    }

    const limitations: string[] = [];

    // Ensure database constraints are compatible with multi-department holiday schema
    try {
      await db.execute(sql`ALTER TABLE "holidays" DROP CONSTRAINT IF EXISTS "holidays_holiday_date_unique"`);
      await db.execute(sql`DROP INDEX IF EXISTS "holidays_holiday_date_unique"`);
    } catch {}

    // 1. Inspect and read local JSON files (strictly ignoring *.test.json)
    const rolesUsersPath = path.join(this.METADATA_DIR, 'roles_and_users.json');
    const holidaysPath = path.join(this.METADATA_DIR, 'holidays_and_lists.json');
    const shiftsPath = path.join(this.METADATA_DIR, 'shifts_and_assignments.json');
    const tlRotationPath = path.join(this.METADATA_DIR, 'team_leader_rotation.json');
    const auditLogsPath = path.join(this.METADATA_DIR, 'audit_logs_meta.json');
    const brandingPath = path.join(this.METADATA_DIR, 'company_branding.json');

    let rolesUsersData: any = { roles: [], users: [], departments: [], designations: [] };
    let holidaysData: any = { holidays: [], holidayLists: [] };
    let shiftsData: any = { shifts: [], assignments: [] };
    let tlRotationData: any = { rotationRules: [] };
    let auditLogsData: any = { logs: [] };
    let brandingData: any = { logo: null, settings: {} };

    if (fs.existsSync(rolesUsersPath)) {
      try {
        rolesUsersData = JSON.parse(fs.readFileSync(rolesUsersPath, 'utf-8'));
      } catch (err: any) {
        limitations.push(`Failed to parse roles_and_users.json: ${err?.message}`);
      }
    }

    if (fs.existsSync(holidaysPath)) {
      try {
        holidaysData = JSON.parse(fs.readFileSync(holidaysPath, 'utf-8'));
      } catch (err: any) {
        limitations.push(`Failed to parse holidays_and_lists.json: ${err?.message}`);
      }
    }

    if (fs.existsSync(shiftsPath)) {
      try {
        shiftsData = JSON.parse(fs.readFileSync(shiftsPath, 'utf-8'));
      } catch (err: any) {
        limitations.push(`Failed to parse shifts_and_assignments.json: ${err?.message}`);
      }
    }

    if (fs.existsSync(tlRotationPath)) {
      try {
        tlRotationData = JSON.parse(fs.readFileSync(tlRotationPath, 'utf-8'));
      } catch (err: any) {
        limitations.push(`Failed to parse team_leader_rotation.json: ${err?.message}`);
      }
    }

    if (fs.existsSync(auditLogsPath)) {
      try {
        auditLogsData = JSON.parse(fs.readFileSync(auditLogsPath, 'utf-8'));
      } catch (err: any) {
        limitations.push(`Failed to parse audit_logs_meta.json: ${err?.message}`);
      }
    }

    if (fs.existsSync(brandingPath)) {
      try {
        brandingData = JSON.parse(fs.readFileSync(brandingPath, 'utf-8'));
      } catch (err: any) {
        limitations.push(`Failed to parse company_branding.json: ${err?.message}`);
      }
    }

    const sourceRoles = Array.isArray(rolesUsersData.roles) ? rolesUsersData.roles : [];
    const sourceDepts = Array.isArray(rolesUsersData.departments) ? rolesUsersData.departments : [];
    const sourceDesigs = Array.isArray(rolesUsersData.designations) ? rolesUsersData.designations : [];
    const sourceUsers = Array.isArray(rolesUsersData.users) ? rolesUsersData.users : [];
    const sourceHolidayLists = Array.isArray(holidaysData.holidayLists) ? holidaysData.holidayLists : [];
    const sourceHolidays = Array.isArray(holidaysData.holidays) ? holidaysData.holidays : [];
    const sourceShifts = Array.isArray(shiftsData.shifts) ? shiftsData.shifts : [];
    const sourceSegments = sourceShifts.flatMap((s: any) => (Array.isArray(s.segments) ? s.segments : []));
    const sourceRotations = Array.isArray(tlRotationData.rotationRules) ? tlRotationData.rotationRules : [];
    const sourceLogs = Array.isArray(auditLogsData.logs) ? auditLogsData.logs : [];

    const sourceCounts = {
      roles: sourceRoles.length,
      departments: sourceDepts.length,
      designations: sourceDesigs.length,
      users: sourceUsers.length,
      employees: sourceUsers.filter((u: any) => u.employeeCode || u.employeeId).length,
      holidayLists: sourceHolidayLists.length,
      holidays: sourceHolidays.length,
      shifts: sourceShifts.length,
      shiftSegments: sourceSegments.length,
      teamLeaderRotations: sourceRotations.length,
      auditLogs: sourceLogs.length,
    };

    // 2. Fetch existing records in DB to preserve and prevent duplication
    const existingRoles = await db.select().from(roles);
    const existingDepts = await db.select().from(departments);
    const existingDesigs = await db.select().from(designations);
    const existingUsers = await db.select().from(users);
    const existingEmployees = await db.select().from(employees);
    const existingHolidayLists = await db.select().from(holidayLists);
    const existingHolidays = await db.select().from(holidays);
    const existingShifts = await db.select().from(shifts);
    const existingSegments = await db.select().from(shiftSegments);
    const existingRotations = await db.select().from(teamLeaderRotations);
    const existingAuditLogs = await db.select().from(systemAuditLogs);

    const roleMapById = new Map<number, any>(existingRoles.map((r: any) => [r.id, r]));
    const roleMapByName = new Map<string, any>(existingRoles.map((r: any) => [r.name.toUpperCase(), r]));
    const deptMapById = new Map<number, any>(existingDepts.map((d: any) => [d.id, d]));
    const deptMapByCode = new Map<string, any>(existingDepts.map((d: any) => [d.code.toUpperCase(), d]));
    const desigMapById = new Map<number, any>(existingDesigs.map((d: any) => [d.id, d]));
    const desigMapByCode = new Map<string, any>(existingDesigs.map((d: any) => [d.code.toUpperCase(), d]));
    const userMapById = new Map<number, any>(existingUsers.map((u: any) => [u.id, u]));
    const userMapByUsername = new Map<string, any>(
      existingUsers.map((u: any) => [u.username.toLowerCase(), u])
    );
    const empMapById = new Map<number, any>(existingEmployees.map((e: any) => [e.id, e]));
    const empMapByCode = new Map<string, any>(
      existingEmployees.map((e: any) => [String(e.employeeCode).toUpperCase(), e])
    );
    const hlMapById = new Map<number, any>(existingHolidayLists.map((h: any) => [h.id, h]));
    const hlMapByCode = new Map<string, any>(
      existingHolidayLists.map((h: any) => [String(h.listCode).toUpperCase(), h])
    );
    const shiftMapById = new Map<number, any>(existingShifts.map((s: any) => [s.id, s]));
    const shiftMapByCode = new Map<string, any>(
      existingShifts.map((s: any) => [String(s.shiftCode).toUpperCase(), s])
    );

    let superAdminPreserved = true;
    const existingSuperAdmin = existingUsers.find(
      (u: any) => u.username.toLowerCase() === 'superadmin' || u.id === 1
    );
    if (existingSuperAdmin) {
      superAdminPreserved = true;
    }

    // 3. STEP A: Import Roles (preserving existing system roles)
    for (const r of sourceRoles) {
      if (!roleMapById.has(r.id) && !roleMapByName.has(String(r.name).toUpperCase())) {
        try {
          await db
            .insert(roles)
            .values({
              id: r.id,
              name: r.name,
              code: r.code || r.name,
              displayName: r.displayName || r.name,
              description: r.description || '',
              permissions: Array.isArray(r.permissions) ? r.permissions : [],
              isSystem: r.isSystem !== false,
              isActive: r.isActive !== false,
            })
            .onConflictDoNothing();
          const [inserted] = await db.select().from(roles).where(eq(roles.id, r.id));
          if (inserted) {
            roleMapById.set(inserted.id, inserted);
            roleMapByName.set(String(inserted.name).toUpperCase(), inserted);
          }
        } catch (err: any) {
          limitations.push(`Role ${r.name}: ${err?.message}`);
        }
      }
    }

    // 4. STEP B: Import Departments (Pass 1: headEmployeeId = null to satisfy FK)
    for (const d of sourceDepts) {
      if (!deptMapById.has(d.id) && !deptMapByCode.has(String(d.code).toUpperCase())) {
        try {
          await db
            .insert(departments)
            .values({
              id: d.id,
              name: d.name,
              code: d.code,
              description: d.description || null,
              headEmployeeId: null, // Set in Pass 2 after employees are created
              isActive: d.isActive !== false,
              createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
              updatedAt: d.updatedAt ? new Date(d.updatedAt) : new Date(),
            })
            .onConflictDoNothing();
          const [inserted] = await db.select().from(departments).where(eq(departments.id, d.id));
          if (inserted) {
            deptMapById.set(inserted.id, inserted);
            deptMapByCode.set(String(inserted.code).toUpperCase(), inserted);
          }
        } catch (err: any) {
          limitations.push(`Department ${d.code}: ${err?.message}`);
        }
      }
    }

    // 5. STEP C: Import Designations
    for (const des of sourceDesigs) {
      if (!desigMapById.has(des.id) && !desigMapByCode.has(String(des.code).toUpperCase())) {
        try {
          await db
            .insert(designations)
            .values({
              id: des.id,
              name: des.name,
              code: des.code,
              description: des.description || null,
              isActive: des.isActive !== false,
              createdAt: des.createdAt ? new Date(des.createdAt) : new Date(),
              updatedAt: des.updatedAt ? new Date(des.updatedAt) : new Date(),
            })
            .onConflictDoNothing();
          const [inserted] = await db.select().from(designations).where(eq(designations.id, des.id));
          if (inserted) {
            desigMapById.set(inserted.id, inserted);
            desigMapByCode.set(String(inserted.code).toUpperCase(), inserted);
          }
        } catch (err: any) {
          limitations.push(`Designation ${des.code}: ${err?.message}`);
        }
      }
    }

    // 6. STEP D: Import Users & Employees (Pass 1: Users, Pass 1: Employees with reportingManagerId = null)
    for (const u of sourceUsers) {
      const isSuperAdminAccount =
        String(u.username).toLowerCase() === 'superadmin' || Number(u.id) === 1;

      let dbUserId = u.id;
      const existingUser = userMapById.get(u.id) || userMapByUsername.get(String(u.username).toLowerCase());

      if (existingUser) {
        dbUserId = existingUser.id;
        // If superadmin already exists in Neon, DO NOT overwrite password or details!
        if (!isSuperAdminAccount) {
          // Keep existing user credentials intact
        }
      } else {
        // Resolve role ID safely
        let targetRoleId = u.roleId;
        if (!roleMapById.has(targetRoleId)) {
          const matchedRole = roleMapByName.get(String(u.roleName || 'EMPLOYEE').toUpperCase());
          if (matchedRole) {
            targetRoleId = matchedRole.id;
          }
        }

        try {
          await db
            .insert(users)
            .values({
              id: u.id,
              username: u.username,
              email: u.email,
              passwordHash: u.passwordHash, // Preserving exact passwordHash
              roleId: targetRoleId,
              operationalRole: u.operationalRole || null,
              isActive: u.isActive !== false,
              mustChangePassword: Boolean(u.mustChangePassword),
              profilePhoto: u.profilePhoto || null,
              credentialEmail: u.credentialEmail || null,
              createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
              updatedAt: u.updatedAt ? new Date(u.updatedAt) : new Date(),
            })
            .onConflictDoNothing();

          const [inserted] = await db.select().from(users).where(eq(users.id, u.id));
          if (inserted) {
            dbUserId = inserted.id;
            userMapById.set(inserted.id, inserted);
            userMapByUsername.set(String(inserted.username).toLowerCase(), inserted);
          }
        } catch (err: any) {
          limitations.push(`User ${u.username}: ${err?.message}`);
          continue;
        }
      }

      // Handle Employee record
      if (u.employeeCode || u.employeeId) {
        const empId = u.employeeId || u.id;
        const empCode = String(u.employeeCode || `EMP${String(empId).padStart(3, '0')}`).toUpperCase();
        const existingEmp = empMapById.get(empId) || empMapByCode.get(empCode);

        if (!existingEmp) {
          // Resolve Department & Designation FKs
          const deptId = u.departmentId && deptMapById.has(u.departmentId) ? u.departmentId : null;
          const desigId =
            u.designationId && desigMapById.has(u.designationId) ? u.designationId : null;

          try {
            await db
              .insert(employees)
              .values({
                id: empId,
                userId: dbUserId,
                employeeCode: empCode,
                employeeName: u.employeeName || u.username,
                officialEmail: u.officialEmail || u.email || `${u.username}@maestrotire.com`,
                mobile: u.mobile || null,
                departmentId: deptId,
                designationId: desigId,
                reportingManagerId: null, // Two-pass: updated in Pass 2
                joiningDate: u.joiningDate ? new Date(u.joiningDate) : null,
                officeLocation: u.officeLocation || null,
                remarks: u.remarks || null,
                employmentType: u.employmentType || 'FULL_TIME',
                employmentStatus: u.employmentStatus || (u.isActive ? 'ACTIVE' : 'INACTIVE'),
                isActive: u.isActive !== false,
                createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
                updatedAt: u.updatedAt ? new Date(u.updatedAt) : new Date(),
              })
              .onConflictDoNothing();

            const [insertedEmp] = await db.select().from(employees).where(eq(employees.id, empId));
            if (insertedEmp) {
              empMapById.set(insertedEmp.id, insertedEmp);
              empMapByCode.set(String(insertedEmp.employeeCode).toUpperCase(), insertedEmp);
            }
          } catch (err: any) {
            limitations.push(`Employee ${empCode}: ${err?.message}`);
          }
        }
      }
    }

    // 7. STEP E: Pass 2 - Update Employee Reporting Managers & Department Heads
    for (const u of sourceUsers) {
      if (u.employeeId && u.reportingManagerId) {
        // Check if reporting manager employee exists
        if (empMapById.has(u.reportingManagerId)) {
          try {
            await db
              .update(employees)
              .set({ reportingManagerId: u.reportingManagerId })
              .where(eq(employees.id, u.employeeId));
          } catch (err: any) {
            limitations.push(
              `Reporting Manager for emp ${u.employeeId} -> mgr ${u.reportingManagerId}: ${err?.message}`
            );
          }
        }
      }
    }

    for (const d of sourceDepts) {
      if (d.headEmployeeId && empMapById.has(d.headEmployeeId)) {
        try {
          await db
            .update(departments)
            .set({ headEmployeeId: d.headEmployeeId })
            .where(eq(departments.id, d.id));
        } catch (err: any) {
          limitations.push(
            `Department head for dept ${d.id} -> emp ${d.headEmployeeId}: ${err?.message}`
          );
        }
      }
    }

    // 8. STEP F: Import Holiday Lists
    const deptToHolidayListId = new Map<number, number>();

    for (const hl of sourceHolidayLists) {
      if (!hlMapById.has(hl.id) && !hlMapByCode.has(String(hl.listCode).toUpperCase())) {
        const deptId = hl.departmentId && deptMapById.has(hl.departmentId) ? hl.departmentId : null;
        try {
          await db
            .insert(holidayLists)
            .values({
              id: hl.id,
              listCode: hl.listCode,
              listName: hl.listName,
              year: hl.year || 2026,
              departmentId: deptId,
              isDefault: Boolean(hl.isDefault),
              isActive: hl.isActive !== false,
              description: hl.description || null,
              createdAt: hl.createdAt ? new Date(hl.createdAt) : new Date(),
              updatedAt: hl.updatedAt ? new Date(hl.updatedAt) : new Date(),
            })
            .onConflictDoNothing();

          const [insertedHl] = await db.select().from(holidayLists).where(eq(holidayLists.id, hl.id));
          if (insertedHl) {
            hlMapById.set(insertedHl.id, insertedHl);
            hlMapByCode.set(String(insertedHl.listCode).toUpperCase(), insertedHl);
            if (deptId) {
              deptToHolidayListId.set(deptId, insertedHl.id);
            }
          }
        } catch (err: any) {
          limitations.push(`HolidayList ${hl.listCode}: ${err?.message}`);
        }
      } else {
        const existing = hlMapById.get(hl.id) || hlMapByCode.get(String(hl.listCode).toUpperCase());
        if (existing?.departmentId) {
          deptToHolidayListId.set(existing.departmentId, existing.id);
        }
      }
    }

    // Fallback default list
    const defaultList = Array.from(hlMapById.values()).find((h: any) => h.isDefault) || existingHolidayLists[0];
    const defaultListId = defaultList ? defaultList.id : 1;

    // 9. STEP G: Import Holidays
    // CRITICAL: Map ONLY fields that exist in CURRENT database schema:
    // holidayDate, holidayName, description, holidayListId, isHalfDay, isOptional, isActive, year, createdAt, updatedAt
    // (Do NOT send departmentId or departmentName to holidays table)
    const existingHolidayDates = new Set(
      (await db.select().from(holidays)).map((h: any) => `${h.holidayDate}_${h.holidayListId || 'null'}`)
    );

    for (const h of sourceHolidays) {
      let targetListId: number | null = h.holidayListId || null;
      if (!targetListId && h.departmentId) {
        targetListId = deptToHolidayListId.get(h.departmentId) || null;
      }
      if (!targetListId && (h.departmentName === 'All Departments' || !h.departmentId)) {
        targetListId = defaultListId;
      }

      const key = `${h.holidayDate}_${targetListId || 'null'}`;
      if (!existingHolidayDates.has(key)) {
        const deptId = h.departmentId && deptMapById.has(h.departmentId) ? h.departmentId : null;
        const deptName = h.departmentName || (deptId ? deptMapById.get(deptId)?.name : null);
        try {
          await db
            .insert(holidays)
            .values({
              id: h.id,
              holidayDate: h.holidayDate,
              holidayName: h.holidayName,
              description: h.description || null,
              holidayListId: targetListId,
              departmentId: deptId,
              departmentName: deptName,
              isHalfDay: Boolean(h.isHalfDay),
              isOptional: Boolean(h.isOptional),
              isActive: h.isActive !== false,
              year: h.year || Number(String(h.holidayDate).split('-')[0]) || 2026,
              createdAt: h.createdAt ? new Date(h.createdAt) : new Date(),
              updatedAt: h.updatedAt ? new Date(h.updatedAt) : new Date(),
            })
            .onConflictDoNothing();
          existingHolidayDates.add(key);
        } catch (err: any) {
          limitations.push(`Holiday ${h.holidayDate} (${h.holidayName}): ${err?.message}`);
        }
      }
    }

    // 10. STEP H: Import Shifts & Shift Segments
    for (const s of sourceShifts) {
      let shiftId = s.id;
      if (!shiftMapById.has(s.id) && !shiftMapByCode.has(String(s.shiftCode).toUpperCase())) {
        try {
          await db
            .insert(shifts)
            .values({
              id: s.id,
              shiftCode: s.shiftCode,
              shiftName: s.shiftName,
              shiftType: s.shiftType || 'DAY',
              category: s.category || null,
              startTime: s.startTime || null,
              endTime: s.endTime || null,
              totalWorkingHours: s.totalWorkingHours !== undefined ? String(s.totalWorkingHours) : null,
              breakMinutes: s.breakMinutes || 0,
              weeklyOff: s.weeklyOff || 'Sunday',
              effectiveFrom: s.effectiveFrom || '2026-01-01',
              effectiveTo: s.effectiveTo || null,
              description: s.description || null,
              timingConfigured: s.timingConfigured !== false,
              isActive: s.isActive !== false,
              createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
              updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date(),
            })
            .onConflictDoNothing();

          const [insertedShift] = await db.select().from(shifts).where(eq(shifts.id, s.id));
          if (insertedShift) {
            shiftId = insertedShift.id;
            shiftMapById.set(insertedShift.id, insertedShift);
            shiftMapByCode.set(String(insertedShift.shiftCode).toUpperCase(), insertedShift);
          }
        } catch (err: any) {
          limitations.push(`Shift ${s.shiftCode}: ${err?.message}`);
        }
      }

      // Shift segments
      if (Array.isArray(s.segments)) {
        const existingSegIds = new Set(
          (await db.select().from(shiftSegments).where(eq(shiftSegments.shiftId, shiftId))).map(
            (seg: any) => seg.segmentSequence
          )
        );

        for (const seg of s.segments) {
          if (!existingSegIds.has(seg.segmentSequence)) {
            try {
              await db
                .insert(shiftSegments)
                .values({
                  id: seg.id,
                  shiftId: shiftId,
                  segmentSequence: seg.segmentSequence || 1,
                  startTime: seg.startTime,
                  endTime: seg.endTime,
                  crossesMidnight: Boolean(seg.crossesMidnight),
                  breakMinutes: seg.breakMinutes || 0,
                  isActive: seg.isActive !== false,
                  createdAt: seg.createdAt ? new Date(seg.createdAt) : new Date(),
                  updatedAt: seg.updatedAt ? new Date(seg.updatedAt) : new Date(),
                })
                .onConflictDoNothing();
            } catch (err: any) {
              limitations.push(`Shift segment for shift ${s.shiftCode} seq ${seg.segmentSequence}: ${err?.message}`);
            }
          }
        }
      }
    }

    // 11. STEP I: Import Team Leader Rotations
    const existingRotTeams = new Set(
      (await db.select().from(teamLeaderRotations)).map((r: any) => r.teamId)
    );

    for (const rot of sourceRotations) {
      if (!existingRotTeams.has(rot.teamId) && deptMapById.has(rot.teamId)) {
        const firstHalfEmpId = rot.firstHalfLeaderEmployeeId || rot.firstHalfLeaderId;
        const secondHalfEmpId = rot.secondHalfLeaderEmployeeId || rot.secondHalfLeaderId;

        if (empMapById.has(firstHalfEmpId) && empMapById.has(secondHalfEmpId)) {
          try {
            await db
              .insert(teamLeaderRotations)
              .values({
                id: rot.id,
                teamId: rot.teamId,
                rotationType: rot.rotationType || 'FIRST_HALF_SECOND_HALF',
                firstHalfLeaderId: firstHalfEmpId,
                firstHalfLeaderUserId: rot.firstHalfLeaderUserId && userMapById.has(rot.firstHalfLeaderUserId) ? rot.firstHalfLeaderUserId : null,
                secondHalfLeaderId: secondHalfEmpId,
                secondHalfLeaderUserId: rot.secondHalfLeaderUserId && userMapById.has(rot.secondHalfLeaderUserId) ? rot.secondHalfLeaderUserId : null,
                effectiveFrom: rot.effectiveFrom || '2026-01-01',
                effectiveTo: rot.effectiveTo || null,
                isActive: rot.isActive !== false,
                remarks: rot.remarks || null,
                createdBy: rot.createdBy && userMapById.has(rot.createdBy) ? rot.createdBy : null,
                updatedBy: rot.updatedBy && userMapById.has(rot.updatedBy) ? rot.updatedBy : null,
                createdAt: rot.createdAt ? new Date(rot.createdAt) : new Date(),
                updatedAt: rot.updatedAt ? new Date(rot.updatedAt) : new Date(),
              })
              .onConflictDoNothing();
            existingRotTeams.add(rot.teamId);
          } catch (err: any) {
            limitations.push(`Team Leader Rotation for team ${rot.teamId}: ${err?.message}`);
          }
        } else {
          limitations.push(
            `Skipped Team Leader Rotation for team ${rot.teamId}: Leader employee records (${firstHalfEmpId}, ${secondHalfEmpId}) not found in employees.`
          );
        }
      }
    }

    // 12. STEP J: Import Audit Logs (where actorId is safe / null if user not in DB)
    const existingAuditCount = (await db.select().from(systemAuditLogs)).length;
    if (existingAuditCount === 0 && sourceLogs.length > 0) {
      for (const log of sourceLogs) {
        const actorId = log.actorId && userMapById.has(log.actorId) ? log.actorId : null;
        try {
          await db
            .insert(systemAuditLogs)
            .values({
              id: log.id,
              actorId,
              actorRole: log.actorRole || 'SUPER_ADMIN',
              action: log.action || 'SYSTEM_AUDIT',
              targetEntity: log.targetEntity || 'system',
              targetId: log.targetId ? String(log.targetId) : null,
              metadata: log.metadata || {},
              ipAddress: log.ipAddress || null,
              userAgent: log.userAgent || null,
              createdAt: log.createdAt ? new Date(log.createdAt) : new Date(),
            })
            .onConflictDoNothing();
        } catch (err: any) {
          limitations.push(`Audit log #${log.id}: ${err?.message}`);
        }
      }
    } else if (existingAuditCount > 0) {
      limitations.push(`Audit logs table already contains ${existingAuditCount} records; skipped bulk log duplicate injection.`);
    }

    // 13. STEP K: Import Company Branding & Settings
    if (brandingData.settings && typeof brandingData.settings === 'object') {
      for (const [key, val] of Object.entries(brandingData.settings)) {
        if (typeof val === 'string') {
          try {
            await db
              .insert(systemSettings)
              .values({
                key,
                value: val,
                description: `Imported setting ${key}`,
                category: 'GENERAL',
                isPublic: true,
              })
              .onConflictDoNothing();
          } catch {}
        }
      }
    }

    // 14. STEP L: Reset PostgreSQL Serial Sequences
    try {
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('roles', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM roles), 1))`);
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('departments', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM departments), 1))`);
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('designations', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM designations), 1))`);
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM users), 1))`);
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('employees', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM employees), 1))`);
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('holiday_lists', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM holiday_lists), 1))`);
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('holidays', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM holidays), 1))`);
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('shifts', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM shifts), 1))`);
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('shift_segments', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM shift_segments), 1))`);
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('team_leader_rotations', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM team_leader_rotations), 1))`);
      await db.execute(sql`SELECT setval(pg_get_serial_sequence('system_audit_logs', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM system_audit_logs), 1))`);
    } catch (seqErr: any) {
      limitations.push(`Sequence reset warning: ${seqErr?.message}`);
    }

    // 15. Fetch final record counts from DB
    const finalRoles = await db.select().from(roles);
    const finalDepts = await db.select().from(departments);
    const finalDesigs = await db.select().from(designations);
    const finalUsers = await db.select().from(users);
    const finalEmps = await db.select().from(employees);
    const finalHolidayLists = await db.select().from(holidayLists);
    const finalHolidays = await db.select().from(holidays);
    const finalShifts = await db.select().from(shifts);
    const finalSegments = await db.select().from(shiftSegments);
    const finalRotations = await db.select().from(teamLeaderRotations);
    const finalLogs = await db.select().from(systemAuditLogs);

    const neonCounts = {
      roles: finalRoles.length,
      departments: finalDepts.length,
      designations: finalDesigs.length,
      users: finalUsers.length,
      employees: finalEmps.length,
      holidayLists: finalHolidayLists.length,
      holidays: finalHolidays.length,
      shifts: finalShifts.length,
      shiftSegments: finalSegments.length,
      teamLeaderRotations: finalRotations.length,
      auditLogs: finalLogs.length,
    };

    return {
      success: true,
      message: 'Local metadata imported and synchronized into PostgreSQL / Neon database successfully.',
      sourceCounts,
      neonCounts,
      superAdminPreserved,
      limitations,
    };
  }
}

// Standalone CLI runner support (e.g. npx tsx src/services/dataImportService.ts)
if (process.argv[1]?.endsWith('dataImportService.ts')) {
  DataImportService.importLocalMetadataToDatabase()
    .then((report) => {
      console.log('=== DATA IMPORT REPORT ===');
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Data import failed:', err);
      process.exit(1);
    });
}
