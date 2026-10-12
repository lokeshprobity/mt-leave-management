import { eq, and, desc } from 'drizzle-orm';
import { getDb, isDbConfigured } from '../db/index.ts';
import { notifications, users, roles } from '../db/schema.ts';
import {
  NotificationDto,
  NotificationType,
  UserRole,
  OperationalRole,
  AuthContext,
  FinalLeaveStatus,
} from '../types/leave.ts';

export interface CreateNotificationParams {
  recipientUserId: number;
  recipientEmployeeId?: number | null;
  recipientEmployeeCode?: string | null;
  recipientRole: UserRole;
  type: NotificationType;
  title: string;
  message: string;
  relatedLeaveRequestId?: number | null;
  eventKey?: string | null;
}

// In-memory fallback notification store for testing and when DB is unconfigured
let memoryNotifications: NotificationDto[] = [];
let nextNotificationId = 1;

export class NotificationService {
  public static resetMemoryNotifications(): void {
    memoryNotifications = [];
    nextNotificationId = 1;
  }

  public static getMemoryNotifications(): NotificationDto[] {
    return memoryNotifications;
  }

  /**
   * Helper to dispatch an in-app notification idempotently.
   * If eventKey is provided and an identical notification already exists, skip duplicate.
   */
  public static async createNotification(params: CreateNotificationParams): Promise<NotificationDto | null> {
    const {
      recipientUserId,
      recipientRole,
      type,
      title,
      message,
      relatedLeaveRequestId = null,
      eventKey = null,
    } = params;

    let recipientEmployeeId = params.recipientEmployeeId ?? null;
    let recipientEmployeeCode = params.recipientEmployeeCode ?? null;
    try {
      const { UserService } = await import('./userService.ts');
      const emp = UserService.resolveEmployeeRecordSync(
        recipientEmployeeCode ?? recipientEmployeeId ?? recipientUserId
      );
      if (emp) {
        recipientEmployeeId = emp.id;
        recipientEmployeeCode = emp.employeeCode ?? null;
      }
    } catch {}

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          if (eventKey) {
            const existing = await db
              .select()
              .from(notifications)
              .where(eq(notifications.eventKey, eventKey));
            if (existing.length > 0) {
              return {
                id: existing[0].id,
                recipientUserId: existing[0].recipientUserId,
                recipientEmployeeId,
                recipientEmployeeCode,
                recipientRole: existing[0].recipientRole as UserRole,
                type: existing[0].type as NotificationType,
                title: existing[0].title,
                message: existing[0].message,
                relatedLeaveRequestId: existing[0].relatedLeaveRequestId,
                eventKey: existing[0].eventKey,
                isRead: existing[0].isRead,
                readAt: existing[0].readAt,
                createdAt: existing[0].createdAt,
              };
            }
          }

          const inserted = await db
            .insert(notifications)
            .values({
              recipientUserId,
              recipientRole,
              type,
              title,
              message,
              relatedLeaveRequestId,
              eventKey,
              isRead: false,
            })
            .returning();

          const r = inserted[0];
          const dto: NotificationDto = {
            id: r.id,
            recipientUserId: r.recipientUserId,
            recipientEmployeeId,
            recipientEmployeeCode,
            recipientRole: r.recipientRole as UserRole,
            type: r.type as NotificationType,
            title: r.title,
            message: r.message,
            relatedLeaveRequestId: r.relatedLeaveRequestId,
            eventKey: r.eventKey,
            isRead: r.isRead,
            readAt: r.readAt,
            createdAt: r.createdAt,
          };
          memoryNotifications.unshift(dto);
          return dto;
        } catch (e) {
          console.warn('Failed to insert notification into database, using fallback:', e);
        }
      }
    }

    // In-memory fallback
    if (eventKey && memoryNotifications.some((n) => n.eventKey === eventKey)) {
      return memoryNotifications.find((n) => n.eventKey === eventKey)!;
    }

    const newDto: NotificationDto = {
      id: nextNotificationId++,
      recipientUserId,
      recipientEmployeeId,
      recipientEmployeeCode,
      recipientRole,
      type,
      title,
      message,
      relatedLeaveRequestId,
      eventKey,
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    memoryNotifications.unshift(newDto);
    return newDto;
  }

  /**
   * Helper to lookup all user IDs matching specific role(s) to fan out notifications.
   */
  public static async getUserIdsForRole(roleName: UserRole): Promise<number[]> {
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const roleRows = await db.select().from(roles).where(eq(roles.name, roleName));
          if (roleRows.length > 0) {
            const roleId = roleRows[0].id;
            const userRows = await db
              .select({ id: users.id })
              .from(users)
              .where(and(eq(users.roleId, roleId), eq(users.isActive, true)));
            if (userRows.length > 0) {
              return userRows.map((u) => u.id);
            }
          }
        } catch {}
      }
    }

    // Fallback standard user IDs
    switch (roleName) {
      case 'SUPER_ADMIN':
        return [1];
      case 'HR':
        return [2];
      case 'TOP_MANAGEMENT':
        return [3];
      case 'TEAM_LEADER':
        return [5, 6];
      case 'EMPLOYEE':
        return [101];
      default:
        return [1];
    }
  }

  /**
   * 1. EVENT: Leave Submitted
   * Notify Team Leader (Stage 1), HR & Top Management about a new application
   */
  public static async notifyLeaveSubmitted(req: {
    id: number;
    requestNumber: string;
    employeeId?: number;
    employeeName?: string | null;
    applicantRole?: UserRole;
    applicantOperationalRole?: OperationalRole;
    reportingManagerId?: number | null;
    reportingManagerUserId?: number | null;
    assignedTeamLeaderId?: number | null;
    assignedTeamLeaderUserId?: number | null;
    totalDays: string | number;
    leaveTypeName?: string | null;
    startDate: string;
    endDate: string;
    classification?: string | null;
  }): Promise<void> {
    const opRole: OperationalRole =
      req.applicantOperationalRole ||
      (req.applicantRole && req.applicantRole !== 'SUPER_ADMIN'
        ? (req.applicantRole as OperationalRole)
        : 'EMPLOYEE');
    const isTopMgmtApplicant = opRole === 'TOP_MANAGEMENT' || req.applicantRole === 'TOP_MANAGEMENT';
    const empName = req.employeeName || 'An employee';
    const title = `New Leave Request: ${req.requestNumber}`;

    if (isTopMgmtApplicant) {
      const mgmtMessage = `${empName} (Top Management) applied for ${req.totalDays} day(s) of ${req.leaveTypeName || 'Leave'} (${req.startDate} to ${req.endDate}). Routed directly to Top Management / Reporting Person.`;
      const targetMgmtUsers = req.reportingManagerUserId
        ? [req.reportingManagerUserId]
        : await this.getUserIdsForRole('TOP_MANAGEMENT');
      const adminUsers = await this.getUserIdsForRole('SUPER_ADMIN');

      for (const uid of targetMgmtUsers) {
        await this.createNotification({
          recipientUserId: uid,
          recipientRole: 'TOP_MANAGEMENT',
          type: 'LEAVE_SUBMITTED',
          title,
          message: mgmtMessage,
          relatedLeaveRequestId: req.id,
          eventKey: `LEAVE_SUBMITTED_${req.id}_MGMT_${uid}`,
        });
      }

      for (const uid of adminUsers) {
        if (!targetMgmtUsers.includes(uid)) {
          await this.createNotification({
            recipientUserId: uid,
            recipientRole: 'SUPER_ADMIN',
            type: 'LEAVE_SUBMITTED',
            title,
            message: mgmtMessage,
            relatedLeaveRequestId: req.id,
            eventKey: `LEAVE_SUBMITTED_${req.id}_ADMIN_${uid}`,
          });
        }
      }
      return;
    }

    if (opRole === 'HR') {
      const hrMsg = `${empName} (HR) applied for ${req.totalDays} day(s) of ${req.leaveTypeName || 'Leave'} (${req.startDate} to ${req.endDate}). Routed directly to Top Management.`;
      const mgmtUsers = await this.getUserIdsForRole('TOP_MANAGEMENT');
      const adminUsers = await this.getUserIdsForRole('SUPER_ADMIN');

      for (const uid of mgmtUsers) {
        await this.createNotification({
          recipientUserId: uid,
          recipientRole: 'TOP_MANAGEMENT',
          type: 'LEAVE_SUBMITTED',
          title,
          message: hrMsg,
          relatedLeaveRequestId: req.id,
          eventKey: `LEAVE_SUBMITTED_${req.id}_MGMT_${uid}`,
        });
      }

      for (const uid of adminUsers) {
        if (!mgmtUsers.includes(uid)) {
          await this.createNotification({
            recipientUserId: uid,
            recipientRole: 'SUPER_ADMIN',
            type: 'LEAVE_SUBMITTED',
            title,
            message: hrMsg,
            relatedLeaveRequestId: req.id,
            eventKey: `LEAVE_SUBMITTED_${req.id}_ADMIN_${uid}`,
          });
        }
      }
      return;
    }

    if (opRole === 'TEAM_LEADER') {
      const tlMsg = `${empName} (Team Leader) applied for ${req.totalDays} day(s) of ${req.leaveTypeName || 'Leave'} (${req.startDate} to ${req.endDate}). Pending HR approval.`;
      const hrUsers = await this.getUserIdsForRole('HR');
      const mgmtUsers = await this.getUserIdsForRole('TOP_MANAGEMENT');
      const adminUsers = await this.getUserIdsForRole('SUPER_ADMIN');

      for (const uid of hrUsers) {
        await this.createNotification({
          recipientUserId: uid,
          recipientRole: 'HR',
          type: 'LEAVE_SUBMITTED',
          title,
          message: tlMsg,
          relatedLeaveRequestId: req.id,
          eventKey: `LEAVE_SUBMITTED_${req.id}_HR_${uid}`,
        });
      }

      for (const uid of mgmtUsers) {
        await this.createNotification({
          recipientUserId: uid,
          recipientRole: 'TOP_MANAGEMENT',
          type: 'LEAVE_SUBMITTED',
          title,
          message: tlMsg,
          relatedLeaveRequestId: req.id,
          eventKey: `LEAVE_SUBMITTED_${req.id}_MGMT_${uid}`,
        });
      }

      for (const uid of adminUsers) {
        if (!hrUsers.includes(uid) && !mgmtUsers.includes(uid)) {
          await this.createNotification({
            recipientUserId: uid,
            recipientRole: 'SUPER_ADMIN',
            type: 'LEAVE_SUBMITTED',
            title,
            message: tlMsg,
            relatedLeaveRequestId: req.id,
            eventKey: `LEAVE_SUBMITTED_${req.id}_ADMIN_${uid}`,
          });
        }
      }
      return;
    }

    const resolvedLeaderUserId =
      req.assignedTeamLeaderUserId ??
      req.reportingManagerUserId ??
      req.assignedTeamLeaderId ??
      req.reportingManagerId;
    const tlUsers = resolvedLeaderUserId
      ? [resolvedLeaderUserId]
      : await this.getUserIdsForRole('TEAM_LEADER');
    const hrUsers = await this.getUserIdsForRole('HR');
    const mgmtUsers = await this.getUserIdsForRole('TOP_MANAGEMENT');
    const adminUsers = await this.getUserIdsForRole('SUPER_ADMIN');

    const message = `${empName} applied for ${req.totalDays} day(s) of ${req.leaveTypeName || 'Leave'} (${req.startDate} to ${req.endDate}). Pending Team Leader approval.`;

    // Notify Team Leader (Stage 1 Approver)
    for (const uid of tlUsers) {
      await this.createNotification({
        recipientUserId: uid,
        recipientRole: 'TEAM_LEADER',
        type: 'LEAVE_SUBMITTED',
        title,
        message,
        relatedLeaveRequestId: req.id,
        eventKey: `LEAVE_SUBMITTED_${req.id}_TL_${uid}`,
      });
    }

    // Notify HR
    for (const uid of hrUsers) {
      await this.createNotification({
        recipientUserId: uid,
        recipientRole: 'HR',
        type: 'LEAVE_SUBMITTED',
        title,
        message,
        relatedLeaveRequestId: req.id,
        eventKey: `LEAVE_SUBMITTED_${req.id}_HR_${uid}`,
      });
    }

    // Notify Top Management
    for (const uid of mgmtUsers) {
      await this.createNotification({
        recipientUserId: uid,
        recipientRole: 'TOP_MANAGEMENT',
        type: 'LEAVE_SUBMITTED',
        title,
        message,
        relatedLeaveRequestId: req.id,
        eventKey: `LEAVE_SUBMITTED_${req.id}_MGMT_${uid}`,
      });
    }

    // Notify Super Admin
    for (const uid of adminUsers) {
      if (!hrUsers.includes(uid) && !mgmtUsers.includes(uid)) {
        await this.createNotification({
          recipientUserId: uid,
          recipientRole: 'SUPER_ADMIN',
          type: 'LEAVE_SUBMITTED',
          title,
          message,
          relatedLeaveRequestId: req.id,
          eventKey: `LEAVE_SUBMITTED_${req.id}_ADMIN_${uid}`,
        });
      }
    }
  }

  /**
   * 1b. EVENT: Team Leader Decided (Stage 1 Approval or Rejection)
   * Notify Employee and HR (if approved)
   */
  public static async notifyTeamLeaderDecided(
    req: {
      id: number;
      requestNumber: string;
      employeeId: number;
      employeeName?: string | null;
      totalDays?: string | number;
      hrDecision?: string | null;
    },
    decision: 'APPROVED' | 'REJECTED',
    remarks?: string | null,
    leaderName?: string | null
  ): Promise<void> {
    const isApproved = decision === 'APPROVED';
    const title = isApproved
      ? `Team Leader Approved: ${req.requestNumber}`
      : `Rejected by Team Leader: ${req.requestNumber}`;
    const empMsg = isApproved
      ? (req.hrDecision === 'NOT_REQUIRED'
          ? `Team Leader (${leaderName || 'Team Leader'}) approved your leave request ${req.requestNumber}. It has moved directly to Top Management for final decision.${remarks ? ` Remarks: "${remarks}"` : ''}`
          : `Team Leader (${leaderName || 'Team Leader'}) approved your leave request ${req.requestNumber}. It has moved to HR Pending.${remarks ? ` Remarks: "${remarks}"` : ''}`)
      : `Your leave request ${req.requestNumber} was REJECTED by Team Leader (${leaderName || 'Team Leader'}).${remarks ? ` Reason: "${remarks}"` : ''}`;

    // Notify Employee
    await this.createNotification({
      recipientUserId: req.employeeId,
      recipientRole: 'EMPLOYEE',
      type: isApproved ? 'TEAM_LEADER_DECIDED' : 'FINAL_REJECTED',
      title,
      message: empMsg,
      relatedLeaveRequestId: req.id,
      eventKey: `TL_DECIDED_${req.id}_EMP_${req.employeeId}`,
    });

    // If approved by Team Leader, notify next approvers based on hr_approval_required
    if (isApproved) {
      const { UserService } = await import('./userService.ts');
      const isHrReq = req.hrDecision !== 'NOT_REQUIRED' && UserService.isHrApprovalRequired(req.employeeId);
      if (isHrReq) {
        const hrUsers = await this.getUserIdsForRole('HR');
        const hrMsg = `Team Leader (${leaderName || 'Team Leader'}) approved ${req.requestNumber} for ${req.employeeName || `Employee #${req.employeeId}`}. Now pending HR review.${remarks ? ` TL Remarks: "${remarks}"` : ''}`;
        for (const uid of hrUsers) {
          await this.createNotification({
            recipientUserId: uid,
            recipientRole: 'HR',
            type: 'TEAM_LEADER_DECIDED',
            title: `Ready for HR Review: ${req.requestNumber}`,
            message: hrMsg,
            relatedLeaveRequestId: req.id,
            eventKey: `TL_DECIDED_${req.id}_HR_${uid}`,
          });
        }
      } else {
        // Workflow OFF: routed directly to Top Management
        const mgmtUsers = await this.getUserIdsForRole('TOP_MANAGEMENT');
        const mgmtMsg = `Team Leader (${leaderName || 'Team Leader'}) approved ${req.requestNumber} for ${req.employeeName || `Employee #${req.employeeId}`}. Awaiting Top Management final decision.${remarks ? ` TL Remarks: "${remarks}"` : ''}`;
        for (const uid of mgmtUsers) {
          await this.createNotification({
            recipientUserId: uid,
            recipientRole: 'TOP_MANAGEMENT',
            type: 'TEAM_LEADER_DECIDED',
            title: `Action Required: Leave ${req.requestNumber}`,
            message: mgmtMsg,
            relatedLeaveRequestId: req.id,
            eventKey: `TL_DECIDED_${req.id}_MGMT_${uid}`,
          });
        }
      }
    }
  }

  /**
   * 2. EVENT: HR Decided (Recommended approval or rejection)
   * Notify Employee and Top Management
   */
  public static async notifyHrDecided(
    req: {
      id: number;
      requestNumber: string;
      employeeId: number;
      employeeName?: string | null;
    },
    decision: 'APPROVED' | 'REJECTED',
    remarks?: string | null,
    reviewerName?: string | null
  ): Promise<void> {
    const title = `HR Review: ${decision} (${req.requestNumber})`;
    const message = `HR (${reviewerName || 'Reviewer'}) has ${decision.toLowerCase()} recommendation for ${req.requestNumber}.${remarks ? ` Remarks: "${remarks}"` : ''}`;

    // Notify Employee (recipientUserId: match employeeId or user ID mapping)
    await this.createNotification({
      recipientUserId: req.employeeId,
      recipientRole: 'EMPLOYEE',
      type: 'HR_DECIDED',
      title,
      message,
      relatedLeaveRequestId: req.id,
      eventKey: `HR_DECIDED_${req.id}_EMP_${req.employeeId}`,
    });

    // Notify Top Management
    const mgmtUsers = await this.getUserIdsForRole('TOP_MANAGEMENT');
    for (const uid of mgmtUsers) {
      await this.createNotification({
        recipientUserId: uid,
        recipientRole: 'TOP_MANAGEMENT',
        type: 'HR_DECIDED',
        title,
        message,
        relatedLeaveRequestId: req.id,
        eventKey: `HR_DECIDED_${req.id}_MGMT_${uid}`,
      });
    }
  }

  /**
   * 3. EVENT: Management Decided (Final Authoritative Approval or Rejection)
   * Notify Employee and HR
   */
  public static async notifyManagementDecided(
    req: {
      id: number;
      requestNumber: string;
      employeeId: number;
      employeeName?: string | null;
      totalDays: string | number;
    },
    decision: 'APPROVED' | 'REJECTED',
    finalStatus: FinalLeaveStatus | 'APPROVED' | 'REJECTED',
    remarks?: string | null,
    managerName?: string | null
  ): Promise<void> {
    const isApproved = finalStatus === 'APPROVED';
    const notifType: NotificationType = isApproved ? 'FINAL_APPROVED' : 'FINAL_REJECTED';
    const title = isApproved
      ? `Leave Approved: ${req.requestNumber}`
      : `Leave Rejected: ${req.requestNumber}`;
    const message = isApproved
      ? `Your leave request ${req.requestNumber} for ${req.totalDays} day(s) was APPROVED by Top Management (${managerName || 'Executive'}). Leave days have been posted to your balance.`
      : `Your leave request ${req.requestNumber} was REJECTED by Top Management.${remarks ? ` Reason: "${remarks}"` : ''}`;

    // Notify Employee
    await this.createNotification({
      recipientUserId: req.employeeId,
      recipientRole: 'EMPLOYEE',
      type: notifType,
      title,
      message,
      relatedLeaveRequestId: req.id,
      eventKey: `MGMT_DECIDED_${req.id}_EMP_${req.employeeId}`,
    });

    // Notify HR
    const hrUsers = await this.getUserIdsForRole('HR');
    const hrMsg = `Management final status on ${req.requestNumber}: ${finalStatus}.${remarks ? ` Remarks: "${remarks}"` : ''}`;
    for (const uid of hrUsers) {
      await this.createNotification({
        recipientUserId: uid,
        recipientRole: 'HR',
        type: notifType,
        title: `Management Decision: ${finalStatus} (${req.requestNumber})`,
        message: hrMsg,
        relatedLeaveRequestId: req.id,
        eventKey: `MGMT_DECIDED_${req.id}_HR_${uid}`,
      });
    }
  }

  /**
   * 4. EVENT: Leave Cancelled
   * Notify HR and Top Management
   */
  public static async notifyLeaveCancelled(
    req: {
      id: number;
      requestNumber: string;
      employeeName?: string | null;
    },
    reason?: string | null
  ): Promise<void> {
    const empName = req.employeeName || 'The employee';
    const title = `Leave Request Cancelled: ${req.requestNumber}`;
    const message = `${empName} has cancelled leave request ${req.requestNumber}.${reason ? ` Reason: "${reason}"` : ''}`;

    const hrUsers = await this.getUserIdsForRole('HR');
    const mgmtUsers = await this.getUserIdsForRole('TOP_MANAGEMENT');

    for (const uid of hrUsers) {
      await this.createNotification({
        recipientUserId: uid,
        recipientRole: 'HR',
        type: 'LEAVE_CANCELLED',
        title,
        message,
        relatedLeaveRequestId: req.id,
        eventKey: `CANCELLED_${req.id}_HR_${uid}`,
      });
    }

    for (const uid of mgmtUsers) {
      await this.createNotification({
        recipientUserId: uid,
        recipientRole: 'TOP_MANAGEMENT',
        type: 'LEAVE_CANCELLED',
        title,
        message,
        relatedLeaveRequestId: req.id,
        eventKey: `CANCELLED_${req.id}_MGMT_${uid}`,
      });
    }
  }

  /**
   * Fetch notifications with strict backend authorization.
   * - Employee receives only their own notifications.
   * - HR receives HR notifications + general alerts.
   * - Top Management receives Management notifications.
   * - Super Admin can view all.
   */
  public static async getNotificationsForUser(
    actor: AuthContext,
    options?: { unreadOnly?: boolean; limit?: number }
  ): Promise<{ notifications: NotificationDto[]; unreadCount: number }> {
    if (!actor || !actor.role) {
      throw new Error('Unauthorized');
    }

    let all: NotificationDto[] = [];

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const dbRows = await db
            .select()
            .from(notifications)
            .orderBy(desc(notifications.createdAt));
          all = dbRows.map((r) => ({
            id: r.id,
            recipientUserId: r.recipientUserId,
            recipientRole: r.recipientRole as UserRole,
            type: r.type as NotificationType,
            title: r.title,
            message: r.message,
            relatedLeaveRequestId: r.relatedLeaveRequestId,
            eventKey: r.eventKey,
            isRead: r.isRead,
            readAt: r.readAt,
            createdAt: r.createdAt,
          }));
        } catch (e) {
          all = [...memoryNotifications];
        }
      } else {
        all = [...memoryNotifications];
      }
    } else {
      all = [...memoryNotifications];
    }

    let actorUserId = actor.userId;
    let actorEmpId = actor.employeeId;
    let actorEmpCode = actor.employeeCode;
    try {
      const { UserService } = await import('./userService.ts');
      const emp = UserService.resolveEmployeeRecordSync(
        actor.employeeCode ?? actor.employeeId ?? actor.userId
      );
      if (emp) {
        actorEmpId = emp.id;
        actorEmpCode = emp.employeeCode ?? undefined;
        const hierarchy = UserService.getEmployeeRoleAndHierarchySync(emp.id);
        if (!actorUserId && hierarchy?.userId) {
          actorUserId = hierarchy.userId;
        }
      }
      all = all.map((n) => {
        if (!n.recipientEmployeeCode) {
          const rEmp = UserService.resolveEmployeeRecordSync(
            n.recipientEmployeeId ?? n.recipientUserId
          );
          if (rEmp) {
            return {
              ...n,
              recipientEmployeeId: rEmp.id,
              recipientEmployeeCode: rEmp.employeeCode,
            };
          }
        }
        return n;
      });
    } catch {}

    // Role-specific filtering
    let visible = all.filter((n) => {
      if (actor.role === 'SUPER_ADMIN') {
        return true;
      }
      if (actor.role === 'EMPLOYEE') {
        // Employee sees notifications addressed to their userId, employeeId, or employeeCode
        return (
          n.recipientRole === 'EMPLOYEE' &&
          ((actorUserId && n.recipientUserId === actorUserId) ||
            (actorEmpId && (n.recipientUserId === actorEmpId || n.recipientEmployeeId === actorEmpId)) ||
            Boolean(actorEmpCode && n.recipientEmployeeCode === actorEmpCode))
        );
      }
      if (actor.role === 'TEAM_LEADER') {
        return (
          n.recipientRole === 'TEAM_LEADER' &&
          ((actorUserId && n.recipientUserId === actorUserId) ||
            (actorEmpId && (n.recipientUserId === actorEmpId || n.recipientEmployeeId === actorEmpId)) ||
            Boolean(actorEmpCode && n.recipientEmployeeCode === actorEmpCode))
        );
      }
      if (actor.role === 'HR') {
        return n.recipientRole === 'HR' || (actorUserId && n.recipientUserId === actorUserId) || Boolean(actorEmpId && n.recipientEmployeeId === actorEmpId);
      }
      if (actor.role === 'TOP_MANAGEMENT') {
        return n.recipientRole === 'TOP_MANAGEMENT' || (actorUserId && n.recipientUserId === actorUserId) || Boolean(actorEmpId && n.recipientEmployeeId === actorEmpId);
      }
      return false;
    });

    const unreadCount = visible.filter((n) => !n.isRead).length;

    if (options?.unreadOnly) {
      visible = visible.filter((n) => !n.isRead);
    }
    if (options?.limit && options.limit > 0) {
      visible = visible.slice(0, options.limit);
    }

    return { notifications: visible, unreadCount };
  }

  /**
   * Mark a single notification as read with strict actor permission check
   */
  public static async markAsRead(notificationId: number, actor: AuthContext): Promise<boolean> {
    const now = new Date();

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          await db
            .update(notifications)
            .set({ isRead: true, readAt: now })
            .where(eq(notifications.id, notificationId));
        } catch {}
      }
    }

    const mem = memoryNotifications.find((n) => n.id === notificationId);
    if (mem) {
      mem.isRead = true;
      mem.readAt = now.toISOString();
    }
    return true;
  }

  /**
   * Mark all notifications as read for current user/role
   */
  public static async markAllAsRead(actor: AuthContext): Promise<number> {
    const { notifications: userNotifs } = await this.getNotificationsForUser(actor);
    const unreadIds = userNotifs.filter((n) => !n.isRead).map((n) => n.id);

    if (unreadIds.length === 0) return 0;

    const now = new Date();
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          for (const id of unreadIds) {
            await db
              .update(notifications)
              .set({ isRead: true, readAt: now })
              .where(eq(notifications.id, id));
          }
        } catch {}
      }
    }

    for (const n of memoryNotifications) {
      if (unreadIds.includes(n.id)) {
        n.isRead = true;
        n.readAt = now.toISOString();
      }
    }

    return unreadIds.length;
  }

  /**
   * Get unread notification count for user
   */
  public static async getUnreadCount(actor: AuthContext): Promise<number> {
    const { notifications: userNotifs } = await this.getNotificationsForUser(actor);
    return userNotifs.filter((n) => !n.isRead).length;
  }

  /**
   * 5. EVENT: Shift Assigned
   */
  public static async notifyShiftAssigned(
    employeeId: number | string,
    shiftName: string,
    effectiveFrom: string,
    actor?: AuthContext
  ): Promise<void> {
    let targetEmpId = Number(employeeId);
    let empCode: string | null = null;
    try {
      const { UserService } = await import('./userService.ts');
      const emp = UserService.resolveEmployeeRecordSync(employeeId);
      if (emp) {
        targetEmpId = emp.id;
        empCode = emp.employeeCode ?? null;
      }
    } catch {}
    await this.createNotification({
      recipientUserId: targetEmpId,
      recipientEmployeeId: targetEmpId,
      recipientEmployeeCode: empCode,
      recipientRole: 'EMPLOYEE',
      type: 'SHIFT_ASSIGNED',
      title: 'New Shift Assigned',
      message: `You have been assigned to shift "${shiftName}", effective from ${effectiveFrom}.`,
      eventKey: `SHIFT_ASSIGN_${targetEmpId}_${shiftName}_${effectiveFrom}`,
    });
  }

  /**
   * 6. EVENT: Shift Changed
   */
  public static async notifyShiftChanged(
    employeeId: number | string,
    shiftName: string,
    effectiveFrom: string,
    actor?: AuthContext
  ): Promise<void> {
    let targetEmpId = Number(employeeId);
    let empCode: string | null = null;
    try {
      const { UserService } = await import('./userService.ts');
      const emp = UserService.resolveEmployeeRecordSync(employeeId);
      if (emp) {
        targetEmpId = emp.id;
        empCode = emp.employeeCode ?? null;
      }
    } catch {}
    await this.createNotification({
      recipientUserId: targetEmpId,
      recipientEmployeeId: targetEmpId,
      recipientEmployeeCode: empCode,
      recipientRole: 'EMPLOYEE',
      type: 'SHIFT_CHANGED',
      title: 'Shift Schedule Updated',
      message: `Your shift assignment has been updated to "${shiftName}" from ${effectiveFrom}.`,
      eventKey: `SHIFT_CHANGE_${targetEmpId}_${shiftName}_${effectiveFrom}_${Date.now()}`,
    });
  }

  /**
   * 7. EVENT: Overtime Added / Modified
   */
  public static async notifyOvertimeAdded(
    requestId: number,
    employeeId: number,
    date: string,
    hours: number,
    actor?: AuthContext
  ): Promise<void> {
    const hrUsers = await this.getUserIdsForRole('HR');
    for (const uid of hrUsers) {
      await this.createNotification({
        recipientUserId: uid,
        recipientRole: 'HR',
        type: 'OVERTIME_ADDED',
        title: 'New Overtime Request',
        message: `Employee #${employeeId} requested ${hours}h overtime for ${date}.`,
        eventKey: `OT_ADDED_${requestId}_${uid}`,
      });
    }
  }

  public static async notifyOvertimeModified(
    requestId: number,
    employeeId: number,
    date: string,
    hours: number,
    actor?: AuthContext
  ): Promise<void> {
    await this.createNotification({
      recipientUserId: employeeId,
      recipientRole: 'EMPLOYEE',
      type: 'OVERTIME_MODIFIED',
      title: 'Overtime Request Modified',
      message: `Your overtime request for ${date} has been updated to ${hours} hours.`,
      eventKey: `OT_MOD_${requestId}_${Date.now()}`,
    });
  }

  /**
   * 8. EVENT: Overtime Approved / Rejected / Cancelled
   */
  public static async notifyOvertimeApproved(
    requestId: number,
    employeeId: number,
    date: string,
    hours: number,
    actor?: AuthContext
  ): Promise<void> {
    await this.createNotification({
      recipientUserId: employeeId,
      recipientRole: 'EMPLOYEE',
      type: 'OVERTIME_APPROVED',
      title: 'Overtime Request Approved',
      message: `Your overtime request of ${hours}h for ${date} was approved.`,
      eventKey: `OT_APP_${requestId}`,
    });
  }

  public static async notifyOvertimeRejected(
    requestId: number,
    employeeId: number,
    date: string,
    hours: number,
    remarks?: string | null,
    actor?: AuthContext
  ): Promise<void> {
    await this.createNotification({
      recipientUserId: employeeId,
      recipientRole: 'EMPLOYEE',
      type: 'OVERTIME_REJECTED',
      title: 'Overtime Request Rejected',
      message: `Your overtime request of ${hours}h for ${date} was rejected.${remarks ? ` Reason: ${remarks}` : ''}`,
      eventKey: `OT_REJ_${requestId}`,
    });
  }

  public static async notifyOvertimeCancelled(
    requestId: number,
    employeeId: number,
    date: string,
    actor?: AuthContext
  ): Promise<void> {
    const hrUsers = await this.getUserIdsForRole('HR');
    for (const uid of hrUsers) {
      await this.createNotification({
        recipientUserId: uid,
        recipientRole: 'HR',
        type: 'OVERTIME_CANCELLED',
        title: 'Overtime Request Cancelled',
        message: `Employee #${employeeId} cancelled overtime request for ${date}.`,
        eventKey: `OT_CANCEL_${requestId}_${uid}`,
      });
    }
  }

  /**
   * 9. EVENT: Team Leader Assignment / 15-Day Rotation Notification
   */
  public static async notifyTeamLeaderAssignment(params: {
    recipientUserId: number;
    recipientName: string;
    recipientEmail?: string;
    teamId: number;
    teamName: string;
    effectiveFrom: string;
    effectiveTo: string;
    assignmentType: string;
    reason?: string | null;
  }): Promise<void> {
    const eventKey = `TL_ASSIGN_${params.teamId}_${params.recipientUserId}_${params.effectiveFrom}_${params.effectiveTo}_${params.assignmentType}`;
    await this.createNotification({
      recipientUserId: params.recipientUserId,
      recipientRole: 'TEAM_LEADER',
      type: 'LEAVE_SUBMITTED',
      title: `Team Leader Assignment: ${params.teamName}`,
      message: `You have been assigned as Team Leader for ${params.teamName} (${params.effectiveFrom} to ${params.effectiveTo}).${params.reason ? ` Note: ${params.reason}` : ''}`,
      eventKey,
    });
  }
}
