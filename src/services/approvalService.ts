import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb, isDbConfigured } from '../db/index.ts';
import {
  employees,
  leaveBalances,
  leaveRequestEvents,
  leaveRequests,
  leaveTypes,
  users,
} from '../db/schema.ts';
import {
  ApprovalDecision,
  ApprovalDecisionInput,
  AuthContext,
  EmployeeLeaveHistoryDto,
  FinalLeaveStatus,
  LeaveBalanceDto,
  LeaveRequestDto,
  LeaveRequestEventDto,
} from '../types/leave.ts';
import { LeaveRequestService } from './leaveRequestService.ts';
import { LeaveService } from './leaveService.ts';
import { ValidationError } from './validation.ts';
import { NotificationService } from './notificationService.ts';
import { UserService } from './userService.ts';

/**
 * ================================================================
 * Authoritative Final Status Engine
 * ================================================================
 *
 * Core Workflow:
 * EMPLOYEE -> TEAM LEADER -> HR -> TOP MANAGEMENT
 * - Team Leader is Stage 1 operational approver. If Team Leader rejects, final status is REJECTED.
 * - HR is Stage 2 reviewer/recommender.
 * - TOP MANAGEMENT IS THE FINAL AUTHORITY (Stage 3).
 * - Leave balance deduction is posted ONLY when Top Management approves (finalStatus === 'APPROVED').
 */
export function calculateFinalLeaveStatus(
  _hrDecision: ApprovalDecision,
  managementDecision: ApprovalDecision,
  currentFinalStatus?: FinalLeaveStatus,
  teamLeaderDecision?: ApprovalDecision
): FinalLeaveStatus {
  // If the request was previously cancelled, it remains CANCELLED
  if (currentFinalStatus === 'CANCELLED') {
    return 'CANCELLED';
  }

  // If Team Leader rejected at Stage 1, request is REJECTED
  if (teamLeaderDecision === 'REJECTED') {
    return 'REJECTED';
  }

  // Management decision is the sole final authority:
  if (managementDecision === 'APPROVED') {
    return 'APPROVED';
  }
  if (managementDecision === 'REJECTED') {
    return 'REJECTED';
  }

  // When Management decision is PENDING, final status is PENDING regardless of HR status
  return 'PENDING';
}

export class ApprovalService {
  private static async resolveRequestRoutingInfo(req: LeaveRequestDto) {
    const hierarchy = await UserService.getEmployeeRoleAndHierarchy(req.employeeId);
    const operationalRole =
      req.applicantOperationalRole ||
      hierarchy.operationalRole ||
      LeaveRequestService.resolveApplicantOperationalRole(req);
    const isTopMgmt =
      operationalRole === 'TOP_MANAGEMENT' ||
      req.applicantRole === 'TOP_MANAGEMENT' ||
      hierarchy.role === 'TOP_MANAGEMENT';
    return {
      operationalRole,
      isTopMgmt,
      applicantUserId: hierarchy.userId,
      reportingManagerId: req.reportingManagerId ?? hierarchy.reportingManagerId,
      reportingManagerUserId: req.reportingManagerUserId ?? hierarchy.reportingManagerUserId,
    };
  }

  private static assertNotSelfApproval(
    req: LeaveRequestDto,
    applicantUserId: number | null,
    actor: AuthContext
  ): boolean {
    const isSelfByEmp =
      Boolean(actor.employeeId) && Number(req.employeeId) === Number(actor.employeeId);
    const isSelfByUser =
      Boolean(actor.userId) &&
      Boolean(applicantUserId) &&
      Number(actor.userId) === Number(applicantUserId);
    const isOwnRequest = isSelfByEmp || isSelfByUser;

    if (isOwnRequest && actor.role !== 'SUPER_ADMIN') {
      throw new Error(
        'Forbidden: Only Super Admin may approve or reject their own leave request.'
      );
    }
    return isOwnRequest && actor.role === 'SUPER_ADMIN';
  }

