import { eq, desc } from 'drizzle-orm';
import { getDb, isDbConfigured } from '../db/index.ts';
import { overtimeRequests, employees, users } from '../db/schema.ts';
import {
  OvertimeRequestDto,
  CreateOvertimeRequestInput,
  ReviewOvertimeInput,
  AuthContext,
} from '../types/leave.ts';
import { ValidationError } from './validation.ts';
import { AuditService } from './auditService.ts';
import { ShiftService } from './shiftService.ts';
import { NotificationService } from './notificationService.ts';

let memoryOvertime: OvertimeRequestDto[] = [];
let nextOvertimeId = 1;

export class OvertimeService {
  public static resetMemoryStores(): void {
    memoryOvertime = [];
    nextOvertimeId = 1;
  }

  public static calculateDurationFromTimes(startTime: string, endTime: string): number {
    const startMins = ShiftService.parseTimeToMinutes(startTime);
    const endMins = ShiftService.parseTimeToMinutes(endTime);
    if (startMins === endMins) {
      throw new ValidationError('Overtime start time and end time cannot be identical.');
    }
    const crossesMidnight = endMins < startMins;
    return ShiftService.calculateSegmentDuration(startTime, endTime, crossesMidnight, 0);
  }

  public static async createRequest(
    input: any,
    actor: AuthContext
  ): Promise<OvertimeRequestDto> {
    const { UserService } = await import('./userService.ts');
    const rawEmpTarget =
      input.employeeId ??
      input.employeeCode ??
      actor?.employeeCode ??
      actor?.employeeId ??
      actor?.userId;
    const resolvedEmp = UserService.resolveEmployeeRecordSync(rawEmpTarget);
    const employeeId = resolvedEmp ? resolvedEmp.id : Number(input.employeeId || actor?.employeeId || actor?.userId);
    if (!employeeId || Number.isNaN(employeeId)) throw new ValidationError('Employee ID is required.');

    const actorEmp = UserService.resolveEmployeeRecordSync(
      actor?.employeeCode ?? actor?.employeeId ?? actor?.userId
    );
    const actorEmpId = actorEmp?.id || actor?.employeeId || actor?.userId;
    const isSelf = Number(actorEmpId) === Number(employeeId);
    const canManageOrReview =
      (await UserService.hasPermission(actor, 'OVERTIME_MANAGE')) ||
      (await UserService.hasPermission(actor, 'OVERTIME_REVIEW'));

    if (!isSelf && !canManageOrReview) {
      throw new Error('Forbidden: You are not authorized to schedule overtime for another employee.');
    }
    if (isSelf && !canManageOrReview && !(await UserService.hasPermission(actor, 'OVERTIME_APPLY_OWN'))) {
      throw new Error(`Forbidden: Role '${actor.role}' does not have OVERTIME_APPLY_OWN permission.`);
    }

    const date = (input.overtimeDate || input.date || input.otDate || '').trim();
    if (!date) throw new ValidationError('Overtime date is required.');
    const endDate = input.endDate && String(input.endDate).trim() ? String(input.endDate).trim() : date;
    if (endDate < date) {
      throw new ValidationError(`Overtime end date (${endDate}) cannot be earlier than start date (${date}).`);
    }

    const startTime = input.startTime ? String(input.startTime).trim() : null;
    const endTime = input.endTime ? String(input.endTime).trim() : null;

    let dailyHours = Number(input.requestedHours ?? input.hours ?? 0);
    if (startTime && endTime) {
      const computedDaily = this.calculateDurationFromTimes(startTime, endTime);
      if (!dailyHours || dailyHours <= 0) {
        dailyHours = computedDaily;
      }
    }

    if (!dailyHours || dailyHours <= 0) {
      throw new ValidationError('Overtime hours must be greater than 0.');
    }
    if (dailyHours > 12) {
      throw new ValidationError('Overtime hours cannot exceed 12 hours in a single day.');
    }

    // Calculate day count across date range [date, endDate]
    const [sy, sm, sd] = date.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const startUtc = Date.UTC(sy, sm - 1, sd);
    const endUtc = Date.UTC(ey, em - 1, ed);
    const dayCount = Math.max(1, Math.round((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1);
    const hours = +(dailyHours * dayCount).toFixed(2);

    const reason = (input.reason || '').trim();
    if (!reason) throw new ValidationError('Reason for overtime is required.');

    let shiftCode = input.shiftCode || null;
    let shiftName = input.shiftName || null;
    if (input.shiftId && !shiftCode) {
      const shift = await ShiftService.getShiftById(Number(input.shiftId));
      if (shift) {
        shiftCode = shift.shiftCode;
        shiftName = shift.shiftName;
      }
    }

    let empName = resolvedEmp?.employeeName || input.employeeName;
    let empCode = resolvedEmp?.employeeCode || input.employeeCode;
    let deptId: number | null = resolvedEmp?.departmentId ?? null;
    let deptCode: string | null = resolvedEmp?.departmentCode ?? null;
    let deptName: string | null = resolvedEmp?.departmentName ?? null;
    try {
      const emp = resolvedEmp || (await UserService.getEmployeeById(employeeId));
      if (emp) {
        empName = emp.employeeName;
        empCode = emp.employeeCode;
        deptId = emp.departmentId ?? deptId;
        deptCode = emp.departmentCode ?? deptCode;
        deptName = emp.departmentName ?? deptName;
      }
      if (deptId && !deptCode) {
        const dept = UserService.getDepartmentByIdSync(deptId);
        if (dept) {
          deptCode = dept.code;
          deptName = dept.name;
        }
      }
    } catch {}

    const initialStatus =
      canManageOrReview && input.status && ['PENDING', 'APPROVED'].includes(input.status)
        ? input.status
        : 'PENDING';

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const [inserted] = await db
            .insert(overtimeRequests)
            .values({
              employeeId,
              date,
              endDate,
              startTime,
              endTime,
              hours: String(hours),
              shiftId: input.shiftId || null,
              reason,
              status: initialStatus,
              assignedBy: actor?.userId || null,
              approvedBy: initialStatus === 'APPROVED' ? actor?.userId || null : null,
              approvedAt: initialStatus === 'APPROVED' ? new Date() : null,
              remarks: input.remarks || null,
            })
            .returning();

          const dto: OvertimeRequestDto = {
            id: inserted.id,
            employeeId: inserted.employeeId,
            employeeName: empName,
            employeeCode: empCode,
            departmentId: deptId,
            departmentCode: deptCode,
            departmentName: deptName,
            date: inserted.date,
            endDate: inserted.endDate || endDate,
            overtimeDate: inserted.date,
            startTime: inserted.startTime || startTime,
            endTime: inserted.endTime || endTime,
            hours: Number(inserted.hours),
            requestedHours: Number(inserted.hours),
            totalHours: Number(inserted.hours),
            shiftId: inserted.shiftId,
            shiftCode,
            shiftName,
            reason: inserted.reason,
            status: inserted.status as any,
            assignedBy: inserted.assignedBy,
            approvedBy: inserted.approvedBy,
            reviewedBy: inserted.approvedBy,
            approvedAt: inserted.approvedAt,
            remarks: inserted.remarks,
            reviewComments: inserted.remarks,
            createdAt: inserted.createdAt,
            updatedAt: inserted.updatedAt,
          };
          memoryOvertime.unshift(dto);
          await AuditService.logEvent({
            actorId: actor.userId || null,
            actorRole: actor.role,
            action: isSelf ? 'OVERTIME_REQUESTED' : 'OVERTIME_SCHEDULED',
            targetEntity: 'overtime_requests',
            targetId: String(dto.id),
            metadata: {
              employeeId,
              employeeCode: empCode,
              departmentId: deptId,
              departmentCode: deptCode,
              date,
              endDate,
              startTime,
              endTime,
              hours,
              status: initialStatus,
              reason,
            },
          });
          try {
            await NotificationService.notifyOvertimeAdded(inserted.id, employeeId, date, hours, actor);
          } catch {}
          return dto;
        } catch (e) {
          console.warn('DB overtime request failed, fallback to memory:', e);
        }
      }
    }

