import { eq, and, desc, sql } from 'drizzle-orm';
import {
  assertProductionDbConfigured,
  getDb,
  isDbConfigured,
  isProductionRuntime,
} from '../db/index.ts';
import {
  employees,
  leaveBalances,
  leavePolicies,
  leaveRequestEvents,
  leaveRequests,
  leaveTypes,
} from '../db/schema.ts';
import {
  AuthContext,
  CreateLeaveRequestInput,
  LeaveCalculationPreview,
  LeaveRequestDto,
  LeaveRequestEventDto,
  LeaveTypeDto,
  OperationalRole,
  ReasonCategory,
  RequestClassification,
  ResolvedTeamLeaderDto,
} from '../types/leave.ts';
import { LeaveClassificationService } from './leaveClassificationService.ts';
import { LeaveService } from './leaveService.ts';
import { ValidationError } from './validation.ts';
import { WorkingDaysService } from './workingDaysService.ts';
import { NotificationService } from './notificationService.ts';
import { ShiftService } from './shiftService.ts';
import { UserService } from './userService.ts';
import { AttachmentService } from './attachmentService.ts';
import { TeamLeaderRotationService } from './teamLeaderRotationService.ts';

// In-memory store fallback for standalone / unit testing
let memoryLeaveRequests: LeaveRequestDto[] = [];
let memoryLeaveRequestEvents: LeaveRequestEventDto[] = [];
let nextRequestId = 100;
let nextEventId = 100;

export class LeaveRequestService {
  public static resetMemoryStores(): void {
    memoryLeaveRequests = [];
    memoryLeaveRequestEvents = [];
    nextRequestId = 100;
    nextEventId = 100;
  }

  public static mapRowToDto(
    r: typeof leaveRequests.$inferSelect,
    typeMap?: Map<number, LeaveTypeDto>,
    empMap?: Map<number, any>
  ): LeaveRequestDto {
    const lt = typeMap?.get(r.leaveTypeId);
    const emp = empMap?.get(r.employeeId);
    const hasDoc = Boolean(r.hasAttachment || r.attachmentName || r.attachmentPath);
    return this.withStageLabel({
      id: r.id,
      requestNumber: r.requestNumber,
      employeeId: r.employeeId,
      employeeName: (r as any).employeeName || emp?.employeeName || `Employee ${r.employeeId}`,
      employeeCode: (r as any).employeeCode || emp?.employeeCode || `EMP${r.employeeId}`,
      applicantRole: (r.applicantRole as any) || emp?.roleName || 'EMPLOYEE',
      applicantOperationalRole: (r.applicantOperationalRole as any) || emp?.operationalRole || 'EMPLOYEE',
      leaveTypeId: r.leaveTypeId,
      isPaid: Boolean((r as any).isPaid ?? lt?.isPaid ?? true),
      leaveTypeCode: (r as any).leaveTypeCode || lt?.code,
      leaveTypeName: (r as any).leaveTypeName || lt?.name,
      startDate: r.startDate,
      endDate: r.endDate,
      totalDays: typeof r.totalDays === 'string' ? parseFloat(r.totalDays) : r.totalDays,
      dayType: r.dayType as any,
      halfDayPeriod: (r.halfDayPeriod as any) || null,
      reasonCategory: (r.reasonCategory as any) || null,
      reason: r.reason,
      requestClassification: r.requestClassification as any,
      applicationTimestamp: r.applicationTimestamp
        ? new Date(r.applicationTimestamp).toISOString()
        : new Date().toISOString(),
      status: r.status as any,
      teamLeaderDecision: r.teamLeaderDecision as any,
      teamLeaderDecidedBy: r.teamLeaderDecidedBy,
      teamLeaderDecidedByName: r.teamLeaderDecidedByName,
      teamLeaderDecidedAt: r.teamLeaderDecidedAt ? new Date(r.teamLeaderDecidedAt).toISOString() : null,
      teamLeaderRemarks: r.teamLeaderRemarks,
      hrDecision: r.hrDecision as any,
      hrDecidedBy: r.hrDecidedBy,
      hrDecidedByName: r.hrDecidedByName,
      hrDecidedAt: r.hrDecidedAt ? new Date(r.hrDecidedAt).toISOString() : null,
      hrRemarks: r.hrRemarks,
      managementDecision: r.managementDecision as any,
      managementDecidedBy: r.managementDecidedBy,
      managementDecidedByName: r.managementDecidedByName,
      managementDecidedAt: r.managementDecidedAt ? new Date(r.managementDecidedAt).toISOString() : null,
      managementRemarks: r.managementRemarks,
      finalStatus: r.finalStatus as any,
      approvalStageLabel: r.approvalStageLabel || undefined,
      currentApprovalStage: r.currentApprovalStage,
      reportingManagerId: r.reportingManagerId,
      reportingManagerUserId: r.reportingManagerUserId,
      reportingManagerName: r.reportingManagerName,
      teamId: r.teamId,
      teamName: r.teamName,
      assignedTeamLeaderId: r.assignedTeamLeaderId,
      assignedTeamLeaderUserId: r.assignedTeamLeaderUserId,
      assignedTeamLeaderName: r.assignedTeamLeaderName,
      teamLeaderResolutionSource: r.teamLeaderResolutionSource,
      teamLeaderEffectiveFrom: r.teamLeaderEffectiveFrom,
      teamLeaderEffectiveTo: r.teamLeaderEffectiveTo,
      teamLeaderPeriodLabel: r.teamLeaderPeriodLabel,
      departmentId: r.departmentId || emp?.departmentId || null,
      departmentCode: r.departmentCode || emp?.departmentCode || null,
      departmentName: r.departmentName || emp?.departmentName || null,
      balancePosted: Boolean(r.balancePosted),
      attachmentRequired: Boolean(r.attachmentRequired),
      attachmentPath: r.attachmentPath,
      attachmentName: r.attachmentName,
      attachmentSize: r.attachmentSize,
      attachmentMime: r.attachmentMime,
      hasAttachment: hasDoc,
      attachmentUrl: hasDoc ? `/api/leave-requests/${r.id}/attachment` : null,
      cancellationReason: r.cancellationReason,
      cancellationTimestamp: r.cancellationTimestamp ? new Date(r.cancellationTimestamp).toISOString() : null,
      noticeMinutes: r.noticeMinutes,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
    });
  }

