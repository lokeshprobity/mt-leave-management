import fs from 'node:fs';
import path from 'node:path';
import { eq, desc } from 'drizzle-orm';
import { getDb, isDbConfigured } from '../db/index.ts';
import { systemAuditLogs } from '../db/schema.ts';
import { SystemAuditLogDto, CreateAuditLogInput, AuthContext } from '../types/leave.ts';

const IS_TEST_PROCESS = Boolean(
  process.argv[1]?.includes('.test.') || process.argv[1]?.includes('.runner.')
);
const AUDIT_STORAGE_FILE = path.join(
  process.cwd(),
  'uploads',
  'metadata',
  IS_TEST_PROCESS ? 'audit_logs_meta.test.json' : 'audit_logs_meta.json'
);

// In-memory fallback store for testing and when DB is unconfigured
let memoryAuditLogs: SystemAuditLogDto[] = [];
let nextAuditLogId = 1;

function loadAuditLogsFromDisk(): void {
  try {
    if (fs.existsSync(AUDIT_STORAGE_FILE)) {
      const raw = fs.readFileSync(AUDIT_STORAGE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.logs)) {
        memoryAuditLogs = parsed.logs;
        const maxId = memoryAuditLogs.reduce((acc, item) => Math.max(acc, Number(item.id) || 0), 0);
        nextAuditLogId = Math.max(nextAuditLogId, maxId + 1);
      }
    }
  } catch {}
}

function saveAuditLogsToDisk(): void {
  try {
    const dir = path.dirname(AUDIT_STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      AUDIT_STORAGE_FILE,
      JSON.stringify({ logs: memoryAuditLogs.slice(0, 500) }, null, 2),
      'utf8'
    );
  } catch {}
}

loadAuditLogsFromDisk();

export class AuditService {
  public static resetMemoryAuditLogs(): void {
    memoryAuditLogs = [];
    nextAuditLogId = 1;
    saveAuditLogsToDisk();
  }

  public static resetMemoryStores(): void {
    this.resetMemoryAuditLogs();
  }

  public static getMemoryAuditLogs(): SystemAuditLogDto[] {
    return [...memoryAuditLogs];
  }