  /**
   * TEAM LEADER DECISION SERVICE (STAGE 1)
   * Team Leader reviews leave requests from assigned team members.
   * - If APPROVED: teamLeaderDecision = 'APPROVED', request moves to HR Pending.
   * - If REJECTED: teamLeaderDecision = 'REJECTED', finalStatus = 'REJECTED' (workflow stops, no balance deducted).
   */
  public static async submitTeamLeaderDecision(
    leaveRequestId: number,
    input: ApprovalDecisionInput,
    actor: AuthContext,
    auditMeta?: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveRequestDto> {
    if (!actor || !actor.role) {
      throw new Error('Unauthorized: Authentication required');
    }

    // Stage 1 is owned by the employee's assigned Reporting Person, regardless of their system role.
    // Assignment verification below is the authorization boundary; role names do not determine approver.
    if (!actor.userId && !actor.employeeId) {
      throw new Error('Forbidden: An authenticated reporting-person identity is required');
    }

    const decision = input.decision;
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      throw new ValidationError("Invalid Team Leader decision. Must be 'APPROVED' or 'REJECTED'");
    }

    const comments = (input.comments || input.remarks || '').trim();
    if (decision === 'REJECTED' && comments.length === 0) {
      throw new ValidationError('Remarks are required when rejecting a leave request');
    }

    const existing = await LeaveRequestService.getLeaveRequestById(leaveRequestId, actor);
    if (!existing || !existing.request) {
      throw new ValidationError(`Leave request with ID ${leaveRequestId} not found`);
    }

    const req = existing.request;
    const routingInfo = await this.resolveRequestRoutingInfo(req);

    this.assertNotSelfApproval(req, routingInfo.applicantUserId, actor);

    if (routingInfo.isTopMgmt) {
      throw new Error(
        'Forbidden: Team Leader intervention is not permitted for Top Management leave requests'
      );
    }

    if (req.teamLeaderDecision === 'NOT_REQUIRED') {
      throw new Error(
        'Forbidden: Team Leader approval is not required for this leave request'
      );
    }

    // Enforce the employee's actual Reporting Person assignment (not a team-leader schedule/role).
    if (actor.role !== 'SUPER_ADMIN') {
      const employee = await UserService.getEmployeeById(req.employeeId);
      const reportingManagerId = req.reportingManagerId ?? employee?.reportingManagerId ?? null;
      const reportingManager = reportingManagerId
        ? await UserService.getEmployeeById(reportingManagerId)
        : null;
      const reportingManagerUserId =
        req.reportingManagerUserId ?? reportingManager?.userId ?? null;
      const matchesEmployee =
        Boolean(actor.employeeId) &&
        Boolean(reportingManagerId) &&
        Number(actor.employeeId) === Number(reportingManagerId);
      const matchesUser =
        Boolean(actor.userId) &&
        Boolean(reportingManagerUserId) &&
        Number(actor.userId) === Number(reportingManagerUserId);
      if (!matchesEmployee && !matchesUser) {
        throw new Error('Forbidden: Only the employee\'s assigned Reporting Person can approve or reject this request');
      }
    }

    if (req.finalStatus === 'CANCELLED' || req.status === 'CANCELLED') {
      throw new ValidationError('Cannot review or decide on a cancelled leave request');
    }

    const currentTlDecision = req.teamLeaderDecision || 'PENDING';
    if ((req as any)._processingTl || currentTlDecision !== 'PENDING') {
      throw new ValidationError(
        `Team Leader decision has already been recorded as '${currentTlDecision}' for this leave request`
      );
    }
    (req as any)._processingTl = true;

    const newFinalStatus: FinalLeaveStatus = decision === 'REJECTED' ? 'REJECTED' : req.finalStatus;
    const now = new Date();

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        return await db.transaction(async (tx) => {
          const updated = await tx
            .update(leaveRequests)
            .set({
              teamLeaderDecision: decision,
              teamLeaderDecidedBy: actor.userId || null,
              teamLeaderDecidedAt: now,
              teamLeaderRemarks: comments || null,
              finalStatus: newFinalStatus,
              status: newFinalStatus,
              updatedAt: now,
            })
            .where(
              and(
                eq(leaveRequests.id, leaveRequestId),
                eq(leaveRequests.teamLeaderDecision, 'PENDING'),
                sql`${leaveRequests.finalStatus} != 'CANCELLED'`
              )
            )
            .returning();

          if (updated.length === 0) {
            throw new ValidationError('Conflict: Team Leader decision was already processed concurrently');
          }

          const eventType = decision === 'APPROVED' ? 'TEAM_LEADER_APPROVED' : 'TEAM_LEADER_REJECTED';
          await tx.insert(leaveRequestEvents).values({
            leaveRequestId,
            eventType,
            action: eventType,
            previousDecision: 'PENDING',
            newDecision: decision,
            actorId: actor.userId || null,
            actorRole: actor.role,
            remarks: comments || `Team Leader ${decision.toLowerCase()} decision`,
            ipAddress: auditMeta?.ipAddress || null,
            userAgent: auditMeta?.userAgent || null,
          });

          if (decision === 'REJECTED') {
            await tx.insert(leaveRequestEvents).values({
              leaveRequestId,
              eventType: 'FINAL_STATUS_CHANGED',
              action: 'FINAL_STATUS_CHANGED',
              previousDecision: 'PENDING',
              newDecision: 'REJECTED',
              actorId: actor.userId || null,
              actorRole: actor.role,
              remarks: 'Leave request rejected by Team Leader at Stage 1',
              ipAddress: auditMeta?.ipAddress || null,
              userAgent: auditMeta?.userAgent || null,
            });
          }

          const tlResult = {
            ...updated[0],
            employeeName: req.employeeName,
            employeeCode: req.employeeCode,
            leaveTypeCode: req.leaveTypeCode,
            leaveTypeName: req.leaveTypeName,
            teamLeaderDecidedByName: actor.username,
          } as LeaveRequestDto;

          NotificationService.notifyTeamLeaderDecided(
            {
              id: tlResult.id,
              requestNumber: tlResult.requestNumber,
              employeeId: tlResult.employeeId,
              employeeName: tlResult.employeeName,
              totalDays: tlResult.totalDays,
              hrDecision: req.hrDecision,
            },
            decision,
            comments,
            actor.username
          ).catch((e) => console.warn('Team Leader decision notification error:', e));

          return tlResult;
        });
      }
    }

    // In-memory fallback
    req.teamLeaderDecision = decision;
    req.teamLeaderDecidedBy = actor.userId || null;
    req.teamLeaderDecidedByName = actor.username || 'Team Leader';
    req.teamLeaderDecidedAt = now.toISOString();
    req.teamLeaderRemarks = comments || null;
    req.finalStatus = newFinalStatus;
    req.status = newFinalStatus;
    req.approvalStageLabel = LeaveRequestService.computeApprovalStageLabel(req);
    req.updatedAt = now.toISOString();
    (req as any)._processingTl = false;

    const eventType = decision === 'APPROVED' ? 'TEAM_LEADER_APPROVED' : 'TEAM_LEADER_REJECTED';
    LeaveRequestService.addMemoryEvent({
      leaveRequestId,
      eventType,
      action: eventType,
      previousDecision: 'PENDING',
      newDecision: decision,
      actorId: actor.userId || null,
      actorRole: actor.role,
      actorName: actor.username,
      remarks: comments || `Team Leader ${decision.toLowerCase()} decision`,
      ipAddress: auditMeta?.ipAddress,
      userAgent: auditMeta?.userAgent,
      createdAt: now.toISOString(),
    });

    if (decision === 'REJECTED') {
      LeaveRequestService.addMemoryEvent({
        leaveRequestId,
        eventType: 'FINAL_STATUS_CHANGED',
        action: 'FINAL_STATUS_CHANGED',
        previousDecision: 'PENDING',
        newDecision: 'REJECTED',
        actorId: actor.userId || null,
        actorRole: actor.role,
        actorName: actor.username,
        remarks: 'Leave request rejected by Team Leader at Stage 1',
        ipAddress: auditMeta?.ipAddress,
        userAgent: auditMeta?.userAgent,
        createdAt: now.toISOString(),
      });
    }

    NotificationService.notifyTeamLeaderDecided(
      {
        id: req.id,
        requestNumber: req.requestNumber,
        employeeId: req.employeeId,
        employeeName: req.employeeName,
        totalDays: req.totalDays,
        hrDecision: req.hrDecision,
      },
      decision,
      comments,
      actor.username
    ).catch(() => {});

    try {
      const { AuditService } = await import('./auditService.ts');
      await AuditService.logEvent({
        actorId: actor.userId || actor.employeeId || null,
        actorRole: actor.role,
        action: eventType,
        targetEntity: 'leave_requests',
        targetId: String(req.id),
        metadata: {
          requestNumber: req.requestNumber,
          employeeId: req.employeeId,
          employeeCode: req.employeeCode,
          employeeName: req.employeeName,
          departmentId: req.departmentId,
          departmentCode: req.departmentCode,
          departmentName: req.departmentName,
          leaveTypeCode: req.leaveTypeCode,
          leaveTypeName: req.leaveTypeName,
          startDate: req.startDate,
          endDate: req.endDate,
          totalDays: req.totalDays,
          stage: 'TEAM_LEADER',
          previousDecision: 'PENDING',
          newDecision: decision,
          previousStatus: 'PENDING',
          newStatus: req.finalStatus,
          reason: comments || `Team Leader ${decision.toLowerCase()} decision`,
          remarks: comments || null,
          approvalStageLabel: req.approvalStageLabel,
          nextStep:
            decision === 'APPROVED'
              ? req.approvalStageLabel || (req.hrDecision !== 'NOT_REQUIRED' ? 'Forwarded to HR Review Stage' : 'Forwarded to Top Management Final Decision Stage')
              : 'Rejected at Stage 1 (Team Leader) — Final Status: REJECTED',
        },
        ipAddress: auditMeta?.ipAddress,
        userAgent: auditMeta?.userAgent,
      });
    } catch {}

    return req;
  }

  /**
   * Retrieves leave requests for Team Leader dashboard (Stage 1)
   */
  public static async getRequestsForTeamLeader(
    filter: { status?: string; search?: string } = {},
    actor: AuthContext
  ): Promise<LeaveRequestDto[]> {
    if (!actor || !actor.role) {
      throw new Error('Unauthorized: Authentication required');
    }

    const requests = await LeaveRequestService.getAllLeaveRequests();
    const allEmployees = await UserService.getAllEmployees();
    const empMap = new Map(allEmployees.map((e) => [e.id, e]));

    const filtered: LeaveRequestDto[] = [];
    for (const r of requests) {
      const routing = await this.resolveRequestRoutingInfo(r);
      // Top Management applicants bypass the reporting-person stage as before.
      if (routing.isTopMgmt || r.teamLeaderDecision === 'NOT_REQUIRED') {
        continue;
      }

      const isSelfRequest =
        (actor.employeeId && Number(r.employeeId) === Number(actor.employeeId)) ||
        (actor.userId &&
          routing.applicantUserId &&
          Number(actor.userId) === Number(routing.applicantUserId));
      if (isSelfRequest) continue;

      // Every authenticated user sees only requests for employees who report directly to them.
      // Super Admin retains the existing global oversight access.
      if (actor.role !== 'SUPER_ADMIN') {
        const employee = empMap.get(r.employeeId);
        const reportingManagerId = r.reportingManagerId ?? employee?.reportingManagerId ?? null;
        const reportingManager = reportingManagerId ? empMap.get(Number(reportingManagerId)) : null;
        const reportingManagerUserId = r.reportingManagerUserId ?? reportingManager?.userId ?? null;
        const matchesEmployee =
          Boolean(actor.employeeId) &&
          Boolean(reportingManagerId) &&
          Number(actor.employeeId) === Number(reportingManagerId);
        const matchesUser =
          Boolean(actor.userId) &&
          Boolean(reportingManagerUserId) &&
          Number(actor.userId) === Number(reportingManagerUserId);
        if (!matchesEmployee && !matchesUser) continue;
      }

      const tlDecision = r.teamLeaderDecision || 'PENDING';
      if (filter.status === 'PENDING' && (tlDecision !== 'PENDING' || r.finalStatus === 'CANCELLED')) continue;
      if ((filter.status === 'REVIEWED' || filter.status === 'DECIDED') && tlDecision === 'PENDING') continue;
      if (
        filter.status &&
        filter.status !== 'ALL' &&
        filter.status !== 'PENDING' &&
        filter.status !== 'REVIEWED' &&
        filter.status !== 'DECIDED'
      ) {
        if (tlDecision !== filter.status && r.finalStatus !== filter.status) continue;
      }

      if (filter.search) {
        const s = filter.search.toLowerCase();
        const match =
          r.requestNumber.toLowerCase().includes(s) ||
          r.employeeName?.toLowerCase().includes(s) ||
          r.leaveTypeName?.toLowerCase().includes(s) ||
          r.reason.toLowerCase().includes(s);
        if (!match) continue;
      }
      filtered.push(r);
    }
    return filtered;
  }
  /**
   * HR DECISION SERVICE
   * Records HR review recommendation (APPROVE or REJECT) with comments.
   * Does NOT finalize leave status unless Management has already decided.
   */
  public static async submitHrDecision(
    leaveRequestId: number,
    input: ApprovalDecisionInput,
    actor: AuthContext,
    auditMeta?: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveRequestDto> {
    // 1. Authenticate actor
    if (!actor || !actor.role) {
      throw new Error('Unauthorized: Authentication required');
    }

    // 2. Strict Role Authorization
    if (actor.role === 'EMPLOYEE') {
      throw new Error('Forbidden: Employees cannot approve or review leave requests');
    }
    if (actor.role === 'TEAM_LEADER') {
      throw new Error('Forbidden: Team Leaders cannot submit HR review decisions');
    }
    if (actor.role === 'TOP_MANAGEMENT') {
      throw new Error('Forbidden: Top Management cannot submit HR review decisions');
    }
    if (actor.role !== 'HR' && actor.role !== 'SUPER_ADMIN') {
      throw new Error(`Forbidden: Access denied. Required role: HR or SUPER_ADMIN. Active role: ${actor.role}`);
    }

    if (!(await UserService.hasPermission(actor, 'LEAVE_HR_APPROVE'))) {
      throw new Error('Forbidden: Role does not have LEAVE_HR_APPROVE permission');
    }

    // Validate decision
    const decision = input.decision;
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      throw new ValidationError("Invalid HR decision. Must be 'APPROVED' or 'REJECTED'");
    }

    const comments = (input.comments || input.remarks || '').trim();
    if (decision === 'REJECTED' && comments.length === 0) {
      throw new ValidationError('A comment is required when rejecting an HR review');
    }

    // 3. Verify request exists
    const existing = await LeaveRequestService.getLeaveRequestById(leaveRequestId, actor);
    if (!existing || !existing.request) {
      throw new ValidationError(`Leave request with ID ${leaveRequestId} not found`);
    }

    const req = existing.request;
    const routingInfo = await this.resolveRequestRoutingInfo(req);

    this.assertNotSelfApproval(req, routingInfo.applicantUserId, actor);

    if (routingInfo.isTopMgmt) {
      throw new Error(
        'Forbidden: HR intervention is not permitted for Top Management leave requests'
      );
    }

    if (req.hrDecision === 'NOT_REQUIRED') {
      throw new Error('Forbidden: HR approval is not required for this leave request');
    }

    // 4. Verify request is eligible for HR review
    if (req.finalStatus === 'CANCELLED' || req.status === 'CANCELLED') {
      throw new ValidationError('Cannot review or decide on a cancelled leave request');
    }
    if (req.teamLeaderDecision === 'REJECTED') {
      throw new ValidationError(
        'Forbidden: HR cannot override, approve, or reject a leave request that was already rejected by the Team Leader'
      );
    }
    const tlState = req.teamLeaderDecision || 'PENDING';
    if (tlState !== 'APPROVED' && tlState !== 'NOT_REQUIRED') {
      throw new ValidationError(
        'Forbidden: HR can only review and action leave requests that have passed Team Leader approval'
      );
    }
    if (req.finalStatus !== 'PENDING') {
      throw new ValidationError(
        'Forbidden: HR cannot review a leave request that has already been finalized by Top Management'
      );
    }

    // State Protection: Cannot re-submit HR decision
    if ((req as any)._processingHr || req.hrDecision !== 'PENDING') {
      throw new ValidationError(
        `HR decision has already been recorded as '${req.hrDecision}' for this leave request`
      );
    }
    (req as any)._processingHr = true;

    // 5. Calculate new Final Status using authoritative function
    const newFinalStatus = calculateFinalLeaveStatus(
      decision,
      req.managementDecision,
      req.finalStatus,
      req.teamLeaderDecision
    );
    const now = new Date();

    // 6. Persist to Database or Memory store transactionally
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        return await db.transaction(async (tx) => {
          // Concurrency protection: atomic update checking hr_decision is still PENDING, teamLeaderDecision is APPROVED, and not cancelled
          const updated = await tx
            .update(leaveRequests)
            .set({
              hrDecision: decision,
              hrDecidedBy: actor.userId || null,
              hrDecidedAt: now,
              hrRemarks: comments || null,
              updatedAt: now,
            })
            .where(
              and(
                eq(leaveRequests.id, leaveRequestId),
                sql`${leaveRequests.teamLeaderDecision} IN ('APPROVED', 'NOT_REQUIRED')`,
                eq(leaveRequests.hrDecision, 'PENDING'),
                sql`${leaveRequests.finalStatus} != 'CANCELLED'`
              )
            )
            .returning();

          if (updated.length === 0) {
            throw new ValidationError('Conflict: HR decision was already processed concurrently');
          }

          // Insert immutable approval event
          const eventType = decision === 'APPROVED' ? 'HR_APPROVED' : 'HR_REJECTED';
          await tx.insert(leaveRequestEvents).values({
            leaveRequestId,
            eventType,
            action: eventType,
            previousDecision: 'PENDING',
            newDecision: decision,
            actorId: actor.userId || null,
            actorRole: actor.role,
            remarks: comments || `HR ${decision.toLowerCase()} recommendation`,
            ipAddress: auditMeta?.ipAddress || null,
            userAgent: auditMeta?.userAgent || null,
          });

          const hrResult = LeaveRequestService.withStageLabel({
            ...updated[0],
            employeeName: req.employeeName,
            employeeCode: req.employeeCode,
            leaveTypeCode: req.leaveTypeCode,
            leaveTypeName: req.leaveTypeName,
            hrDecidedByName: actor.username,
          } as LeaveRequestDto);

          NotificationService.notifyHrDecided(
            {
              id: hrResult.id,
              requestNumber: hrResult.requestNumber,
              employeeId: hrResult.employeeId,
              employeeName: hrResult.employeeName,
            },
            decision,
            comments,
            actor.username
          ).catch((e) => console.warn('HR decision notification error:', e));

          return hrResult;
        });
      }
    }

    // In-memory fallback
    req.hrDecision = decision;
    req.hrDecidedBy = actor.userId || null;
    req.hrDecidedByName = actor.username || 'HR Reviewer';
    req.hrDecidedAt = now.toISOString();
    req.hrRemarks = comments || null;
    req.finalStatus = newFinalStatus;
    req.status = newFinalStatus;
    req.approvalStageLabel = LeaveRequestService.computeApprovalStageLabel(req);
    req.updatedAt = now.toISOString();
    (req as any)._processingHr = false;

    const eventType = decision === 'APPROVED' ? 'HR_APPROVED' : 'HR_REJECTED';
    LeaveRequestService.addMemoryEvent({
      leaveRequestId,
      eventType,
      action: eventType,
      previousDecision: 'PENDING',
      newDecision: decision,
      actorId: actor.userId || null,
      actorRole: actor.role,
      actorName: actor.username,
      remarks: comments || `HR ${decision.toLowerCase()} recommendation`,
      ipAddress: auditMeta?.ipAddress,
      userAgent: auditMeta?.userAgent,
      createdAt: now.toISOString(),
    });

    NotificationService.notifyHrDecided(
      {
        id: req.id,
        requestNumber: req.requestNumber,
        employeeId: req.employeeId,
        employeeName: req.employeeName,
      },
      decision,
      comments,
      actor.username
    ).catch(() => {});

    try {
      const { AuditService } = await import('./auditService.ts');
      await AuditService.logEvent({
        actorId: actor.userId || actor.employeeId || null,
        actorRole: actor.role,
        action: eventType,
        targetEntity: 'leave_requests',
        targetId: String(req.id),
        metadata: {
          requestNumber: req.requestNumber,
          employeeId: req.employeeId,
          employeeCode: req.employeeCode,
          employeeName: req.employeeName,
          departmentId: req.departmentId,
          departmentCode: req.departmentCode,
          departmentName: req.departmentName,
          leaveTypeCode: req.leaveTypeCode,
          leaveTypeName: req.leaveTypeName,
          startDate: req.startDate,
          endDate: req.endDate,
          totalDays: req.totalDays,
          stage: 'HR',
          previousDecision: 'PENDING',
          newDecision: decision,
          previousStatus: 'PENDING',
          newStatus: req.finalStatus,
          reason: comments || `HR ${decision.toLowerCase()} recommendation`,
          remarks: comments || null,
          approvalStageLabel: req.approvalStageLabel,
          nextStep:
            req.approvalStageLabel ||
            `HR Recommendation (${decision}) recorded — Awaiting Top Management Final Decision`,
        },
        ipAddress: auditMeta?.ipAddress,
        userAgent: auditMeta?.userAgent,
      });
    } catch {}

    return req;
  }

  /**
   * TOP MANAGEMENT DECISION SERVICE
   * Top Management is the FINAL authority.
   * Does NOT have to wait for HR.
   * If Management approves, final status is APPROVED and leave is posted to balance.
   * If Management rejects, final status is REJECTED.
   */
  public static async submitManagementDecision(
    leaveRequestId: number,
    input: ApprovalDecisionInput,
    actor: AuthContext,
    auditMeta?: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveRequestDto> {
    // 1. Authenticate actor
    if (!actor || !actor.role) {
      throw new Error('Unauthorized: Authentication required');
    }

    // 2. Strict Role Authorization
    if (actor.role === 'EMPLOYEE') {
      throw new Error('Forbidden: Employees cannot approve or reject leave requests');
    }
    if (actor.role === 'TEAM_LEADER') {
      throw new Error('Forbidden: Team Leaders cannot submit Top Management final approval decisions');
    }
    if (actor.role === 'HR') {
      throw new Error('Forbidden: HR cannot submit Top Management final approval decisions');
    }
    if (actor.role !== 'TOP_MANAGEMENT' && actor.role !== 'SUPER_ADMIN') {
      throw new Error(
        `Forbidden: Access denied. Required role: TOP_MANAGEMENT or SUPER_ADMIN. Active role: ${actor.role}`
      );
    }

    if (!(await UserService.hasPermission(actor, 'LEAVE_FINAL_APPROVE'))) {
      throw new Error('Forbidden: Role does not have LEAVE_FINAL_APPROVE permission');
    }

    // Validate decision
    const decision = input.decision;
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      throw new ValidationError("Invalid Management decision. Must be 'APPROVED' or 'REJECTED'");
    }

    const comments = (input.comments || input.remarks || '').trim();
    if (decision === 'REJECTED' && comments.length === 0) {
      throw new ValidationError('A comment is required when rejecting a leave request');
    }

    // 3. Verify request exists
    const existing = await LeaveRequestService.getLeaveRequestById(leaveRequestId, actor);
    if (!existing || !existing.request) {
      throw new ValidationError(`Leave request with ID ${leaveRequestId} not found`);
    }

    const req = existing.request;
    const routingInfo = await this.resolveRequestRoutingInfo(req);

    // Only Super Admin may self-approve; that self-approval is treated as a direct final decision.
    const isSuperAdminSelfApproval = this.assertNotSelfApproval(req, routingInfo.applicantUserId, actor);

    // If applicant is Top Management, only their assigned reporting person or SUPER_ADMIN may decide
    if (routingInfo.isTopMgmt && actor.role !== 'SUPER_ADMIN') {
      if (routingInfo.reportingManagerId || routingInfo.reportingManagerUserId) {
        const matchesReportingEmp =
          Boolean(actor.employeeId) &&
          Boolean(routingInfo.reportingManagerId) &&
          Number(actor.employeeId) === Number(routingInfo.reportingManagerId);
        const matchesReportingUser =
          Boolean(actor.userId) &&
          Boolean(routingInfo.reportingManagerUserId) &&
          Number(actor.userId) === Number(routingInfo.reportingManagerUserId);

        if (!matchesReportingEmp && !matchesReportingUser) {
          throw new Error(
            'Forbidden: Only the assigned reporting manager or Super Admin can approve or reject this Top Management leave request'
          );
        }
      }
    }

    // 4. Verify request is eligible for Management decision
    if (req.finalStatus === 'CANCELLED' || req.status === 'CANCELLED') {
      throw new ValidationError('Cannot review or decide on a cancelled leave request');
    }
    if (!isSuperAdminSelfApproval && req.teamLeaderDecision === 'REJECTED') {
      throw new ValidationError('Cannot decide on a leave request that was already rejected by the Team Leader');
    }
    if (!isSuperAdminSelfApproval && (req.teamLeaderDecision || 'PENDING') === 'PENDING') {
      throw new ValidationError(
        'Forbidden: Top Management cannot approve or reject a leave request while Team Leader approval is still pending'
      );
    }
    const hrApprovalRequired = req.hrDecision !== 'NOT_REQUIRED' && req.hrDecision !== 'SKIPPED';
    if (!isSuperAdminSelfApproval && hrApprovalRequired && (req.hrDecision || 'PENDING') === 'PENDING') {
      throw new ValidationError(
        'Forbidden: Top Management cannot approve or reject a leave request while HR review is still pending'
      );
    }

    // State Protection: Cannot re-submit Management decision
    if ((req as any)._processingManagement || req.managementDecision !== 'PENDING') {
      throw new ValidationError(
        `Management decision has already been recorded as '${req.managementDecision}' for this leave request`
      );
    }
    (req as any)._processingManagement = true;

    // 5. Calculate Final Status (Authoritative)
    const newFinalStatus = calculateFinalLeaveStatus(req.hrDecision, decision, req.finalStatus);
    const now = new Date();
    const shouldPostBalance = newFinalStatus === 'APPROVED' && !req.balancePosted && req.isPaid !== false;

    // 6. Persist to Database or Memory store transactionally
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        return await db.transaction(async (tx) => {
          // Concurrency protection: atomic update checking management_decision is still PENDING and not cancelled
          const updated = await tx
            .update(leaveRequests)
            .set({
              managementDecision: decision,
              managementDecidedBy: actor.userId || null,
              managementDecidedAt: now,
              managementRemarks: comments || null,
              finalStatus: newFinalStatus,
              status: newFinalStatus,
              balancePosted: shouldPostBalance ? true : req.balancePosted,
              updatedAt: now,
            })
            .where(
              and(
                eq(leaveRequests.id, leaveRequestId),
                eq(leaveRequests.managementDecision, 'PENDING'),
                sql`${leaveRequests.finalStatus} != 'CANCELLED'`
              )
            )
            .returning();

          if (updated.length === 0) {
            throw new ValidationError('Conflict: Management decision was already processed concurrently');
          }

          // Balance integration: post leave days if approved atomically within the same transaction
          if (shouldPostBalance) {
            const reqYear = parseInt(String(req.startDate).split('-')[0], 10) || 2026;
            await LeaveService.deductApprovedLeave(
              req.employeeId,
              req.leaveTypeId,
              reqYear,
              req.totalDays,
              leaveRequestId,
              actor.userId,
              tx
            );
          }

          // Insert immutable approval event
          const eventType = decision === 'APPROVED' ? 'MANAGEMENT_APPROVED' : 'MANAGEMENT_REJECTED';
          await tx.insert(leaveRequestEvents).values({
            leaveRequestId,
            eventType,
            action: eventType,
            previousDecision: 'PENDING',
            newDecision: decision,
            actorId: actor.userId || null,
            actorRole: actor.role,
            remarks: comments || `Management final decision: ${decision}`,
            ipAddress: auditMeta?.ipAddress || null,
            userAgent: auditMeta?.userAgent || null,
          });

          // Insert final status changed event
          await tx.insert(leaveRequestEvents).values({
            leaveRequestId,
            eventType: 'FINAL_STATUS_CHANGED',
            action: 'FINAL_STATUS_CHANGED',
            previousDecision: 'PENDING',
            newDecision: newFinalStatus,
            actorId: actor.userId || null,
            actorRole: actor.role,
            remarks: `Final leave status resolved to ${newFinalStatus} by Top Management`,
            ipAddress: auditMeta?.ipAddress || null,
            userAgent: auditMeta?.userAgent || null,
          });

          const mgmtResult = {
            ...updated[0],
            employeeName: req.employeeName,
            employeeCode: req.employeeCode,
            leaveTypeCode: req.leaveTypeCode,
            leaveTypeName: req.leaveTypeName,
            managementDecidedByName: actor.username,
          } as LeaveRequestDto;

          NotificationService.notifyManagementDecided(
            {
              id: mgmtResult.id,
              requestNumber: mgmtResult.requestNumber,
              employeeId: mgmtResult.employeeId,
              employeeName: mgmtResult.employeeName,
              totalDays: mgmtResult.totalDays,
            },
            decision,
            newFinalStatus,
            comments,
            actor.username
          ).catch((e) => console.warn('Management decision notification error:', e));

          return mgmtResult;
        });
      }
    }

    // In-memory fallback
    req.managementDecision = decision;
    req.managementDecidedBy = actor.userId || null;
    req.managementDecidedByName = actor.username || 'Top Management';
    req.managementDecidedAt = now.toISOString();
    req.managementRemarks = comments || null;
    req.finalStatus = newFinalStatus;
    req.status = newFinalStatus;
    req.approvalStageLabel = LeaveRequestService.computeApprovalStageLabel(req);
    req.updatedAt = now.toISOString();
    (req as any)._processingManagement = false;

    if (shouldPostBalance) {
      req.balancePosted = true;
      const reqYear = parseInt(String(req.startDate).split('-')[0], 10) || 2026;
      await LeaveService.deductApprovedLeave(
        req.employeeId,
        req.leaveTypeId,
        reqYear,
        req.totalDays,
        leaveRequestId,
        actor.userId
      );
    }

    const eventType = decision === 'APPROVED' ? 'MANAGEMENT_APPROVED' : 'MANAGEMENT_REJECTED';
    LeaveRequestService.addMemoryEvent({
      leaveRequestId,
      eventType,
      action: eventType,
      previousDecision: 'PENDING',
      newDecision: decision,
      actorId: actor.userId || null,
      actorRole: actor.role,
      actorName: actor.username,
      remarks: comments || `Management final decision: ${decision}`,
      ipAddress: auditMeta?.ipAddress,
      userAgent: auditMeta?.userAgent,
      createdAt: now.toISOString(),
    });

    LeaveRequestService.addMemoryEvent({
      leaveRequestId,
      eventType: 'FINAL_STATUS_CHANGED',
      action: 'FINAL_STATUS_CHANGED',
      previousDecision: 'PENDING',
      newDecision: newFinalStatus,
      actorId: actor.userId || null,
      actorRole: actor.role,
      actorName: actor.username,
      remarks: `Final leave status resolved to ${newFinalStatus} by Top Management`,
      ipAddress: auditMeta?.ipAddress,
      userAgent: auditMeta?.userAgent,
      createdAt: now.toISOString(),
    });

    NotificationService.notifyManagementDecided(
      {
        id: req.id,
        requestNumber: req.requestNumber,
        employeeId: req.employeeId,
        employeeName: req.employeeName,
        totalDays: req.totalDays,
      },
      decision,
      newFinalStatus,
      comments,
      actor.username
    ).catch(() => {});

    try {
      const { AuditService } = await import('./auditService.ts');
      await AuditService.logEvent({
        actorId: actor.userId || actor.employeeId || null,
        actorRole: actor.role,
        action: eventType,
        targetEntity: 'leave_requests',
        targetId: String(req.id),
        metadata: {
          requestNumber: req.requestNumber,
          employeeId: req.employeeId,
          employeeCode: req.employeeCode,
          employeeName: req.employeeName,
          departmentId: req.departmentId,
          departmentCode: req.departmentCode,
          departmentName: req.departmentName,
          leaveTypeCode: req.leaveTypeCode,
          leaveTypeName: req.leaveTypeName,
          startDate: req.startDate,
          endDate: req.endDate,
          totalDays: req.totalDays,
          stage: 'TOP_MANAGEMENT',
          previousDecision: 'PENDING',
          newDecision: decision,
          previousStatus: 'PENDING',
          newStatus: newFinalStatus,
          finalStatus: newFinalStatus,
          balancePosted: req.balancePosted,
          reason: comments || `Management final decision: ${decision}`,
          remarks: comments || null,
          approvalStageLabel: req.approvalStageLabel,
          nextStep:
            newFinalStatus === 'APPROVED'
              ? `Final Approved — ${req.totalDays} day(s) deducted from ${req.leaveTypeCode || 'leave'} balance`
              : 'Final Rejected by Top Management — Leave request closed',
        },
        ipAddress: auditMeta?.ipAddress,
        userAgent: auditMeta?.userAgent,
      });
    } catch {}

    return req;
  }

  /**
   * Convenience alias for Team Leader decision processing
   */
  public static async processTeamLeaderDecision(
    leaveRequestId: number,
    decision: 'APPROVED' | 'REJECTED',
    comments: string,
    actor: AuthContext,
    auditMeta?: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveRequestDto> {
    return this.submitTeamLeaderDecision(leaveRequestId, { decision, comments }, actor, auditMeta);
  }

  /**
   * Convenience alias for HR review processing
   */
  public static async processHrReview(
    leaveRequestId: number,
    decision: 'APPROVED' | 'REJECTED',
    comments: string,
    actor: AuthContext,
    auditMeta?: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveRequestDto> {
    return this.submitHrDecision(leaveRequestId, { decision, comments }, actor, auditMeta);
  }

  /**
   * Convenience alias for Top Management decision processing
   */
  public static async processTopManagementDecision(
    leaveRequestId: number,
    decision: 'APPROVED' | 'REJECTED',
    comments: string,
    actor: AuthContext,
    auditMeta?: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveRequestDto> {
    return this.submitManagementDecision(leaveRequestId, { decision, comments }, actor, auditMeta);
  }

  /**
   * Convenience alias to retrieve pending requests for the given actor role
   */
  public static async getPendingRequestsForActor(actor: AuthContext): Promise<LeaveRequestDto[]> {
    if (actor.role === 'HR') {
      return this.getRequestsForHr({ status: 'PENDING' }, actor);
    }
    if (actor.role === 'TOP_MANAGEMENT' || actor.role === 'SUPER_ADMIN') {
      return this.getRequestsForManagement({ status: 'PENDING' }, actor);
    }
    if (actor.role === 'TEAM_LEADER') {
      return this.getRequestsForTeamLeader({ status: 'PENDING' }, actor);
    }
    return [];
  }

  /**
   * Aggregates employee leave history for HR and Management approval reviews
   */
  public static async getEmployeeApprovalHistory(
    employeeId: number | string,
    actor: AuthContext
  ): Promise<EmployeeLeaveHistoryDto> {
    if (!actor) {
      throw new Error('Unauthorized: Authentication required');
    }

    const resolvedEmp = UserService.resolveEmployeeRecordSync(employeeId);
    const targetEmpId = resolvedEmp ? resolvedEmp.id : Number(employeeId);

    // Allow employee to view their own, or approvers (HR, TOP_MANAGEMENT, SUPER_ADMIN)
    if (actor.role === 'EMPLOYEE') {
      const actorEmp = UserService.resolveEmployeeRecordSync(
        actor.employeeCode ?? actor.employeeId ?? actor.userId ?? 101
      );
      const empId = actorEmp ? actorEmp.id : (actor.employeeId || 101);
      if (empId !== targetEmpId) {
        throw new Error('Forbidden: Employees cannot view other employees’ leave history');
      }
    }

    const empRecord = resolvedEmp || (await UserService.getEmployeeById(targetEmpId));
    const allRequests = await LeaveRequestService.getEmployeeRequests(targetEmpId);
    const balances = await LeaveService.getLeaveBalances({ employeeId: targetEmpId }, actor);

    let approvedRequests = 0;
    let rejectedRequests = 0;
    let cancelledRequests = 0;
    let pendingRequests = 0;
    let lateRequests = 0;
    let postStartRequests = 0;
    let emergencyRequests = 0;

    for (const r of allRequests) {
      if (r.finalStatus === 'APPROVED' || r.status === 'APPROVED') approvedRequests++;
      else if (r.finalStatus === 'REJECTED' || r.status === 'REJECTED') rejectedRequests++;
      else if (r.finalStatus === 'CANCELLED' || r.status === 'CANCELLED') cancelledRequests++;
      else pendingRequests++;

      if (r.requestClassification === 'LATE_LEAVE_REQUEST') lateRequests++;
      if (r.requestClassification === 'POST_START_LEAVE_REQUEST') postStartRequests++;
      if (
        r.reasonCategory === 'MEDICAL_EMERGENCY' ||
        r.reasonCategory === 'FAMILY_EMERGENCY' ||
        r.reasonCategory === 'ACCIDENT_OR_TRAVEL_EMERGENCY'
      ) {
        emergencyRequests++;
      }
    }

    return {
      employeeId: targetEmpId,
      employeeName: empRecord?.employeeName || allRequests[0]?.employeeName || `Employee ${targetEmpId}`,
      employeeCode: empRecord?.employeeCode || allRequests[0]?.employeeCode || String(employeeId),
      departmentId: empRecord?.departmentId ?? allRequests[0]?.departmentId ?? null,
      departmentCode: empRecord?.departmentCode ?? allRequests[0]?.departmentCode ?? null,
      departmentName: empRecord?.departmentName ?? allRequests[0]?.departmentName ?? undefined,
      designationTitle: empRecord?.designationName ?? undefined,
      totalRequests: allRequests.length,
      approvedRequests,
      rejectedRequests,
      cancelledRequests,
      pendingRequests,
      lateRequests,
      postStartRequests,
      emergencyRequests,
      balances,
      recentRequests: allRequests.slice(0, 10),
    };
  }

  /**
   * Retrieves leave requests for HR dashboard
   */
  public static async getRequestsForHr(
    filter: { status?: string; search?: string } = {},
    actor: AuthContext
  ): Promise<LeaveRequestDto[]> {
    if (actor.role !== 'HR' && actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Access denied. Required role: HR or SUPER_ADMIN');
    }

    const requests = await LeaveRequestService.getAllLeaveRequests();
    const filtered: LeaveRequestDto[] = [];

    for (const r of requests) {
      const routing = await this.resolveRequestRoutingInfo(r);
      // Top Management or leave requests where HR stage is NOT_REQUIRED never enter the HR queue
      if (routing.isTopMgmt || r.hrDecision === 'NOT_REQUIRED') {
        continue;
      }

      const isSelfRequest =
        (actor.employeeId && Number(r.employeeId) === Number(actor.employeeId)) ||
        (actor.userId &&
          routing.applicantUserId &&
          Number(actor.userId) === Number(routing.applicantUserId));
      if (isSelfRequest && (actor.role === 'HR' || filter.status === 'PENDING')) {
        continue;
      }

      const tlStageDone =
        r.teamLeaderDecision === 'APPROVED' || r.teamLeaderDecision === 'NOT_REQUIRED';

      if (
        filter.status === 'PENDING' &&
        (!tlStageDone || r.hrDecision !== 'PENDING' || r.finalStatus !== 'PENDING')
      )
        continue;
      if (filter.status === 'TL_APPROVED' && (!tlStageDone || r.hrDecision !== 'PENDING')) continue;
      if (filter.status === 'REVIEWED' && r.hrDecision === 'PENDING') continue;
      if (filter.status && filter.status !== 'ALL' && filter.status !== 'PENDING' && filter.status !== 'TL_APPROVED' && filter.status !== 'REVIEWED') {
        if (r.hrDecision !== filter.status && r.finalStatus !== filter.status) continue;
      }
      if (filter.search) {
        const s = filter.search.toLowerCase();
        const match =
          r.requestNumber.toLowerCase().includes(s) ||
          r.employeeName?.toLowerCase().includes(s) ||
          r.leaveTypeName?.toLowerCase().includes(s) ||
          r.reason.toLowerCase().includes(s);
        if (!match) continue;
      }
      filtered.push(r);
    }
    return filtered;
  }

  /**
   * Retrieves leave requests for Top Management dashboard
   */
  public static async getRequestsForManagement(
    filter: { status?: string; search?: string } = {},
    actor: AuthContext
  ): Promise<LeaveRequestDto[]> {
    if (actor.role !== 'TOP_MANAGEMENT' && actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Access denied. Required role: TOP_MANAGEMENT or SUPER_ADMIN');
    }

    const requests = await LeaveRequestService.getAllLeaveRequests();
    const filtered: LeaveRequestDto[] = [];

    for (const r of requests) {
      const routing = await this.resolveRequestRoutingInfo(r);
      const isSelfByEmp =
        Boolean(actor.employeeId) && Number(r.employeeId) === Number(actor.employeeId);
      const isSelfByUser =
        Boolean(actor.userId) &&
        Boolean(routing.applicantUserId) &&
        Number(actor.userId) === Number(routing.applicantUserId);
      const isSuperAdminSelfRequest =
        actor.role === 'SUPER_ADMIN' && (isSelfByEmp || isSelfByUser);

      // For Top Management applicant requests, only the assigned reporting manager or Super Admin sees the queue item.
      if (routing.isTopMgmt && actor.role !== 'SUPER_ADMIN') {
        if (isSelfByEmp || isSelfByUser) {
          continue;
        }

        if (routing.reportingManagerId || routing.reportingManagerUserId) {
          const matchesReportingEmp =
            Boolean(actor.employeeId) &&
            Boolean(routing.reportingManagerId) &&
            Number(actor.employeeId) === Number(routing.reportingManagerId);
          const matchesReportingUser =
            Boolean(actor.userId) &&
            Boolean(routing.reportingManagerUserId) &&
            Number(actor.userId) === Number(routing.reportingManagerUserId);

          if (!matchesReportingEmp && !matchesReportingUser) {
            continue;
          }
        }
      }

      const tlReadyForMgmt =
        r.teamLeaderDecision === 'APPROVED' || r.teamLeaderDecision === 'NOT_REQUIRED';
      const isHrReq = r.hrDecision !== 'NOT_REQUIRED' && r.hrDecision !== 'SKIPPED';
      const hrReadyForMgmt =
        !isHrReq ||
        r.hrDecision === 'APPROVED' ||
        r.hrDecision === 'REJECTED' ||
        r.hrDecision === 'NOT_REQUIRED' ||
        r.hrDecision === 'SKIPPED';

      if (
        filter.status === 'PENDING' &&
        (r.managementDecision !== 'PENDING' ||
          r.finalStatus !== 'PENDING' ||
          (!isSuperAdminSelfRequest && (!tlReadyForMgmt || !hrReadyForMgmt)))
      ) {
        continue;
      }
      if (filter.status === 'DECIDED' && r.managementDecision === 'PENDING') continue;
      if (filter.status && filter.status !== 'ALL' && filter.status !== 'PENDING' && filter.status !== 'DECIDED') {
        if (r.managementDecision !== filter.status && r.finalStatus !== filter.status) continue;
      }
      if (filter.search) {
        const s = filter.search.toLowerCase();
        const match =
          r.requestNumber.toLowerCase().includes(s) ||
          r.employeeName?.toLowerCase().includes(s) ||
          r.leaveTypeName?.toLowerCase().includes(s) ||
          r.reason.toLowerCase().includes(s);
        if (!match) continue;
      }
      filtered.push(r);
    }
    return filtered;
  }

  /**
   * HR fallback queue: pending Stage 1 requests that require an explicit unavailable-person reason.
   */
  public static async getRequestsForHrStage1Fallback(
    filter: { search?: string } = {},
    actor: AuthContext
  ): Promise<LeaveRequestDto[]> {
    if (!actor || (actor.role !== 'HR' && actor.role !== 'SUPER_ADMIN')) {
      throw new Error('Forbidden: Only HR or Super Admin can access the Reporting Person fallback queue');
    }
    if (!(await UserService.hasPermission(actor, 'LEAVE_HR_APPROVE'))) {
      throw new Error('Forbidden: Role does not have LEAVE_HR_APPROVE permission');
    }
    const requests = await LeaveRequestService.getAllLeaveRequests();
    const filtered: LeaveRequestDto[] = [];
    for (const request of requests) {
      const routing = await this.resolveRequestRoutingInfo(request);
      if (routing.isTopMgmt || request.teamLeaderDecision === 'NOT_REQUIRED') continue;
      if ((request.teamLeaderDecision || 'PENDING') !== 'PENDING') continue;
      if (request.finalStatus !== 'PENDING' || request.status === 'CANCELLED') continue;
      const isSelfRequest =
        (Boolean(actor.employeeId) && Number(request.employeeId) === Number(actor.employeeId)) ||
        (Boolean(actor.userId) && Boolean(routing.applicantUserId) &&
          Number(actor.userId) === Number(routing.applicantUserId));
      if (isSelfRequest) continue;
      if (filter.search) {
        const term = filter.search.toLowerCase();
        if (
          !request.requestNumber.toLowerCase().includes(term) &&
          !(request.employeeName || '').toLowerCase().includes(term) &&
          !(request.leaveTypeName || '').toLowerCase().includes(term)
        ) continue;
      }
      filtered.push(request);
    }
    return filtered;
  }

  /**
   * HR-only Stage 1 approval when the assigned Reporting Person is unavailable.
   * The reason, acting HR identity and original assignment are retained in approval/audit events.
   */
  public static async submitHrStage1FallbackApproval(
    leaveRequestId: number,
    input: { reason?: string },
    actor: AuthContext,
    auditMeta?: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveRequestDto> {
    if (!actor || (actor.role !== 'HR' && actor.role !== 'SUPER_ADMIN')) {
      throw new Error('Forbidden: Only HR or Super Admin can approve Stage 1 on behalf of a Reporting Person');
    }
    if (!(await UserService.hasPermission(actor, 'LEAVE_HR_APPROVE'))) {
      throw new Error('Forbidden: Role does not have LEAVE_HR_APPROVE permission');
    }
    const reason = String(input?.reason || '').trim();
    if (reason.length < 8) {
      throw new ValidationError('Enter a reason of at least 8 characters confirming why the Reporting Person is unavailable');
    }
    const existing = await LeaveRequestService.getLeaveRequestById(leaveRequestId, actor);
    if (!existing?.request) {
      throw new ValidationError(`Leave request with ID ${leaveRequestId} not found`);
    }
    const req = existing.request;
    const routing = await this.resolveRequestRoutingInfo(req);
    this.assertNotSelfApproval(req, routing.applicantUserId, actor);
    if (routing.isTopMgmt) {
      throw new Error('Forbidden: HR fallback is not permitted for Top Management leave requests');
    }
    if (req.teamLeaderDecision === 'NOT_REQUIRED') {
      throw new Error('Forbidden: Stage 1 Reporting Person approval is not required for this request');
    }
    if (req.finalStatus !== 'PENDING' || req.status === 'CANCELLED') {
      throw new ValidationError('Only pending leave requests can use the Reporting Person fallback');
    }
    if ((req.teamLeaderDecision || 'PENDING') !== 'PENDING') {
      throw new ValidationError('Stage 1 has already been decided for this request');
    }

    const employee = await UserService.getEmployeeById(req.employeeId);
    const reportingManagerId = req.reportingManagerId ?? employee?.reportingManagerId ?? null;
    const assignedReportingPerson = reportingManagerId
      ? await UserService.getEmployeeById(reportingManagerId)
      : null;
    const reportingPersonName = assignedReportingPerson?.employeeName || 'Unassigned Reporting Person';
    const remarks = `HR fallback Stage 1 approval on behalf of ${reportingPersonName} (employee ID ${reportingManagerId ?? 'unassigned'}); reason: ${reason}`;
    const now = new Date();
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        return await db.transaction(async (tx) => {
          const updated = await tx.update(leaveRequests).set({
            teamLeaderDecision: 'APPROVED',
            teamLeaderDecidedBy: actor.userId || null,
            teamLeaderDecidedAt: now,
            teamLeaderRemarks: remarks,
            // Explicit requested fallback workflow: send this request through HR review even
            // if the employee's normal routing preference would otherwise bypass the HR stage.
            hrDecision: req.hrDecision === 'NOT_REQUIRED' || req.hrDecision === 'SKIPPED' ? 'PENDING' : req.hrDecision,
            updatedAt: now,
          }).where(and(
            eq(leaveRequests.id, leaveRequestId),
            eq(leaveRequests.teamLeaderDecision, 'PENDING'),
            eq(leaveRequests.finalStatus, 'PENDING')
          )).returning();
          if (updated.length === 0) {
            throw new ValidationError('Conflict: Stage 1 was already processed or the request is no longer pending');
          }
          await tx.insert(leaveRequestEvents).values({
            leaveRequestId,
            eventType: 'TEAM_LEADER_APPROVED_BY_HR_FALLBACK',
            action: 'TEAM_LEADER_APPROVED_BY_HR_FALLBACK',
            previousDecision: 'PENDING',
            newDecision: 'APPROVED',
            actorId: actor.userId || null,
            actorRole: actor.role,
            remarks,
            ipAddress: auditMeta?.ipAddress || null,
            userAgent: auditMeta?.userAgent || null,
          });
          const result = {
            ...updated[0],
            employeeName: req.employeeName,
            employeeCode: req.employeeCode,
            leaveTypeCode: req.leaveTypeCode,
            leaveTypeName: req.leaveTypeName,
            teamLeaderDecidedByName: actor.username,
          } as LeaveRequestDto;
          try {
            const { AuditService } = await import('./auditService.ts');
            await AuditService.logEvent({
              actorId: actor.userId || actor.employeeId || null,
              actorRole: actor.role,
              action: 'TEAM_LEADER_APPROVED_BY_HR_FALLBACK',
              targetEntity: 'leave_requests',
              targetId: String(req.id),
              metadata: {
                requestNumber: req.requestNumber,
                employeeId: req.employeeId,
                employeeName: req.employeeName,
                assignedReportingPersonEmployeeId: reportingManagerId,
                assignedReportingPersonName: reportingPersonName,
                actingHrUserId: actor.userId,
                actingHrUsername: actor.username,
                stage: 'TEAM_LEADER_FALLBACK',
                reason,
                nextStep: 'HR review, then Top Management final decision',
              },
              ipAddress: auditMeta?.ipAddress,
              userAgent: auditMeta?.userAgent,
            });
          } catch (error) {
            console.error('Failed to write HR Reporting Person fallback audit log:', error);
          }
          NotificationService.notifyTeamLeaderDecided({
            id: req.id,
            requestNumber: req.requestNumber,
            employeeId: req.employeeId,
            employeeName: req.employeeName,
            totalDays: req.totalDays,
            hrDecision: 'PENDING',
          }, 'APPROVED', remarks, actor.username).catch(() => {});
          return result;
        });
      }
    }
    req.teamLeaderDecision = 'APPROVED';
    req.teamLeaderDecidedBy = actor.userId || null;
    req.teamLeaderDecidedByName = actor.username || 'HR Reviewer';
    req.teamLeaderDecidedAt = now.toISOString();
    req.teamLeaderRemarks = remarks;
    if (req.hrDecision === 'NOT_REQUIRED' || req.hrDecision === 'SKIPPED') req.hrDecision = 'PENDING';
    req.approvalStageLabel = LeaveRequestService.computeApprovalStageLabel(req);
    req.updatedAt = now.toISOString();
    LeaveRequestService.addMemoryEvent({
      leaveRequestId,
      eventType: 'TEAM_LEADER_APPROVED_BY_HR_FALLBACK',
      action: 'TEAM_LEADER_APPROVED_BY_HR_FALLBACK',
      previousDecision: 'PENDING',
      newDecision: 'APPROVED',
      actorId: actor.userId || null,
      actorRole: actor.role,
      actorName: actor.username,
      remarks,
      ipAddress: auditMeta?.ipAddress,
      userAgent: auditMeta?.userAgent,
      createdAt: now.toISOString(),
    });
    return req;
  }

  /**
   * Retrieves full details for approver review (includes employee history and balances)
   */
  public static async getApprovalDetails(
    id: number,
    actor: AuthContext
  ): Promise<{
    request: LeaveRequestDto;
    events: LeaveRequestEventDto[];
    employeeHistory: EmployeeLeaveHistoryDto;
  } | null> {
    if (!actor || !actor.role) {
      throw new Error('Unauthorized: Authentication required');
    }

    const details = await LeaveRequestService.getLeaveRequestById(id, actor);
    if (!details) return null;

    const routing = await this.resolveRequestRoutingInfo(details.request);
    const isOwnRequest =
      Boolean(actor.employeeId) && Number(details.request.employeeId) === Number(actor.employeeId);
    if (!isOwnRequest && routing.isTopMgmt && (actor.role === 'TEAM_LEADER' || actor.role === 'HR')) {
      throw new Error('Forbidden: Team Leader and HR cannot access Top Management leave requests');
    }
    if (
      !isOwnRequest &&
      details.request.teamLeaderDecision === 'NOT_REQUIRED' &&
      actor.role !== 'SUPER_ADMIN' &&
      actor.role !== 'HR' &&
      actor.role !== 'TOP_MANAGEMENT'
    ) {
      throw new Error(
        'Forbidden: Reporting Person approval is not required for this leave request'
      );
    }
    if (!isOwnRequest && actor.role !== 'SUPER_ADMIN') {
      const request = details.request;
      const tlDecision = request.teamLeaderDecision || 'PENDING';
      const hrRequired = request.hrDecision !== 'NOT_REQUIRED' && request.hrDecision !== 'SKIPPED';

      if (actor.role === 'HR') {
        // HR may view requests routed to HR after Stage 1 and HR review history.
        if (routing.isTopMgmt) {
          throw new Error('Forbidden: HR cannot access Top Management leave requests');
        }
        if (!hrRequired) {
          throw new Error('Forbidden: HR review is not required for this leave request');
        }
        if (tlDecision !== 'APPROVED' && tlDecision !== 'NOT_REQUIRED') {
          throw new Error('Forbidden: HR can access this request only after Stage 1 is complete');
        }
        if (request.hrDecision === 'PENDING' && request.finalStatus !== 'PENDING') {
          throw new Error('Forbidden: This request is no longer awaiting HR review');
        }
      } else if (actor.role === 'TOP_MANAGEMENT') {
        // Management may view actionable requests only after required earlier stages finish.
        if (routing.isTopMgmt) {
          const employee = await UserService.getEmployeeById(request.employeeId);
          const managerId = request.reportingManagerId ?? employee?.reportingManagerId ?? null;
          const manager = managerId ? await UserService.getEmployeeById(managerId) : null;
          const managerUserId = request.reportingManagerUserId ?? manager?.userId ?? null;
          const matchesManager =
            (Boolean(actor.employeeId) && Boolean(managerId) && Number(actor.employeeId) === Number(managerId)) ||
            (Boolean(actor.userId) && Boolean(managerUserId) && Number(actor.userId) === Number(managerUserId));
          if (!matchesManager) {
            throw new Error('Forbidden: Only the assigned Reporting Person can view this Top Management leave request');
          }
        }
        if (request.managementDecision === 'PENDING' && request.finalStatus === 'PENDING') {
          if (tlDecision === 'PENDING') {
            throw new Error('Forbidden: This request is still awaiting Stage 1 approval');
          }
          if (hrRequired && request.hrDecision === 'PENDING') {
            throw new Error('Forbidden: This request is still awaiting HR review');
          }
        }
      } else {
        // Stage 1 remains restricted to the employee's assigned Reporting Person.
        const employee = await UserService.getEmployeeById(request.employeeId);
        const reportingManagerId =
          request.reportingManagerId ?? employee?.reportingManagerId ?? null;
        const reportingManager = reportingManagerId
          ? await UserService.getEmployeeById(reportingManagerId)
          : null;
        const reportingManagerUserId =
          request.reportingManagerUserId ?? reportingManager?.userId ?? null;
        const matchesEmployee =
          Boolean(actor.employeeId) &&
          Boolean(reportingManagerId) &&
          Number(actor.employeeId) === Number(reportingManagerId);
        const matchesUser =
          Boolean(actor.userId) &&
          Boolean(reportingManagerUserId) &&
          Number(actor.userId) === Number(reportingManagerUserId);
        if (!matchesEmployee && !matchesUser) {
          throw new Error('Forbidden: Only the employee\'s assigned Reporting Person can view this request at Stage 1');
        }
      }
    }

    const enrichedRequest = LeaveRequestService.withStageLabel(details.request);
    // The Employee role can act as a Reporting Person, but its standard history endpoint
    // intentionally limits balance/history access to self. Keep the approval detail usable
    // without widening that separate endpoint's permissions.
    const history = actor.role === 'EMPLOYEE' && !isOwnRequest
      ? {
          employeeId: enrichedRequest.employeeId,
          employeeName: enrichedRequest.employeeName,
          employeeCode: enrichedRequest.employeeCode,
          departmentId: enrichedRequest.departmentId ?? null,
          departmentCode: enrichedRequest.departmentCode ?? null,
          departmentName: enrichedRequest.departmentName,
          totalRequests: 0,
          approvedRequests: 0,
          rejectedRequests: 0,
          cancelledRequests: 0,
          pendingRequests: 0,
          lateRequests: 0,
          postStartRequests: 0,
          emergencyRequests: 0,
          balances: [],
          recentRequests: [],
        }
      : await this.getEmployeeApprovalHistory(enrichedRequest.employeeId, actor);

    return {
      request: enrichedRequest,
      events: details.events,
      employeeHistory: history,
    };
  }
}
