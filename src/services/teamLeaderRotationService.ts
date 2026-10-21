import fs from 'fs';
import path from 'path';
import {
  AuthContext,
  CreateTeamLeaderAssignmentInput,
  CreateTeamLeaderRotationRuleInput,
  ResolvedTeamLeaderDto,
  TeamLeaderAssignmentDto,
  TeamLeaderAssignmentStatus,
  TeamLeaderAssignmentType,
  TeamLeaderRotationRuleDto,
  TeamLeaderRotationType,
  TeamRotationSummaryDto,
  UpdateTeamLeaderAssignmentInput,
  UpdateTeamLeaderRotationRuleInput,
} from '../types/leave.ts';
import { ValidationError } from './validation.ts';
import { UserService } from './userService.ts';
import { AuditService } from './auditService.ts';
import { NotificationService } from './notificationService.ts';

const ROTATION_STORE_FILE = path.join(
  process.cwd(),
  'uploads',
  'metadata',
  'team_leader_rotation.json'
);

interface PersistedRotationStore {
  assignments: TeamLeaderAssignmentDto[];
  rotationRules: TeamLeaderRotationRuleDto[];
}

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function parseStrictIsoDate(dateInput: string | Date | undefined | null, fieldLabel = 'Date'): string {
  if (!dateInput) {
    throw new ValidationError(`${fieldLabel} is required in YYYY-MM-DD format.`);
  }
  const str =
    dateInput instanceof Date
      ? dateInput.toISOString().slice(0, 10)
      : String(dateInput).trim().slice(0, 10);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!match) {
    throw new ValidationError(`${fieldLabel} must be in YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) {
    throw new ValidationError(`${fieldLabel} has an invalid month (${month}).`);
  }

  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > maxDay) {
    throw new ValidationError(
      `${fieldLabel} (${str}) is not a valid calendar date (month ${month} of ${year} has ${maxDay} days).`
    );
  }

  return str;
}

function formatHumanPeriodLabel(effectiveFrom: string, effectiveTo: string): string {
  try {
    const fromParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveFrom);
    const toParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveTo);
    if (!fromParts || !toParts) {
      return `${effectiveFrom} – ${effectiveTo}`;
    }
    const fromYear = Number(fromParts[1]);
    const fromMonthIdx = Number(fromParts[2]) - 1;
    const fromDay = fromParts[3];

    const toYear = Number(toParts[1]);
    const toMonthIdx = Number(toParts[2]) - 1;
    const toDay = toParts[3];

    if (fromYear === toYear && fromMonthIdx === toMonthIdx) {
      return `${fromDay}–${toDay} ${MONTH_SHORT_NAMES[fromMonthIdx]}`;
    }
    if (fromYear === toYear) {
      return `${fromDay} ${MONTH_SHORT_NAMES[fromMonthIdx]} – ${toDay} ${MONTH_SHORT_NAMES[toMonthIdx]}`;
    }
    return `${fromDay} ${MONTH_SHORT_NAMES[fromMonthIdx]} ${fromYear} – ${toDay} ${MONTH_SHORT_NAMES[toMonthIdx]} ${toYear}`;
  } catch {
    return `${effectiveFrom} – ${effectiveTo}`;
  }
}

function subtractOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function createDefaultRotationRules(): TeamLeaderRotationRuleDto[] {
  // Resolve the AR department and its two scheduled leaders from the authoritative
  // employee/department records. This avoids relying on different seeded DB IDs.
  const dept =
    UserService.resolveDepartmentRecordSync('AR_TNSPRT_USA') ||
    UserService.resolveDepartmentRecordSync('AR_TRANS') ||
    UserService.resolveDepartmentRecordSync('AR Transport') ||
    UserService.resolveDepartmentRecordSync('A R Transportation');

  const firstLeader =
    UserService.resolveEmployeeRecordSync('MT021') ||
    UserService.resolveEmployeeRecordSync('Anil Sharma') ||
    UserService.resolveEmployeeRecordSync('ANIL');
  const secondLeader =
    UserService.resolveEmployeeRecordSync('MT022') ||
    UserService.resolveEmployeeRecordSync('Akash Sharma') ||
    UserService.resolveEmployeeRecordSync('AKASH');

  // Do not create a partial or incorrectly targeted rule when authoritative records
  // are unavailable. The normal Reporting Person remains the fallback in that case.
  if (!dept || !firstLeader || !secondLeader) return [];

  const now = new Date().toISOString();
  return [
    {
      id: 1,
      teamId: dept.id,
      teamName: dept.name,
      teamCode: dept.code,
      rotationType: 'FIRST_HALF_SECOND_HALF',
      firstHalfStartDay: 1,
      firstHalfEndDay: 15,
      firstHalfLeaderUserId: firstLeader.id,
      firstHalfLeaderEmployeeId: firstLeader.employeeId ?? firstLeader.id,
      firstHalfLeaderEmployeeCode: firstLeader.employeeCode ?? null,
      firstHalfLeaderName: firstLeader.employeeName || firstLeader.username,
      firstHalfLeaderEmail: firstLeader.email,
      secondHalfStartDay: 16,
      secondHalfLeaderUserId: secondLeader.id,
      secondHalfLeaderEmployeeId: secondLeader.employeeId ?? secondLeader.id,
      secondHalfLeaderEmployeeCode: secondLeader.employeeCode ?? null,
      secondHalfLeaderName: secondLeader.employeeName || secondLeader.username,
      secondHalfLeaderEmail: secondLeader.email,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      status: 'ACTIVE',
      isActive: true,
      remarks: 'Default AR Team 15-day rotation: 01–15 Anil Sharma, 16–Month End Akash Sharma',
      createdBy: 1,
      createdByName: 'System Super Admin',
      createdAt: now,
      updatedBy: 1,
      updatedByName: 'System Super Admin',
      updatedAt: now,
    },
  ];
}

function createDefaultAssignments(): TeamLeaderAssignmentDto[] {
  return [];
}

let memoryRotationRules: TeamLeaderRotationRuleDto[] = [];
let memoryAssignments: TeamLeaderAssignmentDto[] = createDefaultAssignments();
let rotationDefaultsInitialized = false;
let legacyDefaultRotationNeedsMigration = false;

function saveRotationStoreToDisk(): void {
  try {
    const dir = path.dirname(ROTATION_STORE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload: PersistedRotationStore = {
      assignments: memoryAssignments,
      rotationRules: memoryRotationRules,
    };
    fs.writeFileSync(ROTATION_STORE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not persist team_leader_rotation.json:', err);
  }
}

function loadRotationStoreFromDisk(): void {
  try {
    if (!fs.existsSync(ROTATION_STORE_FILE)) {
      // Defaults are initialized lazily after UserService has loaded the authoritative
      // database records. Calling it during module initialization can use stale seed IDs.
      memoryRotationRules = [];
      memoryAssignments = createDefaultAssignments();
      rotationDefaultsInitialized = false;
      legacyDefaultRotationNeedsMigration = false;
      return;
    }

    const raw = fs.readFileSync(ROTATION_STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedRotationStore>;
    const parsedRules = Array.isArray(parsed.rotationRules) ? parsed.rotationRules : [];

    // Migrate the old built-in Import Team seed rule. It was a shipped default, not an
    // administrator-created assignment, and the only rotating team is AR Transport.
    const isLegacySeedRule = (rule: TeamLeaderRotationRuleDto) =>
      rule.teamId === 8 &&
      rule.firstHalfLeaderEmployeeId === 8 &&
      rule.secondHalfLeaderEmployeeId === 9 &&
      String(rule.remarks || '').startsWith('Default 15-day Team Leader rotation');

    legacyDefaultRotationNeedsMigration = parsedRules.some(isLegacySeedRule);
    memoryRotationRules = parsedRules.filter((rule) => !isLegacySeedRule(rule));
    memoryAssignments = Array.isArray(parsed.assignments)
      ? parsed.assignments
      : createDefaultAssignments();
    rotationDefaultsInitialized =
      memoryRotationRules.length > 0 && !legacyDefaultRotationNeedsMigration;
  } catch (err) {
    console.warn('Could not load team_leader_rotation.json, using defaults:', err);
    memoryRotationRules = [];
    memoryAssignments = createDefaultAssignments();
    rotationDefaultsInitialized = false;
    legacyDefaultRotationNeedsMigration = false;
  }
}

function ensureDefaultRotationRules(): void {
  if (rotationDefaultsInitialized) return;

  const defaults = createDefaultRotationRules();
  if (legacyDefaultRotationNeedsMigration) {
    memoryRotationRules = [...memoryRotationRules, ...defaults];
    legacyDefaultRotationNeedsMigration = false;
  } else if (memoryRotationRules.length === 0) {
    memoryRotationRules = defaults;
  }

  rotationDefaultsInitialized = true;
  if (defaults.length > 0) saveRotationStoreToDisk();
}

loadRotationStoreFromDisk();

export class TeamLeaderRotationService {
  /**
   * Resets in-memory Team Leader rotation rules and assignments to clean defaults.
   */
  public static resetMemoryStores(): void {
    memoryRotationRules = [];
    memoryAssignments = createDefaultAssignments();
    rotationDefaultsInitialized = false;
    legacyDefaultRotationNeedsMigration = false;
    ensureDefaultRotationRules();
    saveRotationStoreToDisk();
  }

  /**
   * Calculates the exact last day of a given month (28, 29, 30, or 31).
   * Never hardcodes 30 days.
   */
  public static getLastDayOfMonth(year: number, month: number): number {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError(`Invalid year/month for month-end calculation: ${year}-${month}`);
    }
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /**
   * Computes the current half-month window (Day 1–15 vs Day 16–Month End)
   * and the immediately upcoming half-month window for any target date.
   */
  public static getHalfMonthPeriodForDate(targetDateInput: string | Date): {
    dateStr: string;
    year: number;
    month: number;
    day: number;
    lastDayOfMonth: number;
    half: 'FIRST_HALF' | 'SECOND_HALF';
    periodStart: string;
    periodEnd: string;
    periodLabel: string;
    nextHalf: 'FIRST_HALF' | 'SECOND_HALF';
    nextPeriodStart: string;
    nextPeriodEnd: string;
    nextPeriodLabel: string;
  } {
    const dateStr = parseStrictIsoDate(targetDateInput, 'Target date');
    const year = Number(dateStr.slice(0, 4));
    const month = Number(dateStr.slice(5, 7));
    const day = Number(dateStr.slice(8, 10));
    const lastDayOfMonth = this.getLastDayOfMonth(year, month);
    const ymPrefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;

    if (day <= 15) {
      const periodStart = `${ymPrefix}-01`;
      const periodEnd = `${ymPrefix}-15`;
      const nextPeriodStart = `${ymPrefix}-16`;
      const nextPeriodEnd = `${ymPrefix}-${String(lastDayOfMonth).padStart(2, '0')}`;
      return {
        dateStr,
        year,
        month,
        day,
        lastDayOfMonth,
        half: 'FIRST_HALF',
        periodStart,
        periodEnd,
        periodLabel: formatHumanPeriodLabel(periodStart, periodEnd),
        nextHalf: 'SECOND_HALF',
        nextPeriodStart,
        nextPeriodEnd,
        nextPeriodLabel: formatHumanPeriodLabel(nextPeriodStart, nextPeriodEnd),
      };
    }

    const periodStart = `${ymPrefix}-16`;
    const periodEnd = `${ymPrefix}-${String(lastDayOfMonth).padStart(2, '0')}`;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYmPrefix = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
    const nextPeriodStart = `${nextYmPrefix}-01`;
    const nextPeriodEnd = `${nextYmPrefix}-15`;

    return {
      dateStr,
      year,
      month,
      day,
      lastDayOfMonth,
      half: 'SECOND_HALF',
      periodStart,
      periodEnd,
      periodLabel: formatHumanPeriodLabel(periodStart, periodEnd),
      nextHalf: 'FIRST_HALF',
      nextPeriodStart,
      nextPeriodEnd,
      nextPeriodLabel: formatHumanPeriodLabel(nextPeriodStart, nextPeriodEnd),
    };
  }

  /**
   * Authorization check: Only authorized administrative roles (SUPER_ADMIN, HR, or roles with
   * TEAM_LEADER_ROTATION_MANAGE / DEPARTMENT_MANAGE) can create, edit, or deactivate Team Leader assignments.
   * EMPLOYEE and TEAM_LEADER are strictly prohibited.
   */
  public static async assertCanManageRotation(actor?: AuthContext | null): Promise<void> {
    if (!actor || !actor.role) {
      throw new Error('Forbidden: Authentication required.');
    }
    if (actor.role === 'EMPLOYEE' || actor.role === 'TEAM_LEADER') {
      throw new Error(
        `Forbidden: ${actor.role} role is not permitted to create, modify, or delete Team Leader assignments or rotation rules.`
      );
    }
    if (actor.role === 'SUPER_ADMIN' || actor.role === 'HR') {
      return;
    }
    const hasCustomPerm =
      (await UserService.hasPermission(actor, 'TEAM_LEADER_ROTATION_MANAGE')) ||
      (await UserService.hasPermission(actor, 'DEPARTMENT_MANAGE'));
    if (!hasCustomPerm) {
      throw new Error(
        'Forbidden: Only authorized administrators (Super Admin or HR) can manage Team Leader assignments and rotation rules.'
      );
    }
  }

  /**
   * Validates and resolves a candidate Team Leader employee/user record.
   * Ensures the user exists, is active, and holds the TEAM_LEADER role (or operationalRole).
   */
  public static validateEligibleTeamLeader(
    leaderIdentifier: { employeeId?: number | string | null; userId?: number | null; employeeCode?: string | null },
    fieldLabel = 'Team Leader'
  ): {
    userId: number;
    employeeId: number;
    employeeCode: string | null;
    employeeName: string;
    email: string;
    isActive: boolean;
    isEligibleRole: boolean;
  } {
    const candidate = UserService.findLeaderRecordSync({
      employeeId: leaderIdentifier.employeeId ?? leaderIdentifier.employeeCode ?? null,
      userId: leaderIdentifier.userId ?? null,
    });
    if (!candidate) {
      throw new ValidationError(`${fieldLabel} does not exist.`);
    }
    if (!candidate.isActive || candidate.employmentStatus === 'INACTIVE') {
      throw new ValidationError(
        `${fieldLabel} '${candidate.employeeName}' is inactive and cannot be assigned as an active Team Leader.`
      );
    }
    if (!candidate.isEligibleTeamLeader) {
      throw new ValidationError(
        `User '${candidate.employeeName}' (Role: ${candidate.roleName}) is not authorized for the TEAM_LEADER role.`
      );
    }
    return {
      userId: candidate.userId,
      employeeId: candidate.employeeId,
      employeeCode: candidate.employeeCode,
      employeeName: candidate.employeeName,
      email: candidate.email,
      isActive: candidate.isActive,
      isEligibleRole: candidate.isEligibleTeamLeader,
    };
  }

  /**
   * Enriches an assignment record with latest team and employee names.
   */
  private static enrichAssignment(record: TeamLeaderAssignmentDto): TeamLeaderAssignmentDto {
    const dept = UserService.getDepartmentByIdSync(record.teamId);
    const leader = UserService.findLeaderRecordSync({
      employeeId: record.teamLeaderEmployeeId,
      userId: record.teamLeaderUserId,
    });
    return {
      ...record,
      teamName: dept?.name || record.teamName || `Team #${record.teamId}`,
      teamCode: dept?.code || record.teamCode || null,
      teamLeaderName: leader?.employeeName || record.teamLeaderName || `Leader #${record.teamLeaderEmployeeId}`,
      teamLeaderEmployeeCode: leader?.employeeCode ?? record.teamLeaderEmployeeCode ?? null,
      teamLeaderEmail: leader?.email ?? record.teamLeaderEmail ?? null,
    };
  }

  /**
   * Enriches a rotation rule record with latest team and employee names.
   */
  private static enrichRotationRule(rule: TeamLeaderRotationRuleDto): TeamLeaderRotationRuleDto {
    const dept = UserService.getDepartmentByIdSync(rule.teamId);
    const firstLeader = UserService.findLeaderRecordSync({
      employeeId: rule.firstHalfLeaderEmployeeId,
      userId: rule.firstHalfLeaderUserId,
    });
    const secondLeader = UserService.findLeaderRecordSync({
      employeeId: rule.secondHalfLeaderEmployeeId,
      userId: rule.secondHalfLeaderUserId,
    });
    return {
      ...rule,
      teamName: dept?.name || rule.teamName || `Team #${rule.teamId}`,
      teamCode: dept?.code || rule.teamCode || null,
      firstHalfLeaderName:
        firstLeader?.employeeName || rule.firstHalfLeaderName || `Leader #${rule.firstHalfLeaderEmployeeId}`,
      firstHalfLeaderEmployeeCode:
        firstLeader?.employeeCode ?? rule.firstHalfLeaderEmployeeCode ?? null,
      firstHalfLeaderEmail: firstLeader?.email ?? rule.firstHalfLeaderEmail ?? null,
      secondHalfLeaderName:
        secondLeader?.employeeName || rule.secondHalfLeaderName || `Leader #${rule.secondHalfLeaderEmployeeId}`,
      secondHalfLeaderEmployeeCode:
        secondLeader?.employeeCode ?? rule.secondHalfLeaderEmployeeCode ?? null,
      secondHalfLeaderEmail: secondLeader?.email ?? rule.secondHalfLeaderEmail ?? null,
    };
  }

  /**
   * AUTHORITATIVE DATE-EFFECTIVE TEAM LEADER RESOLVER (Synchronous core).
   *
   * Resolves the single responsible Team Leader for `teamId` on `targetDateInput`.
   * Resolution Precedence:
   *   1. Active explicit OVERRIDE / TEMPORARY_REPLACEMENT assignment covering targetDate
   *   2. Active explicit STANDARD / ROTATION_GENERATED date-effective assignment covering targetDate
   *   3. Active 15-Day Rotation Rule (FIRST_HALF_SECOND_HALF: Day 1–15 Leader A, Day 16–Month End Leader B)
   *   4. Legacy fallback to employee's reportingManagerId ONLY when the team has no date-effective
   *      assignment and no rotation rule configured for targetDate.
   */
  public static resolveTeamLeaderSync(
    teamId: number | string | null | undefined,
    targetDateInput: string | Date,
    options?: {
      fallbackEmployeeId?: number | string | null;
      allowInactiveForHistory?: boolean;
    }
  ): ResolvedTeamLeaderDto | null {
    ensureDefaultRotationRules();
    const dateStr = parseStrictIsoDate(targetDateInput, 'Target date');
    const resolvedDept = teamId !== undefined && teamId !== null
      ? UserService.resolveDepartmentRecordSync(teamId)
      : null;
    const normalizedTeamId = resolvedDept ? resolvedDept.id : (teamId ? Number(teamId) : null);

    if (normalizedTeamId && !Number.isNaN(normalizedTeamId)) {
      const dept = resolvedDept || UserService.getDepartmentByIdSync(normalizedTeamId);
      const teamName = dept?.name || `Team #${normalizedTeamId}`;
      const teamCode = dept?.code || null;

      // Find all active assignments for this team covering `dateStr`
      const matchingAssignments = memoryAssignments.filter(
        (a) =>
          a.teamId === normalizedTeamId &&
          a.isActive &&
          a.status === 'ACTIVE' &&
          a.effectiveFrom <= dateStr &&
          dateStr <= a.effectiveTo
      );

      // Priority 1: Exception / Override / Temporary Replacement assignments
      const overrideAssignments = matchingAssignments
        .filter(
          (a) => a.assignmentType === 'OVERRIDE' || a.assignmentType === 'TEMPORARY_REPLACEMENT'
        )
        .sort((a, b) => b.id - a.id);

      for (const assign of overrideAssignments) {
        const leader = UserService.findLeaderRecordSync({
          employeeId: assign.teamLeaderEmployeeId,
          userId: assign.teamLeaderUserId,
        });
        const isLeaderValid =
          leader &&
          leader.isEligibleTeamLeader &&
          (options?.allowInactiveForHistory || (leader.isActive && leader.employmentStatus !== 'INACTIVE'));
        if (isLeaderValid && leader) {
          return {
            teamId: normalizedTeamId,
            teamName,
            teamCode,
            departmentCode: teamCode,
            targetDate: dateStr,
            teamLeaderUserId: leader.userId,
            teamLeaderEmployeeId: leader.employeeId,
            teamLeaderEmployeeCode: leader.employeeCode,
            teamLeaderName: leader.employeeName,
            teamLeaderEmail: leader.email,
            source: 'OVERRIDE_ASSIGNMENT',
            assignmentId: assign.id,
            rotationRuleId: assign.rotationRuleId ?? null,
            effectiveFrom: assign.effectiveFrom,
            effectiveTo: assign.effectiveTo,
            periodLabel: formatHumanPeriodLabel(assign.effectiveFrom, assign.effectiveTo),
          };
        }
      }

      // Priority 2: Standard date-effective assignments
      const standardAssignments = matchingAssignments
        .filter(
          (a) => a.assignmentType !== 'OVERRIDE' && a.assignmentType !== 'TEMPORARY_REPLACEMENT'
        )
        .sort((a, b) => b.id - a.id);

      let hadConfiguredStandardOrRuleOnDate = standardAssignments.length > 0;

      for (const assign of standardAssignments) {
        const leader = UserService.findLeaderRecordSync({
          employeeId: assign.teamLeaderEmployeeId,
          userId: assign.teamLeaderUserId,
        });
        const isLeaderValid =
          leader &&
          leader.isEligibleTeamLeader &&
          (options?.allowInactiveForHistory || (leader.isActive && leader.employmentStatus !== 'INACTIVE'));
        if (isLeaderValid && leader) {
          return {
            teamId: normalizedTeamId,
            teamName,
            teamCode,
            departmentCode: teamCode,
            targetDate: dateStr,
            teamLeaderUserId: leader.userId,
            teamLeaderEmployeeId: leader.employeeId,
            teamLeaderEmployeeCode: leader.employeeCode,
            teamLeaderName: leader.employeeName,
            teamLeaderEmail: leader.email,
            source: 'DATE_ASSIGNMENT',
            assignmentId: assign.id,
            rotationRuleId: assign.rotationRuleId ?? null,
            effectiveFrom: assign.effectiveFrom,
            effectiveTo: assign.effectiveTo,
            periodLabel: formatHumanPeriodLabel(assign.effectiveFrom, assign.effectiveTo),
          };
        }
      }

      // Priority 3: Active 15-Day Rotation Rule for this team covering `dateStr`
      const matchingRules = memoryRotationRules
        .filter(
          (r) =>
            r.teamId === normalizedTeamId &&
            r.isActive &&
            r.status === 'ACTIVE' &&
            r.effectiveFrom <= dateStr &&
            (!r.effectiveTo || dateStr <= r.effectiveTo)
        )
        .sort((a, b) => b.id - a.id);

      if (matchingRules.length > 0) {
        hadConfiguredStandardOrRuleOnDate = true;
        const rule = matchingRules[0];
        const halfPeriod = this.getHalfMonthPeriodForDate(dateStr);

        const isFirstHalf = halfPeriod.day >= rule.firstHalfStartDay && halfPeriod.day <= rule.firstHalfEndDay;
        const targetLeaderEmployeeId = isFirstHalf
          ? rule.firstHalfLeaderEmployeeId
          : rule.secondHalfLeaderEmployeeId;
        const targetLeaderUserId = isFirstHalf
          ? rule.firstHalfLeaderUserId
          : rule.secondHalfLeaderUserId;

        const effectiveFrom =
          rule.effectiveFrom > halfPeriod.periodStart ? rule.effectiveFrom : halfPeriod.periodStart;
        const effectiveTo =
          rule.effectiveTo && rule.effectiveTo < halfPeriod.periodEnd
            ? rule.effectiveTo
            : halfPeriod.periodEnd;

        const leader = UserService.findLeaderRecordSync({
          employeeId: targetLeaderEmployeeId,
          userId: targetLeaderUserId,
        });
        const isLeaderValid =
          leader &&
          leader.isEligibleTeamLeader &&
          (options?.allowInactiveForHistory || (leader.isActive && leader.employmentStatus !== 'INACTIVE'));

        if (isLeaderValid && leader) {
          return {
            teamId: normalizedTeamId,
            teamName,
            teamCode,
            departmentCode: teamCode,
            targetDate: dateStr,
            teamLeaderUserId: leader.userId,
            teamLeaderEmployeeId: leader.employeeId,
            teamLeaderEmployeeCode: leader.employeeCode,
            teamLeaderName: leader.employeeName,
            teamLeaderEmail: leader.email,
            source: 'ROTATION_RULE',
            assignmentId: null,
            rotationRuleId: rule.id,
            effectiveFrom,
            effectiveTo,
            periodLabel: formatHumanPeriodLabel(effectiveFrom, effectiveTo),
          };
        }
      }

      // If the team had an explicit assignment or rotation rule for `dateStr`,
      // but the assigned Team Leader is currently inactive and no override was set,
      // return null rather than routing to an unauthorized/stale leader.
      if (hadConfiguredStandardOrRuleOnDate) {
        return null;
      }
    }

    // Priority 4: Backward-compatible fallback to employee's reportingManagerId
    // when the team does not use date-effective assignments or rotation rules on `dateStr`.
    if (options?.fallbackEmployeeId) {
      const empHierarchy = UserService.getEmployeeRoleAndHierarchySync(options.fallbackEmployeeId);
      if (empHierarchy && empHierarchy.reportingManagerId && empHierarchy.reportingManagerIsActive) {
        const mgrLeader = UserService.findLeaderRecordSync({
          employeeId: empHierarchy.reportingManagerId,
          userId: empHierarchy.reportingManagerUserId ?? undefined,
        });
        if (mgrLeader && mgrLeader.isActive && mgrLeader.isEligibleTeamLeader) {
          const fallbackTeamId = normalizedTeamId ?? empHierarchy.departmentId ?? 0;
          const dept = fallbackTeamId ? UserService.getDepartmentByIdSync(fallbackTeamId) : null;
          const teamCode = dept?.code || empHierarchy.departmentCode || null;
          return {
            teamId: fallbackTeamId,
            teamName: dept?.name || empHierarchy.departmentName || 'Assigned Team',
            teamCode,
            departmentCode: teamCode,
            targetDate: dateStr,
            teamLeaderUserId: mgrLeader.userId,
            teamLeaderEmployeeId: mgrLeader.employeeId,
            teamLeaderEmployeeCode: mgrLeader.employeeCode,
            teamLeaderName: mgrLeader.employeeName,
            teamLeaderEmail: mgrLeader.email,
            source: 'REPORTING_MANAGER_FALLBACK',
            assignmentId: null,
            rotationRuleId: null,
            effectiveFrom: '2026-01-01',
            effectiveTo: '2099-12-31',
            periodLabel: 'Permanent Reporting Assignment',
          };
        }
      }
    }

    return null;
  }

  /**
   * Async wrapper for the authoritative Team Leader resolver `resolveTeamLeader(teamId, targetDate)`.
   */
  public static async resolveTeamLeader(
    teamId: number | string | null | undefined,
    targetDateInput: string | Date,
    options?: {
      fallbackEmployeeId?: number | string | null;
      allowInactiveForHistory?: boolean;
    }
  ): Promise<ResolvedTeamLeaderDto | null> {
    return this.resolveTeamLeaderSync(teamId, targetDateInput, options);
  }

  /**
   * Resolves the responsible Team Leader for a specific employee on a target date
   * (such as the leave application's start date).
   * Chain: Employee -> Team on targetDate -> Team Leader for targetDate.
   */
  public static resolveTeamLeaderForEmployeeSync(
    employeeId: number | string,
    targetDateInput: string | Date
  ): ResolvedTeamLeaderDto | null {
    const dateStr = parseStrictIsoDate(targetDateInput, 'Target date');
    const emp = UserService.resolveEmployeeRecordSync(employeeId);
    const targetEmpId = emp ? emp.id : Number(employeeId);
    const deptOnDate = UserService.resolveEmployeeDepartmentOnDate(targetEmpId, dateStr);
    const empHierarchy = UserService.getEmployeeRoleAndHierarchySync(targetEmpId);
    const teamId = deptOnDate ?? empHierarchy?.departmentId ?? null;

    return this.resolveTeamLeaderSync(teamId, dateStr, {
      fallbackEmployeeId: targetEmpId,
    });
  }

  /**
   * Async wrapper for resolving the Team Leader for an employee on a target date.
   */
  public static async resolveTeamLeaderForEmployee(
    employeeId: number | string,
    targetDateInput: string | Date
  ): Promise<ResolvedTeamLeaderDto | null> {
    return this.resolveTeamLeaderForEmployeeSync(employeeId, targetDateInput);
  }

  /**
   * Checks whether a given team has any active date-effective assignments or rotation rules.
   */
  public static hasTeamDateEffectiveConfig(teamId: number | string | null | undefined): boolean {
    ensureDefaultRotationRules();
    if (!teamId) return false;
    const dept = UserService.resolveDepartmentRecordSync(teamId);
    const tid = dept ? dept.id : Number(teamId);
    return (
      memoryRotationRules.some((r) => r.teamId === tid && r.isActive && r.status === 'ACTIVE') ||
      memoryAssignments.some((a) => a.teamId === tid && a.isActive && a.status === 'ACTIVE')
    );
  }

  /**
   * Lists date-effective Team Leader assignments with optional filtering.
   */
  public static async getAssignments(filters?: {
    teamId?: number | string;
    teamLeaderEmployeeId?: number | string;
    activeOnly?: boolean;
    targetDate?: string;
  }): Promise<TeamLeaderAssignmentDto[]> {
    let list = memoryAssignments.map((a) => this.enrichAssignment(a));
    if (filters?.teamId !== undefined) {
      const dept = UserService.resolveDepartmentRecordSync(filters.teamId);
      const tid = dept ? dept.id : Number(filters.teamId);
      list = list.filter((a) => a.teamId === tid);
    }
    if (filters?.teamLeaderEmployeeId !== undefined) {
      const emp = UserService.resolveEmployeeRecordSync(filters.teamLeaderEmployeeId);
      const eid = emp ? emp.id : Number(filters.teamLeaderEmployeeId);
      list = list.filter((a) => a.teamLeaderEmployeeId === eid);
    }
    if (filters?.activeOnly) {
      list = list.filter((a) => a.isActive && a.status === 'ACTIVE');
    }
    if (filters?.targetDate) {
      const d = parseStrictIsoDate(filters.targetDate, 'Target date');
      list = list.filter((a) => a.effectiveFrom <= d && d <= a.effectiveTo);
    }
    return list.sort((a, b) => {
      if (a.effectiveFrom !== b.effectiveFrom) {
        return b.effectiveFrom.localeCompare(a.effectiveFrom);
      }
      return b.id - a.id;
    });
  }

  /**
   * Gets a single Team Leader assignment by ID.
   */
  public static async getAssignmentById(id: number): Promise<TeamLeaderAssignmentDto | null> {
    const found = memoryAssignments.find((a) => a.id === Number(id));
    return found ? this.enrichAssignment(found) : null;
  }

  /**
   * Creates a new date-effective Team Leader assignment.
   * Preserves all historical assignments and enforces overlap, duplicate, date-range, and role validations.
   */
  public static async createAssignment(
    input: CreateTeamLeaderAssignmentInput,
    actor: AuthContext
  ): Promise<TeamLeaderAssignmentDto> {
    await this.assertCanManageRotation(actor);

    const dept = UserService.resolveDepartmentRecordSync(
      input.teamId ?? input.teamCode ?? input.departmentCode
    );
    const teamId = dept ? dept.id : Number(input.teamId);
    if (!teamId || Number.isNaN(teamId)) {
      throw new ValidationError('Valid Team / Department ID is required.');
    }
    if (!dept) {
      throw new ValidationError(`Team / Department #${input.teamId} does not exist.`);
    }
    if (!dept.isActive) {
      throw new ValidationError(`Team / Department '${dept.name}' is inactive.`);
    }

    const effectiveFrom = parseStrictIsoDate(input.effectiveFrom, 'Effective From date');
    const effectiveTo = parseStrictIsoDate(input.effectiveTo, 'Effective To date');

    if (effectiveFrom > effectiveTo) {
      throw new ValidationError(
        `Invalid date range: Effective From (${effectiveFrom}) cannot be after Effective To (${effectiveTo}).`
      );
    }

    const validatedLeader = this.validateEligibleTeamLeader(
      {
        employeeId: input.teamLeaderEmployeeId ?? null,
        userId: input.teamLeaderUserId ?? null,
      },
      'Assigned Team Leader'
    );

    const assignmentType: TeamLeaderAssignmentType =
      input.assignmentType === 'OVERRIDE' ||
      input.assignmentType === 'TEMPORARY_REPLACEMENT' ||
      input.assignmentType === 'ROTATION_GENERATED'
        ? input.assignmentType
        : 'STANDARD';

    const isOverrideTier =
      assignmentType === 'OVERRIDE' || assignmentType === 'TEMPORARY_REPLACEMENT';

    // Check for duplicate active assignment
    const exactDuplicate = memoryAssignments.find(
      (a) =>
        a.teamId === teamId &&
        a.isActive &&
        a.status === 'ACTIVE' &&
        a.teamLeaderEmployeeId === validatedLeader.employeeId &&
        a.effectiveFrom === effectiveFrom &&
        a.effectiveTo === effectiveTo &&
        a.assignmentType === assignmentType
    );
    if (exactDuplicate) {
      throw new ValidationError(
        `Duplicate assignment: ${validatedLeader.employeeName} is already assigned to '${dept.name}' for ${effectiveFrom} to ${effectiveTo}.`
      );
    }

    // Check for overlapping active assignments on the same team
    const overlappingActive = memoryAssignments.filter(
      (a) =>
        a.teamId === teamId &&
        a.isActive &&
        a.status === 'ACTIVE' &&
        a.effectiveFrom <= effectiveTo &&
        effectiveFrom <= a.effectiveTo
    );

    for (const existing of overlappingActive) {
      const existingIsOverrideTier =
        existing.assignmentType === 'OVERRIDE' ||
        existing.assignmentType === 'TEMPORARY_REPLACEMENT';

      // Standard assignments cannot overlap with any active standard assignment on the same team
      if (!isOverrideTier && !existingIsOverrideTier) {
        throw new ValidationError(
          `Overlapping effective date range: Team '${dept.name}' already has an active Team Leader (${existing.teamLeaderName}) assigned from ${existing.effectiveFrom} to ${existing.effectiveTo}. Same team cannot have two active Team Leaders for the same date.`
        );
      }

      // Override/replacement assignments cannot overlap with another active override/replacement on the same team
      if (isOverrideTier && existingIsOverrideTier) {
        throw new ValidationError(
          `Overlapping override date range: Team '${dept.name}' already has an active override/replacement Team Leader (${existing.teamLeaderName}) from ${existing.effectiveFrom} to ${existing.effectiveTo}.`
        );
      }

      // Standard assignment cannot be added if an override already covers the exact same leader & dates
      if (
        existing.teamLeaderEmployeeId === validatedLeader.employeeId &&
        existing.effectiveFrom === effectiveFrom &&
        existing.effectiveTo === effectiveTo
      ) {
        throw new ValidationError(
          `Duplicate assignment: ${validatedLeader.employeeName} is already assigned to '${dept.name}' for ${effectiveFrom} to ${effectiveTo}.`
        );
      }
    }

    // Resolve previous Team Leader on effectiveFrom for audit trail
    const previousResolved = this.resolveTeamLeaderSync(teamId, effectiveFrom, {
      allowInactiveForHistory: true,
    });

    const nextId = memoryAssignments.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    const nowIso = new Date().toISOString();

    const created: TeamLeaderAssignmentDto = {
      id: nextId,
      teamId,
      teamName: dept.name,
      teamCode: dept.code,
      teamLeaderUserId: validatedLeader.userId,
      teamLeaderEmployeeId: validatedLeader.employeeId,
      teamLeaderEmployeeCode: validatedLeader.employeeCode,
      teamLeaderName: validatedLeader.employeeName,
      teamLeaderEmail: validatedLeader.email,
      effectiveFrom,
      effectiveTo,
      assignmentType,
      rotationRuleId: input.rotationRuleId ?? null,
      status: 'ACTIVE',
      isActive: true,
      reason: input.reason?.trim() || null,
      remarks: input.remarks?.trim() || null,
      createdBy: actor.userId || null,
      createdByName: actor.username || actor.role,
      createdAt: nowIso,
      updatedBy: actor.userId || null,
      updatedByName: actor.username || actor.role,
      updatedAt: nowIso,
    };

    memoryAssignments.push(created);
    saveRotationStoreToDisk();

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: 'TEAM_LEADER_ASSIGNMENT_CREATED',
      targetEntity: 'team_leader_assignments',
      targetId: String(created.id),
      metadata: {
        assignmentId: created.id,
        teamId: created.teamId,
        teamCode: created.teamCode,
        departmentCode: created.teamCode,
        teamName: created.teamName,
        previousTeamLeaderId: previousResolved?.teamLeaderEmployeeId ?? null,
        previousTeamLeaderEmployeeCode: previousResolved?.teamLeaderEmployeeCode ?? null,
        previousTeamLeaderName: previousResolved?.teamLeaderName ?? null,
        newTeamLeaderId: created.teamLeaderEmployeeId,
        newTeamLeaderEmployeeCode: created.teamLeaderEmployeeCode,
        newTeamLeaderName: created.teamLeaderName,
        effectiveFrom: created.effectiveFrom,
        effectiveTo: created.effectiveTo,
        assignmentType: created.assignmentType,
        reason: created.reason || created.remarks || 'Date-effective Team Leader assignment created',
        timestamp: nowIso,
      },
    });

    try {
      await NotificationService.notifyTeamLeaderAssignment({
        recipientUserId: created.teamLeaderUserId,
        recipientName: created.teamLeaderName,
        recipientEmail: created.teamLeaderEmail || '',
        teamId: created.teamId,
        teamName: created.teamName,
        effectiveFrom: created.effectiveFrom,
        effectiveTo: created.effectiveTo,
        assignmentType: created.assignmentType,
        reason: created.reason || created.remarks || null,
      });
    } catch (err) {
      console.warn('Notification dispatch for Team Leader assignment skipped:', err);
    }

    return this.enrichAssignment(created);
  }

  /**
   * Updates an existing Team Leader assignment while preserving historical audit integrity.
   */
  public static async updateAssignment(
    id: number,
    input: UpdateTeamLeaderAssignmentInput,
    actor: AuthContext
  ): Promise<TeamLeaderAssignmentDto> {
    await this.assertCanManageRotation(actor);

    const idx = memoryAssignments.findIndex((a) => a.id === Number(id));
    if (idx === -1) {
      throw new ValidationError(`Team Leader assignment #${id} not found.`);
    }

    const current = memoryAssignments[idx];
    const dept = UserService.getDepartmentByIdSync(current.teamId);
    const teamName = dept?.name || current.teamName;

    const effectiveFrom =
      input.effectiveFrom !== undefined
        ? parseStrictIsoDate(input.effectiveFrom, 'Effective From date')
        : current.effectiveFrom;
    const effectiveTo =
      input.effectiveTo !== undefined
        ? parseStrictIsoDate(input.effectiveTo, 'Effective To date')
        : current.effectiveTo;

    if (effectiveFrom > effectiveTo) {
      throw new ValidationError(
        `Invalid date range: Effective From (${effectiveFrom}) cannot be after Effective To (${effectiveTo}).`
      );
    }

    let nextLeader = {
      userId: current.teamLeaderUserId,
      employeeId: current.teamLeaderEmployeeId,
      employeeCode: current.teamLeaderEmployeeCode ?? null,
      employeeName: current.teamLeaderName,
      email: current.teamLeaderEmail ?? '',
    };

    const nextIsActive =
      input.isActive !== undefined
        ? Boolean(input.isActive)
        : input.status !== undefined
          ? input.status === 'ACTIVE'
          : current.isActive;

    const nextStatus: TeamLeaderAssignmentStatus =
      input.status !== undefined
        ? input.status
        : nextIsActive
          ? 'ACTIVE'
          : current.status === 'ACTIVE'
            ? 'INACTIVE'
            : current.status;

    if (
      input.teamLeaderEmployeeId !== undefined ||
      input.teamLeaderUserId !== undefined ||
      nextIsActive
    ) {
      const validated = this.validateEligibleTeamLeader(
        {
          employeeId: input.teamLeaderEmployeeId ?? current.teamLeaderEmployeeId,
          userId: input.teamLeaderUserId ?? current.teamLeaderUserId,
        },
        'Assigned Team Leader'
      );
      nextLeader = {
        userId: validated.userId,
        employeeId: validated.employeeId,
        employeeCode: validated.employeeCode,
        employeeName: validated.employeeName,
        email: validated.email,
      };
    }

    const nextType: TeamLeaderAssignmentType =
      input.assignmentType !== undefined ? input.assignmentType : current.assignmentType;
    const isOverrideTier =
      nextType === 'OVERRIDE' || nextType === 'TEMPORARY_REPLACEMENT';

    if (nextIsActive && nextStatus === 'ACTIVE') {
      const overlappingActive = memoryAssignments.filter(
        (a) =>
          a.id !== current.id &&
          a.teamId === current.teamId &&
          a.isActive &&
          a.status === 'ACTIVE' &&
          a.effectiveFrom <= effectiveTo &&
          effectiveFrom <= a.effectiveTo
      );

      for (const existing of overlappingActive) {
        const existingIsOverrideTier =
          existing.assignmentType === 'OVERRIDE' ||
          existing.assignmentType === 'TEMPORARY_REPLACEMENT';

        if (!isOverrideTier && !existingIsOverrideTier) {
          throw new ValidationError(
            `Overlapping effective date range: Team '${teamName}' already has an active Team Leader (${existing.teamLeaderName}) assigned from ${existing.effectiveFrom} to ${existing.effectiveTo}.`
          );
        }
        if (isOverrideTier && existingIsOverrideTier) {
          throw new ValidationError(
            `Overlapping override date range: Team '${teamName}' already has an active override Team Leader (${existing.teamLeaderName}) from ${existing.effectiveFrom} to ${existing.effectiveTo}.`
          );
        }
      }
    }

    const previousLeaderId = current.teamLeaderEmployeeId;
    const previousLeaderName = current.teamLeaderName;
    const nowIso = new Date().toISOString();

    const updated: TeamLeaderAssignmentDto = {
      ...current,
      teamName,
      teamLeaderUserId: nextLeader.userId,
      teamLeaderEmployeeId: nextLeader.employeeId,
      teamLeaderEmployeeCode: nextLeader.employeeCode,
      teamLeaderName: nextLeader.employeeName,
      teamLeaderEmail: nextLeader.email,
      effectiveFrom,
      effectiveTo,
      assignmentType: nextType,
      status: nextStatus,
      isActive: nextIsActive && nextStatus === 'ACTIVE',
      reason: input.reason !== undefined ? input.reason?.trim() || null : current.reason,
      remarks: input.remarks !== undefined ? input.remarks?.trim() || null : current.remarks,
      updatedBy: actor.userId || null,
      updatedByName: actor.username || actor.role,
      updatedAt: nowIso,
    };

    memoryAssignments[idx] = updated;
    saveRotationStoreToDisk();

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: 'TEAM_LEADER_ASSIGNMENT_UPDATED',
      targetEntity: 'team_leader_assignments',
      targetId: String(updated.id),
      metadata: {
        assignmentId: updated.id,
        teamId: updated.teamId,
        teamName: updated.teamName,
        previousTeamLeaderId: previousLeaderId,
        previousTeamLeaderName: previousLeaderName,
        newTeamLeaderId: updated.teamLeaderEmployeeId,
        newTeamLeaderName: updated.teamLeaderName,
        effectiveFrom: updated.effectiveFrom,
        effectiveTo: updated.effectiveTo,
        status: updated.status,
        isActive: updated.isActive,
        reason: updated.reason || updated.remarks || 'Team Leader assignment updated',
        timestamp: nowIso,
      },
    });

    return this.enrichAssignment(updated);
  }

  /**
   * Deactivates an existing Team Leader assignment without deleting historical records.
   */
  public static async deactivateAssignment(
    id: number,
    reason: string | undefined,
    actor: AuthContext
  ): Promise<TeamLeaderAssignmentDto> {
    await this.assertCanManageRotation(actor);

    const idx = memoryAssignments.findIndex((a) => a.id === Number(id));
    if (idx === -1) {
      throw new ValidationError(`Team Leader assignment #${id} not found.`);
    }

    const current = memoryAssignments[idx];
    const nowIso = new Date().toISOString();

    const updated: TeamLeaderAssignmentDto = {
      ...current,
      status: 'INACTIVE',
      isActive: false,
      reason: reason?.trim() || current.reason || 'Assignment deactivated by administrator',
      updatedBy: actor.userId || null,
      updatedByName: actor.username || actor.role,
      updatedAt: nowIso,
    };

    memoryAssignments[idx] = updated;
    saveRotationStoreToDisk();

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: 'TEAM_LEADER_ASSIGNMENT_DEACTIVATED',
      targetEntity: 'team_leader_assignments',
      targetId: String(updated.id),
      metadata: {
        assignmentId: updated.id,
        teamId: updated.teamId,
        teamName: updated.teamName,
        previousTeamLeaderId: current.teamLeaderEmployeeId,
        previousTeamLeaderName: current.teamLeaderName,
        newTeamLeaderId: null,
        newTeamLeaderName: null,
        effectiveFrom: updated.effectiveFrom,
        effectiveTo: updated.effectiveTo,
        status: 'INACTIVE',
        reason: updated.reason,
        timestamp: nowIso,
      },
    });

    return this.enrichAssignment(updated);
  }

  /**
   * Lists reusable 15-day Team Leader rotation rules.
   */
  public static async getRotationRules(filters?: {
    teamId?: number | string;
    activeOnly?: boolean;
  }): Promise<TeamLeaderRotationRuleDto[]> {
    ensureDefaultRotationRules();
    let list = memoryRotationRules.map((r) => this.enrichRotationRule(r));
    if (filters?.teamId !== undefined) {
      const dept = UserService.resolveDepartmentRecordSync(filters.teamId);
      const tid = dept ? dept.id : Number(filters.teamId);
      list = list.filter((r) => r.teamId === tid);
    }
    if (filters?.activeOnly) {
      list = list.filter((r) => r.isActive && r.status === 'ACTIVE');
    }
    return list.sort((a, b) => b.id - a.id);
  }

  /**
   * Creates or configures a reusable 15-day Team Leader rotation rule (Day 1–15 vs Day 16–Month End).
   * Preserves historical rotation rules when a team's rotation is updated for a new effective date.
   */
  public static async configureRotationRule(
    input: CreateTeamLeaderRotationRuleInput & { replaceExistingActive?: boolean },
    actor: AuthContext
  ): Promise<TeamLeaderRotationRuleDto> {
    ensureDefaultRotationRules();
    await this.assertCanManageRotation(actor);

    const dept = UserService.resolveDepartmentRecordSync(
      input.teamId ?? input.teamCode ?? input.departmentCode
    );
    const teamId = dept ? dept.id : Number(input.teamId);
    if (!teamId || Number.isNaN(teamId)) {
      throw new ValidationError('Valid Team / Department ID is required.');
    }
    if (!dept) {
      throw new ValidationError(`Team / Department #${input.teamId} does not exist.`);
    }
    if (!dept.isActive) {
      throw new ValidationError(`Team / Department '${dept.name}' is inactive.`);
    }

    const effectiveFrom = parseStrictIsoDate(
      input.effectiveFrom || new Date().toISOString().slice(0, 10),
      'Effective From date'
    );
    const effectiveTo =
      input.effectiveTo !== undefined && input.effectiveTo !== null && String(input.effectiveTo).trim() !== ''
        ? parseStrictIsoDate(input.effectiveTo, 'Effective To date')
        : null;

    if (effectiveTo && effectiveFrom > effectiveTo) {
      throw new ValidationError(
        `Invalid date range: Effective From (${effectiveFrom}) cannot be after Effective To (${effectiveTo}).`
      );
    }

    const firstHalfLeader = this.validateEligibleTeamLeader(
      {
        employeeId: input.firstHalfLeaderEmployeeId ?? null,
        userId: input.firstHalfLeaderUserId ?? null,
      },
      'First Half (Day 1–15) Team Leader'
    );

    const secondHalfLeader = this.validateEligibleTeamLeader(
      {
        employeeId: input.secondHalfLeaderEmployeeId ?? null,
        userId: input.secondHalfLeaderUserId ?? null,
      },
      'Second Half (Day 16–Month End) Team Leader'
    );

    const rotationType: TeamLeaderRotationType = 'FIRST_HALF_SECOND_HALF';

    // Check for duplicate or overlapping active rotation rules on the same team
    const existingActiveRules = memoryRotationRules.filter(
      (r) => r.teamId === teamId && r.isActive && r.status === 'ACTIVE'
    );

    const nowIso = new Date().toISOString();
    let previousLeadersLabel: string | null = null;

    for (const existing of existingActiveRules) {
      const existingEnd = existing.effectiveTo || '9999-12-31';
      const newEnd = effectiveTo || '9999-12-31';
      const overlaps = existing.effectiveFrom <= newEnd && effectiveFrom <= existingEnd;

      if (!overlaps) continue;

      // Exact duplicate check
      if (
        existing.firstHalfLeaderEmployeeId === firstHalfLeader.employeeId &&
        existing.secondHalfLeaderEmployeeId === secondHalfLeader.employeeId &&
        existing.effectiveFrom === effectiveFrom &&
        existing.effectiveTo === effectiveTo &&
        !input.replaceExistingActive
      ) {
        throw new ValidationError(
          `Duplicate rotation configuration: Team '${dept.name}' already has an identical active 15-day rotation rule (${firstHalfLeader.employeeName} / ${secondHalfLeader.employeeName}).`
        );
      }

      if (input.replaceExistingActive === false) {
        throw new ValidationError(
          `Overlapping rotation rule: Team '${dept.name}' already has an active rotation rule from ${existing.effectiveFrom} to ${existing.effectiveTo || 'ongoing'}.`
        );
      }

      // Preserve history: close or archive the previous active rule instead of deleting it
      previousLeadersLabel = `1–15: ${existing.firstHalfLeaderName}, 16–End: ${existing.secondHalfLeaderName}`;
      if (existing.effectiveFrom < effectiveFrom) {
        existing.effectiveTo = subtractOneDay(effectiveFrom);
        existing.updatedBy = actor.userId || null;
        existing.updatedByName = actor.username || actor.role;
        existing.updatedAt = nowIso;
      } else {
        existing.status = 'INACTIVE';
        existing.isActive = false;
        existing.updatedBy = actor.userId || null;
        existing.updatedByName = actor.username || actor.role;
        existing.updatedAt = nowIso;
      }
    }

    const nextId = memoryRotationRules.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    const created: TeamLeaderRotationRuleDto = {
      id: nextId,
      teamId,
      teamName: dept.name,
      teamCode: dept.code,
      rotationType,
      firstHalfStartDay: 1,
      firstHalfEndDay: 15,
      firstHalfLeaderUserId: firstHalfLeader.userId,
      firstHalfLeaderEmployeeId: firstHalfLeader.employeeId,
      firstHalfLeaderEmployeeCode: firstHalfLeader.employeeCode,
      firstHalfLeaderName: firstHalfLeader.employeeName,
      firstHalfLeaderEmail: firstHalfLeader.email,
      secondHalfStartDay: 16,
      secondHalfLeaderUserId: secondHalfLeader.userId,
      secondHalfLeaderEmployeeId: secondHalfLeader.employeeId,
      secondHalfLeaderEmployeeCode: secondHalfLeader.employeeCode,
      secondHalfLeaderName: secondHalfLeader.employeeName,
      secondHalfLeaderEmail: secondHalfLeader.email,
      effectiveFrom,
      effectiveTo,
      status: 'ACTIVE',
      isActive: true,
      remarks: input.remarks?.trim() || null,
      createdBy: actor.userId || null,
      createdByName: actor.username || actor.role,
      createdAt: nowIso,
      updatedBy: actor.userId || null,
      updatedByName: actor.username || actor.role,
      updatedAt: nowIso,
    };

    memoryRotationRules.push(created);
    saveRotationStoreToDisk();

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: 'TEAM_LEADER_ROTATION_CONFIGURED',
      targetEntity: 'team_leader_rotation_rules',
      targetId: String(created.id),
      metadata: {
        rotationRuleId: created.id,
        teamId: created.teamId,
        teamCode: created.teamCode,
        departmentCode: created.teamCode,
        teamName: created.teamName,
        rotationType: created.rotationType,
        previousTeamLeader: previousLeadersLabel,
        newTeamLeader: `1–15: ${created.firstHalfLeaderName}, 16–End: ${created.secondHalfLeaderName}`,
        firstHalfLeaderId: created.firstHalfLeaderEmployeeId,
        firstHalfLeaderEmployeeCode: created.firstHalfLeaderEmployeeCode,
        firstHalfLeaderName: created.firstHalfLeaderName,
        secondHalfLeaderId: created.secondHalfLeaderEmployeeId,
        secondHalfLeaderEmployeeCode: created.secondHalfLeaderEmployeeCode,
        secondHalfLeaderName: created.secondHalfLeaderName,
        effectiveFrom: created.effectiveFrom,
        effectiveTo: created.effectiveTo,
        reason: created.remarks || '15-day Team Leader rotation rule configured',
        timestamp: nowIso,
      },
    });

    try {
      await NotificationService.notifyTeamLeaderAssignment({
        recipientUserId: firstHalfLeader.userId,
        recipientName: firstHalfLeader.employeeName,
        recipientEmail: firstHalfLeader.email,
        teamId: created.teamId,
        teamName: created.teamName,
        effectiveFrom: created.effectiveFrom,
        effectiveTo: created.effectiveTo || 'Ongoing (Days 1–15 of each month)',
        assignmentType: 'ROTATION_GENERATED',
        reason: `Assigned as First-Half (Day 1–15) Team Leader for ${created.teamName}`,
      });
      if (secondHalfLeader.userId !== firstHalfLeader.userId) {
        await NotificationService.notifyTeamLeaderAssignment({
          recipientUserId: secondHalfLeader.userId,
          recipientName: secondHalfLeader.employeeName,
          recipientEmail: secondHalfLeader.email,
          teamId: created.teamId,
          teamName: created.teamName,
          effectiveFrom: created.effectiveFrom,
          effectiveTo: created.effectiveTo || 'Ongoing (Days 16–Month End of each month)',
          assignmentType: 'ROTATION_GENERATED',
          reason: `Assigned as Second-Half (Day 16–Month End) Team Leader for ${created.teamName}`,
        });
      }
    } catch (err) {
      console.warn('Notification dispatch for rotation rule skipped:', err);
    }

    return this.enrichRotationRule(created);
  }

  /**
   * Updates an existing 15-day rotation rule and records an administrative audit event.
   */
  public static async updateRotationRule(
    id: number,
    input: UpdateTeamLeaderRotationRuleInput,
    actor: AuthContext
  ): Promise<TeamLeaderRotationRuleDto> {
    await this.assertCanManageRotation(actor);

    const idx = memoryRotationRules.findIndex((r) => r.id === Number(id));
    if (idx === -1) {
      throw new ValidationError(`Team Leader rotation rule #${id} not found.`);
    }

    const current = memoryRotationRules[idx];
    const dept = UserService.getDepartmentByIdSync(current.teamId);
    const teamName = dept?.name || current.teamName;

    const effectiveFrom =
      input.effectiveFrom !== undefined
        ? parseStrictIsoDate(input.effectiveFrom, 'Effective From date')
        : current.effectiveFrom;
    const effectiveTo =
      input.effectiveTo !== undefined
        ? input.effectiveTo === null || String(input.effectiveTo).trim() === ''
          ? null
          : parseStrictIsoDate(input.effectiveTo, 'Effective To date')
        : current.effectiveTo;

    if (effectiveTo && effectiveFrom > effectiveTo) {
      throw new ValidationError(
        `Invalid date range: Effective From (${effectiveFrom}) cannot be after Effective To (${effectiveTo}).`
      );
    }

    const firstHalfLeader = this.validateEligibleTeamLeader(
      {
        employeeId: input.firstHalfLeaderEmployeeId ?? current.firstHalfLeaderEmployeeId,
        userId: input.firstHalfLeaderUserId ?? current.firstHalfLeaderUserId,
      },
      'First Half (Day 1–15) Team Leader'
    );

    const secondHalfLeader = this.validateEligibleTeamLeader(
      {
        employeeId: input.secondHalfLeaderEmployeeId ?? current.secondHalfLeaderEmployeeId,
        userId: input.secondHalfLeaderUserId ?? current.secondHalfLeaderUserId,
      },
      'Second Half (Day 16–Month End) Team Leader'
    );

    const nextIsActive =
      input.isActive !== undefined
        ? Boolean(input.isActive)
        : input.status !== undefined
          ? input.status === 'ACTIVE'
          : current.isActive;
    const nextStatus = nextIsActive ? 'ACTIVE' : 'INACTIVE';

    const previousLeaderSummary = `1–15: ${current.firstHalfLeaderName}, 16–End: ${current.secondHalfLeaderName}`;
    const nowIso = new Date().toISOString();

    const updated: TeamLeaderRotationRuleDto = {
      ...current,
      teamName,
      firstHalfLeaderUserId: firstHalfLeader.userId,
      firstHalfLeaderEmployeeId: firstHalfLeader.employeeId,
      firstHalfLeaderEmployeeCode: firstHalfLeader.employeeCode,
      firstHalfLeaderName: firstHalfLeader.employeeName,
      firstHalfLeaderEmail: firstHalfLeader.email,
      secondHalfLeaderUserId: secondHalfLeader.userId,
      secondHalfLeaderEmployeeId: secondHalfLeader.employeeId,
      secondHalfLeaderEmployeeCode: secondHalfLeader.employeeCode,
      secondHalfLeaderName: secondHalfLeader.employeeName,
      secondHalfLeaderEmail: secondHalfLeader.email,
      effectiveFrom,
      effectiveTo,
      status: nextStatus,
      isActive: nextIsActive,
      remarks: input.remarks !== undefined ? input.remarks?.trim() || null : current.remarks,
      updatedBy: actor.userId || null,
      updatedByName: actor.username || actor.role,
      updatedAt: nowIso,
    };

    memoryRotationRules[idx] = updated;
    saveRotationStoreToDisk();

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: 'TEAM_LEADER_ROTATION_UPDATED',
      targetEntity: 'team_leader_rotation_rules',
      targetId: String(updated.id),
      metadata: {
        rotationRuleId: updated.id,
        teamId: updated.teamId,
        teamName: updated.teamName,
        previousTeamLeader: previousLeaderSummary,
        newTeamLeader: `1–15: ${updated.firstHalfLeaderName}, 16–End: ${updated.secondHalfLeaderName}`,
        firstHalfLeaderId: updated.firstHalfLeaderEmployeeId,
        firstHalfLeaderName: updated.firstHalfLeaderName,
        secondHalfLeaderId: updated.secondHalfLeaderEmployeeId,
        secondHalfLeaderName: updated.secondHalfLeaderName,
        effectiveFrom: updated.effectiveFrom,
        effectiveTo: updated.effectiveTo,
        status: updated.status,
        reason: updated.remarks || '15-day Team Leader rotation rule updated',
        timestamp: nowIso,
      },
    });

    return this.enrichRotationRule(updated);
  }

  /**
   * Builds a complete summary for a team showing:
   * - Current Team Leader & period (e.g. ANIL, 01–15 Sep)
   * - Upcoming Team Leader & period (e.g. AKASH, 16–30 Sep)
   * - Active rotation rule
   * - Active and historical assignments
   */
  public static async getTeamRotationSummary(
    teamId: number | string,
    referenceDateInput?: string | Date
  ): Promise<TeamRotationSummaryDto> {
    const refDate = parseStrictIsoDate(
      referenceDateInput || new Date().toISOString().slice(0, 10),
      'Reference date'
    );
    const dept = UserService.resolveDepartmentRecordSync(teamId);
    if (!dept) {
      throw new ValidationError(`Team / Department #${teamId} not found.`);
    }

    const currentTeamLeader = this.resolveTeamLeaderSync(dept.id, refDate);
    const halfPeriod = this.getHalfMonthPeriodForDate(refDate);

    // Determine next transition date to resolve Upcoming Team Leader
    let upcomingDate = halfPeriod.nextPeriodStart;
    if (
      currentTeamLeader &&
      (currentTeamLeader.source === 'OVERRIDE_ASSIGNMENT' ||
        currentTeamLeader.source === 'DATE_ASSIGNMENT') &&
      currentTeamLeader.effectiveTo < halfPeriod.periodEnd
    ) {
      upcomingDate = addOneDay(currentTeamLeader.effectiveTo);
    } else {
      // Check if there is an upcoming explicit assignment starting after refDate and before nextPeriodStart
      const futureAssignments = memoryAssignments
        .filter(
          (a) =>
            a.teamId === dept.id &&
            a.isActive &&
            a.status === 'ACTIVE' &&
            a.effectiveFrom > refDate
        )
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      if (futureAssignments.length > 0 && futureAssignments[0].effectiveFrom < upcomingDate) {
        upcomingDate = futureAssignments[0].effectiveFrom;
      }
    }

    const upcomingTeamLeader = this.resolveTeamLeaderSync(dept.id, upcomingDate);

    const allTeamRules = memoryRotationRules
      .filter((r) => r.teamId === dept.id)
      .map((r) => this.enrichRotationRule(r))
      .sort((a, b) => b.id - a.id);

    const activeRotationRule =
      allTeamRules.find(
        (r) =>
          r.isActive &&
          r.status === 'ACTIVE' &&
          r.effectiveFrom <= refDate &&
          (!r.effectiveTo || refDate <= r.effectiveTo)
      ) ||
      allTeamRules.find((r) => r.isActive && r.status === 'ACTIVE') ||
      null;

    const allTeamAssignments = memoryAssignments
      .filter((a) => a.teamId === dept.id)
      .map((a) => this.enrichAssignment(a))
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id - a.id);

    const activeAssignments = allTeamAssignments.filter(
      (a) => a.isActive && a.status === 'ACTIVE' && a.effectiveTo >= refDate
    );
    const historicalAssignments = allTeamAssignments.filter(
      (a) => !a.isActive || a.status !== 'ACTIVE' || a.effectiveTo < refDate
    );

    return {
      teamId: dept.id,
      teamName: dept.name,
      teamCode: dept.code,
      referenceDate: refDate,
      currentTeamLeader,
      upcomingTeamLeader,
      activeRotationRule,
      activeAssignments,
      historicalAssignments,
    };
  }

  /**
   * Returns rotation and assignment summaries across all departments/teams.
   */
  public static async getAllTeamRotationSummaries(
    referenceDateInput?: string | Date
  ): Promise<TeamRotationSummaryDto[]> {
    ensureDefaultRotationRules();
    const depts = await UserService.getDepartments();
    const summaries: TeamRotationSummaryDto[] = [];
    for (const dept of depts) {
      summaries.push(await this.getTeamRotationSummary(dept.id, referenceDateInput));
    }
    return summaries;
  }
}