  /**
   * Sanitizes metadata to ensure sensitive fields (passwords, hashes, tokens, secrets)
   * and raw binary / base64 image payloads are NEVER recorded in audit logs.
   */
  public static sanitizeMetadata(metadata?: Record<string, any> | null): Record<string, any> | null {
    if (!metadata) return null;
    const sanitized: Record<string, any> = {};
    const redactKeys = [
      'password',
      'passwordhash',
      'token',
      'secret',
      'currentpassword',
      'newpassword',
      'temporarypassword',
      'initialpassword',
      'resettoken',
      'tokenhash',
      'reset_token',
      'token_hash',
    ];
    const binaryKeys = [
      'filedata',
      'basedata',
      'binary',
      'buffer',
      'rawdata',
      'imagebinary',
      'logodata',
      'photodata',
    ];

    for (const [key, value] of Object.entries(metadata)) {
      const lowerKey = key.toLowerCase();
      if (binaryKeys.includes(lowerKey)) {
        continue; // strictly exclude raw binary keys
      }
      if (redactKeys.includes(lowerKey)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (
          trimmed.startsWith('data:image/') ||
          trimmed.startsWith('data:application/') ||
          trimmed.startsWith('iVBORw0KGgo') ||
          trimmed.startsWith('/9j/')
        ) {
          sanitized[key] = '[BINARY_OMITTED]';
          continue;
        }
      } else if (value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)) {
        sanitized[key] = this.sanitizeMetadata(value);
        continue;
      } else if (Buffer.isBuffer(value)) {
        continue;
      }
      sanitized[key] = value;
    }
    return sanitized;
  }

  /**
   * Enriches an audit record with authoritative employeeCode, departmentCode, actor details,
   * status transitions, reason, and next step.
   */
  public static enrichAuditLogRecord(
    raw: SystemAuditLogDto,
    userService?: any
  ): SystemAuditLogDto {
    const cleanMeta: Record<string, any> =
      raw.metadata && typeof raw.metadata === 'object' ? { ...raw.metadata } : {};

    let actorName: string | null = raw.actorName || cleanMeta.actorName || null;
    let actorEmployeeCode: string | null =
      raw.actorEmployeeCode || cleanMeta.actorEmployeeCode || null;

    if (userService && raw.actorId) {
      try {
        const actorUser = userService.getUserByIdSync?.(raw.actorId);
        const actorEmp =
          userService.resolveEmployeeRecordSync?.(actorUser?.employeeId ?? raw.actorId) || actorUser;
        if (!actorName) {
          actorName =
            actorEmp?.employeeName || actorUser?.employeeName || actorUser?.username || null;
        }
        if (!actorEmployeeCode) {
          actorEmployeeCode = actorEmp?.employeeCode || actorUser?.employeeCode || null;
        }
      } catch {}
    }

    let empCode: string | null =
      raw.employeeCode ||
      cleanMeta.employeeCode ||
      cleanMeta.targetEmployeeCode ||
      cleanMeta.after?.employeeCode ||
      cleanMeta.before?.employeeCode ||
      null;
    let empName: string | null =
      raw.employeeName ||
      cleanMeta.employeeName ||
      cleanMeta.targetEmployeeName ||
      cleanMeta.after?.employeeName ||
      cleanMeta.before?.employeeName ||
      null;
    let deptCode: string | null =
      raw.departmentCode ||
      cleanMeta.departmentCode ||
      cleanMeta.after?.departmentCode ||
      cleanMeta.before?.departmentCode ||
      null;
    let deptName: string | null =
      raw.departmentName ||
      cleanMeta.departmentName ||
      cleanMeta.after?.departmentName ||
      cleanMeta.before?.departmentName ||
      null;

    if (userService) {
      try {
        const empRef =
          empCode ??
          cleanMeta.employeeId ??
          cleanMeta.targetEmployeeId ??
          cleanMeta.targetUserId ??
          cleanMeta.userId ??
          (raw.targetEntity === 'employees' || raw.targetEntity === 'users' ? raw.targetId : null);

        if (empRef !== undefined && empRef !== null) {
          const emp = userService.resolveEmployeeRecordSync?.(empRef);
          if (emp) {
            empCode = empCode || emp.employeeCode || null;
            empName = empName || emp.employeeName || null;
            if (!cleanMeta.employeeId && emp.id) cleanMeta.employeeId = emp.id;
            if (!cleanMeta.departmentId && emp.departmentId) {
              cleanMeta.departmentId = emp.departmentId;
            }
            deptCode = deptCode || emp.departmentCode || null;
            deptName = deptName || emp.departmentName || null;
          }
        }

        const deptRef =
          deptCode ??
          cleanMeta.departmentId ??
          cleanMeta.teamId ??
          (raw.targetEntity === 'departments' ? raw.targetId : null);
        if (deptRef !== undefined && deptRef !== null) {
          const dept = userService.resolveDepartmentRecordSync?.(deptRef);
          if (dept) {
            deptCode = deptCode || dept.code || null;
            deptName = deptName || dept.name || null;
            if (!cleanMeta.departmentId && dept.id) cleanMeta.departmentId = dept.id;
          }
        }
      } catch {}
    }

    const previousStatus: string | null =
      raw.previousStatus ??
      cleanMeta.previousStatus ??
      cleanMeta.previousDecision ??
      cleanMeta.before?.status ??
      cleanMeta.before?.finalStatus ??
      cleanMeta.before?.employmentStatus ??
      null;

    const newStatus: string | null =
      raw.newStatus ??
      cleanMeta.newStatus ??
      cleanMeta.newDecision ??
      cleanMeta.finalStatus ??
      cleanMeta.status ??
      cleanMeta.after?.status ??
      cleanMeta.after?.finalStatus ??
      cleanMeta.after?.employmentStatus ??
      null;

    const reason: string | null =
      raw.reason ??
      cleanMeta.reason ??
      cleanMeta.remarks ??
      cleanMeta.comments ??
      cleanMeta.cancellationReason ??
      cleanMeta.assignmentReason ??
      null;

    const nextStep: string | null =
      raw.nextStep ??
      cleanMeta.nextStep ??
      cleanMeta.whatHappenedNext ??
      cleanMeta.approvalStageLabel ??
      null;

    if (actorName) cleanMeta.actorName = actorName;
    if (actorEmployeeCode) cleanMeta.actorEmployeeCode = actorEmployeeCode;
    if (empCode) cleanMeta.employeeCode = empCode;
    if (empName) cleanMeta.employeeName = empName;
    if (deptCode) cleanMeta.departmentCode = deptCode;
    if (deptName) cleanMeta.departmentName = deptName;
    if (previousStatus) cleanMeta.previousStatus = previousStatus;
    if (newStatus) cleanMeta.newStatus = newStatus;
    if (reason) cleanMeta.reason = reason;
    if (nextStep) cleanMeta.nextStep = nextStep;

    return {
      ...raw,
      actorName,
      actorEmployeeCode,
      employeeCode: empCode,
      employeeName: empName,
      departmentCode: deptCode,
      departmentName: deptName,
      previousStatus,
      newStatus,
      reason,
      nextStep,
      metadata: cleanMeta,
    };
  }

  /**
   * Records a system audit entry into PostgreSQL or in-memory fallback.
   */
  public static async logEvent(input: CreateAuditLogInput): Promise<SystemAuditLogDto> {
    let cleanMeta = this.sanitizeMetadata(input.metadata) || {};
    let userService: any = null;

    try {
      const mod = await import('./userService.ts');
      userService = mod.UserService;
    } catch {}

    const baseDto: SystemAuditLogDto = this.enrichAuditLogRecord(
      {
        id: nextAuditLogId++,
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        targetEntity: input.targetEntity,
        targetId: input.targetId ? String(input.targetId) : null,
        metadata: cleanMeta,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        createdAt: new Date().toISOString(),
      },
      userService
    );

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const inserted = await db
            .insert(systemAuditLogs)
            .values({
              actorId: baseDto.actorId ?? null,
              actorRole: baseDto.actorRole ?? null,
              action: baseDto.action,
              targetEntity: baseDto.targetEntity,
              targetId: baseDto.targetId ? String(baseDto.targetId) : null,
              metadata: baseDto.metadata,
              ipAddress: baseDto.ipAddress ?? null,
              userAgent: baseDto.userAgent ?? null,
            })
            .returning();

          const r = inserted[0];
          const dto: SystemAuditLogDto = this.enrichAuditLogRecord(
            {
              id: r.id,
              actorId: r.actorId,
              actorRole: r.actorRole,
              action: r.action,
              targetEntity: r.targetEntity,
              targetId: r.targetId,
              metadata: r.metadata as Record<string, any> | null,
              ipAddress: r.ipAddress,
              userAgent: r.userAgent,
              createdAt: r.createdAt,
            },
            userService
          );
          memoryAuditLogs.unshift(dto);
          saveAuditLogsToDisk();
          return dto;
        } catch (err) {
          console.warn('Failed to insert system audit log to DB, falling back to memory:', err);
        }
      }
    }

    memoryAuditLogs.unshift(baseDto);
    saveAuditLogsToDisk();
    return baseDto;
  }

  /**
   * Retrieves audit logs with optional filtering.
   */
  public static async getAuditLogs(filter?: {
    action?: string;
    targetEntity?: string;
    targetId?: string;
    actorId?: number;
    employeeId?: number | string;
    employeeCode?: string;
    departmentId?: number | string;
    departmentCode?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<SystemAuditLogDto[]> {
    let userService: any = null;
    try {
      const mod = await import('./userService.ts');
      userService = mod.UserService;
    } catch {}

    let sourceRows: SystemAuditLogDto[] = [];

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const rows = await db
            .select()
            .from(systemAuditLogs)
            .orderBy(desc(systemAuditLogs.createdAt))
            .limit(filter?.limit || 500);

          sourceRows = rows.map((r) =>
            this.enrichAuditLogRecord(
              {
                id: r.id,
                actorId: r.actorId,
                actorRole: r.actorRole,
                action: r.action,
                targetEntity: r.targetEntity,
                targetId: r.targetId,
                metadata: r.metadata as Record<string, any> | null,
                ipAddress: r.ipAddress,
                userAgent: r.userAgent,
                createdAt: r.createdAt,
              },
              userService
            )
          );
        } catch {}
      }
    }

    if (sourceRows.length === 0) {
      sourceRows = memoryAuditLogs.map((r) => this.enrichAuditLogRecord(r, userService));
    }

    let targetEmpCode: string | null = filter?.employeeCode ? filter.employeeCode.trim().toUpperCase() : null;
    let targetEmpId: number | null = null;
    if (filter?.employeeId !== undefined && filter?.employeeId !== null) {
      const resolvedEmp = userService?.resolveEmployeeRecordSync?.(filter.employeeId);
      if (resolvedEmp) {
        targetEmpId = resolvedEmp.id;
        if (!targetEmpCode && resolvedEmp.employeeCode) {
          targetEmpCode = resolvedEmp.employeeCode.toUpperCase();
        }
      } else if (!Number.isNaN(Number(filter.employeeId))) {
        targetEmpId = Number(filter.employeeId);
      } else {
        targetEmpCode = String(filter.employeeId).trim().toUpperCase();
      }
    }

    let targetDeptCode: string | null = filter?.departmentCode
      ? filter.departmentCode.trim().toUpperCase()
      : null;
    let targetDeptId: number | null = null;
    if (filter?.departmentId !== undefined && filter?.departmentId !== null) {
      const resolvedDept = userService?.resolveDepartmentRecordSync?.(filter.departmentId);
      if (resolvedDept) {
        targetDeptId = resolvedDept.id;
        if (!targetDeptCode && resolvedDept.code) {
          targetDeptCode = resolvedDept.code.toUpperCase();
        }
      } else if (!Number.isNaN(Number(filter.departmentId))) {
        targetDeptId = Number(filter.departmentId);
      } else {
        targetDeptCode = String(filter.departmentId).trim().toUpperCase();
      }
    }

    const searchQ = filter?.search?.trim().toLowerCase() || '';

    const filtered = sourceRows.filter((r) => {
      if (filter?.action && r.action !== filter.action) return false;
      if (filter?.targetEntity && r.targetEntity !== filter.targetEntity) return false;
      if (filter?.targetId && r.targetId !== filter.targetId) return false;
      if (filter?.actorId && r.actorId !== filter.actorId) return false;

      if (targetEmpCode || targetEmpId !== null) {
        const meta = r.metadata || {};
        const matchesCode =
          targetEmpCode &&
          (r.employeeCode?.toUpperCase() === targetEmpCode ||
            r.actorEmployeeCode?.toUpperCase() === targetEmpCode ||
            String(meta.employeeCode || '').toUpperCase() === targetEmpCode);
        const matchesId =
          targetEmpId !== null &&
          (Number(meta.employeeId) === targetEmpId ||
            Number(r.actorId) === targetEmpId ||
            (r.targetEntity === 'employees' && Number(r.targetId) === targetEmpId));
        if (!matchesCode && !matchesId) return false;
      }

      if (targetDeptCode || targetDeptId !== null) {
        const meta = r.metadata || {};
        const matchesDeptCode =
          targetDeptCode &&
          (r.departmentCode?.toUpperCase() === targetDeptCode ||
            String(meta.departmentCode || '').toUpperCase() === targetDeptCode);
        const matchesDeptId =
          targetDeptId !== null &&
          (Number(meta.departmentId) === targetDeptId ||
            (r.targetEntity === 'departments' && Number(r.targetId) === targetDeptId));
        if (!matchesDeptCode && !matchesDeptId) return false;
      }

      if (filter?.startDate) {
        const dStr = new Date(r.createdAt).toISOString().split('T')[0];
        if (dStr < filter.startDate) return false;
      }
      if (filter?.endDate) {
        const dStr = new Date(r.createdAt).toISOString().split('T')[0];
        if (dStr > filter.endDate) return false;
      }

      if (searchQ) {
        const hay = [
          r.action,
          r.targetEntity,
          r.targetId,
          r.employeeCode,
          r.employeeName,
          r.departmentCode,
          r.departmentName,
          r.actorName,
          r.actorEmployeeCode,
          r.actorRole,
          r.previousStatus,
          r.newStatus,
          r.reason,
          JSON.stringify(r.metadata || {}),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(searchQ)) return false;
      }

      return true;
    });

    if (filter?.limit && filter.limit > 0) {
      return filtered.slice(0, filter.limit);
    }
    return filtered;
  }

  public static async getLogs(filter?: any): Promise<SystemAuditLogDto[]> {
    return this.getAuditLogs(filter);
  }
}