    const created: OvertimeRequestDto = {
      id: nextOvertimeId++,
      employeeId,
      employeeName: empName,
      employeeCode: empCode,
      departmentId: deptId,
      departmentCode: deptCode,
      departmentName: deptName,
      date,
      endDate,
      overtimeDate: date,
      startTime,
      endTime,
      hours,
      requestedHours: hours,
      totalHours: hours,
      shiftId: input.shiftId || null,
      shiftCode,
      shiftName,
      reason,
      status: initialStatus as any,
      assignedBy: actor?.userId || null,
      approvedBy: initialStatus === 'APPROVED' ? actor?.userId || null : null,
      approvedAt: initialStatus === 'APPROVED' ? new Date() : null,
      remarks: input.remarks || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    memoryOvertime.unshift(created);

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: isSelf ? 'OVERTIME_REQUESTED' : 'OVERTIME_SCHEDULED',
      targetEntity: 'overtime_requests',
      targetId: String(created.id),
      metadata: {
        employeeId,
        employeeCode: empCode,
        departmentId: deptId,
        departmentCode: deptCode,
        date,
        endDate,
        startTime,
        endTime,
        hours,
        status: initialStatus,
        reason,
      },
    });

    try {
      await NotificationService.notifyOvertimeAdded(created.id, employeeId, date, hours, actor);
    } catch {}

    return created;
  }

  // Alias for backward compatibility
  public static async requestOvertime(
    input: CreateOvertimeRequestInput,
    actor: AuthContext
  ): Promise<OvertimeRequestDto> {
    return this.createRequest(input, actor);
  }

  public static async getRequests(filter?: {
    employeeId?: number | string;
    departmentId?: number | string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<OvertimeRequestDto[]> {
    let userService: any = null;
    try {
      const mod = await import('./userService.ts');
      userService = mod.UserService;
    } catch {}

    let list = memoryOvertime.map((r) => {
      const emp = userService?.resolveEmployeeRecordSync?.(r.employeeId);
      const dept = emp?.departmentId ? userService?.getDepartmentByIdSync?.(emp.departmentId) : null;
      return {
        ...r,
        employeeCode: emp?.employeeCode || r.employeeCode,
        employeeName: emp?.employeeName || r.employeeName,
        departmentId: emp?.departmentId ?? r.departmentId ?? null,
        departmentCode: dept?.code || emp?.departmentCode || r.departmentCode || null,
        departmentName: dept?.name || emp?.departmentName || r.departmentName || null,
      };
    });
    if (filter) {
      if (filter.employeeId) {
        const emp = userService?.resolveEmployeeRecordSync?.(filter.employeeId);
        const targetEmpId = emp ? emp.id : Number(filter.employeeId);
        list = list.filter(
          (r) =>
            r.employeeId === targetEmpId ||
            (typeof filter.employeeId === 'string' &&
              r.employeeCode?.toUpperCase() === filter.employeeId.trim().toUpperCase())
        );
      }
      if (filter.departmentId) {
        const dept = userService?.resolveDepartmentRecordSync?.(filter.departmentId);
        const targetDeptId = dept ? dept.id : Number(filter.departmentId);
        list = list.filter(
          (r) =>
            r.departmentId === targetDeptId ||
            (typeof filter.departmentId === 'string' &&
              r.departmentCode?.toUpperCase() === filter.departmentId.trim().toUpperCase())
        );
      }
      if (filter.status) {
        list = list.filter((r) => r.status === filter.status);
      }
      if (filter.startDate) {
        list = list.filter((r) => (r.overtimeDate || r.date) >= filter.startDate!);
      }
      if (filter.endDate) {
        list = list.filter((r) => (r.overtimeDate || r.date) <= filter.endDate!);
      }
    }
    return list;
  }

  // Alias for backward compatibility
  public static async getOvertimeRequests(filter?: {
    employeeId?: number | string;
    departmentId?: number | string;
    status?: string;
  }): Promise<OvertimeRequestDto[]> {
    return this.getRequests(filter);
  }

  public static async getRequestById(id: number): Promise<OvertimeRequestDto | null> {
    const record = memoryOvertime.find((r) => r.id === id);
    return record || null;
  }

  public static async reviewRequest(
    id: number,
    actionOrInput: string | ReviewOvertimeInput,
    commentsOrActor?: string | AuthContext,
    optionalActor?: AuthContext
  ): Promise<OvertimeRequestDto> {
    let action: 'APPROVE' | 'REJECT';
    let comments: string = '';
    let actor: AuthContext;

    if (typeof actionOrInput === 'string') {
      action = (actionOrInput.toUpperCase() === 'APPROVE' ? 'APPROVE' : 'REJECT') as any;
      comments = typeof commentsOrActor === 'string' ? commentsOrActor : '';
      actor = optionalActor!;
    } else {
      action = (actionOrInput.status === 'APPROVED' ? 'APPROVE' : 'REJECT') as any;
      comments = actionOrInput.remarks || '';
      actor = commentsOrActor as AuthContext;
    }

    if (!actor) {
      throw new Error('Unauthorized actor context');
    }

    const { UserService } = await import('./userService.ts');
    const canReview =
      (await UserService.hasPermission(actor, 'OVERTIME_REVIEW')) ||
      (await UserService.hasPermission(actor, 'OVERTIME_MANAGE'));
    if (!canReview) {
      throw new Error(
        `Forbidden: Role '${actor.role}' does not have OVERTIME_REVIEW permission.`
      );
    }

    const idx = memoryOvertime.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new ValidationError(`Overtime request with ID ${id} not found.`);
    }

    const record = memoryOvertime[idx];
    if (record.status !== 'PENDING') {
      throw new ValidationError(`Overtime request has already been ${record.status.toLowerCase()}.`);
    }

    if (action === 'REJECT' && (!comments || !comments.trim())) {
      throw new ValidationError('Comments are required when rejecting an overtime request.');
    }

    const finalStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    record.status = finalStatus as any;
    record.remarks = comments.trim() || null;
    record.reviewComments = comments.trim() || null;
    record.approvedBy = actor.userId || null;
    record.reviewedBy = actor.userId || null;
    record.approvedAt = new Date();
    record.updatedAt = new Date();

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          await db
            .update(overtimeRequests)
            .set({
              status: finalStatus,
              remarks: record.remarks,
              approvedBy: record.approvedBy,
              approvedAt: record.approvedAt,
              updatedAt: record.updatedAt,
            })
            .where(eq(overtimeRequests.id, id));
        } catch {}
      }
    }

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: `OVERTIME_${finalStatus}`,
      targetEntity: 'overtime_requests',
      targetId: String(id),
      metadata: {
        employeeId: record.employeeId,
        employeeCode: record.employeeCode,
        departmentId: record.departmentId,
        departmentCode: record.departmentCode,
        date: record.overtimeDate || record.date,
        endDate: record.endDate || record.date,
        startTime: record.startTime,
        endTime: record.endTime,
        hours: record.requestedHours || record.hours,
        status: finalStatus,
        comments,
      },
    });

    try {
      if (finalStatus === 'APPROVED') {
        await NotificationService.notifyOvertimeApproved(
          id,
          record.employeeId,
          record.overtimeDate || record.date,
          record.requestedHours || record.hours,
          actor
        );
      } else {
        await NotificationService.notifyOvertimeRejected(
          id,
          record.employeeId,
          record.overtimeDate || record.date,
          record.requestedHours || record.hours,
          comments,
          actor
        );
      }
    } catch {}

    return record;
  }

  // Alias for backward compatibility
  public static async reviewOvertime(
    id: number,
    input: ReviewOvertimeInput,
    actor: AuthContext
  ): Promise<OvertimeRequestDto> {
    return this.reviewRequest(id, input, actor);
  }

  public static async cancelRequest(id: number, actor: AuthContext): Promise<OvertimeRequestDto> {
    const idx = memoryOvertime.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new ValidationError(`Overtime request with ID ${id} not found.`);
    }
    const record = memoryOvertime[idx];
    if (actor.role === 'EMPLOYEE' && record.employeeId !== (actor.employeeId || actor.userId)) {
      throw new Error('Forbidden: You can only cancel your own overtime requests.');
    }
    if (record.status !== 'PENDING') {
      throw new ValidationError('Only PENDING overtime requests can be cancelled.');
    }
    record.status = 'CANCELLED' as any;
    record.updatedAt = new Date();

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: 'OVERTIME_CANCELLED',
      targetEntity: 'overtime_requests',
      targetId: String(id),
      metadata: {
        employeeId: record.employeeId,
        employeeCode: record.employeeCode,
        departmentId: record.departmentId,
        departmentCode: record.departmentCode,
      },
    });

    try {
      await NotificationService.notifyOvertimeCancelled(
        id,
        record.employeeId,
        record.overtimeDate || record.date,
        actor
      );
    } catch {}

    return record;
  }

  public static async getAuditHistory(overtimeId?: number) {
    const logs = await AuditService.getLogs({
      targetEntity: 'overtime_requests',
      limit: 100,
    });
    if (overtimeId !== undefined) {
      return logs.filter((l) => String(l.targetId) === String(overtimeId));
    }
    return logs;
  }
}