  public static mapEventRowToDto(ev: typeof leaveRequestEvents.$inferSelect): LeaveRequestEventDto {
    return {
      id: ev.id,
      leaveRequestId: ev.leaveRequestId,
      eventType: ev.eventType,
      action: ev.action || ev.eventType,
      previousDecision: ev.previousDecision,
      newDecision: ev.newDecision,
      previousStatus: ev.previousStatus,
      newStatus: ev.newStatus,
      actorId: ev.actorId || ev.actorUserId,
      actorUserId: ev.actorUserId || ev.actorId,
      actorEmployeeCode: ev.actorEmployeeCode,
      actorRole: ev.actorRole,
      actorName: ev.actorName,
      remarks: ev.remarks || ev.comments,
      comments: ev.comments || ev.remarks,
      ipAddress: ev.ipAddress,
      userAgent: ev.userAgent,
      createdAt: ev.createdAt ? new Date(ev.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  public static async syncFromDatabase(): Promise<void> {
    if (!isDbConfigured()) return;
    const db = getDb();
    if (!db) return;

    const rows = await db
      .select()
      .from(leaveRequests)
      .orderBy(desc(leaveRequests.createdAt), desc(leaveRequests.id));

    const types = await LeaveService.getLeaveTypes({ includeInactive: true });
    const typeMap = new Map(types.map((t) => [t.id, t]));
    const allEmps = await UserService.getAllEmployees();
    const empMap = new Map(allEmps.map((e) => [e.id, e]));

    memoryLeaveRequests = rows.map((r) => this.mapRowToDto(r, typeMap, empMap));

    const evRows = await db
      .select()
      .from(leaveRequestEvents)
      .orderBy(desc(leaveRequestEvents.createdAt), desc(leaveRequestEvents.id));

    memoryLeaveRequestEvents = evRows.map((ev) => this.mapEventRowToDto(ev));
  }

  public static addMemoryEvent(event: Omit<LeaveRequestEventDto, 'id'>): void {
    memoryLeaveRequestEvents.push({
      id: nextEventId++,
      ...event,
    });
  }

  public static getEventsForRequestIds(requestIds: number[]): LeaveRequestEventDto[] {
    if (!Array.isArray(requestIds) || requestIds.length === 0) return [];
    const set = new Set(requestIds.map((id) => Number(id)));
    return memoryLeaveRequestEvents
      .filter((ev) => set.has(Number(ev.leaveRequestId)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static resolveApplicantOperationalRole(r: Partial<LeaveRequestDto>): OperationalRole {
    if (r.applicantOperationalRole) {
      return r.applicantOperationalRole;
    }
    if (r.applicantRole && r.applicantRole !== 'SUPER_ADMIN') {
      return r.applicantRole as OperationalRole;
    }
    const tl = r.teamLeaderDecision || 'PENDING';
    const hr = r.hrDecision || 'PENDING';
    if (tl === 'NOT_REQUIRED' && hr === 'NOT_REQUIRED') {
      return (r.applicantRole as string) === 'TOP_MANAGEMENT' ? 'TOP_MANAGEMENT' : 'HR';
    }
    if (tl === 'NOT_REQUIRED' && hr !== 'NOT_REQUIRED') {
      return 'TEAM_LEADER';
    }
    return 'EMPLOYEE';
  }

  public static computeApprovalStageLabel(r: Partial<LeaveRequestDto>): string {
    const finalStatus = r.finalStatus || r.status || 'PENDING';
    const tl = r.teamLeaderDecision || 'PENDING';
    const hr = r.hrDecision || 'PENDING';
    const mgmt = r.managementDecision || 'PENDING';

    if (finalStatus === 'CANCELLED') return 'Cancelled';
    if (finalStatus === 'APPROVED') return 'Approved';
    if (finalStatus === 'REJECTED') {
      if (tl === 'REJECTED') return 'Reporting Person Rejected';
      return 'Rejected';
    }
    if (
      r.applicantOperationalRole === 'TOP_MANAGEMENT' ||
      r.applicantRole === 'TOP_MANAGEMENT' ||
      ((tl === 'NOT_REQUIRED' || tl === 'SKIPPED') && (hr === 'NOT_REQUIRED' || hr === 'SKIPPED'))
    ) {
      return 'Pending Top Management';
    }
    if (tl === 'PENDING') return 'Pending Reporting Person';
    if ((tl === 'APPROVED' || tl === 'NOT_REQUIRED' || tl === 'SKIPPED') && hr === 'PENDING' && mgmt === 'PENDING') {
      return 'Pending HR';
    }
    if (hr === 'APPROVED' && mgmt === 'PENDING') return 'HR Approved → Pending Top Management';
    if (hr === 'REJECTED' && mgmt === 'PENDING') return 'HR Rejected → Sent to Top Management';
    if ((hr === 'NOT_REQUIRED' || hr === 'SKIPPED') && mgmt === 'PENDING') return 'Pending Top Management';
    return 'Pending Approval';
  }

  public static withStageLabel(r: LeaveRequestDto): LeaveRequestDto {
    if (!r.applicantOperationalRole) {
      r.applicantOperationalRole = this.resolveApplicantOperationalRole(r);
    }
    const authEmp = r.employeeId ? UserService.resolveEmployeeRecordSync(r.employeeId) : null;
    if (authEmp) {
      if (authEmp.employeeCode) {
        r.employeeCode = authEmp.employeeCode;
      }
      if (
        authEmp.employeeName &&
        (!r.employeeName || r.employeeName === 'Employee' || r.employeeName.startsWith('Employee '))
      ) {
        r.employeeName = authEmp.employeeName;
      }
      const deptId = r.departmentId ?? authEmp.departmentId ?? r.teamId ?? null;
      if (deptId) {
        r.departmentId = deptId;
        const dept = UserService.getDepartmentByIdSync(deptId);
        if (dept) {
          r.departmentCode = dept.code;
          r.departmentName = r.departmentName || dept.name;
        }
      }
    } else if (r.departmentId || r.teamId) {
      const dept = UserService.getDepartmentByIdSync(r.departmentId ?? r.teamId);
      if (dept) {
        r.departmentId = r.departmentId ?? dept.id;
        r.departmentCode = r.departmentCode || dept.code;
        r.departmentName = r.departmentName || dept.name;
      }
    }
    r.approvalStageLabel = this.computeApprovalStageLabel(r);
    const hasDoc = Boolean(r.attachmentName || r.attachmentPath);
    r.hasAttachment = hasDoc;
    r.attachmentUrl = hasDoc ? `/api/leave-requests/${r.id}/attachment` : null;
    if (hasDoc && !r.attachmentMime) {
      r.attachmentMime = AttachmentService.inferMimeType(
        r.attachmentName || r.attachmentPath,
        r.attachmentMime
      );
    }
    return r;
  }

  /**
   * Retrieves all leave requests across the organization (for approvers / admin views)
   */
  public static async getAllLeaveRequests(): Promise<LeaveRequestDto[]> {
    if (isProductionRuntime()) {
      assertProductionDbConfigured();
    }
    if (isDbConfigured()) {
      const db = getDb();
      if (!db) {
        throw new Error('Database connection is not available while database is configured');
      }
      const rows = await db
        .select()
        .from(leaveRequests)
        .orderBy(desc(leaveRequests.createdAt), desc(leaveRequests.id));

      const types = await LeaveService.getLeaveTypes({ includeInactive: true });
      const typeMap = new Map(types.map((t) => [t.id, t]));
      const allEmps = await UserService.getAllEmployees();
      const empMap = new Map(allEmps.map((e) => [e.id, e]));

      return rows.map((r) => this.mapRowToDto(r, typeMap, empMap));
    }

    return [...memoryLeaveRequests]
      .map((r) => this.withStageLabel(r))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Top Management Leave Overview (for HR & Super Admin visibility)
   * Read-only overview of leave requests for Top Management personnel.
   */
  public static async getTopManagementLeaveOverview(
    actor: AuthContext
  ): Promise<LeaveRequestDto[]> {
    if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'HR') {
      throw new Error('Forbidden: Access denied. Only HR and Super Admin can view the Top Management leave overview.');
    }
    const all = await this.getAllLeaveRequests();
    return all.filter((r) => {
      const isTop =
        r.applicantOperationalRole === 'TOP_MANAGEMENT' ||
        r.applicantRole === 'TOP_MANAGEMENT';
      return isTop;
    });
  }

  public static async getAllRequests(): Promise<LeaveRequestDto[]> {
    return this.getAllLeaveRequests();
  }

  /**
   * Generates a safe, readable, unique request number: MTL-YYYY-000001
   */
  public static async generateRequestNumber(year: number): Promise<string> {
    const prefix = `MTL-${year}-`;
    let highest = 0;

    if (isProductionRuntime()) {
      assertProductionDbConfigured();
    }
    if (isDbConfigured()) {
      const db = getDb();
      if (!db) {
        throw new Error('Database connection is not available while database is configured');
      }
      const latest = await db
        .select({ requestNumber: leaveRequests.requestNumber })
        .from(leaveRequests)
        .where(sql`${leaveRequests.requestNumber} LIKE ${prefix + '%'}`)
        .orderBy(desc(leaveRequests.id))
        .limit(1);

      if (latest.length > 0) {
        const lastNumStr = latest[0].requestNumber.replace(prefix, '');
        const lastNum = parseInt(lastNumStr, 10);
        if (!isNaN(lastNum)) {
          highest = Math.max(highest, lastNum);
        }
      }
    }

    const matchingMem = memoryLeaveRequests
      .filter((r) => r.requestNumber?.startsWith(prefix))
      .map((r) => {
        const numStr = r.requestNumber.replace(prefix, '');
        const n = parseInt(numStr, 10);
        return isNaN(n) ? 0 : n;
      });

    if (matchingMem.length > 0) {
      highest = Math.max(highest, ...matchingMem);
    }

    return `${prefix}${String(highest + 1).padStart(6, '0')}`;
  }

  /**
   * Determines whether a leave request is an Emergency leave request
   */
  public static isEmergencyLeaveRequest(
    input: {
      leaveTypeId?: number;
      reasonCategory?: string | null;
      emergencyException?: boolean;
      isEmergency?: boolean;
    },
    leaveType?: { id?: number; code?: string; name?: string } | null
  ): boolean {
    if (input.isEmergency === false) {
      return false;
    }
    if (input.isEmergency === true || input.emergencyException === true) {
      return true;
    }
    if (
      leaveType?.code?.toUpperCase() === 'EMERGENCY' ||
      (leaveType?.name && leaveType.name.toLowerCase().includes('emergency'))
    ) {
      return true;
    }
    if (
      input.reasonCategory &&
      [
        'MEDICAL_EMERGENCY',
        'FAMILY_EMERGENCY',
        'ACCIDENT_OR_TRAVEL_EMERGENCY',
        'BEREAVEMENT',
        'PERSONAL_URGENT',
      ].includes(input.reasonCategory)
    ) {
      return true;
    }
    return false;
  }

  /**
   * Checks whether the given leave type is an Emergency Leave type (code 'EL', 'EMERGENCY', or name contains 'emergency').
   */
  public static isEmergencyLeaveType(
    leaveType?: { id?: number; code?: string; name?: string } | null
  ): boolean {
    if (!leaveType) return false;
    const code = (leaveType.code || '').trim().toUpperCase();
    const name = (leaveType.name || '').trim().toLowerCase();
    return code === 'EL' || code === 'EMERGENCY' || name.includes('emergency');
  }

  /**
   * Determines if the Emergency Exception advance notice & zero-balance waiver is applicable.
   * Only applies when:
   * 1. The selected leave type is specifically Emergency Leave (not CL, SL, AL, etc.).
   * 2. The employee explicitly ticked the advance notice waiver under Emergency Exception clause checkbox.
   * 3. The applicable policy permits the emergency exception.
   */
  public static isEmergencyWaiverApplicable(
    input: { emergencyException?: boolean },
    leaveType?: { id?: number; code?: string; name?: string } | null,
    policy?: { emergencyExceptionAllowed?: boolean } | null
  ): boolean {
    const isWaiverTicked = Boolean(input.emergencyException);
    const isEl = this.isEmergencyLeaveType(leaveType);
    const policyAllows = Boolean(policy?.emergencyExceptionAllowed);
    return isEl && isWaiverTicked && policyAllows;
  }

  /**
   * Evaluates preview calculation without persisting (used by UI for instant feedback)
   */
  public static async calculatePreview(
    input: {
      employeeId?: number | string;
      employeeCode?: string;
      leaveTypeId: number;
      startDate: string;
      endDate: string;
      dayType: 'FULL_DAY' | 'HALF_DAY';
      halfDayPeriod?: 'FIRST_HALF' | 'SECOND_HALF' | null;
      reasonCategory?: ReasonCategory | null;
      emergencyException?: boolean;
      isEmergency?: boolean;
      applicationTimestamp?: Date | string;
      applicationTimestampOverride?: Date | string;
    },
    actor: AuthContext
  ): Promise<LeaveCalculationPreview> {
    const rawEmpRef =
      input.employeeId ??
      input.employeeCode ??
      actor.employeeId ??
      actor.employeeCode ??
      (actor.userId ? UserService.getMemoryUserRecordById(actor.userId)?.employeeId : undefined) ??
      (actor.username ? UserService.getMemoryUserRecordByUsername(actor.username)?.employeeId : undefined);
    const resolvedEmpRec = rawEmpRef ? UserService.resolveEmployeeRecordSync(rawEmpRef) : null;
    const employeeId =
      resolvedEmpRec?.employeeId ??
      (rawEmpRef && !isNaN(Number(rawEmpRef)) ? Number(rawEmpRef) : undefined) ??
      actor.employeeId ??
      101;
    const appTimestamp =
      input.applicationTimestampOverride || input.applicationTimestamp || new Date();

    const leaveType = await LeaveService.getLeaveTypeById(input.leaveTypeId);
    const policies = await LeaveService.getLeavePolicies({ leaveTypeId: input.leaveTypeId });
    const policy = policies.find((p) => p.isActive) || policies[0];

    const validationErrors: string[] = [];
    const warnings: string[] = [];

    if (!leaveType) {
      validationErrors.push('Selected leave type does not exist');
    } else if (!leaveType.isActive) {
      validationErrors.push(`Leave type '${leaveType.name}' is inactive`);
    }

    if (!policy) {
      validationErrors.push('No active policy found for selected leave type');
    }

    const isEmergency = this.isEmergencyLeaveRequest(input, leaveType);

    // Half day check
    if (input.dayType === 'HALF_DAY') {
      if (leaveType && !leaveType.supportsHalfDay) {
        validationErrors.push(`Leave type '${leaveType.name}' does not support half-day`);
      }
      if (policy && !policy.halfDayAllowed) {
        validationErrors.push(`Policy '${policy.policyName}' does not permit half-day leave`);
      }
      if (input.startDate !== input.endDate) {
        validationErrors.push('Half-day leave must be applied for a single date');
      }
    }

    // Working days calculation
    let workingDaysResult = {
      totalDays: 0,
      workingDays: [] as string[],
      weeklyOffDays: [] as string[],
      holidayDays: [] as Array<{ date: string; name: string }>,
      isStartDayWorking: false,
    };

    try {
      workingDaysResult = await WorkingDaysService.calculateWorkingDays(
        input.startDate,
        input.endDate,
        input.dayType,
        { employeeId }
      );
      if (workingDaysResult.totalDays === 0) {
        warnings.push('Selected date range contains no working days (all dates are holidays or weekly offs)');
      }
    } catch (e: any) {
      validationErrors.push(e.message);
    }

    // Classification & Notice
    let classificationResult = {
      classification: 'NORMAL_LEAVE_REQUEST' as RequestClassification,
      noticeMinutes: 0,
      noticeDays: 0,
      isSameDay: false,
      isLate: false,
      isPostStart: false,
      isBeforeNormalFullDayCutoff: true,
      isBeforeShiftStart: true,
      normalFullDayCutoffDateStr: (() => {
        const [year, month, day] = input.startDate.split('-').map(Number);
        const previousDay = new Date(Date.UTC(year, month - 1, day - 1));
        return `${previousDay.getUTCFullYear()}-${String(previousDay.getUTCMonth() + 1).padStart(2, '0')}-${String(previousDay.getUTCDate()).padStart(2, '0')}`;
      })(),
      normalFullDayCutoffTimeUsed: '19:00',
      applicationDateStr: input.startDate,
      applicationTimeStr: '00:00',
      shiftStartTimeUsed: '08:30',
      shiftCutoffTimeUsed: '07:00',
    };

    try {
      const res = await LeaveClassificationService.classifyLeaveRequest(
        appTimestamp,
        input.startDate,
        undefined,
        {
          employeeId,
          dayType: input.dayType,
          isEmergency,
        }
      );
      classificationResult = {
        ...classificationResult,
        ...res,
      };
    } catch (e: any) {
      validationErrors.push(e.message);
    }

    // Notice & Authoritative Cutoff Rule Checks
    if (policy) {
      if (classificationResult.isSameDay && !policy.sameDayAllowed) {
        validationErrors.push(`Same-day leave is not allowed for policy '${policy.policyName}'`);
      }

      if (input.dayType === 'FULL_DAY') {
        if (!isEmergency) {
          if (!classificationResult.isBeforeNormalFullDayCutoff) {
            validationErrors.push(
              `Normal Full Day leave for ${input.startDate} must be submitted before ${classificationResult.normalFullDayCutoffDateStr} ${classificationResult.normalFullDayCutoffTimeUsed} (current submission time: ${classificationResult.applicationDateStr} ${classificationResult.applicationTimeStr}).`
            );
          }
        } else {
          const emergencyWaiver = this.isEmergencyWaiverApplicable(input, leaveType, policy);
          if (!classificationResult.isBeforeShiftStart && !emergencyWaiver) {

            validationErrors.push(
              `Emergency Full Day leave for ${input.startDate} is not allowed at or after your applicable office/shift start time (${classificationResult.shiftStartTimeUsed || '08:30'}). Only Emergency Half Day leave is allowed.`
            );
          }
        }
      } else if (input.dayType === 'HALF_DAY') {
        if (classificationResult.noticeDays < 0) {
          validationErrors.push(`Half Day leave cannot be submitted for a past date (${input.startDate}).`);
        } else if (!isEmergency && classificationResult.isSameDay && (classificationResult.isLate || classificationResult.isPostStart)) {
          validationErrors.push(
            `Normal Half Day leave for ${input.startDate} must be submitted on or before the cutoff time (${classificationResult.shiftCutoffTimeUsed || '07:00'}). After cutoff, please apply as Emergency Half Day leave.`
          );
        }
      }

      if (classificationResult.noticeDays > 0 && classificationResult.noticeDays < policy.minimumNoticeDays) {
        if (!policy.emergencyExceptionAllowed || !isEmergency) {
          warnings.push(
            `Minimum notice of ${policy.minimumNoticeDays} day(s) required. You have given ${classificationResult.noticeDays} day(s) notice.`
          );
        }
      }

      if (classificationResult.isLate && !policy.lateRequestAllowed && !policy.emergencyExceptionAllowed) {
        validationErrors.push(`Late leave requests are not permitted under policy '${policy.policyName}'`);
      }

      if (classificationResult.isPostStart && !policy.postStartRequestAllowed && !policy.emergencyExceptionAllowed) {
        validationErrors.push(`Post-start leave requests are not permitted under policy '${policy.policyName}'`);
      }
    }

    // Available Balance Check
    const startYear = parseInt(input.startDate.split('-')[0], 10) || new Date().getFullYear();
    await LeaveService.initializeEmployeeBalances(employeeId, startYear, actor);
    const balances = await LeaveService.getLeaveBalances({ employeeId, year: startYear }, actor);
    const balance = balances.find((b) => b.leaveTypeId === input.leaveTypeId);
    const available = balance ? Number(balance.available) : 0;
    const remaining = available - workingDaysResult.totalDays;

    const emergencyWaiver = this.isEmergencyWaiverApplicable(input, leaveType, policy);

    const requiresDoc = Boolean(leaveType?.requiresDocument || policy?.documentRequired);

    let applicableShiftSummary: string = `Standard Office Hours (${classificationResult.shiftStartTimeUsed || '08:30'} - 17:30)`;
    try {
      const schedule = await ShiftService.resolveEmployeeSchedule(employeeId, input.startDate);
      if (schedule.isWeeklyOff) {
        applicableShiftSummary = `Weekly Off (${schedule.scheduleSource || 'Scheduled'})`;
      } else if (schedule.shiftCode) {
        const timing =
          schedule.earliestStartTime && schedule.latestEndTime
            ? `${schedule.earliestStartTime} - ${schedule.latestEndTime}`
            : 'Scheduled';
        applicableShiftSummary = `${schedule.shiftCode} - ${schedule.shiftName || 'Shift'} (${timing})`;
      }
    } catch {}

    // Overlap & approval routing validation check in preview
    const previewWorkflow = await this.resolveApplicantWorkflow(
      employeeId,
      actor,
      input.startDate,
      actor.role === 'SUPER_ADMIN' && Boolean((input as any).submittedOnBehalfOf)
    );
    if (previewWorkflow.validationError) {
      validationErrors.push(previewWorkflow.validationError);
    }

    const existingRequests = await this.getEmployeeRequests(employeeId);
    if (String(leaveType?.code || '').trim().toUpperCase() === 'CL') {
      const pendingClDays = existingRequests.reduce((sum, request) => {
        if (Number(request.leaveTypeId) !== Number(input.leaveTypeId)) return sum;
        const requestStatus = String(request.status || '').toUpperCase();
        const finalStatus = String(request.finalStatus || '').toUpperCase();
        if (
          ['CANCELLED', 'REJECTED', 'APPROVED'].includes(requestStatus) ||
          ['CANCELLED', 'REJECTED', 'APPROVED'].includes(finalStatus)
        ) return sum;
        return sum + (Number(request.totalDays) || 0);
      }, 0);
      const remainingCl = Math.max(0, available - pendingClDays);
      if (workingDaysResult.totalDays > remainingCl + 0.0001) {
        validationErrors.push(
          `Requested CL (${workingDaysResult.totalDays} days) exceeds your remaining CL balance of ${remainingCl.toFixed(2)} days.`
        );
      }
    }
    for (const ex of existingRequests) {
      const isTerminalInactive =
        ex.status === 'CANCELLED' ||
        ex.finalStatus === 'CANCELLED' ||
        ex.status === 'REJECTED' ||
        ex.finalStatus === 'REJECTED';

      if (!isTerminalInactive) {
        if (input.startDate <= ex.endDate && input.endDate >= ex.startDate) {
          const isBothHalfDaySameDate =
            input.dayType === 'HALF_DAY' &&
            ex.dayType === 'HALF_DAY' &&
            input.startDate === ex.startDate &&
            input.endDate === ex.endDate;

          const isDistinctHalfDay =
            isBothHalfDaySameDate &&
            Boolean(input.halfDayPeriod) &&
            Boolean(ex.halfDayPeriod) &&
            input.halfDayPeriod !== ex.halfDayPeriod;

          if (!isDistinctHalfDay) {
            validationErrors.push(
              `Dates overlap with existing active request ${ex.requestNumber} (${ex.startDate} to ${ex.endDate}) [${ex.finalStatus || ex.status}]`
            );
          }
        }
      }
    }

    let resolvedLeaderPreview: ResolvedTeamLeaderDto | null = null;
    try {
      resolvedLeaderPreview = TeamLeaderRotationService.resolveTeamLeaderForEmployeeSync(
        employeeId,
        input.startDate
      );
    } catch {}

    return {
      leaveTypeId: input.leaveTypeId,
      leaveTypeCode: leaveType?.code,
      leaveTypeName: leaveType?.name,
      startDate: input.startDate,
      endDate: input.endDate,
      dayType: input.dayType,
      halfDayPeriod: input.halfDayPeriod,
      totalWorkingDays: workingDaysResult.totalDays,
      workingDays: workingDaysResult.workingDays,
      weeklyOffDays: workingDaysResult.weeklyOffDays,
      holidayDays: workingDaysResult.holidayDays,
      currentAvailableBalance: available,
      balanceAfterApproval: remaining,
      classification: classificationResult.classification,
      noticeMinutes: classificationResult.noticeMinutes,
      noticeDays: classificationResult.noticeDays,
      isLate: classificationResult.isLate,
      isPostStart: classificationResult.isPostStart,
      isSameDay: classificationResult.isSameDay,
      isEmergency,
      isBeforeNormalFullDayCutoff: classificationResult.isBeforeNormalFullDayCutoff,
      isBeforeShiftStart: classificationResult.isBeforeShiftStart,
      normalFullDayCutoffDateStr: classificationResult.normalFullDayCutoffDateStr,
      normalFullDayCutoffTimeUsed: classificationResult.normalFullDayCutoffTimeUsed,
      shiftStartTimeUsed: classificationResult.shiftStartTimeUsed,
      shiftCutoffTimeUsed: classificationResult.shiftCutoffTimeUsed,
      requiresDocument: requiresDoc,
      documentProvided: false,
      applicableShiftSummary,
      resolvedTeamLeaderId: resolvedLeaderPreview?.teamLeaderEmployeeId ?? null,
      resolvedTeamLeaderName: resolvedLeaderPreview?.teamLeaderName ?? null,
      resolvedTeamLeaderSource: resolvedLeaderPreview?.source ?? null,
      resolvedTeamName: resolvedLeaderPreview?.teamName ?? null,
      resolvedTeamLeaderPeriodLabel: resolvedLeaderPreview?.periodLabel ?? null,
      isValid: validationErrors.length === 0,
      validationErrors,
      warnings,
    };
  }

  /**
   * Resolves applicant operational role and validates required approvers in the reporting hierarchy.
   * For EMPLOYEE leave applications, resolves the responsible Team Leader using the authoritative
   * date-effective Team Leader resolver on `leaveStartDate`.
   */
  public static async resolveApplicantWorkflow(
    employeeId: number,
    actor: AuthContext,
    leaveStartDate?: string,
    submittedOnBehalfOf = false
  ): Promise<{
    operationalRole: OperationalRole;
    empHierarchy: Awaited<ReturnType<typeof UserService.getEmployeeRoleAndHierarchy>>;
    resolvedTeamLeader: ResolvedTeamLeaderDto | null;
    initialTlDecision: 'PENDING' | 'NOT_REQUIRED';
    initialHrDecision: 'PENDING' | 'NOT_REQUIRED';
    initialStageLabel: string;
    validationError: string | null;
    validationFields?: Record<string, string>;
  }> {
    const empHierarchy = await UserService.getEmployeeRoleAndHierarchy(employeeId);

    const actingOnBehalf = actor?.role === 'SUPER_ADMIN' && submittedOnBehalfOf;
    const isSuperAdmin = !actingOnBehalf && (actor?.role === 'SUPER_ADMIN' || empHierarchy.role === 'SUPER_ADMIN');

    // Determine operational role based on operational designation/hierarchy, NOT SUPER_ADMIN permission alone
    let operationalRole: OperationalRole | null = null;
    if (actor?.operationalRole && !actingOnBehalf) {
      operationalRole = actor.operationalRole;
    } else if (empHierarchy.employeeExists) {
      if ((actor?.role !== 'SUPER_ADMIN' || actingOnBehalf) && empHierarchy.role !== 'SUPER_ADMIN') {
        operationalRole = empHierarchy.operationalRole || (empHierarchy.role as OperationalRole);
      } else {
        operationalRole = empHierarchy.operationalRole;
      }
    } else {
      if (actor?.role === 'SUPER_ADMIN') {
        operationalRole = null;
      } else {
        operationalRole = (actor?.role as OperationalRole) || 'EMPLOYEE';
      }
    }

    if (!operationalRole) {
      if (isSuperAdmin) {
        // Super Admin applicant with no operational role: Can apply without reporting person
        const hasReportingManager = Boolean(
          empHierarchy.reportingManagerId && empHierarchy.reportingManagerIsActive
        );
        return {
          operationalRole: 'TOP_MANAGEMENT',
          empHierarchy,
          resolvedTeamLeader: null,
          initialTlDecision: 'NOT_REQUIRED',
          initialHrDecision: 'NOT_REQUIRED',
          initialStageLabel: hasReportingManager ? 'Pending Top Management' : 'Approved',
          validationError: null,
        };
      }
      return {
        operationalRole: 'EMPLOYEE',
        empHierarchy,
        resolvedTeamLeader: null,
        initialTlDecision: 'PENDING',
        initialHrDecision: 'PENDING',
        initialStageLabel: 'Pending Reporting Person',
        validationError:
          'Leave approval routing cannot be determined: Super Admin applicant must have a configured operational role/designation and reporting hierarchy before submitting leave.',
        validationFields: {
          operationalRole:
            'Operational role and reporting hierarchy are required to route Super Admin leave requests.',
        },
      };
    }

    const applicantUserId = actingOnBehalf ? empHierarchy.userId : (actor?.userId || empHierarchy.userId);

    if (operationalRole === 'TOP_MANAGEMENT') {
      if (!empHierarchy.reportingManagerId && !isSuperAdmin) {
        return {
          operationalRole,
          empHierarchy,
          resolvedTeamLeader: null,
          initialTlDecision: 'NOT_REQUIRED',
          initialHrDecision: 'NOT_REQUIRED',
          initialStageLabel: 'Pending Top Management',
          validationError:
            'Top Management leave requests require a configured Reporting Person. Please configure a Reporting Manager before submitting.',
          validationFields: {
            reportingManagerId:
              'A configured Reporting Person is required for Top Management leave routing.',
          },
        };
      }
      if (empHierarchy.reportingManagerId && Number(empHierarchy.reportingManagerId) === Number(employeeId) && !isSuperAdmin) {
        return {
          operationalRole,
          empHierarchy,
          resolvedTeamLeader: null,
          initialTlDecision: 'NOT_REQUIRED',
          initialHrDecision: 'NOT_REQUIRED',
          initialStageLabel: 'Pending Top Management',
          validationError:
            'Invalid reporting hierarchy: Top Management applicant cannot be configured as their own Reporting Person.',
          validationFields: {
            reportingManagerId: 'Self-approval is not permitted.',
          },
        };
      }
      if (empHierarchy.reportingManagerId && !empHierarchy.reportingManagerIsActive && !isSuperAdmin) {
        return {
          operationalRole,
          empHierarchy,
          resolvedTeamLeader: null,
          initialTlDecision: 'NOT_REQUIRED',
          initialHrDecision: 'NOT_REQUIRED',
          initialStageLabel: 'Pending Top Management',
          validationError:
            'Top Management leave request cannot be submitted: The configured Reporting Person does not exist or is inactive.',
          validationFields: {
            reportingManagerId: 'Configured Reporting Person must be an active user.',
          },
        };
      }

      return {
        operationalRole,
        empHierarchy,
        resolvedTeamLeader: null,
        initialTlDecision: 'NOT_REQUIRED',
        initialHrDecision: 'NOT_REQUIRED',
        initialStageLabel: empHierarchy.reportingManagerId ? 'Pending Top Management' : 'Approved',
        validationError: null,
      };
    }

    if (operationalRole === 'HR') {
      if (!empHierarchy.reportingManagerId || !empHierarchy.reportingManagerIsActive) {
        return {
          operationalRole,
          empHierarchy,
          resolvedTeamLeader: null,
          initialTlDecision: 'PENDING',
          initialHrDecision: 'NOT_REQUIRED',
          initialStageLabel: 'Pending Reporting Person',
          validationError: 'Leave request cannot be submitted: An active Reporting Person must be assigned to this employee.',
          validationFields: { reportingManagerId: 'Assign an active Reporting Person in the employee profile.' },
        };
      }
      if (
        empHierarchy.employeeExists &&
        empHierarchy.reportingManagerId &&
        !empHierarchy.reportingManagerIsActive
      ) {
        return {
          operationalRole,
          empHierarchy,
          resolvedTeamLeader: null,
          initialTlDecision: 'PENDING',
          initialHrDecision: 'NOT_REQUIRED',
          initialStageLabel: 'Pending Reporting Person',
          validationError:
            'Leave request cannot be submitted: The configured Reporting Manager does not exist or is inactive.',
          validationFields: {
            reportingManagerId: 'Configured Reporting Manager must be an active user.',
          },
        };
      }
      if (!UserService.hasActiveApproverForRole('TOP_MANAGEMENT', employeeId, applicantUserId)) {
        return {
          operationalRole,
          empHierarchy,
          resolvedTeamLeader: null,
          initialTlDecision: 'PENDING',
          initialHrDecision: 'NOT_REQUIRED',
          initialStageLabel: 'Pending Reporting Person',
          validationError:
            'Leave request cannot be submitted: No active Top Management approver is configured to approve HR leave requests.',
          validationFields: {
            managementApprover: 'An active Top Management approver is required for HR leave routing.',
          },
        };
      }

      return {
        operationalRole,
        empHierarchy,
        resolvedTeamLeader: null,
        initialTlDecision: 'PENDING',
        initialHrDecision: 'NOT_REQUIRED',
        initialStageLabel: 'Pending Reporting Person',
        validationError: null,
      };
    }

    if (operationalRole === 'TEAM_LEADER') {
      if (!empHierarchy.reportingManagerId || !empHierarchy.reportingManagerIsActive) {
        return {
          operationalRole,
          empHierarchy,
          resolvedTeamLeader: null,
          initialTlDecision: 'PENDING',
          initialHrDecision: UserService.isHrApprovalRequired(employeeId) ? 'PENDING' : 'NOT_REQUIRED',
          initialStageLabel: 'Pending Reporting Person',
          validationError: 'Leave request cannot be submitted: An active Reporting Person must be assigned to this employee.',
          validationFields: { reportingManagerId: 'Assign an active Reporting Person in the employee profile.' },
        };
      }
      const isHrReq = UserService.isHrApprovalRequired(employeeId);
      const tlHrDecision: 'PENDING' | 'NOT_REQUIRED' = isHrReq ? 'PENDING' : 'NOT_REQUIRED';
      const tlStageLabel = isHrReq ? 'Pending HR' : 'Pending Top Management';

      if (
        empHierarchy.employeeExists &&
        empHierarchy.reportingManagerId &&
        !empHierarchy.reportingManagerIsActive
      ) {
        return {
          operationalRole,
          empHierarchy,
          resolvedTeamLeader: null,
          initialTlDecision: 'PENDING',
          initialHrDecision: tlHrDecision,
          initialStageLabel: 'Pending Reporting Person',
          validationError:
            'Leave request cannot be submitted: The configured Reporting Manager does not exist or is inactive.',
          validationFields: {
            reportingManagerId: 'Configured Reporting Manager must be an active user.',
          },
        };
      }
      if (isHrReq && !UserService.hasActiveApproverForRole('HR', employeeId, applicantUserId)) {
        return {
          operationalRole,
          empHierarchy,
          resolvedTeamLeader: null,
          initialTlDecision: 'PENDING',
          initialHrDecision: 'PENDING',
          initialStageLabel: 'Pending Reporting Person',
          validationError:
            'Leave request cannot be submitted: No active HR approver is configured to review Team Leader leave requests.',
          validationFields: {
            hrApprover: 'An active HR approver is required for Team Leader leave routing.',
          },
        };
      }
      if (!UserService.hasActiveApproverForRole('TOP_MANAGEMENT', employeeId, applicantUserId)) {
        return {
          operationalRole,
          empHierarchy,
          resolvedTeamLeader: null,
          initialTlDecision: 'PENDING',
          initialHrDecision: tlHrDecision,
          initialStageLabel: 'Pending Reporting Person',
          validationError:
            'Leave request cannot be submitted: No active Top Management approver is configured for final approval.',
          validationFields: {
            managementApprover: 'An active Top Management approver is required.',
          },
        };
      }
      return {
        operationalRole,
        empHierarchy,
        resolvedTeamLeader: null,
        initialTlDecision: 'PENDING',
        initialHrDecision: tlHrDecision,
        initialStageLabel: 'Pending Reporting Person',
        validationError: null,
      };
    }

    // Default: operationalRole === 'EMPLOYEE'. Stage 1 always follows the employee profile's
    // Reporting Person assignment; team-rotation schedules do not override this relationship.
    const resolvedTeamLeader: ResolvedTeamLeaderDto | null = null;
    if (!empHierarchy.reportingManagerId && !isSuperAdmin) {
      return {
        operationalRole: 'EMPLOYEE',
        empHierarchy,
        resolvedTeamLeader,
        initialTlDecision: 'PENDING',
        initialHrDecision: 'PENDING',
        initialStageLabel: 'Pending Reporting Person',
        validationError: 'Leave request cannot be submitted: No Reporting Person is configured for this employee.',
        validationFields: { reportingManagerId: 'Assign a Reporting Person in the employee profile.' },
      };
    }
    if (Number(empHierarchy.reportingManagerId) === Number(employeeId) && empHierarchy.reportingManagerId) {
      return {
        operationalRole: 'EMPLOYEE',
        empHierarchy,
        resolvedTeamLeader,
        initialTlDecision: 'PENDING',
        initialHrDecision: 'PENDING',
        initialStageLabel: 'Pending Reporting Person',
        validationError: 'Invalid reporting hierarchy: An employee cannot be their own Reporting Person.',
        validationFields: { reportingManagerId: 'Self-approval is not permitted.' },
      };
    }
    if (empHierarchy.reportingManagerId && !empHierarchy.reportingManagerIsActive) {
      return {
        operationalRole: 'EMPLOYEE',
        empHierarchy,
        resolvedTeamLeader,
        initialTlDecision: 'PENDING',
        initialHrDecision: 'PENDING',
        initialStageLabel: 'Pending Reporting Person',
        validationError: 'Leave request cannot be submitted: The configured Reporting Person is inactive or unavailable.',
        validationFields: { reportingManagerId: 'Configured Reporting Person must be active.' },
      };
    }

    const isHrRequiredForEmployee = UserService.isHrApprovalRequired(employeeId);
    const effectiveEmpHrDecision: 'PENDING' | 'NOT_REQUIRED' = isHrRequiredForEmployee ? 'PENDING' : 'NOT_REQUIRED';

    if (isHrRequiredForEmployee && !UserService.hasActiveApproverForRole('HR', employeeId, applicantUserId)) {
      return {
        operationalRole: 'EMPLOYEE',
        empHierarchy,
        resolvedTeamLeader,
        initialTlDecision: 'PENDING',
        initialHrDecision: 'PENDING',
        initialStageLabel: 'Pending Reporting Person',
        validationError:
          'Leave request cannot be submitted: No active HR approver is configured in the system.',
        validationFields: {
          hrApprover: 'An active HR approver is required.',
        },
      };
    }
    if (!UserService.hasActiveApproverForRole('TOP_MANAGEMENT', employeeId, applicantUserId)) {
      return {
        operationalRole: 'EMPLOYEE',
        empHierarchy,
        resolvedTeamLeader,
        initialTlDecision: 'PENDING',
        initialHrDecision: effectiveEmpHrDecision,
        initialStageLabel: 'Pending Reporting Person',
        validationError:
          'Leave request cannot be submitted: No active Top Management approver is configured in the system.',
        validationFields: {
          managementApprover: 'An active Top Management approver is required.',
        },
      };
    }
    return {
      operationalRole: 'EMPLOYEE',
      empHierarchy,
      resolvedTeamLeader,
      initialTlDecision: 'PENDING',
      initialHrDecision: effectiveEmpHrDecision,
      initialStageLabel: 'Pending Reporting Person',
      validationError: null,
    };
  }

  /**
   * Submits a real leave request following the 13-step transaction safety standard
   */
  public static async submitLeaveRequest(
    input: CreateLeaveRequestInput,
    actor: AuthContext,
    auditMeta?: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveRequestDto> {
    // 1. Authenticate employee
    if (!actor || !actor.role) {
      throw new ValidationError('Unauthorized: Authentication required', {
        auth: 'Authentication context is missing',
      });
    }

    // 2. Verify employee authorization
    // In our RBAC model, an EMPLOYEE or staff member submits for themselves, or SUPER_ADMIN/HR may specify employeeId/employeeCode.
    const rawRequestedEmp = (input as any).employeeId ?? (input as any).employeeCode;
    let employeeId: number | undefined;
    if (rawRequestedEmp !== undefined && rawRequestedEmp !== null && String(rawRequestedEmp).trim() !== '') {
      const resolvedReqEmp = UserService.resolveEmployeeRecordSync(rawRequestedEmp);
      const candidateEmpId =
        resolvedReqEmp?.employeeId ??
        (!isNaN(Number(rawRequestedEmp)) ? Number(rawRequestedEmp) : undefined);
      if (
        candidateEmpId &&
        (actor.role === 'SUPER_ADMIN' ||
          actor.role === 'HR' ||
          !actor.employeeId ||
          Number(actor.employeeId) === Number(candidateEmpId))
      ) {
        employeeId = candidateEmpId;
      }
    }
    if (!employeeId) {
      if (actor.employeeId) {
        const byActorEmp = UserService.resolveEmployeeRecordSync(actor.employeeId);
        employeeId = byActorEmp?.employeeId ?? Number(actor.employeeId);
      } else if (actor.employeeCode) {
        const byActorCode = UserService.resolveEmployeeRecordSync(actor.employeeCode);
        if (byActorCode?.employeeId) {
          employeeId = byActorCode.employeeId;
        }
      }
    }
    if (!employeeId) {
      if (actor.userId) {
        try {
          const u = await UserService.getUserById(actor.userId);
          if (u?.employeeId) {
            employeeId = u.employeeId;
          }
        } catch {}
      }
      if (!employeeId && actor.username) {
        const byUsername = UserService.getMemoryUserRecordByUsername(actor.username);
        if (byUsername?.employeeId) {
          employeeId = byUsername.employeeId;
        }
      }
      if (!employeeId) {
        employeeId = 101;
      }
    }

    // 3. Read leave type (must be active)
    const leaveType = await LeaveService.getLeaveTypeById(input.leaveTypeId);
    if (!leaveType) {
      throw new ValidationError(`Leave type with ID ${input.leaveTypeId} not found`, {
        leaveTypeId: 'Selected leave type does not exist',
      });
    }
    if (!leaveType.isActive) {
      throw new ValidationError(`Leave type '${leaveType.name}' (${leaveType.code}) is inactive`, {
        leaveTypeId: `Leave type '${leaveType.name}' is currently inactive`,
      });
    }
    // CL is always paid. For every other leave type, the applicant's explicit choice
    // is stored on this request; existing master-level isPaid is the default only.
    const effectiveIsPaid = leaveType.code.trim().toUpperCase() === 'CL'
      ? true
      : (typeof input.isPaid === 'boolean' ? input.isPaid : leaveType.isPaid);

    // 4. Read applicable policy
    const policies = await LeaveService.getLeavePolicies({ leaveTypeId: input.leaveTypeId });
    const policy = policies.find((p) => p.isActive) || policies[0];
    if (!policy) {
      throw new ValidationError(
        `No active leave policy found for leave type '${leaveType.name}'`,
        { leaveTypeId: 'No active policy configured for this leave type' }
      );
    }

    // Validate dayType & halfDayPeriod
    if (input.dayType === 'HALF_DAY') {
      if (!leaveType.supportsHalfDay) {
        throw new ValidationError(`Leave type '${leaveType.name}' does not support half-day leaves`, {
          dayType: 'Half-day not permitted for this leave category',
        });
      }
      if (!policy.halfDayAllowed) {
        throw new ValidationError(
          `Policy '${policy.policyName}' does not permit half-day leaves`,
          { dayType: 'Half-day not permitted under applicable policy' }
        );
      }
      if (!input.halfDayPeriod || !['FIRST_HALF', 'SECOND_HALF'].includes(input.halfDayPeriod)) {
        throw new ValidationError(
          'Half-day period must be specified as FIRST_HALF or SECOND_HALF',
          { halfDayPeriod: 'Please select First Half or Second Half' }
        );
      }
      if (input.startDate !== input.endDate) {
        throw new ValidationError('Half-day leave must be applied for a single date', {
          endDate: 'Start date and end date must be identical for half-day requests',
        });
      }
    }

    // 5. Calculate working days
    const workingDaysResult = await WorkingDaysService.calculateWorkingDays(
      input.startDate,
      input.endDate,
      input.dayType,
      { employeeId }
    );

    if (workingDaysResult.totalDays <= 0) {
      throw new ValidationError(
        'The selected date range contains 0 working days (all dates fall on configured holidays or weekly offs)',
        { startDate: 'No working days in selected range' }
      );
    }

    // Check maximum consecutive days
    if (policy.maximumConsecutiveDays > 0 && workingDaysResult.totalDays > policy.maximumConsecutiveDays) {
      throw new ValidationError(
        `Requested leave (${workingDaysResult.totalDays} days) exceeds maximum consecutive days limit of ${policy.maximumConsecutiveDays} days under policy '${policy.policyName}'`,
        { totalDays: `Maximum consecutive days allowed is ${policy.maximumConsecutiveDays}` }
      );
    }

    // 6. Validate balance
    const startYear = parseInt(input.startDate.split('-')[0], 10) || new Date().getFullYear();
    // Initialize the selected leave year if needed. For CL, this also carries
    // forward the prior year's unused available balance when policy permits it.
    await LeaveService.initializeEmployeeBalances(employeeId, startYear, actor);
    const balances = await LeaveService.getLeaveBalances({ employeeId, year: startYear }, actor);
    const balance = balances.find((b) => b.leaveTypeId === input.leaveTypeId);
    const available = balance ? Number(balance.available) : 0;

    const emergencyWaiverApplicable = this.isEmergencyWaiverApplicable(input, leaveType, policy);

    // Validate CL against the employee's actual remaining balance. Include other
    // active, non-terminal CL requests so multiple pending requests cannot overbook it.
    // Emergency waivers do not waive the CL entitlement balance.
    const existingRequests = await this.getEmployeeRequests(employeeId);
    if (String(leaveType.code || '').trim().toUpperCase() === 'CL') {
      const pendingClDays = existingRequests.reduce((sum, request) => {
        if (Number(request.leaveTypeId) !== Number(input.leaveTypeId)) return sum;
        const requestStatus = String(request.status || '').toUpperCase();
        const finalStatus = String(request.finalStatus || '').toUpperCase();
        if (
          ['CANCELLED', 'REJECTED', 'APPROVED'].includes(requestStatus) ||
          ['CANCELLED', 'REJECTED', 'APPROVED'].includes(finalStatus)
        ) return sum;
        return sum + (Number(request.totalDays) || 0);
      }, 0);
      const remainingCl = Math.max(0, available - pendingClDays);
      if (workingDaysResult.totalDays > remainingCl + 0.0001) {
        throw new ValidationError(
          `Requested CL (${workingDaysResult.totalDays} days) exceeds your remaining CL balance of ${remainingCl.toFixed(2)} days.`,
          { totalDays: `You can apply for up to ${remainingCl.toFixed(2)} remaining CL day(s).` }
        );
      }
    }

    // 7. Validate overlap (Check against existing active requests for this employee)
    // Audited: Excludes cancelled and rejected requests. Allows distinct half-days on same date.
    for (const ex of existingRequests) {
      const isTerminalInactive =
        ex.status === 'CANCELLED' ||
        ex.finalStatus === 'CANCELLED' ||
        ex.status === 'REJECTED' ||
        ex.finalStatus === 'REJECTED';

      if (!isTerminalInactive) {
        if (input.startDate <= ex.endDate && input.endDate >= ex.startDate) {
          const isBothHalfDaySameDate =
            input.dayType === 'HALF_DAY' &&
            ex.dayType === 'HALF_DAY' &&
            input.startDate === ex.startDate &&
            input.endDate === ex.endDate;

          const isDistinctHalfDay =
            isBothHalfDaySameDate &&
            Boolean(input.halfDayPeriod) &&
            Boolean(ex.halfDayPeriod) &&
            input.halfDayPeriod !== ex.halfDayPeriod;

          if (!isDistinctHalfDay) {
            throw new ValidationError(
              `Overlapping leave request detected: You already have an active request (${ex.requestNumber}) from ${ex.startDate} to ${ex.endDate} with status ${ex.finalStatus || ex.status}`,
              { dates: `Overlaps with active request ${ex.requestNumber} (${ex.startDate} to ${ex.endDate})` }
            );
          }
        }
      }
    }

    // 8 & 9. Classification & Advance Notice Rules
    const appTimestamp = input.applicationTimestampOverride
      ? new Date(input.applicationTimestampOverride)
      : new Date();

    const isEmergency = this.isEmergencyLeaveRequest(input, leaveType);
    const effectiveReasonCategory: ReasonCategory | null =
      (input.reasonCategory as ReasonCategory | null | undefined) || (isEmergency ? 'MEDICAL_EMERGENCY' : null);

    const classificationResult = await LeaveClassificationService.classifyLeaveRequest(
      appTimestamp,
      input.startDate,
      undefined,
      {
        employeeId,
        dayType: input.dayType,
        isEmergency,
      }
    );

    const classification = classificationResult.classification;
    const isSameDay = classificationResult.isSameDay;

    // Check same-day policy
    // Same-day half-day requests are allowed; the dedicated half-day cutoff rule below still applies.
    // Keep sameDayAllowed enforcement for full-day requests.
    if (isSameDay && !policy.sameDayAllowed && input.dayType !== 'HALF_DAY') {
      throw new ValidationError(
        `Same-day leave is not permitted for policy '${policy.policyName}'`,
        { startDate: `Same-day leave is disallowed by policy '${policy.policyName}'` }
      );
    }

    // Policy-level late/post-start checks
    if (classification === 'LATE_LEAVE_REQUEST') {
      const allowed = policy.lateRequestAllowed || policy.emergencyExceptionAllowed;
      if (!allowed) {
        throw new ValidationError(
          `Late leave requests are not permitted under policy '${policy.policyName}'`,
          { time: `Late requests are disallowed by policy '${policy.policyName}'` }
        );
      }
    }

    if (classification === 'POST_START_LEAVE_REQUEST') {
      const allowed = policy.postStartRequestAllowed || policy.emergencyExceptionAllowed;
      if (!allowed) {
        throw new ValidationError(
          `Post-start leave requests after office hours are not permitted under policy '${policy.policyName}'`,
          { time: `Post-start requests are disallowed by policy '${policy.policyName}'` }
        );
      }
    }

    // Authoritative Timing & Cutoff Rules (Normal Full Day vs Emergency Full/Half Day vs Normal Half Day)
    if (input.dayType === 'FULL_DAY') {
      if (!isEmergency) {
        // 1. NORMAL FULL-DAY LEAVE: Must be submitted BEFORE the previous calendar day's configured cutoff time (e.g. D-1 18:00)
        if (!classificationResult.isBeforeNormalFullDayCutoff) {
          throw new ValidationError(
            `Full Day leave for ${input.startDate} cannot be submitted after the cutoff of ${classificationResult.normalFullDayCutoffDateStr} ${classificationResult.normalFullDayCutoffTimeUsed} (submitted at ${classificationResult.applicationDateStr} ${classificationResult.applicationTimeStr}).`,
            {
              startDate: `Normal Full Day cutoff (${classificationResult.normalFullDayCutoffDateStr} ${classificationResult.normalFullDayCutoffTimeUsed}) has passed`,
              time: `Full Day leave for ${input.startDate} cannot be submitted after the cutoff of ${classificationResult.normalFullDayCutoffDateStr} ${classificationResult.normalFullDayCutoffTimeUsed}`,
              reasonCategory:
                'Normal Full Day cutoff has passed; Emergency Full Day before shift start requires an emergency reason category',
            }
          );
        }
      } else {
        // 2. EMERGENCY FULL-DAY LEAVE:
        // Allowed BEFORE the employee's applicable office/shift start time for date D.
        // NOT ALLOWED at or after the employee's applicable office/shift start time for date D,
        // UNLESS the employee explicitly requested advance notice waiver under Emergency Exception clause and policy permits it.
        if (!classificationResult.isBeforeShiftStart && !emergencyWaiverApplicable) {

          throw new ValidationError(
            `Emergency Full Day leave cannot be submitted after the employee's shift start time (${classificationResult.shiftStartTimeUsed || '08:30'}). Half Day Emergency Leave may be submitted.`,
            {
              dayType: `Emergency Full Day is not allowed at or after shift start (${classificationResult.shiftStartTimeUsed || '08:30'}); only Emergency Half Day is allowed`,
              time: `Submitted at ${classificationResult.applicationDateStr} ${classificationResult.applicationTimeStr}, which is at or after shift start (${classificationResult.shiftStartTimeUsed || '08:30'})`,
            }
          );
        }
      }
    } else if (input.dayType === 'HALF_DAY') {
      if (classificationResult.noticeDays < 0) {
        throw new ValidationError(
          `Half Day leave for ${input.startDate} cannot be submitted for a past date (submitted on ${classificationResult.applicationDateStr}).`,
          {
            startDate: `Cannot submit leave for past date ${input.startDate}`,
          }
        );
      }
      // Half-day applications are allowed only from today through 30 calendar days ahead (inclusive).
      if (classificationResult.noticeDays > 30) {
        throw new ValidationError(
          'Half Day leave can only be applied for dates from today up to 30 days in advance.',
          { startDate: 'Half-day leave must be within the next 30 calendar days.' }
        );
      }
      if (!isEmergency && classificationResult.isSameDay && (classificationResult.isLate || classificationResult.isPostStart)) {
        throw new ValidationError(
          `Normal Half Day leave for ${input.startDate} must be submitted on or before the cutoff time (${classificationResult.shiftCutoffTimeUsed || '07:00'}). After cutoff, please apply as Emergency Half Day leave.`,
          {
            time: `Normal Half Day cutoff (${classificationResult.shiftCutoffTimeUsed || '07:00'}) has passed`,
            reasonCategory: 'Reason category is required for Emergency Half Day leave after cutoff',
          }
        );
      }
    }

    // Check advance notice rule
    if (classificationResult.noticeDays > 0) {
      if (classificationResult.noticeDays < policy.minimumNoticeDays) {
        if (!policy.emergencyExceptionAllowed || !isEmergency) {
          throw new ValidationError(
            `Policy '${policy.policyName}' requires at least ${policy.minimumNoticeDays} day(s) advance notice. You submitted with ${classificationResult.noticeDays} day(s) notice.`,
            { startDate: `Minimum notice requirement of ${policy.minimumNoticeDays} day(s) not met` }
          );
        }
      }
    }

    // 10. Late & Post-Start Request Rules & Emergency Reason Validation
    if (classification === 'LATE_LEAVE_REQUEST') {
      if (!effectiveReasonCategory) {
        throw new ValidationError(
          'Reason category is mandatory for late leave applications',
          { reasonCategory: 'Reason category is required for late leave requests' }
        );
      }
      if (!input.reason || input.reason.trim().length < 5) {
        throw new ValidationError(
          'Detailed explanation of at least 5 characters is mandatory for late leave requests',
          { reason: 'Detailed reason is required for late leave applications' }
        );
      }
    }

    if (classification === 'POST_START_LEAVE_REQUEST') {
      if (!effectiveReasonCategory) {
        throw new ValidationError(
          'Reason category is mandatory for post-start leave applications',
          { reasonCategory: 'Reason category is required for post-start requests' }
        );
      }
      if (!input.reason || input.reason.trim().length < 5) {
        throw new ValidationError(
          'Detailed explanation of at least 5 characters is mandatory for post-start leave requests',
          { reason: 'Detailed reason is required for post-start leave applications' }
        );
      }
    }

    // Reason validation (general)
    if (!input.reason || !input.reason.trim()) {
      throw new ValidationError('Reason for leave is required', {
        reason: 'Reason cannot be empty',
      });
    }

    // Document requirement validation (Section 14)
    let requiresAttachment = false;
    if (policy.documentRequired) {
      if (policy.documentRequiredAfterDays && policy.documentRequiredAfterDays > 0) {
        requiresAttachment = workingDaysResult.totalDays > policy.documentRequiredAfterDays;
      } else {
        requiresAttachment = true;
      }
    } else if (leaveType.requiresDocument) {
      requiresAttachment = true;
    }

    if (requiresAttachment && !input.attachmentPath) {
      throw new ValidationError(
        `Supporting document is mandatory for ${leaveType.name} under policy '${policy.policyName}'`,
        { attachment: 'Supporting document is required for this leave type' }
      );
    }

    // 11. Resolve applicant operational role & validate required approvers before creating request
    // Uses the leave application's start date (`input.startDate`) for date-effective Team Leader resolution.
    const empRecord = await UserService.getEmployeeById(employeeId);
    const workflow = await this.resolveApplicantWorkflow(
      employeeId,
      actor,
      input.startDate,
      actor.role === 'SUPER_ADMIN' && Boolean((input as any).submittedOnBehalfOf)
    );
    if (workflow.validationError) {
      throw new ValidationError(workflow.validationError, workflow.validationFields);
    }

    const {
      empHierarchy,
      resolvedTeamLeader,
      operationalRole,
      initialTlDecision,
      initialHrDecision,
      initialStageLabel,
    } = workflow;
    const resolvedEmpName =
      empRecord?.employeeName ||
      empHierarchy.employeeName ||
      actor.username ||
      'Employee';
    const resolvedEmpCode =
      empRecord?.employeeCode ||
      empHierarchy.employeeCode ||
      actor.employeeCode ||
      `EMP${employeeId}`;
    const resolvedDepartmentId =
      empRecord?.departmentId ??
      empHierarchy.departmentId ??
      UserService.resolveEmployeeDepartmentOnDate(employeeId, input.startDate) ??
      null;
    const resolvedDeptObj = resolvedDepartmentId
      ? UserService.getDepartmentByIdSync(resolvedDepartmentId)
      : null;
    const resolvedDepartmentCode =
      empRecord?.departmentCode ??
      empHierarchy.departmentCode ??
      resolvedDeptObj?.code ??
      null;
    const resolvedDepartmentName =
      empRecord?.departmentName ??
      empHierarchy.departmentName ??
      resolvedDeptObj?.name ??
      null;
    const resolvedApplicantRole = empHierarchy.employeeExists ? empHierarchy.role : actor.role;

    const requestNumber = await this.generateRequestNumber(startYear);

    const assignedTlId =
      operationalRole === 'EMPLOYEE'
        ? (resolvedTeamLeader?.teamLeaderEmployeeId ?? empHierarchy.reportingManagerId ?? null)
        : null;
    const assignedTlUserId =
      operationalRole === 'EMPLOYEE'
        ? (resolvedTeamLeader?.teamLeaderUserId ?? empHierarchy.reportingManagerUserId ?? null)
        : null;
    const assignedTlName =
      operationalRole === 'EMPLOYEE'
        ? (resolvedTeamLeader?.teamLeaderName ?? empHierarchy.reportingManagerName ?? null)
        : null;

    // 12 & 13. Create leave request and event in database / memory transaction
    const newRecord: LeaveRequestDto = {
      id: nextRequestId++,
      requestNumber,
      employeeId,
      employeeName: resolvedEmpName,
      employeeCode: resolvedEmpCode,
      applicantRole: resolvedApplicantRole,
      applicantOperationalRole: operationalRole,
      departmentId: resolvedDepartmentId,
      departmentCode: resolvedDepartmentCode,
      departmentName: resolvedDepartmentName,
      teamId: resolvedTeamLeader?.teamId ?? empHierarchy.teamId ?? resolvedDepartmentId ?? null,
      teamName: resolvedTeamLeader?.teamName ?? empHierarchy.teamName ?? resolvedDepartmentName ?? null,
      assignedTeamLeaderId: assignedTlId,
      assignedTeamLeaderUserId: assignedTlUserId,
      assignedTeamLeaderName: assignedTlName,
      teamLeaderResolutionSource: resolvedTeamLeader?.source ?? null,
      teamLeaderEffectiveFrom: resolvedTeamLeader?.effectiveFrom ?? null,
      teamLeaderEffectiveTo: resolvedTeamLeader?.effectiveTo ?? null,
      reportingManagerId:
        operationalRole === 'EMPLOYEE' ? assignedTlId : empHierarchy.reportingManagerId,
      reportingManagerUserId:
        operationalRole === 'EMPLOYEE' ? assignedTlUserId : empHierarchy.reportingManagerUserId,
      reportingManagerName:
        operationalRole === 'EMPLOYEE' ? assignedTlName : empHierarchy.reportingManagerName,
      leaveTypeId: input.leaveTypeId,
      leaveTypeCode: leaveType.code,
      leaveTypeName: leaveType.name,
      isPaid: effectiveIsPaid,
      startDate: input.startDate,
      endDate: input.endDate,
      totalDays: workingDaysResult.totalDays.toFixed(2),
      dayType: input.dayType,
      halfDayPeriod: input.halfDayPeriod || null,
      reasonCategory: effectiveReasonCategory,
      reason: input.reason.trim(),
      requestClassification: classification,
      applicationTimestamp: appTimestamp.toISOString(),
      status: 'PENDING',
      teamLeaderDecision: initialTlDecision,
      teamLeaderDecidedBy: null,
      teamLeaderDecidedByName: null,
      teamLeaderDecidedAt: null,
      teamLeaderRemarks: null,
      hrDecision: initialHrDecision,
      hrDecidedBy: null,
      hrDecidedByName: null,
      hrDecidedAt: null,
      hrRemarks: null,
      managementDecision: 'PENDING',
      managementDecidedBy: null,
      managementDecidedByName: null,
      managementDecidedAt: null,
      managementRemarks: null,
      finalStatus: 'PENDING',
      approvalStageLabel: initialStageLabel,
      balancePosted: false,
      attachmentRequired: requiresAttachment,
      attachmentPath: input.attachmentPath || null,
      attachmentName: input.attachmentName || null,
      attachmentSize: input.attachmentSize || null,
      attachmentMime:
        AttachmentService.inferMimeType(
          input.attachmentName || input.attachmentPath,
          input.attachmentMime
        ) || null,
      hasAttachment: Boolean(input.attachmentName || input.attachmentPath),
      cancellationReason: null,
      cancellationTimestamp: null,
      noticeMinutes: classificationResult.noticeMinutes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isProductionRuntime()) {
      assertProductionDbConfigured();
    }
    if (isDbConfigured()) {
      const db = getDb();
      if (!db) {
        throw new Error('Database connection is not available while database is configured');
      }
      let submittedNotification: Parameters<typeof NotificationService.notifyLeaveSubmitted>[0] | null = null;
      const submittedResult = await db.transaction(async (tx) => {
        const now = new Date();
        const inserted = await tx
          .insert(leaveRequests)
          .values({
            requestNumber,
            employeeId,
            leaveTypeId: input.leaveTypeId,
            isPaid: effectiveIsPaid,
            startDate: input.startDate,
            endDate: input.endDate,
            totalDays: String(workingDaysResult.totalDays.toFixed(2)),
            dayType: input.dayType,
            halfDayPeriod: input.halfDayPeriod || null,
            reasonCategory: effectiveReasonCategory,
            reason: input.reason.trim(),
            requestClassification: classification,
            applicationTimestamp: appTimestamp,
            status: 'PENDING',
            applicantRole: resolvedApplicantRole,
            applicantOperationalRole: operationalRole,
            departmentId: resolvedDepartmentId,
            departmentCode: resolvedDepartmentCode,
            departmentName: resolvedDepartmentName,
            teamId: newRecord.teamId,
            teamName: newRecord.teamName,
            assignedTeamLeaderId: assignedTlId,
            assignedTeamLeaderUserId: assignedTlUserId,
            assignedTeamLeaderName: assignedTlName,
            teamLeaderResolutionSource: resolvedTeamLeader?.source ?? null,
            teamLeaderEffectiveFrom: resolvedTeamLeader?.effectiveFrom ?? null,
            teamLeaderEffectiveTo: resolvedTeamLeader?.effectiveTo ?? null,
            teamLeaderPeriodLabel: (resolvedTeamLeader as any)?.periodLabel ?? null,
            teamLeaderDecision: initialTlDecision,
            hrDecision: initialHrDecision,
            managementDecision: 'PENDING',
            reportingManagerId: newRecord.reportingManagerId,
            reportingManagerUserId: newRecord.reportingManagerUserId,
            reportingManagerName: newRecord.reportingManagerName,
            currentApprovalStage: initialStageLabel,
            approvalStageLabel: initialStageLabel,
            isEscalated: false,
            escalationRequired: false,
            autoEscalated: false,
            finalStatus: 'PENDING',
            balancePosted: false,
            attachmentRequired: requiresAttachment,
            attachmentPath: input.attachmentPath || null,
            attachmentName: input.attachmentName || null,
            attachmentSize: input.attachmentSize || null,
            attachmentMime: newRecord.attachmentMime || null,
            hasAttachment: Boolean(input.attachmentName || input.attachmentPath),
            attachmentUrl: Boolean(input.attachmentName || input.attachmentPath)
              ? `/api/leave-requests/${requestNumber}/attachment`
              : null,
            noticeMinutes: classificationResult.noticeMinutes,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        const reqRow = inserted[0];

        // Insert submission event audit record
        const insertedEvents = await tx
          .insert(leaveRequestEvents)
          .values({
            leaveRequestId: reqRow.id,
            eventType: 'SUBMITTED',
            action: 'SUBMITTED',
            previousDecision: null,
            newDecision: 'PENDING',
            previousStatus: null,
            newStatus: 'PENDING',
            actorId: actor.userId || null,
            actorUserId: actor.userId || null,
            actorEmployeeCode: actor.employeeCode || resolvedEmpCode || null,
            actorRole: actor.role,
            actorName: actor.username || resolvedEmpName || 'Applicant',
            remarks: emergencyWaiverApplicable
              ? `Submitted emergency leave request for ${workingDaysResult.totalDays} day(s) [${classification}] with advance notice waiver requested under Emergency Exception clause`
              : `Submitted leave request for ${workingDaysResult.totalDays} day(s) [${classification}]`,
            comments: input.reason.trim(),
            ipAddress: auditMeta?.ipAddress || null,
            userAgent: auditMeta?.userAgent || null,
            createdAt: now,
          })
          .returning();

        const resultDto = this.mapRowToDto(
          reqRow,
          new Map([[leaveType.id, leaveType]]),
          new Map([[employeeId, empRecord || { employeeName: resolvedEmpName, employeeCode: resolvedEmpCode }]])
        );
        newRecord.id = reqRow.id;
        memoryLeaveRequests.push(resultDto);
        if (insertedEvents.length > 0) {
          memoryLeaveRequestEvents.push(this.mapEventRowToDto(insertedEvents[0]));
        }

        // Defer notification dispatch until the request transaction commits.
        // Otherwise the notification's FK to the new leave request can fail on another DB connection.
        submittedNotification = {
          id: resultDto.id,
          requestNumber: resultDto.requestNumber,
          employeeId,
          employeeName: resultDto.employeeName,
          applicantRole: resultDto.applicantRole,
          applicantOperationalRole: resultDto.applicantOperationalRole,
          reportingManagerId: empHierarchy.reportingManagerId,
          reportingManagerUserId: empHierarchy.reportingManagerUserId,
          assignedTeamLeaderId: resultDto.assignedTeamLeaderId,
          assignedTeamLeaderUserId: resultDto.assignedTeamLeaderUserId,
          totalDays: resultDto.totalDays,
          leaveTypeName: resultDto.leaveTypeName,
          startDate: resultDto.startDate,
          endDate: resultDto.endDate,
          classification: resultDto.requestClassification,
        };

        try {
          const { AuditService } = await import('./auditService.ts');
          await AuditService.logEvent({
            actorId: actor.userId || employeeId,
            actorRole: actor.role || 'EMPLOYEE',
            action: 'LEAVE_SUBMITTED',
            targetEntity: 'leave_requests',
            targetId: String(resultDto.id),
            metadata: {
              requestNumber: resultDto.requestNumber,
              employeeId,
              employeeCode: resolvedEmpCode,
              employeeName: resolvedEmpName,
              departmentId: resolvedDepartmentId,
              departmentCode: resolvedDepartmentCode,
              departmentName: resolvedDepartmentName,
              leaveTypeId: input.leaveTypeId,
              leaveTypeCode: leaveType.code,
              leaveTypeName: leaveType.name,
              startDate: input.startDate,
              endDate: input.endDate,
              totalDays: workingDaysResult.totalDays,
              classification,
              stage: initialStageLabel,
              hasAttachment: resultDto.hasAttachment,
              emergencyExceptionClause: emergencyWaiverApplicable,
              advanceNoticeWaiverRequested: Boolean(input.emergencyException),
            },
            ipAddress: auditMeta?.ipAddress,
            userAgent: auditMeta?.userAgent,
          });
        } catch {}

        return resultDto;
      });

      // The request is now committed, so notifications can safely reference it.
      if (submittedNotification) {
        try {
          await NotificationService.notifyLeaveSubmitted(submittedNotification);
        } catch (err) {
          console.warn('Notification error on submit after commit:', err);
        }
      }
      return submittedResult;
    }

    // In-memory fallback
    this.withStageLabel(newRecord);
    memoryLeaveRequests.push(newRecord);
    memoryLeaveRequestEvents.push({
      id: nextEventId++,
      leaveRequestId: newRecord.id,
      eventType: 'SUBMITTED',
      action: 'SUBMITTED',
      previousDecision: null,
      newDecision: 'PENDING',
      actorId: actor.userId || null,
      actorRole: actor.role,
      actorName: actor.username,
      remarks: emergencyWaiverApplicable
        ? `Submitted emergency leave request for ${workingDaysResult.totalDays} day(s) [${classification}] with advance notice waiver requested under Emergency Exception clause`
        : `Submitted leave request for ${workingDaysResult.totalDays} day(s) [${classification}]`,
      ipAddress: auditMeta?.ipAddress,
      userAgent: auditMeta?.userAgent,
      createdAt: new Date().toISOString(),
    });

    try {
      await NotificationService.notifyLeaveSubmitted({
        id: newRecord.id,
        requestNumber: newRecord.requestNumber,
        employeeId,
        employeeName: newRecord.employeeName,
        applicantRole: newRecord.applicantRole,
        applicantOperationalRole: newRecord.applicantOperationalRole,
        reportingManagerId: empHierarchy.reportingManagerId,
        reportingManagerUserId: empHierarchy.reportingManagerUserId,
        totalDays: newRecord.totalDays,
        leaveTypeName: newRecord.leaveTypeName,
        startDate: newRecord.startDate,
        endDate: newRecord.endDate,
        classification: newRecord.requestClassification,
      });
    } catch {}

    try {
      const { AuditService } = await import('./auditService.ts');
      await AuditService.logEvent({
        actorId: actor.userId || employeeId,
        actorRole: actor.role || 'EMPLOYEE',
        action: 'LEAVE_SUBMITTED',
        targetEntity: 'leave_requests',
        targetId: String(newRecord.id),
        metadata: {
          requestNumber: newRecord.requestNumber,
          employeeId: newRecord.employeeId,
          employeeCode: newRecord.employeeCode,
          employeeName: newRecord.employeeName,
          departmentId: newRecord.departmentId,
          departmentCode: newRecord.departmentCode,
          departmentName: newRecord.departmentName,
          leaveTypeId: newRecord.leaveTypeId,
          leaveTypeCode: newRecord.leaveTypeCode,
          leaveTypeName: newRecord.leaveTypeName,
          startDate: newRecord.startDate,
          endDate: newRecord.endDate,
          totalDays: newRecord.totalDays,
          dayType: newRecord.dayType,
          halfDayPeriod: newRecord.halfDayPeriod,
          requestClassification: newRecord.requestClassification,
          previousStatus: 'NONE',
          newStatus: newRecord.finalStatus || 'PENDING',
          reason: newRecord.reason,
          assignedTeamLeaderId: newRecord.assignedTeamLeaderId,
          assignedTeamLeaderName: newRecord.assignedTeamLeaderName,
          approvalStageLabel: newRecord.approvalStageLabel,
          nextStep: newRecord.approvalStageLabel || 'Awaiting Approval Review',
          emergencyExceptionClause: emergencyWaiverApplicable,
          advanceNoticeWaiverRequested: Boolean(input.emergencyException),
        },
        ipAddress: auditMeta?.ipAddress,
        userAgent: auditMeta?.userAgent,
      });
    } catch {}

    return newRecord;
  }

  /**
   * Retrieves all leave requests for a specific employee
   */
  public static async getEmployeeRequests(employeeId: number | string): Promise<LeaveRequestDto[]> {
    const resolvedEmp = UserService.resolveEmployeeRecordSync(employeeId);
    const targetEmpId = resolvedEmp?.employeeId ?? Number(employeeId);
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const rows = await db
            .select()
            .from(leaveRequests)
            .where(eq(leaveRequests.employeeId, targetEmpId))
            .orderBy(desc(leaveRequests.createdAt));

          const types = await LeaveService.getLeaveTypes({ includeInactive: true });
          const typeMap = new Map(types.map((t) => [t.id, t]));
          const emp = await UserService.getEmployeeById(targetEmpId);
          const hierarchy = await UserService.getEmployeeRoleAndHierarchy(targetEmpId);

          return rows.map((r) => {
            const lt = typeMap.get(r.leaveTypeId);
            return this.withStageLabel({
              ...r,
              employeeName: emp?.employeeName || `Employee ${r.employeeId}`,
              employeeCode: emp?.employeeCode || `EMP${r.employeeId}`,
              departmentId: emp?.departmentId ?? hierarchy.departmentId ?? null,
              departmentCode: emp?.departmentCode ?? hierarchy.departmentCode ?? null,
              departmentName: emp?.departmentName ?? hierarchy.departmentName ?? null,
              applicantRole: hierarchy.role,
              applicantOperationalRole:
                hierarchy.operationalRole ||
                this.resolveApplicantOperationalRole({
                  ...(r as unknown as Partial<LeaveRequestDto>),
                  applicantRole: hierarchy.role,
                }),
              reportingManagerId: hierarchy.reportingManagerId,
              reportingManagerUserId: hierarchy.reportingManagerUserId,
              reportingManagerName: hierarchy.reportingManagerName,
              leaveTypeCode: lt?.code,
              leaveTypeName: lt?.name,
            } as LeaveRequestDto);
          });
        } catch {}
      }
    }

    return memoryLeaveRequests
      .filter((r) => r.employeeId === targetEmpId)
      .map((r) => this.withStageLabel(r))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Retrieves a single leave request by ID, verifying ownership
   */
  public static async getLeaveRequestById(
    id: number,
    actor: AuthContext
  ): Promise<{ request: LeaveRequestDto; events: LeaveRequestEventDto[] } | null> {
    let reqRecord: LeaveRequestDto | null = null;
    let eventsList: LeaveRequestEventDto[] = [];

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const rows = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id));
          if (rows.length > 0) {
            const r = rows[0];
            const lt = await LeaveService.getLeaveTypeById(r.leaveTypeId);
            const emp = await UserService.getEmployeeById(r.employeeId);
            const hierarchy = await UserService.getEmployeeRoleAndHierarchy(r.employeeId);
            reqRecord = this.withStageLabel({
              ...r,
              employeeName: emp?.employeeName || `Employee ${r.employeeId}`,
              employeeCode: emp?.employeeCode || `EMP${r.employeeId}`,
              applicantRole: hierarchy.role,
              applicantOperationalRole:
                hierarchy.operationalRole ||
                this.resolveApplicantOperationalRole({
                  ...(r as unknown as Partial<LeaveRequestDto>),
                  applicantRole: hierarchy.role,
                }),
              reportingManagerId: hierarchy.reportingManagerId,
              reportingManagerUserId: hierarchy.reportingManagerUserId,
              reportingManagerName: hierarchy.reportingManagerName,
              leaveTypeCode: lt?.code,
              leaveTypeName: lt?.name,
            } as LeaveRequestDto);

            const evRows = await db
              .select()
              .from(leaveRequestEvents)
              .where(eq(leaveRequestEvents.leaveRequestId, id))
              .orderBy(desc(leaveRequestEvents.createdAt));
            eventsList = evRows as LeaveRequestEventDto[];
          }
        } catch {}
      }
    }

    if (!reqRecord) {
      reqRecord = memoryLeaveRequests.find((r) => r.id === id) || null;
      if (reqRecord) {
        this.withStageLabel(reqRecord);
        eventsList = memoryLeaveRequestEvents.filter((ev) => ev.leaveRequestId === id);
      }
    }

    if (!reqRecord) return null;

    // Employees may view their own requests, and may view another request only when
    // they are that employee's explicitly assigned Reporting Person.
    if (actor.role === 'EMPLOYEE') {
      const actorEmpId = actor.employeeId || 0;
      const isOwnRequest = reqRecord.employeeId === actorEmpId;
      const managerId = reqRecord.reportingManagerId ?? null;
      const managerUserId = reqRecord.reportingManagerUserId ?? null;
      const isAssignedReportingPerson =
        (Boolean(actorEmpId) && Boolean(managerId) && Number(actorEmpId) === Number(managerId)) ||
        (Boolean(actor.userId) && Boolean(managerUserId) && Number(actor.userId) === Number(managerUserId));
      if (!isOwnRequest && !isAssignedReportingPerson) {
        throw new Error('Forbidden: You are not authorized to view another employee’s leave request');
      }
    }

    return { request: reqRecord, events: eventsList };
  }

  /**
   * Retrieves and authorizes access to a leave request's attached document
   * for Employee (own), Team Leader (assigned team), HR, Top Management, and Super Admin.
   */
  public static async getAuthorizedAttachment(
    id: number,
    actor: AuthContext
  ): Promise<{
    request: LeaveRequestDto;
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    size: number;
    isInlineViewable: boolean;
  }> {
    if (!actor || !actor.role) {
      throw new Error('Unauthorized: Authentication required');
    }

    const allowedRoles = ['EMPLOYEE', 'TEAM_LEADER', 'HR', 'TOP_MANAGEMENT', 'SUPER_ADMIN'];
    if (!allowedRoles.includes(actor.role)) {
      throw new Error('Forbidden: You are not authorized to access leave attachments');
    }

    const details = await this.getLeaveRequestById(id, actor);
    if (!details || !details.request) {
      throw new ValidationError(`Leave request with ID ${id} not found`);
    }

    const { request } = details;
    const empHierarchy = await UserService.getEmployeeRoleAndHierarchy(request.employeeId);
    const isOwnRequest =
      Boolean(actor.employeeId) && Number(request.employeeId) === Number(actor.employeeId);
    const isTopMgmtRequest =
      request.applicantOperationalRole === 'TOP_MANAGEMENT' ||
      request.applicantRole === 'TOP_MANAGEMENT' ||
      empHierarchy.operationalRole === 'TOP_MANAGEMENT' ||
      empHierarchy.role === 'TOP_MANAGEMENT';

    if (!isOwnRequest && isTopMgmtRequest && (actor.role === 'TEAM_LEADER' || actor.role === 'HR')) {
      throw new Error(
        'Forbidden: Team Leader and HR are not authorized to access Top Management leave attachments'
      );
    }

    if (!isOwnRequest && request.teamLeaderDecision === 'NOT_REQUIRED' && actor.role === 'TEAM_LEADER') {
      throw new Error(
        'Forbidden: Team Leader is not authorized to access attachments for leave requests that do not require Team Leader approval'
      );
    }

    // Team Leader can only access attachments for employees assigned to their team
    if (!isOwnRequest && actor.role === 'TEAM_LEADER') {
      const emp = await UserService.getEmployeeById(request.employeeId);
      const effectiveLeaderEmpId =
        request.assignedTeamLeaderId ??
        request.reportingManagerId ??
        emp?.reportingManagerId ??
        null;
      const effectiveLeaderUserId =
        request.assignedTeamLeaderUserId ?? request.reportingManagerUserId ?? null;

      if (effectiveLeaderEmpId || effectiveLeaderUserId) {
        const matchesEmp =
          Boolean(actor.employeeId) &&
          Boolean(effectiveLeaderEmpId) &&
          Number(effectiveLeaderEmpId) === Number(actor.employeeId);
        const matchesUser =
          Boolean(actor.userId) &&
          Boolean(effectiveLeaderUserId) &&
          Number(effectiveLeaderUserId) === Number(actor.userId);
        if (!matchesEmp && !matchesUser) {
          throw new Error(
            'Forbidden: You are only authorized to access attachments for employees assigned to your team'
          );
        }
      }
    }

    if (!request.attachmentPath && !request.attachmentName) {
      throw new ValidationError(`No attachment found for leave request ${request.requestNumber}`);
    }

    const fileData = AttachmentService.readAttachmentFile(
      request.attachmentPath,
      request.attachmentName,
      request.attachmentMime
    );

    return {
      request,
      buffer: fileData.buffer,
      mimeType: fileData.mimeType,
      fileName: fileData.fileName,
      size: request.attachmentSize || fileData.size,
      isInlineViewable: AttachmentService.isInlineViewableMime(fileData.mimeType),
    };
  }

  /**
   * Prevents employees from removing attachments from already-submitted leave requests
   * to preserve approval and audit history.
   */
  public static async removeAttachmentFromSubmittedRequest(
    id: number,
    actor: AuthContext
  ): Promise<never> {
    if (!actor || !actor.role) {
      throw new Error('Unauthorized: Authentication required');
    }
    const details = await this.getLeaveRequestById(id, actor);
    if (!details || !details.request) {
      throw new ValidationError(`Leave request with ID ${id} not found`);
    }
    throw new Error(
      'Forbidden: Attachments cannot be removed from an already-submitted leave request to preserve approval and audit history.'
    );
  }

  /**
   * Cancels a pending leave request
   */
  public static async cancelLeaveRequest(
    id: number,
    reason: string,
    actor: AuthContext,
    auditMeta?: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveRequestDto> {
    const details = await this.getLeaveRequestById(id, actor);
    if (!details) {
      throw new ValidationError(`Leave request with ID ${id} not found`);
    }

    const { request } = details;

    // Strict ownership: Employee can only cancel their own request
    if (actor.role === 'EMPLOYEE') {
      const actorEmpId = actor.employeeId || 101;
      if (request.employeeId !== actorEmpId) {
        throw new Error('Forbidden: You cannot cancel another employee’s leave request');
      }
    }

    if (request.status === 'CANCELLED' || request.finalStatus === 'CANCELLED') {
      throw new ValidationError('This leave request has already been cancelled');
    }

    if ((request as any)._processingCancel || request.status !== 'PENDING' || request.finalStatus !== 'PENDING') {
      throw new ValidationError(`Cannot cancel leave request with status '${request.finalStatus || request.status}'`);
    }
    (request as any)._processingCancel = true;

    const cancellationReason = reason?.trim() || 'Cancelled by employee';
    const now = new Date();

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        return await db.transaction(async (tx) => {
          const updated = await tx
            .update(leaveRequests)
            .set({
              status: 'CANCELLED',
              finalStatus: 'CANCELLED',
              cancellationReason,
              cancellationTimestamp: now,
              updatedAt: now,
            })
            .where(
              and(
                eq(leaveRequests.id, id),
                eq(leaveRequests.finalStatus, 'PENDING')
              )
            )
            .returning();

          if (updated.length === 0) {
            throw new ValidationError('Conflict: Leave request cannot be cancelled because it was already finalized or processed');
          }

          await tx.insert(leaveRequestEvents).values({
            leaveRequestId: id,
            eventType: 'CANCELLED',
            action: 'CANCELLED',
            previousDecision: request.finalStatus || request.status,
            newDecision: 'CANCELLED',
            actorId: actor.userId || null,
            actorRole: actor.role,
            remarks: cancellationReason,
            ipAddress: auditMeta?.ipAddress || null,
            userAgent: auditMeta?.userAgent || null,
          });

          const cancelledDto = {
            ...updated[0],
            leaveTypeCode: request.leaveTypeCode,
            leaveTypeName: request.leaveTypeName,
          } as LeaveRequestDto;

          try {
            await NotificationService.notifyLeaveCancelled(
              {
                id: cancelledDto.id,
                requestNumber: cancelledDto.requestNumber,
                employeeName: request.employeeName || actor.username,
              },
              cancellationReason
            );
          } catch (e) {
            console.warn('Cancel notification error:', e);
          }

          return cancelledDto;
        });
      }
    }

    // In-memory fallback
    request.status = 'CANCELLED';
    request.finalStatus = 'CANCELLED';
    request.cancellationReason = cancellationReason;
    request.cancellationTimestamp = now.toISOString();
    request.updatedAt = now.toISOString();
    (request as any)._processingCancel = false;

    memoryLeaveRequestEvents.push({
      id: nextEventId++,
      leaveRequestId: id,
      eventType: 'CANCELLED',
      action: 'CANCELLED',
      previousDecision: 'PENDING',
      newDecision: 'CANCELLED',
      actorId: actor.userId || null,
      actorRole: actor.role,
      actorName: actor.username,
      remarks: cancellationReason,
      ipAddress: auditMeta?.ipAddress,
      userAgent: auditMeta?.userAgent,
      createdAt: now.toISOString(),
    });

    try {
      await NotificationService.notifyLeaveCancelled(
        {
          id: request.id,
          requestNumber: request.requestNumber,
          employeeName: request.employeeName || actor.username,
        },
        cancellationReason
      );
    } catch {}

    try {
      const { AuditService } = await import('./auditService.ts');
      await AuditService.logEvent({
        actorId: actor.userId || request.employeeId,
        actorRole: actor.role || 'EMPLOYEE',
        action: 'LEAVE_CANCELLED',
        targetEntity: 'leave_requests',
        targetId: String(request.id),
        metadata: {
          requestNumber: request.requestNumber,
          employeeId: request.employeeId,
          employeeCode: request.employeeCode,
          employeeName: request.employeeName,
          departmentId: request.departmentId,
          departmentCode: request.departmentCode,
          departmentName: request.departmentName,
          leaveTypeCode: request.leaveTypeCode,
          leaveTypeName: request.leaveTypeName,
          startDate: request.startDate,
          endDate: request.endDate,
          totalDays: request.totalDays,
          previousStatus: 'PENDING',
          newStatus: 'CANCELLED',
          reason: cancellationReason,
          cancellationReason,
          nextStep: 'Cancelled by applicant — Leave request closed',
        },
        ipAddress: auditMeta?.ipAddress,
        userAgent: auditMeta?.userAgent,
      });
    } catch {}

    return request;
  }

  /**
   * Authoritative Super Admin deletion of leave request records
   */
  /**
   * Super Admin Administrative Edit of Leave Request
   * Revalidates dates, leave type, reason, duration, and re-routes approvals if needed.
   * Preserves historical decision records in audit log.
   */
  public static async adminEditLeaveRequest(
    id: number,
    input: {
      startDate?: string;
      endDate?: string;
      reason?: string;
      leaveTypeId?: number;
      dayType?: 'FULL_DAY' | 'HALF_DAY';
      halfDayPeriod?: 'FIRST_HALF' | 'SECOND_HALF' | null;
      adminNotes?: string;
    },
    actor: AuthContext,
    auditMeta?: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveRequestDto> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin can administratively edit leave requests');
    }

    const details = await this.getLeaveRequestById(id, actor);
    if (!details || !details.request) {
      throw new ValidationError(`Leave request #${id} not found`);
    }

    const current = details.request;
    const now = new Date();

    const newStartDate = input.startDate || current.startDate;
    const newEndDate = input.endDate || current.endDate;
    const newLeaveTypeId = input.leaveTypeId !== undefined ? Number(input.leaveTypeId) : current.leaveTypeId;
    const newDayType = input.dayType || current.dayType || 'FULL_DAY';
    const newHalfDayPeriod = newDayType === 'HALF_DAY' ? (input.halfDayPeriod ?? current.halfDayPeriod) : null;
    const newReason = input.reason?.trim() || current.reason;

    // Calculate days
    const workingDaysResult = await WorkingDaysService.calculateWorkingDays(
      newStartDate,
      newEndDate,
      newDayType,
      { employeeId: current.employeeId }
    );
    const totalDaysNum = workingDaysResult.totalDays > 0 ? workingDaysResult.totalDays : Number(current.totalDays);

    // If request was already APPROVED and balancePosted was true, and dates/days changed, adjust balance
    const previousDays = Number(current.totalDays);
    const dayDifference = totalDaysNum - previousDays;
    const reqYear = parseInt(newStartDate.substring(0, 4), 10) || now.getFullYear();

    if ((current.balancePosted || (current.finalStatus === 'APPROVED' && current.isPaid)) && dayDifference !== 0) {
      if (dayDifference > 0) {
        // Need to deduct additional days
        await LeaveService.deductApprovedLeave(
          current.employeeId,
          newLeaveTypeId,
          reqYear,
          dayDifference,
          current.id,
          actor.userId
        );
      } else if (dayDifference < 0) {
        // Need to revert the difference
        await LeaveService.revertApprovedLeave(
          current.employeeId,
          current.leaveTypeId,
          reqYear,
          Math.abs(dayDifference),
          current.id,
          actor.userId
        );
      }
    }

    // Prepare updated fields
    const updatedDto: LeaveRequestDto = {
      ...current,
      startDate: newStartDate,
      endDate: newEndDate,
      leaveTypeId: newLeaveTypeId,
      dayType: newDayType,
      halfDayPeriod: newHalfDayPeriod,
      totalDays: String(totalDaysNum),
      reason: newReason,
      updatedAt: now.toISOString(),
    };

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        await db
          .update(leaveRequests)
          .set({
            startDate: newStartDate,
            endDate: newEndDate,
            leaveTypeId: newLeaveTypeId,
            dayType: newDayType,
            halfDayPeriod: newHalfDayPeriod,
            totalDays: String(totalDaysNum),
            reason: newReason,
            updatedAt: now,
          })
          .where(eq(leaveRequests.id, id));

        await db.insert(leaveRequestEvents).values({
          leaveRequestId: id,
          eventType: 'ADMIN_EDITED',
          action: 'ADMIN_EDITED',
          previousDecision: current.finalStatus || 'PENDING',
          newDecision: updatedDto.finalStatus || 'PENDING',
          actorId: actor.userId || null,
          actorRole: actor.role,
          remarks: input.adminNotes || `Administratively edited by Super Admin ${actor.username}`,
          ipAddress: auditMeta?.ipAddress || null,
          userAgent: auditMeta?.userAgent || null,
        });
      }
    }

    const memIdx = memoryLeaveRequests.findIndex((r) => r.id === id);
    if (memIdx !== -1) {
      memoryLeaveRequests[memIdx] = updatedDto;
    }

    this.addMemoryEvent({
      leaveRequestId: id,
      eventType: 'ADMIN_EDITED',
      action: 'ADMIN_EDITED',
      previousDecision: current.finalStatus || 'PENDING',
      newDecision: updatedDto.finalStatus || 'PENDING',
      actorId: actor.userId || null,
      actorRole: actor.role,
      actorName: actor.username,
      remarks: input.adminNotes || `Administratively edited by Super Admin ${actor.username}`,
      ipAddress: auditMeta?.ipAddress,
      userAgent: auditMeta?.userAgent,
      createdAt: now.toISOString(),
    });

    try {
      const { AuditService } = await import('./auditService.ts');
      await AuditService.logEvent({
        actorId: actor.userId || null,
        actorRole: actor.role,
        action: 'LEAVE_REQUEST_EDITED',
        targetEntity: 'leave_requests',
        targetId: String(id),
        metadata: {
          requestNumber: current.requestNumber,
          employeeId: current.employeeId,
          previous: {
            startDate: current.startDate,
            endDate: current.endDate,
            totalDays: current.totalDays,
            leaveTypeId: current.leaveTypeId,
            reason: current.reason,
          },
          updated: {
            startDate: newStartDate,
            endDate: newEndDate,
            totalDays: String(totalDaysNum),
            leaveTypeId: newLeaveTypeId,
            reason: newReason,
          },
          editedBy: actor.username,
          adminNotes: input.adminNotes || 'Administrative modification by Super Admin',
        },
      });
    } catch {}

    return updatedDto;
  }

  public static async deleteLeaveRequest(
    id: number,
    actor: AuthContext,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin can delete leave requests');
    }

    let reqRecord: LeaveRequestDto | null = null;

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const rows = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id));
        if (rows.length === 0) {
          throw new ValidationError(`Leave request #${id} not found`);
        }
        const row = rows[0];
        reqRecord = this.mapRowToDto(row);

        // If approved and balance was deducted, revert the balance
        if (row.balancePosted || (row.status === 'APPROVED' && row.isPaid !== false)) {
          const reqYear = parseInt(row.startDate.substring(0, 4), 10) || new Date().getFullYear();
          await LeaveService.revertApprovedLeave(
            row.employeeId,
            row.leaveTypeId,
            reqYear,
            row.totalDays,
            row.id,
            actor.userId || null,
            db
          );
        }

        // Delete associated events
        await db.delete(leaveRequestEvents).where(eq(leaveRequestEvents.leaveRequestId, id));
        // Delete leave request
        await db.delete(leaveRequests).where(eq(leaveRequests.id, id));
      }
    }

    const memIdx = memoryLeaveRequests.findIndex((r) => r.id === id);
    if (memIdx !== -1) {
      const memReq = memoryLeaveRequests[memIdx];
      if (!reqRecord) reqRecord = memReq;
      if (memReq.balancePosted || (memReq.status === 'APPROVED' && memReq.isPaid !== false)) {
        const reqYear = parseInt(memReq.startDate.substring(0, 4), 10) || new Date().getFullYear();
        await LeaveService.revertApprovedLeave(
          memReq.employeeId,
          memReq.leaveTypeId,
          reqYear,
          memReq.totalDays,
          memReq.id,
          actor.userId || null
        );
      }
      memoryLeaveRequestEvents = memoryLeaveRequestEvents.filter((e) => e.leaveRequestId !== id);
      memoryLeaveRequests.splice(memIdx, 1);
    } else if (!reqRecord) {
      throw new ValidationError(`Leave request #${id} not found`);
    }

    try {
      const { AuditService } = await import('./auditService.ts');
      await AuditService.logEvent({
        actorId: actor.userId || null,
        actorRole: actor.role,
        action: 'LEAVE_REQUEST_DELETED',
        targetEntity: 'leave_requests',
        targetId: String(id),
        metadata: {
          requestNumber: reqRecord?.requestNumber,
          employeeId: reqRecord?.employeeId,
          employeeCode: reqRecord?.employeeCode,
          employeeName: reqRecord?.employeeName,
          leaveTypeCode: reqRecord?.leaveTypeCode,
          startDate: reqRecord?.startDate,
          endDate: reqRecord?.endDate,
          totalDays: reqRecord?.totalDays,
          deletedBy: actor.username,
          reason: reason || 'Administrative record deletion by Super Admin',
        },
      });
    } catch {}

    return {
      success: true,
      message: `Leave request ${reqRecord?.requestNumber || `#${id}`} deleted successfully.`,
    };
  }
}
